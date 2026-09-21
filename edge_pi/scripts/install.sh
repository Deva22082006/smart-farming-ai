#!/bin/bash
# ==============================================================================
# TerraTrace: Raspberry Pi 4 Automated Setup Script
# ==============================================================================

set -e

echo "=================================================="
echo "   TerraTrace Edge Installation for Raspberry Pi 4"
echo "=================================================="

# 1. System packages for modern Debian (Bookworm / Trixie)
echo "[1/4] Installing system dependencies..."
sudo apt update
sudo apt install -y python3-pip python3-venv python3-gpiozero python3-lgpio python3-picamera2 libgl1 libopenblas-dev

# Install native Debian pre-compiled packages for heavy libraries (avoiding pip wheel issues on armhf)
sudo apt install -y python3-onnxruntime python3-opencv python3-pil python3-yaml python3-dotenv python3-pytest || true

# Handles both Bookworm (libglib2.0-0) and Trixie (libglib2.0-0t64)
sudo apt install -y "libglib2.0-0*" || true

# 2. Python environment (using venv with --system-site-packages for native apt modules)
echo "[2/4] Setting up Python dependencies..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EDGE_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -d "$EDGE_DIR/venv" ]; then
    python3 -m venv --system-site-packages "$EDGE_DIR/venv"
fi

source "$EDGE_DIR/venv/bin/activate"
pip install --upgrade pip
# Install remaining pure-Python packages (supabase client)
pip install supabase python-dotenv || true

# 3. Enable GPIO permissions
echo "[3/4] Adding user to gpio and video groups..."
sudo usermod -aG gpio,video "$USER" || true

# 4. Systemd service installation
echo "[4/4] Configuring systemd service..."
SERVICE_FILE="$(dirname "$0")/../systemd/terratrace.service"
if [ -f "$SERVICE_FILE" ]; then
    sudo cp "$SERVICE_FILE" /etc/systemd/system/terratrace.service
    sudo systemctl daemon-reload
    echo "TerraTrace systemd service installed."
    echo "Run 'sudo systemctl enable --now terratrace.service' to start on boot."
fi

echo ""
echo "=================================================="
echo "Installation complete!"
echo "Next steps:"
echo "1. Verify edge_pi/.env contains your Supabase credentials."
echo "2. Run 'python3 scripts/relay_smoke_test.py' to test relay."
echo "3. Run 'python3 scripts/run_once.py' to test the full pipeline."
echo "=================================================="
