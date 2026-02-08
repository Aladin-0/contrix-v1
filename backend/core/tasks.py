import time
import random
import requests
from celery import shared_task
from django.utils import timezone
from .models import Campaign, Contact, PhoneInstance, MessageLog, Property, WhatsAppGroup

# WAHA API URL (Internal Docker Network)
WAHA_URL = "http://waha:3000"

def send_waha_message(session_name, phone_number, message, api_url=WAHA_URL):
    """Helper to actually hit the API"""
    # Sanitize phone number (remove + and spaces), unless it's a group ID
    if '@' in str(phone_number):
        # Allow group IDs like 120363@g.us
        chat_id = str(phone_number)
    else:
        clean_phone = ''.join(filter(str.isdigit, str(phone_number)))
        chat_id = f"{clean_phone}@c.us"
    
    payload = {
        "session": session_name,
        "chatId": chat_id,
        "text": message
    }
    headers = {
        'X-Api-Key': 'secret',
        'Content-Type': 'application/json'
    }
    try:
        response = requests.post(
            f"{api_url}/api/sendText", 
            json=payload, 
            headers=headers, 
            timeout=10
        )
        return response.status_code == 201 or response.status_code == 200, response.text
    except Exception as e:
        return False, str(e)

@shared_task
def process_phone_queue(phone_id, campaign_id, contact_ids, property_ids, group_ids=None):
    """
    Worker for a single phone.
    Handles: Pulse & Rest, Random Delays, Property Randomization, and Logging.
    Supports both Contacts and Groups.
    """
    if group_ids is None:
        group_ids = []

    phone = PhoneInstance.objects.get(id=phone_id)
    campaign = Campaign.objects.get(id=campaign_id)
    properties = list(Property.objects.filter(id__in=property_ids))
    contacts = list(Contact.objects.filter(id__in=contact_ids))
    groups = list(WhatsAppGroup.objects.filter(id__in=group_ids))
    
    settings = campaign.settings
    sent_count = 0
    
    # Combined target list for randomization
    contact_targets = []
    group_targets = []
    
    for c in contacts:
        contact_targets.append({'type': 'contact', 'obj': c})
    for g in groups:
        group_targets.append({'type': 'group', 'obj': g})
        
    # Shuffle independently to maintain randomness within types
    random.shuffle(contact_targets)
    random.shuffle(group_targets)
    
    # Priority: Groups FIRST, then Contacts
    print(f"[{phone.name}] Prioritizing {len(group_targets)} groups before {len(contact_targets)} contacts.")
    targets = group_targets + contact_targets
    
    print(f"[{phone.name}] Starting processing for {len(targets)} targets ({len(contacts)} contacts, {len(groups)} groups) with {len(properties)} properties...")

    for target in targets:
        # Check if campaign is paused/stopped
        campaign.refresh_from_db()
        if campaign.status != 'RUNNING':
            print(f"[{phone.name}] Campaign stopped. Exiting.")
            break

        # Identify target
        if target['type'] == 'contact':
            contact = target['obj']
            dest_id = contact.phone
            dest_name = contact.name or contact.phone
            log_contact = contact
            log_group = None
        else:
            group = target['obj']
            dest_id = group.group_id
            dest_name = group.name
            log_contact = None
            log_group = group

        # Shuffle properties for THIS target
        shuffled_properties = properties.copy()
        random.shuffle(shuffled_properties)
        
        print(f"[{phone.name}] Target {dest_name} will receive properties in order: {[p.title for p in shuffled_properties]}")
        
        # Send ALL properties to this target
        for prop in shuffled_properties:
            # 1. Random Delay (Human mimic)
            delay = random.uniform(settings.delay_between_messages_min, settings.delay_between_messages_max)
            print(f"[{phone.name}] Waiting {delay:.1f}s before sending to {dest_name}...")
            time.sleep(delay)

            # 2. Send Message
            success, response = send_waha_message(
                phone.session_name, 
                dest_id, 
                prop.content,
                api_url=phone.api_url
            )

            # 3. Log Result
            MessageLog.objects.create(
                campaign=campaign,
                phone_instance=phone,
                contact=log_contact,
                group=log_group,
                property=prop,
                message_text=prop.content,
                status='SENT' if success else 'FAILED',
                error_message=None if success else response,
                platform='WHATSAPP'
            )
            
            if success:
                print(f"[{phone.name}] ✅ Sent to {dest_name}: {prop.title}")
            else:
                print(f"[{phone.name}] ❌ Failed to {dest_name}: {response}")

            # 4. Update Stats
            if success:
                sent_count += 1
                phone.total_sent += 1
                phone.sent_today += 1
                phone.save()

            # 5. Pulse & Rest (pause every X messages with random duration)
            if sent_count > 0 and sent_count % settings.pause_every_x_messages == 0:
                # Random pause between 3-6 seconds for natural behavior
                pause_duration = random.uniform(3, 6)
                print(f"[{phone.name}] Resting for {pause_duration:.1f}s...")
                time.sleep(pause_duration)
    
    # Trigger completion check
    check_campaign_completion.delay(campaign_id)

    return f"Phone {phone.name} finished. Sent: {sent_count}"

