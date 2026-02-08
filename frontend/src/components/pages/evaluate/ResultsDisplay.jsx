import React from 'react';
import { BarChart3 } from 'lucide-react';
import ResultCard from './ResultCard';
import SaveToDataset from './SaveToDataset';

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
    isSaving
}) => {
    return (
        <div className="flex-1 p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 text-slate-400">
                <BarChart3 size={18} />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Results</h2>
            </div>

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
        </div>
    );
};

export default ResultsDisplay;
