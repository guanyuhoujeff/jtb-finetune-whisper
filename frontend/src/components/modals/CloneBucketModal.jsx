import React, { useState } from 'react';
import { Database } from 'lucide-react';

const CloneBucketModal = ({ isOpen, onClose, sourceBucket, onClone, availableBuckets }) => {
    const [mode, setMode] = useState("new"); // "new" or "existing"
    const [targetName, setTargetName] = useState("");
    const [isCloning, setIsCloning] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!targetName) return;

        setIsCloning(true);
        try {
            await onClone(targetName);
            onClose();
        } catch (err) {
            alert("Failed to clone bucket: " + err.message);
        } finally {
            setIsCloning(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Database size={20} /> Clone / Merge Bucket
                </h2>
                <div className="bg-slate-800 rounded p-3 mb-4 text-sm text-slate-300">
                    <span className="text-slate-500">Source:</span> <span className="font-mono text-white">{sourceBucket}</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-4 mb-4">
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input
                                type="radio"
                                name="cloneMode"
                                value="new"
                                checked={mode === "new"}
                                onChange={(e) => { setMode("new"); setTargetName(""); }}
                                className="accent-indigo-500"
                            />
                            New Bucket
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input
                                type="radio"
                                name="cloneMode"
                                value="existing"
                                checked={mode === "existing"}
                                onChange={(e) => { setMode("existing"); setTargetName(""); }}
                                className="accent-indigo-500"
                            />
                            Existing Bucket
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">
                            {mode === "new" ? "New Bucket Name" : "Select Target Bucket"}
                        </label>
                        {mode === "new" ? (
                            <input
                                value={targetName}
                                onChange={(e) => setTargetName(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. my-dataset-v2"
                                required
                            />
                        ) : (
                            <select
                                value={targetName}
                                onChange={(e) => setTargetName(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            >
                                <option value="">Select bucket...</option>
                                {availableBuckets.filter(b => b !== sourceBucket).map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                        )}

                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                            {mode === "new"
                                ? "Creates a new bucket and copies all data."
                                : "Copies all data to the selected bucket. Existing metadata will be merged (appended)."}
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isCloning || !targetName}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                        >
                            {isCloning ? "Processing..." : (mode === "new" ? "Clone Bucket" : "Merge Bucket")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default CloneBucketModal;
