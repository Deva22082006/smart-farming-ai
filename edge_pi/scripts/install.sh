#!/bin/bash
# ==============================================================================
# TerraTrace: Raspberry Pi 4 Automated Setup Script
# ==============================================================================

set -e

echo "=================================================="
echo "   TerraTrace Edge Installation for Raspberry Pi 4"
echo "=================================================="

# 1. System packages
echo "[1/4] Installing system dependencies..."
sudo apt update
sudo apt install -y python3-pip python3-venv libatlas-base-dev libgl1-mesa-glx libglib2.0-0

# 2. Python environment
echo "[2/4] Setting up Python dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r "$(dirname "$0")/../requirements.txt"
python3 -m pip install RPi.GPIO

# 3. Enable GPIO permissions
echo "[3/4] Adding user to gpio and video groups..."
sudo usermod -aG gpio,video "$USER"

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
