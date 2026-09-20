# TerraTrace — Smart Farming AI

> **Autonomous Coffee Leaf Disease Detection, Ordinal Severity Grading & Precision Actuation Mesh**

TerraTrace is an edge-to-cloud agricultural intelligence system built specifically for coffee farmers. It combines **local-first Edge AI** running on a Raspberry Pi 4 with **optocoupler-isolated precision dosing**, **persistent offline resilience**, and a **mobile field companion application** powered by Supabase.

---

## Architecture Overview

TerraTrace operates strictly **local-first**: inference, confidence gating, and spray decisions execute on-device in under 100 milliseconds without waiting for cloud round-trips.

```
+-----------------------------------------------------------------------------------+
|                        TerraTrace Edge Node (Raspberry Pi 4)                      |
|                                                                                   |
|  [ Camera Capture ]                                                               |
|        |                                                                          |
|  [ HSV Leaf Segmentation + ROI Crop + ImageNet Normalization ]                    |
|        |                                                                          |
|  [ Dual-Head ONNX Inference: Disease Logits + CORN Severity Logits ]              |
|        |                                                                          |
|  [ Softmax & CORN Cumulative-Product Ordinal Decoding ]                          |
|        |                                                                          |
|  [ Dual-Threshold Confidence Gate (Disease >= 0.70 & Severity >= 0.70) ]         |
|        |                                                                          |
|        +---- Fails Gate -------> [ Action: PENDING_REVIEW | Pump OFF ]            |
|        |                                                                          |
|        +---- Healthy Plant ----> [ Action: SKIP_HEALTHY   | Pump OFF ]            |
|        |                                                                          |
|        +---- Confident Disease -> [ Action: SPRAY (1.0s - 5.0s per Severity) ]    |
|                                         |                                         |
|                         [ Safe Pump Controller + Watchdog ]                       |
|                                         |                                         |
|                   [ Hardware Abstraction: FakeRelay / RPiRelay ]                 |
|                                         |                                         |
|                   [ GPIO17 -> Optocoupler Relay Ch2 -> 12V Pump ]                |
+-----------------------------------------------------------------------------------+
                                         |
                          (Asynchronous / Offline-Buffered)
                                         v
+-----------------------------------------------------------------------------------+
|                              Supabase Cloud Platform                              |
|                                                                                   |
|  - Storage: private 'leaf-images' bucket (uploads captured frame)                 |
|  - Database: 'inference_events' (logs disease, severity, probabilities, dose)     |
|  - Database: 'review_queue' (routes low-confidence events for agronomist review) |
|  - Database: 'hardware_logs' (tracks startup, shutdowns, pump telemetry)         |
|  - Database: 'dosing_config' (edge pulls calibrated dosing table dynamically)    |
|  - Database: 'devices' (edge updates live heartbeat timestamps)                  |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                           TerraTrace Mobile Application                           |
|                      (React Native / Expo Android APK)                            |
|                                                                                   |
|  - Real-time farm health feed & recent checks                                     |
|  - Severity breakdowns & disease risk charts                                      |
|  - Low-confidence review workflow for farmers & agronomists                       |
|  - Multi-node device monitor & hardware telemetry                                 |
+-----------------------------------------------------------------------------------+
```

---

## Key Features

- **Local-First Edge Vision & Inference**:
  - Runs on-device via `onnxruntime` in ~90ms.
  - Automatically isolates leaf contours using morphological HSV thresholding and crops to the region of interest (ROI).
- **Dual-Head Calibrated AI (`coffee_leaf_model.onnx`)**:
  - **Disease Classification (5 Classes)**: Healthy, Leaf Miner, Rust (*Hemileia vastatrix*), Phoma, Cercospora.
  - **CORN Ordinal Severity Grading (0 to 4)**: Conditional Ordinal Regression for Neural Networks (Healthy, Very Low, Low, High, Very High) preserving ordinal biological progression.
