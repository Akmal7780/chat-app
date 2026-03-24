import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from apps.notifications.models import Notification
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from apps.conversations.models import ConversationParticipant

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

            # message info
            "message_id": event.get("message_id"),
            "conversation_id": event.get("conversation_id"),

            # sender info
            "sender": event.get("sender"),

            "sender_id": event.get("sender_id"),           # 🔥 QO'SHILDI
            "conversation_type": event.get("conversation_type", "private"),  # 🔥

            "image": event.get("image"),

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

        except Exception as e:
            print("❌ Notification receive error:", e)

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

    