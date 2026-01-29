import React from 'react';

const TagSelector = ({ value, onChange, availableTags }) => {
    const safeValue = typeof value === 'string' ? value : String(value || "");
    const currentTags = safeValue.split(',').map(t => t.trim()).filter(Boolean);

    const toggleTag = (tag) => {
        let newTags;
        if (currentTags.includes(tag)) {
            newTags = currentTags.filter(t => t !== tag);
        } else {
            newTags = [...currentTags, tag];
        }
        onChange(newTags.join(', '));
    };

    return (
        <div className="flex flex-col gap-1">
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Tags (comma separated)"
                className="w-full bg-transparent border-b border-transparent focus:border-indigo-500 outline-none transition-colors py-1 text-slate-300 text-sm focus:bg-slate-800/50 rounded px-2"
            />
            {availableTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                    {availableTags.map(tag => (
                        <button
                            key={tag}
                            type="button" // Prevent form submission
                            onClick={() => toggleTag(tag)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${currentTags.includes(tag)
                                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                                : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-400'
                                }`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TagSelector;
