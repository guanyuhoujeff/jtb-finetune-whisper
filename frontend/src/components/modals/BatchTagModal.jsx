import React, { useState } from 'react';
import { Type } from 'lucide-react';
import TagSelector from '../common/TagSelector';

const BatchTagModal = ({ isOpen, onClose, selectedCount, onConfirm, availableTags }) => {
    const [tags, setTags] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!tags) return;

        setIsSaving(true);
        try {
            await onConfirm(tags);
            setTags(""); // Reset on success
            onClose();
        } catch (err) {
            // Error handled in parent
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Type size={20} /> Batch Add Tags
                </h2>
                <p className="text-slate-400 mb-4 text-sm">
                    Adding tags to <span className="text-indigo-400 font-bold">{selectedCount}</span> selected items.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Tags</label>
                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                            <TagSelector
                                value={tags}
                                onChange={setTags}
                                availableTags={availableTags}
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            Tips: You can select existing tags or type new ones separated by commas.
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
                            disabled={isSaving || !tags}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                        >
                            {isSaving ? "Adding..." : "Add Tags"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BatchTagModal;