- **Fail-Safe Confidence Gating**:
  - Dual threshold validation (`disease_threshold: 0.70`, `severity_threshold: 0.70`).
  - Low-confidence predictions never spray; instead, they automatically route to the cloud `review_queue` for manual agronomist inspection.
- **Industrial Hardware Safety**:
  - **Fail-Safe Startup**: Bootstraps GPIO pin 17 to safe OFF state immediately on script initialization.
  - **Safety Ceilings**: Hard 10-second maximum spray duration limit enforced by software clamps.
  - **Asynchronous Watchdog**: Background timer forces pump de-energization if execution stalls.
  - **Signal Cutoffs**: `SIGINT`, `SIGTERM`, and `atexit` hooks guarantee actuators are unpowered on shutdown or crash.
- **Offline Resilience via SQLite FIFO Buffer**:
  - When field Wi-Fi or cellular connections drop, all inference events and compressed images buffer to local disk.
  - Upon reconnection, events auto-replay in strict chronological order to Supabase.
- **Multi-Node Farm Scalability**:
  - Deploy multiple autonomous edge nodes (`pi-node-01`, `pi-node-02`) across different plantation plots with distinct telemetry and heartbeat tracking.
- **Farmer-Centric Mobile Application**:
  - Modern Expo/React Native Android app with offline-ready Supabase queries, disease risk summaries, and device status tracking.

---

## Project Structure

```
smart-farming-ai/
├── edge_pi/                      # Raspberry Pi 4 Edge Application
│   ├── config/                   # Settings, confidence thresholds & dosing tables
│   │   ├── settings.yaml         # Device IDs, GPIO pins, safety limits
│   │   ├── confidence_thresholds.json
│   │   ├── dosing_config.json    # Calibrated spray durations (0s, 1s, 2s, 3s, 5s)
│   │   └── secrets.env.example   # Template for cloud credentials
│   ├── models/                   # Dual-head ONNX model
│   │   └── coffee_leaf_model.onnx
│   ├── data/                     # Sample leaf image & local SQLite queue database
│   ├── terratrace/               # Core Python Engine
│   │   ├── capture/              # Camera interfaces (File, Webcam, PiCamera)
│   │   ├── vision/               # HSV segmentation, ROI crop, ONNX inference, CORN decode
│   │   ├── decision/             # Confidence gating & precision dosing engine
│   │   ├── hardware/             # Hardware abstraction (FakeRelay vs RPiRelay, Pump)
│   │   ├── safety/               # Watchdog timer & fail-safe shutdown handlers
│   │   ├── sync/                 # Supabase client, offline queue, loggers
│   │   └── orchestration/        # Pipeline coordinator & connectivity guard
│   ├── scripts/                  # Standalone tools
│   │   ├── run_once.py           # Single-cycle diagnostic simulation
│   │   ├── relay_smoke_test.py   # Electrical relay click verification
│   │   ├── emergency_stop.py     # Instant hardware cutoff utility
│   │   └── install.sh            # Debian/Raspberry Pi setup script
│   ├── systemd/                  # Background service unit (terratrace.service)
│   ├── tests/                    # Automated pytest test suite (18 unit/safety tests)
│   └── main.py                   # Main CLI entrypoint
│
├── app_frontend/                 # React Native / Expo Mobile Application
│   ├── app/                      # Expo Router screens (tabs: index, checks, review, others)
│   ├── components/               # Agricultural UI design system & components
│   ├── constants/                # Theme, color palettes, status badges
│   ├── hooks/                    # Supabase live query & storage signed URL hooks
│   ├── lib/                      # Supabase client & TypeScript data types
│   └── eas.json                  # EAS Android APK build configuration
│
└── supabase/                     # Cloud Backend
    ├── config.toml               # Local development configuration
    └── migrations/               # PostgreSQL schemas, RLS policies, and seed data
```

---

## Hardware Specification & Wiring

