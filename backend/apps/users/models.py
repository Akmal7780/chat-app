from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
import uuid

from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
# =========================
# AVATAR PATH (MinIO 🔥)
# =========================
def user_avatar_path(instance, filename):
    ext = filename.split('.')[-1]

    if instance.id:
        return f"users/{instance.id}/avatar/avatar.{ext}"

    return f"users/temp/{uuid.uuid4()}.{ext}"


# =========================
# USER MODEL
# =========================
class User(AbstractUser):

    id = models.BigAutoField(primary_key=True)

    email = models.EmailField(unique=True)

    avatar = models.ImageField(
        upload_to=user_avatar_path,
        null=True,
        blank=True
    )

    bio = models.TextField(blank=True)

    google_id = models.CharField(max_length=255, blank=True, null=True)

    auth_provider = models.CharField(
        max_length=50,
        default="email"
    )

    # =========================
    # TWO-STEP VERIFICATION (a second password, checked after the normal
    # login password — separate hash, independent of the account password)
    # =========================
    two_step_password = models.CharField(max_length=255, blank=True, null=True)
    two_step_hint = models.CharField(max_length=255, blank=True)
    two_step_recovery_email = models.EmailField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return self.email

    # =========================
    # DELETE OLD AVATAR 🔥
    # =========================
    def save(self, *args, **kwargs):
        try:
            old = User.objects.get(pk=self.pk)
            old_avatar = old.avatar
        except User.DoesNotExist:
            old_avatar = None

        if self.avatar and (not old_avatar or old_avatar != self.avatar):
            try:
                self.avatar.seek(0)

                img = Image.open(self.avatar)

                from PIL import ImageOps
                img = ImageOps.exif_transpose(img)

                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")

                img.thumbnail((200, 200))

                buffer = BytesIO()
                img.save(buffer, format="WEBP", quality=85)

                self.avatar = ContentFile(buffer.getvalue(), name="avatar.webp")

            except Exception as e:
                print("Avatar processing error:", e)

        if old_avatar and self.avatar != old_avatar:
            old_avatar.delete(save=False)

        super().save(*args, **kwargs)


# =========================
# BLOCKED USERS
# =========================
class BlockedUser(models.Model):

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_users"
    )

    blocked_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_by_users"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "blocked_user")

    def __str__(self):
        return f"{self.user_id} blocked {self.blocked_user_id}"


# =========================
# ACTIVE SESSIONS (one row per login/issued access token)
# =========================
class UserSession(models.Model):

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sessions"
    )

    # The access token's own "jti" claim — lets a per-request auth check
    # reject requests carrying a token whose session has been revoked,
    # instead of just cosmetically removing a row from this table.
    jti = models.CharField(max_length=64, unique=True)

    device = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)

    revoked = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["jti"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"{self.user_id} session ({self.device or 'unknown device'})"


# =========================
# PENDING TWO-STEP LOGIN
# =========================
class PendingTwoFactorLogin(models.Model):
    """
    Created once the primary email/password has already been verified for a
    user with Two-Step Verification enabled — holds the login open just long
    enough to collect the second password, without ever issuing real tokens
    for an incomplete login.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pending_two_factor_logins"
    )

    token = models.CharField(max_length=64, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        from django.utils import timezone
        from datetime import timedelta
        return timezone.now() - self.created_at > timedelta(minutes=10)

    def __str__(self):
        return f"Pending 2FA login for {self.user_id}"


# =========================
# USER PRESENCE (ONLINE/OFFLINE)
# =========================
class UserPresence(models.Model):

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="presence"
    )

    last_seen = models.DateTimeField(
        blank=True,
        null=True
    )

    updated_at = models.DateTimeField(auto_now=True)