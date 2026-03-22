from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings

class User(AbstractUser):

    id = models.BigAutoField(primary_key=True)

    email = models.EmailField(unique=True)

    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)

    bio = models.TextField(blank=True)

    google_id = models.CharField(max_length=255, blank=True, null=True)

    auth_provider = models.CharField(
        max_length=50,
        default="email"
    )

    is_online = models.BooleanField(default=False)

    last_seen = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return self.email

class UserPresence(models.Model):

    ONLINE = "online"
    OFFLINE = "offline"

    STATUS_CHOICES = (
        (ONLINE, "Online"),
        (OFFLINE, "Offline"),
    )

    id = models.BigAutoField(primary_key=True)

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="presence"
    )

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default=OFFLINE
    )

    last_seen = models.DateTimeField(
        blank=True,
        null=True
    )

    def __str__(self):
        return f"{self.user} - {self.status}"