import { EventEmitter } from 'events';

class Logger extends EventEmitter {
  constructor() {
    super();
  }

  info(msg) {
    console.log(`[INFO] ${msg}`);
    this.emit('log', { level: 'info', msg, timestamp: new Date().toISOString() });
  }

  warn(msg) {
    console.warn(`[WARN] ${msg}`);
    this.emit('log', { level: 'warn', msg, timestamp: new Date().toISOString() });
  }

  error(msg) {
    console.error(`[ERROR] ${msg}`);
    this.emit('log', { level: 'error', msg, timestamp: new Date().toISOString() });
  }
}

export const logger = new Logger();
