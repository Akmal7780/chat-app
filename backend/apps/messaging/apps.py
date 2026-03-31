from django.apps import AppConfig


class MessagesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.messaging'

    def ready(self):
        try:
            from utils.minio import set_bucket_cors
            set_bucket_cors()
        except Exception as e:
            print(f"❌ MinIO CORS setup error: {e}")