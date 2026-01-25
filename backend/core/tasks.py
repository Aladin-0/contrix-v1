import time
import random
import requests
from celery import shared_task
from django.utils import timezone
from .models import Campaign, Contact, PhoneInstance, MessageLog, Property

# WAHA API URL (Internal Docker Network)
WAHA_URL = "http://waha:3000"

def send_waha_message(session_name, phone_number, message):
    """Helper to actually hit the API"""
    payload = {
        "session": session_name,
        "chatId": f"{phone_number}@c.us",
        "text": message
    }
    try:
        response = requests.post(f"{WAHA_URL}/api/sendText", json=payload, timeout=10)
        return response.status_code == 201 or response.status_code == 200, response.text
    except Exception as e:
        return False, str(e)

@shared_task
def process_phone_queue(phone_id, campaign_id, contact_ids, property_id):
    """
    Worker for a single phone.
    Handles: Pulse & Rest, Random Delays, and Logging.
    """
    phone = PhoneInstance.objects.get(id=phone_id)
    campaign = Campaign.objects.get(id=campaign_id)
    prop = Property.objects.get(id=property_id)
    contacts = Contact.objects.filter(id__in=contact_ids)
    
    settings = campaign.settings
    sent_count = 0
    
    print(f"[{phone.name}] Starting processing for {len(contacts)} contacts...")

    for contact in contacts:
        # 1. Check if campaign was paused/stopped
        campaign.refresh_from_db()
        if campaign.status != 'RUNNING':
            print(f"[{phone.name}] Campaign stopped. Exiting.")
            break

        # 2. Random Human Delay (1-10s)
        delay = random.uniform(
            settings.delay_between_messages_min, 
            settings.delay_between_messages_max
        )
        time.sleep(delay)

        # 3. Construct Message
        message_body = f"""Hi {contact.name},

🏠 {prop.title}
💰 ₹{prop.price}
📍 {prop.location}
🛏️ {prop.bedrooms} BHK

{prop.description}

Reply YES for details or STOP to unsubscribe

View: aathvani.zaikron.com"""

        # 4. Send Message
        success, response_text = send_waha_message(
            phone.session_name, 
            contact.phone, 
            message_body
        )

        # 5. Log Result
        MessageLog.objects.create(
            campaign=campaign,
            phone_instance=phone,
            contact=contact,
            property=prop,
            message_text=message_body,
            status='SENT' if success else 'FAILED',
            error_message=None if success else response_text
        )

        # 6. Update Stats
        if success:
            sent_count += 1
            phone.total_sent += 1
            phone.sent_today += 1
            phone.save()

        # 7. Pulse & Rest Logic
        if sent_count > 0 and sent_count % settings.pause_every_x_messages == 0:
            print(f"[{phone.name}] Resting for {settings.pause_duration_seconds}s...")
            time.sleep(settings.pause_duration_seconds)

    return f"Phone {phone.name} finished. Sent: {sent_count}"

@shared_task
def start_campaign_task(campaign_id):
    """
    Orchestrator:
    1. Gets all active phones.
    2. Splits contacts among phones (Load Balancing).
    3. Triggers parallel workers.
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
    contacts = list(Contact.objects.filter(status='ACTIVE'))
    total_contacts = len(contacts)
    
    # Get first property (simplified for MVP)
    prop = campaign.properties.first()
    if not prop:
        return "No property linked to campaign."

    # Load Balancing: Distribute contacts evenly
    chunks = [[] for _ in range(len(phones))]
    for i, contact in enumerate(contacts):
        chunks[i % len(phones)].append(contact.id)

    # Launch parallel workers
    print(f"Starting Campaign {campaign.name} with {len(phones)} phones.")
    
    for i, phone in enumerate(phones):
        contact_ids = chunks[i]
        if contact_ids:
            # Trigger the sub-task asynchronously
            process_phone_queue.delay(
                phone.id, 
                campaign.id, 
                contact_ids, 
                prop.id
            )

    return f"Campaign started. distributed {total_contacts} contacts across {len(phones)} phones."