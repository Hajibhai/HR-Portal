import React, { useState } from 'react';
import { loginWithGoogle, loginWithEmail } from '../firebase';
import { Building2, Mail, Lock, LogIn, ArrowRight, Chrome, X, ShieldAlert } from 'lucide-react';

export const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const loginIdentifier = email.includes('@') ? email : `${email}@system.local`;
            await loginWithEmail(loginIdentifier, password);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 flex items-center justify-center p-4 font-sans transition-colors duration-300">
            <div className="w-full max-w-[440px] space-y-8">
                {/* Logo Section */}
                <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-indigo-900/20 animate-in zoom-in duration-500">
                        <Building2 className="text-white w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Al Reem DMS</h1>
                        <p className="text-gray-500 dark:text-slate-400 mt-2 font-medium">Workforce Management System</p>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl shadow-gray-200/50 dark:shadow-black/50 p-10 border border-gray-100 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome Back</h2>
                        <p className="text-gray-500 dark:text-slate-400 mt-1">Please enter your details to sign in</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 dark:text-slate-300 ml-1">Username / Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                                <input 
                                    type="text" 
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Username or Email"
                                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 dark:text-slate-300 ml-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-start gap-3 animate-in shake duration-300">
                                <div className="mt-0.5 bg-red-500 rounded-full p-1">
                                    <X className="w-3 h-3 text-white" />
                                </div>
                                <p className="text-sm text-red-600 dark:text-red-400 font-medium leading-tight">{error}</p>
                            </div>
                        )}

                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-70"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="my-8 flex items-center gap-4">
                        <div className="h-px bg-gray-100 dark:bg-slate-800 flex-1"></div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Or continue with</span>
                        <div className="h-px bg-gray-100 dark:bg-slate-800 flex-1"></div>
                    </div>

                    <button 
                        onClick={loginWithGoogle}
                        className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 py-4 rounded-2xl font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all shadow-sm group"
                    >
                        <Chrome className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                        Google Account
                    </button>

                    <div className="mt-8 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 flex items-center gap-3">
                        <ShieldAlert className="w-5 h-5 text-indigo-600 shrink-0" />
                        <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium leading-relaxed">
                            Account creation is restricted. Please contact your administrator to get your login credentials.
                        </p>
                    </div>
                </div>

                <p className="text-center text-xs text-gray-400 font-medium">
                    &copy; 2026 Al Reem DMS Workforce Management. All rights reserved.
                </p>
            </div>
        </div>
    );
};
