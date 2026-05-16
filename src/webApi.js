import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WebApi {
  constructor(configManager, helpersManager, port = 8080, host = '0.0.0.0') {
    this.configManager = configManager;
    this.helpersManager = helpersManager;
    this.port = port;
    this.host = host;
    this.app = express();
    this.server = null;
    this.sseClients = [];
    
    this.setupRoutes();
    
    // Broadcast logs and data to SSE clients
    logger.on('log', (data) => this.broadcast('log', data));
    logger.on('value', (data) => this.broadcast('value', data));
    logger.on('status', (data) => this.broadcast('status', data));
  }

  broadcast(type, data) {
    const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
    this.sseClients.forEach(client => client.write(payload));
  }

  setupRoutes() {
    this.app.use(cors());
    this.app.use(express.json());

    // SSE Endpoint
    this.app.get('/api/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      this.sseClients.push(res);

      req.on('close', () => {
        this.sseClients = this.sseClients.filter(client => client !== res);
      });
    });

    // API Routes
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

    // Serve Frontend
    const frontendPath = path.join(__dirname, '../frontend/dist');
    this.app.use(express.static(frontendPath));

    // Fallback for SPA
    this.app.use((req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        logger.info(`Web API & UI started and listening on http://${this.host}:${this.port}`);
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
