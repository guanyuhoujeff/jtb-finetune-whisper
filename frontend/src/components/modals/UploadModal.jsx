import React, { useState } from 'react';
import axios from 'axios';
import { Upload, RefreshCw } from 'lucide-react';
import TagSelector from '../common/TagSelector';

const UploadModal = ({ isOpen, onClose, bucket, split, onUploadComplete, availableTags, apiBaseUrl }) => {
    const [file, setFile] = useState(null);
    const [transcription, setTranscription] = useState("");
    const [tags, setTags] = useState("");
    const [description, setDescription] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !transcription) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('bucket', bucket);
        formData.append('split', split);
        formData.append('transcription', transcription);
        formData.append('tags', tags);
        formData.append('description', description);
        formData.append('file', file);

        try {
            await axios.post(`${apiBaseUrl}/upload`, formData);
            onUploadComplete();
            onClose();
        } catch (err) {
            alert("Upload failed: " + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Upload size={20} /> Upload New Sample
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Audio File (.wav)</label>
                        <input
                            type="file"
                            accept=".wav"
                            onChange={(e) => setFile(e.target.files[0])}
                            className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Transcription</label>
                        <textarea
                            value={transcription}
                            onChange={(e) => setTranscription(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                            rows={3}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Tags (optional)</label>
                            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
                                <TagSelector
                                    value={tags}
                                    onChange={setTags}
                                    availableTags={availableTags}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-1">Description (optional)</label>
                            <input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Details..."
                            />
                        </div>
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
                            disabled={isUploading || !file}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors flex items-center gap-2"
                        >
                            {isUploading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                            Upload
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UploadModal;
