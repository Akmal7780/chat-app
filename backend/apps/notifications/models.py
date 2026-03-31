from django.db import models
from django.conf import settings
from django.utils import timezone


class Notification(models.Model):

    class NotificationType(models.TextChoices):
        MESSAGE = "message", "Message"
        IMAGE = "image", "Image"
        FILE = "file", "File"
        VIDEO = "video", "Video"
        REACTION = "reaction", "Reaction"
        REPLY = "reply", "Reply"

    id = models.BigAutoField(primary_key=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications"
    )

    message = models.ForeignKey(
        "messaging.Message",
        on_delete=models.CASCADE,
        related_name="notifications"
    )

    type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        default=NotificationType.MESSAGE
    )

    text = models.TextField(blank=True, default="")

    is_read = models.BooleanField(default=False)

    read_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def mark_as_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])

    def __str__(self):
        return f"{self.user} - {self.type} - {self.text}"