import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FlaskConical } from 'lucide-react';

// Components
import ModelSelector from './evaluate/ModelSelector';
import AudioInputSection from './evaluate/AudioInputSection';
import ResultsDisplay from './evaluate/ResultsDisplay';

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
    const [selectedFiles, setSelectedFiles] = useState([]); // Changed from single string to array
    const [uploadedFiles, setUploadedFiles] = useState([]); // Changed from single file to array
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
    const [batchResults, setBatchResults] = useState([]); // New state for batch results
    const [comparison, setComparison] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState(''); // New state for progress status

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
                if (audioFiles.length > 0 && selectedFiles.length === 0) {
                    setSelectedFiles([audioFiles[0].file_name]);
                }
            } catch (err) {
                console.error("Failed to fetch files", err);
                setBucketFiles([]);
                setBucketTotal(0);
                setSelectedFiles([]);
            }
        };

        fetchFiles();
    }, [apiBaseUrl, selectedBucket, bucketPage, refreshTrigger]);

    // Reset page when bucket changes
    useEffect(() => {
        setBucketPage(1);
        setSelectedFiles([]);
        setUploadedFiles([]); // Clear uploads when switching buckets (optional, but good cleanup)
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
        setBatchResults([]);
        setComparison(null);
        setProcessingStatus('');

        try {
            if (audioTab === 'upload' && uploadedFiles.length > 0) {
                // Batch Processing Logic for Uploads
                for (let i = 0; i < uploadedFiles.length; i++) {
                    const file = uploadedFiles[i];
                    setProcessingStatus(`Processing ${i + 1}/${uploadedFiles.length}: ${file.name}`);

                    try {
                        let currentResult = {
                            id: `upload-${i}`, // distinct ID
                            fileName: file.name,
                            file: file, // Pass file object for playback
                            status: 'pending',
                            resultA: null,
                            resultB: null,
                            comparison: null,
                            error: null
                        };

                        // Use form data for file upload
                        const formData = new FormData();
                        formData.append('model_name', modelA.name);
                        formData.append('source', modelA.source);
                        if (modelA.variant) formData.append('variant', modelA.variant);
                        formData.append('audio_file', file);

                        const res = await axios.post(`${apiBaseUrl}/evaluate/infer-upload`, formData);
                        currentResult.resultA = res.data;

                        // Compare if enabled
                        if (compareMode && modelB.name) {
                            const formDataB = new FormData();
                            formDataB.append('model_name', modelB.name);
                            formDataB.append('source', modelB.source);
                            if (modelB.variant) formDataB.append('variant', modelB.variant);
                            formDataB.append('audio_file', file);

                            const resB = await axios.post(`${apiBaseUrl}/evaluate/infer-upload`, formDataB);
                            currentResult.resultB = resB.data;

                            // Calculate comparison locally since we don't have a direct compare-upload endpoint yet
                            // Or we could add one, but for now let's just show side-by-side
                            // Ideally we should have a backend endpoint for comparing uploads to ensure synchronization
                            // For this iteration, we'll just show the two results.
                        }

                        currentResult.status = 'success';
                        setBatchResults(prev => [...prev, currentResult]);

                    } catch (err) {
                        console.error(`Failed to process ${file.name}`, err);
                        setBatchResults(prev => [...prev, {
                            id: `upload-${i}`,
                            fileName: file.name,
                            status: 'error',
                            error: err.response?.data?.detail || err.message
                        }]);
                    }
                }
                setIsProcessing(false);
                return;

            } else if (audioTab === 'mic' && recordedAudio) {
                // ... (existing mic logic)
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
            } else if (audioTab === 'bucket' && selectedFiles.length > 0) {
                // Batch Processing Logic
                const results = [];
                for (let i = 0; i < selectedFiles.length; i++) {
                    const fileName = selectedFiles[i];
                    setProcessingStatus(`Processing ${i + 1}/${selectedFiles.length}: ${fileName}`);

                    try {
                        // Find the original file object to get audio_url
                        const originalFile = bucketFiles.find(f => f.file_name === fileName);

                        let currentResult = {
                            id: i,
                            fileName: fileName,
                            audioUrl: originalFile?.audio_url, // Pass audio url
                            status: 'pending',
                            resultA: null,
                            resultB: null,
                            comparison: null,
                            error: null
                        };

                        if (compareMode && modelB.name) {
                            const res = await axios.post(`${apiBaseUrl}/evaluate/compare`, {
                                model_a: modelA,
                                model_b: modelB,
                                audio_source: 'bucket',
                                bucket_name: selectedBucket,
                                file_name: fileName
                            });
                            currentResult.status = 'success';
                            currentResult.resultA = res.data.model_a;
                            currentResult.resultB = res.data.model_b;
                            currentResult.comparison = res.data.comparison;
                        } else {
                            const res = await axios.post(`${apiBaseUrl}/evaluate/infer`, {
                                ...modelA,
                                model_name: modelA.name,
                                audio_source: 'bucket',
                                bucket_name: selectedBucket,
                                file_name: fileName
                            });
                            currentResult.status = 'success';
                            currentResult.resultA = res.data;
                        }
                        results.push(currentResult);
                        setBatchResults([...results]); // Update UI progressively
                    } catch (fileErr) {
                        console.error(`Error processing ${fileName}`, fileErr);
                        results.push({
                            id: i,
                            fileName: fileName,
                            status: 'error',
                            error: fileErr.message
                        });
                        setBatchResults([...results]);
                    }
                }

                // If only one file was processed successfully, set the main resultA/B state too for backward compatibility/single view
                if (results.length === 1 && results[0].status === 'success') {
                    setResultA(results[0].resultA);
                    if (results[0].resultB) {
                        setResultB(results[0].resultB);
                        setComparison(results[0].comparison);
                    }
                }
            }
        } catch (err) {
            console.error("Inference failed", err);
            alert("Inference failed: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsProcessing(false);
            setProcessingStatus('');
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
            if (audioTab === 'bucket' && selectedFiles.length > 0) {
                formData.append('audio_source', 'bucket');
                formData.append('source_bucket', selectedBucket);
                // For batch results, we'll need to handle saving differently (probably inside BatchResultRow)
                // This logic here applies more to single file selection
                // The new child component will handle its own saving logic
                // But if we select "Save" on the main view, we need a file
                // Let's assume for now this handles the single file case or first file
                formData.append('source_file', selectedFiles[0]);
            } else if (audioTab === 'upload' && uploadedFiles.length > 0) {
                formData.append('audio_source', 'upload');
                formData.append('audio_file', uploadedFiles[0]);
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
                setBucketPage(1);
                setRefreshTrigger(prev => prev + 1);
            }

        } catch (err) {
            console.error("Save failed", err);
            alert("Save failed: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveResult = (id) => {
        setBatchResults(prev => prev.filter(r => r.id !== id));
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
                <ModelSelector
                    modelA={modelA}
                    setModelA={setModelA}
                    modelB={modelB}
                    setModelB={setModelB}
                    compareMode={compareMode}
                    availableModels={availableModels}
                    isProcessing={isProcessing}
                    onRefresh={() => window.location.reload()}
                />

                {/* Main Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <AudioInputSection
                        audioTab={audioTab}
                        setAudioTab={setAudioTab}
                        selectedBucket={selectedBucket}
                        setSelectedBucket={setSelectedBucket}
                        availableBuckets={availableBuckets}
                        fileFilter={fileFilter}
                        setFileFilter={setFileFilter}
                        bucketFiles={bucketFiles}
                        selectedFiles={selectedFiles}
                        setSelectedFiles={setSelectedFiles}
                        bucketPage={bucketPage}
                        setBucketPage={setBucketPage}
                        bucketLimit={bucketLimit}
                        bucketTotal={bucketTotal}
                        uploadedFiles={uploadedFiles}
                        setUploadedFiles={setUploadedFiles}
                        selectedDeviceId={selectedDeviceId}
                        setSelectedDeviceId={setSelectedDeviceId}
                        audioDevices={audioDevices}
                        isRecording={isRecording}
                        startRecording={startRecording}
                        stopRecording={stopRecording}
                        recordedAudio={recordedAudio}
                        runInference={runInference}
                        isProcessing={isProcessing}
                        modelA={modelA}
                        compareMode={compareMode}
                    />

                    <ResultsDisplay
                        compareMode={compareMode}
                        resultA={resultA}
                        resultB={resultB}
                        isProcessing={isProcessing}
                        comparison={comparison}
                        batchResults={batchResults}
                        processingStatus={processingStatus}
                        saveConfig={saveConfig}
                        setSaveConfig={setSaveConfig}
                        availableBuckets={availableBuckets}
                        handleSave={handleSave}
                        isSaving={isSaving}
                        modelA={modelA}
                        modelB={modelB}
                        selectedBucket={selectedBucket}
                        apiBaseUrl={apiBaseUrl}
                        onRemoveResult={handleRemoveResult}
                    />
                </div>
            </div>
        </div >
    );
};

export default EvaluatePage;
