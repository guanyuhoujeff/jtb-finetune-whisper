import React from 'react';
import { Search, Trash2, Tag, Database, Upload, FileAudio } from 'lucide-react';

const TableToolbar = ({
    searchTerm,
    setSearchTerm,
    selectedCount,
    onBatchDelete,
    onBatchTag,
    onBatchCopy,
    onUploadClick,
    onBulkUploadClick
}) => {
    return (
        <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
                <Search size={18} className="text-slate-500" />
                <input
                    type="text"
                    placeholder="Search files, transcriptions, tags..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 text-sm w-full"
                />
            </div>

            <div className="flex items-center gap-2">
                {selectedCount > 0 && (
                    <div className="flex items-center gap-2 mr-2 animate-in fade-in slide-in-from-right-4 duration-300">
                        <button
                            onClick={onBatchDelete}
                            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-sm transition-colors border border-red-500/20"
                        >
                            <Trash2 size={16} /> Delete ({selectedCount})
                        </button>
                        <button
                            onClick={onBatchTag}
                            className="flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 px-3 py-1.5 rounded-lg text-sm transition-colors border border-indigo-500/20"
                        >
                            <Tag size={16} /> Add Tag
                        </button>
                        <button
                            onClick={onBatchCopy}
                            className="flex items-center gap-2 bg-cyan-600/80 hover:bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                        >
                            <Database size={16} /> Copy to Bucket
                        </button>
                    </div>
                )}
                <div className="h-6 w-px bg-slate-700 mx-2" />
                <button
                    onClick={onUploadClick}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg shadow-lg shadow-indigo-500/20 transition-all text-sm font-medium"
                >
                    <Upload size={18} /> Upload Sample
                </button>
                <button
                    onClick={onBulkUploadClick}
                    className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all text-sm font-medium"
                >
                    <FileAudio size={18} /> Bulk Upload
                </button>
            </div>
        </div>
    );
};

export default TableToolbar;
