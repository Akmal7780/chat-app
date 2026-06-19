from django.urls import path
from .views import (
    SuggestReplyAPIView,
    ChatSummaryAPIView,
    TranslateAPIView,
    GrammarFixAPIView,
    RewriteAPIView,
)

urlpatterns = [
    path(
        "suggest-reply/",
        SuggestReplyAPIView.as_view(),
        name="suggest-reply"
    ),

    path(
        "summary/",
        ChatSummaryAPIView.as_view(),
        name="chat-summary"
    ),
    path(
    "translate/",
    TranslateAPIView.as_view(),
    name="translate"
),
    path(
    "grammar-fix/",
    GrammarFixAPIView.as_view(),
    name="grammar-fix"
),

    path(
    "rewrite/",
    RewriteAPIView.as_view(),
    name="rewrite"
),
]