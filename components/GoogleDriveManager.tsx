import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ExternalLink, Plus, X, Link as LinkIcon, Eye, Download, Globe, Calendar, Loader2, Upload } from 'lucide-react';
import { DriveFile } from '../types';
import { cn } from '../utils';
import { extractExpiryDate } from '../services/geminiService';

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
    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
    const [newFileName, setNewFileName] = useState('');
    const [newFileUrl, setNewFileUrl] = useState('');
    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAddLink = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFileName || !newFileUrl) return;

        const newFile: DriveFile = {
            id: Math.random().toString(36).substr(2, 9),
            name: newFileName,
            mimeType: 'application/octet-stream', // Generic
            webViewLink: newFileUrl.startsWith('http') ? newFileUrl : `https://${newFileUrl}`,
            expiryDate: newExpiryDate || undefined,
            iconLink: 'https://ssl.gstatic.com/docs/doclist/images/icon_10_generic_list.png'
        };

        onAddFile(newFile);
        setNewFileName('');
        setNewFileUrl('');
        setNewExpiryDate('');
        setIsAddModalOpen(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target?.result as string;
                const expiryDate = await extractExpiryDate(base64, file.type);
                
                if (expiryDate) {
                    setNewExpiryDate(expiryDate);
                }
                
                if (!newFileName) {
                    setNewFileName(file.name);
                }
                
                setIsAnalyzing(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Analysis error:", error);
            setIsAnalyzing(false);
        }
    };

    const getExpiryColor = (expiryDate?: string) => {
        if (!expiryDate) return '';
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'text-red-600 dark:text-red-400 font-bold';
        if (diffDays <= 10) return 'text-orange-600 dark:text-orange-400 font-bold';
        return 'text-emerald-600 dark:text-emerald-400 font-bold';
    };

    const getPreviewUrl = (url: string) => {
        // Handle Google Drive links for better preview
        if (url.includes('drive.google.com')) {
            if (url.includes('/view')) {
                return url.replace('/view', '/preview');
            }
            if (url.includes('id=')) {
                const id = url.split('id=')[1].split('&')[0];
                return `https://drive.google.com/file/d/${id}/preview`;
            }
            if (url.includes('/d/')) {
                const parts = url.split('/d/');
                if (parts.length > 1) {
                    const id = parts[1].split('/')[0];
                    return `https://drive.google.com/file/d/${id}/preview`;
                }
            }
        }
        return url;
    };

    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return <div className="p-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg"><FileText className="w-3.5 h-3.5" /></div>;
        if (['doc', 'docx'].includes(ext || '')) return <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg"><FileText className="w-3.5 h-3.5" /></div>;
        if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg"><FileText className="w-3.5 h-3.5" /></div>;
        if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext || '')) return <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg"><Globe className="w-3.5 h-3.5" /></div>;
        return <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400"><FileText className="w-3.5 h-3.5" /></div>;
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
                    <div className="flex items-center justify-between bg-brand-50 dark:bg-brand-900/20 p-4 rounded-2xl border border-brand-100 dark:border-brand-900/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-brand-100 dark:bg-brand-900/40 rounded-xl text-brand-600 dark:text-brand-400">
                                <Upload className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white">AI Document Analysis</p>
                                <p className="text-[10px] text-slate-500">Upload to auto-extract expiry date</p>
                            </div>
                        </div>
                        <button 
                            type="button"
                            disabled={isAnalyzing}
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-brand-200 dark:border-brand-900/50 rounded-lg text-[10px] font-bold text-brand-600 hover:bg-brand-50 transition-all disabled:opacity-50"
                        >
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Upload File'}
                        </button>
                        <input 
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                        />
                    </div>

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
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Expiry Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="date"
                                    value={newExpiryDate}
                                    onChange={(e) => setNewExpiryDate(e.target.value)}
                                    className="w-full p-4 pl-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Google Drive Link</label>
                            <div className="relative">
                                <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="text"
                                    required
                                    placeholder="Paste link..."
                                    value={newFileUrl}
                                    onChange={(e) => setNewFileUrl(e.target.value)}
                                    className="w-full p-4 pl-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                                />
                            </div>
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

    const previewModal = previewFile ? (
        <div 
            className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[10000] p-4 md:p-8"
            onClick={() => setPreviewFile(null)}
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-6xl h-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 md:p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-brand-100 dark:bg-brand-900/30 rounded-xl text-brand-600 dark:text-brand-400">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">{previewFile.name}</h3>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Document Preview</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a 
                            href={previewFile.webViewLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-2.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-xl transition-all"
                            title="Open in New Tab"
                        >
                            <ExternalLink className="w-5 h-5" />
                        </a>
                        <button 
                            onClick={() => setPreviewFile(null)}
                            className="p-2.5 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative">
                    <iframe 
                        src={getPreviewUrl(previewFile.webViewLink)} 
                        className="w-full h-full border-none"
                        title={previewFile.name}
                        allow="autoplay"
                    />
                </div>
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
                    <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 group transition-all hover:border-brand-200 dark:hover:border-brand-900/50">
                        <div className="flex items-center gap-3 min-w-0">
                            {file.iconLink && !file.name.includes('.') ? (
                                <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                    <img src={file.iconLink} alt="" className="w-3.5 h-3.5" />
                                </div>
                            ) : (
                                getFileIcon(file.name)
                            )}
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{file.name}</span>
                                {file.expiryDate && (
                                    <span className={cn("text-[9px] uppercase tracking-wider", getExpiryColor(file.expiryDate))}>
                                        Expires: {new Date(file.expiryDate).toLocaleDateString()}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setPreviewFile(file)}
                                className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all"
                                title="Preview"
                            >
                                <Eye className="w-3.5 h-3.5" />
                            </button>
                            <a 
                                href={file.webViewLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-all"
                                title="Open Original"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button 
                                onClick={() => onRemoveFile(file.id)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="Remove"
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
            {previewFile && createPortal(previewModal, document.body)}
        </div>
    );
};
