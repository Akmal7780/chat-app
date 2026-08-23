from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse
from utils.link_preview import fetch_link_preview, LinkPreviewError
from apps.conversations.models import Conversation, ConversationParticipant
from .models import Message
from .serializers import MessageSerializer
from apps.users.throttles import MessageThrottle,UploadThrottle
from . import services

class InitUpload(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [UploadThrottle]

    def post(self, request):
        file_name = request.data.get("file_name")
        conversation_id = request.data.get("conversation_id")

        if not file_name or not conversation_id:
            return Response({"error": "file_name and conversation_id required"}, status=400)

        result = services.initiate_upload(request.user, conversation_id, file_name)
        return Response(result)

class UploadPartDirect(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)
    throttle_classes = [UploadThrottle]

    def post(self, request):
        file = request.FILES.get("file")

        if not file:
            return Response({"error": "file required"}, status=400)

        key = request.data.get("key")
        upload_id = request.data.get("upload_id")

        if not key or not upload_id:
            return Response({"error": "Missing upload data"}, status=400)

        try:
            part_number = int(request.data.get("part_number", 0))
        except ValueError:
            return Response({"error": "Invalid part number"}, status=400)

        try:
            etag = services.upload_part(request.user, key, upload_id, part_number, file)
        except Exception as e:
            return Response({"error": "Upload failed"}, status=500)

        return Response({"ETag": etag})

class CompleteUpload(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [UploadThrottle]

    def post(self, request):
        conversation_id = request.data.get("conversation_id")
        file_name = request.data.get("file_name")

        if not file_name or not conversation_id:
            return Response({"error": "Invalid data"}, status=400)

        services.complete_upload(
            request.user,
            request,
            conversation_id=conversation_id,
            file_name=file_name,
            key=request.data.get("key"),
            upload_id=request.data["upload_id"],
            parts=request.data["parts"],
            size=request.data["size"],
            message_type=request.data.get("message_type"),
        )

        return Response({"status": "uploaded"})

class DeleteAttachment(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        deleted = services.delete_attachment(request.user, pk)

        if not deleted:
            return Response({"error": "Not found"}, status=404)

        return Response({"success": True})

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

        result = services.toggle_reaction(request.user, message, emoji)
        return Response(result)

    # =========================
    # DELETE REACTION
    # =========================
    @action(detail=True, methods=["delete"], url_path="reactions/(?P<reaction_id>[^/.]+)")
    def delete_reaction(self, request, pk=None, reaction_id=None):
        deleted = services.delete_reaction(request.user, pk, reaction_id)

        if not deleted:
            return Response({"error": "Reaction not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response({"deleted": True})

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

    # =========================
    # EXPORT CHAT HISTORY
    # =========================
    @action(detail=False, methods=["get"])
    def export(self, request):
        conversation_id = request.GET.get("conversation_id")

        if not conversation_id:
            return Response({"error": "conversation_id is required"}, status=400)

        is_participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id,
            user=request.user,
            left_at__isnull=True,
        ).exists()

        if not is_participant:
            return Response({"error": "Not a participant"}, status=403)

        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"error": "Conversation not found"}, status=404)

        messages = Message.objects.filter(
            conversation_id=conversation_id, is_deleted=False
        ).select_related("sender").prefetch_related("attachments").order_by("created_at")

        call_status_labels = {
            Message.CALL_COMPLETED: "completed",
            Message.CALL_DECLINED: "declined",
            Message.CALL_MISSED_OR_CANCELED: "missed/canceled",
        }

        lines = []
        for message in messages:
            timestamp = message.created_at.strftime("%Y-%m-%d %H:%M")
            sender = message.sender.username

            if message.message_type == Message.SYSTEM:
                body = f"[{message.content}]"
            elif message.message_type == Message.CALL:
                kind = "Video call" if message.call_is_video else "Voice call"
                status_label = call_status_labels.get(message.call_status, message.call_status)
                duration = f", {message.call_duration_seconds}s" if message.call_duration_seconds else ""
                body = f"[{kind} — {status_label}{duration}]"
            elif message.message_type == Message.VOICE:
                body = "[Voice message]"
            elif message.attachments.exists():
                names = ", ".join(a.original_name or a.file_type for a in message.attachments.all())
                body = f"[{message.message_type.capitalize()}: {names}]"
                if message.content:
                    body = f"{message.content} {body}"
            else:
                body = message.content

            lines.append(f"[{timestamp}] {sender}: {body}")

        content = "\n".join(lines)
        raw_name = conversation.name or "chat"
        safe_name = "".join(
            c for c in raw_name if c.isalnum() or c in (" ", "-", "_")
        ).strip() or "chat"

        response = HttpResponse(content, content_type="text/plain; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{safe_name}_export.txt"'
        return response


class LogCallAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        conversation_id = request.data.get("conversation_id")
        call_status = request.data.get("call_status")
        is_video = request.data.get("is_video", False)
        duration_seconds = request.data.get("duration_seconds")

        if not conversation_id or not call_status:
            return Response({"error": "conversation_id and call_status are required"}, status=400)

        message = services.log_call(
            request.user,
            request,
            conversation_id=conversation_id,
            call_status=call_status,
            is_video=is_video,
            duration_seconds=duration_seconds,
        )

        return Response(MessageSerializer(message, context={"request": request}).data)


class CallLogListAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # local import avoids a circular import at module load time
        from apps.users.serializers import UserSerializer

        calls = Message.objects.filter(
            message_type=Message.CALL,
            conversation__type=Conversation.PRIVATE,
            conversation__participants__user=request.user,
        ).select_related("sender").prefetch_related(
            "conversation__participants__user"
        ).order_by("-created_at")[:200]

        results = []
        for call in calls:
            other_participant = None
            for participant in call.conversation.participants.all():
                if participant.user_id != request.user.id:
                    other_participant = participant.user
                    break

            # Saved Messages (a private "conversation" with yourself) has no
            # other participant — there's nothing meaningful to log here.
            if not other_participant:
                continue

            results.append({
                "id": call.id,
                "conversation_id": call.conversation_id,
                "other_user": UserSerializer(other_participant, context={"request": request}).data,
                "direction": "outgoing" if call.sender_id == request.user.id else "incoming",
                "call_status": call.call_status,
                "call_is_video": call.call_is_video,
                "call_duration_seconds": call.call_duration_seconds,
                "created_at": call.created_at,
            })

        return Response(results)


class LinkPreviewAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        url = request.GET.get("url")

        if not url:
            return Response({"error": "url is required"}, status=400)

        try:
            preview = fetch_link_preview(url)
        except LinkPreviewError as e:
            return Response({"error": str(e)}, status=422)

        return Response(preview)