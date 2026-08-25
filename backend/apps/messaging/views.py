import io
import os
import logging
import zipfile

from rest_framework import viewsets, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape
from django.utils.dateparse import parse_date, parse_datetime
from utils.link_preview import fetch_link_preview, LinkPreviewError
from utils.giphy import search_gifs, GiphyError
from utils.minio import get_s3
from apps.conversations.models import Conversation, ConversationParticipant
from .models import Message, Attachment
from .serializers import MessageSerializer
from apps.users.throttles import MessageThrottle,UploadThrottle
from . import services

logger = logging.getLogger(__name__)

class InitUpload(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [UploadThrottle]

    def post(self, request):
        file_name = request.data.get("file_name")
        conversation_id = request.data.get("conversation_id")
        file_size = request.data.get("file_size")

        if not file_name or not conversation_id:
            return Response({"error": "file_name and conversation_id required"}, status=400)

        try:
            file_size = int(file_size) if file_size is not None else None
        except (TypeError, ValueError):
            file_size = None

        result = services.initiate_upload(request.user, conversation_id, file_name, file_size)
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
            view_once=request.data.get("view_once", False),
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

        # A "send later" message is invisible to everyone but its sender
        # until the scheduled time passes (the Celery Beat task publishes
        # it — see tasks.publish_scheduled_messages) — a race between "the
        # clock passed" and "the task actually ran" is fine here since this
        # is purely a visibility filter, not what makes it live.
        not_pending_scheduled = Q(scheduled_at__isnull=True) | Q(scheduled_at__lte=timezone.now())
        queryset = queryset.filter(not_pending_scheduled | Q(sender=self.request.user))

        if self.kwargs.get("pk"):
            return queryset.filter(
                conversation__participants__user=self.request.user,
                conversation__participants__left_at__isnull=True
            ).distinct()

        conversation_id = self.request.query_params.get("conversation")

        if not conversation_id:
            return Message.objects.none()

        participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id,
            user=self.request.user,
            left_at__isnull=True
        ).first()

        if not participant:
            return Message.objects.none()

        queryset = queryset.filter(conversation_id=conversation_id)
        if participant.cleared_before:
            queryset = queryset.filter(created_at__gte=participant.cleared_before)

        return queryset.order_by("created_at")

    
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
    # VIEW-ONCE MEDIA — one-shot read; deletes the MinIO object right after
    # serving it, so the bytes can never be fetched a second time even via
    # a leaked/cached URL (see services.open_view_once_media).
    # =========================
    @action(detail=True, methods=["post"], url_path="view-once/open")
    def open_view_once(self, request, pk=None):
        message = self.get_object()
        try:
            result = services.open_view_once_media(request.user, message)
        except PermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return HttpResponse(result["content"], content_type=result["content_type"])

    # =========================
    # SCHEDULED MESSAGES ("send later")
    # =========================
    @action(detail=False, methods=["post"], url_path="schedule")
    def schedule(self, request):
        conversation_id = request.data.get("conversation_id")
        scheduled_at_raw = request.data.get("scheduled_at")
        if not conversation_id or not scheduled_at_raw:
            return Response({"error": "conversation_id and scheduled_at are required"}, status=400)

        scheduled_at = parse_datetime(scheduled_at_raw)
        if not scheduled_at:
            return Response({"error": "scheduled_at must be an ISO 8601 datetime"}, status=400)
        if timezone.is_naive(scheduled_at):
            scheduled_at = timezone.make_aware(scheduled_at)

        data = services.schedule_message(
            request.user,
            conversation_id,
            request,
            content=request.data.get("content"),
            scheduled_at=scheduled_at,
            reply_to_id=request.data.get("reply_to"),
        )
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="scheduled")
    def scheduled(self, request):
        qs = services.list_scheduled_messages(
            request.user, conversation_id=request.GET.get("conversation_id")
        )
        return Response(MessageSerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="cancel-schedule")
    def cancel_schedule(self, request, pk=None):
        services.cancel_scheduled_message(request.user, pk)
        return Response({"cancelled": True})

    @action(detail=True, methods=["post"], url_path="send-now")
    def send_now(self, request, pk=None):
        data = services.send_scheduled_now(request.user, pk, request)
        return Response(data)

    # =========================
    # CREATE POLL
    # =========================
    @action(detail=False, methods=["post"], url_path="create-poll")
    def create_poll(self, request):
        conversation_id = request.data.get("conversation_id")
        if not conversation_id:
            return Response({"error": "conversation_id is required"}, status=400)

        message = services.create_poll(
            request.user,
            conversation_id,
            request,
            question=request.data.get("question"),
            options=request.data.get("options", []),
            allows_multiple=bool(request.data.get("allows_multiple", False)),
            description=request.data.get("description", ""),
            anonymous=bool(request.data.get("anonymous", False)),
            allow_adding_options=bool(request.data.get("allow_adding_options", False)),
            allow_revoting=bool(request.data.get("allow_revoting", True)),
            shuffle_options=bool(request.data.get("shuffle_options", False)),
            quiz_mode=bool(request.data.get("quiz_mode", False)),
            correct_option_indices=request.data.get("correct_option_indices", []),
            duration_seconds=request.data.get("duration_seconds"),
        )

        return Response(
            MessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    # =========================
    # VOTE ON A POLL
    # =========================
    @action(detail=True, methods=["post"], url_path="vote")
    def vote(self, request, pk=None):
        message = self.get_object()
        option_ids = request.data.get("option_ids", [])
        if not isinstance(option_ids, list):
            option_ids = [option_ids]

        poll_data = services.vote_poll(request.user, message, option_ids, request=request)
        return Response(poll_data)

    @action(detail=True, methods=["post"], url_path="add-option")
    def add_option(self, request, pk=None):
        message = self.get_object()
        poll_data = services.add_poll_option(
            request.user, message, request, request.data.get("text", "")
        )
        return Response(poll_data)

    # =========================
    # REPORT A MESSAGE
    # =========================
    @action(detail=True, methods=["post"])
    def report(self, request, pk=None):
        message = self.get_object()
        services.report_message(request.user, message, request.data.get("reason"))
        return Response({"message": "Report submitted"}, status=status.HTTP_201_CREATED)

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
    # GLOBAL SEARCH (across every conversation the user is in)
    # =========================
    @action(detail=False, methods=["get"], url_path="global-search")
    def global_search(self, request):
        page = int(request.GET.get("page", 1))
        results = services.global_search_messages(
            request.user, request.GET.get("q", ""), page=page
        )
        return Response(results)

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

        def flag(name, default=True):
            value = request.GET.get(name)
            if value is None:
                return default
            return value.lower() in ("1", "true", "yes")

        export_format = request.GET.get("export_format", "txt").lower()
        if export_format not in ("txt", "html"):
            export_format = "txt"
        include_photos = flag("include_photos")
        include_videos = flag("include_videos")
        include_voice = flag("include_voice")
        include_files = flag("include_files")
        try:
            max_size_mb = float(request.GET.get("max_size_mb") or 0)
        except (TypeError, ValueError):
            max_size_mb = 0
        max_size_bytes = max_size_mb * 1024 * 1024 if max_size_mb > 0 else None

        messages = Message.objects.filter(
            conversation_id=conversation_id, is_deleted=False
        ).select_related("sender").prefetch_related("attachments").order_by("created_at")

        date_from = parse_date(request.GET.get("date_from") or "")
        date_to = parse_date(request.GET.get("date_to") or "")
        if date_from:
            messages = messages.filter(created_at__date__gte=date_from)
        if date_to:
            messages = messages.filter(created_at__date__lte=date_to)

        call_status_labels = {
            Message.CALL_COMPLETED: "completed",
            Message.CALL_DECLINED: "declined",
            Message.CALL_MISSED_OR_CANCELED: "missed/canceled",
        }

        def attachment_allowed(attachment):
            if attachment.file_type == Attachment.IMAGE and not include_photos:
                return False
            if attachment.file_type == Attachment.VIDEO and not include_videos:
                return False
            if attachment.file_type == Attachment.FILE and not include_files:
                return False
            return True

        raw_name = conversation.name or "chat"
        safe_name = "".join(
            c for c in raw_name if c.isalnum() or c in (" ", "-", "_")
        ).strip() or "chat"

        if export_format == "html":
            s3 = get_s3()
            zip_buffer = io.BytesIO()
            zf = zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED)
            used_names = set()

            def unique_filename(folder, original_name, fallback_ext):
                base = os.path.basename(original_name or "") or f"file{fallback_ext}"
                base = "".join(c for c in base if c.isalnum() or c in (" ", "-", "_", ".")).strip() or f"file{fallback_ext}"
                candidate = f"{folder}/{base}"
                n = 1
                while candidate in used_names:
                    name, ext = os.path.splitext(base)
                    candidate = f"{folder}/{name}_{n}{ext}"
                    n += 1
                used_names.add(candidate)
                return candidate

            def bundle_attachment(att, folder, fallback_ext):
                try:
                    obj = s3.get_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=str(att.file))
                    data = obj["Body"].read()
                except Exception:
                    logger.exception("Export: failed to fetch attachment %s", att.id)
                    return None
                local_name = unique_filename(folder, att.original_name, fallback_ext)
                zf.writestr(local_name, data)
                return local_name

            rows = []
            for message in messages:
                timestamp = message.created_at.strftime("%Y-%m-%d %H:%M")
                sender = escape(message.sender.username)
                parts = []

                if message.message_type == Message.SYSTEM:
                    parts.append(f'<div class="system">[{escape(message.content)}]</div>')
                elif message.message_type == Message.CALL:
                    kind = "Video call" if message.call_is_video else "Voice call"
                    status_label = call_status_labels.get(message.call_status, message.call_status)
                    duration = f", {message.call_duration_seconds}s" if message.call_duration_seconds else ""
                    parts.append(f'<div class="system">[{kind} — {status_label}{duration}]</div>')
                elif message.message_type == Message.VOICE:
                    if include_voice:
                        att = message.attachments.first()
                        if att:
                            local_name = bundle_attachment(att, "voice", ".webm")
                            if local_name:
                                parts.append(f'<audio controls src="{escape(local_name)}"></audio>')
                            else:
                                parts.append('<div class="system">[Voice message — download failed]</div>')
                        else:
                            parts.append('<div class="system">[Voice message]</div>')
                    else:
                        parts.append('<div class="system">[Voice message — excluded]</div>')
                else:
                    if message.content:
                        parts.append(f'<div class="text">{escape(message.content)}</div>')
                    for att in message.attachments.all():
                        if not attachment_allowed(att):
                            parts.append(f'<div class="system">[{att.file_type} excluded: {escape(att.original_name)}]</div>')
                            continue
                        if max_size_bytes and att.file_size > max_size_bytes:
                            size_mb = att.file_size / (1024 * 1024)
                            parts.append(f'<div class="system">[File too large ({size_mb:.1f} MB): {escape(att.original_name)}]</div>')
                            continue
                        if att.file_type == Attachment.IMAGE:
                            local_name = bundle_attachment(att, "photos", ".jpg")
                            if local_name:
                                parts.append(f'<img src="{escape(local_name)}" alt="{escape(att.original_name)}">')
                        elif att.file_type == Attachment.VIDEO:
                            local_name = bundle_attachment(att, "videos", ".mp4")
                            if local_name:
                                parts.append(f'<video controls src="{escape(local_name)}"></video>')
                        else:
                            local_name = bundle_attachment(att, "files", "")
                            if local_name:
                                parts.append(f'<a href="{escape(local_name)}">📎 {escape(att.original_name or "file")}</a>')

                if not parts:
                    continue

                rows.append(
                    f'<div class="msg"><div class="meta">{sender} · {timestamp}</div>{"".join(parts)}</div>'
                )

            html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>{escape(raw_name)}</title>
