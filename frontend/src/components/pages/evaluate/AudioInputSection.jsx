import React from 'react';
import { Database, Upload, Mic, Play, Loader2, FileAudio } from 'lucide-react';
import BucketInput from './AudioInput/BucketInput';
import FileUploadInput from './AudioInput/FileUploadInput';
import MicInput from './AudioInput/MicInput';

const AudioInputSection = ({
    audioTab,
    setAudioTab,
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
    bucketTotal,
    uploadedFile,
    setUploadedFile,
    selectedDeviceId,
    setSelectedDeviceId,
    audioDevices,
    isRecording,
    startRecording,
    stopRecording,
    recordedAudio,
    runInference,
    isProcessing,
    modelA,
    compareMode
}) => {
    return (
        <div className="border-b border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center gap-2 mb-4 text-slate-400">
                <FileAudio size={18} />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Audio Input</h2>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-4">
                {[
                    { id: 'bucket', label: 'From Bucket', icon: Database },
                    { id: 'upload', label: 'Upload File', icon: Upload },
                    { id: 'mic', label: 'Microphone', icon: Mic },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setAudioTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${audioTab === tab.id
                            ? 'bg-indigo-500/20 border border-indigo-500/50 text-indigo-400'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                {audioTab === 'bucket' && (
                    <BucketInput
                        selectedBucket={selectedBucket}
                        setSelectedBucket={setSelectedBucket}
                        availableBuckets={availableBuckets}
                        fileFilter={fileFilter}
                        setFileFilter={setFileFilter}
                        bucketFiles={bucketFiles}
                        selectedFile={selectedFile}
                        setSelectedFile={setSelectedFile}
                        bucketPage={bucketPage}
                        setBucketPage={setBucketPage}
                        bucketLimit={bucketLimit}
                        bucketTotal={bucketTotal}
                    />
                )}

                {audioTab === 'upload' && (
                    <FileUploadInput
                        uploadedFile={uploadedFile}
                        setUploadedFile={setUploadedFile}
                    />
                )}

                {audioTab === 'mic' && (
                    <MicInput
                        selectedDeviceId={selectedDeviceId}
                        setSelectedDeviceId={setSelectedDeviceId}
                        audioDevices={audioDevices}
                        isRecording={isRecording}
                        startRecording={startRecording}
                        stopRecording={stopRecording}
                        recordedAudio={recordedAudio}
                    />
                )}
            </div>

            {/* Run Button */}
            <button
                onClick={runInference}
                disabled={isProcessing || !modelA.name}
                className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all shadow-lg ${isProcessing
                    ? 'bg-slate-700 cursor-wait'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-900/30'
                    } disabled:opacity-50 disabled:cursor-not-allowed text-white`}
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="animate-spin" size={18} />
                        <span className="animate-pulse">Processing... Model loading may take a moment</span>
                    </>
                ) : (
                    <>
                        <Play size={18} />
                        {compareMode ? 'Compare Models' : 'Run Inference'}
                    </>
                )}
            </button>

            {/* Processing Overlay Hint */}
            {isProcessing && (
                <div className="mt-2 text-center text-sm text-slate-500 animate-pulse">
                    ⏳ First-time model loading may take 30-60 seconds...
                </div>
            )}
        </div>
    );
};

export default AudioInputSection;
