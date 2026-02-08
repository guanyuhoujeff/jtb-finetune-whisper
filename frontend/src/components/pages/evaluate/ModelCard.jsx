import React from 'react';
import { Zap, Brain } from 'lucide-react';

const ModelCard = ({ label, model, setModel, availableModels, disabled }) => {
    const customModels = availableModels.filter(m => m.source === 'custom');
    const officialModels = availableModels.filter(m => m.source === 'official');

    return (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-indigo-400 uppercase">{label}</span>
            </div>

            {/* Source Toggle */}
            <div className="flex gap-2 mb-3">
                <button
                    onClick={() => setModel(prev => ({ ...prev, source: 'custom' }))}
                    disabled={disabled}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${model.source === 'custom'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        } disabled:opacity-50`}
                >
                    Custom (Trained)
                </button>
                <button
                    onClick={() => setModel(prev => ({ ...prev, source: 'official', variant: null }))}
                    disabled={disabled}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${model.source === 'official'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        } disabled:opacity-50`}
                >
                    Official Whisper
                </button>
            </div>

            {/* Model Selection */}
            <select
                value={model.name}
                onChange={(e) => setModel(prev => ({ ...prev, name: e.target.value }))}
                disabled={disabled}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 mb-3"
            >
                <option value="">Select a model</option>
                {model.source === 'custom' ? (
                    customModels.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                    ))
                ) : (
                    officialModels.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                    ))
                )}
            </select>

            {/* Variant Selection (only for custom models) */}
            {model.source === 'custom' && model.name && (
                <div className="flex gap-2">
                    {['ct2', 'merged'].map(variant => {
                        const selectedModel = customModels.find(m => m.name === model.name);
                        const hasVariant = selectedModel?.variants?.includes(variant);
                        return (
                            <button
                                key={variant}
                                onClick={() => setModel(prev => ({ ...prev, variant }))}
                                disabled={disabled || !hasVariant}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${model.variant === variant
                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                                    : hasVariant
                                        ? 'bg-slate-700 text-slate-400 hover:bg-slate-600 border border-transparent'
                                        : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-transparent'
                                    }`}
                            >
                                {variant === 'ct2' && <Zap size={12} />}
                                {variant === 'merged' && <Brain size={12} />}
                                {variant.toUpperCase()}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ModelCard;
