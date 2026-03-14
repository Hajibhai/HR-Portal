import React, { useState, useEffect } from 'react';
import { FileText, ExternalLink, Plus, X, Loader2, Globe } from 'lucide-react';
import { DriveFile } from '../types';
import { cn } from '../utils';

interface GoogleDriveManagerProps {
    files: DriveFile[];
    onAddFile: (file: DriveFile) => void;
    onRemoveFile: (fileId: string) => void;
    title?: string;
}

export const GoogleDriveManager: React.FC<GoogleDriveManagerProps> = ({ 
    files = [], 
    onAddFile, 
    onRemoveFile,
    title = "Linked Documents"
}) => {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const res = await fetch('/api/drive/files');
            if (res.ok) {
                setIsAuthenticated(true);
            }
        } catch (e) {
            console.error("Auth check failed", e);
        }
    };

    const handleConnect = async () => {
        try {
            const res = await fetch('/api/auth/google/url');
            const { url } = await res.json();
            const authWindow = window.open(url, 'google_oauth', 'width=600,height=700');
            
            const handleMessage = (event: MessageEvent) => {
                if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
                    setIsAuthenticated(true);
                    window.removeEventListener('message', handleMessage);
                }
            };
            window.addEventListener('message', handleMessage);
        } catch (e) {
            console.error("Failed to get auth URL", e);
        }
    };

    const fetchDriveFiles = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/drive/files');
            if (res.ok) {
                const data = await res.json();
                setDriveFiles(data);
                setIsPickerOpen(true);
            } else if (res.status === 401) {
                setIsAuthenticated(false);
                handleConnect();
            }
        } catch (e) {
            console.error("Failed to fetch drive files", e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h4>
                {!isAuthenticated ? (
                    <button 
                        onClick={handleConnect}
                        className="flex items-center gap-2 text-[10px] font-bold text-brand-600 hover:text-brand-700 transition-colors"
                    >
                        <Globe className="w-3 h-3" /> Connect Google Drive
                    </button>
                ) : (
                    <button 
                        onClick={fetchDriveFiles}
                        className="flex items-center gap-1 text-[10px] font-bold text-brand-600 hover:text-brand-700 transition-colors"
                    >
                        <Plus className="w-3 h-3" /> Link File
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-2">
                {files.map(file => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 group">
                        <div className="flex items-center gap-3 min-w-0">
                            {file.iconLink ? (
                                <img src={file.iconLink} alt="" className="w-4 h-4" />
                            ) : (
                                <FileText className="w-4 h-4 text-slate-400" />
                            )}
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <a 
                                href={file.webViewLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button 
                                onClick={() => onRemoveFile(file.id)}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
                {files.length === 0 && (
                    <div className="py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        <p className="text-[10px] font-medium text-slate-400">No documents linked yet</p>
                    </div>
                )}
            </div>

            {isPickerOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Select from Google Drive</h3>
                            <button onClick={() => setIsPickerOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {driveFiles.map(file => {
                                const isLinked = files.some(f => f.id === file.id);
                                return (
                                    <button 
                                        key={file.id}
                                        disabled={isLinked}
                                        onClick={() => {
                                            onAddFile(file);
                                            setIsPickerOpen(false);
                                        }}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                                            isLinked ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                        )}
                                    >
                                        <img src={file.iconLink} alt="" className="w-4 h-4" />
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{file.name}</span>
                                        {isLinked && <span className="ml-auto text-[8px] font-bold text-slate-400 uppercase">Linked</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
