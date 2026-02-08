import React from 'react';
import { Mic, MicOff } from 'lucide-react';

const MicInput = ({
    selectedDeviceId,
    setSelectedDeviceId,
    audioDevices,
    isRecording,
    startRecording,
    stopRecording,
    recordedAudio
}) => {
    return (
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
    );
};

export default MicInput;
