import pandas as pd
from io import BytesIO, StringIO
from .minio_client import minio_client, MinioClientWrapper

class DatasetManager:
    def __init__(self, client: MinioClientWrapper):
        self.client = client

    def get_dataset(self, bucket_name: str, split: str, page: int = 1, limit: int = 50):
        """
        Reads metadata.csv from the specified bucket and split (train/test),
        and generates presigned URLs for each audio file.
        Returns paginated results.
        """
        csv_key = f"{split}/metadata.csv"
        try:
            # Get the object from MinIO
            response = self.client.get_object(bucket_name, csv_key)
            csv_content = response.read()
            response.close()
            response.release_conn()

            # Parse CSV
            df = pd.read_csv(BytesIO(csv_content), dtype=str, keep_default_na=False)
            
            # Ensure tags and description columns exist
            if 'tags' not in df.columns:
                df['tags'] = ""
            if 'description' not in df.columns:
                df['description'] = ""
            
            # Aggregate Unique Tags
            unique_tags = set()
            if 'tags' in df.columns:
                for tags_str in df['tags']:
                    if not tags_str: continue # Skip empty strings
                    # Split by comma, strip whitespace
                    current_tags = [t.strip() for t in str(tags_str).split(',') if t.strip()]
                    unique_tags.update(current_tags)
            
            total_items = len(df)
            
            # Pagination Logic
            start_idx = (page - 1) * limit
            end_idx = start_idx + limit
            
            # Slice the dataframe
            paginated_df = df.iloc[start_idx:end_idx].copy()
            
            # Add presigned URL
            def generate_url(s3_uri):
                if not isinstance(s3_uri, str):
                    return None
                prefix = f"s3://{bucket_name}/"
                if s3_uri.startswith(prefix):
                    object_name = s3_uri[len(prefix):]
                    return self.client.get_presigned_url(bucket_name, object_name)
                return None

            paginated_df['audio_url'] = paginated_df['audio'].apply(generate_url)
            
            return {
                "total": total_items,
                "page": page,
                "limit": limit,
                "unique_tags": sorted(list(unique_tags)),
                "data": paginated_df.to_dict(orient="records")
            }

        except Exception as e:
            print(f"Error getting dataset: {e}")
            return {
                "total": 0,
                "page": page,
                "limit": limit,
                "unique_tags": [],
                "data": []
            }

    def update_transcription(self, bucket_name: str, split: str, file_name: str, new_transcription: str, tags: str = None, description: str = None):
        """
        Updates the transcription for a specific file in metadata.csv.
        Note: This is not atomic and not safe for concurrent writes.
        """
        csv_key = f"{split}/metadata.csv"
        try:
            # 1. Download
            response = self.client.get_object(bucket_name, csv_key)
            csv_content = response.read()
            response.close()
            response.release_conn()
            
            df = pd.read_csv(BytesIO(csv_content), dtype=str, keep_default_na=False)
            
            # 2. Update
            # Find row by file_name
            mask = df['file_name'] == file_name
            if not mask.any():
                raise ValueError(f"File {file_name} not found in metadata.")
            
            df.loc[mask, 'transcription'] = new_transcription
            
            if tags is not None:
                if 'tags' not in df.columns:
                    df['tags'] = ""
                df.loc[mask, 'tags'] = tags
                
            if description is not None:
                if 'description' not in df.columns:
                    df['description'] = ""
                df.loc[mask, 'description'] = description
            
            # 3. Upload back
            csv_buffer = StringIO()
            df.to_csv(csv_buffer, index=False)
            new_csv_content = csv_buffer.getvalue().encode('utf-8')
            
            self.client.put_object(
                bucket_name, 
                csv_key, 
                BytesIO(new_csv_content), 
                len(new_csv_content), 
                content_type="text/csv"
            )
            return True
            
        except Exception as e:
            print(f"Error updating transcription: {e}")
            raise e

    def add_audio_record(self, bucket_name: str, split: str, file_name: str, transcription: str, audio_data: bytes, tags: str = None, description: str = None):
        """
        Uploads an audio file and appends it to metadata.csv
        """
        audio_key = f"{split}/audio/{file_name}"
        csv_key = f"{split}/metadata.csv"
        
        try:
            # 1. Upload Audio
            self.client.put_object(
                bucket_name,
                audio_key,
                BytesIO(audio_data),
                len(audio_data),
                content_type="audio/wav"
            )
            
            # 2. Update CSV
            # Download first
            try:
                response = self.client.get_object(bucket_name, csv_key)
                csv_content = response.read()
                response.close()
                response.release_conn()
                df = pd.read_csv(BytesIO(csv_content), dtype=str, keep_default_na=False)
            except Exception:
                # If CSV doesn't exist, create new DataFrame
                df = pd.DataFrame(columns=['file_name', 'audio', 'transcription', 'tags', 'description'])
            
            # Append new row
            new_row = {
                'file_name': file_name,
                'audio': f"s3://{bucket_name}/{audio_key}",
                'transcription': transcription,
                'tags': tags if tags else "",
                'description': description if description else ""
            }
            # Using concatenation instead of append (deprecated)
            df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
            
            # Upload back
            csv_buffer = StringIO()
            df.to_csv(csv_buffer, index=False)
            new_csv_content = csv_buffer.getvalue().encode('utf-8')
            
            self.client.put_object(
                bucket_name, 
                csv_key, 
                BytesIO(new_csv_content), 
                len(new_csv_content), 
                content_type="text/csv"
            )
            return True
            
        except Exception as e:
            print(f"Error adding audio record: {e}")
            raise e

    async def add_bulk_records(self, bucket_name: str, split: str, audio_files: list, metadata_content: bytes):
        """
        Uploads multiple audio files and appends entries from uploaded CSV to metadata.csv
        """
        try:
            # 1. Parse Uploaded CSV
            new_df = pd.read_csv(BytesIO(metadata_content), dtype=str, keep_default_na=False)
            required_cols = {'file_name', 'transcription'}
            if not required_cols.issubset(new_df.columns):
                raise ValueError(f"CSV missing required columns: {required_cols}")

            # 2. Upload Audio Files
            for file in audio_files:
                audio_key = f"{split}/audio/{file.filename}"
                content = await file.read()
                self.client.put_object(
                    bucket_name,
                    audio_key,
                    BytesIO(content),
                    len(content),
                    content_type="audio/wav"
                )

            # 3. Update master metadata.csv
            csv_key = f"{split}/metadata.csv"
            
            # Download existing CSV
            try:
                response = self.client.get_object(bucket_name, csv_key)
                existing_csv_content = response.read()
                response.close()
                response.release_conn()
                master_df = pd.read_csv(BytesIO(existing_csv_content), dtype=str, keep_default_na=False)
            except Exception:
                master_df = pd.DataFrame(columns=['file_name', 'audio', 'transcription'])

            # Prepare new rows
            rows_to_add = []
            for _, row in new_df.iterrows():
                # Check if this file was part of the upload or just a reference
                # Ideally, we verify against `audio_files` names, but for bulk it might be loose.
                # format: s3://{bucket_name}/{split}/audio/{file_name}
                s3_path = f"s3://{bucket_name}/{split}/audio/{row['file_name']}"
                
                new_record = {
                    'file_name': row['file_name'],
                    'audio': s3_path,
                    'transcription': row['transcription'],
                    'tags': row['tags'] if 'tags' in row else "",
                    'description': row['description'] if 'description' in row else ""
                }
                rows_to_add.append(new_record)

            # Append using concat
            if rows_to_add:
                master_df = pd.concat([master_df, pd.DataFrame(rows_to_add)], ignore_index=True)

            # Upload back
            csv_buffer = StringIO()
            master_df.to_csv(csv_buffer, index=False)
            new_csv_content = csv_buffer.getvalue().encode('utf-8')
            
            self.client.put_object(
                bucket_name, 
                csv_key, 
                BytesIO(new_csv_content), 
                len(new_csv_content), 
                content_type="text/csv"
            )
            return len(rows_to_add)

        except Exception as e:
            print(f"Error in bulk upload: {e}")
            raise e

    def delete_rows(self, bucket_name: str, split: str, file_names: list[str]):
        """
        Batch delete rows from metadata.csv and delete associated audio files from MinIO.
        """
        csv_key = f"{split}/metadata.csv"
        try:
            # 1. Download CSV
            response = self.client.get_object(bucket_name, csv_key)
            csv_content = response.read()
            response.close()
            response.release_conn()
            df = pd.read_csv(BytesIO(csv_content), dtype=str, keep_default_na=False)
            
            # 2. Filter out deleted rows
            original_len = len(df)
            df = df[~df['file_name'].isin(file_names)]
            deleted_count = original_len - len(df)
            
            # 3. Upload updated CSV
            csv_buffer = StringIO()
            df.to_csv(csv_buffer, index=False)
            new_csv_content = csv_buffer.getvalue().encode('utf-8')
            
            self.client.put_object(
                bucket_name, 
                csv_key, 
                BytesIO(new_csv_content), 
                len(new_csv_content), 
                content_type="text/csv"
            )

            # 4. Delete Audio Files from MinIO
            # Note: This could be slow if many files. In production, use remove_objects for batch delete.
            # But minio python sdk remove_objects takes a list of DeleteObject.
            from minio.deleteobjects import DeleteObject
            
            objects_to_delete = [DeleteObject(f"{split}/audio/{fname}") for fname in file_names]
            errors = self.client.remove_objects(bucket_name, objects_to_delete)
            for error in errors:
                print(f"Error deleting object {error}")
                
            return deleted_count

        except Exception as e:
            print(f"Error in batch delete: {e}")
            raise e

    def add_tags_batch(self, bucket_name: str, split: str, file_names: list[str], new_tag: str):
        """
        Batch add a tag to multiple rows.
        """
        csv_key = f"{split}/metadata.csv"
        try:
            # 1. Download CSV
            response = self.client.get_object(bucket_name, csv_key)
            csv_content = response.read()
            response.close()
            response.release_conn()
            df = pd.read_csv(BytesIO(csv_content), dtype=str, keep_default_na=False)
            
            # Ensure tags column exists
            if 'tags' not in df.columns:
                df['tags'] = ""
            
            # 2. Update Tags
            mask = df['file_name'].isin(file_names)
            
            def append_tag(existing_tags):
                tags_list = [t.strip() for t in str(existing_tags).split(',') if t.strip()]
                # Handle multiple new tags (comma separated)
                new_tags_list = [t.strip() for t in new_tag.split(',') if t.strip()]
                
                for t in new_tags_list:
                    if t not in tags_list:
                        tags_list.append(t)
                return ", ".join(tags_list)
            
            df.loc[mask, 'tags'] = df.loc[mask, 'tags'].apply(append_tag)
            
            # 3. Upload updated CSV
            csv_buffer = StringIO()
            df.to_csv(csv_buffer, index=False)
            new_csv_content = csv_buffer.getvalue().encode('utf-8')
            
            self.client.put_object(
                bucket_name, 
                csv_key, 
                BytesIO(new_csv_content), 
                len(new_csv_content), 
                content_type="text/csv"
            )
            return int(mask.sum())

        except Exception as e:
            print(f"Error in batch tag update: {e}")
            raise e


    def copy_rows(self, source_bucket: str, target_bucket: str, split: str, file_names: list[str]):
        """
        Copies selected files and metadata from source bucket to target bucket.
        """
        source_csv_key = f"{split}/metadata.csv"
        target_csv_key = f"{split}/metadata.csv"
        
        try:
            # 1. Get Source Metadata
            response = self.client.get_object(source_bucket, source_csv_key)
            source_content = response.read()
            response.close()
            response.release_conn()
            source_df = pd.read_csv(BytesIO(source_content), dtype=str, keep_default_na=False)
            
            # 2. Filter rows
            rows_to_copy = source_df[source_df['file_name'].isin(file_names)].copy()
            
            if rows_to_copy.empty:
                 return 0

            # 3. Copy objects
            successful_files = []
            for _, row in rows_to_copy.iterrows():
                file_name = row['file_name']
                # Assume standard path: split/audio/file_name
                object_name = f"{split}/audio/{file_name}"
                
                try:
                    self.client.copy_object(source_bucket, object_name, target_bucket, object_name)
                    successful_files.append(file_name)
                except Exception as e:
                    print(f"Failed to copy object {object_name}: {e}")

            # 4. Prepare matched rows for Target Metadata
            # Filter only successful
            final_rows = rows_to_copy[rows_to_copy['file_name'].isin(successful_files)].copy()
            
            # Update audio path to target bucket
            final_rows['audio'] = final_rows['file_name'].apply(lambda x: f"s3://{target_bucket}/{split}/audio/{x}")
            
            # 5. Update Target Metadata
            target_df = pd.DataFrame(columns=['file_name', 'audio', 'transcription', 'tags', 'description'])
            try:
                response = self.client.get_object(target_bucket, target_csv_key)
                target_content = response.read()
                response.close()
                response.release_conn()
                target_df = pd.read_csv(BytesIO(target_content), dtype=str, keep_default_na=False)
            except Exception:
                pass # New bucket/dataset
            
            # Append
            target_df = pd.concat([target_df, final_rows], ignore_index=True)
            # Remove duplicates? relying on file_name
            target_df.drop_duplicates(subset=['file_name'], keep='last', inplace=True)
            
            # Upload
            csv_buffer = StringIO()
            target_df.to_csv(csv_buffer, index=False)
            csv_data = csv_buffer.getvalue().encode('utf-8')
            
            self.client.put_object(
                target_bucket,
                target_csv_key,
                BytesIO(csv_data),
                len(csv_data),
                content_type="text/csv"
            )
            
            return len(successful_files)
            
        except Exception as e:
            print(f"Error copying rows: {e}")
            raise e



    def clone_bucket(self, source_bucket: str, target_bucket: str):
        """
        Clones an entire bucket to a new bucket using minio client.
        Assumes target bucket has already been created.
        """
        try:
            # List all objects in source bucket
            objects = self.client.list_objects(source_bucket, recursive=True)
            
            count = 0
            for obj in objects:
                # obj.object_name contains the full path including prefix if any, but since we scan root, it's the full key
                try:
                    self.client.copy_object(source_bucket, obj.object_name, target_bucket, obj.object_name)
                    count += 1
                except Exception as e:
                    print(f"Failed to copy object {obj.object_name}: {e}")

            # We also need to update the 'audio' path in metadata.csv files for the new bucket
            # because the s3:// paths will still point to the old bucket.
            for split in ['train', 'test', 'val']: # common splits
                 csv_key = f"{split}/metadata.csv"
                 try:
                    # check if exists (cheap way might be just try get)
                    response = self.client.get_object(target_bucket, csv_key)
                    content = response.read()
                    response.close()
                    response.release_conn()
                    
                    df = pd.read_csv(BytesIO(content), dtype=str, keep_default_na=False)
                    
                    # Update audio column
                    if 'audio' in df.columns:
                        df['audio'] = df['audio'].astype(str).str.replace(f"s3://{source_bucket}/", f"s3://{target_bucket}/")
                        
                        # Upload back
                        csv_buffer = StringIO()
                        df.to_csv(csv_buffer, index=False)
                        new_content = csv_buffer.getvalue().encode('utf-8')
                        
                        self.client.put_object(
                            target_bucket,
                            csv_key,
                            BytesIO(new_content),
                            len(new_content),
                            content_type="text/csv"
                        )
                 except Exception:
                     # Split might not exist or metadata might not exist
                     pass
            
            return count

        except Exception as e:
            print(f"Error cloning bucket: {e}")
            raise e

dataset_manager = DatasetManager(minio_client)


