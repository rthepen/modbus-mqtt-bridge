import { Aedes } from 'aedes';
import { createServer } from 'net';

class MqttBroker {
  constructor(port = 1883, host = '0.0.0.0') {
    this.port = port;
    this.host = host;
    this.server = null;
    this.aedes = null;
  }

  async start() {
    this.aedes = await Aedes.createBroker();
    this.server = createServer(this.aedes.handle);
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (err) => {
        if (err) {
          console.error('Error starting MQTT broker', err);
          return reject(err);
        }
        console.log(`MQTT Broker started and listening on ${this.host}:${this.port}`);
        resolve();
      });

      this.aedes.on('client', (client) => {
        console.log(`MQTT Client Connected: ${client.id}`);
      });

      this.aedes.on('clientDisconnect', (client) => {
        console.log(`MQTT Client Disconnected: ${client.id}`);
      });

      this.aedes.on('publish', (packet, client) => {
        // Suppress internal aedes messages to reduce noise
        if (client && !packet.topic.startsWith('$SYS')) {
          console.log(`MQTT Published topic ${packet.topic} by ${client.id}`);
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.aedes.close(() => {
        this.server.close(() => {
          console.log('MQTT Broker stopped');
          resolve();
        });
      });
    });
  }
}

export default MqttBroker;
