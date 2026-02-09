import React from 'react';
import { BarChart3 } from 'lucide-react';
import ResultCard from './ResultCard';
import SaveToDataset from './SaveToDataset';
import BatchResultRow from './BatchResultRow'; // Import new component

const ResultsDisplay = ({
    compareMode,
    resultA,
    resultB,
    isProcessing,
    comparison,
    saveConfig,
    setSaveConfig,
    availableBuckets,
    handleSave,
    isSaving,
    // New Props
    batchResults = [],
    processingStatus = '',
    modelA,
    modelB,
    selectedBucket, // Need this to pass to BatchResultRow
    apiBaseUrl,
    onRemoveResult // New prop
}) => {
    // Determine if we are in batch mode
    const isBatchMode = batchResults.length > 0;

    return (
        <div className="flex-1 p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 text-slate-400">
                <BarChart3 size={18} />
                <h2 className="text-sm font-semibold uppercase tracking-wider">
                    {isBatchMode ? 'Batch Results' : 'Results'}
                </h2>
                {processingStatus && (
                    <span className="ml-auto text-xs text-indigo-400 animate-pulse bg-indigo-500/10 px-2 py-1 rounded">
                        {processingStatus}
                    </span>
                )}
            </div>

            {isBatchMode ? (
                /* Batch View */
                <div className="space-y-3">
                    {/* Global Save Config (Target Bucket / Splits) - Apply to all batch items manually saved */}
                    <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 mb-4 flex gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-500 uppercase">Target Bucket:</span>
                            <select
                                value={saveConfig.bucket}
                                onChange={(e) => setSaveConfig({ ...saveConfig, bucket: e.target.value })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300 focus:outline-none"
                            >
                                <option value="">Select Bucket...</option>
                                {availableBuckets.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-500 uppercase">Splits:</span>
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={saveConfig.splits.train} onChange={e => setSaveConfig({ ...saveConfig, splits: { ...saveConfig.splits, train: e.target.checked } })} />
                                <span className="text-slate-300">Train</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={saveConfig.splits.test} onChange={e => setSaveConfig({ ...saveConfig, splits: { ...saveConfig.splits, test: e.target.checked } })} />
                                <span className="text-slate-300">Test</span>
                            </label>
                        </div>
                    </div>

                    {batchResults.map((result) => (
                        <BatchResultRow
                            key={result.id}
                            result={{ ...result, sourceBucket: selectedBucket }} // Pass source bucket
                            modelA={modelA}
                            modelB={modelB}
                            compareMode={compareMode}
                            availableBuckets={availableBuckets}
                            apiBaseUrl={apiBaseUrl}
                            saveConfig={saveConfig}
                            onRemoveResult={onRemoveResult}
                        />
                    ))}
                </div>
            ) : (
                /* Single View (Existing) */
                <>
                    <div className={`grid gap-4 ${compareMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <ResultCard
                            label={compareMode ? "Model A" : "Transcription"}
                            result={resultA}
                            isLoading={isProcessing}
                        />
                        {compareMode && (
                            <ResultCard
                                label="Model B"
                                result={resultB}
                                isLoading={isProcessing}
                            />
                        )}
                    </div>

                    {/* Comparison Summary */}
                    {comparison && (
                        <div className="mt-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-xl p-4 border border-indigo-500/30">
                            <h3 className="text-sm font-bold text-indigo-400 mb-2">Comparison Summary</h3>
                            <div className="flex gap-6 text-sm">
                                <div>
                                    <span className="text-slate-400">Speed Ratio:</span>
                                    <span className={`ml-2 font-bold ${comparison.speed_ratio > 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {comparison.speed_ratio > 1 ? `A is ${comparison.speed_ratio}x faster` : `B is ${(1 / comparison.speed_ratio).toFixed(2)}x faster`}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-400">Confidence Diff:</span>
                                    <span className={`ml-2 font-bold ${comparison.confidence_diff > 0 ? 'text-emerald-400' : comparison.confidence_diff < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                        {comparison.confidence_diff > 0 ? '+' : ''}{(comparison.confidence_diff * 100).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <SaveToDataset
                        saveConfig={saveConfig}
                        setSaveConfig={setSaveConfig}
                        availableBuckets={availableBuckets}
                        handleSave={handleSave}
                        isSaving={isSaving}
                        resultA={resultA}
                        resultB={resultB}
                    />
                </>
            )}
        </div>
    );
};

export default ResultsDisplay;
