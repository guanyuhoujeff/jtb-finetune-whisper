import React from 'react';
import { FileAudio } from 'lucide-react';

const BucketInput = ({
    selectedBucket,
    setSelectedBucket,
    availableBuckets,
    fileFilter,
    setFileFilter,
    bucketFiles,
    selectedFile,
    setSelectedFile,
    bucketPage,
    setBucketPage,
    bucketLimit,
    bucketTotal
}) => {
    return (
        <div className="space-y-3">
            {/* Bucket Selection Row */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">Bucket</label>
                    <select
                        value={selectedBucket}
                        onChange={(e) => setSelectedBucket(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                        {availableBuckets.map(b => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1">
                    <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">Search (name, tags, description)</label>
                    <input
                        type="text"
                        value={fileFilter}
                        onChange={(e) => setFileFilter(e.target.value)}
                        placeholder="Filter by filename, tags, description..."
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                </div>
            </div>

            {/* File List */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-500 font-medium uppercase">Audio Files</label>
                    <span className="text-xs text-slate-600">
                        Page {bucketPage} of {Math.ceil(bucketTotal / bucketLimit) || 1} ({bucketTotal} total)
                    </span>
                </div>
                <div className="bg-slate-900/50 rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
                    {bucketFiles.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-sm italic">
                            No audio files found in this bucket
                        </div>
                    ) : (() => {
                        // Multi-field search
                        const searchLower = fileFilter.toLowerCase();
                        const filteredFiles = bucketFiles.filter(f => {
                            const name = (f.display_name || f.file_name || '').toLowerCase();
                            const tags = (f.tags || '').toLowerCase();
                            const desc = (f.description || '').toLowerCase();
                            return name.includes(searchLower) || tags.includes(searchLower) || desc.includes(searchLower);
                        });

                        if (filteredFiles.length === 0) {
                            return (
                                <div className="p-4 text-center text-slate-500 text-sm italic">
                                    No files match "{fileFilter}"
                                </div>
                            );
                        }

                        return filteredFiles.map(f => (
                            <button
                                key={f.file_name}
                                onClick={() => setSelectedFile(f.file_name)}
                                className={`w-full text-left px-3 py-2 text-sm border-b border-slate-800 last:border-b-0 transition-colors flex items-center gap-2 ${selectedFile === f.file_name
                                    ? 'bg-indigo-500/20 text-indigo-300'
                                    : 'text-slate-300 hover:bg-slate-800'
                                    }`}
                            >
                                <FileAudio size={14} className="flex-shrink-0 text-slate-500" />
                                <div className="flex-1 min-w-0">
                                    <span className="truncate block">{f.display_name || f.file_name}</span>
                                    {(f.tags || f.description) && (
                                        <span className="text-xs text-slate-500 truncate block">
                                            {f.tags && <span className="text-purple-400">[{f.tags}]</span>}
                                            {f.description && <span className="ml-1">{f.description}</span>}
                                        </span>
                                    )}
                                </div>
                            </button>
                        ));
                    })()}
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between mt-2">
                    <button
                        onClick={() => setBucketPage(p => Math.max(1, p - 1))}
                        disabled={bucketPage <= 1}
                        className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                    >
                        ← Previous
                    </button>
                    <span className="text-xs text-slate-500">
                        {(bucketPage - 1) * bucketLimit + 1}-{Math.min(bucketPage * bucketLimit, bucketTotal)} of {bucketTotal}
                    </span>
                    <button
                        onClick={() => setBucketPage(p => p + 1)}
                        disabled={bucketPage * bucketLimit >= bucketTotal}
                        className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                    >
                        Next →
                    </button>
                </div>
            </div>

            {/* Selected File Display with Audio Player */}
            {selectedFile && (
                <div className="space-y-2 p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/30">
                    <div className="flex items-center gap-2">
                        <FileAudio size={16} className="text-indigo-400" />
                        <span className="text-sm text-indigo-300">
                            {bucketFiles.find(f => f.file_name === selectedFile)?.display_name || selectedFile}
                        </span>
                    </div>
                    {bucketFiles.find(f => f.file_name === selectedFile)?.audio_url && (
                        <audio
                            controls
                            src={bucketFiles.find(f => f.file_name === selectedFile).audio_url}
                            className="w-full h-10 rounded-lg"
                            style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default BucketInput;
