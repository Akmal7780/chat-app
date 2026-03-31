from django.db import models
from django.conf import settings
from apps.conversations.models import Conversation
import uuid




# =========================
# MESSAGE MODEL
# =========================
class Message(models.Model):

    TEXT = "text"
    IMAGE = "image"
    FILE = "file"

    MESSAGE_TYPES = (
        (TEXT, "Text"),
        (IMAGE, "Image"),
        (FILE, "File"),
    )

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages"
    )

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages"
    )

    message_type = models.CharField(
        max_length=20,
        choices=MESSAGE_TYPES,
        default=TEXT
    )

    content = models.TextField(blank=True)

    reply_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies"
    )

    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Message {self.id} from {self.sender}"


# =========================
# ATTACHMENT MODEL 🔥
# =========================
class Attachment(models.Model):

    IMAGE = "image"
    VIDEO = "video"
    FILE = "file"

    FILE_TYPES = (
        (IMAGE, "Image"),
        (VIDEO, "Video"),
        (FILE, "File"),
    )

    scan_status = models.CharField(max_length=20, default="pending")

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="attachments"
    )
    original_name = models.CharField(max_length=255, blank=True)
    file = models.CharField(max_length=500)

    file_type = models.CharField(
        max_length=20,
        choices=FILE_TYPES
    )

    file_size = models.PositiveIntegerField()

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.file_type} for message {self.message.id}"

    @property
    def file_url(self):
        from utils.minio import get_s3
        from django.conf import settings

        s3 = get_s3()

        return s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": self.file,
            },
            ExpiresIn=settings.MINIO_URL_EXPIRY
        )


# =========================
# READ RECEIPTS
# =========================
class MessageRead(models.Model):

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="read_receipts"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="read_messages"
    )

    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user")

    def __str__(self):
        return f"{self.user} read message {self.message_id}"


# =========================
# TYPING INDICATOR
# =========================
class TypingIndicator(models.Model):

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="typing_indicators"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="typing_status"
    )

    started_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("conversation", "user")

    def __str__(self):
        return f"{self.user} typing in {self.conversation}"


# =========================
# REACTIONS
# =========================
class Reaction(models.Model):

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="reactions"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reactions"
    )

    emoji = models.CharField(max_length=10)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user")

    def __str__(self):
        return f"{self.user} reacted {self.emoji} to {self.message_id}"