@shared_task
def start_campaign_task(campaign_id):
    """
    Orchestrator:
    1. Gets all active phones.
    2. Splits contacts among phones (Load Balancing).
    3. Determine groups per phone.
    4. Triggers parallel workers.
    """
    campaign = Campaign.objects.get(id=campaign_id)
    campaign.status = 'RUNNING'
    campaign.started_at = timezone.now()
    campaign.save()

    # Get active phones
    phones = list(PhoneInstance.objects.filter(status='CONNECTED'))
    if not phones:
        campaign.status = 'FAILED'
        campaign.save()
        return "No connected phones found."

    # Get contacts
    # TODO: In production, filter by tags or segments. For now, get all ACTIVE.
    contacts = []
    if campaign.send_to_all_contacts:
        contacts = list(Contact.objects.filter(status='ACTIVE'))
    
    total_contacts = len(contacts)
    
    # Get ALL properties linked to campaign
    properties = list(campaign.properties.all())
    if not properties:
        campaign.status = 'FAILED'
        campaign.save()
        return "No properties linked to campaign."
    
    property_ids = [p.id for p in properties]
    print(f"Campaign has {len(properties)} properties for randomization.")
    
    # Post to Facebook/Instagram (once per property)
    from .meta_api import post_to_facebook_page, post_to_instagram_account
    
    if campaign.post_to_facebook:
        for prop in properties:
            success, response = post_to_facebook_page(prop.content)
            MessageLog.objects.create(
                campaign=campaign,
                property=prop,
                message_text=f"Facebook Post: {prop.content[:50]}...",
                status='SENT' if success else 'FAILED',
                error_message=None if success else str(response),
                platform='FACEBOOK'
            )
            if success:
                print(f"Posted to Facebook: {response}")
            else:
                print(f"Facebook post failed: {response}")
    
    
    if campaign.post_to_instagram:
        for prop in properties:
            success, response = post_to_instagram_account(prop.content)
            MessageLog.objects.create(
                campaign=campaign,
                property=prop,
                message_text=f"Instagram Post: {prop.content[:50]}...",
                status='SENT' if success else 'FAILED',
                error_message=None if success else str(response),
                platform='INSTAGRAM'
            )
            if success:
                print(f"Posted to Instagram: {response}")
            else:
                print(f"Instagram post failed: {response}")

    # Load Balancing: Distribute contacts evenly
    # If odd number of contacts, extra goes to LAST phone (secondary)
    contact_chunks = [[] for _ in range(len(phones))]
    for i, contact in enumerate(contacts):
        # Reverse the modulo to assign extras to last phone
        phone_index = (len(phones) - 1) - (i % len(phones))
        contact_chunks[phone_index].append(contact.id)
        
    # Group Distribution (Groups are tied to phones)
    phone_groups = {phone.id: [] for phone in phones}
    
    if campaign.send_to_whatsapp:
        if campaign.send_to_all_groups:
            # Fetch all groups for each phone
            for phone in phones:
                groups = WhatsAppGroup.objects.filter(phone_instance=phone)
                phone_groups[phone.id] = list(groups.values_list('id', flat=True))
        else:
            # Use selected groups
            selected_groups = campaign.target_groups.all()
            for group in selected_groups:
                # Assign group to its owner phone
                if group.phone_instance.id in phone_groups:
                    phone_groups[group.phone_instance.id].append(group.id)

    # Launch parallel workers
    print(f"Starting Campaign {campaign.name} with {len(phones)} phones.")
    
    # Save total contacts/groups for progress tracking
    campaign.total_contacts = total_contacts
    campaign.total_groups = sum(len(ids) for ids in phone_groups.values())
    campaign.save()

    total_work = total_contacts + campaign.total_groups
    if total_work == 0:
        campaign.status = 'COMPLETED'
        campaign.completed_at = timezone.now()
        campaign.save()
        return "Campaign completed (No targets)."

    for i, phone in enumerate(phones):
        contact_ids = contact_chunks[i]
        group_ids = phone_groups[phone.id]
        
        # Trigger if there is ANY work (contacts or groups)
        if contact_ids or group_ids:
            process_phone_queue.delay(
                phone.id, 
                campaign.id, 
                contact_ids, 
                property_ids,
                group_ids
            )
    
    return f"Campaign started. {total_contacts} contacts and {campaign.total_groups} groups."

@shared_task
def check_campaign_completion(campaign_id):
    """Periodic or triggered check to mark campaign as COMPLETED"""
    try:
        campaign = Campaign.objects.get(id=campaign_id)
        if campaign.status != 'RUNNING':
            return

        # Calculate expected WhatsApp messages (contacts + groups) * properties
        whatsapp_logs = MessageLog.objects.filter(campaign=campaign, platform='WHATSAPP').count()
        properties_count = campaign.properties.count()
        
        total_targets = campaign.total_contacts + campaign.total_groups
        expected_whatsapp = total_targets * properties_count
        
        # Check if all WhatsApp messages have been sent
        if whatsapp_logs >= expected_whatsapp:
            campaign.status = 'COMPLETED'
            campaign.completed_at = timezone.now()
            campaign.save()
            print(f"Campaign {campaign.name} COMPLETED. Sent {whatsapp_logs}/{expected_whatsapp} WhatsApp messages.")
    except Exception as e:
        print(f"Error checking completion: {e}")