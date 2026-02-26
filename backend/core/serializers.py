from rest_framework import serializers
from .models import Contact, ContactCategory, Property, Campaign, CampaignSettings, PhoneInstance, MessageLog, WhatsAppGroup, GroupCollection

class PhoneInstanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhoneInstance
        fields = '__all__'
        read_only_fields = ['session_name']

    groups = serializers.SerializerMethodField()
    groups_count = serializers.IntegerField(source='groups.count', read_only=True)

    def get_groups(self, obj):
        return WhatsAppGroupSerializer(obj.groups.all(), many=True).data

        return WhatsAppGroupSerializer(obj.groups.all(), many=True).data

class ContactCategorySerializer(serializers.ModelSerializer):
    contact_count = serializers.SerializerMethodField()

    class Meta:
        model = ContactCategory
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_contact_count(self, obj):
        return Contact.objects.filter(tags__contains=[obj.name]).count()

class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = '__all__'

class PropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = Property
        fields = '__all__'

class CampaignSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CampaignSettings
        fields = ['delay_between_messages_min', 'delay_between_messages_max', 'warmup_mode', 'pause_every_x_messages', 'pause_duration_seconds', 'max_messages_per_hour']

class WhatsAppGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppGroup
        fields = '__all__'

class GroupCollectionSerializer(serializers.ModelSerializer):
    """
    Persists JIDs (group_ids) so collections survive phone deletions.
    Resolved details are injected dynamically.
    """
    groups_details = serializers.SerializerMethodField()
    
    class Meta:
        model = GroupCollection
        fields = '__all__'

    def get_groups_details(self, obj):
        """Resolve JIDs to current WhatsAppGroup names for display"""
        groups = WhatsAppGroup.objects.filter(group_id__in=obj.group_ids)
        return WhatsAppGroupSerializer(groups, many=True).data

class CampaignSerializer(serializers.ModelSerializer):
    settings = CampaignSettingsSerializer()
    properties = serializers.PrimaryKeyRelatedField(many=True, queryset=Property.objects.all())
    target_groups = serializers.PrimaryKeyRelatedField(many=True, queryset=WhatsAppGroup.objects.all(), required=False)

    class Meta:
        model = Campaign
        fields = '__all__'

    sent_count = serializers.SerializerMethodField()

    def get_sent_count(self, obj):
        # Count non-failed messages
        return MessageLog.objects.filter(campaign=obj, status__in=['SENT', 'DELIVERED', 'READ']).count()

    def create(self, validated_data):
        settings_data = validated_data.pop('settings')
        properties_data = validated_data.pop('properties')
        target_groups_data = validated_data.pop('target_groups', [])
        
        campaign = Campaign.objects.create(**validated_data)
        campaign.properties.set(properties_data)
        campaign.target_groups.set(target_groups_data)
        
        CampaignSettings.objects.create(campaign=campaign, **settings_data)
        return campaign

class MessageLogSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source='campaign.name', read_only=True)
    contact_phone = serializers.CharField(source='contact.phone', read_only=True)
    contact_name = serializers.CharField(source='contact.name', read_only=True)
    contact_tags = serializers.ListField(source='contact.tags', read_only=True)

    class Meta:
        model = MessageLog
        fields = '__all__'