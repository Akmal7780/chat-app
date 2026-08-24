from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from .models import Conversation, ConversationParticipant, ChatFolder, ConversationReport
from .serializers import ConversationSerializer, ConversationParticipantSerializer, ChatFolderSerializer
from . import services

User = get_user_model()


class ConversationViewSet(viewsets.ModelViewSet):

    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return services.annotated_conversations_for(self.request.user)

    def create(self, request, *args, **kwargs):

        conversation_type = request.data.get("type", "private")
        participant_id = request.data.get("participant_id")

        # PRIVATE CHAT VALIDATION
        if conversation_type == "private":

            if not participant_id:
                return Response(
                    {"error": "participant_id required"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                participant = User.objects.get(id=participant_id)
            except User.DoesNotExist:
                return Response(
                    {"error": "User not found"},
                    status=status.HTTP_404_NOT_FOUND
                )

            if participant.id != request.user.id:
                # local import avoids a circular import at module load time
                from apps.users.models import BlockedUser
                blocked = BlockedUser.objects.filter(
                    Q(user=request.user, blocked_user=participant) |
                    Q(user=participant, blocked_user=request.user)
                ).exists()
                if blocked:
                    return Response(
                        {"error": "Cannot start a conversation with this user"},
                        status=status.HTTP_403_FORBIDDEN
                    )

            # "Saved Messages": a private conversation with only yourself.
            # Handled separately because the two-participant lookup below
            # (participants__user=request.user AND participants__user=participant)
            # is trivially satisfied by ANY of the user's private chats when
            # participant == request.user, since both conditions are identical —
            # it would return an unrelated 1:1 chat instead of the self-chat.
            if participant.id == request.user.id:
                conversation, created = services.get_or_create_self_chat(request.user)
                serializer = self.get_serializer(conversation)
                return Response(
                    serializer.data,
                    status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
                )

            # existing private chat between the two different users
            existing = services.find_existing_private_chat(request.user, participant)

            if existing:
                serializer = self.get_serializer(existing)
                return Response(serializer.data)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        conversation = serializer.save(created_by=request.user)

        serializer = self.get_serializer(conversation)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        conversation = self.get_object()

        if conversation.type in (Conversation.GROUP, Conversation.CHANNEL):
            participant = ConversationParticipant.objects.filter(
                conversation=conversation, user=request.user
            ).first()

            if not participant or participant.role != "admin":
                return Response(
                    {"error": "Only admins can edit this conversation"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        return super().update(request, *args, **kwargs)

    # ===============================
    # ADD MEMBER TO GROUP
    # ===============================

    @action(detail=True, methods=["post"])
    def add_member(self, request, pk=None):

        conversation = self.get_object()
        user_id = request.data.get("user_id")

        if not user_id:
            return Response(
                {"error": "user_id required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # user already member
        if ConversationParticipant.objects.filter(
            conversation=conversation,
            user=user
        ).exists():
            return Response(
                {"error": "User already in group"},
                status=status.HTTP_400_BAD_REQUEST
            )

        ConversationParticipant.objects.create(
            conversation=conversation,
            user=user,
            role="member"
        )

        return Response({"message": "User added"})

    # ===============================
    # REMOVE MEMBER
    # ===============================

    @action(detail=True, methods=["delete"], url_path="remove-member/(?P<user_id>[^/.]+)")
    def remove_member(self, request, pk=None, user_id=None):

        conversation = self.get_object()

        try:
            participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user_id=user_id
            )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {"error": "Participant not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        participant.delete()

        return Response({"message": "User removed"})
    # ===============================
# GET GROUP MEMBERS
# ===============================

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):

        conversation = self.get_object()

        if conversation.type not in (Conversation.GROUP, Conversation.CHANNEL):
            return Response(
                {"error": "Members list only available for group/channel chats"},
                status=status.HTTP_400_BAD_REQUEST
            )

        participants = ConversationParticipant.objects.filter(
            conversation=conversation
        ).select_related("user")

        serializer = ConversationParticipantSerializer(participants, many=True)

        return Response(serializer.data)

    # ===============================
    # PIN / MUTE / MARK READ (per-user chats-list state)
    # ===============================

    def _set_own_participant_flag(self, request, field, value):
        conversation = self.get_object()
        services.set_participant_flag(request.user, conversation, field, value)

        # Re-fetch through get_queryset() so the annotated/prefetched fields
        # (unread_count, participants) reflect the update we just made —
        # the `conversation` instance above still holds pre-update state.
        conversation = self.get_queryset().get(pk=conversation.pk)
        serializer = self.get_serializer(conversation)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def pin(self, request, pk=None):
        return self._set_own_participant_flag(request, "is_pinned", True)

    @action(detail=True, methods=["post"])
    def unpin(self, request, pk=None):
        return self._set_own_participant_flag(request, "is_pinned", False)

    @action(detail=True, methods=["post"])
    def mute(self, request, pk=None):
        return self._set_own_participant_flag(request, "is_muted", True)

    @action(detail=True, methods=["post"])
    def unmute(self, request, pk=None):
        return self._set_own_participant_flag(request, "is_muted", False)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        conversation = self.get_object()
        services.mark_conversation_read(request.user, conversation)

        conversation = self.get_queryset().get(pk=conversation.pk)
        serializer = self.get_serializer(conversation)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        conversation = self.get_object()

        if conversation.type not in (Conversation.GROUP, Conversation.CHANNEL):
            return Response(
                {"error": "Can only leave group/channel chats"},
                status=status.HTTP_400_BAD_REQUEST
            )

        ConversationParticipant.objects.filter(
            conversation=conversation, user=request.user
        ).delete()

        return Response({"message": "Left conversation"})

    @action(detail=True, methods=["post"], url_path="clear-history")
    def clear_history(self, request, pk=None):
        return self._set_own_participant_flag(request, "cleared_before", timezone.now())

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None):
        conversation = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"error": "A reason is required"}, status=status.HTTP_400_BAD_REQUEST)

        ConversationReport.objects.create(
            conversation=conversation,
            reporter=request.user,
            reason=reason[:1000],
        )
        return Response({"message": "Report submitted"}, status=status.HTTP_201_CREATED)

    # ===============================
    # PUBLIC CHANNEL DISCOVERY
    # ===============================

    @action(detail=False, methods=["get"])
    def public(self, request):
        search = request.query_params.get("search", "").strip()

        queryset = Conversation.objects.filter(type=Conversation.CHANNEL, is_public=True)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(invite_slug__icontains=search)
            )

        queryset = queryset.order_by("name")[:30]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def join(self, request, pk=None):
        # Bypasses get_queryset()/get_object() on purpose: a public channel
        # the user hasn't joined yet is not in their own conversations list,
        # so the normal participant-scoped lookup would 404 it.
        try:
            conversation = Conversation.objects.get(
                pk=pk, type=Conversation.CHANNEL, is_public=True
            )
        except Conversation.DoesNotExist:
            return Response({"error": "Public channel not found"}, status=status.HTTP_404_NOT_FOUND)

        if ConversationParticipant.objects.filter(conversation=conversation, user=request.user).exists():
            return Response({"error": "Already a member"}, status=status.HTTP_400_BAD_REQUEST)

        ConversationParticipant.objects.create(
            conversation=conversation, user=request.user, role="member"
        )

        serializer = self.get_serializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ConversationParticipantViewSet(viewsets.ModelViewSet):

    serializer_class = ConversationParticipantSerializer
    permission_classes = [IsAuthenticated]

    queryset = ConversationParticipant.objects.all()

    def get_queryset(self):
        return ConversationParticipant.objects.filter(
            conversation__participants__user=self.request.user
        ).distinct()


class ChatFolderViewSet(viewsets.ModelViewSet):

    serializer_class = ChatFolderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ChatFolder.objects.filter(user=self.request.user).prefetch_related("conversations")