import React from 'react';
import { Upload, FileAudio } from 'lucide-react';

const FileUploadInput = ({ uploadedFiles = [], setUploadedFiles }) => {
    const [previewIndex, setPreviewIndex] = React.useState(null);

    // Update preview index when files change
    React.useEffect(() => {
        if (uploadedFiles.length > 0 && previewIndex === null) {
            setPreviewIndex(uploadedFiles.length - 1);
        } else if (uploadedFiles.length === 0) {
            setPreviewIndex(null);
        } else if (previewIndex >= uploadedFiles.length) {
            setPreviewIndex(uploadedFiles.length - 1);
        }
    }, [uploadedFiles.length]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            // Convert FileList to Array and append to existing files
            const newFiles = Array.from(e.target.files);
            setUploadedFiles(prev => {
                const updated = [...(prev || []), ...newFiles];
                // Automatically preview the last added file
                setPreviewIndex(updated.length - 1);
                return updated;
            });
        }
    };

    const removeFile = (index, e) => {
        e.stopPropagation(); // Prevent triggering preview selection
        setUploadedFiles(prev => prev.filter((_, i) => i !== index));

        // Adjust preview index if needed
        if (index === previewIndex) {
            setPreviewIndex(null); // Will be reset by useEffect or user
        } else if (index < previewIndex) {
            setPreviewIndex(prev => prev - 1);
        }
    };

    const clearAll = () => {
        setUploadedFiles([]);
        setPreviewIndex(null);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-center p-6 border-2 border-dashed border-slate-600 rounded-xl hover:border-indigo-500/50 transition-colors relative">
                <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="audio-upload"
                    multiple
                />
                <label htmlFor="audio-upload" className="cursor-pointer text-center w-full h-full flex flex-col items-center justify-center">
                    <Upload className="mx-auto mb-2 text-slate-500" size={32} />
                    <p className="text-sm text-slate-400">
                        Click to upload audio files
                    </p>
                    <p className="text-xs text-slate-600 mt-1">WAV, MP3, M4A (Multiple allowed)</p>
                </label>
            </div>

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 uppercase font-medium">{uploadedFiles.length} Files Selected</span>
                        <button onClick={clearAll} className="text-xs text-slate-500 hover:text-slate-300">Clear All</button>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {uploadedFiles.map((file, index) => {
                            const isPreviewing = previewIndex === index;
                            return (
                                <div
                                    key={`${file.name}-${index}`}
                                    onClick={() => setPreviewIndex(index)}
                                    className={`p-3 rounded-lg border flex items-center justify-between group cursor-pointer transition-all ${isPreviewing
                                        ? 'bg-indigo-500/20 border-indigo-500/50 ring-1 ring-indigo-500/50'
                                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                                        }`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isPreviewing ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'
                                            }`}>
                                            <FileAudio size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-sm truncate font-medium ${isPreviewing ? 'text-indigo-200' : 'text-slate-300'
                                                }`}>{file.name}</p>
                                            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isPreviewing && <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Playing</span>}
                                        <button
                                            onClick={(e) => removeFile(index, e)}
                                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors"
                                            title="Remove file"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                </div>
            )}
        </div>
    );
};

export default FileUploadInput;
