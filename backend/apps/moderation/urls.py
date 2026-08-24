from django.urls import path
from . import views

urlpatterns = [
    path("reports/", views.reports_list),
    path("reports/message/<int:report_id>/resolve/", views.resolve_message_report),
    path("reports/message/<int:report_id>/delete-message/", views.delete_reported_message),
    path("reports/conversation/<int:report_id>/resolve/", views.resolve_conversation_report),
    path("banned-words/", views.banned_words),
    path("banned-words/<int:word_id>/", views.delete_banned_word),
]
