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
    
    const configManager = new ConfigManager(options.config);
    const config = configManager.loadConfig();
    
    if (!config) {
      console.error('Failed to start: Cannot load configuration.');
      process.exit(1);
    }
    
    configManager.startWatching();

    const brokerConfig = config.broker || { port: 1883, host: '0.0.0.0' };
    const broker = new MqttBroker(brokerConfig.port, brokerConfig.host);
    await broker.start();

    const internalMqttUrl = 'mqtt://' + (brokerConfig.host === '0.0.0.0' ? '127.0.0.1' : brokerConfig.host) + ':' + brokerConfig.port;
    const mqttClient = mqtt.connect(internalMqttUrl);

    mqttClient.on('connect', () => {
      console.log('Internal MQTT Client connected to Broker');
      
      const discovery = new DiscoveryManager(config, mqttClient);
      discovery.publishDiscovery();

      const modbusEngine = new ModbusEngine(configManager, mqttClient);
      modbusEngine.start();

      const helpersManager = new HelpersManager(config, mqttClient);
      helpersManager.start();

      const webConfig = config.web || { port: 8080, host: '0.0.0.0' };
      const webApi = new WebApi(configManager, helpersManager, mqttClient, webConfig.port, webConfig.host);
      webApi.start();

      configManager.on('configChanged', (newConfig) => {
        console.log('Config changed detected.');
      });
      
      process.on('SIGINT', () => {
        console.log('\nGracefully shutting down...');
        modbusEngine.stop();
        webApi.stop();
        broker.stop();
        process.exit();
      });
    });
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
