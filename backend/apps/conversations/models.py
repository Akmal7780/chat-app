from django.db import models
from django.conf import settings


class Conversation(models.Model):

    PRIVATE = "private"
    GROUP = "group"

    CONVERSATION_TYPES = (
        (PRIVATE, "Private"),
        (GROUP, "Group"),
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

    last_read_message = models.BigIntegerField(
        blank=True,
        null=True
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