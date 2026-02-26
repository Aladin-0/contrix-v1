import requests
import time
import csv
import io
import logging
import os
import base64
from django.http import HttpResponse
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Contact, ContactCategory, Property, Campaign, CampaignSettings, PhoneInstance, MessageLog, WhatsAppGroup, GroupCollection
from .serializers import (
    ContactSerializer, ContactCategorySerializer, PropertySerializer, CampaignSerializer, 
    PhoneInstanceSerializer, MessageLogSerializer, WhatsAppGroupSerializer, GroupCollectionSerializer
)
from .tasks import start_campaign_task

logger = logging.getLogger(__name__)

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000

class PhoneInstanceViewSet(viewsets.ModelViewSet):
    queryset = PhoneInstance.objects.all()
    serializer_class = PhoneInstanceSerializer

    def _get_waha_headers(self):
        """Standardized headers for all WAHA API interactions using Django settings."""
        api_key = getattr(settings, 'WAHA_API_KEY', 'secret')
        return {
            'X-Api-Key': api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

    def sync_waha_status(self, instance):
        """Expert Status Sync: Queries the specific engine assigned to this phone."""
        # Dynamic base URL based on the IP saved in the database
        base_url = f"{instance.api_url}/api"
        try:
            r = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=self._get_waha_headers(), timeout=5)
            if r.status_code == 200:
                data = r.json()
                waha_curr = data.get('status')
                
                new_status = instance.status
                if waha_curr == 'WORKING':
                    new_status = 'CONNECTED'
                elif waha_curr == 'SCAN_QR_CODE':
                    new_status = 'SCAN_QR_CODE'
                elif waha_curr in ['STOPPED', 'FAILED']:
                    new_status = 'DISCONNECTED'
                
                if instance.status != new_status:
                    logger.info(f"DB_SYNC: Phone '{instance.name}' status changed to {new_status}")
                    instance.status = new_status
                    instance.save()
            elif r.status_code in [401, 403]:
                logger.error(f"AUTH_ERROR: WAHA rejected API Key for {instance.name}")
        except Exception as e:
            logger.error(f"DB_SYNC_ERROR: {e}")

    def start_waha_session(self, instance):
        """Atomic Handshake with registry verification loop. Forces fresh session to ensure config."""
        base_url = f"{instance.api_url}/api"
        headers = self._get_waha_headers()
        logger.info(f"🚀 WAHA SESSION START: {instance.session_name} on {instance.api_url}")
        
        try:
            # 1. Check existing session first (Idempotency)
            logger.info(f"Checking existing session '{instance.session_name}'...")
            try:
                check_req = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=headers, timeout=5)
                if check_req.status_code == 200:
                    current_status = check_req.json().get('status')
                    if current_status in ['WORKING', 'SCAN_QR_CODE', 'STARTING']:
                        logger.info(f"Session '{instance.session_name}' is already {current_status}. Skipping recreation.")
                        self.sync_waha_status(instance)
                        return
            except Exception as e:
                logger.warning(f"Pre-check failed: {e}")

            # 2. Cleanup stale session ONLY if needed
            logger.info(f"Cleanup: Removing stale/failed session '{instance.session_name}'...")
            try:
                requests.post(f"{base_url}/sessions/{instance.session_name}/stop", headers=headers, timeout=5)
                time.sleep(1)
                requests.delete(f"{base_url}/sessions/{instance.session_name}", headers=headers, timeout=5)
                time.sleep(2)
            except Exception as e:
                logger.warning(f"Cleanup non-fatal error: {e}")

            # 3. Create new session with CORRECT CONFIG
            logger.info(f"ENGINE: Initializing session registry for {instance.session_name}...")
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
            logger.info(f"✅ Session created: {create_resp.status_code}")
            
            # 3. Final Verification
            time.sleep(4)
            curr_resp = requests.get(f"{base_url}/sessions/{instance.session_name}", headers=headers)
            if curr_resp.status_code == 200:
                curr = curr_resp.json()
                if curr.get('status') not in ['WORKING', 'STARTING', 'SCAN_QR_CODE']:
                    start_resp = requests.post(f"{base_url}/sessions/{instance.session_name}/start", headers=headers, timeout=10)
                    logger.info(f"▶️ Session started: {start_resp.status_code}")
                    
        except Exception as e:
            logger.error(f"❌ ENGINE_START_ERROR: {e}")

    def perform_create(self, serializer):
        """
        Multi-Node Round Robin Assignment:
        - First Phone -> Node 1 (172.19.0.7)
        - Second Phone -> Node 2 (172.19.0.4)
        """
        existing_count = PhoneInstance.objects.count()
        session_name = "default"
        
        # IPS RETRIEVED FROM DOCKER INSPECT
        NODE_1_IP = "http://waha:3000"
        NODE_2_IP = "http://waha2:3000"
        
        if existing_count % 2 == 0:
            api_url = NODE_1_IP
        else:
            api_url = NODE_2_IP

        logger.info(f"🆕 Creating Phone #{existing_count + 1} on Node: {api_url}")
        instance = serializer.save(session_name=session_name, api_url=api_url)
        self.start_waha_session(instance)

    def perform_destroy(self, instance):
        base_url = f"{instance.api_url}/api"
        headers = self._get_waha_headers()
        try:
            requests.post(f"{base_url}/sessions/{instance.session_name}/stop", headers=headers, timeout=5)
            time.sleep(1)
            requests.delete(f"{base_url}/sessions/{instance.session_name}", headers=headers, timeout=5)
        except:
            pass
        instance.delete()

    @action(detail=True, methods=['get'])
    def qr(self, request, pk=None):
        """
        Resilient QR Proxy: Fetches via JSON/Base64 to bypass 503 streaming timeouts.
        Uses instance.api_url to target the correct node (172.19.0.7 or .4).
        """
        instance = self.get_object()
        base_url = f"{instance.api_url}/api"
        headers = self._get_waha_headers()
        try:
            # Fetch as JSON to get base64 string
            qr_res = requests.get(
                f"{base_url}/{instance.session_name}/auth/qr?format=json", 
                headers=headers, 
                timeout=10
            )
            if qr_res.status_code == 200:
                qr_data = qr_res.json().get('qr') or qr_res.json().get('data')
                
                if qr_data:
                    if "," in qr_data:
                        qr_data = qr_data.split(",")[1]
                    
                    img_data = base64.b64decode(qr_data)
                    return HttpResponse(img_data, content_type="image/png")
            
            logger.error(f"QR_FETCH_FAILED: Status {qr_res.status_code}")
            return Response({"error": "QR not generated yet"}, status=404)
        except Exception as e:
            logger.error(f"QR_PROXY_CRASH: {e}")
            return Response({"error": "Backend connection timeout"}, status=503)

    @action(detail=True, methods=['post'])
    def request_code(self, request, pk=None):
        instance = self.get_object()
        phone_number = request.data.get('phoneNumber')
        if not phone_number:
            return Response({"error": "Phone number required"}, status=400)
        base_url = f"{instance.api_url}/api"
        try:
            r = requests.post(
                f"{base_url}/{instance.session_name}/auth/request-code",
                json={"phoneNumber": phone_number},
                headers=self._get_waha_headers(),
                timeout=10
            )
            if r.status_code in [200, 201]:
                return Response(r.json())
            return Response({"error": r.text}, status=r.status_code)
        except Exception as e:
            return Response({"error": str(e)}, status=503)

    @action(detail=True, methods=['post'])
    def sync_groups(self, request, pk=None):
        instance = self.get_object()
        base_url = f"{instance.api_url}/api"
        headers = self._get_waha_headers()
        try:
            # Increase limit allow for all chats (even if not groups) to be fetched
            # Increase timeout to handle large payloads
            r = requests.get(
                f"{base_url}/{instance.session_name}/chats", 
                headers=headers, 
                timeout=60, 
                params={'limit': 10000}
            )
            if r.status_code == 200:
                items = r.json()
                synced_count = 0
                for item in items:
                    item_id = item.get('id', '')
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
            return Response({'error': f'WAHA Error {r.status_code}: {r.text}'}, status=r.status_code)
        except Exception as e:
            return Response({'error': str(e)}, status=503)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        self.sync_waha_status(instance)
        return super().retrieve(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        for instance in queryset:
            self.sync_waha_status(instance)
        return super().list(request, *args, **kwargs)

class WhatsAppGroupViewSet(viewsets.ModelViewSet):
    queryset = WhatsAppGroup.objects.all()
    serializer_class = WhatsAppGroupSerializer

class GroupCollectionViewSet(viewsets.ModelViewSet):
    queryset = GroupCollection.objects.all()
    serializer_class = GroupCollectionSerializer

class ContactCategoryViewSet(viewsets.ModelViewSet):
    """Manage Contact Categories"""
    queryset = ContactCategory.objects.all()
    serializer_class = ContactCategorySerializer

class ContactViewSet(viewsets.ModelViewSet):
    """Manage Contacts"""
    queryset = Contact.objects.all().order_by('-imported_at')
    serializer_class = ContactSerializer
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        status = self.request.query_params.get('status')
        tags = self.request.query_params.get('tags')  # Filter by tag/category

        if status:
            queryset = queryset.filter(status=status)
        
        if tags:
            # Supports single tag filtering for now
            # For multiple, use ?tags=A,B and implement logic here
            queryset = queryset.filter(tags__contains=[tags])

        return queryset

    @action(detail=False, methods=['POST'])
    def bulk_import(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)
        decoded_file = file.read().decode('utf-8')
        io_string = io.StringIO(decoded_file)
        reader = csv.DictReader(io_string)
        count = 0
        tags = request.data.get('tags')  # Check for tags in the request
        tag_list = []
        if tags:
             # Handle both JSON list or comma-separated string
            if isinstance(tags, list):
                tag_list = tags
            else:
                tag_list = [t.strip() for t in tags.split(',') if t.strip()]

        for row in reader:
            raw_phone = row.get('phone', '').strip()
            name = row.get('name', '').strip()
            
            if raw_phone:
                # Normalization Logic
                # 1. Remove all non-digit characters
                clean_phone = ''.join(filter(str.isdigit, raw_phone))
                
                # 2. Strip leading zeros (handle 098... or 0091...)
                clean_phone = clean_phone.lstrip('0')
                
                # 3. Handle missing country code (Assume India 91 if 10 digits)
                if len(clean_phone) == 10:
                    clean_phone = '91' + clean_phone
                
                # 4. Basic Validation (WhatsApp numbers are usually 10-15 digits)
                if 10 <= len(clean_phone) <= 15:
                    contact, created = Contact.objects.update_or_create(
                        phone=clean_phone, 
                        defaults={'name': name, 'status': 'ACTIVE'}
                    )
                
                    # Add tags if provided
                    if tag_list:
                        # using set to avoid duplicates
                        current_tags = set(contact.tags or [])
                        current_tags.update(tag_list)
                        contact.tags = list(current_tags)
                        contact.save()
                    
                    count += 1
                else:
                    # Skip invalid numbers silently as requested
                    pass
        return Response({"message": f"Imported {count} contacts successfully"})

class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.all()
    serializer_class = PropertySerializer

    def perform_create(self, serializer):
        title = self.request.data.get('title')
        if not title:
            from django.utils import timezone
            title = f"Property {timezone.now().strftime('%Y-%m-%d %H:%M')}"
        serializer.save(title=title)

    @action(detail=True, methods=['POST'])
    def quick_send(self, request, pk=None):
        property_obj = self.get_object()
        send_whatsapp = request.data.get('send_whatsapp', True)
        send_facebook = request.data.get('send_facebook', True)
        send_instagram = request.data.get('send_instagram', True)
        if not any([send_whatsapp, send_facebook, send_instagram]):
            return Response({"error": "Select at least one platform"}, status=400)
        from django.utils import timezone
        campaign_name = f"Quick Send - {timezone.now().strftime('%b %d, %I:%M %p')}"
        campaign = Campaign.objects.create(
            name=campaign_name,
            status='DRAFT',
            post_to_facebook=send_facebook,
            post_to_instagram=send_instagram
        )
        campaign.properties.add(property_obj)
        from .models import CampaignSettings
        CampaignSettings.objects.create(campaign=campaign)
        start_campaign_task.delay(campaign.id)
        return Response({"message": "Broadcasting now!", "campaign_id": str(campaign.id)})

class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer

    @action(detail=True, methods=['POST'])
    def start(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status == 'RUNNING':
            return Response({"error": "Campaign already running"}, status=400)
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
    @action(detail=False, methods=['POST'])
    def instant(self, request):
        message = request.data.get('message', '').strip()
        send_whatsapp = request.data.get('send_whatsapp', True)
        send_facebook = request.data.get('send_facebook', True)
        send_instagram = request.data.get('send_instagram', True)
        send_to_all_groups = request.data.get('send_to_all_groups', False)
        target_groups = request.data.get('target_groups', [])
        collection_id = request.data.get('collection_id')

        # Resolve Collection if provided
        # Resolve Collection if provided
        if collection_id:
            try:
                collection = GroupCollection.objects.get(id=collection_id)
                # Resolve JIDs (group_ids) to current DB IDs (rows)
                # This ensures we only target groups that currently exist/are synced
                collection_group_db_ids = list(WhatsAppGroup.objects.filter(group_id__in=collection.group_ids).values_list('id', flat=True))
                
                # Combine with manually selected groups
                target_groups = list(set(target_groups + [str(g) for g in collection_group_db_ids]))
            except GroupCollection.DoesNotExist:
                return Response({"error": "Invalid Collection ID"}, status=400)
        
        target_tags = request.data.get('target_tags', [])
        
        send_to_all_contacts = request.data.get('send_to_all_contacts', True)
        
        # If specific tags are selected, we usually DON'T want to send to "all contacts" blindly.
        # But we'll keep the flag logic: 
        # - If send_to_all_contacts is TRUE -> sends to everyone regardless of tags (maybe warning needed?)
        # - Logic below: If target_tags is present, we will eventually filter targets in the task.
        
        if not message:
            return Response({"error": "Message is required"}, status=400)
        if not any([send_whatsapp, send_facebook, send_instagram]):
            return Response({"error": "Select at least one platform"}, status=400)
        from django.utils import timezone
        property_obj = Property.objects.create(
            title=f"Broadcast {timezone.now().strftime('%b %d, %I:%M %p')}",
            content=message
        )
        campaign_name = f"Instant Broadcast - {timezone.now().strftime('%b %d, %I:%M %p')}"
        campaign = Campaign.objects.create(
            name=campaign_name,
            status='DRAFT',
            send_to_whatsapp=send_whatsapp,
            post_to_facebook=send_facebook,
            post_to_instagram=send_instagram,
            send_to_all_groups=send_to_all_groups,
            send_to_all_contacts=send_to_all_contacts,
            target_tags=target_tags
        )
        campaign.properties.add(property_obj)
        if target_groups:
            campaign.target_groups.set(target_groups)
        from .models import CampaignSettings
        CampaignSettings.objects.create(campaign=campaign)
        start_campaign_task.delay(campaign.id)
        return Response({"message": "Broadcasting now!", "campaign_id": str(campaign.id)})

class MessageLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MessageLog.objects.all().order_by('-sent_at')
    serializer_class = MessageLogSerializer
