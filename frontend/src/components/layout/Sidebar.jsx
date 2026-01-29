import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { HardDrive, PlusCircle, FlaskConical, Cpu, Trash2, RefreshCw } from 'lucide-react';

// GPU Memory Widget Component
const GpuMemoryWidget = ({ apiBaseUrl }) => {
    const [gpuInfo, setGpuInfo] = useState(null);
    const [isReleasing, setIsReleasing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const fetchGpuStatus = async () => {
        if (!apiBaseUrl) return;
        try {
            const res = await axios.get(`${apiBaseUrl}/system/gpu-status`);
            setGpuInfo(res.data);
        } catch (err) {
            console.error("Failed to fetch GPU status", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchGpuStatus();
        const interval = setInterval(fetchGpuStatus, 10000); // Refresh every 10 seconds
        return () => clearInterval(interval);
    }, [apiBaseUrl]);

    const handleRelease = async () => {
        if (!apiBaseUrl) return;
        setIsReleasing(true);
        try {
            await axios.post(`${apiBaseUrl}/system/release-gpu`);
            await fetchGpuStatus();
        } catch (err) {
            console.error("Failed to release GPU", err);
        } finally {
            setIsReleasing(false);
        }
    };

    if (!apiBaseUrl || isLoading) {
        return (
            <div className="px-4 py-3 border-t border-slate-800">
                <div className="text-xs text-slate-500">Loading GPU info...</div>
            </div>
        );
    }

    if (!gpuInfo?.gpu?.gpu_available) {
        return null;
    }

    const memoryAllocatedMB = gpuInfo.gpu.memory_allocated_mb || 0;
    const memoryReservedMB = gpuInfo.gpu.memory_reserved_mb || 0;
    const cachedCount = gpuInfo.total_cached || 0;
    // Show release button if we have reserved memory (even if no models are "cached" in our tracking)
    const showReleaseButton = memoryReservedMB > 50 || cachedCount > 0;

    return (
        <div className="px-4 py-3 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium uppercase">
                    <Cpu size={12} />
                    GPU Memory
                </div>
                <button
                    onClick={fetchGpuStatus}
                    className="text-slate-500 hover:text-slate-300 p-1"
                    title="Refresh"
                >
                    <RefreshCw size={12} />
                </button>
            </div>
            <div className="space-y-2">
                <div className="text-sm space-y-1">
                    <div>
                        <span className={`font-mono ${memoryReservedMB > 1000 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {memoryReservedMB.toFixed(0)} MB
                        </span>
                        <span className="text-slate-500 ml-1">reserved</span>
                    </div>
                    <div className="text-xs text-slate-600">
                        {memoryAllocatedMB.toFixed(0)} MB in use
                    </div>
                </div>
                {cachedCount > 0 && (
                    <div className="text-xs text-slate-500">
                        {cachedCount} model{cachedCount > 1 ? 's' : ''} cached
                    </div>
                )}
                {showReleaseButton && (
                    <button
                        onClick={handleRelease}
                        disabled={isReleasing}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <Trash2 size={12} />
                        {isReleasing ? 'Releasing...' : 'Release GPU Memory'}
                    </button>
                )}
            </div>
        </div>
    );
};

const Sidebar = ({
    bucket,
    availableBuckets,
    onBucketSelect,
    onCloneBucket,
    onCreateBucket,
    onSettingsClick,
    view,
    onViewChange,
    apiBaseUrl
}) => {
    return (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col pt-6">
            <div className="px-6 mb-8">
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent inline-flex items-center gap-2">
                    <HardDrive size={24} className="text-indigo-400" />
                    MinIO ASR
                </h1>
                <p className="text-xs text-slate-500 mt-1">Dataset Manager</p>
            </div>

            {/* Navigation */}
            <div className="px-4 mb-6 space-y-1">
                <button
                    onClick={() => onViewChange('dataset')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${view === 'dataset'
                        ? 'bg-indigo-600/10 text-indigo-400'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                >
                    <HardDrive size={18} />
                    Dataset
                </button>
                <button
                    onClick={() => onViewChange('training')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${view === 'training'
                        ? 'bg-indigo-600/10 text-indigo-400'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                    Training
                </button>
                <button
                    onClick={() => onViewChange('evaluate')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${view === 'evaluate'
                        ? 'bg-purple-600/10 text-purple-400'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                >
                    <FlaskConical size={18} />
                    Evaluate
                </button>
            </div>

            {/* Bucket List in Sidebar */}
            {/* Bucket List in Sidebar - Only show in Dataset view */}
            {view === 'dataset' && (
                <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Buckets</h2>
                        <div className="flex items-center gap-2">
                            {bucket && (
                                <button
                                    onClick={onCloneBucket}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                    title="Clone Current Bucket"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    Clone
                                </button>
                            )}
                            <button
                                onClick={onCreateBucket}
                                className="text-indigo-400 hover:text-indigo-300 p-1 rounded hover:bg-slate-800 transition-colors"
                                title="Create New Bucket"
                            >
                                <PlusCircle size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {availableBuckets.map(b => (
                            <button
                                key={b}
                                onClick={() => onBucketSelect(b)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between group ${bucket === b
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                    }`}
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="truncate">{b}</span>
                                </div>
                                {bucket === b && <div className="w-1.5 h-1.5 rounded-full bg-white/50" />}
                            </button>
                        ))}
                        {availableBuckets.length === 0 && (
                            <div className="text-xs text-slate-600 px-2 py-4 text-center">
                                No buckets found
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* GPU Memory Management */}
            <GpuMemoryWidget apiBaseUrl={apiBaseUrl} />

            <div className="p-4 border-t border-slate-800">
                <button
                    onClick={onSettingsClick}
                    className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-slate-400 hover:bg-slate-800 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                    Settings
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
