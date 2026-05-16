import { logger } from './logger.js';

class DiscoveryManager {
  constructor(config, mqttClient) {
    this.config = config;
    this.mqttClient = mqttClient;
  }

  publishDiscovery() {
    logger.info("Publishing Home Assistant Auto Discovery Payloads...");
    
    // Modbus devices
    for (const dev of this.config.devices || []) {
      
      // Connection Status Entity
      const status_object_id = `${dev.id}_status`;
      const status_topic = `homeassistant/binary_sensor/${dev.id}/${status_object_id}/config`;
      const status_state_topic = `modbus2mqtt/${dev.id}/status`;
      
      const status_payload = {
        name: `${dev.name} Status`,
        unique_id: status_object_id,
        state_topic: status_state_topic,
        device_class: "connectivity",
        payload_on: "online",
        payload_off: "offline",
        device: {
          identifiers: [dev.id],
          name: dev.name,
          manufacturer: "Modbus Device"
        }
      };
      this.mqttClient.publish(status_topic, JSON.stringify(status_payload), { retain: true });

      // Registers
      for (const reg of dev.registers || []) {
        const object_id = `${dev.id}_${reg.name.toLowerCase().replace(/\\s+/g, '_')}`;
        const topic = `homeassistant/sensor/${dev.id}/${object_id}/config`;
        const state_topic = `modbus2mqtt/${dev.id}/sensor/${reg.name.toLowerCase().replace(/\\s+/g, '_')}/state`;
        
        const payload = {
          name: `${dev.name} ${reg.name}`,
          unique_id: object_id,
          state_topic: state_topic,
          device: {
            identifiers: [dev.id],
            name: dev.name,
            manufacturer: "Modbus Device"
          }
        };

        if (reg.unit) payload.unit_of_measurement = reg.unit;
        if (reg.device_class) payload.device_class = reg.device_class;
        if (reg.state_class) payload.state_class = reg.state_class;

        this.mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
      }
    }

    // Dummy Helpers
    for (const helper of this.config.helpers || []) {
      const topic = `homeassistant/${helper.type}/${helper.id}/config`;
      const state_topic = `modbus2mqtt/helpers/${helper.id}/state`;
      const command_topic = `modbus2mqtt/helpers/${helper.id}/set`;

      const payload = {
        name: helper.name,
        unique_id: helper.id,
        state_topic: state_topic,
        command_topic: command_topic,
        device: {
          identifiers: ["modbus2mqtt_helpers"],
          name: "Modbus2MQTT Helpers",
          manufacturer: "Modbus2MQTT"
        }
      };

      this.mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
    }
  }
}

export default DiscoveryManager;
