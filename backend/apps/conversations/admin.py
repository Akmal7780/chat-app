from django.contrib import admin
from .models import Conversation, ConversationParticipant


admin.site.register(Conversation)
admin.site.register(ConversationParticipant)