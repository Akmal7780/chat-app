from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
import os

User = get_user_model()

class Command(BaseCommand):
    help = "Create superuser if not exists"

    def handle(self, *args, **kwargs):
        email = os.getenv("DJANGO_SUPERUSER_EMAIL")
        username = os.getenv("DJANGO_SUPERUSER_USERNAME")
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD")

        if not email or not password:
            self.stdout.write(self.style.ERROR("Missing env variables"))
            return

        if not User.objects.filter(email=email).exists():
            User.objects.create_superuser(
                email=email,
                username=username,
                password=password
            )
            self.stdout.write(self.style.SUCCESS("✅ Superuser created"))
        else:
            self.stdout.write("ℹ️ Superuser already exists")