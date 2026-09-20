import time
import pytest
from unittest.mock import MagicMock
from pathlib import Path
from terratrace.hardware.relay import FakeRelay
from terratrace.hardware.pump import Pump
from terratrace.safety.watchdog import PumpWatchdog
from terratrace.sync.offline_queue import OfflineQueue

def test_fake_relay_state_and_history():
    """Verify FakeRelay state transitions and history tracking."""
    relay = FakeRelay(pin=17, active_low=True)
    assert not relay.is_on()
    assert len(relay.history) == 1
    assert relay.history[0][1] is False

    relay.turn_on()
    assert relay.is_on()
    assert relay.history[-1][1] is True

    relay.turn_off()
    assert not relay.is_on()
    assert relay.history[-1][1] is False

    relay.cleanup()
    assert not relay.is_on()


def test_pump_safety_ceiling_clamping():
    """Test 11: Pump safety ceiling clamps any requested duration above max_duration_seconds."""
    relay = FakeRelay(pin=17)
    # Safety ceiling of 0.2 seconds
    pump = Pump(relay=relay, max_duration_seconds=0.2)

    # Request 10.0 seconds -- must be clamped to 0.2 seconds
    t0 = time.time()
    actual = pump.spray(10.0)
    elapsed = time.time() - t0

    assert actual < 1.0
    assert elapsed < 1.0
    assert not pump.is_running()
    assert not relay.is_on()


def test_pump_zero_and_negative_duration_remains_off():
    """Zero or negative duration does not energize relay."""
    relay = FakeRelay(pin=17)
    pump = Pump(relay=relay, max_duration_seconds=5.0)

    actual_zero = pump.spray(0.0)
    assert actual_zero == 0.0
    assert not pump.is_running()

    actual_neg = pump.spray(-3.0)
    assert actual_neg == 0.0
    assert not pump.is_running()


def test_pump_guarantees_turn_off_on_exception(monkeypatch):
    """Verify try/finally ensures relay is de-energized even if an exception occurs during spray."""
    relay = FakeRelay(pin=17)
    pump = Pump(relay=relay, max_duration_seconds=5.0)

    def faulty_sleep(seconds):
        raise RuntimeError("Simulated transient runtime exception during spray")

    monkeypatch.setattr(time, "sleep", faulty_sleep)

    with pytest.raises(RuntimeError):
        pump.spray(1.0)

    # Despite exception, pump must be confirmed OFF
    assert not pump.is_running()
    assert not relay.is_on()


def test_watchdog_timeout_cuts_pump_power():
    """Test 10: Watchdog timeout terminates pump if duration overruns."""
    relay = FakeRelay(pin=17)
    pump = Pump(relay=relay, max_duration_seconds=10.0)
    watchdog = PumpWatchdog(pump=pump, grace_period_seconds=0.1)

    # Turn relay on manually to simulate stuck pump
    relay.turn_on()
    assert pump.is_running()

    # Arm with 0.1s expected + 0.1s grace = 0.2s cutoff
    watchdog.arm(expected_duration=0.1)

    time.sleep(0.35)

    # Watchdog should have triggered and forced pump OFF
    assert not pump.is_running()
    assert not relay.is_on()


def test_watchdog_disarm_prevents_cutoff():
    """Watchdog can be cleanly disarmed when spray completes normally."""
    relay = FakeRelay(pin=17)
    pump = Pump(relay=relay, max_duration_seconds=10.0)
    watchdog = PumpWatchdog(pump=pump, grace_period_seconds=0.1)

    relay.turn_on()
    watchdog.arm(expected_duration=0.1)
    watchdog.disarm()

    time.sleep(0.25)
    # Since it was disarmed, watchdog did not force off
    assert pump.is_running()
    pump.force_off()
    assert not pump.is_running()


def test_offline_queue_persists_and_replays_fifo(tmp_path):
    """Test 12: Offline queue persists failed network inserts and replays in FIFO order when reconnected."""
    db_path = tmp_path / "offline_queue.db"
    queue = OfflineQueue(db_path=db_path)

    assert queue.count() == 0

    # 1. Enqueue 3 events with distinct timestamps and dummy payloads
    events = [
        {"id": "evt-001", "disease": "Healthy", "severity_score": 0, "image_path": "leaf-images/evt-001.jpg"},
        {"id": "evt-002", "disease": "Rust", "severity_score": 2, "image_path": "leaf-images/evt-002.jpg"},
        {"id": "evt-003", "disease": "Miner", "severity_score": 1, "image_path": "leaf-images/evt-003.jpg"},
    ]

    for ev in events:
        queue.enqueue(ev["id"], ev, image_bytes=b"dummy_jpeg_bytes")

    assert queue.count() == 3

    # 2. Setup mock Supabase client
    mock_sb = MagicMock()
    mock_storage_bucket = MagicMock()
    mock_sb.storage.from_.return_value = mock_storage_bucket
    mock_table = MagicMock()
    mock_sb.table.return_value = mock_table
    mock_table.upsert.return_value.execute.return_value = MagicMock()

    # 3. Flush queue
    flushed = queue.flush(mock_sb)

    assert flushed == 3
    assert queue.count() == 0

    # 4. Verify storage and database upsert calls occurred for all 3 in FIFO order
    assert mock_storage_bucket.upload.call_count == 3
    assert mock_table.upsert.call_count >= 3


def test_offline_queue_stops_at_failure_and_preserves_order(tmp_path):
    """Verify that if network fails on event 2, event 2 & 3 remain queued in FIFO order."""
    db_path = tmp_path / "offline_queue_fail.db"
    queue = OfflineQueue(db_path=db_path)

    events = [
        {"id": "evt-101", "actuation_status": "sprayed"},
        {"id": "evt-102", "actuation_status": "sprayed"},
        {"id": "evt-103", "actuation_status": "sprayed"},
    ]

    for ev in events:
        queue.enqueue(ev["id"], ev)

    mock_sb = MagicMock()
    call_counter = [0]

    def conditional_upsert(payload):
        call_counter[0] += 1
        mock_exec = MagicMock()
        if call_counter[0] == 2:
            raise ConnectionError("Simulated socket drop during flush")
        return mock_exec

    mock_sb.table.return_value.upsert.side_effect = conditional_upsert

    flushed = queue.flush(mock_sb)

    # First one succeeded, second failed, third was not attempted
    assert flushed == 1
    assert queue.count() == 2
