import React from 'react';
import { Upload, FileAudio } from 'lucide-react';

const FileUploadInput = ({ uploadedFile, setUploadedFile }) => {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-center p-6 border-2 border-dashed border-slate-600 rounded-xl hover:border-indigo-500/50 transition-colors">
                <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setUploadedFile(e.target.files[0])}
                    className="hidden"
                    id="audio-upload"
                />
                <label htmlFor="audio-upload" className="cursor-pointer text-center">
                    <Upload className="mx-auto mb-2 text-slate-500" size={32} />
                    <p className="text-sm text-slate-400">
                        {uploadedFile ? uploadedFile.name : 'Click to upload audio file'}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">WAV, MP3, M4A</p>
                </label>
            </div>

            {/* Audio Preview for uploaded file */}
            {uploadedFile && (
                <div className="space-y-2 p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-2">
                        <FileAudio size={16} className="text-green-400" />
                        <span className="text-sm text-green-300 truncate">{uploadedFile.name}</span>
                    </div>
                    <audio
                        controls
                        src={URL.createObjectURL(uploadedFile)}
                        className="w-full h-10 rounded-lg"
                        style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.8 }}
                    />
                </div>
            )}
        </div>
    );
};

export default FileUploadInput;
