import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebApi {
  constructor(configManager, helpersManager, mqttClient, port = 8080, host = '0.0.0.0') {
    this.configManager = configManager;
    this.helpersManager = helpersManager;
    this.mqttClient = mqttClient;
    this.port = port;
    this.host = host;
    this.app = express();
    this.server = null;
    this.sseClients = [];
    
    this.setupRoutes();
    
    logger.on('log', (data) => this.broadcast('log', data));
    logger.on('value', (data) => this.broadcast('value', data));
    logger.on('status', (data) => this.broadcast('status', data));
  }

  broadcast(type, data) {
    const payload = 'data: ' + JSON.stringify({ type, data }) + '\n\n';
    this.sseClients.forEach(client => {
      try { client.write(payload); } catch (e) {}
    });
  }

  setupRoutes() {
    this.app.use(cors());
    this.app.use(express.json());

    this.app.get('/api/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      res.write(': ok\n\n');
      
      const welcome = { level: 'info', msg: 'Dashboard connected to live stream', timestamp: new Date().toISOString() };
      res.write('data: ' + JSON.stringify({ type: 'log', data: welcome }) + '\n\n');

      this.sseClients.push(res);

      const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch(e) {}
      }, 15000);

      req.on('close', () => {
        clearInterval(heartbeat);
        this.sseClients = this.sseClients.filter(client => client !== res);
      });
    });

    this.app.get('/api/config', (req, res) => {
      res.json(this.configManager.getConfig());
    });

    this.app.post('/api/config', (req, res) => {
      const success = this.configManager.saveConfig(req.body);
      if (success) {
        res.json({ success: true, message: "Configuration saved successfully" });
      } else {
        res.status(500).json({ success: false, message: "Failed to save configuration" });
      }
    });

    this.app.get('/api/helpers', (req, res) => {
      res.json(this.helpersManager.getStates());
    });

    // New Write Endpoint
    this.app.post('/api/write', (req, res) => {
      const { deviceId, registerName, value } = req.body;
      if (!deviceId || !registerName || value === undefined) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const topic = `modbus2mqtt/${deviceId}/holding/${registerName.toLowerCase().replace(/\s+/g, '_')}/set`;
      this.mqttClient.publish(topic, value.toString());
      
      logger.info(`Dashboard triggered write: ${topic} = ${value}`);
      res.json({ success: true, topic, value });
    });

    const frontendPath = path.join(__dirname, '../frontend/dist');
    this.app.use(express.static(frontendPath));

    this.app.use((req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        logger.info('Web API & UI started on http://' + this.host + ':' + this.port);
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

export default WebApi;
