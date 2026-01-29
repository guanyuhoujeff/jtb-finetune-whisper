import React, { useState } from 'react';
import axios from 'axios';
import { Database, Upload, RefreshCw } from 'lucide-react';

const BulkUploadModal = ({ isOpen, onClose, bucket, split, onUploadComplete, apiBaseUrl }) => {
    const [csvFile, setCsvFile] = useState(null);
    const [audioFiles, setAudioFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!csvFile || audioFiles.length === 0) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('bucket', bucket);
        formData.append('split', split);
        formData.append('csv_file', csvFile);

        // Append multiple files with same key 'files'
        for (let i = 0; i < audioFiles.length; i++) {
            formData.append('files', audioFiles[i]);
        }

        try {
            const res = await axios.post(`${apiBaseUrl}/upload/bulk`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            alert(`Successfully uploaded ${res.data.count} records.`);
            onUploadComplete();
            onClose();
        } catch (err) {
            alert("Bulk upload failed: " + err.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Database size={20} /> Bulk Upload
                </h2>

                <div className="bg-indigo-900/20 border border-indigo-500/20 p-4 rounded-lg mb-6 text-sm text-indigo-300">
                    <p className="font-semibold mb-1">CSV Format Requirements:</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li>Must contain columns: <code className="bg-slate-800 px-1 rounded">file_name</code>, <code className="bg-slate-800 px-1 rounded">transcription</code></li>
                        <li>Optional columns: <code className="bg-slate-800 px-1 rounded">tags</code> (e.g. "noise, speech"), <code className="bg-slate-800 px-1 rounded">description</code></li>
                        <li>file_name should match the uploaded wav files (e.g. <code>audio_001.wav</code>)</li>
                    </ul>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Metadata CSV</label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => setCsvFile(e.target.files[0])}
                            className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Audio Files (.wav)</label>
                        <input
                            type="file"
                            accept=".wav"
                            multiple
                            onChange={(e) => setAudioFiles(e.target.files)}
                            className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">{audioFiles.length} files selected</p>
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
                            disabled={isUploading || !csvFile || audioFiles.length === 0}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors flex items-center gap-2"
                        >
                            {isUploading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                            Start Bulk Upload
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default BulkUploadModal;
