import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { CircleMeter } from "../components/CircleMeter";

type NodeConfig = {
    nodeId: string;
    alias: string;
    unit: string;
    category: string;
    min?: number;
    max?: number;
};

type TestResult = {
    ok: boolean;
    handshakeLogs: string[];
    samplePreview: any[];
    error?: string;
};

export default function OPCUAWizard() {
    const navigate = useNavigate();
    const [endpointUrl, setEndpointUrl] = useState("opc.tcp://DESKTOP-61HAQLS.mshome.net:53530/OPCUA/SimulationServer");
    const [nodes, setNodes] = useState<NodeConfig[]>([
        { nodeId: "ns=3;i=1009", alias: "opcua_temperature", unit: "°C", category: "temperature", min: 0, max: 100 },
        { nodeId: "ns=3;i=1010", alias: "opcua_vibration", unit: "mm/s", category: "vibration", min: 0, max: 10 },
        { nodeId: "ns=3;i=1012", alias: "opcua_motor_current", unit: "A", category: "motor_current", min: 0, max: 30 },
        { nodeId: "ns=3;i=1013", alias: "opcua_wear_index", unit: "%", category: "wear", min: 0, max: 100 },
        { nodeId: "ns=3;i=1011", alias: "opcua_pressure", unit: "bar", category: "pressure", min: 0, max: 200 },
    ]);
    
    const [isTesting, setIsTesting] = useState(false);
    const [isActivating, setIsActivating] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [liveValues, setLiveValues] = useState<Record<string, number>>({});
    const [isConnected, setIsConnected] = useState(false);

    // Fetch live values when connected
    useEffect(() => {
        if (!isConnected) return;

        const fetchLiveValues = async () => {
            try {
                const response = await api.get("/sensor-data/logs?limit=50&sort=desc");
                if (response.data && Array.isArray(response.data)) {
                    const values: Record<string, number> = {};
                    response.data.forEach((sensor: any) => {
                        // Try multiple ways to get alias
                        const alias = sensor.metadata?.alias || 
                                     sensor.metadata?.category ||
                                     sensor.sensor?.name ||
                                     sensor.sensor?.sensor_type;
                        if (alias && sensor.value !== null && sensor.value !== undefined) {
                            const numValue = parseFloat(sensor.value);
                            if (!isNaN(numValue)) {
                                // Keep the latest value for each alias
                                if (!values[alias] || new Date(sensor.timestamp || sensor.created_at) > new Date()) {
                                    values[alias] = numValue;
                                }
                            }
                        }
                    });
                    setLiveValues(prev => ({ ...prev, ...values }));
                }
            } catch (err: any) {
                // Silently handle errors - might be auth or no data yet
                if (err?.response?.status !== 401) {
                    console.error("Error fetching live values:", err);
                }
            }
        };

        fetchLiveValues();
        const interval = setInterval(fetchLiveValues, 2000);
        return () => clearInterval(interval);
    }, [isConnected]);

    const addNode = () => {
        setNodes([...nodes, { nodeId: "", alias: "", unit: "", category: "", min: 0, max: 100 }]);
    };

    const updateNode = (index: number, field: keyof NodeConfig, value: string | number) => {
        const updated = [...nodes];
        updated[index] = { ...updated[index], [field]: value };
        setNodes(updated);
    };

    const removeNode = (index: number) => {
        setNodes(nodes.filter((_, i) => i !== index));
    };

    const buildPayload = () => {
        return {
            name: "OPC UA Source",
            endpoint_url: endpointUrl,
            namespace_index: 3,
            sampling_interval_ms: 1000,
            session_timeout_ms: 60000,
            security_mode: "anonymous",
            security_policy: "",
            security_mode_level: "",
            timestamp_source: "server",
            deduplication_enabled: true,
            unit_override_policy: "preserve",
            db_type: "timescale",
            db_name: "pm_db",
            tags: {
                machine: "OPCUA-Simulation-Machine",
            },
            nodes: nodes.map((n) => ({
                node_id: n.nodeId,
                alias: n.alias,
                unit: n.unit || undefined,
                category: n.category || undefined,
            })),
        };
    };

    const handleTest = async () => {
        try {
            setIsTesting(true);
            setError(null);
            setTestResult(null);
            const payload = buildPayload();
            const response = await api.post("/opcua/test", payload);
            setTestResult({
                ok: response.data.ok,
                handshakeLogs: response.data.handshake_logs || [],
                samplePreview: response.data.sample_preview || [],
                error: response.data.error,
            });
        } catch (err: any) {
            setError(err?.response?.data?.detail || err.message || "Test failed");
            setTestResult({
                ok: false,
                handshakeLogs: [],
                samplePreview: [],
                error: err?.response?.data?.detail || err.message,
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleActivate = async () => {
        try {
            setIsActivating(true);
            setError(null);
            setSuccess(null);
            const payload = buildPayload();
            const response = await api.post("/opcua/activate", payload);
            setSuccess(`✅ Source activated with ${response.data.node_count} node(s). Data is now being collected!`);
            setIsConnected(true);
            
            // Wait a moment then redirect to dashboard
            setTimeout(() => {
                navigate("/");
            }, 2000);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err.message || "Activation failed");
        } finally {
            setIsActivating(false);
        }
    };

    const getStatusForValue = (alias: string, value: number): 'normal' | 'warning' | 'critical' => {
        const node = nodes.find(n => n.alias === alias);
        if (!node || node.min === undefined || node.max === undefined) return 'normal';
        
        const range = node.max - node.min;
        const percentage = ((value - node.min) / range) * 100;
        
        if (percentage >= 90) return 'critical';
        if (percentage >= 70) return 'warning';
        return 'normal';
    };

    return (
        <div className="min-h-screen bg-[#010313] text-slate-100 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-emerald-400 mb-2">OPC UA Connection</h1>
                    <p className="text-slate-400">Connect to your OPC UA simulator and monitor values in real-time</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Configuration Panel */}
                    <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-4">Configuration</h2>
                        
                        {/* Endpoint URL */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                OPC UA Server URL
                            </label>
                            <input
                                type="text"
                                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                placeholder="opc.tcp://hostname:port/path"
                                value={endpointUrl}
                                onChange={(e) => setEndpointUrl(e.target.value)}
                            />
                        </div>

                        {/* Nodes Configuration */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-medium text-slate-300">
                                    Variables / Nodes
                                </label>
                                <button
                                    type="button"
                                    onClick={addNode}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium"
                                >
                                    + Add Variable
                                </button>
                            </div>
                            
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {nodes.map((node, index) => (
                                    <div
                                        key={index}
                                        className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4"
                                    >
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Node ID</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
                                                    placeholder="ns=3;i=1009"
                                                    value={node.nodeId}
                                                    onChange={(e) => updateNode(index, "nodeId", e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Alias</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
                                                    placeholder="temperature"
                                                    value={node.alias}
                                                    onChange={(e) => updateNode(index, "alias", e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Unit</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
                                                    placeholder="°C"
                                                    value={node.unit}
                                                    onChange={(e) => updateNode(index, "unit", e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Category</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
                                                    placeholder="temperature"
                                                    value={node.category}
                                                    onChange={(e) => updateNode(index, "category", e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Min</label>
                                                <input
                                                    type="number"
                                                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
                                                    value={node.min || 0}
                                                    onChange={(e) => updateNode(index, "min", parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-400 mb-1">Max</label>
                                                <input
                                                    type="number"
                                                    className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-sm text-slate-100"
                                                    value={node.max || 100}
                                                    onChange={(e) => updateNode(index, "max", parseFloat(e.target.value) || 100)}
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeNode(index)}
                                            className="mt-2 px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleTest}
                                disabled={isTesting || isActivating}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                {isTesting ? "Testing..." : "Test Connection"}
                            </button>
                            <button
                                type="button"
                                onClick={handleActivate}
                                disabled={isActivating || isTesting || !testResult?.ok}
                                className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                            >
                                {isActivating ? "Activating..." : "Activate & Start"}
                            </button>
                        </div>

                        {/* Messages */}
                        {error && (
                            <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
                                <div className="mb-2">{success}</div>
                                <button
                                    onClick={() => navigate("/")}
                                    className="mt-2 px-4 py-2 rounded-lg bg-emerald-500 text-slate-900 hover:bg-emerald-400 font-semibold text-sm"
                                >
                                    Go to Dashboard →
                                </button>
                            </div>
                        )}
                        {testResult && (
                            <div className={`mt-4 p-3 rounded-lg border text-sm ${
                                testResult.ok 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            }`}>
                                <div className="font-semibold mb-2">
                                    {testResult.ok ? '✅ Connection Successful' : '❌ Connection Failed'}
                                </div>
                                {testResult.handshakeLogs.length > 0 && (
                                    <div className="text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
                                        {testResult.handshakeLogs.slice(-5).map((log, i) => (
                                            <div key={i}>{log}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Live Values Display */}
                    <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-4">Live Values</h2>
                        
                        {isConnected ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {nodes.map((node) => {
                                    // Try to find value by alias, category, or node ID
                                    const value = liveValues[node.alias] || 
                                                 liveValues[node.category] ||
                                                 liveValues[node.nodeId] || 0;
                                    const status = getStatusForValue(node.alias, value);
                                    const displayLabel = node.alias
                                        .replace('opcua_', '')
                                        .replace(/_/g, ' ')
                                        .split(' ')
                                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                        .join(' ');
                                    return (
                                        <CircleMeter
                                            key={node.alias || node.nodeId}
                                            label={displayLabel}
                                            value={value}
                                            unit={node.unit}
                                            min={node.min || 0}
                                            max={node.max || 100}
                                            status={status}
                                            size={180}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-64 text-slate-400">
                                <div className="text-center">
                                    <div className="text-4xl mb-2">📡</div>
                                    <div>Activate connection to see live values</div>
                                    <div className="text-xs mt-2 text-slate-500">
                                        Click "Activate & Start" after testing connection
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
