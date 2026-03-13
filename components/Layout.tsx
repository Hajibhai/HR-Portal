import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Menu, X, ChevronDown, 
  LogOut, Settings, User, Bell, Search,
  Building2, Globe, HelpCircle
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  children: React.ReactNode;
  navItems: any[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  user: any;
  onLogout: () => void;
  companies: any[];
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  navItems, 
  activeTab, 
  setActiveTab, 
  user, 
  onLogout,
  companies 
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo and Desktop Nav */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 shrink-0 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
                <div className="bg-brand-600 p-2 rounded-xl shadow-lg shadow-brand-600/20 rotate-3">
                  <Building2 className="text-white w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-lg text-slate-900 leading-none tracking-tight">AL REEM</span>
                  <span className="text-[9px] font-bold text-brand-600 tracking-[0.2em] mt-0.5">DMS PORTAL</span>
                </div>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center gap-0.5">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "px-2 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 flex items-center gap-1.5 relative group",
                      activeTab === item.id 
                        ? "text-brand-600 bg-brand-50" 
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4 transition-transform duration-300 group-hover:scale-110",
                      activeTab === item.id ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"
                    )} />
                    {item.label}
                    {activeTab === item.id && (
                      <motion.div
                        layoutId="active-nav-indicator"
                        className="absolute bottom-0 left-4 right-4 h-0.5 bg-brand-600 rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              
              {/* Search Bar - Desktop */}
              <div className="hidden lg:flex items-center gap-2 bg-slate-100/80 px-4 py-2 rounded-2xl border border-slate-200/60 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-500/10 focus-within:border-brand-500 transition-all group">
                <Search className="w-4 h-4 text-slate-400 group-focus-within:text-brand-600" />
                <input 
                  type="text" 
                  placeholder="Search anything..." 
                  className="bg-transparent border-none outline-none text-sm w-40 xl:w-64 placeholder:text-slate-400 font-medium"
                />
                <div className="hidden xl:flex items-center gap-1 ml-2">
                  <kbd className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded">Ctrl</kbd>
                  <span className="text-[10px] text-slate-400 font-bold">/</span>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded">⌘</kbd>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-white border border-slate-200 rounded">K</kbd>
                </div>
              </div>

              {/* Notifications */}
              <button className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all relative group">
                <Bell className="w-4 h-4 group-hover:animate-swing" />
                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></span>
              </button>

              <button 
                onClick={onLogout}
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all font-bold text-xs border border-red-100"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

              {/* User Profile Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                  className="flex items-center gap-2 p-1 pl-2 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200 group"
                >
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-bold text-slate-900 leading-none">{user.name}</div>
                    <div className="text-[9px] text-brand-600 font-black uppercase tracking-wider mt-0.5">{user.role}</div>
                  </div>
                  <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-brand-600/20 group-hover:scale-105 transition-transform">
                    {user.name.charAt(0)}
                  </div>
                  <ChevronDown className={cn("w-3 h-3 text-slate-400 transition-transform duration-300", isUserDropdownOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isUserDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsUserDropdownOpen(false)}></div>
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-2 z-20 overflow-hidden"
                      >
                        <div className="p-4 border-b border-slate-50 mb-2">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Signed in as</p>
                          <p className="text-sm font-bold text-slate-900 truncate">{user.email}</p>
                        </div>
                        <div className="space-y-1">
                          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-all">
                            <User className="w-4 h-4" /> My Profile
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-all">
                            <Settings className="w-4 h-4" /> Account Settings
                          </button>
                          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-all">
                            <HelpCircle className="w-4 h-4" /> Help Center
                          </button>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-50">
                          <button 
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all"
                          >
                            <LogOut className="w-4 h-4" /> Sign Out
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2.5 hover:bg-slate-100 rounded-2xl xl:hidden text-slate-600"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-80 bg-white z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-600 p-2 rounded-xl">
                    <Building2 className="text-white w-5 h-5" />
                  </div>
                  <span className="font-bold text-lg text-slate-900">Al Reem DMS</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all font-bold",
                      activeTab === item.id 
                        ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20" 
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", activeTab === item.id ? "text-white" : "text-slate-400")} />
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="p-6 border-t border-slate-100">
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-red-600 font-bold hover:bg-red-50 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/60 py-8">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
              <Globe className="w-4 h-4" />
              <span>Al Reem Document Management System v2.5</span>
            </div>
            <div className="flex items-center gap-6 text-slate-400 text-sm font-bold">
              <button className="hover:text-brand-600 transition-colors">Privacy Policy</button>
              <button className="hover:text-brand-600 transition-colors">Terms of Service</button>
              <button className="hover:text-brand-600 transition-colors">Contact Support</button>
            </div>
            <p className="text-slate-400 text-xs font-medium">
              © {new Date().getFullYear()} Al Reem. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

