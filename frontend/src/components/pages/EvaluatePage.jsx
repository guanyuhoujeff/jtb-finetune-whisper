import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    FlaskConical, Play, Mic, MicOff, Upload, Database,
    ChevronRight, Check, Loader2, Brain, Zap, Clock,
    BarChart3, FileAudio, RefreshCw, ArrowLeftRight, Save
} from 'lucide-react';

// Model Card Component
const ModelCard = ({ label, model, setModel, availableModels, disabled }) => {
    const customModels = availableModels.filter(m => m.source === 'custom');
    const officialModels = availableModels.filter(m => m.source === 'official');

    return (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-indigo-400 uppercase">{label}</span>
            </div>

            {/* Source Toggle */}
            <div className="flex gap-2 mb-3">
                <button
                    onClick={() => setModel(prev => ({ ...prev, source: 'custom' }))}
                    disabled={disabled}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${model.source === 'custom'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        } disabled:opacity-50`}
                >
                    Custom (Trained)
                </button>
                <button
                    onClick={() => setModel(prev => ({ ...prev, source: 'official', variant: null }))}
                    disabled={disabled}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${model.source === 'official'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        } disabled:opacity-50`}
                >
                    Official Whisper
                </button>
            </div>

            {/* Model Selection */}
            <select
                value={model.name}
                onChange={(e) => setModel(prev => ({ ...prev, name: e.target.value }))}
                disabled={disabled}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50 mb-3"
            >
                <option value="">Select a model</option>
                {model.source === 'custom' ? (
                    customModels.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                    ))
                ) : (
                    officialModels.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                    ))
                )}
            </select>

            {/* Variant Selection (only for custom models) */}
            {model.source === 'custom' && model.name && (
                <div className="flex gap-2">
                    {['ct2', 'merged'].map(variant => {
                        const selectedModel = customModels.find(m => m.name === model.name);
                        const hasVariant = selectedModel?.variants?.includes(variant);
                        return (
                            <button
                                key={variant}
                                onClick={() => setModel(prev => ({ ...prev, variant }))}
                                disabled={disabled || !hasVariant}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${model.variant === variant
                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                                    : hasVariant
                                        ? 'bg-slate-700 text-slate-400 hover:bg-slate-600 border border-transparent'
                                        : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-transparent'
                                    }`}
                            >
                                {variant === 'ct2' && <Zap size={12} />}
                                {variant === 'merged' && <Brain size={12} />}
                                {variant.toUpperCase()}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Result Card Component
const ResultCard = ({ label, result, isLoading }) => {
    if (isLoading) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-400" size={24} />
                <span className="ml-2 text-slate-400">Processing...</span>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 flex items-center justify-center text-slate-500 italic">
                No result yet
            </div>
        );
    }

    return (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-400 uppercase">{label}</span>
                <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-400">
                        <BarChart3 size={12} />
                        {(result.confidence * 100).toFixed(1)}%
                    </span>
                    <span className="flex items-center gap-1 text-blue-400">
                        <Clock size={12} />
                        {result.inference_time_ms}ms
                    </span>
                </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 text-slate-200 text-sm leading-relaxed">
                {result.transcription || <span className="text-slate-500 italic">No transcription</span>}
            </div>
        </div>
    );
};

const EvaluatePage = ({ apiBaseUrl }) => {
    // Models
    const [availableModels, setAvailableModels] = useState([]);
    const [modelA, setModelA] = useState({ name: '', source: 'custom', variant: 'ct2' });
    const [modelB, setModelB] = useState({ name: 'whisper-large-v3', source: 'official', variant: null });

    // Compare mode
    const [compareMode, setCompareMode] = useState(false);

    // Audio input
    const [audioTab, setAudioTab] = useState('bucket'); // 'bucket', 'upload', 'mic'
    const [availableBuckets, setAvailableBuckets] = useState([]);
    const [selectedBucket, setSelectedBucket] = useState('');
    const [bucketFiles, setBucketFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState('');
    const [uploadedFile, setUploadedFile] = useState(null);
    const [fileFilter, setFileFilter] = useState('');  // Search filter for bucket files

    // Pagination for bucket files
    const [bucketPage, setBucketPage] = useState(1);
    const [bucketTotal, setBucketTotal] = useState(0);
    const bucketLimit = 50;
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Recording
    const [isRecording, setIsRecording] = useState(false);
    const [recordedAudio, setRecordedAudio] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // Microphone devices
    const [audioDevices, setAudioDevices] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');

    // Results
    const [resultA, setResultA] = useState(null);
    const [resultB, setResultB] = useState(null);
    const [comparison, setComparison] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch models and buckets on mount
    useEffect(() => {
        if (!apiBaseUrl) return;

        const fetchModels = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/evaluate/models`);
                setAvailableModels(res.data.models);

                // Auto-select first custom model if available
                const firstCustom = res.data.models.find(m => m.source === 'custom');
                if (firstCustom) {
                    setModelA({
                        name: firstCustom.name,
                        source: 'custom',
                        variant: firstCustom.variants.includes('ct2') ? 'ct2' : firstCustom.variants[0]
                    });
                }
            } catch (err) {
                console.error("Failed to fetch models", err);
            }
        };

        const fetchBuckets = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/buckets`);
                setAvailableBuckets(res.data.buckets);
                if (res.data.buckets.length > 0) {
                    setSelectedBucket(res.data.buckets[0]);
                }
            } catch (err) {
                console.error("Failed to fetch buckets", err);
            }
        };

        fetchModels();
        fetchBuckets();
    }, [apiBaseUrl]);

    // Fetch bucket files when bucket or page changes
    useEffect(() => {
        if (!apiBaseUrl || !selectedBucket) return;

        const fetchFiles = async () => {
            try {
                const res = await axios.get(`${apiBaseUrl}/dataset/${selectedBucket}/train?page=${bucketPage}&limit=${bucketLimit}`);
                const data = res.data?.data || [];
                const total = res.data?.total || 0;

                // Extract audio files from the dataset
                // The API returns 'audio' field as S3 URI like "s3://bucket/train/filename.wav"
                const audioFiles = data
                    .filter(item => {
                        const audio = item.audio || '';
                        return audio.endsWith('.wav') || audio.endsWith('.mp3') || audio.endsWith('.m4a');
                    })
                    .map(item => {
                        // Extract object path from S3 URI (e.g., "s3://bucket/train/file.wav" -> "train/file.wav")
                        const audio = item.audio || '';
                        const prefix = `s3://${selectedBucket}/`;
                        const objectPath = audio.startsWith(prefix) ? audio.slice(prefix.length) : audio.split('/').slice(-2).join('/');
                        const displayName = audio.split('/').pop();
                        return {
                            file_name: objectPath,  // Full object path for API
                            display_name: displayName,  // Just filename for display
                            audio_url: item.audio_url,
                            transcription: item.transcription || '',
                            tags: item.tags || '',
                            description: item.description || ''
                        };
                    });

                setBucketFiles(audioFiles);
                setBucketTotal(total);

                // Only auto-select first file if on first page and no file selected
                if (audioFiles.length > 0 && !selectedFile) {
                    setSelectedFile(audioFiles[0].file_name);
                }
            } catch (err) {
                console.error("Failed to fetch files", err);
                setBucketFiles([]);
                setBucketTotal(0);
                setSelectedFile('');
            }
        };

        fetchFiles();
    }, [apiBaseUrl, selectedBucket, bucketPage, refreshTrigger]);

    // Reset page when bucket changes
    useEffect(() => {
        setBucketPage(1);
        setSelectedFile('');
    }, [selectedBucket]);

    // Fetch audio input devices
    useEffect(() => {
        const getAudioDevices = async () => {
            try {
                // Request permission first to get device labels
                await navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => stream.getTracks().forEach(track => track.stop()));

                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                setAudioDevices(audioInputs);

                // Auto-select default device
                if (audioInputs.length > 0 && !selectedDeviceId) {
                    setSelectedDeviceId(audioInputs[0].deviceId);
                }
            } catch (err) {
                console.error("Failed to enumerate audio devices", err);
            }
        };

        if (audioTab === 'mic') {
            getAudioDevices();
        }
    }, [audioTab]);

    // Start/Stop Recording
    const startRecording = async () => {
        try {
            const constraints = {
                audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                audioChunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                setRecordedAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Failed to start recording", err);
            alert("Could not access microphone");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    // Run Inference
    const runInference = async () => {
        if (!modelA.name) {
            alert("Please select a model");
            return;
        }

        setIsProcessing(true);
        setResultA(null);
        setResultB(null);
        setComparison(null);

        try {
            if (audioTab === 'upload' && uploadedFile) {
                // Use form data for file upload
                const formData = new FormData();
                formData.append('model_name', modelA.name);
                formData.append('source', modelA.source);
                if (modelA.variant) formData.append('variant', modelA.variant);
                formData.append('audio_file', uploadedFile);

                const res = await axios.post(`${apiBaseUrl}/evaluate/infer-upload`, formData);
                setResultA(res.data);

                // Compare if enabled
                if (compareMode && modelB.name) {
                    const formDataB = new FormData();
                    formDataB.append('model_name', modelB.name);
                    formDataB.append('source', modelB.source);
                    if (modelB.variant) formDataB.append('variant', modelB.variant);
                    formDataB.append('audio_file', uploadedFile);

                    const resB = await axios.post(`${apiBaseUrl}/evaluate/infer-upload`, formDataB);
                    setResultB(resB.data);
                }
            } else if (audioTab === 'mic' && recordedAudio) {
                // Convert blob to base64
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = reader.result.split(',')[1];

                    if (compareMode && modelB.name) {
                        const res = await axios.post(`${apiBaseUrl}/evaluate/compare`, {
                            model_a: modelA,
                            model_b: modelB,
                            audio_source: 'recording',
                            audio_base64: base64
                        });
                        setResultA(res.data.model_a);
                        setResultB(res.data.model_b);
                        setComparison(res.data.comparison);
                    } else {
                        const res = await axios.post(`${apiBaseUrl}/evaluate/infer`, {
                            ...modelA,
                            model_name: modelA.name,
                            audio_source: 'recording',
                            audio_base64: base64
                        });
                        setResultA(res.data);
                    }
                    setIsProcessing(false);
                };
                reader.readAsDataURL(recordedAudio);
                return;
            } else if (audioTab === 'bucket' && selectedFile) {
                if (compareMode && modelB.name) {
                    const res = await axios.post(`${apiBaseUrl}/evaluate/compare`, {
                        model_a: modelA,
                        model_b: modelB,
                        audio_source: 'bucket',
                        bucket_name: selectedBucket,
                        file_name: selectedFile
                    });
                    setResultA(res.data.model_a);
                    setResultB(res.data.model_b);
                    setComparison(res.data.comparison);
                } else {
                    const res = await axios.post(`${apiBaseUrl}/evaluate/infer`, {
                        ...modelA,
                        model_name: modelA.name,
                        audio_source: 'bucket',
                        bucket_name: selectedBucket,
                        file_name: selectedFile
                    });
                    setResultA(res.data);
                }
            }
        } catch (err) {
            console.error("Inference failed", err);
            alert("Inference failed: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsProcessing(false);
        }
    };

    // Save to Dataset Logic
    const [saveConfig, setSaveConfig] = useState({
        transcription: '',
        splits: { train: true, test: false },
        bucket: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    // Update save config when results change (default to Result A)
    useEffect(() => {
        if (resultA) {
            setSaveConfig(prev => ({
                ...prev,
                transcription: resultA.transcription || '',
                bucket: selectedBucket || availableBuckets[0] || ''
            }));
        } else if (resultB) {
            setSaveConfig(prev => ({
                ...prev,
                transcription: resultB.transcription || '',
                bucket: selectedBucket || availableBuckets[0] || ''
            }));
        }
    }, [resultA, resultB, selectedBucket, availableModels]); // Added availableModels dependency just in case

    const handleSave = async () => {
        const splits = Object.keys(saveConfig.splits).filter(k => saveConfig.splits[k]);
        if (splits.length === 0) {
            alert("Please select at least one split (Train or Test)");
            return;
        }
        if (!saveConfig.bucket) {
            alert("Please select a target bucket");
            return;
        }

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('transcription', saveConfig.transcription);
            formData.append('target_bucket', saveConfig.bucket);
            formData.append('splits', JSON.stringify(splits));

            // Audio Source Logic
            if (audioTab === 'bucket' && selectedFile) {
                formData.append('audio_source', 'bucket');
                formData.append('source_bucket', selectedBucket);
                formData.append('source_file', selectedFile);
            } else if (audioTab === 'upload' && uploadedFile) {
                formData.append('audio_source', 'upload');
                formData.append('audio_file', uploadedFile);
            } else if (audioTab === 'mic' && recordedAudio) {
                formData.append('audio_source', 'upload');
                // Convert blob to file
                formData.append('audio_file', recordedAudio, `recording_${Date.now()}.wav`);
            } else {
                throw new Error("No valid audio source found");
            }

            await axios.post(`${apiBaseUrl}/evaluate/save`, formData);
            alert("Successfully saved to dataset!");

            // Refresh file list if we saved to the current bucket
            if (saveConfig.bucket === selectedBucket && audioTab === 'bucket') {
                // Trigger a re-fetch by toggling page or similar, or just manually calling fetching logic.
                // Simplest way is to temporarily clear bucketFiles or force fetch.
                // We'll reset bucketPage which triggers the useEffect.
                setBucketPage(1);
                // If we are already on page 1, the effect might not fire if only page depends on it.
                // But selectedBucket is same. Let's add a dummy state to force refresh or just direct call.
                // Actually, the useEffect depends on [apiBaseUrl, selectedBucket, bucketPage].
                // If we stay on page 1, we need another trigger.
                // Let's create a refresh trigger.
                setRefreshTrigger(prev => prev + 1);
            }

        } catch (err) {
            console.error("Save failed", err);
            alert("Save failed: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-3">
                    <FlaskConical className="text-purple-500" size={24} />
                    <h1 className="text-xl font-bold text-slate-100">Model Evaluation</h1>
                </div>

                {/* Compare Mode Toggle */}
                <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">Compare Mode</span>
                    <button
                        onClick={() => setCompareMode(!compareMode)}
                        className={`relative w-12 h-6 rounded-full transition-all ${compareMode ? 'bg-indigo-500' : 'bg-slate-700'
                            }`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${compareMode ? 'left-7' : 'left-1'
                            }`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Model Selection */}
                <div className="w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-4 text-slate-400">
                        <Brain size={18} />
                        <h2 className="text-sm font-semibold uppercase tracking-wider">Model Selection</h2>
                    </div>

                    <div className="space-y-4">
                        <ModelCard
                            label="Model A"
                            model={modelA}
                            setModel={setModelA}
                            availableModels={availableModels}
                            disabled={isProcessing}
                        />

                        {compareMode && (
                            <>
                                <div className="flex items-center justify-center">
                                    <ArrowLeftRight className="text-slate-500" size={20} />
                                </div>
                                <ModelCard
                                    label="Model B"
                                    model={modelB}
                                    setModel={setModelB}
                                    availableModels={availableModels}
                                    disabled={isProcessing}
                                />
                            </>
                        )}
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-200 text-sm py-2"
                    >
                        <RefreshCw size={14} />
                        Refresh Models
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Audio Input Section */}
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
                                                // Multi-field search: filename, tags, description
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
                            )}

                            {audioTab === 'upload' && (
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
                            )}

                            {audioTab === 'mic' && (
                                <div className="flex flex-col items-center justify-center py-6">
                                    {/* Device Selection */}
                                    {audioDevices.length > 0 && (
                                        <div className="w-full max-w-md mb-4">
                                            <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">
                                                Select Microphone
                                            </label>
                                            <select
                                                value={selectedDeviceId}
                                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                                disabled={isRecording}
                                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                                            >
                                                {audioDevices.map(device => (
                                                    <option key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <button
                                        onClick={isRecording ? stopRecording : startRecording}
                                        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isRecording
                                            ? 'bg-red-500 animate-pulse'
                                            : 'bg-indigo-500 hover:bg-indigo-400'
                                            }`}
                                    >
                                        {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
                                    </button>
                                    <p className="mt-3 text-sm text-slate-400">
                                        {isRecording ? 'Recording... Click to stop' :
                                            recordedAudio ? 'Recording ready' : 'Click to start recording'}
                                    </p>

                                    {/* Audio Playback */}
                                    {recordedAudio && !isRecording && (
                                        <div className="mt-4 w-full max-w-md">
                                            <audio
                                                controls
                                                src={URL.createObjectURL(recordedAudio)}
                                                className="w-full h-10 rounded-lg"
                                                style={{
                                                    filter: 'invert(1) hue-rotate(180deg)',
                                                    opacity: 0.8
                                                }}
                                            />
                                            <p className="text-xs text-slate-500 text-center mt-2">
                                                Preview your recording before inference
                                            </p>
                                        </div>
                                    )}
                                </div>
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

                    {/* Results Section */}
                    <div className="flex-1 p-4 overflow-y-auto">
                        <div className="flex items-center gap-2 mb-4 text-slate-400">
                            <BarChart3 size={18} />
                            <h2 className="text-sm font-semibold uppercase tracking-wider">Results</h2>
                        </div>

                        <div className={`grid gap-4 ${compareMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            <ResultCard
                                label={compareMode ? "Model A" : "Transcription"}
                                result={resultA}
                                isLoading={isProcessing}
                            />
                            {compareMode && (
                                <ResultCard
                                    label="Model B"
                                    result={resultB}
                                    isLoading={isProcessing}
                                />
                            )}
                        </div>

                        {/* Comparison Summary */}
                        {comparison && (
                            <div className="mt-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-xl p-4 border border-indigo-500/30">
                                <h3 className="text-sm font-bold text-indigo-400 mb-2">Comparison Summary</h3>
                                <div className="flex gap-6 text-sm">
                                    <div>
                                        <span className="text-slate-400">Speed Ratio:</span>
                                        <span className={`ml-2 font-bold ${comparison.speed_ratio > 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {comparison.speed_ratio > 1 ? `A is ${comparison.speed_ratio}x faster` : `B is ${(1 / comparison.speed_ratio).toFixed(2)}x faster`}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">Confidence Diff:</span>
                                        <span className={`ml-2 font-bold ${comparison.confidence_diff > 0 ? 'text-emerald-400' : comparison.confidence_diff < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                            {comparison.confidence_diff > 0 ? '+' : ''}{(comparison.confidence_diff * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Save to Dataset Section */}
                        {(resultA || resultB) && (
                            <div className="mt-6 border-t border-slate-800 pt-6">
                                <div className="flex items-center gap-2 mb-4 text-slate-400">
                                    <Database size={18} />
                                    <h2 className="text-sm font-semibold uppercase tracking-wider">Save to Dataset</h2>
                                </div>

                                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 space-y-4">
                                    {/* Transcription Editor */}
                                    <div>
                                        <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">
                                            Verify & Edit Transcription
                                        </label>
                                        <textarea
                                            value={saveConfig.transcription}
                                            onChange={(e) => setSaveConfig(prev => ({ ...prev, transcription: e.target.value }))}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[80px]"
                                            placeholder="Transcription text..."
                                        />
                                    </div>

                                    <div className="flex gap-4">
                                        {/* Target Bucket */}
                                        <div className="flex-1">
                                            <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">
                                                Target Bucket
                                            </label>
                                            <select
                                                value={saveConfig.bucket}
                                                onChange={(e) => setSaveConfig(prev => ({ ...prev, bucket: e.target.value }))}
                                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                            >
                                                {availableBuckets.map(b => (
                                                    <option key={b} value={b}>{b}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Splits */}
                                        <div className="flex-1">
                                            <label className="text-xs text-slate-500 font-medium uppercase mb-1 block">
                                                Add to Splits
                                            </label>
                                            <div className="flex gap-4 mt-2">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${saveConfig.splits.train
                                                        ? 'bg-indigo-500 border-indigo-500'
                                                        : 'border-slate-600 group-hover:border-slate-500'
                                                        }`}>
                                                        {saveConfig.splits.train && <Check size={12} className="text-white" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={saveConfig.splits.train}
                                                        onChange={(e) => setSaveConfig(prev => ({
                                                            ...prev,
                                                            splits: { ...prev.splits, train: e.target.checked }
                                                        }))}
                                                    />
                                                    <span className="text-sm text-slate-300">Train</span>
                                                </label>

                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${saveConfig.splits.test
                                                        ? 'bg-indigo-500 border-indigo-500'
                                                        : 'border-slate-600 group-hover:border-slate-500'
                                                        }`}>
                                                        {saveConfig.splits.test && <Check size={12} className="text-white" />}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        checked={saveConfig.splits.test}
                                                        onChange={(e) => setSaveConfig(prev => ({
                                                            ...prev,
                                                            splits: { ...prev.splits, test: e.target.checked }
                                                        }))}
                                                    />
                                                    <span className="text-sm text-slate-300">Test</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        {isSaving ? "Saving..." : "Save to Dataset"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
};

export default EvaluatePage;
