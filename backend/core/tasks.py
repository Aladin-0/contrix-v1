import time
import random
import requests
import logging
from celery import shared_task
from django.utils import timezone
from django.conf import settings  # <--- Added to pull config from settings.py
from .models import Campaign, Contact, PhoneInstance, MessageLog, Property, WhatsAppGroup

logger = logging.getLogger(__name__)

# WAHA API URL (Internal Docker Network)
WAHA_URL = "http://waha:3000"

def send_waha_message(session_name, phone_number, message, api_url=WAHA_URL):
    """Helper to actually hit the API with correct authentication headers."""
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
    
    # Use the secure key from settings.py
    api_key = getattr(settings, 'WAHA_API_KEY', 'secret')
    headers = {
        'X-Api-Key': api_key,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
        logger.error(f"WAHA_SEND_ERROR: {e}")
        return False, str(e)

@shared_task
def process_phone_queue(phone_id, campaign_id, contact_ids, property_ids, group_ids=None):
    """Worker for a single phone handling randomization and natural behavior."""
    if group_ids is None:
        group_ids = []

    phone = PhoneInstance.objects.get(id=phone_id)
    campaign = Campaign.objects.get(id=campaign_id)
    properties = list(Property.objects.filter(id__in=property_ids))
    contacts = list(Contact.objects.filter(id__in=contact_ids))
    groups = list(WhatsAppGroup.objects.filter(id__in=group_ids))

    settings_obj = campaign.settings
    sent_count = 0

    contact_targets = [{'type': 'contact', 'obj': c} for c in contacts]
    group_targets = [{'type': 'group', 'obj': g} for g in groups]

    random.shuffle(contact_targets)
    random.shuffle(group_targets)

    # Priority: Groups FIRST, then Contacts
    targets = group_targets + contact_targets

    for target in targets:
        campaign.refresh_from_db()
        if campaign.status != 'RUNNING':
            break

        if target['type'] == 'contact':
            contact = target['obj']
            dest_id = contact.phone
            log_contact = contact
            log_group = None
        else:
            group = target['obj']
            dest_id = group.group_id
            log_contact = None
            log_group = group

        shuffled_properties = properties.copy()
        random.shuffle(shuffled_properties)

        for prop in shuffled_properties:
            # Human mimic delay
            delay = random.uniform(settings_obj.delay_between_messages_min, settings_obj.delay_between_messages_max)
            time.sleep(delay)

            success, response = send_waha_message(
                phone.session_name,
                dest_id,
                prop.content,
                api_url=phone.api_url
            )

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
                sent_count += 1
                phone.total_sent += 1
                phone.sent_today += 1
                phone.save()

            # Pulse & Rest
            if sent_count > 0 and sent_count % settings_obj.pause_every_x_messages == 0:
                time.sleep(random.uniform(3, 6))

    check_campaign_completion.delay(campaign_id)
    return f"Phone {phone.name} finished. Sent: {sent_count}"

@shared_task
def start_campaign_task(campaign_id):
    """Orchestrator for load balancing across connected phones."""
    campaign = Campaign.objects.get(id=campaign_id)
    campaign.status = 'RUNNING'
    campaign.started_at = timezone.now()
    campaign.save()

    phones = list(PhoneInstance.objects.filter(status='CONNECTED'))
    if not phones:
        campaign.status = 'FAILED'
        campaign.save()
        return "No connected phones found."

    contacts = []
    if campaign.send_to_all_contacts:
        contacts = list(Contact.objects.filter(status='ACTIVE'))

    properties = list(campaign.properties.all())
    if not properties:
        campaign.status = 'FAILED'
        campaign.save()
        return "No properties linked to campaign."

    property_ids = [p.id for p in properties]

    # Meta API Posts
    from .meta_api import post_to_facebook_page, post_to_instagram_account
    if campaign.post_to_facebook:
        for prop in properties:
            success, response = post_to_facebook_page(prop.content)
            MessageLog.objects.create(campaign=campaign, property=prop, status='SENT' if success else 'FAILED', platform='FACEBOOK')

    if campaign.post_to_instagram:
        for prop in properties:
            success, response = post_to_instagram_account(prop.content)
            MessageLog.objects.create(campaign=campaign, property=prop, status='SENT' if success else 'FAILED', platform='INSTAGRAM')

    # Load Balancing
    contact_chunks = [[] for _ in range(len(phones))]
    for i, contact in enumerate(contacts):
        phone_index = (len(phones) - 1) - (i % len(phones))
        contact_chunks[phone_index].append(contact.id)

    phone_groups = {phone.id: [] for phone in phones}
    if campaign.send_to_whatsapp:
        if campaign.send_to_all_groups:
            for phone in phones:
                phone_groups[phone.id] = list(WhatsAppGroup.objects.filter(phone_instance=phone).values_list('id', flat=True))
        else:
            for group in campaign.target_groups.all():
                if group.phone_instance.id in phone_groups:
                    phone_groups[group.phone_instance.id].append(group.id)

    campaign.total_contacts = len(contacts)
    campaign.total_groups = sum(len(ids) for ids in phone_groups.values())
    campaign.save()

    if (len(contacts) + campaign.total_groups) == 0:
        campaign.status = 'COMPLETED'
        campaign.save()
        return "No targets."

    for i, phone in enumerate(phones):
        if contact_chunks[i] or phone_groups[phone.id]:
            process_phone_queue.delay(phone.id, campaign.id, contact_chunks[i], property_ids, phone_groups[phone.id])

    return f"Campaign started with {len(contacts)} contacts."

@shared_task
def check_campaign_completion(campaign_id):
    """Triggered check to mark campaign as COMPLETED."""
    try:
        campaign = Campaign.objects.get(id=campaign_id)
        if campaign.status != 'RUNNING':
            return

        whatsapp_logs = MessageLog.objects.filter(campaign=campaign, platform='WHATSAPP').count()
        properties_count = campaign.properties.count()
        expected = (campaign.total_contacts + campaign.total_groups) * properties_count

        if whatsapp_logs >= expected:
            campaign.status = 'COMPLETED'
            campaign.completed_at = timezone.now()
            campaign.save()
    except Exception as e:
        logger.error(f"COMPLETION_CHECK_ERROR: {e}")