| Component | Specification | Connection Details |
|---|---|---|
| **SBC** | Raspberry Pi 4 Model B (2GB+ RAM) | Running Raspberry Pi OS (64-bit) |
| **Relay Module** | 2-Channel 5V Relay with Optocoupler Isolation | Active LOW logic |
| **Actuator** | 12V Precision Diaphragm / Dosing Pump | Connected via Relay Channel 2 |
| **Power Supply** | 12V 2A+ DC Power Adapter | Powers pump circuit |

### GPIO Pinout (Raspberry Pi Header):
- **VCC (Relay)** &rarr; Physical Pin 2 (5V DC)
- **GND (Relay)** &rarr; Physical Pin 6 (Ground)
- **IN2 (Channel 2)** &rarr; Physical Pin 11 (**BCM GPIO 17**)

### High-Voltage / 12V Circuit:
- **12V Supply (+)** &rarr; Relay Terminal **COM2**
- **Relay Terminal NO2 (Normally Open)** &rarr; 12V Pump (+) wire
- **12V Supply (-)** &rarr; 12V Pump (-) wire

---

## Getting Started

### 1. Edge Node (Simulation on Windows / Linux / macOS)

```bash
cd edge_pi

# Install Python dependencies
pip install -r requirements.txt

# Configure credentials
cp config/secrets.env.example .env
# Edit .env and enter your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

# Run the automated 18-test safety and verification suite
python -m pytest tests -v

# Run a single end-to-end diagnostic cycle
python scripts/run_once.py

# Run continuous monitoring (with 30s interval)
python main.py --interval 30 --image data/sample_leaf.jpg
```

### 2. Edge Node Deployment on Physical Raspberry Pi 4

```bash
cd ~/smart-farming-ai/edge_pi

# Run the automated installer
chmod +x scripts/install.sh
./scripts/install.sh

# Test the electrical relay coil (you will hear an audible click)
python3 scripts/relay_smoke_test.py

# Enable the systemd background daemon
sudo systemctl enable terratrace
sudo systemctl start terratrace

# Monitor live service telemetry
journalctl -u terratrace -f
```

### 3. Mobile Application (React Native / Expo)

```bash
cd app_frontend

# Install dependencies
npm install

# Start development server
npx expo start

# Build release APK locally
cd android && ./gradlew assembleRelease
```

---

## Testing & Validation Suite

The edge system includes a comprehensive **18-scenario test suite** (`pytest edge_pi/tests`):

1. **CORN Severity Formulation**: Proves cumulative-product ordinal formulation maps accurately to levels 0 through 4.
2. **Softmax Probabilities**: Validates disease logits normalize into a strictly bounded probability distribution.
3. **Dual Confidence Gating**: Verifies predictions with sub-threshold disease or severity confidences are blocked.
4. **Healthy Plant Safety**: Guarantees healthy classifications trigger zero pump runtime (`SKIP -- HEALTHY`).
5. **Review Queue Routing**: Validates low-confidence detections route to the cloud review queue without spraying.
6. **Calibrated Actuation**: Tests that diseased plants select exact dosage durations (1.0s to 5.0s) matching severity.
7. **Hardware Safety Ceilings**: Verifies pump controller clamps any overrun request to safety limits.
8. **Watchdog Cutoff**: Confirms asynchronous background watchdog forcibly terminates pump if execution stalls.
9. **Fail-Safe Cleanup**: Proves `try/finally` logic de-energizes the relay even if an unhandled runtime exception occurs.
10. **Offline Replay**: Verifies SQLite queue stores events during connection drops and replays them in FIFO order.

---

## Technology Stack

- **Edge Computing**: Python 3.10+, ONNX Runtime, OpenCV, NumPy, RPi.GPIO
- **Mobile Frontend**: React Native, Expo Router, TypeScript, Reanimated, Lucide Icons
- **Cloud & Database**: Supabase (PostgreSQL, Realtime, Storage, Row-Level Security)
- **Actuation & Hardware**: 12V Diaphragm Pump, 5V Optocoupler Relay, Raspberry Pi 4 Model B
