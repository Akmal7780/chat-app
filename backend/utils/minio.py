# utils/minio.py

import boto3
from django.conf import settings


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name="us-east-1",
    )


def set_bucket_cors():
    s3 = get_s3()
    s3.put_bucket_cors(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["GET", "PUT", "POST"],  # 🔥 FIX
                    "AllowedOrigins": [
                        "http://localhost:5173",
                        "http://127.0.0.1:5173",
                    ],
                    "ExposeHeaders": ["ETag"],  # 🔥 BU SHART
                    "MaxAgeSeconds": 3000,
                }
            ]
        }
    )