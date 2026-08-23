from django.contrib import admin
from .models import Conversation, ConversationParticipant, ChatFolder


admin.site.register(Conversation)
admin.site.register(ConversationParticipant)
admin.site.register(ChatFolder)