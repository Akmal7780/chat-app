from django.db import models
from django.conf import settings


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