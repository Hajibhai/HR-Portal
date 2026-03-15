
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { cn } from './utils';

const DirhamIcon = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center justify-center font-black text-[10px] leading-none tracking-tighter", className)}>
    AED
  </div>
);

import { 
  Users, Calendar, UserPlus, LogOut, ArrowRight,
  Building2, CheckCircle, XCircle, Trash2, 
  AlertCircle, Eye, Edit, CheckSquare, 
  Copy, FileText, CreditCard,
  BarChart3, UserMinus, Wallet, Plane, X, Save, Plus,
  ChevronLeft, ChevronRight,
  Settings, Search, Bell, LogOut as SignOut, UserCog,
  Briefcase, HardHat, ShieldCheck, Download, Printer,
  MoreVertical, Check, X as CloseIcon, Filter, Shield, Key, GripVertical,
  Activity, LayoutGrid, ListFilter, ChevronDown, Globe, HelpCircle,
  TrendingUp, Clock, ArrowUpRight, ArrowDownRight, BarChart2, Phone,
  ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import { 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { auth, db, loginWithGoogle, loginWithEmail, registerWithEmail, logout, resetPassword, adminCreateUser, adminDeleteUser } from './firebase';
import { Login } from './components/Login';
import { 
  Employee, AttendanceRecord, AttendanceStatus, StaffType, 
  LeaveRequest, LeaveStatus, OffboardingDetails, 
  SystemUser, DeductionRecord, UserRole, SalaryStructure, Company, AuditLog
} from './types';
import { 
  saveEmployee, deleteEmployee, offboardEmployee, rehireEmployee,
  logAttendance, deleteAttendanceRecord,
  saveLeaveRequest, updateLeaveRequestStatus,
  saveDeduction, deleteDeduction,
  saveSystemUser, deleteSystemUser,
  addCompany, updateCompany, deleteCompany, reorderCompanies,
  testConnection, logAudit, handleFirestoreError, OperationType
} from './services/storageService';
import { DEFAULT_ABOUT_DATA, CREATOR_USER } from './constants';
import SmartCommand from './components/SmartCommand';
import { Layout } from './components/Layout';
import { GoogleDriveManager } from './components/GoogleDriveManager';

// --- Constants & Helpers ---
const LEGEND: any = {
    [AttendanceStatus.PRESENT]: { label: 'Present', color: 'bg-emerald-500 text-white', code: 'P' },
    [AttendanceStatus.ABSENT]: { label: 'Absent', color: 'bg-red-500 text-white', code: 'A' },
    [AttendanceStatus.WEEK_OFF]: { label: 'Week Off', color: 'bg-slate-500 text-white', code: 'W' },
    [AttendanceStatus.PUBLIC_HOLIDAY]: { label: 'Public Holiday', color: 'bg-violet-500 text-white', code: 'PH' },
    [AttendanceStatus.SICK_LEAVE]: { label: 'Sick Leave', color: 'bg-orange-500 text-white', code: 'SL' },
    [AttendanceStatus.ANNUAL_LEAVE]: { label: 'Annual Leave', color: 'bg-brand-500 text-white', code: 'AL' },
    [AttendanceStatus.UNPAID_LEAVE]: { label: 'Unpaid Leave', color: 'bg-rose-500 text-white', code: 'UL' },
    [AttendanceStatus.EMERGENCY_LEAVE]: { label: 'Emergency Leave', color: 'bg-pink-500 text-white', code: 'EL' },
};

const calculatePayroll = (employee: Employee, attendance: AttendanceRecord[], deductions: DeductionRecord[]) => {
    const presentDays = attendance.filter(r => r.status === AttendanceStatus.PRESENT).length;
    const weekOffs = attendance.filter(r => r.status === AttendanceStatus.WEEK_OFF).length;
    const publicHolidays = attendance.filter(r => r.status === AttendanceStatus.PUBLIC_HOLIDAY).length;
    
    // Unpaid logic
    const absentDays = attendance.filter(r => r.status === AttendanceStatus.ABSENT).length;
    const unpaidLeaves = attendance.filter(r => [AttendanceStatus.UNPAID_LEAVE, AttendanceStatus.ANNUAL_LEAVE, AttendanceStatus.EMERGENCY_LEAVE].includes(r.status)).length;
    const totalUnpaidDays = absentDays + unpaidLeaves;

    // Salary
    const { basic = 0, housing = 0, transport = 0, other = 0, airTicket = 0, leaveSalary = 0 } = employee.salary;
    const grossSalary = basic + housing + transport + other + airTicket + leaveSalary;
    
    // Deductions
    const perDayRate = grossSalary / 30;
    const lopDeduction = totalUnpaidDays * perDayRate;
    const otherDeductionsTotal = deductions.reduce((sum, d) => sum + d.amount, 0);
    
    // OT
    const totalOtHours = attendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
    const otRatePerHour = (grossSalary / 30 / 8) * 1.5; 
    const otAmount = totalOtHours * otRatePerHour;

    return {
        grossSalary,
        totalUnpaidDays,
        lopDeduction,
        otAmount,
        totalDeductions: lopDeduction + otherDeductionsTotal,
        netSalary: grossSalary + otAmount - (lopDeduction + otherDeductionsTotal),
        breakdown: employee.salary
    };
};

// --- Modals ---

const CopyAttendanceModal = ({ isOpen, onClose, onCopy, currentMonth }: any) => {
    const [sourceDate, setSourceDate] = useState('');
    const [targetStartDate, setTargetStartDate] = useState('');
    const [targetEndDate, setTargetEndDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleCopy = async () => {
        if (!sourceDate || !targetStartDate || !targetEndDate) {
            alert("Please fill in all dates.");
            return;
        }
        setIsSubmitting(true);
        try {
            await onCopy(sourceDate, targetStartDate, targetEndDate);
            onClose();
        } catch (error) {
            console.error("Copy error:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white dark:border-slate-800"
            >
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Copy Attendance</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Replicate attendance patterns across dates</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shadow-sm hover:shadow-md"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">Source Date (Copy From)</label>
                        <div className="relative">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                                type="date" 
                                value={sourceDate}
                                onChange={(e) => setSourceDate(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-brand-500 transition-all dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">Target Start Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="date" 
                                    value={targetStartDate}
                                    onChange={(e) => setTargetStartDate(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-brand-500 transition-all dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">Target End Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="date" 
                                    value={targetEndDate}
                                    onChange={(e) => setTargetEndDate(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-brand-500 transition-all dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
                            This will overwrite any existing attendance records in the target date range. This action cannot be undone.
                        </p>
                    </div>
                </div>

                <div className="p-8 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-6 py-3 text-slate-500 dark:text-slate-400 font-bold text-sm hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        disabled={isSubmitting}
                        onClick={handleCopy} 
                        className="px-8 py-3 bg-brand-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-brand-600/20 hover:bg-brand-700 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Copying...
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4" />
                                Start Copying
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, type = 'danger' }: any) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Confirmation error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70]">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 border border-transparent dark:border-slate-800">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-full ${type === 'danger' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <p className="text-gray-600 dark:text-slate-400 mb-8">{message}</p>
        <div className="flex justify-end gap-3">
          <button 
            disabled={isSubmitting}
            onClick={onClose} 
            className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={isSubmitting}
            onClick={handleConfirm} 
            className={`px-4 py-2 text-white rounded-lg font-medium flex items-center gap-2 ${type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'} disabled:opacity-50 transition-colors`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

const FinalSettlementDocument = ({ employee, details }: { employee: Employee, details: OffboardingDetails }) => {
    return (
        <div className="p-10 bg-white text-black font-serif max-w-[210mm] mx-auto">
            <div className="flex justify-between items-start border-b-2 border-black pb-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold uppercase tracking-widest">Final Settlement</h1>
                    <p className="text-sm mt-1 text-gray-600">Employee Exit Clearance & Financial Statement</p>
                </div>
                <div className="text-right">
                    <p className="font-bold text-lg">{employee.company}</p>
                    <p className="text-sm">Date: {new Date().toLocaleDateString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10">
                <div className="space-y-2">
                    <h2 className="font-bold border-b pb-1 mb-2 uppercase text-xs text-gray-500">Employee Information</h2>
                    <p className="text-sm"><span className="font-semibold w-32 inline-block">Name:</span> {employee.name}</p>
                    <p className="text-sm"><span className="font-semibold w-32 inline-block">Employee ID:</span> {employee.code}</p>
                    <p className="text-sm"><span className="font-semibold w-32 inline-block">Designation:</span> {employee.designation}</p>
                    <p className="text-sm"><span className="font-semibold w-32 inline-block">Department:</span> {employee.department}</p>
                </div>
                <div className="space-y-2">
                    <h2 className="font-bold border-b pb-1 mb-2 uppercase text-xs text-gray-500">Exit Details</h2>
                    <p className="text-sm"><span className="font-semibold w-32 inline-block">Exit Type:</span> {details.type}</p>
                    <p className="text-sm"><span className="font-semibold w-32 inline-block">Joining Date:</span> {employee.joiningDate}</p>
                    <p className="text-sm"><span className="font-semibold w-32 inline-block">Last Working Day:</span> {details.exitDate}</p>
                </div>
            </div>

            <div className="mb-10">
                <h2 className="font-bold border-b pb-1 mb-4 uppercase text-xs text-gray-500">Financial Statement</h2>
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="border p-2 text-left text-sm">Description</th>
                            <th className="border p-2 text-right w-32 text-sm">Earnings (AED)</th>
                            <th className="border p-2 text-right w-32 text-sm">Deductions (AED)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border p-2 text-sm">Gratuity Settlement</td>
                            <td className="border p-2 text-right text-sm">{details.gratuity.toLocaleString()}</td>
                            <td className="border p-2 text-right text-sm">-</td>
                        </tr>
                        <tr>
                            <td className="border p-2 text-sm">Leave Encashment</td>
                            <td className="border p-2 text-right text-sm">{details.leaveEncashment.toLocaleString()}</td>
                            <td className="border p-2 text-right text-sm">-</td>
                        </tr>
                        <tr>
                            <td className="border p-2 text-sm">Pending Salary / Dues</td>
                            <td className="border p-2 text-right text-sm">{details.salaryDues.toLocaleString()}</td>
                            <td className="border p-2 text-right text-sm">-</td>
                        </tr>
                        {details.otherDues > 0 && (
                            <tr>
                                <td className="border p-2 text-sm">Other Earnings</td>
                                <td className="border p-2 text-right text-sm">{details.otherDues.toLocaleString()}</td>
                                <td className="border p-2 text-right text-sm">-</td>
                            </tr>
                        )}
                        <tr>
                            <td className="border p-2 text-sm">Total Deductions</td>
                            <td className="border p-2 text-right text-sm">-</td>
                            <td className="border p-2 text-right text-sm">{details.deductions.toLocaleString()}</td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr className="font-bold bg-gray-100">
                            <td className="border p-2 text-right text-sm">Net Payable Amount</td>
                            <td colSpan={2} className="border p-2 text-right text-xl">AED {details.netSettlement.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="mb-10">
                <h2 className="font-bold border-b pb-1 mb-2 uppercase text-xs text-gray-500">Clearance Confirmation</h2>
                <p className="text-sm italic">
                    {details.assetsReturned 
                        ? "All company assets (Laptop, SIM, Uniform, Tools) have been returned in good condition." 
                        : "Company assets return status: Pending/Not Applicable."}
                </p>
                {details.notes && (
                    <div className="mt-4 p-3 bg-gray-50 border rounded text-sm">
                        <p className="font-bold mb-1">Remarks:</p>
                        <p>{details.notes}</p>
                    </div>
                )}
            </div>

            <div className="mt-20 grid grid-cols-2 gap-20">
                <div className="text-center">
                    <div className="border-t border-black pt-2">
                        <p className="font-bold text-sm">{employee.name}</p>
                        <p className="text-[10px] text-gray-500">Employee Signature & Date</p>
                    </div>
                </div>
                <div className="text-center">
                    <div className="border-t border-black pt-2">
                        <p className="font-bold text-sm">For {employee.company}</p>
                        <p className="text-[10px] text-gray-500">Authorized Signatory & Stamp</p>
                    </div>
                </div>
            </div>

            <div className="mt-12 text-[10px] text-gray-400 text-center">
                <p>This is a computer-generated document. No signature is required unless printed for physical records.</p>
            </div>
        </div>
    );
};

const OffboardingWizard = ({ employee, onComplete, onCancel }: { employee: Employee, onComplete: (data: OffboardingDetails) => void, onCancel: () => void }) => {
    const [step, setStep] = useState(1);
    const [details, setDetails] = useState<OffboardingDetails>({
        type: 'Resignation', exitDate: new Date().toISOString().split('T')[0], reason: '',
        gratuity: 0, leaveEncashment: 0, salaryDues: 0, otherDues: 0, deductions: 0,
        netSettlement: 0, assetsReturned: false, notes: '', settlementLink: ''
    });

    const calculateSettlement = () => {
         const net = (details.gratuity + details.leaveEncashment + details.salaryDues + details.otherDues) - details.deductions;
         setDetails(prev => ({ ...prev, netSettlement: net }));
    };

    useEffect(() => { calculateSettlement(); }, [details.gratuity, details.leaveEncashment, details.salaryDues, details.otherDues, details.deductions]);

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        const content = document.getElementById('settlement-document-print');
        if (!content) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>Final Settlement - ${employee.name}</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        @media print {
                            body { padding: 0; margin: 0; }
                            .no-print { display: none; }
                        }
                        body { font-family: 'Georgia', serif; }
                    </style>
                </head>
                <body>
                    ${content.innerHTML}
                    <script>
                        window.onload = () => {
                            setTimeout(() => {
                                window.print();
                                window.close();
                            }, 500);
                        };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] border border-transparent dark:border-slate-800">
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Offboard: {employee.name}</h2>
                         <div className="flex gap-2 mt-2">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={`h-1.5 w-8 rounded-full transition-colors ${i <= step ? 'bg-red-600' : 'bg-gray-200 dark:bg-slate-700'}`} />
                            ))}
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors text-gray-500 dark:text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-8 overflow-y-auto flex-1">
                    {step === 1 && (
                         <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                             <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200">Exit Details</h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                 <div className="space-y-2">
                                     <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Exit Type</label>
                                     <select className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={details.type} onChange={e => setDetails({...details, type: e.target.value as any})}>
                                         <option>Resignation</option><option>Termination</option><option>End of Contract</option><option>Absconding</option>
                                     </select>
                                 </div>
                                 <div className="space-y-2">
                                     <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Last Working Day</label>
                                     <input type="date" className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={details.exitDate} onChange={e => setDetails({...details, exitDate: e.target.value})} />
                                 </div>
                                 <div className="col-span-2 space-y-2">
                                     <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Reason</label>
                                     <textarea className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" rows={3} value={details.reason} onChange={e => setDetails({...details, reason: e.target.value})} />
                                 </div>
                             </div>
                         </div>
                    )}
                    {step === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                             <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200">Financial Settlement</h3>
                             <div className="grid grid-cols-2 gap-5">
                                 <div className="space-y-2"><label className="text-sm dark:text-slate-300">Gratuity</label><input type="number" className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={details.gratuity} onChange={e => setDetails({...details, gratuity: parseFloat(e.target.value) || 0})} /></div>
                                 <div className="space-y-2"><label className="text-sm dark:text-slate-300">Leave Encashment</label><input type="number" className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={details.leaveEncashment} onChange={e => setDetails({...details, leaveEncashment: parseFloat(e.target.value) || 0})} /></div>
                                 <div className="space-y-2"><label className="text-sm dark:text-slate-300">Pending Salary</label><input type="number" className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" value={details.salaryDues} onChange={e => setDetails({...details, salaryDues: parseFloat(e.target.value) || 0})} /></div>
                                 <div className="space-y-2"><label className="text-sm dark:text-slate-300">Deductions</label><input type="number" className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-red-600 dark:text-red-400" value={details.deductions} onChange={e => setDetails({...details, deductions: parseFloat(e.target.value) || 0})} /></div>
                             </div>
                             <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl flex justify-between items-center">
                                 <span className="font-semibold text-gray-700 dark:text-slate-300">Net Payable Amount</span>
                                 <span className="text-2xl font-bold text-green-700 dark:text-green-400">AED {details.netSettlement.toLocaleString()}</span>
                             </div>
                        </div>
                    )}
                    {step === 3 && (
                         <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                             <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200">Assets & Clearance</h3>
                             <div className="flex items-center gap-4 p-4 border dark:border-slate-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors" onClick={() => setDetails({...details, assetsReturned: !details.assetsReturned})}>
                                 <div className={`w-6 h-6 rounded border flex items-center justify-center ${details.assetsReturned ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-slate-600'}`}>
                                     {details.assetsReturned && <Check className="w-4 h-4 text-white" />}
                                 </div>
                                 <span className="text-gray-900 dark:text-white">All company assets returned (Laptop, Sim, Uniform, Tools)</span>
                             </div>
                             <div className="space-y-2">
                                 <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Additional Notes</label>
                                 <textarea className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" rows={4} value={details.notes} onChange={e => setDetails({...details, notes: e.target.value})} placeholder="Clearance details..." />
                             </div>
                         </div>
                    )}
                    {step === 4 && (
                         <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                             <div className="flex justify-between items-center">
                                 <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-200">Final Settlement Document</h3>
                                 <button 
                                    onClick={handlePrint}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors text-sm font-medium"
                                 >
                                     <Printer className="w-4 h-4" />
                                     Print Document
                                 </button>
                             </div>
                             
                             <div className="p-6 border-2 border-dashed dark:border-slate-700 rounded-2xl bg-gray-50 dark:bg-slate-800/50 text-center space-y-4">
                                 <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto">
                                     <FileText className="w-8 h-8" />
                                 </div>
                                 <div>
                                     <p className="font-bold text-gray-900 dark:text-white">Generate Settlement Paper</p>
                                     <p className="text-sm text-gray-500 dark:text-slate-400">Print the document for employee signature, then upload to Google Drive and paste the link below.</p>
                                 </div>
                             </div>

                             <div className="space-y-2">
                                 <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Google Drive Link (Signed Document)</label>
                                 <div className="relative">
                                     <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                     <input 
                                        type="url" 
                                        className="w-full pl-10 pr-4 py-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                        placeholder="https://drive.google.com/..."
                                        value={details.settlementLink || ''}
                                        onChange={e => setDetails({...details, settlementLink: e.target.value})}
                                     />
                                 </div>
                                 <p className="text-[10px] text-gray-500 dark:text-slate-500 italic">Optional: You can add the link later if not ready.</p>
                             </div>

                             {/* Hidden template for printing */}
                             <div className="hidden">
                                 <div id="settlement-document-print">
                                     <FinalSettlementDocument employee={employee} details={details} />
                                 </div>
                             </div>
                         </div>
                    )}
                    {step === 5 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300 text-center py-8">
                             <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                 <LogOut className="w-10 h-10" />
                             </div>
                             <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Ready to Offboard?</h3>
                             <p className="text-gray-500 dark:text-slate-400 max-w-md mx-auto">
                                 You are about to mark <strong>{employee.name}</strong> as inactive. 
                                 Final settlement amount: <strong>AED {details.netSettlement.toLocaleString()}</strong>.
                             </p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 dark:border-slate-800 flex justify-between bg-gray-50 dark:bg-slate-800/50">
                    {step > 1 ? <button onClick={() => setStep(s => s - 1)} className="px-6 py-2.5 text-gray-600 dark:text-slate-300 font-medium hover:bg-gray-200 dark:hover:bg-slate-700 rounded-xl transition-colors">Back</button> : <div></div>}
                    {step < 5 ? (
                        <button onClick={() => setStep(s => s + 1)} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-lg shadow-red-200 dark:shadow-none transition-colors">Next Step</button>
                    ) : (
                        <button onClick={() => onComplete(details)} className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-lg shadow-red-200 dark:shadow-none flex items-center gap-2 transition-colors">
                            Confirm & Offboard
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const EditEmployeeModal = ({ employee, onSave, onCancel, companies }: { employee: Employee, onSave: (e: Employee) => void, onCancel: () => void, companies: Company[] }) => {
    const [data, setData] = useState<Employee>(employee);
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] border border-transparent dark:border-slate-800">
                <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Employee</h2>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500 dark:text-slate-400" /></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Basic Info */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase mb-3">Personal Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                             <div className="col-span-2 flex items-center gap-4 mb-4">
                                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 overflow-hidden">
                                    {data.profileImage ? (
                                        <img src={data.profileImage} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <input 
                                        type="file" 
                                        id="edit-profile-upload"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    setData({...data, profileImage: reader.result as string});
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    <label 
                                        htmlFor="edit-profile-upload"
                                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-all"
                                    >
                                        Change Photo
                                    </label>
                                    {data.profileImage && (
                                        <button 
                                            onClick={() => setData({...data, profileImage: undefined})}
                                            className="text-[10px] font-bold text-red-500 hover:text-red-600 text-left px-1"
                                        >
                                            Remove Photo
                                        </button>
                                    )}
                                </div>
                             </div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Code</label><input disabled type="text" value={data.code || ''} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Name</label><input type="text" value={data.name || ''} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Designation</label><input type="text" value={data.designation || ''} onChange={e => setData({...data, designation: e.target.value})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Department</label><input type="text" value={data.department || ''} onChange={e => setData({...data, department: e.target.value})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div className="col-span-2"><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Company</label>
                                 <select value={data.company || ''} onChange={e => setData({...data, company: e.target.value})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white">
                                     <option value="">Select Company</option>
                                     {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                 </select>
                             </div>
                        </div>
                    </div>

                    {/* Salary Info */}
                     <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase mb-3">Salary Structure (AED)</h3>
                        <div className="grid grid-cols-3 gap-4">
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Basic</label><input type="number" value={data.salary.basic ?? 0} onChange={e => setData({...data, salary: {...data.salary, basic: Number(e.target.value)}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Housing</label><input type="number" value={data.salary.housing ?? 0} onChange={e => setData({...data, salary: {...data.salary, housing: Number(e.target.value)}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Transport</label><input type="number" value={data.salary.transport ?? 0} onChange={e => setData({...data, salary: {...data.salary, transport: Number(e.target.value)}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Other</label><input type="number" value={data.salary.other ?? 0} onChange={e => setData({...data, salary: {...data.salary, other: Number(e.target.value)}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Air Ticket</label><input type="number" value={data.salary.airTicket ?? 0} onChange={e => setData({...data, salary: {...data.salary, airTicket: Number(e.target.value)}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Leave Salary</label><input type="number" value={data.salary.leaveSalary ?? 0} onChange={e => setData({...data, salary: {...data.salary, leaveSalary: Number(e.target.value)}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                        </div>
                    </div>

                    {/* Banking */}
                     <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase mb-3">Banking Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Bank Name</label><input type="text" value={data.bankName || ''} onChange={e => setData({...data, bankName: e.target.value})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">IBAN / Account</label><input type="text" value={data.iban || ''} onChange={e => setData({...data, iban: e.target.value})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                        </div>
                    </div>

                    {/* Documents */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase mb-3">Documents & Identification</h3>
                        <div className="grid grid-cols-2 gap-4">
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Emirates ID</label><input type="text" value={data.documents?.emiratesId || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), emiratesId: e.target.value}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">EID Expiry</label><input type="date" value={data.documents?.emiratesIdExpiry || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), emiratesIdExpiry: e.target.value}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Passport Number</label><input type="text" value={data.documents?.passportNumber || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), passportNumber: e.target.value}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Passport Expiry</label><input type="date" value={data.documents?.passportExpiry || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), passportExpiry: e.target.value}})} className="w-full p-2 border dark:border-slate-700 rounded-lg mt-1 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" /></div>
                        </div>
                    </div>
                    {/* Linked Documents */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase mb-3">Linked Documents</h3>
                        <GoogleDriveManager 
                            files={data.driveFiles || []}
                            onAddFile={(file) => setData({ ...data, driveFiles: [...(data.driveFiles || []), file] })}
                            onRemoveFile={(fileId) => setData({ ...data, driveFiles: (data.driveFiles || []).filter(f => f.id !== fileId) })}
                        />
                    </div>
                </div>
                <div className="p-4 border-t dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-200 transition-colors">Cancel</button>
                    <button onClick={() => onSave(data)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const OnboardingWizard = ({ onComplete, onCancel, companies }: { onComplete: (data: Employee) => void, onCancel: () => void, companies: Company[] }) => {
    const [step, setStep] = useState(1);
    const [data, setData] = useState<Partial<Employee>>({
        salary: { basic: 0, housing: 0, transport: 0, other: 0, airTicket: 0, leaveSalary: 0 },
        status: 'Active', 
        active: true, 
        leaveBalance: 30, 
        team: 'Internal Team', 
        type: StaffType.WORKER,
        documents: {
            emiratesId: '',
            emiratesIdExpiry: '',
            passportNumber: '',
            passportExpiry: ''
        }
    });

    const steps = [
        { id: 1, name: 'Personal' },
        { id: 2, name: 'Role & Work' },
        { id: 3, name: 'Financials' },
        { id: 4, name: 'Documents' }
    ];

    const nextStep = () => setStep(prev => Math.min(prev + 1, 4));
    const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

    const isStepValid = () => {
        if (step === 1) return data.code && data.name && data.joiningDate;
        if (step === 2) return data.type;
        if (step === 3) return data.salary && data.salary.basic > 0;
        return true;
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Onboard New Employee</h2>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Stepper */}
                <div className="px-8 py-6 bg-gray-50/50 dark:bg-slate-800/50 border-b dark:border-slate-800">
                    <div className="flex items-center justify-between max-w-2xl mx-auto relative">
                        {/* Connecting Lines */}
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 dark:bg-slate-700 -translate-y-1/2 z-0"></div>
                        
                        {steps.map((s, idx) => (
                            <div key={s.id} className="relative z-10 flex items-center gap-3 bg-gray-50/50 dark:bg-slate-800/50 px-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                                    step === s.id 
                                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900/30' 
                                    : step > s.id 
                                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' 
                                    : 'bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500'
                                }`}>
                                    {step > s.id ? <CheckCircle className="w-5 h-5" /> : s.id}
                                </div>
                                <span className={`text-sm font-bold ${step === s.id ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                                    {s.name}
                                </span>
                                {idx < steps.length - 1 && (
                                    <div className={`w-12 h-0.5 ${step > s.id ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'}`}></div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 max-h-[60vh] overflow-y-auto">
                    {step === 1 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Personal Information</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Profile Image</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 overflow-hidden">
                                            {data.profileImage ? (
                                                <img src={data.profileImage} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                            ) : (
                                                <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <input 
                                                type="file" 
                                                id="profile-upload"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => {
                                                            setData({ ...data, profileImage: reader.result as string });
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                            <label 
                                                htmlFor="profile-upload"
                                                className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                            >
                                                Upload Photo
                                            </label>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500">JPG, PNG or GIF. Max 1MB.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Employee Code *</label>
                                    <input 
                                        placeholder="e.g. 1001" 
                                        value={data.code||''} 
                                        onChange={e=>setData({...data, code:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Full Name *</label>
                                    <input 
                                        placeholder="John Doe" 
                                        value={data.name||''} 
                                        onChange={e=>setData({...data, name:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Company</label>
                                    <select 
                                        value={data.company||''} 
                                        onChange={e=>setData({...data, company:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select Company</option>
                                        {companies.map(c=><option key={c.id} value={c.name}>{c.code} - {c.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Joining Date *</label>
                                    <input 
                                        type="date" 
                                        value={data.joiningDate||''} 
                                        onChange={e=>setData({...data, joiningDate:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Mobile Number</label>
                                    <input 
                                        placeholder="e.g. +971 ..." 
                                        value={data.mobileNumber||''} 
                                        onChange={e=>setData({...data, mobileNumber:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Role & Work Details</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Designation</label>
                                    <input 
                                        placeholder="e.g. Driver" 
                                        value={data.designation||''} 
                                        onChange={e=>setData({...data, designation:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Department</label>
                                    <input 
                                        placeholder="e.g. Transport" 
                                        value={data.department||''} 
                                        onChange={e=>setData({...data, department:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Team</label>
                                    <select 
                                        value={data.team||''} 
                                        onChange={e=>setData({...data, team:e.target.value as any})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                                    >
                                        <option value="Internal Team">Internal Team</option>
                                        <option value="External Team">External Team</option>
                                        <option value="Office Staff">Office Staff</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Staff Type *</label>
                                    <select 
                                        value={data.type||''} 
                                        onChange={e=>setData({...data, type:e.target.value as any})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                                    >
                                        <option value={StaffType.OFFICE}>{StaffType.OFFICE}</option>
                                        <option value={StaffType.WORKER}>{StaffType.WORKER}</option>
                                        <option value={StaffType.BRANCH}>{StaffType.BRANCH}</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Work Location</label>
                                    <input 
                                        placeholder="e.g. Dubai" 
                                        value={data.workLocation||''} 
                                        onChange={e=>setData({...data, workLocation:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Salary & Banking</h3>
                            <div className="grid grid-cols-3 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Basic *</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.basic ?? 0} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, basic:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Housing</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.housing ?? 0} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, housing:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Transport</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.transport ?? 0} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, transport:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Air Ticket</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.airTicket ?? 0} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, airTicket:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Leave Salary</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.leaveSalary ?? 0} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, leaveSalary:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Other</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.other ?? 0} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, other:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6 pt-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Bank Name</label>
                                    <input 
                                        placeholder="e.g. Emirates NBD" 
                                        value={data.bankName||''} 
                                        onChange={e=>setData({...data, bankName:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">IBAN / Acct No.</label>
                                    <input 
                                        placeholder="AE00 0000 0000 0000 0000 000" 
                                        value={data.iban||''} 
                                        onChange={e=>setData({...data, iban:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Documents & Identification</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Emirates ID Number</label>
                                    <input 
                                        placeholder="784-..." 
                                        value={data.documents?.emiratesId||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, emiratesId:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">EID Expiry</label>
                                    <input 
                                        type="date" 
                                        value={data.documents?.emiratesIdExpiry||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, emiratesIdExpiry:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Passport Number</label>
                                    <input 
                                        placeholder="e.g. N1234567" 
                                        value={data.documents?.passportNumber||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, passportNumber:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Passport Expiry</label>
                                    <input 
                                        type="date" 
                                        value={data.documents?.passportExpiry||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, passportExpiry:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                    />
                                </div>
                            </div>
                            <div className="mt-8 pt-8 border-t dark:border-slate-800">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Linked Documents</h3>
                                <GoogleDriveManager 
                                    files={data.driveFiles || []}
                                    onAddFile={(file) => setData({ ...data, driveFiles: [...(data.driveFiles || []), file] })}
                                    onRemoveFile={(fileId) => setData({ ...data, driveFiles: (data.driveFiles || []).filter(f => f.id !== fileId) })}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 flex justify-between items-center">
                    <button 
                        onClick={prevStep} 
                        disabled={step === 1}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            step === 1 ? 'opacity-0 pointer-events-none' : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        Back
                    </button>
                    
                    {step < 4 ? (
                        <button 
                            onClick={nextStep} 
                            disabled={!isStepValid()}
                            className="px-8 py-2.5 bg-[#1e293b] dark:bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-slate-200 dark:shadow-none"
                        >
                            Next Step <ArrowRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button 
                            onClick={() => onComplete(data as Employee)} 
                            className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                        >
                            Complete Onboarding <CheckCircle className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const UserManagementModal = ({ onClose, users, openConfirm, currentUser, onLog }: { onClose: () => void, users: SystemUser[], openConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning') => void, currentUser: SystemUser, onLog: any }) => {
    const [localUsers, setLocalUsers] = useState<SystemUser[]>(users);
    const [showAdd, setShowAdd] = useState(false);
    const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
    const [newUser, setNewUser] = useState({ 
        username: '', 
        password: '', 
        role: '', 
        name: '',
        permissions: {
            canViewDashboard: true,
            canManageEmployees: false,
            canViewDirectory: false,
            canManageAttendance: false,
            canViewTimesheet: false,
            canManageLeaves: false,
            canViewPayroll: false,
            canManagePayroll: false,
            canViewReports: false,
            canManageUsers: false,
            canManageSettings: false
        }
    });

    useEffect(() => {
        setLocalUsers(users);
    }, [users]);

    const handleAdd = async () => {
        console.log("Attempting to add new user:", { ...newUser, password: '***' });
        if (!newUser.username || !newUser.password || !newUser.name || !newUser.role) {
            alert("Please fill in all fields (Name, Username, Password, and Role)");
            return;
        }
        try {
            const userEmail = newUser.username.includes('@') ? newUser.username : `${newUser.username}@system.local`;
            console.log("Creating Auth user with email:", userEmail);
            
            // Create the user in Firebase Auth first
            const authUser = await adminCreateUser(userEmail, newUser.password);
            console.log("Auth user created successfully, UID:", authUser.uid);
            
            const userToSave: SystemUser = {
                uid: authUser.uid,
                email: userEmail,
                username: newUser.username,
                password: newUser.password,
                name: newUser.name,
                role: newUser.role as any,
                active: true,
                permissions: newUser.permissions
            };
            console.log("Saving user to Firestore...");
            await saveSystemUser(userToSave);
            onLog('User Created', `New system user ${userToSave.name} (${userToSave.email}) was created with role ${userToSave.role}.`, 'create');
            console.log("User saved to Firestore successfully.");
            setShowAdd(false);
            setNewUser({ 
                username: '', 
                password: '', 
                role: '', 
                name: '',
                permissions: {
                    canViewDashboard: true, // Default to true for new users
                    canManageEmployees: false,
                    canViewDirectory: false,
                    canManageAttendance: false,
                    canViewTimesheet: false,
                    canManageLeaves: false,
                    canViewPayroll: false,
                    canManagePayroll: false,
                    canViewReports: false,
                    canManageUsers: false,
                    canManageSettings: false
                }
            });
        } catch (e: any) {
            console.error("Error in handleAdd:", e);
            alert("Failed to save user: " + e.message);
        }
    };

    const handleEdit = async () => {
        if (!editingUser) return;
        try {
            const username = editingUser.username || editingUser.email || '';
            const updatedUser = {
                ...editingUser,
                username,
                email: username.includes('@') ? username : `${username}@system.local`
            };
            await saveSystemUser(updatedUser);
            onLog('User Updated', `System user ${updatedUser.name} (${updatedUser.email}) details were updated.`, 'update');
            setEditingUser(null);
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleDelete = async (userToDelete: SystemUser) => {
        if (!userToDelete.uid) {
            alert("Error: User ID is missing. Cannot delete.");
            return;
        }

        openConfirm(
            "Delete User",
            `Are you sure you want to delete ${userToDelete.name}? This will remove their access to the system.`,
            async () => {
                try {
                    // 1. Delete from Firebase Auth if password is available
                    if (userToDelete.email && userToDelete.password) {
                        try {
                            await adminDeleteUser(userToDelete.email, userToDelete.password);
                        } catch (authError: any) {
                            console.warn("Auth deletion failed, proceeding with Firestore deletion:", authError);
                        }
                    }
                    
                    // 2. Delete from Firestore
                    await deleteSystemUser(userToDelete.uid);
                    onLog('User Deleted', `System user ${userToDelete.name} (${userToDelete.email}) was removed from the system.`, 'delete');
                } catch (e: any) {
                    console.error("Delete error:", e);
                    alert("Error deleting user: " + (e.message || "Unknown error"));
                }
            }
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">System User Management</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5 dark:text-slate-400" /></button>
                </div>
                
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-gray-700 dark:text-slate-300">Active System Users</h3>
                        {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CREATOR || currentUser.email === CREATOR_USER.email) && (
                            <button onClick={() => { setShowAdd(true); setEditingUser(null); }} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
                                <Plus className="w-4 h-4" /> Add User
                            </button>
                        )}
                    </div>

                    {showAdd && (
                        <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Full Name</label>
                                    <input className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" placeholder="Full Name" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Username / Email</label>
                                    <input className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" placeholder="Username" value={newUser.username} onChange={e=>setNewUser({...newUser, username: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Password</label>
                                    <input className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" type="password" placeholder="Password" value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Role</label>
                                    <input 
                                        className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                        placeholder="Enter Role Manually" 
                                        value={newUser.role} 
                                        onChange={e=>setNewUser({...newUser, role: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 mt-4">
                                <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Permissions</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.keys(newUser.permissions).map(perm => (
                                        <label key={perm} className="flex items-center gap-2 p-2 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 cursor-pointer hover:bg-indigo-100/30 dark:hover:bg-indigo-900/30">
                                            <input 
                                                type="checkbox" 
                                                checked={(newUser.permissions as any)[perm]} 
                                                onChange={e => setNewUser({
                                                    ...newUser,
                                                    permissions: { ...newUser.permissions, [perm]: e.target.checked }
                                                })}
                                                className="w-4 h-4 text-indigo-600 rounded"
                                            />
                                            <span className="text-[10px] font-medium text-gray-700 dark:text-slate-300 capitalize">{perm.replace('can', '').replace(/([A-Z])/g, ' $1')}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-gray-600 dark:text-slate-400 text-sm font-medium">Cancel</button>
                                <button onClick={handleAdd} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold">Save User</button>
                            </div>
                        </div>
                    )}

                    {editingUser && (
                        <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-900/30 space-y-3">
                            <h4 className="text-sm font-bold text-orange-800 dark:text-orange-400">Editing: {editingUser.name}</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">Full Name</label>
                                    <input className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" placeholder="Full Name" value={editingUser.name} onChange={e=>setEditingUser({...editingUser, name: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">Username / Email</label>
                                    <input className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" placeholder="Username" value={editingUser.email || editingUser.username || ''} onChange={e=>setEditingUser({...editingUser, email: e.target.value, username: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">Password</label>
                                    <input className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" type="password" placeholder="Password" value={editingUser.password || ''} onChange={e=>setEditingUser({...editingUser, password: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">Role</label>
                                    <input 
                                        className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                        placeholder="Enter Role Manually" 
                                        value={editingUser.role} 
                                        onChange={e=>setEditingUser({...editingUser, role: e.target.value as any})} 
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2 mt-4">
                                <label className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">Permissions</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.keys(editingUser.permissions).map(perm => (
                                        <label key={perm} className="flex items-center gap-2 p-2 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 cursor-pointer hover:bg-orange-100/30 dark:hover:bg-orange-900/30">
                                            <input 
                                                type="checkbox" 
                                                checked={(editingUser.permissions as any)[perm]} 
                                                onChange={e => setEditingUser({
                                                    ...editingUser,
                                                    permissions: { ...editingUser.permissions, [perm]: e.target.checked }
                                                })}
                                                className="w-4 h-4 text-orange-600 rounded"
                                            />
                                            <span className="text-[10px] font-medium text-gray-700 dark:text-slate-300 capitalize">{perm.replace('can', '').replace(/([A-Z])/g, ' $1')}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setEditingUser(null)} className="px-3 py-1.5 text-gray-600 dark:text-slate-400 text-sm font-medium">Cancel</button>
                                <button onClick={handleEdit} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-bold">Update User</button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        {localUsers
                            .filter(u => {
                                // Creator sees everyone
                                if (currentUser.role === UserRole.CREATOR || currentUser.email === CREATOR_USER.email) {
                                    return true;
                                }
                                // Others see everyone EXCEPT the Creator (by role or email)
                                return u.role !== UserRole.CREATOR && u.email !== CREATOR_USER.email;
                            })
                            .map(u => (
                            <div key={u.uid || u.username} className="flex items-center justify-between p-3 border dark:border-slate-800 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-gray-500 dark:text-slate-400 font-bold text-xs">
                                        {u.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-800 dark:text-white text-sm">{u.name} <span className="text-gray-400 dark:text-slate-500 font-normal">({u.email || u.username})</span></p>
                                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase">{u.role}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setEditingUser(u); setShowAdd(false); }} className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    {u.email !== CREATOR_USER.username && (
                                        <button onClick={() => handleDelete(u)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t dark:border-slate-800 text-center text-xs text-gray-500 dark:text-slate-400 font-medium">
                    Only Admin can Create New User.
                </div>
            </div>
        </div>
    );
};

const ManageCompaniesModal = ({ onClose, companies, openConfirm, onLog }: { onClose: () => void, companies: Company[], openConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning') => void, onLog: any }) => {
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        address: '',
        email: '',
        phone: '',
        logo: ''
    });
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = async () => {
        if (!formData.name.trim() || !formData.code.trim()) return;
        await addCompany(formData);
        onLog('Company Added', `New company ${formData.name} (${formData.code}) was registered in the system.`, 'create');
        setFormData({ code: '', name: '', address: '', email: '', phone: '', logo: '' });
        setIsAdding(false);
    };

    const handleUpdate = async (company: Company) => {
        await updateCompany(company);
        onLog('Company Updated', `Details for company ${company.name} were updated.`, 'update');
    };

    const handleDelete = async (id: string) => {
        const company = companies.find(c => c.id === id);
        openConfirm(
            "Delete Company",
            "Are you sure you want to delete this company? This action cannot be undone.",
            async () => {
                await deleteCompany(id);
                if (company) {
                    onLog('Company Deleted', `Company ${company.name} was removed from the system.`, 'delete');
                }
            }
        );
    };

    const handleLogoUpload = async (company: Company | null, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const base64 = evt.target?.result as string;
            if (company) {
                await updateCompany({ ...company, logo: base64 });
            } else {
                setFormData(prev => ({ ...prev, logo: base64 }));
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Manage Companies</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5 dark:text-slate-400" /></button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Add New Company Form */}
                    <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl p-4 border border-indigo-100 dark:border-indigo-900/30 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-400">Add New Company</h3>
                            {!isAdding && (
                                <button 
                                    onClick={() => setIsAdding(true)}
                                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                                >
                                    + Create New
                                </button>
                            )}
                        </div>

                        {isAdding && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase">Company Code</label>
                                        <input 
                                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                            placeholder="e.g. A1" 
                                            value={formData.code} 
                                            onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))} 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase">Company Name</label>
                                        <input 
                                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                            placeholder="e.g. Acme Corp" 
                                            value={formData.name} 
                                            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase">Email Address</label>
                                        <input 
                                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                            placeholder="contact@company.com" 
                                            value={formData.email} 
                                            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase">Contact Number</label>
                                        <input 
                                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                            placeholder="+971 50 123 4567" 
                                            value={formData.phone} 
                                            onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase">Office Address</label>
                                    <input 
                                        className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white" 
                                        placeholder="123 Business St, Suite 100" 
                                        value={formData.address} 
                                        onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))} 
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={e => handleLogoUpload(null, e)}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                            />
                                            <button className="px-3 py-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700">
                                                Upload Logo
                                            </button>
                                        </div>
                                        {formData.logo && (
                                            <img src={formData.logo} alt="Preview" className="h-8 w-8 object-contain rounded border dark:border-slate-700 bg-white dark:bg-slate-800" />
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setIsAdding(false)}
                                            className="px-4 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleAdd}
                                            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 shadow-sm"
                                        >
                                            Save Company
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Existing Companies List */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Registered Companies ({companies.length})</h3>
                        <div className="grid gap-4">
                            {companies.map(c => (
                                <div key={c.id} className="p-4 border dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm hover:shadow-md dark:hover:shadow-none transition-shadow space-y-4 relative group">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            {c.logo ? (
                                                <img src={c.logo} alt={c.name} className="h-10 w-10 object-contain rounded-lg border dark:border-slate-800 p-1 bg-gray-50 dark:bg-slate-800" />
                                            ) : (
                                                <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg">
                                                    {c.name.charAt(0)}
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-bold text-gray-800 dark:text-white text-sm">{c.name}</h3>
                                                <p className="text-[10px] text-gray-400 dark:text-slate-500">ID: {c.id}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(c.id)} 
                                            className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete Company"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Company Code</label>
                                            <input 
                                                className="w-full p-2 border border-gray-100 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/30 dark:bg-slate-800/30 text-gray-900 dark:text-white" 
                                                value={c.code || ''} 
                                                onChange={e => handleUpdate({...c, code: e.target.value})} 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Address</label>
                                            <input 
                                                className="w-full p-2 border border-gray-100 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/30 dark:bg-slate-800/30 text-gray-900 dark:text-white" 
                                                value={c.address || ''} 
                                                onChange={e => handleUpdate({...c, address: e.target.value})} 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Email</label>
                                            <input 
                                                className="w-full p-2 border border-gray-100 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/30 dark:bg-slate-800/30 text-gray-900 dark:text-white" 
                                                value={c.email || ''} 
                                                onChange={e => handleUpdate({...c, email: e.target.value})} 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Phone</label>
                                            <input 
                                                className="w-full p-2 border border-gray-100 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/30 dark:bg-slate-800/30 text-gray-900 dark:text-white" 
                                                value={c.phone || ''} 
                                                onChange={e => handleUpdate({...c, phone: e.target.value})} 
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                                        <div className="relative">
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={e => handleLogoUpload(c, e)}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                            />
                                            <button className="text-[10px] font-bold text-indigo-600 hover:underline">
                                                Change Logo
                                            </button>
                                        </div>
                                        <span className="text-[10px] text-gray-300 italic">Auto-saves on change</span>
                                    </div>
                                </div>
                            ))}
                            {companies.length === 0 && (
                                <div className="py-12 text-center border-2 border-dashed rounded-2xl">
                                    <Building2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                                    <p className="text-gray-500 text-sm font-medium">No companies registered yet</p>
                                    <p className="text-gray-400 text-xs mt-1">Add your first company to start managing employees</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BulkImportModal = ({ onClose, onImport }: { onClose: () => void, onImport: (data: any[]) => void }) => {
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);
            onImport(data);
            onClose();
        };
        reader.readAsBinaryString(file);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                            <Download className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Bulk Import Employees</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5 dark:text-slate-400" /></button>
                </div>
                
                <div className="p-8 text-center space-y-4">
                    <div className="border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-8 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors cursor-pointer relative">
                        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                        <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-indigo-600 dark:text-indigo-400">
                                <FileText className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-700 dark:text-slate-200">Click to upload or drag and drop</p>
                                <p className="text-sm text-gray-500 dark:text-slate-400">Excel or CSV files only</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Make sure your file follows the standard template format.</p>
                </div>
            </div>
        </div>
    );
};

// --- Main App ---

const AboutView = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-indigo-600 to-blue-600"></div>
                <div className="px-8 pb-8">
                    <div className="relative flex justify-between items-end -mt-12 mb-6">
                        <div className="p-1 bg-white dark:bg-slate-900 rounded-2xl shadow-lg">
                            <div className="w-24 h-24 bg-gray-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                <Users className="w-12 h-12" />
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{DEFAULT_ABOUT_DATA.name}</h2>
                            <p className="text-indigo-600 dark:text-indigo-400 font-medium">{DEFAULT_ABOUT_DATA.title}</p>
                        </div>
                        
                        <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
                            {DEFAULT_ABOUT_DATA.bio}
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm text-gray-400 dark:text-slate-500">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 dark:text-slate-500 uppercase font-bold">Email</p>
                                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{DEFAULT_ABOUT_DATA.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm text-gray-400 dark:text-slate-500">
                                    <AlertCircle className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 dark:text-slate-500 uppercase font-bold">Support</p>
                                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{DEFAULT_ABOUT_DATA.contactInfo}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-900 dark:bg-indigo-950 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10">
                    <h3 className="text-xl font-bold mb-2">Al Reem DMS Enterprise</h3>
                    <p className="text-indigo-100 mb-6 max-w-lg">
                        A robust workforce management ecosystem built for scale, efficiency, and real-time operational control.
                    </p>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2 text-sm bg-white/10 px-3 py-1.5 rounded-full">
                            <ShieldCheck className="w-4 h-4 text-green-400" /> Secure
                        </div>
                        <div className="flex items-center gap-2 text-sm bg-white/10 px-3 py-1.5 rounded-full">
                            <CheckCircle className="w-4 h-4 text-blue-400" /> Verified
                        </div>
                    </div>
                </div>
                <Building2 className="absolute -right-8 -bottom-8 w-64 h-64 text-white/5 rotate-12" />
            </div>
        </div>
    );
};

const AuditLogModal = ({ isOpen, onClose, logs }: { isOpen: boolean, onClose: () => void, logs: AuditLog[] }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-brand-50 dark:bg-brand-900/20 rounded-2xl">
                            <Activity className="w-6 h-6 text-brand-600 dark:text-brand-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">System Audit Log</h2>
                            <p className="text-slate-400 dark:text-slate-500 text-sm font-bold">Real-time system activity and security trail</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-all active:scale-95"
                    >
                        <X className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="space-y-4">
                        {logs.length > 0 ? (
                            logs.map((log) => (
                                <div key={log.id} className="group p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 hover:border-brand-200 dark:hover:border-brand-900/30 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl hover:shadow-brand-500/5 dark:hover:shadow-none transition-all duration-300">
                                    <div className="flex items-start gap-6">
                                        <div className={cn(
                                            "p-4 rounded-2xl shrink-0 transition-transform group-hover:scale-110 duration-300",
                                            log.type === 'create' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                                            log.type === 'delete' ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
                                            log.type === 'update' ? 'bg-brand-100 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                        )}>
                                            {log.type === 'create' ? <UserPlus className="w-6 h-6" /> :
                                             log.type === 'delete' ? <UserMinus className="w-6 h-6" /> :
                                             log.type === 'update' ? <Edit className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{log.action}</h4>
                                                <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{new Date(log.timestamp).toLocaleString()}</span>
                                            </div>
                                            <p className="text-slate-600 dark:text-slate-300 font-bold text-sm mb-4 leading-relaxed">{log.details}</p>
                                            <div className="flex flex-wrap items-center gap-4">
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                                                    <div className="w-2 h-2 rounded-full bg-brand-500"></div>
                                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">User: {log.userName}</span>
                                                </div>
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Role: {log.userRole}</span>
                                                </div>
                                                {log.isCreator && (
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
                                                        <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">Creator Log</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-20 text-center">
                                <Activity className="w-16 h-16 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">No audit records found</h3>
                                <p className="text-slate-400 dark:text-slate-500 font-bold mt-2">System activity will appear here as it happens.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-8 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-sm font-black hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 shadow-sm"
                    >
                        Close Logs
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const RejoinModal = ({ employee, onComplete, onCancel }: { employee: Employee, onComplete: (reason: string) => void, onCancel: () => void }) => {
    const [reason, setReason] = useState('');

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-transparent dark:border-slate-800">
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Rejoin: {employee.name}</h2>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors text-gray-500 dark:text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Rejoining Reason</label>
                        <textarea 
                            className="w-full p-3 border dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500" 
                            rows={4} 
                            placeholder="Enter reason for rejoining..."
                            value={reason} 
                            onChange={e => setReason(e.target.value)} 
                        />
                    </div>
                </div>
                <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel</button>
                    <button 
                        onClick={() => onComplete(reason)} 
                        disabled={!reason.trim()}
                        className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Confirm Rejoin
                    </button>
                </div>
            </div>
        </div>
    );
};

const OffboardingDetailsModal = ({ employee, onCancel }: { employee: Employee, onCancel: () => void }) => {
    const details = employee.offboardingDetails;
    if (!details) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-transparent dark:border-slate-800 max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-xl">
                            <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Offboarding Details</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{employee.name} • {employee.code}</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors text-gray-500 dark:text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-8 overflow-y-auto space-y-8">
                    {/* Exit Info */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Exit Type</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{details.type}</p>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Last Working Day</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{new Date(details.exitDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                        </div>
                        <div className="col-span-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reason for Leaving</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{details.reason || 'No reason specified'}</p>
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Financial Settlement</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Gratuity</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">AED {details.gratuity.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Leave Encashment</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">AED {details.leaveEncashment.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Salary Dues</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">AED {details.salaryDues.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Other Dues</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">AED {details.otherDues.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl">
                                <p className="text-[10px] font-bold text-red-400 uppercase mb-1">Deductions</p>
                                <p className="text-sm font-bold text-red-600 dark:text-red-400">AED {details.deductions.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 rounded-2xl">
                                <p className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Net Settlement</p>
                                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">AED {details.netSettlement.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* Assets & Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Assets Status</p>
                            <div className="flex items-center gap-2">
                                {details.assetsReturned ? (
                                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                                        <CheckCircle className="w-4 h-4" /> All Assets Returned
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-bold">
                                        <XCircle className="w-4 h-4" /> Assets Pending
                                    </div>
                                )}
                            </div>
                        </div>
                        {details.notes && (
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Additional Notes</p>
                                <p className="text-sm text-slate-600 dark:text-slate-400 italic">{details.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Document Preview */}
                    {details.settlementLink && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Settlement Document</h3>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
                                            <FileText className="w-5 h-5 text-brand-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">Final_Settlement_{employee.code}.pdf</p>
                                            <p className="text-[10px] text-slate-500 font-medium">Signed Document</p>
                                        </div>
                                    </div>
                                    <a 
                                        href={details.settlementLink} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-brand-600 dark:text-brand-400 transition-all flex items-center gap-2"
                                    >
                                        <Download className="w-3 h-3" /> Download
                                    </a>
                                </div>
                                <div className="aspect-video bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative group">
                                    <iframe 
                                        src={details.settlementLink.includes('drive.google.com') ? details.settlementLink.replace('/view', '/preview') : details.settlementLink} 
                                        className="w-full h-full border-none"
                                        title="Document Preview"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end">
                    <button onClick={onCancel} className="px-8 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-105 active:scale-95">
                        Close Details
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [systemUser, setSystemUser] = useState<SystemUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [deductions, setDeductions] = useState<DeductionRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const hasLoggedLogin = useRef(false);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Force light mode and clear any stored preferences
    const root = window.document.documentElement;
    const body = window.document.body;
    root.classList.remove('dark');
    root.classList.remove('dark-theme');
    body.classList.remove('dark');
    body.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
    setIsDarkMode(false);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    if (isDarkMode) {
      root.classList.add('dark');
      body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.remove('dark-theme');
      body.classList.remove('dark');
      body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleToggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    
    // Update document class immediately for better responsiveness
    const root = window.document.documentElement;
    const body = window.document.body;
    if (newMode) {
      root.classList.add('dark');
      body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.remove('dark-theme');
      body.classList.remove('dark');
      body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }

    if (systemUser) {
      const updatedUser = { ...systemUser, theme: (newMode ? 'dark' : 'light') as 'light' | 'dark' };
      try {
        await saveSystemUser(updatedUser);
        setSystemUser(updatedUser);
      } catch (error) {
        console.error("Failed to save theme preference:", error);
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      openConfirm('Password Reset', `A password reset email has been sent to ${user.email}. Please check your inbox.`, () => {}, 'warning');
    } catch (error: any) {
      openConfirm('Error', `Failed to send reset email: ${error.message}`, () => {}, 'danger');
    }
  };
  
  // View States
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showOffboarding, setShowOffboarding] = useState<Employee | null>(null);
  const [showOffboardingDetails, setShowOffboardingDetails] = useState<Employee | null>(null);
  const [showRejoining, setShowRejoining] = useState<Employee | null>(null);
  const [showEdit, setShowEdit] = useState<Employee | null>(null);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showManageCompanies, setShowManageCompanies] = useState(false);
  const [showHolidayManagement, setShowHolidayManagement] = useState(false);
  const [showLeaveRequest, setShowLeaveRequest] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showPayslip, setShowPayslip] = useState<Employee | null>(null);
  
  // Confirm Modal
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, type: 'danger' as 'danger' | 'warning' });
  const openConfirm = (title: string, message: string, onConfirm: () => void, type: 'danger' | 'warning' = 'danger') => {
      setConfirmModal({ isOpen: true, title, message, onConfirm, type });
  };

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create system user profile
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setSystemUser(snap.data() as SystemUser);
        } else {
          // Create default profile for new user
          const isDefaultAdmin = firebaseUser.email === "abdulkaderp3010@gmail.com";
          const newProfile: SystemUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            username: firebaseUser.email?.split('@')[0] || firebaseUser.uid,
            name: firebaseUser.displayName || 'New User',
            role: isDefaultAdmin ? UserRole.CREATOR : UserRole.HR,
            active: true,
            permissions: {
              canViewDashboard: true,
              canManageEmployees: true,
              canViewDirectory: true,
              canManageAttendance: true,
              canViewTimesheet: true,
              canManageLeaves: true,
              canViewPayroll: true,
              canManagePayroll: isDefaultAdmin,
              canViewReports: true,
              canManageUsers: isDefaultAdmin,
              canManageSettings: isDefaultAdmin
            }
          };
          await saveSystemUser(newProfile);
          setSystemUser(newProfile);
        }
      } else {
        setSystemUser(null);
      }
      setIsAuthReady(true);
    });
    testConnection();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !user || !systemUser) return;
    
    let q;
    const isCreator = systemUser?.role === UserRole.CREATOR || user?.email === "abdulkaderp3010@gmail.com";
    
    const canViewAudit = isCreator || systemUser.permissions.canManageSettings || systemUser.permissions.canManageUsers || systemUser.permissions.canManageEmployees;
    
    if (!canViewAudit) {
      setIsAuthReady(true);
      return;
    }

    if (isCreator) {
      q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
    } else {
      // Admins can only see non-creator logs
      q = query(
        collection(db, 'audit_logs'), 
        where('isCreator', '==', false),
        orderBy('timestamp', 'desc'), 
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAuditLogs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AuditLog)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    });
    return () => unsubscribe();
  }, [user, systemUser]);

  const handleLogAction = async (action: string, details: string, type: 'create' | 'update' | 'delete' | 'system') => {
    if (systemUser) {
      await logAudit(systemUser, action, details, type);
    }
  };

  // 2. Data Listeners
  useEffect(() => {
    if (!isAuthReady || !user) return;
    const isCreator = systemUser?.role === UserRole.CREATOR || user?.email === "abdulkaderp3010@gmail.com";

    const unsubEmployees = (systemUser?.permissions?.canViewDirectory || systemUser?.permissions?.canManageEmployees || isCreator) ? onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(d => d.data() as Employee));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'employees');
    }) : () => {};

    const unsubAttendance = (systemUser?.permissions?.canViewTimesheet || systemUser?.permissions?.canManageAttendance || isCreator) ? onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map(d => d.data() as AttendanceRecord));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    }) : () => {};

    const unsubLeaves = (systemUser?.permissions?.canManageLeaves || isCreator) ? onSnapshot(collection(db, 'leaves'), (snap) => {
      setLeaveRequests(snap.docs.map(d => d.data() as LeaveRequest));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leaves');
    }) : () => {};

    const unsubDeductions = (systemUser?.permissions?.canViewPayroll || systemUser?.permissions?.canManagePayroll || isCreator) ? onSnapshot(collection(db, 'deductions'), (snap) => {
      setDeductions(snap.docs.map(d => d.data() as DeductionRecord));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'deductions');
    }) : () => {};

    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snap) => {
      setCompanies(snap.docs.map(d => d.data() as Company));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'companies');
    });

    const unsubUsers = (systemUser?.permissions?.canManageUsers || isCreator) ? onSnapshot(collection(db, 'users'), (snap) => {
      setSystemUsers(snap.docs.map(d => d.data() as SystemUser));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    }) : () => {};

    return () => {
      unsubEmployees();
      unsubAttendance();
      unsubLeaves();
      unsubDeductions();
      unsubCompanies();
      unsubUsers();
    };
  }, [isAuthReady, user, systemUser]);

  // Handlers
  const navItems = useMemo(() => {
    const baseItems = [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3, permission: 'canViewDashboard' },
      { id: 'company', label: 'Company', icon: Building2, permission: 'canViewDashboard' },
      { id: 'staff', label: 'Staff Directory', icon: Users, permission: 'canManageEmployees' },
      { id: 'ex-employees', label: 'Ex-Employees', icon: UserMinus, permission: 'canManageEmployees' }, 
      { id: 'timesheet', label: 'Monthly Timesheet', icon: Calendar, permission: 'canViewTimesheet' },
      { id: 'deductions', label: 'Deductions', icon: Wallet, permission: 'canManagePayroll' },
      { id: 'leave', label: 'Leave Management', icon: FileText, permission: 'canManageLeaves' },
      { id: 'payroll', label: 'Payroll Register', icon: DirhamIcon, permission: 'canViewPayroll' },
      { id: 'reports', label: 'Reports', icon: BarChart3, permission: 'canViewReports' },
      { id: 'about', label: 'About', icon: AlertCircle, creatorOnly: true },
    ];
    
    if (!systemUser) return baseItems.filter(item => !item.permission && !item.creatorOnly);
    
    const isCreator = systemUser.role === UserRole.CREATOR || systemUser.email === 'abdulkaderp3010@gmail.com';
    
    return baseItems.filter(item => {
        if (item.creatorOnly && !isCreator) return false;
        return !item.permission || (systemUser.permissions as any)[item.permission];
    });
  }, [systemUser]);

  useEffect(() => {
    if (systemUser) {
      const currentTabItem = navItems.find(item => item.id === activeTab);
      if (currentTabItem && currentTabItem.permission && !(systemUser.permissions as any)[currentTabItem.permission]) {
        setActiveTab('dashboard');
      }
    }
  }, [activeTab, systemUser, navItems]);

  const handleOffboard = async (data: OffboardingDetails) => {
      if (showOffboarding) {
          await offboardEmployee(showOffboarding.id, data);
          handleLogAction('Employee Offboarded', `Employee ${showOffboarding.name} (${showOffboarding.code}) was offboarded. Reason: ${data.reason}`, 'delete');
          setShowOffboarding(null);
      }
  };

  const handleDeleteEmployee = async (e: Employee) => {
      openConfirm(
          "Delete Employee",
          `Are you sure you want to permanently delete ${e.name}? This action cannot be undone.`,
          async () => {
              try {
                  await deleteEmployee(e.id);
                  handleLogAction('Employee Deleted', `Employee ${e.name} (${e.code}) was permanently removed from the system.`, 'delete');
              } catch (err: any) {
                  alert(err.message || "Error deleting employee");
              }
          }
      );
  };

  const handleRejoinEmployee = (e: Employee) => {
      setShowRejoining(e);
  };

  const handleLogout = async () => {
    if (systemUser) {
        await logAudit(systemUser, 'User Logout', `User ${systemUser.name} logged out of the system.`, 'system');
    }
    await logout();
    setSystemUser(null);
    hasLoggedLogin.current = false;
  };

  const expiringDocs = useMemo(() => {
    const now = new Date();
    const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    
    const results: any[] = [];
    
    // Check employee documents
    employees.forEach(emp => {
        if (!emp.active) return;
        
        const docs = [
            { name: 'Emirates ID', date: emp.documents?.emiratesIdExpiry },
            { name: 'Passport', date: emp.documents?.passportExpiry },
            { name: 'Labour Card', date: emp.documents?.labourCardExpiry },
            { name: 'Visa', date: emp.documents?.visaExpiry }
        ];
        
        docs.forEach(doc => {
            if (doc.date) {
                const expiry = new Date(doc.date);
                if (expiry <= now) {
                    results.push({ employeeName: emp.name, docName: doc.name, status: 'Expired', date: doc.date, type: 'employee' });
                } else if (expiry <= tenDaysFromNow) {
                    results.push({ employeeName: emp.name, docName: doc.name, status: 'Expiring Soon', date: doc.date, type: 'employee' });
                }
            }
        });
    });

    // Check company documents
    companies.forEach(company => {
        company.driveFiles?.forEach(file => {
            if (file.expiryDate) {
                const expiry = new Date(file.expiryDate);
                if (expiry <= now) {
                    results.push({ employeeName: company.name, docName: file.name, status: 'Expired', date: file.expiryDate, type: 'company' });
                } else if (expiry <= tenDaysFromNow) {
                    results.push({ employeeName: company.name, docName: file.name, status: 'Expiring Soon', date: file.expiryDate, type: 'company' });
                }
            }
        });
    });

    return results;
  }, [employees, companies]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!systemUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-600 font-medium">Setting up your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout
      navItems={navItems}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      user={systemUser}
      onLogout={handleLogout}
      companies={companies}
      expiringDocs={expiringDocs}
      employees={employees}
    >
      {activeTab === 'dashboard' && (
        <DashboardView 
          employees={employees} 
          attendance={attendance} 
          user={systemUser}
          auditLogs={auditLogs}
          setShowAuditModal={setShowAuditModal}
          onOpenUserManagement={() => setShowUserManagement(true)}
          onOpenManageCompanies={() => setShowManageCompanies(true)}
          onOpenOnboarding={() => setShowOnboarding(true)}
          onUpdate={() => {}}
          setActiveTab={setActiveTab}
        />
      )}
      {activeTab === 'company' && (
        <CompanyView 
          companies={companies} 
          openConfirm={openConfirm}
          onUpdate={updateCompany}
          user={systemUser}
        />
      )}
      {activeTab === 'staff' && (
        <StaffDirectoryView 
          employees={employees.filter(e => e.active)} 
          companies={companies}
          onAdd={() => setShowOnboarding(true)} 
          onEdit={(e: Employee) => setShowEdit(e)} 
          onOffboard={(e: Employee) => setShowOffboarding(e)}
          onDelete={handleDeleteEmployee}
          user={systemUser}
        />
      )}
      {activeTab === 'ex-employees' && (
        <StaffDirectoryView 
          employees={employees.filter(e => !e.active)} 
          companies={companies}
          onEdit={(e: Employee) => setShowEdit(e)}
          onDelete={handleDeleteEmployee}
          onRejoin={handleRejoinEmployee}
          onViewOffboarding={(e: Employee) => setShowOffboardingDetails(e)}
          readOnly={true}
          user={systemUser}
        />
      )}
      {activeTab === 'timesheet' && (
        <TimesheetView 
            employees={employees.filter(e => e.active)} 
            attendance={attendance} 
            selectedMonth={selectedMonth} 
            onMonthChange={setSelectedMonth} 
            user={systemUser}
            onLogAttendance={logAttendance}
            onDeleteAttendance={deleteAttendanceRecord}
            companies={companies}
        />
      )}
      {activeTab === 'deductions' && (
        <DeductionsView employees={employees} deductions={deductions} openConfirm={openConfirm} user={systemUser} companies={companies} />
      )}
      {activeTab === 'leave' && (
        <LeaveManagementView employees={employees} leaveRequests={leaveRequests} user={systemUser} companies={companies} />
      )}
      {activeTab === 'payroll' && (
        <PayrollRegisterView employees={employees.filter(e => e.active)} attendance={attendance} deductions={deductions} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} user={systemUser} companies={companies} />
      )}
      {activeTab === 'reports' && (
        <ReportsView employees={employees} attendance={attendance} />
      )}
      {activeTab === 'about' && (
        <AboutView />
      )}
      {activeTab === 'profile' && (
        <ProfileView user={systemUser} />
      )}
      {activeTab === 'settings' && (
        <SettingsView 
          user={systemUser} 
          isDarkMode={isDarkMode}
          onToggleDarkMode={handleToggleDarkMode}
          onPasswordReset={handlePasswordReset}
        />
      )}
      {activeTab === 'help' && (
        <HelpCenterView />
      )}

      {/* Modals */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWizard companies={companies} onComplete={async (d) => { 
            const fullData = { ...d, id: Math.random().toString(36).substr(2, 9) } as Employee;
            await saveEmployee(fullData); 
            handleLogAction('Employee Onboarded', `New employee ${fullData.name} (${fullData.code}) was added to the system.`, 'create');
            setShowOnboarding(false); 
          }} onCancel={() => setShowOnboarding(false)} />
        )}
        {showOffboarding && (
          <OffboardingWizard employee={showOffboarding} onComplete={handleOffboard} onCancel={() => setShowOffboarding(null)} />
        )}
        {showRejoining && (
          <RejoinModal 
            employee={showRejoining}
            onCancel={() => setShowRejoining(null)}
            onComplete={async (reason) => {
              try {
                await rehireEmployee(showRejoining.id, new Date().toISOString().split('T')[0], reason);
                await handleLogAction('Employee Rehired', `Employee ${showRejoining.name} (${showRejoining.code}) has rejoined the company.`, 'create');
                setShowRejoining(null);
              } catch (err: any) {
                alert(err.message || "Error rejoining employee");
              }
            }}
          />
        )}
        {showOffboardingDetails && (
          <OffboardingDetailsModal 
            employee={showOffboardingDetails}
            onCancel={() => setShowOffboardingDetails(null)}
          />
        )}
        {showEdit && (
          <EditEmployeeModal companies={companies} employee={showEdit} onSave={async (d) => { 
            await saveEmployee(d); 
            handleLogAction('Employee Updated', `Details for employee ${d.name} (${d.code}) were updated.`, 'update');
            setShowEdit(null); 
          }} onCancel={() => setShowEdit(null)} />
        )}
        {showUserManagement && (
          <UserManagementModal onClose={() => setShowUserManagement(false)} users={systemUsers} openConfirm={openConfirm} currentUser={systemUser} onLog={handleLogAction} />
        )}
        {showManageCompanies && (
          <ManageCompaniesModal onClose={() => setShowManageCompanies(false)} companies={companies} openConfirm={openConfirm} onLog={handleLogAction} />
        )}
        {showAuditModal && (
          <AuditLogModal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} logs={auditLogs} />
        )}
        {showBulkImport && (
          <BulkImportModal onClose={() => setShowBulkImport(false)} onImport={(data) => {
            data.forEach(async item => {
              const newEmp: Employee = {
                id: Math.random().toString(36).substr(2, 9),
                code: String(item.Code || item.code || ''),
                name: String(item.Name || item.name || ''),
                company: String(item.Company || item.company || (companies[0] || 'Default')),
                team: 'Internal Team',
                designation: String(item.Designation || item.designation || 'Helper'),
                department: String(item.Department || item.department || 'Operations'),
                type: StaffType.WORKER,
                status: 'Active',
                active: true,
                joiningDate: new Date().toISOString().split('T')[0],
                workLocation: 'Dubai',
                leaveBalance: 30,
                salary: { basic: 0, housing: 0, transport: 0, other: 0, airTicket: 0, leaveSalary: 0 }
              };
              await saveEmployee(newEmp);
            });
            setShowBulkImport(false);
          }} />
        )}
      </AnimatePresence>
      
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({...confirmModal, isOpen: false})} {...confirmModal} />
    </Layout>
  );
}

// --- Dashboard View ---

const DashboardView = ({ employees, attendance, user, auditLogs, setShowAuditModal, onOpenUserManagement, onOpenManageCompanies, onOpenOnboarding, onUpdate, setActiveTab }: any) => {
    const [showQuickAdminMenu, setShowQuickAdminMenu] = useState(false);
    
    // Stats Calculation
    const activeStaff = employees.filter((e:any) => e.active);
    const internalTeam = activeStaff.filter((e:any) => e.team === 'Internal Team').length;
    const externalTeam = activeStaff.filter((e:any) => e.team === 'External Team').length;
    const officeStaff = activeStaff.filter((e:any) => e.team === 'Office Staff' || e.type === StaffType.OFFICE).length;

    const canManageUsers = user?.permissions?.canManageUsers;
    const canManageSettings = user?.permissions?.canManageSettings;
    const canManageEmployees = user?.permissions?.canManageEmployees;
    const canManageAttendance = user?.permissions?.canManageAttendance;
    const canManagePayroll = user?.permissions?.canManagePayroll;
    
    // Chart Data: Staff by Department
    const deptStats = useMemo(() => {
        const counts: Record<string, number> = {};
        activeStaff.forEach((e:any) => {
            counts[e.department] = (counts[e.department] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [activeStaff]);

    // Chart Data: Monthly Growth (Mocked for visual impact)
    const growthData = [
        { month: 'Oct', count: activeStaff.length - 15 },
        { month: 'Nov', count: activeStaff.length - 12 },
        { month: 'Dec', count: activeStaff.length - 8 },
        { month: 'Jan', count: activeStaff.length - 5 },
        { month: 'Feb', count: activeStaff.length - 2 },
        { month: 'Mar', count: activeStaff.length },
    ];

    const COLORS = ['#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b'];

    const handleExport = () => {
        const data = employees.map((e: any) => ({
            'Code': e.code,
            'Name': e.name,
            'Company': e.company,
            'Department': e.department,
            'Designation': e.designation,
            'Status': e.status,
            'Joining Date': e.joiningDate
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Employees");
        XLSX.writeFile(wb, "AlReem_Personnel_Data.xlsx");
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                {user.role === UserRole.CREATOR && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-brand-600 font-bold text-xs uppercase tracking-[0.2em]">
                            <Activity className="w-4 h-4" />
                            System Intelligence
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Executive Dashboard</h1>
                        <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xl">
                            Welcome back, <span className="text-slate-900 dark:text-white font-bold">{user.name}</span>. 
                            The system is currently monitoring <span className="text-brand-600 font-bold">{activeStaff.length} active personnel</span> across {Object.keys(deptStats).length} departments.
                        </p>
                    </div>
                )}
                {user.role !== UserRole.CREATOR && <div className="flex-1"></div>}
                
                <div className="flex flex-wrap items-center gap-3">
                    {(user.role === UserRole.CREATOR || user.role === UserRole.ADMIN || user.role === UserRole.HR) && (
                        <button 
                            onClick={onOpenOnboarding}
                            className="flex-1 sm:flex-none bg-slate-900 text-white px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95"
                        >
                            <UserPlus className="w-4 h-4" /> Onboard Staff
                        </button>
                    )}
                    {(user.role === UserRole.CREATOR || user.role === UserRole.ADMIN) && (
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <button onClick={onOpenManageCompanies} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all" title="Manage Companies">
                                <Building2 className="w-5 h-5" />
                            </button>
                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-800"></div>
                            <button onClick={onOpenUserManagement} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-all" title="System Users">
                                <UserCog className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Stat Cards */}
                <BentoStatCard 
                    title="Active Workforce" 
                    value={activeStaff.length} 
                    trend="+12.5%" 
                    isUp={true}
                    icon={Users} 
                    color="brand"
                />
                <BentoStatCard 
                    title="Office Personnel" 
                    value={officeStaff} 
                    trend="+4.2%" 
                    isUp={true}
                    icon={Building2} 
                    color="indigo"
                />
                <BentoStatCard 
                    title="Field Operations" 
                    value={externalTeam} 
                    trend="-2.1%" 
                    isUp={false}
                    icon={HardHat} 
                    color="orange"
                />
                <BentoStatCard 
                    title="Internal Support" 
                    value={internalTeam} 
                    trend="+8.0%" 
                    isUp={true}
                    icon={ShieldCheck} 
                    color="emerald"
                />

                {/* Recent Activity Log */}
                <div className="md:col-span-2 lg:col-span-2 bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-brand-50 dark:bg-brand-900/20 rounded-2xl">
                                <Activity className="w-5 h-5 text-brand-600" />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">System Activity</h3>
                        </div>
                        <button 
                            onClick={() => setShowAuditModal(true)}
                            className="text-xs font-bold text-brand-600 hover:underline"
                        >
                            View Audit Log
                        </button>
                    </div>
                    
                    <div className="space-y-6 flex-1 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                        {auditLogs.length > 0 ? (
                            auditLogs.slice(0, 5).map((log) => (
                                <ActivityItem 
                                    key={log.id}
                                    icon={log.type === 'create' ? UserPlus : log.type === 'delete' ? UserMinus : log.type === 'update' ? Edit : Activity} 
                                    title={log.action} 
                                    desc={log.details} 
                                    time={new Date(log.timestamp).toLocaleString()} 
                                    color={log.type === 'create' ? 'emerald' : log.type === 'delete' ? 'red' : log.type === 'update' ? 'brand' : 'indigo'}
                                />
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
                                <Activity className="w-12 h-12 mb-4 opacity-20" />
                                <p className="text-sm font-bold">No recent activity</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Actions & Access */}
                <div className="md:col-span-2 lg:col-span-2 bg-brand-600 dark:bg-brand-700 rounded-[2.5rem] p-8 text-white flex flex-col relative overflow-hidden group">
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mb-20 transition-transform duration-700 group-hover:scale-110"></div>
                    
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black tracking-tight">Quick Operations</h3>
                            <div className="relative">
                                <button 
                                    onClick={() => (user.role === UserRole.CREATOR || canManageUsers || canManageSettings) && setShowQuickAdminMenu(!showQuickAdminMenu)}
                                    className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-all"
                                >
                                    <LayoutGrid className="w-5 h-5" />
                                </button>
                                {showQuickAdminMenu && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowQuickAdminMenu(false)}></div>
                                        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 p-2 z-20 text-slate-900 dark:text-white">
                                            {(user.role === UserRole.CREATOR || canManageUsers) && (
                                                <button 
                                                    onClick={() => { onOpenUserManagement(); setShowQuickAdminMenu(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-brand-600 dark:hover:text-brand-400 transition-all"
                                                >
                                                    <UserCog className="w-4 h-4" /> System User Management
                                                </button>
                                            )}
                                            {(user.role === UserRole.CREATOR || canManageSettings) && (
                                                <button 
                                                    onClick={() => { onOpenManageCompanies(); setShowQuickAdminMenu(false); }}
                                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-brand-600 dark:hover:text-brand-400 transition-all"
                                                >
                                                    <Building2 className="w-4 h-4" /> Manage Companies
                                                </button>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <QuickActionButton icon={Download} label="Export Data" onClick={handleExport} />
                            <QuickActionButton icon={ListFilter} label="Smart Filter" onClick={() => setActiveTab('staff')} />
                            <QuickActionButton icon={Settings} label="Preferences" onClick={() => onOpenUserManagement()} />
                        </div>

                        <div className="mt-8 p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-md">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand-600 font-bold">
                                    {user.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-sm font-bold">{user.name}</p>
                                    <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest">Active Session</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

// --- Profile View ---
const ProfileView = ({ user }: { user: SystemUser }) => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-32 bg-brand-600"></div>
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-32 h-32 bg-white dark:bg-slate-800 rounded-3xl flex items-center justify-center text-4xl font-black text-brand-600 shadow-xl border-4 border-white dark:border-slate-700 mb-4">
                        {user.name.charAt(0)}
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white">{user.name}</h2>
                    <p className="text-brand-600 font-bold uppercase tracking-widest text-xs mt-1">{user.role}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mt-12">
                        <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Email Address</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{user.email}</p>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Username</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{user.username || 'Not set'}</p>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Account Status</p>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">{user.active ? 'Active' : 'Inactive'}</p>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">User ID</p>
                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{user.uid}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200/60 dark:border-slate-800 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6">Your Permissions</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(user.permissions).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                            {value ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-slate-300 dark:text-slate-600" />}
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Settings View ---
const SettingsView = ({ user, isDarkMode, onToggleDarkMode, onPasswordReset }: { 
    user: SystemUser, 
    isDarkMode: boolean, 
    onToggleDarkMode: () => void,
    onPasswordReset: () => void 
}) => {
    const canManageSettings = user?.permissions?.canManageSettings;
    
    if (!canManageSettings && user.role !== UserRole.CREATOR) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
                <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6">
                    <ShieldAlert className="w-10 h-10 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-md">
                    You do not have permission to access system settings. Please contact your administrator if you believe this is an error.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-brand-600 rounded-[1.5rem] shadow-lg shadow-brand-600/20">
                    <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight dark:text-white">Account Settings</h2>
                    <p className="text-slate-500 font-medium dark:text-slate-400">Manage your system preferences and security</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/60 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                    <h3 className="text-lg font-black text-slate-900 mb-6 dark:text-white">Security</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Change Password</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Update your account password regularly</p>
                            </div>
                            <button 
                                onClick={onPasswordReset}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-brand-600 hover:bg-slate-50 transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-brand-400"
                            >
                                Update
                            </button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Two-Factor Authentication</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Add an extra layer of security to your account</p>
                            </div>
                            <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-pointer dark:bg-slate-700">
                                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/60 shadow-sm dark:bg-slate-900 dark:border-slate-800">
                    <h3 className="text-lg font-black text-slate-900 mb-6 dark:text-white">System Preferences</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Email Notifications</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Receive system alerts via email</p>
                            </div>
                            <div className="w-12 h-6 bg-brand-600 rounded-full relative cursor-pointer">
                                <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                            </div>
                        </div>
                        <div 
                            onClick={onToggleDarkMode}
                            className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 dark:bg-slate-800/50 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer group"
                        >
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Switch between light and dark themes</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Themes</p>
                            </div>
                            <div 
                                className={cn(
                                    "w-12 h-6 rounded-full relative transition-all duration-300",
                                    isDarkMode ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
                                )}
                            >
                                <motion.div 
                                    animate={{ x: isDarkMode ? 24 : 0 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Help Center View ---
const HelpCenterView = () => {
    const instructions = [
        { title: 'Managing Employees', content: 'To add a new employee, go to the Dashboard and click "Onboard Staff". Fill in the personal, work, and financial details across the 4 steps.' },
        { title: 'Attendance Tracking', content: 'Use the Monthly Timesheet tab to log daily attendance. You can mark status (P, A, W, etc.) and add overtime hours.' },
        { title: 'Payroll Generation', content: 'The Payroll Register automatically calculates salaries based on basic pay and attendance records. You can export the register for processing.' },
        { title: 'Document Expiry', content: 'Check the notifications bell to see documents (Passport, Visa, EID) that are expiring soon. The system alerts you 30 days in advance.' },
        { title: 'System Audits', content: 'Every action is logged in the System Activity section. Creators can view full logs of all user actions.' }
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-brand-50 rounded-2xl dark:bg-brand-900/20">
                    <HelpCircle className="w-6 h-6 text-brand-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Help Center</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Instructions and guides for Al Reem DMS</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {instructions.map((item, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200/60 dark:border-slate-800 shadow-sm">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-3">
                            <span className="w-8 h-8 bg-brand-50 dark:bg-brand-900/20 text-brand-600 rounded-xl flex items-center justify-center text-sm">{idx + 1}</span>
                            {item.title}
                        </h3>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium pl-11">
                            {item.content}
                        </p>
                    </div>
                ))}
            </div>

            <div className="bg-brand-600 rounded-[2.5rem] p-10 text-white text-center">
                <h3 className="text-2xl font-black mb-4">Need more help?</h3>
                <p className="text-white/80 font-medium mb-8">Our support team is available 24/7 for technical assistance.</p>
                <button className="px-8 py-4 bg-white text-brand-600 rounded-2xl font-black hover:bg-slate-50 transition-all shadow-xl shadow-brand-900/20">
                    Contact Support Team
                </button>
            </div>
        </div>
    );
};

const BentoStatCard = ({ title, value, trend, isUp, icon: Icon, color }: any) => {
    const colors: any = {
        brand: "bg-brand-50 text-brand-600 border-brand-100 shadow-brand-500/5 dark:bg-brand-900/20 dark:text-brand-400 dark:border-brand-900/30",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-500/5 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30",
        orange: "bg-orange-50 text-orange-600 border-orange-100 shadow-orange-500/5 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30",
        indigo: "bg-indigo-50 text-indigo-600 border-indigo-100 shadow-indigo-500/5 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-900/30",
    };

    return (
        <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col justify-between min-h-[200px] transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-black/50 group"
        >
            <div className="flex justify-between items-start">
                <div className={cn("p-3.5 rounded-2xl transition-all duration-500 group-hover:rotate-6", colors[color])}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
            <div>
                <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{value}</span>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{title}</p>
            </div>
        </motion.div>
    );
};

const ActivityItem = ({ icon: Icon, title, desc, time, color }: any) => {
    const colors: any = {
        brand: "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400",
        emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
        orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
        indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400",
    };

    return (
        <div className="flex items-start gap-4 group cursor-pointer">
            <div className={cn("p-3 rounded-2xl transition-all group-hover:scale-110", colors[color])}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</h4>
                    <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap uppercase tracking-widest">{time}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">{desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-700 group-hover:text-brand-600 transition-colors self-center" />
        </div>
    );
};

const QuickActionButton = ({ icon: Icon, label, onClick }: any) => (
    <button 
        onClick={onClick}
        className="flex flex-col items-center justify-center gap-3 p-4 bg-white/10 hover:bg-white/20 rounded-3xl border border-white/10 transition-all duration-300 group"
    >
        <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
);

const DashboardStatCard = ({ title, value, icon: Icon, color, index }: any) => {
    const colors: any = {
        brand: "bg-brand-50 text-brand-600 border-brand-100",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        orange: "bg-orange-50 text-orange-600 border-orange-100",
        indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
        red: "bg-red-50 text-red-600 border-red-100"
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card p-6 rounded-3xl flex flex-col justify-between min-h-[160px] hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 group"
        >
            <div className="flex justify-between items-start">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{title}</span>
                <div className={cn("p-2.5 rounded-2xl transition-transform duration-300 group-hover:scale-110", colors[color])}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <div className="mt-4">
                <span className="text-4xl font-bold text-slate-900 tracking-tight">{value}</span>
                <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full">+12%</span>
                    <span className="text-[10px] text-slate-400 font-medium">from last month</span>
                </div>
            </div>
        </motion.div>
    );
};

// --- Sub Views ---

const StaffDirectoryView = ({ employees, companies: companyList, onAdd, onEdit, onOffboard, onDelete, onRejoin, onViewOffboarding, readOnly, user }: { 
    employees: Employee[], 
    companies: Company[],
    onAdd?: () => void, 
    onEdit: (e: Employee) => void, 
    onOffboard?: (e: Employee) => void, 
    onDelete?: (e: Employee) => void, 
    onRejoin?: (e: Employee) => void, 
    onViewOffboarding?: (e: Employee) => void,
    readOnly?: boolean, 
    user: SystemUser | null 
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [companyFilter, setCompanyFilter] = useState('All');
    const [deptFilter, setDeptFilter] = useState('All');
    const [viewRejoinReason, setViewRejoinReason] = useState<Employee | null>(null);
    const canManageEmployees = user?.permissions?.canManageEmployees;

    const calculateExperience = (joiningDate: string, exitDate?: string) => {
        if (!joiningDate) return 'N/A';
        const start = new Date(joiningDate);
        const end = exitDate ? new Date(exitDate) : new Date();
        
        if (isNaN(start.getTime())) return 'N/A';
        
        let years = end.getFullYear() - start.getFullYear();
        let months = end.getMonth() - start.getMonth();
        
        if (months < 0 || (months === 0 && end.getDate() < start.getDate())) {
            years--;
            months += 12;
        }
        
        if (years <= 0 && months <= 0) return '0 Months';
        if (years === 0) return `${months} ${months === 1 ? 'Month' : 'Months'}`;
        return `${years} ${years === 1 ? 'Year' : 'Years'}${months > 0 ? ` ${months} ${months === 1 ? 'Month' : 'Months'}` : ''}`;
    };

    const companies = useMemo<string[]>(() => ['All', ...Array.from(new Set(employees.map(e => e.company)))], [employees]);
    const departments = useMemo<string[]>(() => ['All', ...Array.from(new Set(employees.map(e => e.department)))], [employees]);

    const filteredEmployees = useMemo(() => {
        return employees.filter((e: Employee) => {
            const company = companyList.find(c => c.name === e.company);
            const matchesSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                company?.code.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCompany = companyFilter === 'All' || e.company === companyFilter;
            const matchesDept = deptFilter === 'All' || e.department === deptFilter;
            return matchesSearch && matchesCompany && matchesDept;
        });
    }, [employees, searchTerm, companyFilter, deptFilter, companyList]);

    return (
        <div className="space-y-6">
            {/* Advanced Filter Bar */}
            <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none flex flex-col lg:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Search personnel by name or ID..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-11 pr-4 py-3.5 bg-slate-100/50 dark:bg-slate-800/50 border-none rounded-2xl text-sm w-full outline-none focus:ring-2 focus:ring-brand-500 transition-all font-medium dark:text-white dark:placeholder:text-slate-500"
                    />
                </div>
                
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <select 
                        value={companyFilter}
                        onChange={(e) => setCompanyFilter(e.target.value)}
                        className="flex-1 lg:flex-none px-4 py-3.5 bg-slate-100/50 dark:bg-slate-800/50 border-none rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none cursor-pointer min-w-[140px]"
                    >
                        {companies.map(c => <option key={c} value={c} className="dark:bg-slate-900">{c}</option>)}
                    </select>

                    <select 
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                        className="flex-1 lg:flex-none px-4 py-3.5 bg-slate-100/50 dark:bg-slate-800/50 border-none rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none cursor-pointer min-w-[140px]"
                    >
                        {departments.map(d => <option key={d} value={d} className="dark:bg-slate-900">{d}</option>)}
                    </select>

                    {!readOnly && canManageEmployees && (
                        <button 
                            onClick={onAdd} 
                            className="flex-1 lg:flex-none bg-brand-600 text-white px-8 py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 hover:bg-brand-700 shadow-xl shadow-brand-500/20 transition-all active:scale-95"
                        >
                            <UserPlus className="w-4 h-4" /> Add Staff
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2.5rem] overflow-hidden border border-white dark:border-slate-800 shadow-2xl shadow-slate-200/60 dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800">
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Personnel Details</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Department & Role</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Organization</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Status</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Experience</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            <AnimatePresence mode="popLayout">
                                {filteredEmployees.map((e: Employee) => (
                                    <motion.tr 
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        key={e.id} 
                                        className="hover:bg-brand-50/20 transition-colors group"
                                    >
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 font-black border border-slate-200 dark:border-slate-700 group-hover:bg-white dark:group-hover:bg-slate-900 group-hover:border-brand-200 dark:group-hover:border-brand-900/30 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-all duration-300 overflow-hidden">
                                                    {e.profileImage ? (
                                                        <img src={e.profileImage} alt={e.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        e.name.charAt(0)
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-black text-slate-900 dark:text-white text-base">{e.name}</div>
                                                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{e.code}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="text-sm font-black text-slate-700 dark:text-slate-300">{e.designation}</div>
                                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest mt-0.5">{e.team}</div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-600 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700 w-fit">
                                                    {e.company}
                                                </span>
                                                {companyList.find(c => c.name === e.company)?.code && (
                                                    <span className="text-[9px] font-black text-brand-600 dark:text-brand-400 mt-1 ml-1 uppercase tracking-wider">
                                                        Code: {companyList.find(c => c.name === e.company)?.code}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full animate-pulse",
                                                    e.active ? "bg-emerald-500" : "bg-red-500"
                                                )}></div>
                                                <span className={cn(
                                                    "text-[10px] font-black uppercase tracking-widest",
                                                    e.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                                                )}>
                                                    {e.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="text-xs font-black text-slate-600 dark:text-slate-400">
                                                {calculateExperience(e.joiningDate, e.offboardingDetails?.exitDate)}
                                            </div>
                                            {!e.active && e.offboardingDetails?.exitDate && (
                                                <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest mt-0.5">
                                                    Until: {e.offboardingDetails.exitDate}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-6">
                                            <div className="flex justify-end gap-2">
                                                {e.active && e.rejoiningReason && (
                                                    <button 
                                                        onClick={() => setViewRejoinReason(e)} 
                                                        className="p-2.5 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg dark:hover:shadow-none text-brand-600 dark:text-brand-400 rounded-xl transition-all border border-transparent hover:border-brand-100 dark:hover:border-brand-900/30 active:scale-90"
                                                        title="View Rejoin Reason"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {canManageEmployees && (
                                                    <button 
                                                        onClick={() => onEdit(e)} 
                                                        className="p-2.5 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg dark:hover:shadow-none text-brand-600 dark:text-brand-400 rounded-xl transition-all border border-transparent hover:border-brand-100 dark:hover:border-brand-900/30 active:scale-90"
                                                        title="Edit Record"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {e.active ? (
                                                    !readOnly && canManageEmployees && (
                                                        <button 
                                                            onClick={() => onOffboard(e)} 
                                                            className="p-2.5 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg dark:hover:shadow-none text-red-600 dark:text-red-400 rounded-xl transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/30 active:scale-90"
                                                            title="Offboard"
                                                        >
                                                            <LogOut className="w-4 h-4" />
                                                        </button>
                                                    )
                                                ) : (
                                                    <div className="flex gap-2">
                                                        {e.offboardingDetails && (
                                                            <button 
                                                                onClick={() => onViewOffboarding?.(e)} 
                                                                className="p-2.5 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg dark:hover:shadow-none text-brand-600 dark:text-brand-400 rounded-xl transition-all border border-transparent hover:border-brand-100 dark:hover:border-brand-900/30 active:scale-90"
                                                                title="View Offboarding Details"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {canManageEmployees && (
                                                            <button 
                                                                onClick={() => onRejoin?.(e)} 
                                                                className="p-2.5 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg dark:hover:shadow-none text-emerald-600 dark:text-emerald-400 rounded-xl transition-all border border-transparent hover:border-emerald-100 dark:hover:border-emerald-900/30 active:scale-90"
                                                                title="Rejoin"
                                                            >
                                                                <UserPlus className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {canManageEmployees && (
                                                    <button 
                                                        onClick={() => onDelete?.(e)} 
                                                        className="p-2.5 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg dark:hover:shadow-none text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-800 active:scale-90"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
                {filteredEmployees.length === 0 && (
                    <div className="p-32 text-center">
                        <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 border border-slate-100 dark:border-slate-700 shadow-inner">
                            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">No personnel found</h3>
                        <p className="text-slate-400 dark:text-slate-500 font-medium max-w-xs mx-auto mt-2">We couldn't find any records matching your current search or filter criteria.</p>
                        <button 
                            onClick={() => { setSearchTerm(''); setCompanyFilter('All'); setDeptFilter('All'); }}
                            className="mt-6 text-sm font-black text-brand-600 dark:text-brand-400 hover:underline"
                        >
                            Reset all filters
                        </button>
                    </div>
                )}
            </div>

            {/* Rejoin Reason Modal */}
            <AnimatePresence>
                {viewRejoinReason && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setViewRejoinReason(null)}>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden border border-white dark:border-slate-800 flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-brand-100 dark:bg-brand-900/30 rounded-2xl flex items-center justify-center text-brand-600 dark:text-brand-400">
                                        <Eye className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Rejoin Details</h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Employee: {viewRejoinReason.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setViewRejoinReason(null)} className="p-3 hover:bg-white dark:hover:bg-slate-800 rounded-2xl transition-all shadow-sm">
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>
                            <div className="p-8 space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 block">Rejoining Date</label>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 font-black text-slate-900 dark:text-white">
                                        {viewRejoinReason.rejoiningDate || 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 block">Reason for Rejoining</label>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-300 leading-relaxed italic">
                                        "{viewRejoinReason.rejoiningReason}"
                                    </div>
                                </div>
                            </div>
                            <div className="p-8 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                                <button 
                                    onClick={() => setViewRejoinReason(null)}
                                    className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black hover:opacity-90 transition-all shadow-xl"
                                >
                                    Close Details
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const CompanyDocumentsModal = ({ company, onClose, onUpdate }: { company: Company, onClose: () => void, onUpdate: (c: Company) => void }) => {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white dark:border-slate-800 flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                            {company.logo ? (
                                <img src={company.logo} alt={company.name} className="max-h-full max-w-full object-contain" />
                            ) : (
                                <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{company.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 bg-brand-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">{company.code}</span>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Linked Documents</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all active:scale-90 shadow-sm">
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto">
                    <GoogleDriveManager 
                        files={company.driveFiles || []}
                        onAddFile={(file) => {
                            const updated = { ...company, driveFiles: [...(company.driveFiles || []), file] };
                            onUpdate(updated);
                        }}
                        onRemoveFile={(fileId) => {
                            const updated = { ...company, driveFiles: (company.driveFiles || []).filter(f => f.id !== fileId) };
                            onUpdate(updated);
                        }}
                        onUpdateFile={(updatedFile) => {
                            const updated = { 
                                ...company, 
                                driveFiles: (company.driveFiles || []).map(f => f.id === updatedFile.id ? updatedFile : f) 
                            };
                            onUpdate(updated);
                        }}
                    />
                </div>
            </motion.div>
        </div>
    );
};

const CompanyView = ({ companies, openConfirm, onUpdate, user }: { companies: Company[], openConfirm: any, onUpdate: (c: Company) => void, user: SystemUser }) => {
    const [formData, setFormData] = useState({ code: '', name: '', address: '', email: '', phone: '', logo: '' });
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [viewingDocsCompany, setViewingDocsCompany] = useState<Company | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const canManageSettings = user?.permissions?.canManageSettings;

    const sortedCompanies = useMemo(() => {
        return [...companies].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }, [companies]);

    const filteredCompanies = useMemo(() => {
        if (!searchTerm.trim()) return sortedCompanies;
        const query = searchTerm.toLowerCase();
        return sortedCompanies.filter(company => {
            const matchesName = company.name.toLowerCase().includes(query);
            const matchesCode = company.code?.toLowerCase().includes(query);
            const matchesDocuments = company.driveFiles?.some(file => 
                file.name.toLowerCase().includes(query)
            );
            return matchesName || matchesCode || matchesDocuments;
        });
    }, [sortedCompanies, searchTerm]);

    const getExpiryStatus = (company: Company) => {
        const files = company.driveFiles || [];
        const today = new Date();
        let expired = 0;
        let warning = 0;

        files.forEach(file => {
            if (file.expiryDate) {
                const expiry = new Date(file.expiryDate);
                const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) expired++;
                else if (diffDays <= 10) warning++;
            }
        });

        if (expired > 0) return { label: `${expired} Expired`, color: 'bg-red-100 text-red-600 border-red-200' };
        if (warning > 0) return { label: `${warning} Expiring Soon`, color: 'bg-orange-100 text-orange-600 border-orange-200' };
        return null;
    };

    const handleAdd = async () => {
        if (!formData.name.trim() || !formData.code.trim()) return;
        await addCompany(formData, companies.length);
        setFormData({ code: '', name: '', address: '', email: '', phone: '', logo: '' });
        setIsAdding(false);
    };

    const handleReorder = async (newOrder: Company[]) => {
        await reorderCompanies(newOrder);
    };

    const handleUpdate = async (company: Company) => {
        await updateCompany(company);
        setEditingId(null);
    };

    const handleDelete = async (id: string) => {
        openConfirm(
            "Delete Company",
            "Are you sure you want to delete this company? This action cannot be undone.",
            async () => {
                await deleteCompany(id);
            }
        );
    };

    const handleLogoUpload = async (company: Company | null, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const base64 = evt.target?.result as string;
            if (company) {
                await updateCompany({ ...company, logo: base64 });
            } else {
                setFormData(prev => ({ ...prev, logo: base64 }));
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="space-y-8 pb-12">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-brand-600 font-bold text-xs uppercase tracking-[0.2em]">
                        <Building2 className="w-4 h-4" />
                        Organization Management
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Company Directory</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xl">
                        Manage your business entities, office locations, and corporate identities.
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                    <div className="relative w-full sm:w-80 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
                        <input 
                            type="text"
                            placeholder="Search companies or documents..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all shadow-sm"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <X className="w-3 h-3 text-slate-400" />
                            </button>
                        )}
                    </div>

                    {canManageSettings && (
                        <button 
                            onClick={() => setIsAdding(true)}
                            className="w-full sm:w-auto bg-slate-900 text-white px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Add Company
                        </button>
                    )}
                </div>
            </div>

            {isAdding && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-brand-100 dark:border-brand-900 shadow-xl shadow-brand-900/5 dark:shadow-none space-y-6"
                >
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Register New Company</h3>
                        <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5 text-slate-400 dark:text-slate-500" /></button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Company Code</label>
                            <input 
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-500 outline-none transition-all dark:text-white dark:placeholder:text-slate-600" 
                                placeholder="e.g. A1" 
                                value={formData.code} 
                                onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))} 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Company Name</label>
                            <input 
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-500 outline-none transition-all dark:text-white dark:placeholder:text-slate-600" 
                                placeholder="Legal Entity Name" 
                                value={formData.name} 
                                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Official Email</label>
                            <input 
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-500 outline-none transition-all dark:text-white dark:placeholder:text-slate-600" 
                                placeholder="contact@company.com" 
                                value={formData.email} 
                                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Contact Number</label>
                            <input 
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-500 outline-none transition-all dark:text-white dark:placeholder:text-slate-600" 
                                placeholder="+971 50 123 4567" 
                                value={formData.phone} 
                                onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Office Address</label>
                            <input 
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-500 outline-none transition-all dark:text-white dark:placeholder:text-slate-600" 
                                placeholder="Full Physical Address" 
                                value={formData.address} 
                                onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))} 
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    onChange={e => handleLogoUpload(null, e)}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                />
                                <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-all">
                                    <Globe className="w-4 h-4" /> Upload Logo
                                </div>
                            </div>
                            {formData.logo && (
                                <div className="h-10 w-10 rounded-xl border border-slate-100 dark:border-slate-800 p-1 bg-white dark:bg-slate-900 shadow-sm">
                                    <img src={formData.logo} alt="Preview" className="h-full w-full object-contain" />
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsAdding(false)} className="px-6 py-2.5 text-slate-500 dark:text-slate-400 font-bold text-sm hover:text-slate-700 dark:hover:text-white">Cancel</button>
                            <button onClick={handleAdd} className="px-8 py-2.5 bg-brand-600 text-white rounded-xl font-black text-sm shadow-lg shadow-brand-600/20 hover:bg-brand-700 transition-all active:scale-95">Create Company</button>
                        </div>
                    </div>
                </motion.div>
            )}

            <Reorder.Group 
                axis="y" 
                values={sortedCompanies} 
                onReorder={handleReorder}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
                {filteredCompanies.map((company) => (
                    <Reorder.Item 
                        value={company}
                        key={company.id}
                        dragListener={!searchTerm && canManageSettings}
                        className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-xl hover:shadow-slate-200/20 dark:hover:shadow-black/50 transition-all group relative overflow-hidden cursor-default"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 dark:bg-slate-800 rounded-full -mr-16 -mt-16 transition-all group-hover:bg-brand-50/50 dark:group-hover:bg-brand-900/20"></div>
                        
                        <div className="relative z-10 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    {!searchTerm && canManageSettings && (
                                        <div className="cursor-grab active:cursor-grabbing p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-300 dark:text-slate-600 hover:text-slate-500 transition-colors">
                                            <GripVertical className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div className="h-16 w-16 bg-slate-50 dark:bg-slate-800 rounded-2xl p-2 border border-slate-100 dark:border-slate-700 shadow-inner flex items-center justify-center overflow-hidden">
                                        {company.logo ? (
                                            <img src={company.logo} alt={company.name} className="max-h-full max-w-full object-contain" />
                                        ) : (
                                            <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                    {canManageSettings && (
                                        <>
                                            <button 
                                                onClick={() => setEditingId(company.id)}
                                                className="p-2 hover:bg-brand-50 dark:hover:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(company.id)}
                                                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {editingId === company.id ? (
                                <div className="space-y-4 animate-in fade-in duration-200">
                                    <input 
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                                        placeholder="Company Code"
                                        value={company.code || ''}
                                        onChange={e => updateCompany({ ...company, code: e.target.value })}
                                    />
                                    <input 
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                                        value={company.name || ''}
                                        onChange={e => updateCompany({ ...company, name: e.target.value })}
                                    />
                                    <input 
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                                        value={company.email || ''}
                                        onChange={e => updateCompany({ ...company, email: e.target.value })}
                                    />
                                    <input 
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                                        placeholder="Contact Number"
                                        value={company.phone || ''}
                                        onChange={e => updateCompany({ ...company, phone: e.target.value })}
                                    />
                                    <div className="flex gap-2 pt-2">
                                        <button onClick={() => setEditingId(null)} className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-bold">Cancel</button>
                                        <button onClick={() => handleUpdate(company)} className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-xs font-bold shadow-md shadow-brand-600/20">Save</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black bg-brand-600 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">{company.code}</span>
                                        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight truncate">{company.name}</h3>
                                        {getExpiryStatus(company) && (
                                            <span className={cn("ml-auto text-[8px] font-black uppercase px-2 py-0.5 rounded-full border", getExpiryStatus(company)?.color)}>
                                                {getExpiryStatus(company)?.label}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-3 mt-auto">
                                        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                                            <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                                <FileText className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="text-xs font-bold truncate">{company.email || 'No email provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                                            <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                                <Phone className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="text-xs font-bold truncate">{company.phone || 'No contact provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                                            <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                                <Building2 className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="text-xs font-bold line-clamp-1">{company.address || 'No address provided'}</span>
                                        </div>
                                    </div>
                                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {(company.driveFiles || []).slice(0, 3).map(file => (
                                                    <div key={file.id} className="w-8 h-8 rounded-lg border-2 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shadow-sm">
                                                        {file.iconLink ? (
                                                            <img src={file.iconLink} alt="" className="w-4 h-4" />
                                                        ) : (
                                                            <FileText className="w-4 h-4 text-slate-400" />
                                                        )}
                                                    </div>
                                                ))}
                                                {(company.driveFiles || []).length > 3 && (
                                                    <div className="w-8 h-8 rounded-lg border-2 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-sm">
                                                        <span className="text-[10px] font-bold text-slate-500">+{(company.driveFiles || []).length - 3}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                                                {(company.driveFiles || []).length} Documents
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => setViewingDocsCompany(company)}
                                            className="px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-brand-50 dark:hover:bg-brand-900/30 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-slate-100 dark:border-slate-700 flex items-center gap-2"
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            View All
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </Reorder.Item>
                ))}
                {filteredCompanies.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-700">
                        <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                            {searchTerm ? 'No matching companies found' : 'No companies registered'}
                        </h3>
                        <p className="text-slate-400 dark:text-slate-500 font-medium mt-1">
                            {searchTerm ? 'Try adjusting your search terms.' : 'Start by adding your first business entity.'}
                        </p>
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="mt-4 text-sm font-black text-brand-600 dark:text-brand-400 hover:underline"
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                )}
            </Reorder.Group>

            {viewingDocsCompany && (
                <CompanyDocumentsModal 
                    company={viewingDocsCompany}
                    onClose={() => setViewingDocsCompany(null)}
                    onUpdate={onUpdate}
                />
            )}
        </div>
    );
};

const AttendanceEditModal = ({ employee, date, currentRecord, onUpdate, onClose }: any) => {
    const [status, setStatus] = useState<AttendanceStatus | null>(currentRecord?.status || null);
    const [otHours, setOtHours] = useState<number>(currentRecord?.overtimeHours || 0);
    const [note, setNote] = useState<string>(currentRecord?.note || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSave = async () => {
        if (!status) return;
        setIsSubmitting(true);
        try {
            await onUpdate(employee.id, date, status, otHours, note);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRemove = async () => {
        setIsSubmitting(true);
        try {
            await onUpdate(employee.id, date, null);
            onClose();
        } catch (error) {
            console.error("Error removing attendance:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white dark:border-slate-800 flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center text-2xl font-black text-brand-600 overflow-hidden">
                            {employee.profileImage ? (
                                <img src={employee.profileImage} alt={employee.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                employee.name.charAt(0)
                            )}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">{employee.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 rounded-lg text-[10px] font-black uppercase tracking-wider">{employee.code}</span>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    {new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all active:scale-90 shadow-sm">
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8">
                    <section>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">Select Status</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {Object.entries(LEGEND).map(([s, m]: any) => (
                                <button
                                    key={s}
                                    onClick={() => setStatus(s as AttendanceStatus)}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-2 p-4 rounded-[1.5rem] border-2 transition-all active:scale-95",
                                        status === s 
                                            ? "border-brand-500 bg-brand-50/50 dark:bg-brand-900/20 ring-4 ring-brand-500/10" 
                                            : "border-slate-100 dark:border-slate-800 hover:border-brand-200 dark:hover:border-brand-900/30 bg-white dark:bg-slate-900"
                                    )}
                                >
                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shadow-sm", m.color)}>
                                        {m.code}
                                    </div>
                                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <section>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Overtime Hours</label>
                            <div className="relative">
                                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input 
                                    type="number" 
                                    value={otHours}
                                    onChange={(e) => setOtHours(Number(e.target.value))}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-brand-500 rounded-2xl outline-none transition-all font-bold text-slate-900 dark:text-white"
                                    placeholder="0"
                                    min="0"
                                    max="24"
                                />
                            </div>
                        </section>

                        <section>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Note / Remarks</label>
                            <input 
                                type="text" 
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent focus:border-brand-500 rounded-2xl outline-none transition-all font-bold text-slate-900 dark:text-white"
                                placeholder="Optional note..."
                            />
                        </section>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30 flex gap-4">
                    <button 
                        onClick={handleRemove}
                        disabled={isSubmitting || !currentRecord}
                        className="px-6 py-4 bg-white dark:bg-slate-800 text-red-500 dark:text-red-400 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-black hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">Clear</span>
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={isSubmitting || !status}
                        className="flex-1 py-4 bg-brand-600 text-white rounded-2xl text-sm font-black hover:bg-brand-700 transition-all active:scale-95 shadow-xl shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5" />
                                Save Attendance Details
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const TimesheetView = ({ employees, attendance, selectedMonth, onMonthChange, user, onLogAttendance, onDeleteAttendance, companies }: any) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingCell, setEditingCell] = useState<{empId: string, date: string} | null>(null);
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const canManageAttendance = user?.permissions?.canManageAttendance;

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const fullYear = year.toString();

    const handlePrevMonth = () => {
        let prevYear = year;
        let prevMonth = month - 1;
        if (prevMonth < 1) {
            prevMonth = 12;
            prevYear--;
        }
        onMonthChange(`${prevYear}-${String(prevMonth).padStart(2, '0')}`);
    };

    const handleNextMonth = () => {
        let nextYear = year;
        let nextMonth = month + 1;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
        }
        onMonthChange(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
    };

    const handleStatusUpdate = async (employeeId: string, date: string, status: AttendanceStatus | null, otHours: number = 0, note: string = '') => {
        try {
            if (status === null) {
                await onDeleteAttendance(employeeId, date);
            } else {
                await onLogAttendance(
                    employeeId,
                    status,
                    date,
                    otHours,
                    undefined,
                    user?.username || 'System',
                    note || 'Manual Update'
                );
            }
        } catch (error) {
            console.error("Attendance update failed:", error);
        } finally {
            setEditingCell(null);
        }
    };

    const filteredEmployees = useMemo(() => {
        return employees.filter((e: Employee) => {
            const company = companies.find((c: Company) => c.name === e.company);
            return e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                   e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   company?.code.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [employees, searchTerm, companies]);

    const editingEmployee = useMemo(() => {
        if (!editingCell) return null;
        return employees.find((e: Employee) => e.id === editingCell.empId);
    }, [editingCell, employees]);

    const editingRecord = useMemo(() => {
        if (!editingCell) return null;
        return attendance.find((r: AttendanceRecord) => r.employeeId === editingCell.empId && r.date === editingCell.date);
    }, [editingCell, attendance]);

    const handleCopyAttendance = async (sourceDate: string, targetStartDate: string, targetEndDate: string) => {
        const start = new Date(targetStartDate);
        const end = new Date(targetEndDate);
        
        // Get all attendance records for the source date
        const sourceRecords = attendance.filter((r: AttendanceRecord) => r.date === sourceDate);
        
        if (sourceRecords.length === 0) {
            alert("No attendance records found for the source date.");
            return;
        }

        const datesToCopy: string[] = [];
        let current = new Date(start);
        while (current <= end) {
            datesToCopy.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        for (const targetDate of datesToCopy) {
            for (const record of sourceRecords) {
                await logAttendance(
                    record.employeeId,
                    record.status,
                    targetDate,
                    record.overtimeHours || 0,
                    undefined,
                    user?.username || 'System',
                    `Copied from ${sourceDate}`
                );
            }
        }
        setIsCopyModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <CopyAttendanceModal 
                isOpen={isCopyModalOpen}
                onClose={() => setIsCopyModalOpen(false)}
                onCopy={handleCopyAttendance}
                currentMonth={selectedMonth}
            />
            <div className="glass-card dark:bg-slate-900/80 p-6 rounded-3xl border border-white dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <button 
                            onClick={handlePrevMonth} 
                            className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl text-slate-600 dark:text-slate-400 transition-all active:scale-95"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="px-4 text-center min-w-[140px] flex flex-col items-center">
                            <div className="text-sm font-bold text-slate-900 dark:text-white">{monthName}</div>
                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                {fullYear}
                                <img src="https://flagcdn.com/w20/ae.png" alt="UAE" className="w-3 h-2 rounded-sm" referrerPolicy="no-referrer" />
                            </div>
                        </div>
                        <button 
                            onClick={handleNextMonth} 
                            className="p-2 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-xl text-slate-600 dark:text-slate-400 transition-all active:scale-95"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="hidden xl:flex flex-wrap gap-2">
                        {Object.entries(LEGEND).map(([status, meta]: any) => (
                            <div key={status} className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-bold border transition-all hover:scale-105 cursor-default",
                                meta.color.replace('text-', 'text-').replace('bg-', 'bg-'),
                                "border-slate-100 dark:border-slate-800"
                            )}>
                                {meta.code}: {meta.label}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <input 
                            type="text" 
                            placeholder="Search staff..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-11 pr-4 py-2.5 bg-slate-100/50 dark:bg-slate-800/50 border-none rounded-2xl text-sm w-full sm:w-64 outline-none focus:ring-2 focus:ring-brand-500 transition-all dark:text-white dark:placeholder:text-slate-600"
                        />
                    </div>
                    {canManageAttendance && (
                        <button 
                            onClick={() => setIsCopyModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-2xl text-sm font-black hover:bg-brand-700 transition-all active:scale-95 shadow-lg shadow-brand-600/20"
                        >
                            <Copy className="w-4 h-4" />
                            <span className="hidden sm:inline">Copy Attendance</span>
                        </button>
                    )}
                    <button className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm">
                        <Download className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="glass-card dark:bg-slate-900/80 rounded-3xl overflow-hidden border border-white dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse text-[11px]">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <th className="p-4 text-left bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm sticky left-0 z-20 border-r border-slate-100 dark:border-slate-800 min-w-[180px]">
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Employee Name</span>
                                </th>
                                <th className="p-4 font-bold text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800 uppercase tracking-widest text-[10px]">Leave</th>
                                <th className="p-4 font-bold text-brand-600 dark:text-brand-400 border-r border-slate-100 dark:border-slate-800 uppercase tracking-widest text-[10px]">OT</th>
                                {days.map(d => {
                                    const date = new Date(year, month - 1, d);
                                    const dayName = date.toLocaleString('default', { weekday: 'narrow' });
                                    const isSunday = date.getDay() === 0;
                                    return (
                                        <th key={d} className={cn(
                                            "p-2 w-10 border-r border-slate-50 dark:border-slate-800 min-w-[36px]",
                                            isSunday ? 'bg-red-50/30 dark:bg-red-900/20 text-red-500 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
                                        )}>
                                            <div className="font-bold text-sm">{d}</div>
                                            <div className="text-[9px] font-bold uppercase opacity-60">{dayName}</div>
                                        </th>
                                    );
                                })}
                                <th className="p-4 font-bold text-slate-900 dark:text-white bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm sticky right-0 z-20 border-l border-slate-100 dark:border-slate-800 uppercase tracking-widest text-[10px]">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {filteredEmployees.map((e: Employee, idx: number) => (
                                <tr key={e.id} className="hover:bg-brand-50/20 dark:hover:bg-brand-900/10 transition-colors group">
                                    <td className="p-4 text-left border-r border-slate-100 dark:border-slate-800 sticky left-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm z-10 group-hover:bg-brand-50/50 dark:group-hover:bg-brand-900/20 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 overflow-hidden">
                                                {e.profileImage ? (
                                                    <img src={e.profileImage} alt={e.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    e.name.charAt(0)
                                                )}
                                            </div>
                                            <span className="font-bold text-slate-900 dark:text-white truncate max-w-[120px]">{e.name}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 border-r border-slate-50 dark:border-slate-800 font-bold text-slate-500 dark:text-slate-400">{e.leaveBalance}</td>
                                    <td className="p-4 border-r border-slate-50 dark:border-slate-800 font-bold text-brand-600 dark:text-brand-400">
                                        {attendance.filter(r => r.employeeId === e.id && r.date.startsWith(selectedMonth)).reduce((sum, r) => sum + (r.overtimeHours || 0), 0)}
                                    </td>
                                    {days.map(d => {
                                        const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                                        const record = attendance.find((r: AttendanceRecord) => r.employeeId === e.id && r.date === dateStr);
                                        const meta = LEGEND[record?.status] || {};
                                        const isSunday = new Date(year, month - 1, d).getDay() === 0;
                                        return (
                                            <td key={d} className={cn(
                                                "border-r border-slate-50 dark:border-slate-800 p-2 font-bold transition-all relative",
                                                meta.code ? meta.color : isSunday ? 'bg-red-50/20 dark:bg-red-900/10 text-red-200 dark:text-red-900/50' : 'text-slate-200 dark:text-slate-700 group-hover:text-slate-300 dark:group-hover:text-slate-600'
                                            )}>
                                                <button 
                                                    onClick={() => setEditingCell({ empId: e.id, date: dateStr })}
                                                    className={cn(
                                                        "w-6 h-6 flex items-center justify-center rounded-lg mx-auto transition-transform hover:scale-110 active:scale-90",
                                                        meta.code && "bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700"
                                                    )}
                                                >
                                                    {meta.code || (isSunday ? 'S' : '-')}
                                                </button>
                                            </td>
                                        );
                                    })}
                                    <td className="p-4 font-bold text-slate-900 dark:text-white bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm sticky right-0 z-10 border-l border-slate-100 dark:border-slate-800 group-hover:bg-brand-50/50 dark:group-hover:bg-brand-900/20 transition-colors">
                                        <div className="flex flex-col items-center">
                                            <span className="text-brand-600 dark:text-brand-400">{attendance.filter(r => r.employeeId === e.id && r.date.startsWith(selectedMonth) && r.status === AttendanceStatus.PRESENT).length}P</span>
                                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold">DAYS</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filteredEmployees.length === 0 && (
                    <div className="p-20 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700">
                            <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">No records found</h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">Try searching for a different staff member or changing the month.</p>
                    </div>
                )}
            </div>

            {editingCell && editingEmployee && (
                <AttendanceEditModal 
                    employee={editingEmployee}
                    date={editingCell.date}
                    currentRecord={editingRecord}
                    onUpdate={handleStatusUpdate}
                    onClose={() => setEditingCell(null)}
                />
            )}
        </div>
    );
};

const DeductionsView = ({ employees, deductions, openConfirm, user, companies }: any) => {
    const [newItem, setNewItem] = useState<Partial<DeductionRecord>>({ type: 'Salary Advance', date: new Date().toISOString().split('T')[0] });
    const [searchTerm, setSearchTerm] = useState('');
    const canManagePayroll = user?.permissions?.canManagePayroll;

    const handleAdd = async () => {
        if(newItem.employeeId && newItem.amount && newItem.date) {
            await saveDeduction(newItem as any);
            setNewItem({ type: 'Salary Advance', date: new Date().toISOString().split('T')[0] });
        }
    }

    const filteredDeductions = useMemo(() => {
        return deductions.filter((d: DeductionRecord) => {
            const emp = employees.find((e: Employee) => e.id === d.employeeId);
            const company = companies.find((c: Company) => c.name === emp?.company);
            const search = searchTerm.toLowerCase();
            return (
                emp?.name.toLowerCase().includes(search) ||
                emp?.code.toLowerCase().includes(search) ||
                company?.code.toLowerCase().includes(search) ||
                d.type.toLowerCase().includes(search) ||
                (d.note && d.note.toLowerCase().includes(search))
            );
        });
    }, [deductions, employees, searchTerm, companies]);
    
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Deductions & Penalties</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage employee advances, fines, and asset damages.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-brand-500 transition-colors" />
                        <input 
                            type="text"
                            placeholder="Search deductions..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-11 pr-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all w-64 shadow-sm dark:text-white dark:placeholder:text-slate-600"
                        />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 rounded-2xl border border-brand-100 dark:border-brand-900/30">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Financial Records</span>
                    </div>
                </div>
            </div>

            <div className="glass-card dark:bg-slate-900/80 p-8 rounded-3xl border border-white dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900/30 rounded-xl flex items-center justify-center text-brand-600 dark:text-brand-400">
                        <Plus className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Record New Transaction</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-end">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Staff Member</label>
                        <select 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white" 
                            value={newItem.employeeId || ''} 
                            onChange={e => setNewItem({...newItem, employeeId: e.target.value})}
                        >
                            <option value="">Select Employee</option>
                            {employees.map((e:any)=><option key={e.id} value={e.id} className="dark:bg-slate-900">{e.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Date</label>
                        <input 
                            type="date" 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white" 
                            value={newItem.date || ''} 
                            onChange={e => setNewItem({...newItem, date: e.target.value})} 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Category</label>
                        <select 
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white" 
                            value={newItem.type} 
                            onChange={e => setNewItem({...newItem, type: e.target.value as any})}
                        >
                            <option className="dark:bg-slate-900">Salary Advance</option>
                            <option className="dark:bg-slate-900">Fine Amount</option>
                            <option className="dark:bg-slate-900">Damage Material/Asset</option>
                            <option className="dark:bg-slate-900">Loan Amount</option>
                            <option className="dark:bg-slate-900">Other</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Amount (AED)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-xs font-bold">AED</span>
                            <input 
                                type="number" 
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all font-bold text-slate-900 dark:text-white" 
                                placeholder="0.00" 
                                value={newItem.amount || ''} 
                                onChange={e => setNewItem({...newItem, amount: Number(e.target.value)})} 
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Notes</label>
                        <div className="flex gap-2">
                            <input 
                                className="flex-1 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white dark:placeholder:text-slate-600" 
                                placeholder="Reason..." 
                                value={newItem.note || ''} 
                                onChange={e => setNewItem({...newItem, note: e.target.value})} 
                            />
                            <button 
                                onClick={handleAdd}
                                disabled={!newItem.employeeId || !newItem.amount}
                                className="p-3 bg-brand-600 text-white rounded-2xl hover:bg-brand-700 transition-all active:scale-95 shadow-lg shadow-brand-200 dark:shadow-none disabled:opacity-50 disabled:scale-100"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-card dark:bg-slate-900/80 rounded-3xl overflow-hidden border border-white dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Employee</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Type</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Amount</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Note</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            <AnimatePresence mode="popLayout">
                                {filteredDeductions.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((d: DeductionRecord) => {
                                    const emp = employees.find((e:any) => e.id === d.employeeId);
                                    return (
                                        <motion.tr 
                                            key={d.id}
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group"
                                        >
                                            <td className="p-5">
                                                <div className="text-sm font-bold text-slate-900 dark:text-white">{new Date(d.date).toLocaleDateString()}</div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-brand-50 dark:bg-brand-900/20 rounded-lg flex items-center justify-center text-[10px] font-bold text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-900/30 overflow-hidden">
                                                {emp?.profileImage ? (
                                                    <img src={emp.profileImage} alt={emp.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    emp?.name?.charAt(0) || '?'
                                                )}
                                            </div>
                                                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{emp?.name || 'Unknown'}</div>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <span className={cn(
                                                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                                    d.type === 'Fine Amount' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' :
                                                    d.type === 'Salary Advance' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30' :
                                                    d.type === 'Loan Amount' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' :
                                                    'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700'
                                                )}>
                                                    {d.type}
                                                </span>
                                            </td>
                                            <td className="p-5">
                                                <div className="text-sm font-bold text-red-600 dark:text-red-400">AED {d.amount.toFixed(2)}</div>
                                            </td>
                                            <td className="p-5">
                                                <div className="text-sm text-slate-500 dark:text-slate-400 italic max-w-xs truncate">{d.note || '-'}</div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex justify-end">
                                                    <button 
                                                        onClick={() => openConfirm("Delete Deduction", "Are you sure you want to remove this record?", async () => {
                                                            await deleteDeduction(d.id!);
                                                        })}
                                                        className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
                {deductions.length === 0 && (
                    <div className="p-20 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700">
                            <CreditCard className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">No transactions yet</h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">Add deductions or penalties to see them listed here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const LeaveManagementView = ({ employees, leaveRequests, user, companies }: any) => {
    const [showNew, setShowNew] = useState(false);
    const [newReq, setNewReq] = useState({ employeeId: '', type: AttendanceStatus.ANNUAL_LEAVE, startDate: '', endDate: '', reason: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const canManageLeaves = user?.permissions?.canManageLeaves;

    const handleSave = async () => {
        if(newReq.employeeId && newReq.startDate && newReq.endDate) {
            await saveLeaveRequest(newReq as any, user.name);
            setShowNew(false);
        }
    };

    const handleStatus = async (id: string, status: LeaveStatus) => {
        await updateLeaveRequestStatus(id, status, user.name);
    };

    const filteredRequests = useMemo(() => {
        return leaveRequests.filter((r: LeaveRequest) => {
            const emp = employees.find((e: Employee) => e.id === r.employeeId);
            const company = companies.find((c: Company) => c.name === emp?.company);
            const search = searchTerm.toLowerCase();
            return (
                emp?.name.toLowerCase().includes(search) ||
                emp?.code.toLowerCase().includes(search) ||
                company?.code.toLowerCase().includes(search) ||
                r.type.toLowerCase().includes(search) ||
                r.reason?.toLowerCase().includes(search)
            );
        });
    }, [leaveRequests, employees, searchTerm, companies]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Leave Management</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Review and approve employee time-off requests.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-brand-500 transition-colors" />
                        <input 
                            type="text"
                            placeholder="Search requests..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-11 pr-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all w-64 shadow-sm dark:text-white dark:placeholder:text-slate-600"
                        />
                    </div>
                    {canManageLeaves && (
                        <button 
                            onClick={() => setShowNew(true)} 
                            className="neo-button bg-brand-600 text-white px-6 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-brand-200 dark:shadow-none"
                        >
                            <Plus className="w-5 h-5" /> New Request
                        </button>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {showNew && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="glass-card dark:bg-slate-900/80 p-8 rounded-3xl border-2 border-brand-100 dark:border-brand-900/30 shadow-xl mb-8">
                            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                                Create New Leave Request
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Employee</label>
                                    <select 
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white" 
                                        value={newReq.employeeId} 
                                        onChange={e=>setNewReq({...newReq, employeeId:e.target.value})}
                                    >
                                        <option value="">Select Staff Member</option>
                                        {employees.map((e:any)=><option key={e.id} value={e.id} className="dark:bg-slate-900">{e.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Leave Type</label>
                                    <select 
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white" 
                                        value={newReq.type} 
                                        onChange={e=>setNewReq({...newReq, type:e.target.value as any})}
                                    >
                                        <option value={AttendanceStatus.ANNUAL_LEAVE} className="dark:bg-slate-900">Annual Leave</option>
                                        <option value={AttendanceStatus.SICK_LEAVE} className="dark:bg-slate-900">Sick Leave</option>
                                        <option value={AttendanceStatus.EMERGENCY_LEAVE} className="dark:bg-slate-900">Emergency Leave</option>
                                        <option value={AttendanceStatus.UNPAID_LEAVE} className="dark:bg-slate-900">Unpaid Leave</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Start Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white" 
                                        value={newReq.startDate} 
                                        onChange={e=>setNewReq({...newReq, startDate:e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">End Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all dark:text-white" 
                                        value={newReq.endDate} 
                                        onChange={e=>setNewReq({...newReq, endDate:e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-2 lg:col-span-4">
                                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Reason / Description</label>
                                    <textarea 
                                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-slate-700 transition-all min-h-[100px] dark:text-white dark:placeholder:text-slate-600" 
                                        placeholder="Briefly explain the reason for leave..." 
                                        value={newReq.reason} 
                                        onChange={e=>setNewReq({...newReq, reason:e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button 
                                    onClick={() => setShowNew(false)} 
                                    className="px-6 py-2.5 text-slate-500 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSave} 
                                    className="neo-button bg-brand-600 text-white px-8 py-2.5 rounded-2xl font-bold shadow-lg shadow-brand-200 dark:shadow-none"
                                >
                                    Submit Request
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="glass-card dark:bg-slate-900/80 rounded-3xl overflow-hidden border border-white dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Employee</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Type</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Period</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            <AnimatePresence mode="popLayout">
                                {filteredRequests.sort((a:any, b:any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((req: LeaveRequest) => {
                                    const emp = employees.find((e:any) => e.id === req.employeeId);
                                    return (
                                        <motion.tr 
                                            key={req.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group"
                                        >
                                            <td className="p-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-[12px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 overflow-hidden">
                                                        {emp?.profileImage ? (
                                                            <img src={emp.profileImage} alt={emp.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            emp?.name?.charAt(0) || '?'
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white">{emp?.name || 'Unknown'}</div>
                                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">{emp?.role || '-'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{req.type}</div>
                                                <div className="text-[10px] text-slate-400 dark:text-slate-500 italic truncate max-w-[150px]">{req.reason || 'No reason provided'}</div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400">
                                                    <span>{new Date(req.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                                    <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                                                    <span>{new Date(req.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                                    {Math.ceil((new Date(req.endDate).getTime() - new Date(req.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} Days
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <span className={cn(
                                                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                                                    req.status === LeaveStatus.APPROVED ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' :
                                                    req.status === LeaveStatus.REJECTED ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' :
                                                    'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-900/30'
                                                )}>
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex justify-end gap-2">
                                                    {req.status === LeaveStatus.PENDING && (
                                                        <>
                                                            <button 
                                                                onClick={() => handleStatus(req.id!, LeaveStatus.APPROVED)}
                                                                className="p-2 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all"
                                                                title="Approve"
                                                            >
                                                                <Check className="w-5 h-5" />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleStatus(req.id!, LeaveStatus.REJECTED)}
                                                                className="p-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                                                                title="Reject"
                                                            >
                                                                <X className="w-5 h-5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button 
                                                        className="p-2 text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                                                        title="View Details"
                                                    >
                                                        <Eye className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
                {leaveRequests.length === 0 && (
                    <div className="p-20 text-center">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-700">
                            <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">No leave requests</h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">All caught up! No pending leave requests to review.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const PayrollRegisterView = ({ employees, attendance, deductions, selectedMonth, onMonthChange, user, companies }: any) => {
     const [searchTerm, setSearchTerm] = useState('');
     const canManagePayroll = user?.permissions?.canManagePayroll;

     const filteredEmployees = useMemo(() => {
        return employees.filter((e: Employee) => {
            const company = companies.find((c: Company) => c.name === e.company);
            return e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                   e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   company?.code.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [employees, searchTerm, companies]);

     // Real export functionality
     const handleExport = () => {
        const data = filteredEmployees.map((e: Employee) => {
            const monthRecs = attendance.filter((r: any) => r.employeeId === e.id && r.date.startsWith(selectedMonth));
            const monthDeds = deductions.filter((d: any) => d.employeeId === e.id && d.date.startsWith(selectedMonth));
            const p = calculatePayroll(e, monthRecs, monthDeds);
            
            return {
                'Employee Code': e.code,
                'Employee Name': e.name,
                'Month': selectedMonth,
                'Basic Salary': p.breakdown.basic,
                'Housing': p.breakdown.housing,
                'Transport': p.breakdown.transport,
                'Other Allowance': p.breakdown.other,
                'Gross Salary': p.grossSalary,
                'Unpaid Days': p.totalUnpaidDays,
                'Deductions': p.totalDeductions,
                'OT Amount': p.otAmount,
                'Net Salary': p.netSalary
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Payroll Register");
        XLSX.writeFile(wb, `Payroll_Register_${selectedMonth}.xlsx`);
     };

     return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Payroll Register</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Monthly salary breakdown and net pay calculations.</p>
                 </div>
                 <div className="flex items-center gap-3">
                     <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-brand-500 transition-colors" />
                        <input 
                            type="text"
                            placeholder="Search staff..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-11 pr-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all w-64 shadow-sm dark:text-white dark:placeholder:text-slate-600"
                        />
                    </div>
                     <div className="relative group">
                         <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-brand-600 transition-colors" />
                         <input 
                            type="month" 
                            value={selectedMonth} 
                            onChange={e=>onMonthChange(e.target.value)} 
                            className="pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all shadow-sm" 
                         />
                     </div>
                     <button 
                        onClick={handleExport} 
                        className="neo-button bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-6 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                     >
                         <Download className="w-4 h-4" /> Export
                     </button>
                 </div>
             </div>
             
             <div className="glass-card dark:bg-slate-900/80 rounded-3xl border border-white dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden">
                 <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                         <thead>
                             <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                 <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest sticky left-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">Employee</th>
                                 <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Basic</th>
                                 <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Housing</th>
                                 <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Transport</th>
                                 <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Other</th>
                                 <th className="p-5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Gross</th>
                                 <th className="p-5 text-[10px] font-bold text-red-400 dark:text-red-500 uppercase tracking-widest text-right">Unpaid</th>
                                 <th className="p-5 text-[10px] font-bold text-red-400 dark:text-red-500 uppercase tracking-widest text-right">Deductions</th>
                                 <th className="p-5 text-[10px] font-bold text-emerald-400 dark:text-emerald-500 uppercase tracking-widest text-right">OT Pay</th>
                                 <th className="p-5 text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-widest text-right">Net Salary</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                             {filteredEmployees.map((e:Employee) => {
                                 const monthRecs = attendance.filter((r:any) => r.employeeId === e.id && r.date.startsWith(selectedMonth));
                                 const monthDeds = deductions.filter((d:any) => d.employeeId === e.id && d.date.startsWith(selectedMonth));
                                 const p = calculatePayroll(e, monthRecs, monthDeds);
                                 
                                 return (
                                     <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                         <td className="p-5 sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50/50 dark:group-hover:bg-slate-800/50 transition-colors z-10 border-r border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-brand-50 dark:bg-brand-900/20 rounded-lg flex items-center justify-center text-[10px] font-bold text-brand-600 dark:text-brand-400 overflow-hidden">
                                                    {e.profileImage ? (
                                                        <img src={e.profileImage} alt={e.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        e.name.charAt(0)
                                                    )}
                                                </div>
                                                <div className="text-sm font-bold text-slate-900 dark:text-white">{e.name}</div>
                                            </div>
                                         </td>
                                         <td className="p-5 text-right text-sm text-slate-500 dark:text-slate-400">{p.breakdown.basic.toLocaleString()}</td>
                                         <td className="p-5 text-right text-sm text-slate-500 dark:text-slate-400">{p.breakdown.housing.toLocaleString()}</td>
                                         <td className="p-5 text-right text-sm text-slate-500 dark:text-slate-400">{p.breakdown.transport.toLocaleString()}</td>
                                         <td className="p-5 text-right text-sm text-slate-500 dark:text-slate-400">{p.breakdown.other.toLocaleString()}</td>
                                         <td className="p-5 text-right text-sm font-bold text-slate-900 dark:text-white">{p.grossSalary.toLocaleString()}</td>
                                         <td className="p-5 text-right text-sm font-bold text-red-500 dark:text-red-400">{p.totalUnpaidDays}</td>
                                         <td className="p-5 text-right text-sm font-bold text-red-600 dark:text-red-400">-{p.totalDeductions.toFixed(0)}</td>
                                         <td className="p-5 text-right text-sm font-bold text-emerald-600 dark:text-emerald-400">+{p.otAmount.toFixed(0)}</td>
                                         <td className="p-5 text-right">
                                            <div className="inline-block px-4 py-1.5 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 rounded-xl text-sm font-black border border-brand-100 dark:border-brand-900/30">
                                                {p.netSalary.toFixed(0)}
                                            </div>
                                         </td>
                                     </tr>
                                 )
                             })}
                         </tbody>
                     </table>
                 </div>
             </div>
        </div>
     );
};

const ReportsView = ({ employees, attendance, isDarkMode }: any) => {
    const activeStaff = useMemo(() => employees.filter((e: any) => e.active), [employees]);
    
    const totalStaff = activeStaff.length;
    const totalSpent = activeStaff.reduce((acc: number, e: Employee) => acc + (e.salary.basic + e.salary.housing + e.salary.transport + e.salary.other), 0);
    
    const lateDays = useMemo(() => {
        return attendance.filter((r: AttendanceRecord) => 
            r.status === 'P' && 
            r.checkInTime && 
            new Date(r.checkInTime).getHours() >= 9
        ).length;
    }, [attendance]);

    const companyData = useMemo(() => {
        const counts: Record<string, number> = {};
        activeStaff.forEach((e: any) => {
            counts[e.company] = (counts[e.company] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [activeStaff]);

    const teamData = useMemo(() => {
        const counts: Record<string, number> = {};
        activeStaff.forEach((e: any) => {
            counts[e.team] = (counts[e.team] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [activeStaff]);

    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
    
    const handleExport = () => {
        const data = activeStaff.map((e: any) => ({
            'Code': e.code,
            'Name': e.name,
            'Company': e.company,
            'Department': e.department,
            'Team': e.team,
            'Designation': e.designation,
            'Basic': e.salary.basic,
            'Housing': e.salary.housing,
            'Transport': e.salary.transport,
            'Other': e.salary.other,
            'Gross': e.salary.basic + e.salary.housing + e.salary.transport + e.salary.other,
            'Joining Date': e.joiningDate
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Staff Report");
        XLSX.writeFile(wb, "AlReem_Staff_Analytics_Report.xlsx");
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-8 pb-12">
            <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Analytics & Reports</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Real-time workforce intelligence and distribution.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleExport}
                        className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" /> Export Data
                    </button>
                    <button 
                        onClick={handlePrint}
                        className="px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-bold hover:bg-brand-600 transition-all shadow-lg shadow-brand-500/20 flex items-center gap-2"
                    >
                        <Printer className="w-4 h-4" /> Print Report
                    </button>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Active Staff', value: totalStaff, icon: Users, color: 'brand', delay: 0.1 },
                    { label: 'Monthly Payroll', value: `AED ${totalSpent.toLocaleString()}`, icon: DirhamIcon, color: 'emerald', delay: 0.2 },
                    { label: 'Late Arrivals', value: lateDays, icon: AlertCircle, color: 'orange', delay: 0.3 },
                    { label: 'Total Teams', value: teamData.length, icon: Briefcase, color: 'violet', delay: 0.4 },
                ].map((stat, i) => (
                    <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: stat.delay }}
                        className="glass-card dark:bg-slate-900/80 p-6 rounded-3xl border border-white dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none group hover:scale-[1.02] transition-all"
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:rotate-12",
                                stat.color === 'brand' ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' :
                                stat.color === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                                stat.color === 'orange' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' :
                                'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
                            )}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{stat.label}</div>
                                <div className="text-xl font-black text-slate-900 dark:text-white">{stat.value}</div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="lg:col-span-2 glass-card dark:bg-slate-900/80 p-8 rounded-3xl border border-white dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Staff Distribution by Company</h3>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-brand-500 rounded-full"></div>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Active Employees</span>
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={companyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#1e293b" : "#f1f5f9"} />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: isDarkMode ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 600 }}
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: isDarkMode ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 600 }}
                                />
                                <Tooltip 
                                    cursor={{ fill: isDarkMode ? '#1e293b' : '#f8fafc' }}
                                    contentStyle={{ 
                                        borderRadius: '16px', 
                                        border: 'none', 
                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                                        backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                                        color: isDarkMode ? '#ffffff' : '#000000'
                                    }}
                                />
                                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                                    {companyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                    className="glass-card dark:bg-slate-900/80 p-8 rounded-3xl border border-white dark:border-slate-800 shadow-xl shadow-slate-200/40 dark:shadow-none"
                >
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-8">Team Composition</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={teamData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={8}
                                    dataKey="value"
                                >
                                    {teamData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ 
                                        borderRadius: '16px', 
                                        border: 'none', 
                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                                        backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
                                        color: isDarkMode ? '#ffffff' : '#000000'
                                    }}
                                />
                                <Legend 
                                    verticalAlign="bottom" 
                                    iconType="circle"
                                    formatter={(value) => <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            </div>

        </div>
    );
};
