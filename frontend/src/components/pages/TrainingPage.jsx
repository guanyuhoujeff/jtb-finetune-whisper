import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Play, Square, Terminal, Settings, Activity, ChevronRight, Check, Loader2, Database, Brain, Merge, Zap, AlertCircle } from 'lucide-react';

// Pipeline Step Component
const PipelineStep = ({ name, icon: Icon, status, isLast }) => {
    const getStepStyles = () => {
        switch (status) {
            case 'completed':
                return {
                    container: 'bg-emerald-500/20 border-emerald-500/50',
                    icon: 'bg-emerald-500 text-white',
                    text: 'text-emerald-400',
                    connector: 'bg-emerald-500'
                };
            case 'active':
                return {
                    container: 'bg-indigo-500/20 border-indigo-500 shadow-lg shadow-indigo-500/30 animate-pulse',
                    icon: 'bg-indigo-500 text-white animate-spin-slow',
                    text: 'text-indigo-300 font-semibold',
                    connector: 'bg-slate-600'
                };
            case 'error':
                return {
                    container: 'bg-red-500/20 border-red-500/50',
                    icon: 'bg-red-500 text-white',
                    text: 'text-red-400',
                    connector: 'bg-slate-600'
                };
            case 'pending':
            default:
                return {
                    container: 'bg-slate-800/50 border-slate-700',
                    icon: 'bg-slate-700 text-slate-400',
                    text: 'text-slate-500',
                    connector: 'bg-slate-700'
                };
        }
    };

    const styles = getStepStyles();

    return (
        <div className="flex items-center">
            <div className={`relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-500 ${styles.container}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all duration-300 ${styles.icon}`}>
                    {status === 'completed' ? (
                        <Check size={24} />
                    ) : status === 'active' ? (
                        <Loader2 size={24} className="animate-spin" />
                    ) : status === 'error' ? (
                        <AlertCircle size={24} />
                    ) : (
                        <Icon size={24} />
                    )}
                </div>
                <span className={`text-sm font-medium transition-all duration-300 ${styles.text}`}>
                    {name}
                </span>
                {status === 'active' && (
                    <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
                )}
            </div>
            {!isLast && (
                <div className="flex items-center mx-2">
                    <div className={`w-8 h-1 rounded-full transition-all duration-500 ${styles.connector}`} />
                    <ChevronRight className="text-slate-600" size={16} />
                </div>
            )}
        </div>
    );
};

