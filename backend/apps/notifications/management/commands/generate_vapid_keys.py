import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Command(BaseCommand):
    help = "Generate a VAPID keypair for Web Push and print .env-ready lines."

    def handle(self, *args, **options):
        private_key = ec.generate_private_key(ec.SECP256R1())
        public_key = private_key.public_key()

        private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
        public_raw = public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )

        self.stdout.write(self.style.SUCCESS("Add these to backend/.env:"))
        self.stdout.write(f"VAPID_PUBLIC_KEY={_b64url(public_raw)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={_b64url(private_raw)}")
        self.stdout.write(
            self.style.WARNING(
                "\nAlso add to chat-frontend/.env (the public key only — it's safe client-side):"
            )
        )
        self.stdout.write(f"VITE_VAPID_PUBLIC_KEY={_b64url(public_raw)}")
