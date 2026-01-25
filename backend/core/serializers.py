from rest_framework import serializers
from .models import Contact, Property, Campaign, CampaignSettings, PhoneInstance, MessageLog

class PhoneInstanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhoneInstance
        fields = '__all__'

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

class CampaignSerializer(serializers.ModelSerializer):
    settings = CampaignSettingsSerializer()
    properties = serializers.PrimaryKeyRelatedField(many=True, queryset=Property.objects.all())

    class Meta:
        model = Campaign
        fields = '__all__'

    def create(self, validated_data):
        settings_data = validated_data.pop('settings')
        properties_data = validated_data.pop('properties')
        
        campaign = Campaign.objects.create(**validated_data)
        campaign.properties.set(properties_data)
        
        CampaignSettings.objects.create(campaign=campaign, **settings_data)
        return campaign

class MessageLogSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source='campaign.name', read_only=True)
    contact_phone = serializers.CharField(source='contact.phone', read_only=True)

    class Meta:
        model = MessageLog
        fields = '__all__'