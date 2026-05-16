import React, { useState, useEffect, useRef } from 'react';
import { Settings, Server, Activity, Save, Power, Terminal } from 'lucide-react';
import axios from 'axios';
import yaml from 'js-yaml';
import './index.css';

function App() {
  const [config, setConfig] = useState(null);
  const [yamlText, setYamlText] = useState('');
  const [helpers, setHelpers] = useState({});
  
  const [logs, setLogs] = useState([]);
  const [liveValues, setLiveValues] = useState({});
  const [deviceStatuses, setDeviceStatuses] = useState({});
  
  const logsEndRef = useRef(null);

  useEffect(() => {
    fetchData();
    
    // Server-Sent Events (SSE) for real-time updates
    const evtSource = new EventSource('/api/stream');
    evtSource.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        if (type === 'log') {
          setLogs(prev => [...prev.slice(-99), data]);
        } else if (type === 'value') {
          setLiveValues(prev => ({ ...prev, [data.id]: data.value }));
        } else if (type === 'status') {
          setDeviceStatuses(prev => ({ ...prev, [data.id]: data.status }));
        }
      } catch (e) {
        console.error("Error parsing SSE", e);
      }
    };
    
    return () => evtSource.close();
  }, []);

  useEffect(() => {
    // Auto-scroll logs
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchData = async () => {
    try {
      const confRes = await axios.get('/api/config');
      if (!config) {
        setConfig(confRes.data);
        setYamlText(yaml.dump(confRes.data));
      }
      
      const helpRes = await axios.get('/api/helpers');
      setHelpers(helpRes.data);
    } catch (e) {
      console.error("Error fetching data", e);
    }
  };

  const handleSaveConfig = async () => {
    try {
      const parsed = yaml.load(yamlText);
      await axios.post('/api/config', parsed);
      setConfig(parsed);
      alert('Configuration saved! Please restart the backend to apply all changes.');
    } catch (e) {
      alert('Invalid YAML configuration: ' + e.message);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>Modbus-MQTT Bridge</h1>
        <div className="status-badge" style={{display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--accent-color)'}}>
          <Activity size={20} />
          <span>System Online</span>
        </div>
      </header>

      <div className="grid">
        <div className="card">
          <h2><Server size={20} /> Configured Devices</h2>
          <ul className="device-list">
            {config?.modbus?.devices?.map((dev, i) => {
              const status = deviceStatuses[dev.id] || 'unknown';
              const isOnline = status === 'online';
              return (
                <li key={i} className="device-item" style={{flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start'}}>
                  <div className="device-info" style={{width: '100%', display: 'flex', justifyContent: 'space-between'}}>
                    <h3>{dev.name}</h3>
                    <span style={{ color: isOnline ? 'var(--accent-color)' : 'var(--danger-color)', fontWeight: 'bold' }}>
                      {status.toUpperCase()}
                    </span>
                  </div>
                  <p>{dev.ip}:{dev.port} (Slave: {dev.slave_id})</p>
                  
                  {dev.registers && dev.registers.length > 0 && (
                    <div style={{width: '100%', marginTop: '0.5rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px'}}>
                      {dev.registers.map(reg => {
                         const regId = `${dev.id}_${reg.name.toLowerCase().replace(/\\s+/g, '_')}`;
                         const val = liveValues[regId];
                         return (
                           <div key={regId} style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem'}}>
                             <span>{reg.name}</span>
                             <strong style={{color: 'var(--accent-color)'}}>{val !== undefined ? val : '--'} {reg.unit || ''}</strong>
                           </div>
                         );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
            {(!config?.modbus?.devices || config.modbus.devices.length === 0) && (
              <p style={{color: 'var(--text-muted)'}}>No Modbus devices configured.</p>
            )}
          </ul>
        </div>

        <div className="card" style={{display: 'flex', flexDirection: 'column'}}>
          <h2><Terminal size={20} /> Live System Logs</h2>
          <p style={{color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.85rem'}}>
            Real-time server logs streaming directly from the backend.
          </p>
          <div className="logs-container" style={{flexGrow: 1}}>
            {logs.map((log, i) => (
              <div key={i} className="log-entry">
                <span className="log-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`log-${log.level}`}>[{log.level.toUpperCase()}]</span> {log.msg}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="card">
          <h2><Power size={20} /> Dummy Helpers</h2>
          <ul className="device-list">
            {config?.helpers?.map((helper, i) => {
              const state = helpers[helper.id] || helper.initial_state;
              const isOn = state === 'ON';
              return (
                <li key={i} className="device-item" style={{alignItems: 'center'}}>
                  <div className="device-info">
                    <h3>{helper.name}</h3>
                    <p>Type: {helper.type} | ID: {helper.id}</p>
                    <p style={{marginTop: '0.25rem', color: isOn ? 'var(--accent-color)' : 'var(--text-muted)'}}>
                      Status: {state}
                    </p>
                  </div>
                </li>
              );
            })}
            {(!config?.helpers || config.helpers.length === 0) && (
              <p style={{color: 'var(--text-muted)'}}>No dummy helpers configured.</p>
            )}
          </ul>
        </div>

        <div className="card">
          <h2><Settings size={20} /> YAML Configuration</h2>
          <textarea 
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            spellCheck="false"
          />
          <div className="save-row">
            <button className="btn" onClick={handleSaveConfig}>
              <Save size={18} /> Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
