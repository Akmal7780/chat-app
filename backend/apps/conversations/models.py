from django.db import models
from django.conf import settings
import uuid


def participant_wallpaper_path(instance, filename):
    ext = filename.split(".")[-1]

    if instance.id:
        return f"wallpapers/{instance.conversation_id}/{instance.user_id}/wallpaper.{ext}"

    return f"wallpapers/temp/{uuid.uuid4()}.{ext}"


class Conversation(models.Model):

    PRIVATE = "private"
    GROUP = "group"
    CHANNEL = "channel"

    CONVERSATION_TYPES = (
        (PRIVATE, "Private"),
        (GROUP, "Group"),
        (CHANNEL, "Channel"),
    )

    id = models.BigAutoField(primary_key=True)

    name = models.CharField(max_length=255, blank=True, null=True)

    type = models.CharField(
        max_length=20,
        choices=CONVERSATION_TYPES,
        default=PRIVATE
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_conversations"
    )

    users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="ConversationParticipant",
        related_name="conversations"
    )

    avatar = models.ImageField(
        upload_to="group_avatars/",
        blank=True,
        null=True
    )

    description = models.TextField(blank=True, null=True)

    # Channel-only: public/private visibility + invite link slug (t.me/<slug>).
    # Public channel discovery/search-by-slug isn't built — the slug is
    # stored and shown in the channel info panel, but only existing
    # members can currently open a channel, same as groups.
    is_public = models.BooleanField(default=True)
    invite_slug = models.SlugField(max_length=64, blank=True, null=True, unique=True)

    # Messages older than this many seconds get auto-deleted by a periodic
    # Celery task (see apps/messaging/tasks.py::auto_delete_expired_messages).
    # Null/0 means disabled.
    auto_delete_seconds = models.PositiveIntegerField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        if self.type == self.GROUP and self.name:
            return self.name
        return f"Conversation {self.id}"

class ConversationParticipant(models.Model):

    ADMIN = "admin"
    MEMBER = "member"

    ROLE_CHOICES = (
        (ADMIN, "Admin"),
        (MEMBER, "Member"),
    )

    id = models.BigAutoField(primary_key=True)

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="participants"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_participations"
    )

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default=MEMBER
    )

    joined_at = models.DateTimeField(auto_now_add=True)

    left_at = models.DateTimeField(
        blank=True,
        null=True
    )

    is_muted = models.BooleanField(default=False)

    is_pinned = models.BooleanField(default=False)

    last_read_message = models.BigIntegerField(
        blank=True,
        null=True
    )

    cleared_before = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Messages created before this timestamp are hidden from this user's view (Telegram-style 'Clear history')."
    )

    # =========================
    # PER-USER CHAT WALLPAPER (Telegram-style, visible only to this participant)
    # =========================
    WALLPAPER_DEFAULT = "default"
    WALLPAPER_PRESET = "preset"
    WALLPAPER_IMAGE = "image"

    WALLPAPER_TYPE_CHOICES = (
        (WALLPAPER_DEFAULT, "Default"),
        (WALLPAPER_PRESET, "Preset"),
        (WALLPAPER_IMAGE, "Image"),
    )

    wallpaper_type = models.CharField(
        max_length=20,
        choices=WALLPAPER_TYPE_CHOICES,
        default=WALLPAPER_DEFAULT,
    )

    wallpaper_value = models.CharField(max_length=255, blank=True)

    wallpaper_image = models.ImageField(
        upload_to=participant_wallpaper_path,
        null=True,
        blank=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "user"],
                name="unique_conversation_user"
            )
        ]
        indexes = [
            models.Index(fields=["conversation"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"{self.user} in {self.conversation}"

    def save(self, *args, **kwargs):
        try:
            old_wallpaper_image = ConversationParticipant.objects.get(pk=self.pk).wallpaper_image
        except ConversationParticipant.DoesNotExist:
            old_wallpaper_image = None

        if self.wallpaper_image and (not old_wallpaper_image or old_wallpaper_image != self.wallpaper_image):
            try:
                from PIL import Image, ImageOps
                from io import BytesIO
                from django.core.files.base import ContentFile

                self.wallpaper_image.seek(0)
                img = Image.open(self.wallpaper_image)
                img = ImageOps.exif_transpose(img)

                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")

                img.thumbnail((1280, 1280))

                buffer = BytesIO()
                img.save(buffer, format="WEBP", quality=85)

                self.wallpaper_image = ContentFile(buffer.getvalue(), name="wallpaper.webp")

            except Exception as e:
                print("Wallpaper image processing error:", e)

        if old_wallpaper_image and self.wallpaper_image != old_wallpaper_image:
            old_wallpaper_image.delete(save=False)

        super().save(*args, **kwargs)


class ConversationReport(models.Model):

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="reports"
    )

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversation_reports"
    )

    reason = models.TextField(max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["conversation"]),
            models.Index(fields=["resolved"]),
        ]

    def __str__(self):
        return f"Report on {self.conversation} by {self.reporter}"


class ChatFolder(models.Model):

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_folders"
    )

    name = models.CharField(max_length=50)

    conversations = models.ManyToManyField(
        Conversation,
        related_name="folders",
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} ({self.user})"