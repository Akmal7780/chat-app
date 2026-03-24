from django.urls import path
from . import views

urlpatterns = [

    # 🔔 Get all notifications
    path("", views.get_notifications, name="get_notifications"),

    # 🔔 Unread count (badge uchun)
    path("unread-count/", views.unread_count, name="unread_count"),

    # 🔔 Mark all as read (conversation bo‘yicha)
    path("mark-read/", views.mark_as_read, name="mark_as_read"),

    # 🔔 Mark single notification
    path("mark-one/<int:notification_id>/", views.mark_one_as_read, name="mark_one"),

    # 🔔 Delete notification
    path("<int:notification_id>/", views.delete_notification, name="delete_notification"),
]