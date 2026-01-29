import React, { useState } from 'react';
import { HardDrive, PlusCircle, Database } from 'lucide-react';

const BucketSelectionModal = ({ isOpen, buckets, onSelect, onCreate }) => {
    const [searchTerm, setSearchTerm] = useState("");

    if (!isOpen) return null;

    const filteredBuckets = buckets.filter(b => b.includes(searchTerm));

    return (
        <div className="fixed inset-0 bg-slate-950 backdrop-blur-xl flex items-center justify-center z-[100]">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-2xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent inline-flex items-center gap-3">
                        <HardDrive size={32} className="text-indigo-400" />
                        MinIO ASR Manager
                    </h1>
                    <p className="text-slate-400 mt-2">Select a bucket to manage your audio datasets</p>
                </div>

                <div className="flex gap-4 mb-6">
                    <input
                        type="text"
                        placeholder="Search buckets..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                        onClick={onCreate}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium"
                    >
                        <PlusCircle size={18} /> New Bucket
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {buckets.length === 0 ? (
                        <div className="col-span-2 text-center text-slate-500 py-8">
                            No buckets found. Create one to get started.
                        </div>
                    ) : (
                        filteredBuckets.map(b => (
                            <button
                                key={b}
                                onClick={() => onSelect(b)}
                                className="text-left p-4 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-600/10 hover:text-indigo-300 transition-all group flex items-center justify-between"
                            >
                                <span className="font-mono text-sm">{b}</span>
                                <Database size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        ))
                    )}
                </div>

                <div className="mt-6 text-center text-xs text-slate-600">
                    Connected to {localStorage.getItem('minio_endpoint') || 'default endpoint'}
                </div>
            </div>
        </div>
    );
};

export default BucketSelectionModal;
