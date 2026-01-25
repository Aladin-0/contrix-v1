from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
import csv
import io

# Import the Celery task
from .tasks import start_campaign_task

from .models import Contact, Property, Campaign, PhoneInstance, MessageLog
from .serializers import (
    ContactSerializer, PropertySerializer, CampaignSerializer, 
    PhoneInstanceSerializer, MessageLogSerializer
)

class PhoneInstanceViewSet(viewsets.ModelViewSet):
    queryset = PhoneInstance.objects.all()
    serializer_class = PhoneInstanceSerializer

    def start_waha_session(self, session_name):
        import requests
        import time
        base_url = "http://waha:3000/api"
        headers = {'X-Api-Key': 'secret'}
        
        # 1. Nuke ALL existing sessions (Force cleanup for Core compliance)
        try:
            r = requests.get(f"{base_url}/sessions", headers=headers, timeout=5)
            if r.status_code == 200:
                sessions = r.json()
                for s in sessions:
                    try:
                        requests.delete(f"{base_url}/sessions/{s['name']}", headers=headers, timeout=10)
                    except:
                        pass
        except Exception as e:
            print(f"Cleanup Error: {e}")
        
        time.sleep(2) 

        # 2. Create fresh 'default' session
        try:
            # Re-adding config just in case, straightforward payload
            # WAHA Core uses 'default' session
            waha_real_name = 'default' 
            payload = {'name': waha_real_name, 'config': {'proxy': None}}
            r = requests.post(f"{base_url}/sessions", json=payload, headers=headers, timeout=15)
            
            if r.status_code == 422:
                # Session exists but might be stopped. Try to start it.
                requests.post(f"{base_url}/sessions/start", json={'name': waha_real_name}, headers=headers, timeout=10)
            elif r.status_code not in [200, 201]:
                 print(f"Create Failed: {r.status_code} {r.text}")
        except Exception as e:
            print(f"Create Exception: {e}")

    def perform_create(self, serializer):
        instance = serializer.save()
        self.start_waha_session(instance.session_name)

    def perform_destroy(self, instance):
        import requests
        try:
             # WAHA Core uses 'default'
             url = f"http://waha:3000/api/sessions/default"
             headers = {'X-Api-Key': 'secret'}
             requests.delete(url, headers=headers, timeout=20)
        except:
            pass
        instance.delete()

    @action(detail=True, methods=['get'])
    def qr(self, request, pk=None):
        import requests
        import time
        from django.http import HttpResponse
        
        instance = self.get_object()
        waha_session = 'default'
        base_url = "http://waha:3000/api"
        headers = {'X-Api-Key': 'secret'}
        
        def get_status():
            try:
                r = requests.get(f"{base_url}/sessions/{waha_session}", headers=headers, timeout=5)
                if r.status_code == 200:
                    return r.json().get('status')
            except:
                pass
            return None

        # 1. Check current status
        status = get_status()
        
        # 2. Start if needed (Auto-heal if perform_create failed or session crashed)
        if status != 'SCAN_QR_CODE' and status != 'WORKING':
             self.start_waha_session(instance.session_name)
             
             # 3. Poll (Increased to 30s)
             for _ in range(30):
                 time.sleep(1)
                 status = get_status()
                 if status == 'SCAN_QR_CODE':
                     break
                 if status == 'WORKING':
                     return Response({"error": "Phone is already connected!"}, status=400)

        # 4. Fetch QR
        try:
            qr_url = f"{base_url}/{waha_session}/auth/qr?format=image"
            response = requests.get(qr_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                return HttpResponse(response.content, content_type="image/png")
            elif response.status_code == 401:
                 return Response({"error": "WAHA Auth Failed"}, status=500)
                 
            return Response({"error": f"QR Not Ready (Status: {status})"}, status=503)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

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
            # Basic CSV parsing - assumes headers 'phone', 'name'
            phone = row.get('phone', '').strip()
            name = row.get('name', '').strip()
            
            if phone:
                Contact.objects.update_or_create(
                    phone=phone,
                    defaults={'name': name, 'status': 'ACTIVE'}
                )
                count += 1
                
        return Response({"message": f"Imported {count} contacts successfully"})

class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.all()
    serializer_class = PropertySerializer

class CampaignViewSet(viewsets.ModelViewSet):
    queryset = Campaign.objects.all()
    serializer_class = CampaignSerializer

    @action(detail=True, methods=['POST'])
    def start(self, request, pk=None):
        campaign = self.get_object()
        
        # Check if already running to prevent double-starts
        if campaign.status == 'RUNNING':
            return Response({"error": "Campaign is already running"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Trigger Celery Task (Phase 4 Logic)
        start_campaign_task.delay(campaign.id)
        
        return Response({"message": f"Campaign '{campaign.name}' started successfully"})

    @action(detail=True, methods=['POST'])
    def pause(self, request, pk=None):
        campaign = self.get_object()
        campaign.status = 'PAUSED'
        campaign.save()
        return Response({"status": "Campaign paused"})

class MessageLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MessageLog.objects.all().order_by('-sent_at')
    serializer_class = MessageLogSerializer