# Modbus-MQTT Bridge

Een standalone alles-in-een applicatie voor de Raspberry Pi 3B (en nieuwer) die fungeert als:
- MQTT Broker (luistert standaard op poort 1883)
- Modbus TCP naar MQTT Bridge
- Home Assistant MQTT Auto Discovery service
- Web Interface voor beheer

## Installatie op Raspberry Pi

1. Zorg dat Node.js is geïnstalleerd (Node.js 18 of hoger aanbevolen):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. Kopieer deze projectmap naar de Raspberry Pi (bijv. naar `/home/pi/modbus-mqtt-bridge`).

3. Installeer de afhankelijkheden in de hoofdmap:
   ```bash
   cd /home/pi/modbus-mqtt-bridge
   npm install
   ```

## Opstarten

Om het programma te starten:
```bash
node index.js start
```

Dit start de ingebouwde MQTT Broker (1883), de Web API en Frontend (8080) en de Modbus polling engine.

## Configuratie

Alle instellingen, modbus apparaten en "dummy helpers" (virtuele switches voor Home Assistant) staan in `config.yaml`.
Je kunt deze bewerken via:
1. De Web Interface (`http://<ip-van-pi>:8080/`)
2. Met een teksteditor in de terminal: `nano config.yaml`

Als je `config.yaml` handmatig aanpast, herstart dan de service.

## Home Assistant Integratie

Zorg dat de **MQTT integratie** in Home Assistant is verbonden met het IP-adres van je Raspberry Pi op poort 1883.
Deze bridge stuurt automatisch "Auto Discovery" berichten naar Home Assistant, waardoor alle modbus registers en dummy helpers direct als apparaten in Home Assistant verschijnen zonder verdere configuratie.

## Web Interface

Ga naar `http://<ip-van-pi>:8080` in je browser. Hier zie je:
- De geconfigureerde Modbus apparaten.
- De actuele status van je dummy helpers.
- Een YAML editor om eenvoudig instellingen aan te passen.

## Draaien als achtergrond service (systemd)

Om te zorgen dat het programma altijd draait op de Raspberry Pi:

1. Maak een service file aan:
   ```bash
   sudo nano /etc/systemd/system/modbus-bridge.service
   ```

2. Plak dit erin (pas de paden aan indien nodig):
   ```ini
   [Unit]
   Description=Modbus-MQTT Bridge
   After=network.target

   [Service]
   ExecStart=/usr/bin/node /home/pi/modbus-mqtt-bridge/index.js start
   WorkingDirectory=/home/pi/modbus-mqtt-bridge
   Restart=always
   User=pi
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

3. Herlaad en start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable modbus-bridge
   sudo systemctl start modbus-bridge
   sudo systemctl status modbus-bridge
   ```
