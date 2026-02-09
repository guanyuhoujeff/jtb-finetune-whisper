import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Upload, Terminal, Activity, Check, AlertCircle, Loader2 } from 'lucide-react';

const UploadPage = ({ apiBaseUrl }) => {
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [selectedVariant, setSelectedVariant] = useState('');
    const [repoId, setRepoId] = useState('');
    const [hfToken, setHfToken] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [status, setStatus] = useState('idle');
    const [logs, setLogs] = useState([]);
    const [rememberToken, setRememberToken] = useState(false);
    const logsEndRef = useRef(null);

    // Load token from localStorage
    useEffect(() => {
        const savedToken = localStorage.getItem('hf_token');
        if (savedToken) {
            setHfToken(savedToken);
            setRememberToken(true);
        }
    }, []);

    // Fetch models on load
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/evaluate/models`);
                const customModels = res.data.models.filter(m => m.source === 'custom');
                setModels(customModels);
                if (customModels.length > 0) {
                    setSelectedModel(customModels[0].name);
                    if (customModels[0].variants.length > 0) {
                        setSelectedVariant(customModels[0].variants[0]);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch models", err);
            }
        };
        fetchModels();
    }, [apiBaseUrl]);

    // Update variants when model changes
    useEffect(() => {
        const model = models.find(m => m.name === selectedModel);
        if (model && model.variants.length > 0) {
            setSelectedVariant(model.variants[0]);
        } else {
            setSelectedVariant('');
        }
    }, [selectedModel, models]);

    // Poll status
    useEffect(() => {
        const pollStatus = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/train/status`);
                const data = res.data;
                const isUploadTask = data.steps && data.steps.includes("Uploading to HF");

                if (isUploadTask) {
                    setStatus(data.status);
                    setLogs(data.logs);
                    if (data.status === 'running') {
                        setIsUploading(true);
                    } else if (data.status === 'completed' || data.status === 'error') {
                        setIsUploading(false);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch status", err);
            }
        };

        const interval = setInterval(pollStatus, 2000);
        return () => clearInterval(interval);
    }, [apiBaseUrl]);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    const handleUpload = async () => {
        if (!selectedModel || !repoId || !hfToken) {
            alert("Please fill in all fields.");
            return;
        }

        // Save or clear token based on remember preference
        if (rememberToken) {
            localStorage.setItem('hf_token', hfToken);
        } else {
            localStorage.removeItem('hf_token');
        }

        try {
            setIsUploading(true);
            await axios.post(`${apiBaseUrl}/train/upload`, {
                model_name: selectedModel,
                variant: selectedVariant,
                repo_id: repoId,
                hf_token: hfToken,
                source: 'custom'
            });
            // Polling will pick up the rest
        } catch (err) {
            console.error(err);
            alert("Failed to start upload: " + (err.response?.data?.detail || err.message));
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
            {/* Header */}
            <div className="flex items-center gap-3 p-6 border-b border-slate-800 bg-slate-900">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <Upload className="text-indigo-500" size={24} />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-100">Upload to Hugging Face</h1>
                    <p className="text-sm text-slate-400">Push your trained models to the Hub</p>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Configuration Panel */}
                <div className="w-[400px] flex-shrink-0 border-r border-slate-800 bg-slate-900/50 p-6 overflow-y-auto custom-scrollbar">
                    <div className="space-y-6">
                        {/* Model Selection */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Model Selection</h3>

                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 font-medium">Model</label>
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    disabled={isUploading}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                >
                                    {models.length === 0 && <option value="">No custom models found</option>}
                                    {models.map(m => (
                                        <option key={m.name} value={m.name}>{m.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 font-medium">Variant</label>
                                <select
                                    value={selectedVariant}
                                    onChange={(e) => setSelectedVariant(e.target.value)}
                                    disabled={isUploading || !selectedModel}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                >
                                    {models.find(m => m.name === selectedModel)?.variants.map(v => (
                                        <option key={v} value={v}>{v}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Hugging Face Config */}
                        <div className="space-y-4 pt-4 border-t border-slate-800">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Hugging Face Config</h3>

                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 font-medium">Repo ID (username/model-name)</label>
                                <input
                                    type="text"
                                    value={repoId}
                                    onChange={(e) => setRepoId(e.target.value)}
                                    disabled={isUploading}
                                    placeholder="username/whisper-finetuned"
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-slate-400 font-medium">Access Token</label>
                                <input
                                    type="password"
                                    value={hfToken}
                                    onChange={(e) => setHfToken(e.target.value)}
                                    disabled={isUploading}
                                    placeholder="hf_..."
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600"
                                />
                                <p className="text-xs text-slate-500">Token with write permissions required</p>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={rememberToken}
                                        onChange={(e) => setRememberToken(e.target.checked)}
                                        className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs text-slate-400 select-none">Remember Access Token</span>
                                </label>
                            </div>
                        </div>

                        {/* Action */}
                        <div className="pt-4">
                            <button
                                onClick={handleUpload}
                                disabled={isUploading}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all shadow-lg ${isUploading
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-900/30'
                                    }`}
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={18} />
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={18} />
                                        Start Upload
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Logs / Status */}
                <div className="flex-1 flex flex-col bg-slate-950 p-6 min-w-0">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-slate-400">
                            <Terminal size={18} />
                            <h2 className="text-sm font-semibold uppercase tracking-wider">Output Logs</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            {status === 'running' && <span className="flex items-center gap-2 text-xs text-indigo-400"><Activity size={14} className="animate-spin" /> In Progress</span>}
                            {status === 'completed' && <span className="flex items-center gap-2 text-xs text-emerald-400"><Check size={14} /> Completed</span>}
                            {status === 'error' && <span className="flex items-center gap-2 text-xs text-red-400"><AlertCircle size={14} /> Failed</span>}
                        </div>
                    </div>

                    <div className="flex-1 bg-black/50 border border-slate-800 rounded-xl p-4 overflow-y-auto font-mono text-sm leading-relaxed custom-scrollbar shadow-inner">
                        {logs.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-600 italic">
                                Ready to upload
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
            </div>
        </div>
    );
};

export default UploadPage;