// Pipeline Progress Component
const PipelineProgress = ({ steps, currentStepIndex, pipelineStatus }) => {
    // Map step names to icons
    const stepIcons = {
        'Training': Brain,
        'Merging': Merge,
        'Converting': Zap,
        'Loading Data': Database
    };

    const getStepStatus = (stepIndex) => {
        if (pipelineStatus === 'error') {
            if (stepIndex < currentStepIndex) return 'completed';
            if (stepIndex === currentStepIndex) return 'error';
            return 'pending';
        }
        if (pipelineStatus === 'completed') return 'completed';
        if (stepIndex < currentStepIndex) return 'completed';
        if (stepIndex === currentStepIndex) return 'active';
        return 'pending';
    };

    if (!steps || steps.length === 0) {
        return (
            <div className="flex items-center justify-center p-8 text-slate-500 italic">
                Configure and start training to see pipeline progress
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center flex-wrap gap-2 p-6">
            {steps.map((stepName, index) => (
                <PipelineStep
                    key={index}
                    name={stepName}
                    icon={stepIcons[stepName] || Brain}
                    status={getStepStatus(index)}
                    isLast={index === steps.length - 1}
                />
            ))}
        </div>
    );
};

const TrainingPage = ({ apiBaseUrl }) => {
    const [status, setStatus] = useState('idle');
    const [logs, setLogs] = useState([]);
    const [pipelineSteps, setPipelineSteps] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [config, setConfig] = useState({
        model_name: 'openai/whisper-large-v3',
        output_dir: 'lora-whisper',
        max_steps: 100,
        eval_steps: 50,
        per_device_train_batch_size: 1,
        learning_rate: 0.0001,
        do_merge: false,
        do_convert: false
    });
    const [availableModels, setAvailableModels] = useState([]);
    const [availableBuckets, setAvailableBuckets] = useState([]);
    const [systemStats, setSystemStats] = useState(null);
    const [isStarting, setIsStarting] = useState(false);
    const [activeTab, setActiveTab] = useState('config'); // 'config' or 'progress'

    const logsEndRef = useRef(null);

    // Poll status every 2 seconds
    useEffect(() => {
        if (!apiBaseUrl) return;

        // Fetch models once
        const fetchModels = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/train/models`);
                setAvailableModels(res.data.models);
            } catch (err) {
                console.error("Failed to fetch models", err);
                setAvailableModels(["openai/whisper-large-v3", "openai/whisper-medium", "openai/whisper-small"]);
            }
        };

        const fetchBuckets = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/buckets`);
                const buckets = res.data.buckets;
                setAvailableBuckets(buckets);
                if (buckets.length > 0) {
                    setConfig(prev => ({ ...prev, bucket_name: buckets[0] }));
                }
            } catch (err) {
                console.error("Failed to fetch buckets", err);
            }
        };

        const fetchStatus = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/train/status`);
                setStatus(res.data.status);
                setLogs(res.data.logs);
                setPipelineSteps(res.data.steps || []);
                setCurrentStepIndex(res.data.current_step_index || 0);
            } catch (err) {
                console.error("Failed to fetch initial status", err);
            }
        };

        fetchModels();
        fetchBuckets();
        fetchStatus();

        // Setup SSE
        let eventSource;
        try {
            eventSource = new EventSource(`${apiBaseUrl}/events`);

            eventSource.addEventListener('system_stats', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    setSystemStats(data);
                } catch (err) {
                    console.error("Error parsing system stats", err);
                }
            });

            eventSource.addEventListener('training_status', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    setStatus(data.status);
                    setLogs(data.logs);
                    setPipelineSteps(data.steps || []);
                    setCurrentStepIndex(data.current_step_index || 0);
                } catch (err) {
                    console.error("Error parsing training status", err);
                }
            });

            eventSource.onerror = (err) => {
                console.error("EventSource failed:", err);
                eventSource.close();
            };

        } catch (err) {
            console.error("Failed to setup SSE", err);
        }

        return () => {
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [apiBaseUrl]);

    // Auto-switch to progress tab when training starts
    useEffect(() => {
        if (status === 'running' && activeTab === 'config') {
            setActiveTab('progress');
        }
    }, [status]);

    // Auto-scroll logs only when new logs arrive
    const prevLogsLength = useRef(0);
    useEffect(() => {
        if (logs.length > prevLogsLength.current) {
            if (logsEndRef.current) {
                logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
            prevLogsLength.current = logs.length;
        }
    }, [logs]);

    const handleStart = async () => {
        setIsStarting(true);
        try {
            await axios.post(`${apiBaseUrl}/train/start`, config);
            setActiveTab('progress');
        } catch (err) {
            alert("Failed to start training: " + err.message);
        } finally {
            setIsStarting(false);
        }
    };

    const handleStop = async () => {
        try {
            await axios.post(`${apiBaseUrl}/train/stop`);
            alert("Stop signal sent.");
        } catch (err) {
            alert("Failed to stop training: " + err.message);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (name === 'max_steps' || name === 'eval_steps' ? parseInt(value) : value)
        }));
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-3">
                    <Activity className="text-indigo-500" size={24} />
                    <h1 className="text-xl font-bold text-slate-100">Model Training</h1>
                </div>

                {/* System Mini-Stats Header */}
                <div className="flex items-center gap-4">
                    {systemStats && (
                        <div className="hidden md:flex items-center gap-4 text-xs font-mono text-slate-400">
                            <div className="flex items-center gap-2">
                                <span className="text-indigo-400">CPU</span>
                                <span>{systemStats.cpu.usage_percent}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-purple-400">RAM</span>
                                <span>{systemStats.ram.usage_percent}%</span>
                            </div>
                            {systemStats.gpus.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-emerald-400">GPU</span>
                                    <span>{Math.round(systemStats.gpus[0].load)}%</span>
                                </div>
                            )}
                        </div>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status === 'running'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 animate-pulse'
                        : status === 'error'
                            ? 'bg-red-500/10 border-red-500/50 text-red-400'
                            : status === 'completed'
                                ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                        {status.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-800 bg-slate-900/50">
                <button
                    onClick={() => setActiveTab('config')}
                    className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'config'
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                        : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                        }`}
                >
                    <Settings size={16} />
                    Step 1: Configuration
                </button>
                <button
                    onClick={() => setActiveTab('progress')}
                    className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'progress'
                        ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
                        : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                        }`}
                >
                    <Activity size={16} />
                    Step 2: Pipeline Progress
                    {status === 'running' && (
                        <span className="ml-2 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                    )}
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Configuration Tab Content */}
                {activeTab === 'config' && (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Configuration Panel */}
                        <div className="w-[450px] flex-shrink-0 border-r border-slate-800 bg-slate-900/50 p-6 overflow-y-auto custom-scrollbar">
                            <div className="flex items-center gap-2 mb-6 text-slate-400">
                                <Settings size={18} />
                                <h2 className="text-sm font-semibold uppercase tracking-wider">Training Configuration</h2>
                            </div>

                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 font-medium uppercase">Dataset Bucket</label>
                                    <select
                                        name="bucket_name"
                                        value={config.bucket_name || ''}
                                        onChange={handleChange}
                                        disabled={status === 'running'}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 appearance-none cursor-pointer"
                                    >
                                        {availableBuckets.length === 0 && <option value="">No buckets found</option>}
                                        {availableBuckets.map(bucket => (
                                            <option key={bucket} value={bucket} className="bg-slate-900 text-slate-200">
                                                {bucket}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 font-medium uppercase">Base Model</label>
                                    <select
                                        name="model_name"
                                        value={config.model_name}
                                        onChange={handleChange}
                                        disabled={status === 'running'}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 appearance-none cursor-pointer"
                                    >
                                        {availableModels.map(model => (
                                            <option key={model} value={model} className="bg-slate-900 text-slate-200">
                                                {model}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 font-medium uppercase">Output Directory</label>
                                    <input
                                        type="text"
                                        name="output_dir"
                                        value={config.output_dir}
                                        onChange={handleChange}
                                        disabled={status === 'running'}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600 disabled:opacity-50"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-500 font-medium uppercase">Max Steps</label>
                                        <input
                                            type="number"
                                            name="max_steps"
                                            value={config.max_steps}
                                            onChange={handleChange}
                                            disabled={status === 'running'}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-500 font-medium uppercase">Eval Steps</label>
                                        <input
                                            type="number"
                                            name="eval_steps"
                                            value={config.eval_steps}
                                            onChange={handleChange}
                                            disabled={status === 'running'}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-500 font-medium uppercase">Batch Size</label>
                                        <input
                                            type="number"
                                            name="per_device_train_batch_size"
                                            value={config.per_device_train_batch_size}
                                            onChange={handleChange}
                                            disabled={status === 'running'}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-500 font-medium uppercase">Learning Rate</label>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            name="learning_rate"
                                            value={config.learning_rate}
                                            onChange={handleChange}
                                            disabled={status === 'running'}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                {/* Post-Processing */}
                                <div className="space-y-3 pt-2 border-t border-slate-800">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Post-Processing Steps</h3>
                                    </div>
                                    <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer border border-slate-700/50">
                                        <input
                                            type="checkbox"
                                            name="do_merge"
                                            checked={config.do_merge}
                                            onChange={handleChange}
                                            disabled={status === 'running'}
                                            className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div>
                                            <span className="text-sm text-slate-300 font-medium">Merge LoRA Weights</span>
                                            <p className="text-xs text-slate-500">Merge adapter into base model</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer border border-slate-700/50">
                                        <input
                                            type="checkbox"
                                            name="do_convert"
                                            checked={config.do_convert}
                                            onChange={handleChange}
                                            disabled={status === 'running'}
                                            className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div>
                                            <span className="text-sm text-slate-300 font-medium">Convert to Faster-Whisper</span>
                                            <p className="text-xs text-slate-500">CTranslate2 format for inference</p>
                                        </div>
                                    </label>
                                </div>



                                <div className="pt-4">
                                    <button
                                        onClick={handleStart}
                                        disabled={status === 'running' || status === 'stopping' || isStarting}
                                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-4 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-900/30"
                                    >
                                        {isStarting ? <Activity className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                                        Start Training Pipeline
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Preview Panel */}
                        <div className="flex-1 flex flex-col bg-slate-950 p-6">
                            <div className="flex items-center gap-2 mb-4 text-slate-400">
                                <Activity size={18} />
                                <h2 className="text-sm font-semibold uppercase tracking-wider">Pipeline Preview</h2>
                            </div>
                            <div className="flex-1 flex items-center justify-center bg-slate-900/30 rounded-xl border border-slate-800">
                                <PipelineProgress
                                    steps={['Training', ...(config.do_merge ? ['Merging'] : []), ...(config.do_convert ? ['Converting'] : [])]}
                                    currentStepIndex={-1}
                                    pipelineStatus="idle"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Progress Tab Content */}
                {activeTab === 'progress' && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Pipeline Progress Visualization */}
                        <div className="border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/80 to-slate-900">
                            <div className="flex items-center gap-2 px-6 pt-4 text-slate-400">
                                <Activity size={18} />
                                <h2 className="text-sm font-semibold uppercase tracking-wider">Pipeline Progress</h2>
                                {status === 'running' && pipelineSteps.length > 0 && (
                                    <span className="ml-auto text-xs text-slate-500">
                                        Step {currentStepIndex + 1} of {pipelineSteps.length}
                                    </span>
                                )}
                            </div>
                            <PipelineProgress
                                steps={pipelineSteps}
                                currentStepIndex={currentStepIndex}
                                pipelineStatus={status}
                            />

                            {/* Stop Button */}
                            {status === 'running' && (
                                <div className="px-6 pb-4">
                                    <button
                                        onClick={handleStop}
                                        className="flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500/20 px-6 py-2 rounded-lg font-semibold transition-all"
                                    >
                                        <Square size={16} fill="currentColor" />
                                        Stop Pipeline
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Logs and System Stats */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Logs Panel */}
                            <div className="flex-1 flex flex-col bg-slate-950 p-6 min-w-0">
                                <div className="flex items-center gap-2 mb-4 text-slate-400">
                                    <Terminal size={18} />
                                    <h2 className="text-sm font-semibold uppercase tracking-wider">Live Logs</h2>
                                </div>

                                <div className="flex-1 bg-black/50 border border-slate-800 rounded-xl p-4 overflow-y-auto font-mono text-sm leading-relaxed custom-scrollbar shadow-inner">
                                    {logs.length === 0 ? (
                                        <div className="h-full flex items-center justify-center text-slate-600 italic">
                                            Waiting for logs...
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {logs.map((log, i) => (
                                                <div key={i} className={`${log.includes('[ERROR]') ? 'text-red-400' :
                                                    log.includes('[SYSTEM]') ? 'text-indigo-400' : 'text-slate-300'
                                                    }`}>
                                                    {log}
                                                </div>
                                            ))}
                                            <div ref={logsEndRef} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* System Stats Sidebar */}
                            <div className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900/30 p-4 overflow-y-auto">
                                <div className="flex items-center gap-2 mb-4 text-slate-400">
                                    <Activity size={18} />
                                    <h2 className="text-sm font-semibold uppercase tracking-wider">System</h2>
                                </div>

                                {systemStats ? (
                                    <div className="space-y-4">
                                        {/* CPU */}
                                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-bold text-slate-400 uppercase">CPU</span>
                                                <span className="text-sm font-bold text-indigo-400">{systemStats.cpu.usage_percent}%</span>
                                            </div>
                                            <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-indigo-500 h-full transition-all duration-500"
                                                    style={{ width: `${systemStats.cpu.usage_percent}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* RAM */}
                                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-bold text-slate-400 uppercase">RAM</span>
                                                <span className="text-sm font-bold text-purple-400">{systemStats.ram.usage_percent}%</span>
                                            </div>
                                            <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-purple-500 h-full transition-all duration-500"
                                                    style={{ width: `${systemStats.ram.usage_percent}%` }}
                                                />
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {systemStats.ram.used_gb} / {systemStats.ram.total_gb} GB
                                            </div>
                                        </div>

                                        {/* GPUs */}
                                        {systemStats.gpus.map((gpu, idx) => (
                                            <div key={idx} className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                                                <div className="flex justify-between items-center mb-3">
                                                    <span className="text-xs font-bold text-slate-400 uppercase">GPU {idx}</span>
                                                    <span className="text-xs text-slate-500">{gpu.temperature}°C</span>
                                                </div>
                                                <div className="space-y-2">
                                                    <div>
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="text-slate-500">Load</span>
                                                            <span className="text-emerald-400">{Math.round(gpu.load)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className="bg-emerald-500 h-full transition-all duration-500"
                                                                style={{ width: `${gpu.load}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="text-slate-500">Memory</span>
                                                            <span className="text-blue-400">{Math.round(gpu.memory_util)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className="bg-blue-500 h-full transition-all duration-500"
                                                                style={{ width: `${gpu.memory_util}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-slate-500 text-sm italic">Loading stats...</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TrainingPage;
