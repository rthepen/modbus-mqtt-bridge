import { logger } from './logger.js';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER_SCRIPT = path.join(__dirname, 'modbus_helper.py');

class ModbusEngine {
  constructor(configManager, mqttClient) {
    this.configManager = configManager;
    this.mqttClient = mqttClient;
    this.timers = [];
    this.statuses = {};
    this.errorCounts = {};
    this.isPolling = false;
    
    this.setupMqttListeners();
  }

  setupMqttListeners() {
    this.mqttClient.on('message', (topic, message) => {
      const parts = topic.split('/');
      if (parts.length === 5 && parts[0] === 'modbus2mqtt' && parts[2] === 'holding' && parts[4] === 'set') {
        const deviceId = parts[1];
        const regName = parts[3];
        const value = parseFloat(message.toString());
        
        const config = this.configManager.getConfig();
        const device = config.devices.find(d => d.id === deviceId);
        if (device) {
          const reg = device.registers.find(r => r.type === 'holding' && r.name.toLowerCase().replace(/\s+/g, '_') === regName);
          if (reg) {
            this.writeRegister(device, reg, value);
          }
        }
      }
    });

    this.mqttClient.subscribe('modbus2mqtt/+/holding/+/set');
  }

  async writeRegister(device, reg, value) {
    logger.info('Writing ' + value + ' to ' + device.name + ' register ' + reg.name);
    
    let rawValue = value;
    if (reg.scale) rawValue = Math.round(value / reg.scale);

    const cmd = 'python3 ' + HELPER_SCRIPT + ' ' + device.ip + ' ' + device.port + ' ' + device.slave_id + ' write ' + reg.address + ' ' + rawValue;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        logger.error('Write failed: ' + (stderr || error.message));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          logger.info('Update success: ' + reg.name + ' = ' + value);
          this.pollAll();
        } else {
          logger.error('Write error: ' + result.error);
        }
      } catch (e) {
        logger.error('Invalid response from write helper');
      }
    });
  }

  async start() {
    logger.info('Modbus Engine starting (Hybrid R/W)...');
    const config = this.configManager.getConfig();
    for (const dev of config.devices || []) {
      this.statuses[dev.id] = 'offline';
      this.errorCounts[dev.id] = 0;
    }

    const interval = config.polling_interval || 5000;
    const timer = setInterval(() => this.pollAll(), interval);
    this.timers.push(timer);
    setTimeout(() => this.pollAll(), 500);
  }

  setStatus(deviceConfig, status) {
    if (this.statuses[deviceConfig.id] !== status) {
      this.statuses[deviceConfig.id] = status;
      logger.info('Device ' + deviceConfig.name + ' is now ' + status);
      const topic = 'modbus2mqtt/' + deviceConfig.id + '/status';
      this.mqttClient.publish(topic, status, { retain: true });
    }
    logger.emit('status', { id: deviceConfig.id, status });
  }

  async pollAll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const config = this.configManager.getConfig();
      for (const deviceConfig of config.devices || []) {
        const cmd = 'python3 ' + HELPER_SCRIPT + ' ' + deviceConfig.ip + ' ' + deviceConfig.port + ' ' + deviceConfig.slave_id + ' read';
        
        const result = await new Promise((resolve) => {
          exec(cmd, (error, stdout, stderr) => {
            if (error) { resolve({ error: stderr || error.message }); return; }
            try { resolve(JSON.parse(stdout)); } catch (e) { resolve({ error: 'JSON Error' }); }
          });
        });

        if (result.input || result.holding) {
          let successCount = 0;
          for (const reg of deviceConfig.registers || []) {
            let dataArray = [];
            let offset = reg.address;

            if (reg.type === 'input') {
              dataArray = result.input || [];
            } else if (reg.type === 'holding') {
              if (offset >= 1000) {
                dataArray = result.holding_high || [];
                offset -= 1000;
              } else {
                dataArray = result.holding || [];
              }
            }

            if (offset < 0 || offset >= dataArray.length) continue;

            // Growatt Specific: Combine two 16-bit registers into one 32-bit value.
            // Address 1 (Ppv) and Address 35 (Output Power) are uint32.
            // The high 16 bits are in the first register, low 16 bits in the second.
            let val = reg.data_type === 'uint32' 
              ? (dataArray[offset] << 16) | dataArray[offset + 1]
              : dataArray[offset];

            if (val !== null && val !== undefined) {
              if (reg.scale !== undefined) val = val * reg.scale;
              const valStr = val.toFixed(2);
              const regIdLower = reg.name.toLowerCase().trim();
              const regType = reg.type || 'input';
              
              const mqttRegId = regIdLower.replace(/\s+/g, '_');
              const topic = 'modbus2mqtt/' + deviceConfig.id + '/' + regType + '/' + mqttRegId + '/state';
              this.mqttClient.publish(topic, valStr, { retain: true });
              
              const idWithSpace = deviceConfig.id + '_' + regIdLower;
              const idWithUnderscore = deviceConfig.id + '_' + mqttRegId;
              
              logger.emit('value', { id: idWithSpace, value: valStr });
              logger.emit('value', { id: idWithUnderscore, value: valStr });
              
              successCount++;
            }
          }
          if (successCount > 0) {
            this.errorCounts[deviceConfig.id] = 0;
            this.setStatus(deviceConfig, 'online');
          }
        } else {
          this.errorCounts[deviceConfig.id]++;
          if (this.errorCounts[deviceConfig.id] >= 3) {
            this.setStatus(deviceConfig, 'offline');
          }
        }
        await new Promise(r => setTimeout(r, 200));
      }
    } finally {
      this.isPolling = false;
    }
  }

  stop() {
    this.timers.forEach(t => clearInterval(t));
  }
}

export default ModbusEngine;
