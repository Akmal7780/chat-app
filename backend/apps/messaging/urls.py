from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MessageViewSet
from .views import MessageViewSet, InitUpload, CompleteUpload,UploadPartDirect,DeleteAttachment, LinkPreviewAPIView, LogCallAPIView, CallLogListAPIView
router = DefaultRouter()

router.register("messages", MessageViewSet, basename="messages")

urlpatterns = [
    path("", include(router.urls)),
     # 🔥 MinIO multipart upload
   path("upload/init/", InitUpload.as_view()),
    path("upload/complete/", CompleteUpload.as_view()),
    path("upload/part-direct/", UploadPartDirect.as_view()),
    path("attachments/<int:pk>/", DeleteAttachment.as_view()),
    path("link-preview/", LinkPreviewAPIView.as_view()),
    path("log-call/", LogCallAPIView.as_view()),
    path("calls/", CallLogListAPIView.as_view()),
]