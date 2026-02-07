from minio import Minio
from minio.commonconfig import CopySource
from minio.error import S3Error
import os

class MinioClientWrapper:
    def __init__(self, endpoint, access_key, secret_key, secure=False, external_endpoint=None):
        self.endpoint = endpoint
        self.external_endpoint = external_endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.secure = secure
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure
        )

    def list_buckets(self):
        return self.client.list_buckets()

    def get_presigned_url(self, bucket_name, object_name):
        url = self.client.get_presigned_url("GET", bucket_name, object_name)
        if self.external_endpoint and self.endpoint != self.external_endpoint:
            # Replace internal endpoint with external one for browser access
            return url.replace(self.endpoint, self.external_endpoint)
        return url

    def get_object(self, bucket_name, object_name):
        return self.client.get_object(bucket_name, object_name)

    def put_object(self, bucket_name, object_name, data, length, content_type="application/octet-stream"):
        return self.client.put_object(bucket_name, object_name, data, length, content_type=content_type)
    
    def list_objects(self, bucket_name, prefix=None, recursive=False):
        return self.client.list_objects(bucket_name, prefix=prefix, recursive=recursive)


    def remove_objects(self, bucket_name, objects_iter):
        return self.client.remove_objects(bucket_name, objects_iter)

    def copy_object(self, source_bucket, source_object, target_bucket, target_object):
        source = CopySource(source_bucket, source_object)
        return self.client.copy_object(target_bucket, target_object, source)

    def create_bucket(self, bucket_name):
        if not self.client.bucket_exists(bucket_name):
            self.client.make_bucket(bucket_name)
            return True
        return False

    def update_config(self, endpoint, access_key, secret_key, secure=False, external_endpoint=None):
        self.endpoint = endpoint
        self.external_endpoint = external_endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.secure = secure
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure
        )

# Default configuration from environment variables
# Internal endpoint for backend connection (default to docker service name)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
# External endpoint for browser access (default to localhost)
MINIO_EXTERNAL_ENDPOINT = os.getenv("MINIO_EXTERNAL_ENDPOINT", "localhost:9000")

ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin")
SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "password123")
BUCKET_NAME = "asia-new-bay-dataset"

minio_client = MinioClientWrapper(
    endpoint=MINIO_ENDPOINT,
    access_key=ACCESS_KEY,
    secret_key=SECRET_KEY,
    external_endpoint=MINIO_EXTERNAL_ENDPOINT
)
