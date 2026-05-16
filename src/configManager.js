import fs from 'fs';
import yaml from 'js-yaml';
import chokidar from 'chokidar';
import EventEmitter from 'events';
import path from 'path';

class ConfigManager extends EventEmitter {
  constructor(configPath) {
    super();
    this.configPath = path.resolve(configPath);
    this.config = null;
    this.watcher = null;
  }

  loadConfig() {
    try {
      const fileContents = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(fileContents);
      return this.config;
    } catch (e) {
      console.error(`Error loading config file: ${e.message}`);
      return null;
    }
  }

  startWatching() {
    this.watcher = chokidar.watch(this.configPath, {
      persistent: true
    });

    this.watcher.on('change', () => {
      console.log(`Config file ${this.configPath} has been changed. Reloading...`);
      const newConfig = this.loadConfig();
      if (newConfig) {
        this.emit('configChanged', newConfig);
      }
    });
  }

  saveConfig(newConfig) {
    try {
      const yamlStr = yaml.dump(newConfig);
      fs.writeFileSync(this.configPath, yamlStr, 'utf8');
      this.config = newConfig;
      return true;
    } catch (e) {
      console.error(`Error saving config file: ${e.message}`);
      return false;
    }
  }

  getConfig() {
    return this.config;
  }
}

export default ConfigManager;
