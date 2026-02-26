from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ContactViewSet, ContactCategoryViewSet, PropertyViewSet, CampaignViewSet, 
    PhoneInstanceViewSet, MessageLogViewSet, InstantBroadcastViewSet,
    WhatsAppGroupViewSet, GroupCollectionViewSet
)

router = DefaultRouter()
router.register(r'contacts', ContactViewSet)
router.register(r'contact-categories', ContactCategoryViewSet)
router.register(r'properties', PropertyViewSet)
router.register(r'campaigns', CampaignViewSet)
router.register(r'phones', PhoneInstanceViewSet)
router.register(r'groups', WhatsAppGroupViewSet)
router.register(r'group-collections', GroupCollectionViewSet)
router.register(r'logs', MessageLogViewSet)
router.register(r'broadcast', InstantBroadcastViewSet, basename='broadcast')

urlpatterns = [
    path('', include(router.urls)),
]