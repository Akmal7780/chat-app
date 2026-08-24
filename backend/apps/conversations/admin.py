from django.contrib import admin
from .models import Conversation, ConversationParticipant, ChatFolder, ConversationReport


admin.site.register(Conversation)
admin.site.register(ConversationParticipant)
admin.site.register(ChatFolder)


@admin.register(ConversationReport)
class ConversationReportAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "reporter", "resolved", "created_at")
    list_filter = ("resolved",)
    readonly_fields = ("conversation", "reporter", "reason", "created_at")