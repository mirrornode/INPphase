import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  BarChart,
  Bar
} from 'recharts';
import { Play, Pause, RotateCcw, Wifi, WifiOff, Activity, Waves, GitBranch } from 'lucide-react';

const RotanBridge = () => {
  const [connected, setConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [liveData, setLiveData] = useState({
    tau: 0,
    phi: 0,
    energy: 0,
    field: [0, 0, 0],
    velocities: [0, 0, 0]
  });

  const [phaseData, setPhaseData] = useState([]);
  const [spectrumData, setSpectrumData] = useState([]);
  const [poincareData, setPoincareData] = useState([]);
  const [protocolLog, setProtocolLog] = useState([]);
  const [activeTab, setActiveTab] = useState('phase');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const connectedRef = useRef(connected);

  // keep ref in sync so interval callbacks read latest value
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  const addLog = (message) => {
    const entry = {
      timestamp: new Date().toISOString().split('T')[1].slice(0, 12),
      message
    };
    setProtocolLog((prev) => [...prev.slice(-50), entry]);
  };

  const connectWebSocket = () => {
    try {
      setWsStatus('connecting');
      
      // Create WebSocket connection to Python backend
      wsRef.current = new WebSocket('ws://localhost:8765');
      
      wsRef.current.onopen = () => {
        setConnected(true);
        setWsStatus('connected');
        addLog('WebSocket connected to Python backend');
        
        // Send initial configuration
        wsRef.current.send(JSON.stringify({
          type: 'config',
          payload: {
            sampleRate: 50, // Hz
            bufferSize: 400,
            poincarePoints: 200
          }
        }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types from backend
          switch (data.type) {
            case 'state':
              setLiveData(data.payload);
              break;
            case 'phase':
              setPhaseData(prev => {
                const newData = [...prev, data.payload];
                return newData.slice(-400);
              });
              break;
            case 'poincare':
              setPoincareData(prev => {
                const newData = [...prev, data.payload];
                return newData.slice(-200);
              });
              break;
            case 'spectrum':
              setSpectrumData(data.payload);
              break;
            case 'error':
              addLog(`Backend error: ${data.payload.message}`);
              break;
            default:
              console.warn('Unknown message type:', data.type);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
          addLog(`Message parse error: ${err.message}`);
        }
      };

      wsRef.current.onclose = (event) => {
        setConnected(false);
        setWsStatus('disconnected');
        addLog(`WebSocket closed: ${event.reason || 'Connection closed'}`);
        
        // Attempt reconnection unless explicitly disconnected
        if (connectedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        }
      };

      wsRef.current.onerror = (error) => {
        setWsStatus('error');
        addLog(`WebSocket error: ${error.message || 'Connection failed'}`);
      };

    } catch (error) {
      setWsStatus('error');
      addLog(`Connection error: ${error.message}`);
      if (connectedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      }
    }
  };

  const disconnect = () => {
    // Mark as disconnecting to prevent auto-reconnect
    connectedRef.current = false;
    
    if (wsRef.current) {
      // Send graceful disconnect message if possible
      try {
        wsRef.current.send(JSON.stringify({
          type: 'disconnect',
          payload: { reason: 'user_initiated' }
        }));
      } catch (e) {
        // Ignore send errors during disconnect
      }
      
      try {
        wsRef.current.close(1000, 'User disconnected');
      } catch (e) {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnected(false);
    setWsStatus('disconnected');
    addLog('Disconnected from Python backend');
  };

  const resetSystem = () => {
    // Send reset command to backend if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'command',
          payload: { action: 'reset' }
        }));
      } catch (e) {
        addLog(`Failed to send reset command: ${e.message}`);
      }
    }

    setPhaseData([]);
    setPoincareData([]);
    setSpectrumData([]);
    setProtocolLog([]);
    setLiveData({ tau: 0, phi: 0, energy: 0, field: [0, 0, 0], velocities: [0, 0, 0] });
    addLog('System reset');
  };

  // Simulation: updates live state at ~50Hz when connected.
  const startSimulation = () => {
    // If already running, don't start another
    if (intervalRef.current) return;

    let tau = 0;
    let oscillators = [
      { x: 0.1, v: 0.0 },
      { x: -0.1, v: 0.0 },
      { x: 0.0, v: 0.1 }
    ];

    intervalRef.current = setInterval(() => {
      // stop if disconnected
      if (!connectedRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        return;
      }

      tau += 0.02;

      // System parameters (toy model)
      const omega = 2.8;
      const a = 1.0;
      const b = 0.5;
      const alpha = 0.05;
      const coupling = 0.3;
      const k = 0.2;

      oscillators = oscillators.map((osc, i) => {
        const couplingTerm = oscillators
          .filter((_, j) => j !== i)
          .reduce((sum, other) => sum + k * (other.x - osc.x), 0);

        const dvdt = -omega * omega * osc.x
                     + a * Math.sin(omega * tau)
                     - b * Math.pow(osc.x, 3)
                     - alpha * osc.v
                     + coupling * Math.cos(omega * tau * 0.5)
                     + couplingTerm;

        return {
          x: osc.x + osc.v * 0.02,
          v: osc.v + dvdt * 0.02
        };
      });

      const field = oscillators.map((o) => o.x);
      const velocities = oscillators.map((o) => o.v);
      const energy = Math.sqrt(field.reduce((sum, x, i) => sum + x * x + velocities[i] * velocities[i], 0));
      const phi = Math.atan2(velocities[0] || 0, field[0] || 1);

      // Update live data
      setLiveData({ tau, phi, energy, field, velocities });

      // Update phase data (keep last 400 points)
      setPhaseData((prev) => {
        const newData = [...prev, {
          tau,
          x0: field[0],
          v0: velocities[0],
          x1: field[1],
          v1: velocities[1],
          x2: field[2],
          v2: velocities[2]
        }];
        return newData.slice(-400);
      });

      // Poincaré sampling (toy rule)
      if (Math.floor(tau * 10) % 3 === 0) {
        setPoincareData((prev) => {
          const newData = [...prev, { x: field[0], v: velocities[0] }];
          return newData.slice(-200);
        });
      }

      // Spectrum update occasionally
      if (Math.floor(tau * 10) % 5 === 0) {
        const spectrum = [];
        for (let kf = 0; kf < 20; kf++) {
          const freq = kf * 0.5;
          const magnitude = Math.abs(Math.sin(freq * tau * 0.1)) * Math.exp(-kf * 0.1);
          spectrum.push({ freq, magnitude, db: 20 * Math.log10(magnitude + 1e-10) });
        }
        setSpectrumData(spectrum);
      }

    }, 20); // ~50Hz
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      connectedRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'Component unmounted');
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                Rotan → MirrorNode Bridge
              </h1>
              <p className="text-cyan-300/70 text-sm">React frontend ↔ Python backend via WebSocket</p>
            </div>

            {/* Connection Controls */}
            <div className="flex gap-2">
              {!connected ? (
                <button
                  onClick={connectWebSocket}
                  disabled={wsStatus === 'connecting'}
                  className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 text-white px-4 py-2 rounded-lg transition-all"
                >
                  <Wifi size={18} />
                  {wsStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                </button>
              ) : (
                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-all"
                >
                  <WifiOff size={18} />
                  Disconnect
                </button>
              )}

              <button
                onClick={resetSystem}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all"
              >
                <RotateCcw size={18} />
                Reset
              </button>
            </div>
          </div>

          {/* Connection Status Bar */}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-slate-400">
              Status: <span className={connected ? 'text-green-400' : 'text-slate-500'}>{wsStatus}</span>
            </span>
            <span className="text-slate-600 mx-2">|</span>
            <span className="text-slate-400">
              Backend: <span className="text-cyan-400 font-mono">ws://localhost:8765</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Visualization Area */}
          <div className="lg:col-span-2 space-y-4">
            {/* Tab Navigation */}
            <div className="flex gap-2 bg-slate-800/50 backdrop-blur border border-cyan-500/20 rounded-lg p-2">
              <button
                onClick={() => setActiveTab('phase')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  activeTab === 'phase' ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white' : 'text-cyan-300 hover:bg-slate-700/50'
                }`}
              >
                <Activity size={16} />
                Phase Space
              </button>
              <button
                onClick={() => setActiveTab('poincare')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  activeTab === 'poincare' ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white' : 'text-cyan-300 hover:bg-slate-700/50'
                }`}
              >
                <GitBranch size={16} />
                Poincaré
              </button>
              <button
                onClick={() => setActiveTab('spectrum')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  activeTab === 'spectrum' ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white' : 'text-cyan-300 hover:bg-slate-700/50'
                }`}
              >
                <Waves size={16} />
                Spectrum
              </button>
            </div>

            {/* Phase Space View */}
            {activeTab === 'phase' && (
              <div className="bg-slate-800/50 backdrop-blur border border-cyan-500/20 rounded-lg p-4">
                <h3 className="text-cyan-400 font-semibold mb-3">Φ Phase Space (CDI Output)</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={phaseData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="x0" stroke="#06b6d4" label={{ value: 'Position', position: 'insideBottom', offset: -5, fill: '#06b6d4' }} />
                    <YAxis stroke="#a855f7" label={{ value: 'Velocity', angle: -90, position: 'insideLeft', fill: '#a855f7' }} />
                    <Line type="monotone" dataKey="v0" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="monotone" dataKey="v1" stroke="#a855f7" dot={false} strokeWidth={2} isAnimationActive={false} />
                    <Line type="monotone" dataKey="v2" stroke="#ec4899" dot={false} strokeWidth={2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Poincaré Section */}
            {activeTab === 'poincare' && (
              <div className="bg-slate-800/50 backdrop-blur border border-purple-500/20 rounded-lg p-4">
                <h3 className="text-purple-400 font-semibold mb-3">Poincaré Section (RI Transform)</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" dataKey="x" stroke="#06b6d4" domain={["auto", "auto"]} />
                    <YAxis type="number" dataKey="v" stroke="#a855f7" domain={["auto", "auto"]} />
                    <Scatter data={poincareData} fill="#ec4899" isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
                <p className="text-slate-400 text-xs mt-2">{poincareData.length} points sampled</p>
              </div>
            )}

            {/* Spectrum View */}
            {activeTab === 'spectrum' && (
              <div className="bg-slate-800/50 backdrop-blur border border-cyan-500/20 rounded-lg p-4">
                <h3 className="text-cyan-400 font-semibold mb-3">Ψ Frequency Spectrum (RI Transform)</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={spectrumData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="freq" stroke="#06b6d4" />
                    <YAxis stroke="#a855f7" />
                    <Bar dataKey="db" fill="url(#specGrad)" isAnimationActive={false} />
                    <defs>
                      <linearGradient id="specGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Time Series */}
            <div className="bg-slate-800/50 backdrop-blur border border-purple-500/20 rounded-lg p-4">
              <h3 className="text-purple-400 font-semibold mb-3">Oscillator Time Series</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={phaseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="tau" stroke="#06b6d4" label={{ value: 'τ (tau)', position: 'insideBottom', offset: -5, fill: '#06b6d4' }} />
                  <YAxis stroke="#a855f7" />
                  <Line type="monotone" dataKey="x0" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="x1" stroke="#a855f7" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="x2" stroke="#ec4899" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Live State Display */}
            <div className="bg-slate-800/50 backdrop-blur border border-cyan-500/20 rounded-lg p-4">
              <h3 className="text-cyan-400 font-semibold mb-3">Live State</h3>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">τ (tau):</span>
                  <span className="text-cyan-300">{liveData.tau.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">φ (phi):</span>
                  <span className="text-purple-300">{liveData.phi.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Energy:</span>
                  <span className="text-pink-300">{liveData.energy.toFixed(3)}</span>
                </div>
              </div>
            </div>

            {/* Oscillator States */}
            <div className="bg-slate-800/50 backdrop-blur border border-purple-500/20 rounded-lg p-4">
              <h3 className="text-purple-400 font-semibold mb-3">Oscillators</h3>
              <div className="space-y-3">
                {liveData.field.map((x, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ['#06b6d4', '#a855f7', '#ec4899'][i] }} />
                      <span className="text-slate-400">Osc {i + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 ml-5 font-mono">
                      <div>
                        <span className="text-slate-500">x:</span>
                        <span className="text-cyan-300 ml-1">{x.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">v:</span>
                        <span className="text-purple-300 ml-1">{(liveData.velocities[i] || 0).toFixed(3)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Protocol Log */}
            <div className="bg-slate-800/50 backdrop-blur border border-green-500/20 rounded-lg p-4">
              <h3 className="text-green-400 font-semibold mb-3">Ω Protocol Log</h3>
              <div className="h-48 overflow-y-auto space-y-1 font-mono text-xs">
                {protocolLog.slice().reverse().map((entry, i) => (
                  <div key={i} className="text-green-300">
                    <span className="text-slate-500">[{entry.timestamp}]</span> {entry.message}
                  </div>
                ))}
                {protocolLog.length === 0 && (
                  <div className="text-slate-500 text-center py-8">No log entries yet</div>
                )}
              </div>
            </div>

            {/* System Info */}
            <div className="bg-slate-800/50 backdrop-blur border border-cyan-500/20 rounded-lg p-3">
              <h3 className="text-cyan-400 font-semibold mb-2 text-sm">System Architecture</h3>
              <div className="text-xs text-slate-300 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>CDI → Core Dynamics (Φ)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                  <span>RI → Resonance (Ψ)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span>NI → Node Output (Ω)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RotanBridge;
