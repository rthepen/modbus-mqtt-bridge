class HelpersManager {
  constructor(config, mqttClient) {
    this.config = config;
    this.mqttClient = mqttClient;
    this.states = {};
  }

  start() {
    for (const helper of this.config.helpers || []) {
      this.states[helper.id] = helper.initial_state || '';
      const state_topic = `modbus2mqtt/helpers/${helper.id}/state`;
      this.mqttClient.publish(state_topic, this.states[helper.id], { retain: true });
    }

    this.mqttClient.on('message', (topic, message) => {
      // Check if command topic for helper
      const match = topic.match(/^modbus2mqtt\/helpers\/(.+)\/set$/);
      if (match) {
        const helperId = match[1];
        if (this.states[helperId] !== undefined) {
          const newState = message.toString();
          this.states[helperId] = newState;
          
          console.log(`Helper ${helperId} updated to ${newState}`);
          
          // Publish new state
          const state_topic = `modbus2mqtt/helpers/${helperId}/state`;
          this.mqttClient.publish(state_topic, newState, { retain: true });
        }
      }
    });

    this.mqttClient.subscribe('modbus2mqtt/helpers/+/set');
  }

  getStates() {
    return this.states;
  }
}

export default HelpersManager;
