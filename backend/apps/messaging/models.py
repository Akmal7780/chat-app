from django.db import models
from django.conf import settings
from apps.conversations.models import Conversation


class Message(models.Model):

    TEXT = "text"
    IMAGE = "image"
    FILE = "file"

    MESSAGE_TYPES = (
        (TEXT, "Text"),
        (IMAGE, "Image"),
        (FILE, "File"),
    )

    id = models.BigAutoField(primary_key=True)

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

    attachment_url = models.URLField(
        blank=True,
        null=True
    )

    is_edited = models.BooleanField(default=False)

    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Message {self.id} from {self.sender}"

class MessageRead(models.Model):

    id = models.BigAutoField(primary_key=True)

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


class TypingIndicator(models.Model):

    id = models.BigAutoField(primary_key=True)

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


class Attachment(models.Model):

    IMAGE = "image"
    VIDEO = "video"
    FILE = "file"

    FILE_TYPES = (
        (IMAGE, "Image"),
        (VIDEO, "Video"),
        (FILE, "File"),
    )

    id = models.BigAutoField(primary_key=True)

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="attachments"
    )

    file = models.FileField(
        upload_to="chat_attachments/",
        null=True,
        blank=True
    )

    file_type = models.CharField(
        max_length=20,
        choices=FILE_TYPES
    )

    file_size = models.IntegerField()

    created_at = models.DateTimeField(auto_now_add=True)

class Reaction(models.Model):

    id = models.BigAutoField(primary_key=True)

    message = models.ForeignKey(
        "messaging.Message",
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