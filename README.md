# Modbus-MQTT Bridge for Growatt Inverters

A hybrid Node.js and Python bridge that connects multiple Growatt Inverters to MQTT and provides a real-time web dashboard for monitoring and remote configuration.

## Features

- **Multi-Device Support:** Polls multiple inverters concurrently via a Modbus TCP gateway (e.g., USR-N580).
- **Hybrid Architecture:** Uses Node.js for the high-level logic/web API and a optimized Python helper for robust Modbus RTU-over-TCP communication.
- **32-bit Register Handling:** Automatically combines adjacent 16-bit registers into `uint32` values (essential for Growatt Power/Energy values).
- **Remote Writing:** Change inverter settings (Holding Registers) directly via MQTT or the Web Dashboard.
- **Real-time Dashboard:** A modern React-based UI with live log streaming (SSE) and interactive control fields.
- **Home Assistant Discovery:** Pre-configured for easy integration with Home Assistant.

## Technical Findings (Growatt Specific)

During development, several inverter-specific quirks were identified and handled:

1. **RTU-over-TCP Framing:** Unlike standard Modbus TCP, many Growatt gateways require the RTU framing (including CRC) wrapped inside a TCP packet. This is handled by the Python helper using `FramerType.RTU`.
2. **Register Offsets:** Growatt registers often use a 0-based offset. The `Ppv` (Input Power) starts at address 1 but is a **32-bit value**, meaning it occupies registers 1 and 2. Reading only address 1 results in a `0` value if the power is below 6.5kW.
3. **Block Reading:** To avoid "No Response" timeouts, registers are polled in logical blocks (max 30-40 registers per request) rather than reading the entire range at once.
4. **Holding Register Writing:** Writing to registers (e.g., *Active P Rate*) requires function code 6 or 16. Our bridge supports writing single values via MQTT topics ending in `/set`.

## Installation

1. **Prerequisites:**
   - Node.js v18+
   - Python 3.9+ with `pymodbus` (v3.8.6 recommended)
   - MQTT Broker (e.g., Mosquitto)

2. **Setup:**
   ```bash
   git clone https://github.com/rthepen/modbus-mqtt-bridge.git
   cd modbus-mqtt-bridge
   npm install
   cd frontend && npm install && npm run build
   ```

3. **Configuration:**
   Edit `config.yaml` to define your broker settings and device slave IDs.

4. **Running:**
   ```bash
   node index.js
   ```

## MQTT Structure

- **Status:** `modbus2mqtt/DEVICE_ID/status` -> `online`/`offline`
- **Telemetry:** `modbus2mqtt/DEVICE_ID/input/REGISTER_NAME` -> `value`
- **Control:** `modbus2mqtt/DEVICE_ID/holding/REGISTER_NAME/set` -> `value` (Publish here to write)

## License

MIT
