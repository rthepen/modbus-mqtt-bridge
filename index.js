#!/usr/bin/env node

import { program } from 'commander';
import mqtt from 'mqtt';
import ConfigManager from './src/configManager.js';
import MqttBroker from './src/mqttBroker.js';
import ModbusEngine from './src/modbusEngine.js';
import DiscoveryManager from './src/discovery.js';
import HelpersManager from './src/helpers.js';
import WebApi from './src/webApi.js';

program
  .name('modbus-mqtt-bridge')
  .description('A standalone Modbus TCP to MQTT Bridge with built-in Broker and Web UI')
  .version('1.0.0');

program.command('start')
  .description('Start the bridge and broker')
  .option('-c, --config <path>', 'Path to config.yaml', 'config.yaml')
  .action(async (options) => {
    console.log('Starting Modbus-MQTT Bridge...');
    
    // 1. Load config
    const configManager = new ConfigManager(options.config);
    const config = configManager.loadConfig();
    
    if (!config) {
      console.error('Failed to start: Cannot load configuration.');
      process.exit(1);
    }
    
    configManager.startWatching();

    // 2. Start MQTT Broker
    const brokerConfig = config.broker || { port: 1883, host: '0.0.0.0' };
    const broker = new MqttBroker(brokerConfig.port, brokerConfig.host);
    await broker.start();

    // 3. Connect Internal MQTT Client
    const internalMqttUrl = `mqtt://${brokerConfig.host === '0.0.0.0' ? '127.0.0.1' : brokerConfig.host}:${brokerConfig.port}`;
    const mqttClient = mqtt.connect(internalMqttUrl);

    mqttClient.on('connect', () => {
      console.log('Internal MQTT Client connected to Broker');
      
      // 4. HA Auto Discovery
      const discovery = new DiscoveryManager(config, mqttClient);
      discovery.publishDiscovery();

      // 5. Modbus Engine
      const modbusEngine = new ModbusEngine(config.modbus, mqttClient);
      modbusEngine.start();

      // 6. Helpers (Dummy devices)
      const helpersManager = new HelpersManager(config, mqttClient);
      helpersManager.start();

      // 7. Web API & UI
      const webConfig = config.web || { port: 8080, host: '0.0.0.0' };
      const webApi = new WebApi(configManager, helpersManager, webConfig.port, webConfig.host);
      webApi.start();

      // Restart on config change
      configManager.on('configChanged', (newConfig) => {
        console.log('Config changed, applying new config...');
        modbusEngine.stop();
        webApi.stop();
        
        // Very basic restart, ideally you'd gracefully swap instances
        console.log('For deep config changes, please restart the service manually right now.');
      });
      
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\\nGracefully shutting down from SIGINT (Ctrl-C)');
        modbusEngine.stop();
        webApi.stop();
        broker.stop();
        process.exit();
      });
    });
  });

program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
