import React, { useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';

const CopyBucketModal = ({ isOpen, onClose, selectedCount, buckets, onConfirm }) => {
    const [targetBucket, setTargetBucket] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!targetBucket) return;

        setIsSaving(true);
        try {
            await onConfirm(targetBucket);
            setTargetBucket(""); // Reset
            onClose();
        } catch (err) {
            // Error handled in parent
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Database size={20} /> Copy to Bucket
                </h2>
                <p className="text-slate-400 mb-4">
                    Copy <span className="text-white font-bold">{selectedCount}</span> selected items to:
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Target Bucket</label>
                        <select
                            value={targetBucket}
                            onChange={(e) => setTargetBucket(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                            required
                        >
                            <option value="">Select a bucket...</option>
                            {buckets.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
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
                            disabled={isSaving || !targetBucket}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors flex items-center gap-2"
                        >
                            {isSaving ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
                            Copy
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default CopyBucketModal;
