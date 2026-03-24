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

    # Kimga notification keladi
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications"
    )

    # Qaysi message sabab bo‘ldi
    message = models.ForeignKey(
        "messaging.Message",
        on_delete=models.CASCADE,
        related_name="notifications"
    )

    # 🔥 Notification turi
    type = models.CharField(
        max_length=20,
        choices=NotificationType.choices,
        default=NotificationType.MESSAGE
    )

    # 🔥 Notification text (frontend uchun tayyor matn)
    text = models.TextField(blank=True, default="")

    # O‘qilgan yoki yo‘q
    is_read = models.BooleanField(default=False)

    # Qachon o‘qilgan
    read_at = models.DateTimeField(null=True, blank=True)

    # Qachon yaratilgan
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def mark_as_read(self):
        """Notificationni o‘qilgan qilish"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])

    def __str__(self):
        return f"{self.user} - {self.type} - {self.text}"