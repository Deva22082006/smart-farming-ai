import os
import json
import sqlite3
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger("terratrace.sync.offline")

class OfflineQueue:
    """
    Disk-backed persistent FIFO queue using SQLite.
    Buffers inference events and leaf images when cloud connectivity is unavailable.
    """

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.db_path))

    def _init_db(self) -> None:
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS offline_events (
                    event_id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    image_blob BLOB,
                    created_at REAL NOT NULL,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            conn.commit()

    def enqueue(self, event_id: str, payload: Dict[str, Any], image_bytes: Optional[bytes] = None) -> None:
        """Stores event and compressed image binary locally."""
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO offline_events (event_id, payload_json, image_blob, created_at, retry_count)
                VALUES (?, ?, ?, ?, 0)
                """,
                (event_id, json.dumps(payload), image_bytes, datetime.now(timezone.utc).timestamp()),
            )
            conn.commit()
        logger.info(f"[OfflineQueue] Enqueued event {event_id}. Total pending: {self.count()}")

    def count(self) -> int:
        """Returns count of pending events in queue."""
        with self._get_conn() as conn:
            cur = conn.execute("SELECT COUNT(*) FROM offline_events")
            row = cur.fetchone()
            return int(row[0]) if row else 0

    def flush(self, supabase_client) -> int:
        """
        Attempts to replay and upload all buffered offline events in chronological order.
        Returns number of successfully flushed events.
        """
        if supabase_client is None:
            return 0

        with self._get_conn() as conn:
            cur = conn.execute("SELECT event_id, payload_json, image_blob FROM offline_events ORDER BY created_at ASC")
            rows = cur.fetchall()

        if not rows:
            return 0

        logger.info(f"[OfflineQueue] Attempting to flush {len(rows)} pending events to Supabase...")
        success_count = 0

        for event_id, payload_json, image_blob in rows:
            payload = json.loads(payload_json)
            try:
                # 1. Upload buffered image if present
                storage_path = payload.get("image_path")
                if image_blob and storage_path:
                    # Clean path from 'leaf-images/' prefix
                    rel_path = storage_path.replace("leaf-images/", "")
                    try:
                        storage_api = getattr(supabase_client.storage, "from_", None) or getattr(supabase_client.storage, "from")
                        storage_api("leaf-images").upload(
                            path=rel_path,
                            file=image_blob,
                            file_options={"content-type": "image/jpeg", "upsert": "true"},
                        )
                    except Exception as upload_err:
                        logger.warning(f"Could not re-upload image for {event_id}: {upload_err}")

                # 2. Insert into inference_events
                res = supabase_client.table("inference_events").upsert(payload).execute()

                # 3. Insert into review_queue if pending
                if payload.get("actuation_status") == "pending_review":
                    review_payload = {
                        "inference_event_id": event_id,
                        "image_path": storage_path,
                        "status": "pending",
                    }
                    supabase_client.table("review_queue").upsert(review_payload).execute()

                # 4. Remove from queue upon success
                with self._get_conn() as conn:
                    conn.execute("DELETE FROM offline_events WHERE event_id = ?", (event_id,))
                    conn.commit()

                success_count += 1
                logger.info(f"[OfflineQueue] Flushed event {event_id} successfully.")

            except Exception as e:
                logger.warning(f"[OfflineQueue] Failed to sync event {event_id}: {e}. Retrying next cycle.")
                with self._get_conn() as conn:
                    conn.execute("UPDATE offline_events SET retry_count = retry_count + 1 WHERE event_id = ?", (event_id,))
                    conn.commit()
                # Stop processing remaining to maintain strict ordering
                break

        return success_count
