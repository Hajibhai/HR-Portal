import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ExternalLink, Plus, X, Link as LinkIcon } from 'lucide-react';
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
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileUrl, setNewFileUrl] = useState('');

    const handleAddLink = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFileName || !newFileUrl) return;

        const newFile: DriveFile = {
            id: Math.random().toString(36).substr(2, 9),
            name: newFileName,
            mimeType: 'application/octet-stream', // Generic
            webViewLink: newFileUrl.startsWith('http') ? newFileUrl : `https://${newFileUrl}`,
            iconLink: 'https://ssl.gstatic.com/docs/doclist/images/icon_10_generic_list.png'
        };

        onAddFile(newFile);
        setNewFileName('');
        setNewFileUrl('');
        setIsAddModalOpen(false);
    };

    const modalContent = isAddModalOpen ? (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4"
            onClick={() => setIsAddModalOpen(false)}
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Document Link</h3>
                    <button 
                        onClick={() => setIsAddModalOpen(false)}
                        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <form onSubmit={handleAddLink} className="p-6 space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Document Name</label>
                        <input 
                            type="text"
                            required
                            autoFocus
                            placeholder="e.g., Trade License, Passport Copy"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Google Drive Share Link</label>
                        <div className="relative">
                            <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                type="text"
                                required
                                placeholder="Paste the share link here..."
                                value={newFileUrl}
                                onChange={(e) => setNewFileUrl(e.target.value)}
                                className="w-full p-4 pl-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                            />
                        </div>
                    </div>
                    <button 
                        type="submit"
                        className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-sm font-bold transition-all shadow-xl shadow-brand-600/20 active:scale-[0.98]"
                    >
                        Add Document
                    </button>
                </form>
            </div>
        </div>
    ) : null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h4>
                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-1 text-[10px] font-bold text-brand-600 hover:text-brand-700 transition-colors"
                >
                    <Plus className="w-3 h-3" /> Add Link
                </button>
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

            {isAddModalOpen && createPortal(modalContent, document.body)}
        </div>
    );
};
