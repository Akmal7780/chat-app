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
    VIDEO = "video"
    VOICE = "voice"
    CALL = "call"
    SYSTEM = "system"
    POLL = "poll"

    MESSAGE_TYPES = (
        (TEXT, "Text"),
        (IMAGE, "Image"),
        (FILE, "File"),
        (VIDEO, "Video"),
        (VOICE, "Voice"),
        (CALL, "Call"),
        (SYSTEM, "System"),
        (POLL, "Poll"),
    )

    CALL_MISSED_OR_CANCELED = "missed_or_canceled"
    CALL_DECLINED = "declined"
    CALL_COMPLETED = "completed"

    CALL_STATUSES = (
        (CALL_MISSED_OR_CANCELED, "Missed or canceled"),
        (CALL_DECLINED, "Declined"),
        (CALL_COMPLETED, "Completed"),
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

    forwarded_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="forwards"
    )

    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)

    # Only set when message_type == CALL
    call_status = models.CharField(
        max_length=20,
        choices=CALL_STATUSES,
        null=True,
        blank=True,
    )
    call_is_video = models.BooleanField(null=True, blank=True)
    call_duration_seconds = models.PositiveIntegerField(null=True, blank=True)

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


# =========================
# POLLS
# =========================
class Poll(models.Model):

    message = models.OneToOneField(
        Message,
        on_delete=models.CASCADE,
        related_name="poll"
    )

    question = models.CharField(max_length=255)
    description = models.CharField(max_length=500, blank=True, default="")
    allows_multiple = models.BooleanField(default=False)
    is_closed = models.BooleanField(default=False)
    anonymous = models.BooleanField(default=False)
    allow_adding_options = models.BooleanField(default=False)
    allow_revoting = models.BooleanField(default=True)
    shuffle_options = models.BooleanField(default=False)
    quiz_mode = models.BooleanField(default=False)
    closes_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.question


class PollOption(models.Model):

    poll = models.ForeignKey(
        Poll,
        on_delete=models.CASCADE,
        related_name="options"
    )

    text = models.CharField(max_length=100)
    order = models.PositiveSmallIntegerField(default=0)
    is_correct = models.BooleanField(default=False)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="added_poll_options",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.text


class PollVote(models.Model):

    option = models.ForeignKey(
        PollOption,
        on_delete=models.CASCADE,
        related_name="votes"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="poll_votes"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("option", "user")

    def __str__(self):
        return f"{self.user} voted for {self.option_id}"