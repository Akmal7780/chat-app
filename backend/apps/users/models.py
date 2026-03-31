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