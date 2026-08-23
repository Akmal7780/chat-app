from django.db.models import Count, Prefetch, Exists, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce

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
    unread_messages = Message.objects.filter(
        conversation=conversation,
        is_deleted=False,
    ).exclude(
        sender=user,
    ).exclude(
        read_receipts__user=user,
    )

    MessageRead.objects.bulk_create(
        [
            MessageRead(message=message, user=user)
            for message in unread_messages
        ],
        ignore_conflicts=True,
    )
