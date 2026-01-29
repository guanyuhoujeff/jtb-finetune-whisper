import React, { useState } from 'react';
import { Database } from 'lucide-react';

const CreateBucketModal = ({ isOpen, onClose, onCreate }) => {
    const [bucketName, setBucketName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const validateBucketName = (name) => {
        if (!name) return "";

        // MinIO/S3 Bucket Naming Rules
        // 1. Length must be between 3 and 63 characters long
        if (name.length < 3 || name.length > 63) {
            return "Bucket name must be between 3 and 63 characters long";
        }

        // 2. Allowed characters: lowercase letters, numbers, dots (.), hyphens (-)
        // 3. Must begin and end with a letter or number
        // 4. Must not contain upper case characters
        const regex = /^[a-z0-9][a-z0-9.-]{0,61}[a-z0-9]$/;

        if (!regex.test(name)) {
            if (/[A-Z]/.test(name)) return "Bucket name must not contain uppercase characters";
            if (!/^[a-z0-9]/.test(name)) return "Bucket name must start with a lowercase letter or number";
            if (!/[a-z0-9]$/.test(name)) return "Bucket name must end with a lowercase letter or number";
            if (/\.\./.test(name)) return "Bucket name cannot contain consecutive dots";
            return "Bucket name can only contain lowercase letters, numbers, dots, and hyphens";
        }

        return "";
    };

    const handleNameChange = (e) => {
        const value = e.target.value;
        setBucketName(value);
        setError(validateBucketName(value));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validationError = validateBucketName(bucketName);
        if (validationError) {
            setError(validationError);
            return;
        }
        if (!bucketName) return;

        setIsCreating(true);
        try {
            await onCreate(bucketName);
            setBucketName(""); // Reset on success
            setError("");
            onClose();
        } catch (err) {
            alert("Failed to create bucket: " + err.message);
        } finally {
            setIsCreating(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Database size={20} /> Create New Bucket
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Bucket Name</label>
                        <input
                            value={bucketName}
                            onChange={handleNameChange}
                            className={`w-full bg-slate-800 border rounded-lg p-3 text-slate-200 focus:ring-2 outline-none ${error
                                    ? "border-red-500 focus:ring-red-500"
                                    : "border-slate-700 focus:ring-indigo-500"
                                }`}
                            placeholder="e.g. my-new-dataset"
                        />
                        {error ? (
                            <p className="text-xs text-red-500 mt-2">{error}</p>
                        ) : (
                            <p className="text-xs text-slate-500 mt-2">
                                Lowercase, numbers, hyphens, dots. 3-63 chars.
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setBucketName("");
                                setError("");
                                onClose();
                            }}
                            className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating || !bucketName || !!error}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isCreating || !bucketName || !!error
                                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                                }`}
                        >
                            {isCreating ? "Creating..." : "Create Bucket"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default CreateBucketModal;
