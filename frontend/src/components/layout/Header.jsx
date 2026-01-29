import React from 'react';

const Header = ({ split, setSplit, totalItems }) => {
    return (
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/50 backdrop-blur">
            <div className="flex items-center gap-8">
                <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
                    {['train', 'test'].map(s => (
                        <button
                            key={s}
                            onClick={() => setSplit(s)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${split === s
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                }`}
                        >
                            {s.charAt(0).toUpperCase() + s.slice(1)} Set
                        </button>
                    ))}
                </div>

                <div className="flex gap-2">
                    <span className="bg-slate-800 text-slate-400 text-xs px-2 py-1.5 rounded-full border border-slate-700 font-mono">
                        Total: {totalItems}
                    </span>
                </div>

            </div>
        </header>
    );
};

export default Header;
