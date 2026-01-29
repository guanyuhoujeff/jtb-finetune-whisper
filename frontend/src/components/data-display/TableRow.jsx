import React, { useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import AudioPlayer from '../common/AudioPlayer';
import TagSelector from '../common/TagSelector';

const TableRow = ({ row, bucket, split, onUpdate, availableTags, selected, onSelect }) => {
    const [transcription, setTranscription] = useState(row.transcription);
    const [tags, setTags] = useState(row.tags || "");
    const [description, setDescription] = useState(row.description || "");
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Sync with props when optimistic updates happen
    React.useEffect(() => {
        setTranscription(row.transcription);
        setTags(row.tags || "");
        setDescription(row.description || "");
        // We don't reset isDirty here because if the user was typing while an update came in, 
        // they might lose work. But typically batch updates happen when user is waiting.
        // For safety, let's only strictly update if not dirty, OR just update regardless 
        // assuming batch update is the source of truth.
        // Given the user flow (Modal -> Batch Update), user is not editing row inline.
        setIsDirty(false);
    }, [row]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onUpdate(row.file_name, transcription, tags, description);
            setIsDirty(false);
        } catch (err) {
            console.error(err);
            alert("Failed to save");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <tr className={`border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors ${selected ? 'bg-indigo-900/10' : ''}`}>
            <td className="p-4 w-12">
                <input
                    type="checkbox"
                    className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                    checked={selected}
                    onChange={onSelect}
                />
            </td>
            <td className="p-4 w-12">
                <AudioPlayer src={row.audio_url} />
            </td>
            <td className="p-4 font-mono text-sm text-slate-400">
                {row.file_name}
            </td>
            <td className="p-4 w-1/3">
                <input
                    type="text"
                    value={transcription}
                    onChange={(e) => {
                        setTranscription(e.target.value);
                        setIsDirty(true);
                    }}
                    placeholder="Transcription"
                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 outline-none transition-colors py-1 text-slate-200 focus:bg-slate-800/50 rounded px-2"
                />
            </td>
            <td className="p-4 w-1/6">
                <TagSelector
                    value={tags}
                    onChange={(val) => {
                        setTags(val);
                        setIsDirty(true);
                    }}
                    availableTags={availableTags}
                />
            </td>
            <td className="p-4 w-1/4">
                <input
                    type="text"
                    value={description}
                    onChange={(e) => {
                        setDescription(e.target.value);
                        setIsDirty(true);
                    }}
                    placeholder="Description"
                    className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 outline-none transition-colors py-1 text-slate-400 text-sm focus:bg-slate-800/50 rounded px-2 italic"
                />
            </td>
            <td className="p-4">
                {isDirty && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-full transition-all"
                    >
                        {isSaving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                        Save
                    </button>
                )}
            </td>
        </tr>
    );
};

export default TableRow;
