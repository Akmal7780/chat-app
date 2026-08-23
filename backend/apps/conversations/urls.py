from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ConversationViewSet, ConversationParticipantViewSet, ChatFolderViewSet

router = DefaultRouter()

router.register("conversations", ConversationViewSet, basename="conversations")
router.register("participants", ConversationParticipantViewSet, basename="participants")
router.register("folders", ChatFolderViewSet, basename="folders")

urlpatterns = [
    path("", include(router.urls)),
]