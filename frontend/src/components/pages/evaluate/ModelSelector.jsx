import React from 'react';
import { Brain, ArrowLeftRight, RefreshCw } from 'lucide-react';
import ModelCard from './ModelCard';

const ModelSelector = ({
    modelA,
    setModelA,
    modelB,
    setModelB,
    compareMode,
    availableModels,
    isProcessing,
    onRefresh
}) => {
    return (
        <div className="w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4 text-slate-400">
                <Brain size={18} />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Model Selection</h2>
            </div>

            <div className="space-y-4">
                <ModelCard
                    label="Model A"
                    model={modelA}
                    setModel={setModelA}
                    availableModels={availableModels}
                    disabled={isProcessing}
                />

                {compareMode && (
                    <>
                        <div className="flex items-center justify-center">
                            <ArrowLeftRight className="text-slate-500" size={20} />
                        </div>
                        <ModelCard
                            label="Model B"
                            model={modelB}
                            setModel={setModelB}
                            availableModels={availableModels}
                            disabled={isProcessing}
                        />
                    </>
                )}
            </div>

            {/* Refresh Button */}
            <button
                onClick={onRefresh}
                className="mt-4 w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 text-sm py-2"
            >
                <RefreshCw size={14} />
                Refresh Models
            </button>
        </div>
    );
};

export default ModelSelector;
