import React, { useState, useEffect, useRef } from 'react';
import { Settings, Server, Activity, Save, Power, Terminal, Send } from 'lucide-react';
import axios from 'axios';
import yaml from 'js-yaml';
import './index.css';

function App() {
  const [config, setConfig] = useState(null);
  const [yamlText, setYamlText] = useState('');
  const [helpers, setHelpers] = useState({});
  
  const [logs, setLogs] = useState([]);
  const [liveValues, setLiveValues] = useState({});
  const [pendingValues, setPendingValues] = useState({});
  const [deviceStatuses, setDeviceStatuses] = useState({});
  
  const logsEndRef = useRef(null);

  useEffect(() => {
    fetchData();
    
    // Server-Sent Events (SSE) for real-time updates
    const evtSource = new EventSource('/api/stream');
    
    evtSource.onopen = () => {
      console.log('SSE connection established');
    };

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
        console.error('Error parsing SSE', e);
      }
    };

    evtSource.onerror = (err) => {
      console.error('SSE error', err);
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
      console.error('Error fetching data', e);
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

  const handleWriteRegister = async (deviceId, regName, value) => {
    try {
      await axios.post('/api/write', { deviceId, registerName: regName, value: parseFloat(value) });
      // Clear pending value on success
      setPendingValues(prev => {
        const next = { ...prev };
        delete next[`${deviceId}_${regName}`];
        return next;
      });
    } catch (e) {
      alert('Failed to write register: ' + (e.response?.data?.message || e.message));
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
            {config?.devices?.map((dev, i) => {
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
                         const cleanName = reg.name.toLowerCase().trim().replace(/\s+/g, '_');
                         const regKey = `${dev.id}_${cleanName}`;
                         const val = liveValues[regKey];
                         const isHolding = reg.type === 'holding';
                         const pendingVal = pendingValues[regKey];

                         return (
                           <div key={regKey} style={{display: 'flex', flexDirection: 'column', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.3rem'}}>
                             <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem'}}>
                               <span>{reg.name}</span>
                               <strong style={{color: isHolding ? '#ffcc00' : 'var(--accent-color)'}}>
                                 {val !== undefined ? val : '--'} {reg.unit || ''}
                               </strong>
                             </div>
                             
                             {isHolding && (
                               <div style={{display: 'flex', gap: '0.5rem', marginTop: '0.2rem'}}>
                                 <input 
                                   type="number" 
                                   placeholder="New value"
                                   value={pendingVal !== undefined ? pendingVal : ''}
                                   onChange={(e) => setPendingValues(prev => ({ ...prev, [regKey]: e.target.value }))}
                                   style={{ flexGrow: 1, padding: '2px 8px', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: 'white', borderRadius: '4px' }}
                                 />
                                 <button 
                                   onClick={() => handleWriteRegister(dev.id, reg.name, pendingVal)}
                                   disabled={pendingVal === undefined || pendingVal === ''}
                                   style={{ padding: '2px 8px', fontSize: '0.75rem', background: 'var(--accent-color)', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', opacity: (pendingVal === undefined || pendingVal === '') ? 0.5 : 1 }}
                                 >
                                   <Send size={12} /> Set
                                 </button>
                               </div>
                             )}
                           </div>
                         );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
            {(!config?.devices || config.devices.length === 0) && (
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
