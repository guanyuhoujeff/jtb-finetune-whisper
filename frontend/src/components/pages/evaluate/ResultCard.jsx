import React from 'react';
import { Loader2, BarChart3, Clock } from 'lucide-react';

const ResultCard = ({ label, result, isLoading }) => {
    if (isLoading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-400" size={24} />
                <span className="ml-2 text-slate-400">Processing...</span>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 flex items-center justify-center text-slate-500 italic">
                No result yet
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-400 uppercase">{label}</span>
                <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-400">
                        <BarChart3 size={12} />
                        {(result.confidence * 100).toFixed(1)}%
                    </span>
                    <span className="flex items-center gap-1 text-blue-400">
                        <Clock size={12} />
                        {result.inference_time_ms}ms
                    </span>
                </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 text-slate-200 text-sm leading-relaxed">
                {result.transcription || <span className="text-slate-500 italic">No transcription</span>}
            </div>
        </div>
    );
};

export default ResultCard;
