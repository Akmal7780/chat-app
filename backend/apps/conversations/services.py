from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Count, Prefetch, Exists, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.messaging.models import Message, MessageRead

from .models import Conversation, ConversationParticipant


def annotated_conversations_for(user):
    """
    The chats-list queryset: every conversation `user` participates in,
    annotated with unread_count/members_count and prefetched with
    participants + last message — so ConversationSerializer never issues
    N+1 queries.

    A correlated Subquery (not a same-query Count annotate) — combining two
    Count(..., distinct=True) annotations over different multi-valued
    relations (participants and messages/read_receipts) in one queryset
    corrupts BOTH counts due to join fan-out, even with distinct=True.
    """
    unread_count_subquery = Message.objects.filter(
        conversation=OuterRef("pk"),
        is_deleted=False,
    ).exclude(
        sender=user
    ).exclude(
        read_receipts__user=user
    ).order_by().values("conversation").annotate(
        cnt=Count("id", distinct=True)
    ).values("cnt")

    # Exists() (a WHERE subquery), not filter(participants__user=user) (a
    # JOIN) — filtering via a join on the same relation that members_count
    # also joins on makes Django reuse that JOIN, silently restricting the
    # Count to just the current user's own row (=1 always).
    is_participant = ConversationParticipant.objects.filter(
        conversation=OuterRef("pk"),
        user=user,
    )

    return Conversation.objects.filter(
        Exists(is_participant)
    ).annotate(
        members_count=Count("participants__user", distinct=True),
        unread_count=Coalesce(
            Subquery(unread_count_subquery, output_field=IntegerField()),
            0,
        ),
    ).prefetch_related(
        Prefetch(
            "participants",
            queryset=ConversationParticipant.objects.select_related("user"),
        ),
        Prefetch(
            "messages",
            queryset=Message.objects.filter(
                is_deleted=False
            ).select_related("sender").order_by("-created_at")[:1],
            to_attr="prefetched_last_message",
        ),
    ).distinct().order_by("-updated_at")


def get_or_create_self_chat(user):
    """
    "Saved Messages": a private conversation with only yourself. Returns
    (conversation, created).

    Exists(), not filter(participants__user=...) — the latter would reuse
    its own join for the Count("participants") annotate below (the same
    members_count/unread_count bug), silently forcing participant_count to
    1 on every match.
    """
    is_participant = ConversationParticipant.objects.filter(
        conversation=OuterRef("pk"),
        user=user,
    )
    existing = Conversation.objects.filter(
        Exists(is_participant),
        type=Conversation.PRIVATE,
    ).annotate(
        participant_count=Count("participants", distinct=True)
    ).filter(participant_count=1).first()

    if existing:
        return existing, False

    conversation = Conversation.objects.create(
        type=Conversation.PRIVATE,
        created_by=user,
    )
    ConversationParticipant.objects.create(
        conversation=conversation,
        user=user,
        role="admin",
    )
    return conversation, True


def find_existing_private_chat(user, other_user):
    return Conversation.objects.filter(
        type=Conversation.PRIVATE,
        participants__user=user,
    ).filter(
        participants__user=other_user,
    ).first()


def set_participant_flag(user, conversation, field, value):
    ConversationParticipant.objects.filter(
        conversation=conversation,
        user=user,
    ).update(**{field: value})


def mark_conversation_read(user, conversation):
    unread_message_ids = list(
        Message.objects.filter(
            conversation=conversation,
            is_deleted=False,
        ).exclude(
            sender=user,
        ).exclude(
            read_receipts__user=user,
        ).values_list("id", flat=True)
    )

    if not unread_message_ids:
        return

    MessageRead.objects.bulk_create(
        [
            MessageRead(message_id=message_id, user=user)
            for message_id in unread_message_ids
        ],
        ignore_conflicts=True,
    )

    # bulk_create above only touches the DB — without this broadcast the
    # sender's own tab never learns these messages were read until they
    # reload (the per-message WS "read" event only fires for messages that
    # scroll into view, which a bulk "mark all as read" bypasses entirely).
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{conversation.id}",
        {
            "type": "messages_read_bulk",
            "message_ids": unread_message_ids,
            "user_id": user.id,
            "username": user.username,
            "read_at": str(timezone.now()),
        },
    )
