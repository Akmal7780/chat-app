import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.notifications.models import Notification
from apps.users.models import UserPresence
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from apps.conversations.models import ConversationParticipant

User = get_user_model()

# Presence lives here (not in ChatConsumer) on purpose: this socket connects
# once per app session, the moment the user opens the app — not per-chat —
# so "online" reflects "the app is open", matching Telegram, instead of
# "a specific conversation happens to be open".
ONLINE_USERS = set()
USER_CONNECTION_COUNT = {}


class NotificationConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.user = self.scope.get("user")

        # ❌ Auth check
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.group_name = f"notifications_{self.user.id}"

        # Join personal notification group
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        await self.accept()

        # 🟢 PRESENCE: this session counts as "online" for as long as the
        # notifications socket stays connected, i.e. for the whole app
        # session — independent of which (if any) chat is currently open.
        await self.channel_layer.group_add("online_users", self.channel_name)
        await self.set_user_online()

        USER_CONNECTION_COUNT[self.user.id] = USER_CONNECTION_COUNT.get(self.user.id, 0) + 1
        ONLINE_USERS.add(self.user.id)

        # Full snapshot goes ONLY to the socket that just connected, sent
        # directly rather than via group_send — a broadcast full-list here
        # would race with other clients' own incremental user_online/
        # user_offline updates (Redis pub/sub gives no cross-message
        # ordering guarantee), so a slightly-stale snapshot could arrive
        # after and silently wipe out a more recent update on someone
        # else's screen. Everyone else only ever gets the one-user delta.
        await self.send(text_data=json.dumps({
            "type": "online_users_list",
            "users": list(ONLINE_USERS),
        }))
        await self.channel_layer.group_send(
            "online_users",
            {
                "type": "user_online",
                "user_id": self.user.id,
                "username": self.user.username,
            },
        )

        # 🔥 Send initial unread count
        count = await self.get_unread_count()
        await self.send(text_data=json.dumps({
            "type": "init",
            "unread_count": count
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name
        )

        if hasattr(self, "user") and self.user and self.user.is_authenticated:
            USER_CONNECTION_COUNT[self.user.id] = USER_CONNECTION_COUNT.get(self.user.id, 1) - 1

            # Only actually go offline once every tab/window for this user
            # has disconnected (mirrors the old per-conversation logic).
            if USER_CONNECTION_COUNT.get(self.user.id, 0) <= 0:
                USER_CONNECTION_COUNT.pop(self.user.id, None)
                ONLINE_USERS.discard(self.user.id)

                await self.update_last_seen()
                await self.channel_layer.group_send("online_users", {
                    "type": "user_offline",
                    "user_id": self.user.id,
                    "username": self.user.username,
                    "last_seen": str(timezone.now()),
                })

            await self.channel_layer.group_discard("online_users", self.channel_name)

    # 🔽 PRESENCE relay handlers (from the "online_users" broadcast group)
    async def user_online(self, event):
        await self.send(text_data=json.dumps({
            "type": "user_online",
            "user_id": event["user_id"],
            "username": event["username"],
        }))

    async def user_offline(self, event):
        await self.send(text_data=json.dumps({
            "type": "user_offline",
            "user_id": event["user_id"],
            "username": event["username"],
            "last_seen": event["last_seen"],
        }))

    @database_sync_to_async
    def set_user_online(self):
        presence, _ = UserPresence.objects.get_or_create(user=self.user)
        presence.last_seen = None
        presence.save(update_fields=["last_seen"])

    @database_sync_to_async
    def update_last_seen(self):
        presence, _ = UserPresence.objects.get_or_create(user=self.user)
        presence.last_seen = timezone.now()
        presence.save(update_fields=["last_seen"])

    # 🔥 MAIN NOTIFICATION EVENT
    async def send_notification(self, event):
        """
        Event from ChatConsumer
        """

        await self.send(text_data=json.dumps({
            "type": "notification",

            # basic
            "notification_type": event.get("notification_type", "message"),
            "text": event.get("text"),
            "content": event.get("content"),

            # message info
            "message_id": event.get("message_id"),
            "conversation_id": event.get("conversation_id"),

            # sender info
            "sender": event.get("sender"),

            "sender_id": event.get("sender_id"),           # 🔥 QO'SHILDI
            "conversation_type": event.get("conversation_type", "private"),  # 🔥

            "message_type": event.get("message_type"),
            "call_status": event.get("call_status"),
            "call_is_video": event.get("call_is_video"),

            "image": event.get("image"),
            "is_mention": event.get("is_mention", False),

            # 🔥 unread count (live update)
            "unread_count": await self.get_unread_count()
        }))

    # 🔥 OPTIONAL: mark as read via websocket
    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            action = data.get("action")

            if action == "mark_as_read":
                conversation_id = data.get("conversation_id")

                await self.mark_notifications_read(conversation_id)

                count = await self.get_unread_count()

                await self.send(text_data=json.dumps({
                    "type": "read_update",
                    "unread_count": count
                }))

            elif action in (
                "call_offer",
                "call_answer",
                "call_ice_candidate",
                "call_end",
                "call_reject",
                "call_busy",
            ):
                await self.handle_call_signal(action, data)

        except Exception as e:
            print("❌ Notification receive error:", e)

    # ========================
    # 🔽 CALL SIGNALING (WebRTC offer/answer/ICE relay for 1:1 calls)
    # ========================

    async def handle_call_signal(self, action, data):
        target_user_id = data.get("target_user_id")
        if not target_user_id or not await self.user_exists(target_user_id):
            return

        target_group = f"notifications_{target_user_id}"

        if action == "call_offer":
            if not await self.calls_allowed(target_user_id):
                await self.send(text_data=json.dumps({
                    "type": "call_unavailable",
                    "target_user_id": target_user_id,
                }))
                return

            await self.channel_layer.group_send(target_group, {
                "type": "incoming_call",
                "from_user_id": self.user.id,
                "from_username": self.user.username,
                "from_display_name": self.user.full_name or "Unknown",
                "conversation_id": data.get("conversation_id"),
                "call_type": data.get("call_type", "audio"),
                "sdp": data.get("sdp"),
            })
        elif action == "call_answer":
            await self.channel_layer.group_send(target_group, {
                "type": "call_answered",
                "from_user_id": self.user.id,
                "sdp": data.get("sdp"),
            })
        elif action == "call_ice_candidate":
            await self.channel_layer.group_send(target_group, {
                "type": "call_ice_candidate",
                "from_user_id": self.user.id,
                "candidate": data.get("candidate"),
            })
        else:  # call_end / call_reject / call_busy
            await self.channel_layer.group_send(target_group, {
                "type": "call_ended",
                "from_user_id": self.user.id,
                "reason": action,
            })

    async def incoming_call(self, event):
        await self.send(text_data=json.dumps({
            "type": "incoming_call",
            "from_user_id": event["from_user_id"],
            "from_username": event["from_username"],
            "from_display_name": event.get("from_display_name") or "Unknown",
            "conversation_id": event.get("conversation_id"),
            "call_type": event.get("call_type", "audio"),
            "sdp": event["sdp"],
        }))

    async def call_answered(self, event):
        await self.send(text_data=json.dumps({
            "type": "call_answered",
            "from_user_id": event["from_user_id"],
            "sdp": event["sdp"],
        }))

    async def call_ice_candidate(self, event):
        await self.send(text_data=json.dumps({
            "type": "call_ice_candidate",
            "from_user_id": event["from_user_id"],
            "candidate": event["candidate"],
        }))

    async def call_ended(self, event):
        await self.send(text_data=json.dumps({
            "type": "call_ended",
            "from_user_id": event["from_user_id"],
            "reason": event.get("reason"),
        }))

    @database_sync_to_async
    def user_exists(self, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        return User.objects.filter(id=user_id).exists()

    @database_sync_to_async
    def calls_allowed(self, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        return User.objects.filter(id=user_id).exclude(calls_visibility=User.VISIBILITY_NOBODY).exists()

    # ========================
    # 🔽 DATABASE FUNCTIONS
    # ========================

    @database_sync_to_async
    def get_unread_count(self):
        return Notification.objects.filter(
            user=self.user,
            is_read=False
        ).count()

    @database_sync_to_async
    def mark_notifications_read(self, conversation_id):
        Notification.objects.filter(
            user=self.user,
            message__conversation_id=conversation_id,
            is_read=False
        ).update(is_read=True)

    