import React, { useState } from 'react';
import { Play, Check, Save, Loader2, AlertCircle, FileAudio } from 'lucide-react';
import axios from 'axios';

const BatchResultRow = ({ result, modelA, modelB, compareMode, availableBuckets, apiBaseUrl, saveConfig }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [transcription, setTranscription] = useState(
        result.resultA ? (result.resultA.transcription || '') : ''
    );
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'success', 'error', null

    // Determine status color
    const getStatusColor = () => {
        if (result.status === 'pending') return 'text-slate-500';
        if (result.status === 'processing') return 'text-indigo-400';
        if (result.status === 'error') return 'text-red-400';
        return 'text-emerald-400';
    };

    const handleSave = async (e) => {
        e.stopPropagation(); // Prevent toggling expand
        if (!saveConfig.bucket) {
            alert("Please select a target bucket in the main settings first.");
            return;
        }

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('transcription', transcription);
            formData.append('target_bucket', saveConfig.bucket);

            const splits = Object.keys(saveConfig.splits).filter(k => saveConfig.splits[k]);
            formData.append('splits', JSON.stringify(splits));

            formData.append('audio_source', 'bucket');
            // Assuming we stick to the currently selected bucket from main state which should be passed down
            // But wait, we need the source bucket name.
            // In the main EvaluatePage, we are using `selectedBucket`
            // We should probably rely on the parent to provide context or pass it explicitly.
            // For now let's assume `saveConfig.bucket` is the TARGET, but where is SOURCE?
            // The `result` object has `fileName`, but not bucket. 
            // We might need to pass `sourceBucket` as prop to BatchResultRow.
            // OR we assume the `audio_url` in result might help, but backend needs bucket+filename.
            // Let's assume we pass `sourceBucket` prop.
            formData.append('source_bucket', result.sourceBucket);
            formData.append('source_file', result.fileName);

            await axios.post(`${apiBaseUrl}/evaluate/save`, formData);
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(null), 3000);
        } catch (err) {
            console.error("Save failed", err);
            setSaveStatus('error');
            alert("Save failed: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden transition-all">
            {/* Header / Summary Row */}
            <div
                className="flex items-center p-3 gap-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={`p-1.5 rounded-full ${result.status === 'success' ? 'bg-emerald-500/10' : 'bg-slate-700'}`}>
                    {result.status === 'pending' && <Loader2 size={14} className="text-slate-500" />}
                    {result.status === 'processing' && <Loader2 size={14} className="text-indigo-400 animate-spin" />}
                    {result.status === 'success' && <Check size={14} className="text-emerald-400" />}
                    {result.status === 'error' && <AlertCircle size={14} className="text-red-400" />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-200 truncate pr-2" title={result.fileName}>
                            {result.fileName}
                        </span>
                        {result.status === 'success' && (
                            <div className="flex items-center gap-3 text-xs">
                                <span className="text-emerald-400">
                                    Conf: {(result.resultA?.confidence * 100).toFixed(0)}%
                                </span>
                                {compareMode && result.comparison && (
                                    <span className={`${result.comparison.speed_ratio > 1 ? 'text-indigo-400' : 'text-purple-400'}`}>
                                        {result.comparison.speed_ratio > 1 ? `A ${result.comparison.speed_ratio}x` : `B ${(1 / result.comparison.speed_ratio).toFixed(1)}x`}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                        {result.status === 'success'
                            ? (transcription || "No transcription")
                            : result.status === 'error' ? result.error : "Waiting..."}
                    </div>
                </div>

                {/* Save Action */}
                {result.status === 'success' && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`p-2 rounded-lg transition-colors ${saveStatus === 'success'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-700 hover:bg-emerald-600/20 hover:text-emerald-400 text-slate-400'}`}
                        title="Save to Dataset"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    </button>
                )}
            </div>

            {/* Expanded Content */}
            {isExpanded && result.status === 'success' && (
                <div className="p-4 border-t border-slate-700/50 bg-slate-900/30 space-y-3">
                    {/* Transcription Editor */}
                    <div>
                        <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">Transcription</label>
                        <textarea
                            value={transcription}
                            onChange={(e) => setTranscription(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 min-h-[60px]"
                        />
                    </div>

                    {/* Model B Comparison (ReadOnly) */}
                    {compareMode && result.resultB && (
                        <div className="pl-3 border-l-2 border-slate-700">
                            <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">Model B ({modelB.name})</label>
                            <p className="text-sm text-slate-400">{result.resultB.transcription}</p>
                            <div className="mt-1 flex gap-2 text-xs text-slate-500">
                                <span>Conf: {(result.resultB.confidence * 100).toFixed(1)}%</span>
                                <span>Time: {result.resultB.inference_time_ms}ms</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BatchResultRow;
