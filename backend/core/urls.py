from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ContactViewSet, PropertyViewSet, CampaignViewSet, 
    PhoneInstanceViewSet, MessageLogViewSet
)

router = DefaultRouter()
router.register(r'contacts', ContactViewSet)
router.register(r'properties', PropertyViewSet)
router.register(r'campaigns', CampaignViewSet)
router.register(r'phones', PhoneInstanceViewSet)
router.register(r'logs', MessageLogViewSet)

urlpatterns = [
    path('', include(router.urls)),
]