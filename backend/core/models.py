import uuid
from django.db import models
from django.contrib.postgres.fields import ArrayField

class TimeStampedModel(models.Model):
    """Abstract base class with created/updated timestamps"""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class PhoneInstance(TimeStampedModel):
    """Represents a connected WhatsApp session (Multi-session support)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, help_text="e.g., Primary Marketing Phone")
    session_name = models.CharField(max_length=100, help_text="Internal WAHA session ID (default for WAHA Core)")

    is_primary = models.BooleanField(default=False)
    
    # Load Balancing
    load_percentage = models.IntegerField(default=25, help_text="Percentage of traffic to route here (0-100)")
    api_url = models.CharField(max_length=255, default='http://waha:3000', help_text="WAHA API URL (e.g. http://waha:3000)")
    
    # Status
    STATUS_CHOICES = [
        ('CONNECTED', 'Connected'),
        ('DISCONNECTED', 'Disconnected'),
        ('PAUSED', 'Paused'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DISCONNECTED')
    
    # Metrics
    total_sent = models.IntegerField(default=0)
    sent_today = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.name} ({self.session_name})"

class WhatsAppGroup(TimeStampedModel):
    """Synced WhatsApp Groups"""
    phone_instance = models.ForeignKey(PhoneInstance, on_delete=models.CASCADE, related_name='groups')
    group_id = models.CharField(max_length=100) # e.g. 1203630239@g.us
    name = models.CharField(max_length=255)
    participants_count = models.IntegerField(default=0)
    
    class Meta:
        unique_together = ('phone_instance', 'group_id')

    def __str__(self):
        return self.name

class GroupCollection(TimeStampedModel):
    """Collection of WhatsApp Groups for easier targeting"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    group_ids = ArrayField(models.CharField(max_length=100), blank=True, default=list, help_text="List of WhatsApp Group JIDs (e.g. 12345@g.us)")

    def __str__(self):
        return f"{self.name} ({len(self.group_ids)} groups)"

class ContactCategory(TimeStampedModel):
    """User-defined categories for contacts (e.g. Broker, Builder)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

class Contact(models.Model):
    """Customer database"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, unique=True)
    
    # Tags implemented as ArrayField (Postgres specific)
    tags = ArrayField(models.CharField(max_length=50), blank=True, default=list)
    
    STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('UNSUBSCRIBED', 'Unsubscribed'),
        ('BLOCKED', 'Blocked'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    imported_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.phone}"

class Property(TimeStampedModel):
    """Real Estate Property Details"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, blank=True)
    content = models.TextField(default='')
    


    def __str__(self):
        return self.title or "Untitled Property"

class Campaign(TimeStampedModel):
    """Marketing Campaign wrapper"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    
    # Many-to-Many: A campaign can have multiple properties
    properties = models.ManyToManyField(Property, related_name='campaigns')
    
    # Group Targeting
    target_groups = models.ManyToManyField(WhatsAppGroup, blank=True, related_name='campaigns')
    send_to_all_groups = models.BooleanField(default=False)
    
    # Tag Targeting (Category-based)
    target_tags = ArrayField(models.CharField(max_length=50), blank=True, default=list, help_text="List of tags to target (e.g. ['Builder', 'Broker'])")
    
    # Contact Targeting
    send_to_all_contacts = models.BooleanField(default=True)
    
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('QUEUED', 'Queued'),
        ('RUNNING', 'Running'),
        ('PAUSED', 'Paused'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    
    # Stats
    total_contacts = models.IntegerField(default=0)
    total_groups = models.IntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # Platform selection
    send_to_whatsapp = models.BooleanField(default=True)
    post_to_facebook = models.BooleanField(default=False)
    post_to_instagram = models.BooleanField(default=False)

    def __str__(self):
        return self.name

class CampaignSettings(models.Model):
    """Specific configuration for a single campaign"""
    campaign = models.OneToOneField(Campaign, on_delete=models.CASCADE, related_name='settings')
    delay_between_messages_min = models.IntegerField(default=8, help_text="Min seconds delay")
    delay_between_messages_max = models.IntegerField(default=12, help_text="Max seconds delay")
    warmup_mode = models.BooleanField(default=False)
    pause_every_x_messages = models.IntegerField(default=5, help_text="Pulse size")
    pause_duration_seconds = models.IntegerField(default=30, help_text="Rest duration")
    max_messages_per_hour = models.IntegerField(default=0, help_text="0 = Unlimited")

class MessageLog(models.Model):
    """Audit trail for every message sent"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True)
    phone_instance = models.ForeignKey(PhoneInstance, on_delete=models.SET_NULL, null=True)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, null=True, blank=True)
    group = models.ForeignKey(WhatsAppGroup, on_delete=models.SET_NULL, null=True, blank=True)
    property = models.ForeignKey(Property, on_delete=models.SET_NULL, null=True)
    
    waha_group_id = models.CharField(max_length=100, blank=True, null=True, help_text="Legacy/Dual store") 
    
    message_text = models.TextField()
    
    STATUS_CHOICES = [
        ('SENT', 'Sent'),
        ('DELIVERED', 'Delivered'),
        ('READ', 'Read'),
        ('FAILED', 'Failed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SENT')
    error_message = models.TextField(blank=True, null=True)

    PLATFORM_CHOICES = [
        ('WHATSAPP', 'WhatsApp'),
        ('FACEBOOK', 'Facebook'),
        ('INSTAGRAM', 'Instagram'),
    ]
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default='WHATSAPP')
    sent_at = models.DateTimeField(auto_now_add=True)