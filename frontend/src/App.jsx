import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertCircle, Check } from 'lucide-react';
// import { API_BASE } from './config';  <-- removed


// Layout
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import TableToolbar from './components/layout/TableToolbar';

// Data Display
import TableRow from './components/data-display/TableRow';

// Modals
import UploadModal from './components/modals/UploadModal';
import BulkUploadModal from './components/modals/BulkUploadModal';
import BatchTagModal from './components/modals/BatchTagModal';
import CopyBucketModal from './components/modals/CopyBucketModal';
import CreateBucketModal from './components/modals/CreateBucketModal';
import CloneBucketModal from './components/modals/CloneBucketModal';
import BucketSelectionModal from './components/modals/BucketSelectionModal';
import SettingsModal from './components/modals/SettingsModal';
import TrainingPage from './components/pages/TrainingPage';
import EvaluatePage from './components/pages/EvaluatePage';

const App = () => {
    // View State
    const [view, setView] = useState('dataset');

    // API Config State
    const [apiBaseUrl, setApiBaseUrl] = useState(() => localStorage.getItem('backend_url') || 'http://localhost:8000/api');

    // State
    const [config, setConfig] = useState(() => {
        const saved = localStorage.getItem('minio_config');
        return saved ? JSON.parse(saved) : {
            endpoint: 'localhost:9000',
            access_key: 'admin',
            secret_key: 'password123',
            bucket_name: ''
        };
    });

    const [bucket, setBucket] = useState("");
    const [availableBuckets, setAvailableBuckets] = useState([]);
    const [loadingBuckets, setLoadingBuckets] = useState(true);

    const [split, setSplit] = useState('train');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [data, setData] = useState([]);
    const [uniqueTags, setUniqueTags] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

    // Debounce effect
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setPage(1); // Reset to page 1 on new search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const [selectedIds, setSelectedIds] = useState([]);

    // Modals
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isBatchTagOpen, setIsBatchTagOpen] = useState(false);
    const [isCopyBucketModalOpen, setIsCopyBucketModalOpen] = useState(false);
    const [isCloneBucketOpen, setIsCloneBucketOpen] = useState(false);
    const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCreateBucketOpen, setIsCreateBucketOpen] = useState(false);
    const [isBucketSelectionOpen, setIsBucketSelectionOpen] = useState(false);


    // Initialize: Fetch buckets and check Login/LocalStorage
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Fetch available buckets
                const res = await axios.get(`${apiBaseUrl}/buckets`);
                const buckets = res.data.buckets;
                setAvailableBuckets(buckets);

                // 2. Check LocalStorage
                const savedBucket = localStorage.getItem('minio_bucket');

                if (savedBucket && buckets.includes(savedBucket)) {
                    setBucket(savedBucket);
                    setConfig(prev => ({ ...prev, bucket_name: savedBucket }));
                } else {
                    if (buckets.length > 0) {
                        setBucket(buckets[0]);
                    }
                }
            } catch (err) {
                console.error("Failed to initialize:", err);
                setIsSettingsOpen(true);
            } finally {
                setLoadingBuckets(false);
            }
        };
        init();
    }, [apiBaseUrl]);


    const fetchData = async (silent = false) => {
        if (!bucket) return;
        if (!silent) setLoading(true);
        try {
            const res = await axios.get(`${apiBaseUrl}/dataset/${bucket}/${split}`, {
                params: {
                    page,
                    limit,
                    search: debouncedSearchTerm, // Send search param
                    t: Date.now()
                }
            });
            if (res.data.data) {
                setData(res.data.data);
                setTotalItems(res.data.total);
                setUniqueTags(res.data.unique_tags || []);
            } else {
                setData(res.data);
                setTotalItems(res.data.length);
            }
        } catch (err) {
            console.error("Failed to fetch data", err);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        if (bucket) {
            fetchData();
            // Persist
            localStorage.setItem('minio_bucket', bucket);
        }
    }, [split, page, limit, bucket, apiBaseUrl, debouncedSearchTerm]); // Added limit dependency

    // Reset page when split changes
    useEffect(() => {
        setPage(1);
    }, [split]);

    const handleUpdate = async (fileName, newText, newTags, newDescription) => {
        await axios.post(`${apiBaseUrl}/dataset/row`, {
            bucket_name: bucket,
            split: split,
            file_name: fileName,
            transcription: newText,
            tags: newTags,
            description: newDescription
        });
    };

    const handleSaveConfig = async (newConfig, newBackendUrl, saveToLocalStorage) => {
        // Update State
        setApiBaseUrl(newBackendUrl);
        setConfig(newConfig);

        // Update LocalStorage
        if (saveToLocalStorage) {
            localStorage.setItem('backend_url', newBackendUrl);
            localStorage.setItem('minio_config', JSON.stringify(newConfig));
        } else {
            localStorage.removeItem('backend_url');
            localStorage.removeItem('minio_config');
        }

        // Try to push config to backend (if available)
        try {
            await axios.post(`${newBackendUrl}/config`, newConfig);
        } catch (e) {
            console.warn("Could not push config to backend (might be unreachable):", e);
        }

        // If bucket changed in settings, update it
        if (newConfig.bucket_name && newConfig.bucket_name !== bucket) {
            setBucket(newConfig.bucket_name);
        }

        // Refresh buckets list in case endpoint changed
        try {
            const res = await axios.get(`${newBackendUrl}/buckets`);
            setAvailableBuckets(res.data.buckets);
        } catch (e) { console.error(e) }

        setPage(1);
    };

    const handleCreateBucket = async (newBucketName) => {
        await axios.post(`${apiBaseUrl}/buckets`, { bucket_name: newBucketName });

        // Update available buckets
        setAvailableBuckets(prev => [...prev, newBucketName]);

        const confirmSwitch = window.confirm(`Bucket '${newBucketName}' created successfully. Switch to it now?`);
        if (confirmSwitch) {
            setBucket(newBucketName);
            setIsBucketSelectionOpen(false); // Close selection if open
        }
    }

    const handleSelectBucket = (selectedBucket) => {
        setBucket(selectedBucket);
        setIsBucketSelectionOpen(false);
    }

    const handleBatchDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} items? This cannot be undone.`)) return;

        try {
            setLoading(true);
            await axios.post(`${apiBaseUrl}/dataset/batch/delete`, {
                bucket_name: bucket,
                split: split,
                file_names: selectedIds
            });
            alert("Items deleted successfully.");
            setSelectedIds([]);
            await fetchData();
        } catch (err) {
            alert("Batch delete failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const confirmBatchTag = async (tagsToAdd) => {
        try {
            setLoading(true);
            await axios.post(`${apiBaseUrl}/dataset/batch/tag`, {
                bucket_name: bucket,
                split: split,
                file_names: selectedIds,
                tag: tagsToAdd
            });

            // Optimistic Update
            setData(prevData => prevData.map(item => {
                if (selectedIds.includes(item.file_name)) {
                    const currentTags = item.tags ? String(item.tags).split(',').map(t => t.trim()).filter(Boolean) : [];
                    const newTags = tagsToAdd.split(',').map(t => t.trim()).filter(Boolean);
                    const merged = [...new Set([...currentTags, ...newTags])].join(', ');
                    return { ...item, tags: merged };
                }
                return item;
            }));

            // Force update unique tags optimistically too
            const newTagsToAdd = tagsToAdd.split(',').map(t => t.trim()).filter(Boolean);
            setUniqueTags(prev => [...new Set([...prev, ...newTagsToAdd])].sort());

            alert("Tags added successfully.");
            setSelectedIds([]);

            // Sync in background
            await fetchData(true);
        } catch (err) {
            alert("Batch tag failed: " + err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    }

    const handleBatchCopy = async (targetBucket) => {
        try {
            setLoading(true);
            const res = await axios.post(`${apiBaseUrl}/dataset/batch/copy`, {
                bucket_name: bucket,
                target_bucket: targetBucket,
                split: split,
                file_names: selectedIds
            });
            alert(`Successfully copied ${res.data.copied_count} items to ${targetBucket}`);
            setSelectedIds([]);
        } catch (err) {
            alert("Batch copy failed: " + (err.response?.data?.detail || err.message));
            throw err; // Re-throw to let modal know
        } finally {
            setLoading(false);
        }
    };

    const handleCloneBucket = async (newBucketName) => {
        try {
            const res = await axios.post(`${apiBaseUrl}/buckets/clone`, {
                source_bucket: bucket,
                new_bucket_name: newBucketName
            });
            alert(res.data.message);
            // Update available buckets if not exists
            setAvailableBuckets(prev => {
                if (prev.includes(newBucketName)) return prev;
                return [...prev, newBucketName];
            });
            // Switch?
            if (confirm(`Clone successful. Switch to new bucket '${newBucketName}'?`)) {
                setBucket(newBucketName);
            }
        } catch (err) {
            console.error(err);
            // Re-throw to show error in modal
            throw new Error(err.response?.data?.detail || err.message);
        }
    }

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(filteredData.map(d => d.file_name));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (fileName) => {
        setSelectedIds(prev => {
            if (prev.includes(fileName)) {
                return prev.filter(id => id !== fileName);
            } else {
                return [...prev, fileName];
            }
        });
    };

    // Use data directly, backend handles filtering
    const filteredData = data;

    const totalPages = Math.ceil(totalItems / limit);

    if (loadingBuckets) {
        return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading configuration...</div>;
    }

    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
            {/* Sidebar */}
            <Sidebar
                bucket={bucket}
                availableBuckets={availableBuckets}
                onBucketSelect={handleSelectBucket}
                onCloneBucket={() => setIsCloneBucketOpen(true)}
                onCreateBucket={() => setIsCreateBucketOpen(true)}
                onSettingsClick={() => setIsSettingsOpen(true)}
                view={view}
                onViewChange={setView}
                apiBaseUrl={apiBaseUrl}
            />

            {/* Main Content */}
            {view === 'training' ? (
                <main className="flex-1 min-w-0 overflow-hidden">
                    <TrainingPage apiBaseUrl={apiBaseUrl} />
                </main>
            ) : view === 'evaluate' ? (
                <main className="flex-1 min-w-0 overflow-hidden">
                    <EvaluatePage apiBaseUrl={apiBaseUrl} />
                </main>
            ) : (
                <main className="flex-1 flex flex-col min-w-0">
                    <Header
                        split={split}
                        setSplit={setSplit}
                        totalItems={totalItems}
                    />

                    {/* Toolbar */}
                    <TableToolbar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        selectedCount={selectedIds.length}
                        onBatchDelete={handleBatchDelete}
                        onBatchTag={() => setIsBatchTagOpen(true)}
                        onBatchCopy={() => setIsCopyBucketModalOpen(true)}
                        onUploadClick={() => setIsUploadOpen(true)}
                        onBulkUploadClick={() => setIsBulkUploadOpen(true)}
                    />

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">
                        <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 flex flex-col shadow-2xl overflow-hidden">

                            {/* Table Header */}
                            <div className="bg-slate-900/50 border-b border-slate-800 p-4 grid grid-cols-[3rem_3rem_1fr_1fr_auto] gap-4 text-xs font-bold text-slate-500 uppercase tracking-wider items-center z-10 sticky top-0 backdrop-blur-md">
                                {/* This grid layout needs to match TableRow cells or use <table> */}
                            </div>

                            {/* We are using a Table element in previous implementation, let's stick to it or clean it up. 
                           The previous implementation used a <table> for better alignment. Let's reuse <table> structure container.
                        */}
                            <div className="flex-1 overflow-auto custom-scrollbar relative">
                                {loading ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm z-20">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-sm text-slate-400">Loading data...</span>
                                        </div>
                                    </div>
                                ) : null}

                                {!bucket ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4">
                                        <AlertCircle size={48} className="opacity-20" />
                                        <p>Select a bucket to view data</p>
                                        <button
                                            onClick={() => setIsCreateBucketOpen(true)}
                                            className="text-indigo-400 hover:text-indigo-300 text-sm"
                                        >
                                            Create New Bucket
                                        </button>
                                    </div>
                                ) : (
                                    <table className="w-full border-collapse text-left">
                                        <thead className="bg-slate-900 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                <th className="p-4 w-12 border-b border-slate-800">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                                        onChange={handleSelectAll}
                                                        checked={selectedIds.length > 0 && selectedIds.length === filteredData.length}
                                                    />
                                                </th>
                                                <th className="p-4 w-12 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">Play</th>
                                                <th className="p-4 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">File Name</th>
                                                <th className="p-4 w-1/3 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">Transcription</th>
                                                <th className="p-4 w-1/6 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">Tags</th>
                                                <th className="p-4 w-1/4 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                                                <th className="p-4 border-b border-slate-800 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {filteredData.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="p-8 text-center text-slate-500">
                                                        No items found
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredData.map((row, i) => (
                                                    <TableRow
                                                        key={row.file_name + i}
                                                        row={row}
                                                        bucket={bucket}
                                                        split={split}
                                                        onUpdate={handleUpdate}
                                                        availableTags={uniqueTags}
                                                        selected={selectedIds.includes(row.file_name)}
                                                        onSelect={() => handleSelectRow(row.file_name)}
                                                    />
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                        {/* Pagination Footer */}
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shrink-0 mt-4">
                            <div className="flex items-center gap-6 text-sm text-slate-400">
                                {/* Page Info */}
                                <span>
                                    Page <span className="text-white font-medium">{page}</span> of <span className="text-white font-medium">{totalPages || 1}</span>
                                </span>

                                {/* Page Size Selector */}
                                <div className="flex items-center gap-2">
                                    <span>Rows:</span>
                                    <select
                                        value={limit}
                                        onChange={(e) => {
                                            setLimit(Number(e.target.value));
                                            setPage(1);
                                        }}
                                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                                    >
                                        <option value={10}>10</option>
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                        <option value={200}>200</option>
                                    </select>
                                </div>

                                {/* Jump to Page */}
                                <div className="flex items-center gap-2">
                                    <span>Go to:</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max={totalPages || 1}
                                        defaultValue={page}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const val = parseInt(e.currentTarget.value);
                                                if (!isNaN(val) && val >= 1 && val <= (totalPages || 1)) {
                                                    setPage(val);
                                                }
                                            }
                                        }}
                                        onBlur={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 1 && val <= (totalPages || 1)) {
                                                setPage(val);
                                            } else {
                                                e.target.value = page; // Reset if invalid
                                            }
                                        }}
                                        className="w-12 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-center text-xs focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>

                </main>
            )}

            {/* Global Modals */}
            <UploadModal
                isOpen={isUploadOpen}
                onClose={() => setIsUploadOpen(false)}
                bucket={bucket}
                split={split}
                onUploadComplete={fetchData}
                availableTags={uniqueTags}
                apiBaseUrl={apiBaseUrl}
            />
            <BulkUploadModal
                isOpen={isBulkUploadOpen}
                onClose={() => setIsBulkUploadOpen(false)}
                bucket={bucket}
                split={split}
                onUploadComplete={fetchData}
                apiBaseUrl={apiBaseUrl}
            />
            <BatchTagModal
                isOpen={isBatchTagOpen}
                onClose={() => setIsBatchTagOpen(false)}
                selectedCount={selectedIds.length}
                onConfirm={confirmBatchTag}
                availableTags={uniqueTags}
            />
            <CopyBucketModal
                isOpen={isCopyBucketModalOpen}
                onClose={() => setIsCopyBucketModalOpen(false)}
                selectedCount={selectedIds.length}
                buckets={availableBuckets.filter(b => b !== bucket)}
                onConfirm={handleBatchCopy}
            />
            <CreateBucketModal
                isOpen={isCreateBucketOpen}
                onClose={() => setIsCreateBucketOpen(false)}
                onCreate={handleCreateBucket}
            />
            <CloneBucketModal
                isOpen={isCloneBucketOpen}
                onClose={() => setIsCloneBucketOpen(false)}
                sourceBucket={bucket}
                onClone={handleCloneBucket}
                availableBuckets={availableBuckets}
            />

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentSettings={config}
                currentBackendUrl={apiBaseUrl}
                onSave={handleSaveConfig}
            />

            <BucketSelectionModal
                isOpen={isBucketSelectionOpen} // Actually we don't strictly need this based on sidebar logic, but kept for logic completeness if needed
                buckets={availableBuckets}
                onSelect={handleSelectBucket}
                onCreate={() => setIsCreateBucketOpen(true)}
            />

        </div >
    );
};

export default App;
