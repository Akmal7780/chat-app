from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from .tasks import scan_file_task
from rest_framework.views import APIView
from utils.minio import get_s3
import os
from django.conf import settings
from utils.files import get_file_type
import uuid
from apps.notifications.views import send_message_notification
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from apps.conversations.models import ConversationParticipant
from .models import Message, Attachment, Reaction
from .serializers import MessageSerializer, ReactionSerializer
from apps.users.throttles import MessageThrottle,UploadThrottle

class InitUpload(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [UploadThrottle]

    def post(self, request):
        s3 = get_s3()

        file_name = request.data.get("file_name")
        conversation_id = request.data.get("conversation_id")  

        # ❗ validation
        if not file_name or not conversation_id:
            return Response({"error": "file_name and conversation_id required"}, status=400)

        # 🔐 security check
        is_participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id,
            user=request.user
        ).exists()

        if not is_participant:
            return Response({"error": "Not allowed"}, status=403)

        key = f"users/{request.user.id}/conversations/{conversation_id}/{uuid.uuid4()}_{file_name}"

        res = s3.create_multipart_upload(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=key,
        )

        return Response({
            "upload_id": res["UploadId"],
            "key": key
        })

class UploadPartDirect(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)
    throttle_classes = [UploadThrottle]

    def post(self, request):
        s3 = get_s3()

        file = request.FILES.get("file")

        if not file:
            return Response({"error": "file required"}, status=400)

        try:
            import magic

            header = file.read(1024)
            file.seek(0)

            mime = magic.from_buffer(header, mime=True)
            print(f"📦 Uploaded file MIME: {mime}")

        except Exception as e:
            print("⚠️ Magic error:", e)


        MAX_CHUNK_SIZE = 5 * 1024 * 1024  # 5MB

        if file.size > MAX_CHUNK_SIZE:
            return Response({"error": "Chunk too large"}, status=400)

        safe_name = os.path.basename(file.name)

        if len(safe_name) > 255:
            return Response({"error": "Filename too long"}, status=400)

        try:
            part_number = int(request.data.get("part_number", 0))
        except ValueError:
            return Response({"error": "Invalid part number"}, status=400)

        if part_number <= 0 or part_number > 1000:
            return Response({"error": "Invalid part number range"}, status=400)

        key = request.data.get("key")
        upload_id = request.data.get("upload_id")

        if not key or not upload_id:
            return Response({"error": "Missing upload data"}, status=400)

        if not key.startswith(f"users/{request.user.id}/"):
            return Response({"error": "Invalid file path"}, status=403)

        # =========================
        # 🚀 UPLOAD TO MINIO
        # =========================
        try:
            res = s3.upload_part(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Key=key,
                UploadId=upload_id,
                PartNumber=part_number,
                Body=file,
            )
        except Exception as e:
            print("❌ Upload error:", e)
            return Response({"error": "Upload failed"}, status=500)

        # =========================
        # ✅ SUCCESS
        # =========================
        return Response({
            "ETag": res["ETag"].replace('"', '')
        })
class CompleteUpload(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [UploadThrottle]

    def post(self, request):

        conversation_id = request.data.get("conversation_id")
        file_name = request.data.get("file_name")

        if not file_name or not conversation_id:
            return Response({"error": "Invalid data"}, status=400)

        is_participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id,
            user=request.user
        ).exists()

        if not is_participant:
            return Response({"error": "Not allowed"}, status=403)

        s3 = get_s3()

        key = request.data.get("key")
        if not key.startswith(f"users/{request.user.id}/"):
            return Response({"error": "Invalid file path"}, status=403)

        s3.complete_multipart_upload(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=key,
            UploadId=request.data["upload_id"],
            MultipartUpload={"Parts": request.data["parts"]},
        )

        file_type = get_file_type(request.data["file_name"])
        if not file_type:
            file_type = "file"

        message = Message.objects.create(
            conversation_id=conversation_id,
            sender=request.user,
            message_type=file_type
        )

        attachment = Attachment.objects.create(
            message=message,
            file=key,
            file_type=file_type,
            file_size=request.data["size"],
            original_name=request.data["file_name"],
            scan_status="pending"
        )

        

        channel_layer = get_channel_layer()

        async_to_sync(channel_layer.group_send)(
            f"chat_{message.conversation_id}",
            {
                "type": "message",
                "message": MessageSerializer(
                    message,
                    context={"request": request}
                ).data
            }
        )
        scan_file_task.delay(attachment.id)

        return Response({"status": "uploaded"})

