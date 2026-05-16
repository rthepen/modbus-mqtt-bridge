import ModbusRTU from "modbus-serial";
import { logger } from './logger.js';

class ModbusEngine {
  constructor(config, mqttClient) {
    this.config = config;
    this.mqttClient = mqttClient;
    this.devices = {};
    this.timers = [];
    this.statuses = {}; // Track 'online' or 'offline'
    this.errorCounts = {};
    this.isPolling = {};
  }

  async start() {
    logger.info("Starting Modbus Engine...");
    for (const dev of this.config.devices || []) {
      this.statuses[dev.id] = 'offline';
      this.errorCounts[dev.id] = 0;
      this.devices[dev.id] = new ModbusRTU();
      
      // Start polling loop
      const interval = this.config.polling_interval || 5000;
      const timer = setInterval(() => this.pollDevice(dev), interval);
      this.timers.push(timer);

      // Perform initial connection attempt immediately
      this.pollDevice(dev);
    }
  }

  setStatus(deviceConfig, status) {
    if (this.statuses[deviceConfig.id] !== status) {
      this.statuses[deviceConfig.id] = status;
      logger.info(`Device ${deviceConfig.name} is now ${status}`);
      
      // Publish to MQTT
      const topic = `modbus2mqtt/${deviceConfig.id}/status`;
      this.mqttClient.publish(topic, status, { retain: true });
      
      // Emit to SSE
      logger.emit('status', { id: deviceConfig.id, status });
    }
  }

  async pollDevice(deviceConfig) {
    if (this.isPolling[deviceConfig.id]) {
      return; // Skip this poll, previous one is still running
    }
    this.isPolling[deviceConfig.id] = true;

    try {
      const client = this.devices[deviceConfig.id];

      if (!client.isOpen) {
        try {
          const isRtuOverTcp = deviceConfig.rtu_over_tcp !== false; // Default to true for USR-N580
          if (isRtuOverTcp) {
            await client.connectTcpRTUBuffered(deviceConfig.ip, { port: deviceConfig.port });
          } else {
            await client.connectTCP(deviceConfig.ip, { port: deviceConfig.port });
          }
          client.setID(deviceConfig.slave_id);
          client.setTimeout(3000);
          this.errorCounts[deviceConfig.id] = 0;
          this.setStatus(deviceConfig, 'online');
        } catch (e) {
          logger.error(`Connection failed for ${deviceConfig.name}: ${e.message}`);
          this.setStatus(deviceConfig, 'offline');
          return;
        }
      }

      let successCount = 0;

      for (const reg of deviceConfig.registers || []) {
        try {
          let val = null;
          if (reg.type === 'input') {
            const res = await client.readInputRegisters(reg.address, reg.data_type === 'uint32' ? 2 : 1);
            if (reg.data_type === 'uint32') {
               val = (res.data[0] << 16) | res.data[1];
            } else {
               val = res.data[0];
            }
          } else if (reg.type === 'holding') {
            const res = await client.readHoldingRegisters(reg.address, reg.data_type === 'uint32' ? 2 : 1);
            if (reg.data_type === 'uint32') {
               val = (res.data[0] << 16) | res.data[1];
            } else {
               val = res.data[0];
            }
          }
          
          if (val !== null) {
            // Apply multiplier and offset
            if (reg.scale !== undefined) val = val * reg.scale;
            if (reg.multiplier !== undefined) val = val * reg.multiplier;
            if (reg.offset !== undefined) val = val + reg.offset;
            
            const regId = reg.name.toLowerCase().replace(/\\s+/g, '_');
            
            // Publish to MQTT
            const topic = `modbus2mqtt/${deviceConfig.id}/sensor/${regId}/state`;
            this.mqttClient.publish(topic, String(val), { retain: true });
            
            // Emit to SSE
            logger.emit('value', { id: `${deviceConfig.id}_${regId}`, value: val });
            
            successCount++;
          }
        } catch (e) {
          logger.error(`Error reading ${reg.name} from ${deviceConfig.name}: ${e.message}`);
        }
      }

      // Watchdog logic
      if (successCount === 0 && (deviceConfig.registers || []).length > 0) {
        this.errorCounts[deviceConfig.id]++;
        if (this.errorCounts[deviceConfig.id] >= 3) {
          logger.warn(`Watchdog triggered for ${deviceConfig.name}. Closing connection.`);
          client.close();
          this.setStatus(deviceConfig, 'offline');
        }
      } else {
        this.errorCounts[deviceConfig.id] = 0;
        this.setStatus(deviceConfig, 'online');
      }
    } finally {
      this.isPolling[deviceConfig.id] = false;
    }
  }

  stop() {
    this.timers.forEach(t => clearInterval(t));
    for (const key in this.devices) {
       this.devices[key].close();
    }
    logger.info("Modbus Engine stopped");
  }
}

export default ModbusEngine;
