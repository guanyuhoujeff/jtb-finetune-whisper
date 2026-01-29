import React, { useState, useEffect } from 'react';

const SettingsModal = ({ isOpen, onClose, currentSettings, currentBackendUrl, onSave }) => {
    const [settings, setSettings] = useState(currentSettings);
    const [backendUrl, setBackendUrl] = useState(currentBackendUrl);
    const [saveToLocalStorage, setSaveToLocalStorage] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSettings(currentSettings);
            setBackendUrl(currentBackendUrl);
            // Check if we have saved settings in local storage to set checkbox initial state
            const hasSaved = localStorage.getItem('backend_url') || localStorage.getItem('minio_config');
            setSaveToLocalStorage(!!hasSaved);
        }
    }, [isOpen, currentSettings, currentBackendUrl]);

    const handleChange = (e) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(settings, backendUrl, saveToLocalStorage);
            onClose();
        } catch (err) {
            alert("Failed to save settings: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <SettingsIcon />
                    Connection Settings
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="border-b border-slate-800 pb-4 mb-4">
                        <label className="block text-sm text-slate-400 mb-1">Backend Server URL</label>
                        <input
                            title="The URL of the Python backend server (e.g., http://localhost:8000/api)"
                            value={backendUrl}
                            onChange={(e) => setBackendUrl(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-indigo-500 outline-none"
                            placeholder="http://localhost:8000/api"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">MinIO Endpoint</label>
                        <input
                            name="endpoint"
                            value={settings.endpoint}
                            onChange={handleChange}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-indigo-500 outline-none"
                            placeholder="192.168.1.37:9000"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Access Key</label>
                        <input
                            name="access_key"
                            value={settings.access_key}
                            onChange={handleChange}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-indigo-500 outline-none"
                            placeholder="MinIO Access Key"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Secret Key</label>
                        <input
                            name="secret_key"
                            value={settings.secret_key}
                            onChange={handleChange}
                            type="password"
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-indigo-500 outline-none"
                            placeholder="MinIO Secret Key"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Default Bucket</label>
                        <input
                            name="bucket_name"
                            value={settings.bucket_name}
                            onChange={handleChange}
                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:border-indigo-500 outline-none"
                            placeholder="Optional default bucket"
                        />
                    </div>

                    <div className="pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={saveToLocalStorage}
                                onChange={(e) => setSaveToLocalStorage(e.target.checked)}
                                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-300">Save settings to local storage</span>
                        </label>
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
                            disabled={isSaving}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                        >
                            {isSaving ? "Saving..." : "Save Settings"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

const SettingsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
)

export default SettingsModal;