<link rel="stylesheet" href="css/style.css">
</head><body>
<h2>{escape(raw_name)}</h2>
{"".join(rows)}
</body></html>"""

            css = """body { font-family: -apple-system, Segoe UI, sans-serif; background: #0b0f19; color: #e5e7eb; padding: 20px; max-width: 720px; margin: 0 auto; }
.msg { background: #161b28; border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; }
.meta { font-size: 12px; color: #9ca3af; margin-bottom: 6px; }
.text { white-space: pre-wrap; word-break: break-word; }
.system { font-style: italic; color: #9ca3af; }
img, video { max-width: 100%; border-radius: 8px; margin-top: 6px; }
audio { width: 100%; margin-top: 6px; }
a { color: #818cf8; }
"""

            zf.writestr("messages.html", html)
            zf.writestr("css/style.css", css)
            zf.close()
            zip_buffer.seek(0)

            response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
            response["Content-Disposition"] = f'attachment; filename="{safe_name}_export.zip"'
            return response

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
                body = "[Voice message]" if include_voice else "[Voice message — excluded]"
            elif message.attachments.exists():
                allowed_names = [a.original_name or a.file_type for a in message.attachments.all() if attachment_allowed(a)]
                excluded_count = message.attachments.count() - len(allowed_names)
                bits = []
                if allowed_names:
                    bits.append(", ".join(allowed_names))
                if excluded_count:
                    bits.append(f"{excluded_count} attachment(s) excluded")
                body = f"[{message.message_type.capitalize()}: {'; '.join(bits)}]" if bits else f"[{message.message_type.capitalize()}]"
                if message.content:
                    body = f"{message.content} {body}"
            else:
                body = message.content

            lines.append(f"[{timestamp}] {sender}: {body}")

        content = "\n".join(lines)
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


class GifSearchAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.GET.get("q")

        if not query:
            return Response({"error": "q is required"}, status=400)

        try:
            offset = int(request.GET.get("offset", 0))
        except ValueError:
            offset = 0

        try:
            results = search_gifs(query, offset=offset)
        except GiphyError as e:
            return Response({"error": str(e)}, status=422)

        return Response(results)