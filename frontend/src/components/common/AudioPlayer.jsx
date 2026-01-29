import React, { useState, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

const AudioPlayer = ({ src }) => {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={togglePlay}
                className="p-2 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors text-white"
            >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <audio
                ref={audioRef}
                src={src}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                className="hidden"
            />
        </div>
    );
};

export default AudioPlayer;