class DeleteAttachment(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        s3 = get_s3()

        try:
            attachment = Attachment.objects.get(id=pk)

            if attachment.message.sender != request.user:
                return Response({"error": "Not allowed"}, status=403)

            s3.delete_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Key=attachment.file
            )

            attachment.delete()

            return Response({"success": True})

        except Attachment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]
    throttle_classes = [MessageThrottle]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    # =========================
    # QUERYSET (OPTIMIZED 🔥)
    # =========================
    def get_queryset(self):
        queryset = Message.objects.select_related(
            "sender", "reply_to__sender"
        ).prefetch_related(
            "attachments", "reactions", "read_receipts"
        )

        if self.kwargs.get("pk"):
            return queryset.filter(
                conversation__participants__user=self.request.user,
                conversation__participants__left_at__isnull=True
            ).distinct()

        conversation_id = self.request.query_params.get("conversation")

        if not conversation_id:
            return Message.objects.none()

        is_participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id,
            user=self.request.user,
            left_at__isnull=True
        ).exists()

        if not is_participant:
            return Message.objects.none()

        return queryset.filter(
            conversation_id=conversation_id
        ).order_by("created_at")

    
    # =========================
    # ADD / TOGGLE REACTION
    # =========================
    @action(detail=True, methods=["post"], url_path="reactions")
    def reactions(self, request, pk=None):
        message = self.get_object()
        emoji = request.data.get("emoji")

        if message.sender == request.user:
            return Response(
                {"error": "Cannot react to your own message"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not emoji or emoji in ["undefined", "null", ""]:
            return Response(
                {"error": "Valid emoji is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        channel_layer = get_channel_layer()

        old_reaction = Reaction.objects.filter(
            message=message,
            user=request.user
        ).first()

        if old_reaction:
            if old_reaction.emoji == emoji:
                old_reaction.delete()

                async_to_sync(channel_layer.group_send)(
                    f"chat_{message.conversation_id}",
                    {
                        "type": "reaction",
                        "action": "removed",
                        "message_id": message.id,
                        "user_id": request.user.id,
                        "emoji": emoji,
                    }
                )
                return Response({"removed": True})

            old_emoji = old_reaction.emoji
            old_reaction.delete()

            async_to_sync(channel_layer.group_send)(
                f"chat_{message.conversation_id}",
                {
                    "type": "reaction",
                    "action": "removed",
                    "message_id": message.id,
                    "user_id": request.user.id,
                    "emoji": old_emoji,
                }
            )

        reaction = Reaction.objects.create(
            message=message,
            user=request.user,
            emoji=emoji
        )

        reaction_data = ReactionSerializer(reaction).data

        async_to_sync(channel_layer.group_send)(
            f"chat_{message.conversation_id}",
            {
                "type": "reaction",
                "action": "added",
                "message_id": message.id,
                "user_id": request.user.id,
                "reaction": reaction_data
            }
        )

        return Response(reaction_data)

    # =========================
    # DELETE REACTION
    # =========================
    @action(detail=True, methods=["delete"], url_path="reactions/(?P<reaction_id>[^/.]+)")
    def delete_reaction(self, request, pk=None, reaction_id=None):
        try:
            reaction = Reaction.objects.get(
                id=reaction_id,
                user=request.user,
                message_id=pk
            )

            message = reaction.message
            emoji = reaction.emoji
            reaction.delete()

            channel_layer = get_channel_layer()

            async_to_sync(channel_layer.group_send)(
                f"chat_{message.conversation_id}",
                {
                    "type": "reaction",
                    "action": "removed",
                    "message_id": message.id,
                    "user_id": request.user.id,
                    "emoji": emoji,
                }
            )

            return Response({"deleted": True})

        except Reaction.DoesNotExist:
            return Response(
                {"error": "Reaction not found"},
                status=status.HTTP_404_NOT_FOUND
            )

    # =========================
    # CONTEXT
    # =========================
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context
    
    @action(detail=False, methods=["get"])
    def search(self, request):
        query = request.GET.get("q", "")
        conversation_id = request.GET.get("conversation_id")

        page = int(request.GET.get("page", 1))
        page_size = 20

        offset = (page - 1) * page_size

        messages = Message.objects.filter(
            conversation_id=conversation_id,
            content__icontains=query,
            is_deleted=False
        ).order_by("-created_at")[offset:offset + page_size]

        serializer = self.get_serializer(messages, many=True)
        return Response(serializer.data)