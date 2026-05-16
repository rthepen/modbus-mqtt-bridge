#!/bin/bash
set -e

echo "Starting Modbus-MQTT Bridge Installation..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script with sudo."
  exit 1
fi

echo "Updating system packages..."
apt-get update

echo "Installing Git and Curl..."
apt-get install -y git curl

echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "Cloning Repository to /opt/modbus-mqtt-bridge..."
rm -rf /opt/modbus-mqtt-bridge
git clone https://github.com/rthepen/modbus-mqtt-bridge.git /opt/modbus-mqtt-bridge

cd /opt/modbus-mqtt-bridge

echo "Installing backend dependencies..."
npm install --omit=dev

echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Setting up Systemd Service..."
cat <<EOF > /etc/systemd/system/modbus-mqtt-bridge.service
[Unit]
Description=Modbus-MQTT Bridge Service
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/modbus-mqtt-bridge/index.js start
WorkingDirectory=/opt/modbus-mqtt-bridge
Restart=always
User=root
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable modbus-mqtt-bridge
systemctl restart modbus-mqtt-bridge

echo "--------------------------------------------------------"
echo "Installation Complete!"
echo "The Modbus-MQTT Bridge is now running in the background."
echo "Access the web interface at: http://<raspberry-pi-ip>:8080"
echo "Check the service status with: sudo systemctl status modbus-mqtt-bridge"
echo "--------------------------------------------------------"
