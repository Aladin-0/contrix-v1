import requests
import time
import csv
import io
import logging
from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import PhoneInstance, Contact, Property, Campaign, MessageLog, WhatsAppGroup
from .serializers import PhoneInstanceSerializer, ContactSerializer, PropertySerializer, CampaignSerializer, MessageLogSerializer, WhatsAppGroupSerializer
from .tasks import start_campaign_task

logger = logging.getLogger(__name__)

class PhoneInstanceViewSet(viewsets.ModelViewSet):
    queryset = PhoneInstance.objects.all()
    serializer_class = PhoneInstanceSerializer

    def _get_waha_headers(self):
        """Standardized headers for all WAHA API interactions."""
        return {'X-Api-Key': 'secret', 'Content-Type': 'application/json'}

    def sync_waha_status(self, instance):
        """
        Expert Status Sync:
        Directly queries the WAHA engine and forces the Database to match.
        """
        base_url = f"{instance.api_url}/api"
        try:
            r = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=self._get_waha_headers(), timeout=2)
            if r.status_code == 200:
                data = r.json()
                waha_curr = data.get('status')
                # A session is 'CONNECTED' only if status is WORKING
                if waha_curr == 'WORKING':
                    if instance.status != 'CONNECTED':
                        logger.info(f"DB_SYNC: Phone '{instance.name}' is now CONNECTED.")
                        instance.status = 'CONNECTED'
                        instance.save()
                else:
                    if instance.status == 'CONNECTED':
                        logger.info(f"DB_SYNC: Phone '{instance.name}' lost connection.")
                        instance.status = 'DISCONNECTED'
                        instance.save()
            elif r.status_code in [404, 422]:
                if instance.status == 'CONNECTED':
                    instance.status = 'DISCONNECTED'
                    instance.save()
        except Exception as e:
            logger.error(f"DB_SYNC_ERROR: {e}")

    def start_waha_session(self, instance):
        """Atomic Handshake with registry verification loop."""
        base_url = f"{instance.api_url}/api"
        headers = self._get_waha_headers()
        logger.info(f"🚀 WAHA SESSION START: {instance.session_name} on {instance.api_url}")
        try:
            # Check existence first
            r = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=headers, timeout=5)
            logger.info(f"📡 Session check response: {r.status_code}")
            if r.status_code != 200:
                logger.info(f"ENGINE: Initializing session registry for {instance.session_name}...")
                # Combined create + start flag to bypass propagation delays
                # Combined create + start flag to bypass propagation delays
                payload = {
                    'name': instance.session_name,
                    'start': True,
                    'config': {
                        'noweb': {
                            'store': {
                                'enabled': True,
                                'fullSync': True
                            }
                        }
                    }
                }
                create_resp = requests.post(f"{base_url}/sessions", json=payload, headers=headers, timeout=10)
                logger.info(f"✅ Session created: {create_resp.status_code} - {create_resp.text[:200]}")
                time.sleep(4) 
            
            # Final start verification
            curr = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=headers).json()
            logger.info(f"🔍 Session status: {curr.get('status')}")
            if curr.get('status') not in ['WORKING', 'STARTING', 'SCAN_QR_CODE']:
                start_resp = requests.post(f"{base_url}/sessions/{instance.session_name}/start", headers=headers, timeout=10)
                logger.info(f"▶️ Session started: {start_resp.status_code}")
        except Exception as e:
            logger.error(f"❌ ENGINE_START_ERROR: {e}")

    def perform_create(self, serializer):
        # WAHA Core (free version) only supports 'default' session
        # Multi-session support requires WAHA Plus
        # We use multiple containers (waha, waha2) instead
        session_name = "default"
        logger.info(f"🆕 CREATING PHONE with session: {session_name}")
        instance = serializer.save(session_name=session_name)
        logger.info(f"💾 PHONE SAVED: {instance.name} (ID: {instance.id})")
        self.start_waha_session(instance)
        logger.info(f"✅ PHONE CREATION COMPLETE: {instance.name}")


    def perform_destroy(self, instance):
        """Full Cleanup: Stops engine and clears registry."""
        base_url = f"{instance.api_url}/api"
        headers = self._get_waha_headers()
        try:
            requests.post(f"{base_url}/sessions/{instance.session_name}/stop", headers=headers, timeout=5)
            time.sleep(2)
            requests.delete(f"{base_url}/sessions/{instance.session_name}", headers=headers, timeout=10)
        except:
            pass
        instance.delete()

    @action(detail=True, methods=['get'])
    def qr(self, request, pk=None):
        """Binary Image Proxy for the Frontend QR display."""
        instance = self.get_object()
        base_url = f"{instance.api_url}/api"
        try:
            r = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=self._get_waha_headers(), timeout=5)
            if r.status_code == 200:
                data = r.json()
                if data.get('status') == 'SCAN_QR_CODE':
                    qr_res = requests.get(f"{base_url}/{instance.session_name}/auth/qr?format=image", headers=self._get_waha_headers(), timeout=10)
                    if qr_res.status_code == 200:
                        return HttpResponse(qr_res.content, content_type="image/png")
            
            return Response({"error": "QR not ready"}, status=404)
        except Exception as e:
            return Response({"error": "Connection lost"}, status=503)

    @action(detail=True, methods=['post'])
    def request_code(self, request, pk=None):
        """Request pairing code for phone number authentication."""
        instance = self.get_object()
        phone_number = request.data.get('phoneNumber')
        if not phone_number:
            return Response({"error": "Phone number required"}, status=400)
        
        base_url = f"{instance.api_url}/api"
        try:
            # Request pairing code from WAHA
            r = requests.post(
                f"{base_url}/{instance.session_name}/auth/request-code",
                json={"phoneNumber": phone_number},
                headers=self._get_waha_headers(),
                timeout=10
            )
            
            if r.status_code in [200, 201]:
                data = r.json()
                return Response(data)
            return Response({"error": r.text}, status=r.status_code)
        except Exception as e:
            return Response({"error": str(e)}, status=503)

    @action(detail=True, methods=['post'])
    def sync_groups(self, request, pk=None):
        """Fetch and sync groups from WAHA"""
        instance = self.get_object()
        base_url = f"{instance.api_url}/api"
        headers = self._get_waha_headers()
        
        try:
            # Try fetching chats (includes groups) - Needs store.full_sync=True
            # Endpoint is /api/{session}/chats
            chats_url = f"{instance.api_url}/api/{instance.session_name}/chats"
            r = requests.get(chats_url, headers=headers, timeout=10)
            
            if r.status_code == 200:
                items = r.json()
                synced_count = 0
                for item in items:
                    item_id = item.get('id', '')
                    # Handle object or string ID
                    if isinstance(item_id, dict): 
                         item_id = item_id.get('_serialized', '')
                    
                    if str(item_id).endswith('@g.us'):
                        WhatsAppGroup.objects.update_or_create(
                            phone_instance=instance,
                            group_id=item_id,
                            defaults={
                                'name': item.get('name') or item.get('pushname') or "Unknown Group",
                                'participants_count': 0 
                            }
                        )
                        synced_count += 1
                return Response({'message': f'Synced {synced_count} groups'})
            
            elif r.status_code == 400 and "config.noweb.store" in r.text:
                # AUTOMATIC FIX: Session has wrong config. Restart it with correct config.
                logger.info(f"🔄 AUTO-FIX: Restarting session {instance.session_name} with STORE enabled...")
                
                # Stop & Delete bad session
                requests.post(f"{base_url}/sessions/{instance.session_name}/stop", headers=headers, timeout=10)
                requests.delete(f"{base_url}/sessions/{instance.session_name}", headers=headers, timeout=10)
                time.sleep(2)
                
                # Re-create with correct config using existing helper
                self.start_waha_session(instance)
                
                # Wait for engine to be ready (up to 15s)
                for _ in range(5):
                    time.sleep(3)
                    status_r = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=headers)
                    if status_r.status_code == 200 and status_r.json().get('status') == 'WORKING':
                        break
                
                # Retry Sync
                logger.info("🔄 Retrying Group Sync after fix...")
                return self.sync_groups(request, pk)

            else:
                return Response({'error': f'WAHA Error {r.status_code}: {r.text}'}, status=r.status_code)
        except Exception as e:
            return Response({'error': str(e)}, status=503)



    def retrieve(self, request, *args, **kwargs):
        """Syncs engine status whenever the frontend asks for phone details."""
        instance = self.get_object()
        self.sync_waha_status(instance)
        return super().retrieve(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        """Syncs all engines when dashboard is loaded."""
        queryset = self.get_queryset()
        for instance in queryset:
            self.sync_waha_status(instance)
        return super().list(request, *args, **kwargs)


class WhatsAppGroupViewSet(viewsets.ModelViewSet):
    queryset = WhatsAppGroup.objects.all()
    serializer_class = WhatsAppGroupSerializer

class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer

    @action(detail=False, methods=['POST'])
    def bulk_import(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)
        decoded_file = file.read().decode('utf-8')
        io_string = io.StringIO(decoded_file)
        reader = csv.DictReader(io_string)
        count = 0
        for row in reader:
            phone = row.get('phone', '').strip()
            name = row.get('name', '').strip()
            if phone:
                Contact.objects.update_or_create(phone=phone, defaults={'name': name, 'status': 'ACTIVE'})
                count += 1
        return Response({"message": f"Imported {count} contacts successfully"})

class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.all()
    serializer_class = PropertySerializer

    def perform_create(self, serializer):
        title = self.request.data.get('title')
        if not title:
            # Simple auto-title
            from django.utils import timezone
            title = f"Property {timezone.now().strftime('%Y-%m-%d %H:%M')}"
        serializer.save(title=title)

    @action(detail=True, methods=['POST'])
    def quick_send(self, request, pk=None):
        """
        Instant broadcast: Auto-create campaign and send to ALL contacts.
        Platforms: WhatsApp, Facebook, Instagram (based on request flags).
        """
        property_obj = self.get_object()
        
        # Get platform flags from request
        send_whatsapp = request.data.get('send_whatsapp', True)
        send_facebook = request.data.get('send_facebook', True)
        send_instagram = request.data.get('send_instagram', True)
        
        # Validate: At least one platform must be selected
        if not any([send_whatsapp, send_facebook, send_instagram]):
            return Response({"error": "Select at least one platform"}, status=400)
        
        # Auto-create campaign
        from django.utils import timezone
        campaign_name = f"Quick Send - {timezone.now().strftime('%b %d, %I:%M %p')}"
        
        campaign = Campaign.objects.create(
            name=campaign_name,
            status='DRAFT',
            post_to_facebook=send_facebook,
            post_to_instagram=send_instagram
        )
        
        # Link property
        campaign.properties.add(property_obj)
        
        # Create default settings
        from .models import CampaignSettings
        CampaignSettings.objects.create(campaign=campaign)
        
        # Launch immediately
        start_campaign_task.delay(campaign.id)
        
        return Response({
            "message": "Broadcasting now!",
            "campaign_id": str(campaign.id),
            "campaign_name": campaign_name
        })

class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer

    @action(detail=True, methods=['POST'])
    def start(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status == 'RUNNING':
            return Response({"error": "Campaign already running"}, status=400)
        
        # Reset status if restarting
        if campaign.status in ['COMPLETED', 'FAILED']:
            campaign.status = 'DRAFT'
            campaign.save()

        start_campaign_task.delay(campaign.id)
        return Response({"message": "Started"})

    @action(detail=True, methods=['POST'])
    def pause(self, request, pk=None):
        campaign = self.get_object()
        campaign.status = 'PAUSED'
        campaign.save()
        return Response({"status": "Paused"})

class InstantBroadcastViewSet(viewsets.ViewSet):
    """
    Simple broadcast endpoint - no templates, no campaigns UI.
    Just send a message instantly to all contacts.
    """
    @action(detail=False, methods=['POST'])
    def instant(self, request):
        """
        POST /api/broadcast/instant/
        Body: { message, send_whatsapp, send_facebook, send_instagram }
        """
        message = request.data.get('message', '').strip()
        send_whatsapp = request.data.get('send_whatsapp', True)
        send_facebook = request.data.get('send_facebook', True)
        send_instagram = request.data.get('send_instagram', True)
        
        # Group Broadcast Params
        send_to_all_groups = request.data.get('send_to_all_groups', False)
        target_groups = request.data.get('target_groups', [])
        
        # Contact Broadcast Param
        send_to_all_contacts = request.data.get('send_to_all_contacts', True)
        
        if not message:
            return Response({"error": "Message is required"}, status=400)
        
        if not any([send_whatsapp, send_facebook, send_instagram]):
            return Response({"error": "Select at least one platform"}, status=400)
        
        # Create temporary property
        from django.utils import timezone
        property_obj = Property.objects.create(
            title=f"Broadcast {timezone.now().strftime('%b %d, %I:%M %p')}",
            content=message
        )
        
        # Auto-create campaign
        campaign_name = f"Instant Broadcast - {timezone.now().strftime('%b %d, %I:%M %p')}"
        campaign = Campaign.objects.create(
            name=campaign_name,
            status='DRAFT',
            send_to_whatsapp=send_whatsapp,
            post_to_facebook=send_facebook,
            post_to_instagram=send_instagram,
            send_to_all_groups=send_to_all_groups,
            send_to_all_contacts=send_to_all_contacts
        )
        
        # Link property and groups
        campaign.properties.add(property_obj)
        if target_groups:
            campaign.target_groups.set(target_groups)
        
        # Create default settings
        from .models import CampaignSettings
        CampaignSettings.objects.create(campaign=campaign)
        
        # Launch immediately
        start_campaign_task.delay(campaign.id)
        
        return Response({
            "message": "Broadcasting now!",
            "details": f"Campaign: {campaign_name}",
            "campaign_id": str(campaign.id)
        })

class MessageLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MessageLog.objects.all().order_by('-sent_at')
    serializer_class = MessageLogSerializer