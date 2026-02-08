import React from 'react';
import { Database, Check, Save, Loader2 } from 'lucide-react';

const SaveToDataset = ({
    saveConfig,
    setSaveConfig,
    availableBuckets,
    handleSave,
    isSaving,
    resultA,
    resultB
}) => {
    // Only show if there are results
    if (!resultA && !resultB) return null;

    return (
        <div className="mt-6 border-t border-slate-800 pt-6">
            <div className="flex items-center gap-2 mb-4 text-slate-400">
                <Database size={18} />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Save to Dataset</h2>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 space-y-4">
                {/* Transcription Editor */}
                <div>
                    <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">
                        Verify & Edit Transcription
                    </label>
                    <textarea
                        value={saveConfig.transcription}
                        onChange={(e) => setSaveConfig(prev => ({ ...prev, transcription: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[80px]"
                        placeholder="Transcription text..."
                    />
                </div>

                <div className="flex gap-4">
                    {/* Target Bucket */}
                    <div className="flex-1">
                        <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">
                            Target Bucket
                        </label>
                        <select
                            value={saveConfig.bucket}
                            onChange={(e) => setSaveConfig(prev => ({ ...prev, bucket: e.target.value }))}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            {availableBuckets.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    </div>

                    {/* Splits */}
                    <div className="flex-1">
                        <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">
                            Add to Splits
                        </label>
                        <div className="flex gap-4 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${saveConfig.splits.train
                                    ? 'bg-indigo-500 border-indigo-500'
                                    : 'border-slate-600 group-hover:border-slate-500'
                                    }`}>
                                    {saveConfig.splits.train && <Check size={12} className="text-white" />}
                                </div>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={saveConfig.splits.train}
                                    onChange={(e) => setSaveConfig(prev => ({
                                        ...prev,
                                        splits: { ...prev.splits, train: e.target.checked }
                                    }))}
                                />
                                <span className="text-sm text-slate-300">Train</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${saveConfig.splits.test
                                    ? 'bg-indigo-500 border-indigo-500'
                                    : 'border-slate-600 group-hover:border-slate-500'
                                    }`}>
                                    {saveConfig.splits.test && <Check size={12} className="text-white" />}
                                </div>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={saveConfig.splits.test}
                                    onChange={(e) => setSaveConfig(prev => ({
                                        ...prev,
                                        splits: { ...prev.splits, test: e.target.checked }
                                    }))}
                                />
                                <span className="text-sm text-slate-300">Test</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {isSaving ? "Saving..." : "Save to Dataset"}
                </button>
            </div>
        </div>
    );
};

export default SaveToDataset;
