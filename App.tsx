
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Calendar, UserPlus, LogOut, ArrowRight,
  Building2, CheckCircle, XCircle, Trash2, 
  AlertCircle, Eye, Edit, CheckSquare, 
  Copy, FileText, DollarSign,
  BarChart3, UserMinus, Wallet, Plane, X, Save, Plus,
  Settings, Search, Bell, LogOut as SignOut, UserCog,
  Briefcase, HardHat, ShieldCheck, Download, Printer,
  MoreVertical, Check, X as CloseIcon, Filter, Shield, Key
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  doc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { auth, db, loginWithGoogle, loginWithEmail, registerWithEmail, logout, adminCreateUser, adminDeleteUser } from './firebase';
import { Login } from './components/Login';
import { 
  Employee, AttendanceRecord, AttendanceStatus, StaffType, 
  LeaveRequest, LeaveStatus, OffboardingDetails, 
  SystemUser, DeductionRecord, UserRole, SalaryStructure, Company
} from './types';
import { 
  saveEmployee, deleteEmployee, offboardEmployee, rehireEmployee,
  logAttendance, deleteAttendanceRecord,
  saveLeaveRequest, updateLeaveRequestStatus,
  saveDeduction, deleteDeduction,
  saveSystemUser, deleteSystemUser,
  addCompany, updateCompany, deleteCompany,
  testConnection
} from './services/storageService';
import { DEFAULT_ABOUT_DATA, CREATOR_USER } from './constants';
import SmartCommand from './components/SmartCommand';

// --- Constants & Helpers ---
const LEGEND: any = {
    [AttendanceStatus.PRESENT]: { label: 'Present', color: 'bg-green-100 text-green-800', code: 'P' },
    [AttendanceStatus.ABSENT]: { label: 'Absent', color: 'bg-red-100 text-red-800', code: 'A' },
    [AttendanceStatus.WEEK_OFF]: { label: 'Week Off', color: 'bg-gray-200 text-gray-800', code: 'W' },
    [AttendanceStatus.PUBLIC_HOLIDAY]: { label: 'Public Holiday', color: 'bg-purple-100 text-purple-800', code: 'PH' },
    [AttendanceStatus.SICK_LEAVE]: { label: 'Sick Leave', color: 'bg-orange-100 text-orange-800', code: 'SL' },
    [AttendanceStatus.ANNUAL_LEAVE]: { label: 'Annual Leave', color: 'bg-blue-100 text-blue-800', code: 'AL' },
    [AttendanceStatus.UNPAID_LEAVE]: { label: 'Unpaid Leave', color: 'bg-red-50 text-red-600', code: 'UL' },
    [AttendanceStatus.EMERGENCY_LEAVE]: { label: 'Emergency Leave', color: 'bg-pink-100 text-pink-800', code: 'EL' },
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-3 rounded-full ${type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
        </div>
        <p className="text-gray-600 mb-8">{message}</p>
        <div className="flex justify-end gap-3">
          <button 
            disabled={isSubmitting}
            onClick={onClose} 
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button 
            disabled={isSubmitting}
            onClick={handleConfirm} 
            className={`px-4 py-2 text-white rounded-lg font-medium flex items-center gap-2 ${type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'} disabled:opacity-50`}
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

const OffboardingWizard = ({ employee, onComplete, onCancel }: { employee: Employee, onComplete: (data: OffboardingDetails) => void, onCancel: () => void }) => {
    const [step, setStep] = useState(1);
    const [details, setDetails] = useState<OffboardingDetails>({
        type: 'Resignation', exitDate: new Date().toISOString().split('T')[0], reason: '',
        gratuity: 0, leaveEncashment: 0, salaryDues: 0, otherDues: 0, deductions: 0,
        netSettlement: 0, assetsReturned: false, notes: ''
    });

    const calculateSettlement = () => {
         const net = (details.gratuity + details.leaveEncashment + details.salaryDues + details.otherDues) - details.deductions;
         setDetails(prev => ({ ...prev, netSettlement: net }));
    };

    useEffect(() => { calculateSettlement(); }, [details.gratuity, details.leaveEncashment, details.salaryDues, details.otherDues, details.deductions]);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Offboard: {employee.name}</h2>
                         <div className="flex gap-2 mt-2">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className={`h-1.5 w-8 rounded-full transition-colors ${i <= step ? 'bg-red-600' : 'bg-gray-200'}`} />
                            ))}
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-8 overflow-y-auto flex-1">
                    {step === 1 && (
                         <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                             <h3 className="text-lg font-semibold text-gray-800">Exit Details</h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                 <div className="space-y-2">
                                     <label className="text-sm font-medium text-gray-700">Exit Type</label>
                                     <select className="w-full p-3 border rounded-xl" value={details.type} onChange={e => setDetails({...details, type: e.target.value as any})}>
                                         <option>Resignation</option><option>Termination</option><option>End of Contract</option><option>Absconding</option>
                                     </select>
                                 </div>
                                 <div className="space-y-2">
                                     <label className="text-sm font-medium text-gray-700">Last Working Day</label>
                                     <input type="date" className="w-full p-3 border rounded-xl" value={details.exitDate} onChange={e => setDetails({...details, exitDate: e.target.value})} />
                                 </div>
                                 <div className="col-span-2 space-y-2">
                                     <label className="text-sm font-medium text-gray-700">Reason</label>
                                     <textarea className="w-full p-3 border rounded-xl" rows={3} value={details.reason} onChange={e => setDetails({...details, reason: e.target.value})} />
                                 </div>
                             </div>
                         </div>
                    )}
                    {step === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                             <h3 className="text-lg font-semibold text-gray-800">Financial Settlement</h3>
                             <div className="grid grid-cols-2 gap-5">
                                 <div className="space-y-2"><label className="text-sm">Gratuity</label><input type="number" className="w-full p-3 border rounded-xl" value={details.gratuity} onChange={e => setDetails({...details, gratuity: parseFloat(e.target.value)})} /></div>
                                 <div className="space-y-2"><label className="text-sm">Leave Encashment</label><input type="number" className="w-full p-3 border rounded-xl" value={details.leaveEncashment} onChange={e => setDetails({...details, leaveEncashment: parseFloat(e.target.value)})} /></div>
                                 <div className="space-y-2"><label className="text-sm">Pending Salary</label><input type="number" className="w-full p-3 border rounded-xl" value={details.salaryDues} onChange={e => setDetails({...details, salaryDues: parseFloat(e.target.value)})} /></div>
                                 <div className="space-y-2"><label className="text-sm">Deductions</label><input type="number" className="w-full p-3 border rounded-xl text-red-600" value={details.deductions} onChange={e => setDetails({...details, deductions: parseFloat(e.target.value)})} /></div>
                             </div>
                             <div className="p-4 bg-gray-50 rounded-xl flex justify-between items-center">
                                 <span className="font-semibold text-gray-700">Net Payable Amount</span>
                                 <span className="text-2xl font-bold text-green-700">AED {details.netSettlement.toLocaleString()}</span>
                             </div>
                        </div>
                    )}
                    {step === 3 && (
                         <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                             <h3 className="text-lg font-semibold text-gray-800">Assets & Clearance</h3>
                             <div className="flex items-center gap-4 p-4 border rounded-xl cursor-pointer hover:bg-gray-50" onClick={() => setDetails({...details, assetsReturned: !details.assetsReturned})}>
                                 <div className={`w-6 h-6 rounded border flex items-center justify-center ${details.assetsReturned ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                                     {details.assetsReturned && <Check className="w-4 h-4 text-white" />}
                                 </div>
                                 <span>All company assets returned (Laptop, Sim, Uniform, Tools)</span>
                             </div>
                             <div className="space-y-2">
                                 <label className="text-sm font-medium text-gray-700">Additional Notes</label>
                                 <textarea className="w-full p-3 border rounded-xl" rows={4} value={details.notes} onChange={e => setDetails({...details, notes: e.target.value})} placeholder="Clearance details..." />
                             </div>
                         </div>
                    )}
                    {step === 4 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300 text-center py-8">
                             <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                 <LogOut className="w-10 h-10" />
                             </div>
                             <h3 className="text-2xl font-bold text-gray-900">Ready to Offboard?</h3>
                             <p className="text-gray-500 max-w-md mx-auto">
                                 You are about to mark <strong>{employee.name}</strong> as inactive. 
                                 Final settlement amount: <strong>AED {details.netSettlement.toLocaleString()}</strong>.
                             </p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-between bg-gray-50">
                    {step > 1 ? <button onClick={() => setStep(s => s - 1)} className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl">Back</button> : <div></div>}
                    {step < 4 ? (
                        <button onClick={() => setStep(s => s + 1)} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-lg shadow-red-200">Next Step</button>
                    ) : (
                        <button onClick={() => onComplete(details)} className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-lg shadow-red-200 flex items-center gap-2">
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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-900">Edit Employee</h2>
                    <button onClick={onCancel}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Basic Info */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase mb-3">Personal Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Code</label><input disabled type="text" value={data.code} className="w-full p-2 border rounded-lg mt-1 bg-gray-100 text-gray-500" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Name</label><input type="text" value={data.name} onChange={e => setData({...data, name: e.target.value})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Designation</label><input type="text" value={data.designation} onChange={e => setData({...data, designation: e.target.value})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Department</label><input type="text" value={data.department} onChange={e => setData({...data, department: e.target.value})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div className="col-span-2"><label className="text-xs font-semibold text-gray-500 uppercase">Company</label>
                                 <select value={data.company} onChange={e => setData({...data, company: e.target.value})} className="w-full p-2 border rounded-lg mt-1">
                                     <option value="">Select Company</option>
                                     {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                 </select>
                             </div>
                        </div>
                    </div>

                    {/* Salary Info */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase mb-3">Salary Structure (AED)</h3>
                        <div className="grid grid-cols-3 gap-4">
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Basic</label><input type="number" value={data.salary.basic} onChange={e => setData({...data, salary: {...data.salary, basic: Number(e.target.value)}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Housing</label><input type="number" value={data.salary.housing} onChange={e => setData({...data, salary: {...data.salary, housing: Number(e.target.value)}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Transport</label><input type="number" value={data.salary.transport} onChange={e => setData({...data, salary: {...data.salary, transport: Number(e.target.value)}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Other</label><input type="number" value={data.salary.other} onChange={e => setData({...data, salary: {...data.salary, other: Number(e.target.value)}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Air Ticket</label><input type="number" value={data.salary.airTicket} onChange={e => setData({...data, salary: {...data.salary, airTicket: Number(e.target.value)}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Leave Salary</label><input type="number" value={data.salary.leaveSalary} onChange={e => setData({...data, salary: {...data.salary, leaveSalary: Number(e.target.value)}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                        </div>
                    </div>

                    {/* Banking */}
                     <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase mb-3">Banking Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Bank Name</label><input type="text" value={data.bankName || ''} onChange={e => setData({...data, bankName: e.target.value})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">IBAN / Account</label><input type="text" value={data.iban || ''} onChange={e => setData({...data, iban: e.target.value})} className="w-full p-2 border rounded-lg mt-1" /></div>
                        </div>
                    </div>

                    {/* Documents */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase mb-3">Documents & Identification</h3>
                        <div className="grid grid-cols-2 gap-4">
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Emirates ID</label><input type="text" value={data.documents?.emiratesId || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), emiratesId: e.target.value}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">EID Expiry</label><input type="date" value={data.documents?.emiratesIdExpiry || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), emiratesIdExpiry: e.target.value}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Passport Number</label><input type="text" value={data.documents?.passportNumber || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), passportNumber: e.target.value}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                             <div><label className="text-xs font-semibold text-gray-500 uppercase">Passport Expiry</label><input type="date" value={data.documents?.passportExpiry || ''} onChange={e => setData({...data, documents: {...(data.documents || {}), passportExpiry: e.target.value}})} className="w-full p-2 border rounded-lg mt-1" /></div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium">Cancel</button>
                    <button onClick={() => onSave(data)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">Save Changes</button>
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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-center bg-white">
                    <h2 className="text-xl font-bold text-gray-900">Onboard New Employee</h2>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Stepper */}
                <div className="px-8 py-6 bg-gray-50/50 border-b">
                    <div className="flex items-center justify-between max-w-2xl mx-auto relative">
                        {/* Connecting Lines */}
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -translate-y-1/2 z-0"></div>
                        
                        {steps.map((s, idx) => (
                            <div key={s.id} className="relative z-10 flex items-center gap-3 bg-gray-50/50 px-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                                    step === s.id 
                                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' 
                                    : step > s.id 
                                    ? 'bg-indigo-100 text-indigo-600' 
                                    : 'bg-white border-2 border-gray-200 text-gray-400'
                                }`}>
                                    {step > s.id ? <CheckCircle className="w-5 h-5" /> : s.id}
                                </div>
                                <span className={`text-sm font-bold ${step === s.id ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {s.name}
                                </span>
                                {idx < steps.length - 1 && (
                                    <div className={`w-12 h-0.5 ${step > s.id ? 'bg-indigo-600' : 'bg-gray-200'}`}></div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 max-h-[60vh] overflow-y-auto">
                    {step === 1 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900">Personal Information</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Employee Code *</label>
                                    <input 
                                        placeholder="e.g. 1001" 
                                        value={data.code||''} 
                                        onChange={e=>setData({...data, code:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name *</label>
                                    <input 
                                        placeholder="John Doe" 
                                        value={data.name||''} 
                                        onChange={e=>setData({...data, name:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Company</label>
                                    <select 
                                        value={data.company||''} 
                                        onChange={e=>setData({...data, company:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                                    >
                                        <option value="">Select Company</option>
                                        {companies.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Joining Date *</label>
                                    <input 
                                        type="date" 
                                        value={data.joiningDate||''} 
                                        onChange={e=>setData({...data, joiningDate:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mobile Number</label>
                                    <input 
                                        placeholder="e.g. +971 ..." 
                                        value={data.mobileNumber||''} 
                                        onChange={e=>setData({...data, mobileNumber:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900">Role & Work Details</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Designation</label>
                                    <input 
                                        placeholder="e.g. Driver" 
                                        value={data.designation||''} 
                                        onChange={e=>setData({...data, designation:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Department</label>
                                    <input 
                                        placeholder="e.g. Transport" 
                                        value={data.department||''} 
                                        onChange={e=>setData({...data, department:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Team</label>
                                    <select 
                                        value={data.team||''} 
                                        onChange={e=>setData({...data, team:e.target.value as any})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                                    >
                                        <option value="Internal Team">Internal Team</option>
                                        <option value="External Team">External Team</option>
                                        <option value="Office Staff">Office Staff</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Staff Type *</label>
                                    <select 
                                        value={data.type||''} 
                                        onChange={e=>setData({...data, type:e.target.value as any})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white"
                                    >
                                        <option value={StaffType.OFFICE}>{StaffType.OFFICE}</option>
                                        <option value={StaffType.WORKER}>{StaffType.WORKER}</option>
                                        <option value={StaffType.BRANCH}>{StaffType.BRANCH}</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Work Location</label>
                                    <input 
                                        placeholder="e.g. Dubai" 
                                        value={data.workLocation||''} 
                                        onChange={e=>setData({...data, workLocation:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900">Salary & Banking</h3>
                            <div className="grid grid-cols-3 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Basic *</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.basic} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, basic:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Housing</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.housing} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, housing:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Transport</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.transport} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, transport:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Air Ticket</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.airTicket} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, airTicket:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Leave Salary</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.leaveSalary} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, leaveSalary:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Other</label>
                                    <input 
                                        type="number" 
                                        value={data.salary?.other} 
                                        onChange={e=>setData({...data, salary:{...data.salary!, other:Number(e.target.value)}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-6 pt-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bank Name</label>
                                    <input 
                                        placeholder="e.g. Emirates NBD" 
                                        value={data.bankName||''} 
                                        onChange={e=>setData({...data, bankName:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">IBAN / Acct No.</label>
                                    <input 
                                        placeholder="AE00 0000 0000 0000 0000 000" 
                                        value={data.iban||''} 
                                        onChange={e=>setData({...data, iban:e.target.value})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-bold text-gray-900">Documents & Identification</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Emirates ID Number</label>
                                    <input 
                                        placeholder="784-..." 
                                        value={data.documents?.emiratesId||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, emiratesId:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">EID Expiry</label>
                                    <input 
                                        type="date" 
                                        value={data.documents?.emiratesIdExpiry||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, emiratesIdExpiry:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Passport Number</label>
                                    <input 
                                        placeholder="e.g. N1234567" 
                                        value={data.documents?.passportNumber||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, passportNumber:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Passport Expiry</label>
                                    <input 
                                        type="date" 
                                        value={data.documents?.passportExpiry||''} 
                                        onChange={e=>setData({...data, documents:{...data.documents!, passportExpiry:e.target.value}})} 
                                        className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
                    <button 
                        onClick={prevStep} 
                        disabled={step === 1}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            step === 1 ? 'opacity-0 pointer-events-none' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        Back
                    </button>
                    
                    {step < 4 ? (
                        <button 
                            onClick={nextStep} 
                            disabled={!isStepValid()}
                            className="px-8 py-2.5 bg-[#1e293b] text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50 shadow-lg shadow-slate-200"
                        >
                            Next Step <ArrowRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button 
                            onClick={() => onComplete(data as Employee)} 
                            className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                        >
                            Complete Onboarding <CheckCircle className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const UserManagementModal = ({ onClose, users, openConfirm }: { onClose: () => void, users: SystemUser[], openConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning') => void }) => {
    const [localUsers, setLocalUsers] = useState<SystemUser[]>(users);
    const [showAdd, setShowAdd] = useState(false);
    const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
    const [newUser, setNewUser] = useState({ 
        username: '', 
        password: '', 
        role: '', 
        name: '',
        permissions: {
            canViewDashboard: false,
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
        if (!newUser.username || !newUser.password || !newUser.name) {
            alert("Please fill in all fields");
            return;
        }
        try {
            const userEmail = newUser.username.includes('@') ? newUser.username : `${newUser.username}@system.local`;
            
            // Create the user in Firebase Auth first
            const authUser = await adminCreateUser(userEmail, newUser.password);
            
            const userToSave: SystemUser = {
                uid: authUser.uid,
                email: userEmail,
                username: newUser.username,
                password: newUser.password,
                name: newUser.name,
                role: newUser.role as UserRole,
                active: true,
                permissions: newUser.permissions
            };
            await saveSystemUser(userToSave);
            setShowAdd(false);
            setNewUser({ 
                username: '', 
                password: '', 
                role: '', 
                name: '',
                permissions: {
                    canViewDashboard: false,
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
            alert(e.message);
        }
    };

    const handleEdit = async () => {
        if (!editingUser) return;
        try {
            const updatedUser = {
                ...editingUser,
                email: editingUser.username.includes('@') ? editingUser.username : `${editingUser.username}@system.local`
            };
            await saveSystemUser(updatedUser);
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
                } catch (e: any) {
                    console.error("Delete error:", e);
                    alert("Error deleting user: " + (e.message || "Unknown error"));
                }
            }
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">System User Management</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-gray-700">Active System Users</h3>
                        <button onClick={() => { setShowAdd(true); setEditingUser(null); }} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
                            <Plus className="w-4 h-4" /> Add User
                        </button>
                    </div>

                    {showAdd && (
                        <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 uppercase">Full Name</label>
                                    <input className="w-full p-2 border rounded-lg text-sm" placeholder="Full Name" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 uppercase">Username / Email</label>
                                    <input className="w-full p-2 border rounded-lg text-sm" placeholder="Username" value={newUser.username} onChange={e=>setNewUser({...newUser, username: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 uppercase">Password</label>
                                    <input className="w-full p-2 border rounded-lg text-sm" type="password" placeholder="Password" value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-indigo-600 uppercase">Role</label>
                                    <select 
                                        className="w-full p-2 border rounded-lg text-sm bg-white" 
                                        value={newUser.role} 
                                        onChange={e=>setNewUser({...newUser, role: e.target.value as UserRole})}
                                    >
                                        <option value="">Select Role</option>
                                        {Object.values(UserRole).map(role => (
                                            <option key={role} value={role}>{role}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2 mt-4">
                                <label className="text-[10px] font-bold text-indigo-600 uppercase">Permissions</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.keys(newUser.permissions).map(perm => (
                                        <label key={perm} className="flex items-center gap-2 p-2 border rounded-lg bg-white cursor-pointer hover:bg-indigo-100/30">
                                            <input 
                                                type="checkbox" 
                                                checked={(newUser.permissions as any)[perm]} 
                                                onChange={e => setNewUser({
                                                    ...newUser,
                                                    permissions: { ...newUser.permissions, [perm]: e.target.checked }
                                                })}
                                                className="w-4 h-4 text-indigo-600 rounded"
                                            />
                                            <span className="text-[10px] font-medium text-gray-700 capitalize">{perm.replace('can', '').replace(/([A-Z])/g, ' $1')}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-gray-600 text-sm font-medium">Cancel</button>
                                <button onClick={handleAdd} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold">Save User</button>
                            </div>
                        </div>
                    )}

                    {editingUser && (
                        <div className="mb-6 p-4 bg-orange-50 rounded-xl border border-orange-100 space-y-3">
                            <h4 className="text-sm font-bold text-orange-800">Editing: {editingUser.name}</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 uppercase">Full Name</label>
                                    <input className="w-full p-2 border rounded-lg text-sm" placeholder="Full Name" value={editingUser.name} onChange={e=>setEditingUser({...editingUser, name: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 uppercase">Username / Email</label>
                                    <input className="w-full p-2 border rounded-lg text-sm" placeholder="Username" value={editingUser.email || editingUser.username || ''} onChange={e=>setEditingUser({...editingUser, email: e.target.value, username: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 uppercase">Password</label>
                                    <input className="w-full p-2 border rounded-lg text-sm" type="password" placeholder="Password" value={editingUser.password || ''} onChange={e=>setEditingUser({...editingUser, password: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-orange-600 uppercase">Role</label>
                                    <select 
                                        className="w-full p-2 border rounded-lg text-sm bg-white" 
                                        value={editingUser.role} 
                                        onChange={e=>setEditingUser({...editingUser, role: e.target.value as UserRole})}
                                    >
                                        {Object.values(UserRole).map(role => (
                                            <option key={role} value={role}>{role}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="space-y-2 mt-4">
                                <label className="text-[10px] font-bold text-orange-600 uppercase">Permissions</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.keys(editingUser.permissions).map(perm => (
                                        <label key={perm} className="flex items-center gap-2 p-2 border rounded-lg bg-white cursor-pointer hover:bg-orange-100/30">
                                            <input 
                                                type="checkbox" 
                                                checked={(editingUser.permissions as any)[perm]} 
                                                onChange={e => setEditingUser({
                                                    ...editingUser,
                                                    permissions: { ...editingUser.permissions, [perm]: e.target.checked }
                                                })}
                                                className="w-4 h-4 text-orange-600 rounded"
                                            />
                                            <span className="text-[10px] font-medium text-gray-700 capitalize">{perm.replace('can', '').replace(/([A-Z])/g, ' $1')}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setEditingUser(null)} className="px-3 py-1.5 text-gray-600 text-sm font-medium">Cancel</button>
                                <button onClick={handleEdit} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-bold">Update User</button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        {localUsers.map(u => (
                            <div key={u.uid || u.username} className="flex items-center justify-between p-3 border rounded-xl hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-500 font-bold text-xs">
                                        {u.name.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-800 text-sm">{u.name} <span className="text-gray-400 font-normal">({u.email || u.username})</span></p>
                                        <p className="text-xs text-indigo-600 font-semibold uppercase">{u.role}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setEditingUser(u); setShowAdd(false); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    {u.email !== CREATOR_USER.username && (
                                        <button onClick={() => handleDelete(u)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-t text-center text-xs text-gray-500">
                    System Creator account cannot be modified or deleted.
                </div>
            </div>
        </div>
    );
};

const ManageCompaniesModal = ({ onClose, companies, openConfirm }: { onClose: () => void, companies: Company[], openConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning') => void }) => {
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        email: '',
        logo: ''
    });
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = async () => {
        if (!formData.name.trim()) return;
        await addCompany(formData);
        setFormData({ name: '', address: '', email: '', logo: '' });
        setIsAdding(false);
    };

    const handleUpdate = async (company: Company) => {
        await updateCompany(company);
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">Manage Companies</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Add New Company Form */}
                    <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-indigo-900">Add New Company</h3>
                            {!isAdding && (
                                <button 
                                    onClick={() => setIsAdding(true)}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                                >
                                    + Create New
                                </button>
                            )}
                        </div>

                        {isAdding && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Company Name</label>
                                        <input 
                                            className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" 
                                            placeholder="e.g. Acme Corp" 
                                            value={formData.name} 
                                            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase">Email Address</label>
                                        <input 
                                            className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" 
                                            placeholder="contact@company.com" 
                                            value={formData.email} 
                                            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Office Address</label>
                                    <input 
                                        className="w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" 
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
                                            <button className="px-3 py-1.5 bg-white border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
                                                Upload Logo
                                            </button>
                                        </div>
                                        {formData.logo && (
                                            <img src={formData.logo} alt="Preview" className="h-8 w-8 object-contain rounded border bg-white" />
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setIsAdding(false)}
                                            className="px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
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
                                <div key={c.id} className="p-4 border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow space-y-4 relative group">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            {c.logo ? (
                                                <img src={c.logo} alt={c.name} className="h-10 w-10 object-contain rounded-lg border p-1 bg-gray-50" />
                                            ) : (
                                                <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-lg">
                                                    {c.name.charAt(0)}
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-bold text-gray-800 text-sm">{c.name}</h3>
                                                <p className="text-[10px] text-gray-400">ID: {c.id}</p>
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
                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Address</label>
                                            <input 
                                                className="w-full p-2 border border-gray-100 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/30" 
                                                value={c.address} 
                                                onChange={e => handleUpdate({...c, address: e.target.value})} 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase">Email</label>
                                            <input 
                                                className="w-full p-2 border border-gray-100 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50/30" 
                                                value={c.email} 
                                                onChange={e => handleUpdate({...c, email: e.target.value})} 
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <Download className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">Bulk Import Employees</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="p-8 text-center space-y-4">
                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 hover:border-indigo-300 transition-colors cursor-pointer relative">
                        <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                        <div className="flex flex-col items-center gap-3">
                            <div className="p-4 bg-indigo-50 rounded-full text-indigo-600">
                                <FileText className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-700">Click to upload or drag and drop</p>
                                <p className="text-sm text-gray-500">Excel or CSV files only</p>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400">Make sure your file follows the standard template format.</p>
                </div>
            </div>
        </div>
    );
};

// --- Main App ---

const AboutView = () => {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-indigo-600 to-blue-600"></div>
                <div className="px-8 pb-8">
                    <div className="relative flex justify-between items-end -mt-12 mb-6">
                        <div className="p-1 bg-white rounded-2xl shadow-lg">
                            <div className="w-24 h-24 bg-gray-100 rounded-xl flex items-center justify-center text-indigo-600">
                                <Users className="w-12 h-12" />
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">{DEFAULT_ABOUT_DATA.name}</h2>
                            <p className="text-indigo-600 font-medium">{DEFAULT_ABOUT_DATA.title}</p>
                        </div>
                        
                        <p className="text-gray-600 leading-relaxed">
                            {DEFAULT_ABOUT_DATA.bio}
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                <div className="p-2 bg-white rounded-lg shadow-sm text-gray-400">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold">Email</p>
                                    <p className="text-sm font-medium text-gray-700">{DEFAULT_ABOUT_DATA.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                <div className="p-2 bg-white rounded-lg shadow-sm text-gray-400">
                                    <AlertCircle className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold">Support</p>
                                    <p className="text-sm font-medium text-gray-700">{DEFAULT_ABOUT_DATA.contactInfo}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10">
                    <h3 className="text-xl font-bold mb-2">ShiftSync Enterprise</h3>
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
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  // View States
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showOffboarding, setShowOffboarding] = useState<Employee | null>(null);
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
            name: firebaseUser.displayName || 'New User',
            role: isDefaultAdmin ? UserRole.ADMIN : UserRole.HR,
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

  // 2. Data Listeners
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(d => d.data() as Employee));
    });

    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snap) => {
      setAttendance(snap.docs.map(d => d.data() as AttendanceRecord));
    });

    const unsubLeaves = onSnapshot(collection(db, 'leaves'), (snap) => {
      setLeaveRequests(snap.docs.map(d => d.data() as LeaveRequest));
    });

    const unsubDeductions = onSnapshot(collection(db, 'deductions'), (snap) => {
      setDeductions(snap.docs.map(d => d.data() as DeductionRecord));
    });

    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snap) => {
      setCompanies(snap.docs.map(d => d.data() as Company));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setSystemUsers(snap.docs.map(d => d.data() as SystemUser));
    });

    return () => {
      unsubEmployees();
      unsubAttendance();
      unsubLeaves();
      unsubDeductions();
      unsubCompanies();
      unsubUsers();
    };
  }, [isAuthReady, user]);

  // Handlers
  const handleOffboard = async (data: OffboardingDetails) => {
      if (showOffboarding) {
          await offboardEmployee(showOffboarding.id, data);
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
              } catch (err: any) {
                  alert(err.message || "Error deleting employee");
              }
          }
      );
  };

  const handleRejoinEmployee = async (e: Employee) => {
      const reason = prompt(`Enter rejoining reason for ${e.name}:`);
      if (reason !== null) {
          try {
              await rehireEmployee(e.id, new Date().toISOString().split('T')[0], reason);
          } catch (err: any) {
              alert(err.message);
          }
      }
  };

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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'staff', label: 'Staff Directory', icon: Users },
    { id: 'ex-employees', label: 'Ex-Employees', icon: UserMinus }, 
    { id: 'timesheet', label: 'Monthly Timesheet', icon: Calendar },
    { id: 'deductions', label: 'Deductions', icon: Wallet },
    { id: 'leave', label: 'Leave Management', icon: FileText },
    { id: 'payroll', label: 'Payroll Register', icon: DollarSign },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'about', label: 'About', icon: AlertCircle },
  ];

  return (
    <div className="min-h-screen bg-[#f3f4f6] font-sans text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1920px] mx-auto">
            {/* Top Row */}
            <div className="px-6 py-2 flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-1.5 rounded-lg shadow-sm"><Building2 className="text-white w-5 h-5" /></div>
                    <span className="font-bold text-xl tracking-tight text-gray-900">ShiftSync</span>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <select className="bg-gray-50 border border-gray-200 text-xs font-medium text-gray-600 py-1.5 px-3 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500">
                            <option>All Companies</option>
                            {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <button className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><Settings className="w-4 h-4" /></button>
                    </div>

                    <div className="flex items-center gap-2">
                        <select className="bg-gray-50 border border-gray-200 text-xs font-medium text-gray-600 py-1.5 px-3 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500">
                            <option>All Teams</option>
                            <option>Internal Team</option>
                            <option>External Team</option>
                            <option>Office Staff</option>
                        </select>
                    </div>

                    <div className="h-8 w-px bg-gray-100 mx-1"></div>

                    <div className="flex items-center gap-3 pl-2">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-gray-900 leading-none">{systemUser.name}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">{systemUser.role}</div>
                        </div>
                        <div className="w-9 h-9 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 border border-indigo-100 font-bold text-sm shadow-sm">
                            {systemUser.name.charAt(0)}
                        </div>
                        <button 
                          onClick={logout}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Logout"
                        >
                            <SignOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Navigation Row */}
            <nav className="px-6 flex gap-1 overflow-x-auto no-scrollbar border-t border-gray-50">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === item.id 
                            ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' 
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <item.icon className={`w-4 h-4 ${activeTab === item.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                        {item.label}
                    </button>
                ))}
            </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-[1920px] mx-auto w-full">
         {activeTab === 'dashboard' && (
             <DashboardView 
                employees={employees} 
                attendance={attendance} 
                user={systemUser}
                onOpenUserManagement={() => setShowUserManagement(true)}
                onOpenManageCompanies={() => setShowManageCompanies(true)}
                onOpenOnboarding={() => setShowOnboarding(true)}
                onUpdate={() => {}}
             />
         )}
         {activeTab === 'staff' && (
             <StaffDirectoryView 
               employees={employees.filter(e => e.active)} 
               onAdd={() => setShowOnboarding(true)} 
               onEdit={(e: Employee) => setShowEdit(e)} 
               onOffboard={(e: Employee) => setShowOffboarding(e)}
             />
         )}
         {activeTab === 'ex-employees' && (
             <StaffDirectoryView 
                employees={employees.filter(e => !e.active)} 
                onEdit={(e: Employee) => setShowEdit(e)}
                onDelete={handleDeleteEmployee}
                onRejoin={handleRejoinEmployee}
                readOnly={true}
             />
         )}
         {activeTab === 'timesheet' && (
             <TimesheetView employees={employees.filter(e => e.active)} attendance={attendance} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
         )}
         {activeTab === 'deductions' && (
             <DeductionsView employees={employees} deductions={deductions} openConfirm={openConfirm} />
         )}
         {activeTab === 'leave' && (
             <LeaveManagementView employees={employees} leaveRequests={leaveRequests} user={systemUser} />
         )}
         {activeTab === 'payroll' && (
             <PayrollRegisterView employees={employees.filter(e => e.active)} attendance={attendance} deductions={deductions} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} />
         )}
         {activeTab === 'reports' && (
             <ReportsView employees={employees} attendance={attendance} />
         )}
         {activeTab === 'about' && (
             <AboutView />
         )}
      </main>

      {/* Modals */}
      {showOnboarding && <OnboardingWizard companies={companies} onComplete={async (d) => { 
          const fullData = { ...d, id: Math.random().toString(36).substr(2, 9) } as Employee;
          await saveEmployee(fullData); 
          setShowOnboarding(false); 
      }} onCancel={() => setShowOnboarding(false)} />}
      {showOffboarding && <OffboardingWizard employee={showOffboarding} onComplete={handleOffboard} onCancel={() => setShowOffboarding(null)} />}
      {showEdit && <EditEmployeeModal companies={companies} employee={showEdit} onSave={async (d) => { await saveEmployee(d); setShowEdit(null); }} onCancel={() => setShowEdit(null)} />}
      {showUserManagement && <UserManagementModal onClose={() => setShowUserManagement(false)} users={systemUsers} openConfirm={openConfirm} />}
      {showManageCompanies && <ManageCompaniesModal onClose={() => setShowManageCompanies(false)} companies={companies} openConfirm={openConfirm} />}
      {showBulkImport && <BulkImportModal onClose={() => setShowBulkImport(false)} onImport={(data) => {
          // Basic mapping logic for import
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
      }} />}
      
      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal({...confirmModal, isOpen: false})} {...confirmModal} />
    </div>
  );
}

// --- Dashboard View ---

const DashboardView = ({ employees, attendance, user, onOpenUserManagement, onOpenManageCompanies, onOpenOnboarding, onUpdate }: any) => {
    // Stats Calculation
    const activeStaff = employees.filter((e:any) => e.active);
    const internalTeam = activeStaff.filter((e:any) => e.team === 'Internal Team').length;
    const externalTeam = activeStaff.filter((e:any) => e.team === 'External Team').length;
    const officeStaff = activeStaff.filter((e:any) => e.team === 'Office Staff' || e.type === StaffType.OFFICE).length;
    const exEmployees = employees.filter((e:any) => !e.active).length;

    // Company grouping
    const companyStats = useMemo(() => {
        const counts: Record<string, number> = {};
        activeStaff.forEach((e:any) => {
            counts[e.company] = (counts[e.company] || 0) + 1;
        });
        return Object.entries(counts).sort((a,b) => b[1] - a[1]);
    }, [activeStaff]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Section */}
            <div className="flex justify-between items-end mb-2">
                <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
                <div className="flex gap-2">
                    <button 
                        onClick={onOpenOnboarding}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <UserPlus className="w-4 h-4" /> Onboard
                    </button>
                    <button 
                        onClick={onOpenManageCompanies}
                        className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <Building2 className="w-4 h-4" /> Companies
                    </button>
                    <button 
                        onClick={onOpenUserManagement}
                        className="bg-[#1e293b] hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                    >
                        <UserCog className="w-4 h-4" /> User Management
                    </button>
                </div>
            </div>

            {/* Stats Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <DashboardStatCard title="Total Active Staff" value={activeStaff.length} icon={Users} iconColor="text-blue-600" bgIcon="bg-blue-50" />
                <DashboardStatCard title="Internal Team" value={internalTeam} icon={Users} iconColor="text-green-600" bgIcon="bg-green-50" />
                <DashboardStatCard title="External Team" value={externalTeam} icon={HardHat} iconColor="text-orange-600" bgIcon="bg-orange-50" />
                <DashboardStatCard title="Office Staff" value={officeStaff} icon={Building2} iconColor="text-indigo-600" bgIcon="bg-indigo-50" />
                <DashboardStatCard title="Ex-Employees" value={exEmployees} icon={UserMinus} iconColor="text-red-600" bgIcon="bg-red-50" />
            </div>

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Staff by Company Widget */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Building2 className="w-5 h-5 text-gray-500" />
                        <h3 className="font-bold text-gray-900">Staff by Company</h3>
                    </div>
                    <div className="space-y-3">
                        {companyStats.map(([company, count]) => (
                            <div key={company} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-100 transition-colors group">
                                <span className="text-xs font-medium text-gray-600 uppercase tracking-wide group-hover:text-gray-900">{company}</span>
                                <span className="bg-white border border-gray-200 text-gray-700 font-bold text-xs px-2.5 py-1 rounded-md shadow-sm">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* My Access Widget (Dark Card) */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col">
                    <div className="flex items-center gap-2 mb-6">
                        <ShieldCheck className="w-5 h-5 text-gray-500" />
                        <h3 className="font-bold text-gray-900">My Access</h3>
                    </div>
                    
                    <div className="bg-[#0f172a] rounded-xl p-8 text-white flex-1 flex flex-col justify-between relative overflow-hidden">
                        {/* Decorative background blur */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                        
                        <div className="mb-8 relative z-10">
                            <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-xl font-bold mb-4">
                                {user.name.charAt(0)}
                            </div>
                            <h4 className="text-xl font-bold">{user.name}</h4>
                            <p className="text-slate-400 text-sm">@{user.username}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-y-3 gap-x-8 relative z-10">
                            {Object.entries(user.permissions).filter(([k,v]) => v).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-2 text-sm text-slate-300">
                                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                                    <span>{key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DashboardStatCard = ({ title, value, icon: Icon, iconColor, bgIcon }: any) => (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[140px] hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex justify-between items-end mt-4">
            <span className="text-4xl font-bold text-gray-900 tracking-tight">{value}</span>
            <div className={`p-3 rounded-xl ${bgIcon}`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
        </div>
    </div>
);

// --- Sub Views ---

const StaffDirectoryView = ({ employees, onAdd, onEdit, onOffboard, onDelete, onRejoin, readOnly }: any) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredEmployees = employees.filter((e: Employee) => e.name.toLowerCase().includes(searchTerm.toLowerCase()) || e.code.includes(searchTerm));

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search staff..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-full outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                {!readOnly && (
                    <button onClick={onAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700">
                        <UserPlus className="w-4 h-4" /> Add Employee
                    </button>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold border-b border-gray-200">
                        <tr><th className="p-4">ID</th><th className="p-4">Name</th><th className="p-4">Role</th><th className="p-4">Company</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {filteredEmployees.map((e: Employee) => (
                            <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-4 font-mono text-gray-500">{e.code}</td>
                                <td className="p-4 font-medium text-gray-900">{e.name}</td>
                                <td className="p-4 text-gray-600">{e.designation}</td>
                                <td className="p-4 text-gray-500">{e.company}</td>
                                <td className="p-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${e.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.status}</span></td>
                                <td className="p-4 flex gap-2">
                                    {e.active ? (
                                        !readOnly && (
                                            <>
                                                <button onClick={() => onEdit(e)} title="Edit" className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded"><Edit className="w-4 h-4" /></button>
                                                <button onClick={() => onOffboard(e)} title="Offboard" className="p-1.5 hover:bg-red-50 text-red-600 rounded"><LogOut className="w-4 h-4" /></button>
                                            </>
                                        )
                                    ) : (
                                        <>
                                            <button onClick={() => onEdit(e)} title="Edit" className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => onRejoin(e)} title="Rejoin" className="p-1.5 hover:bg-green-50 text-green-600 rounded"><UserPlus className="w-4 h-4" /></button>
                                            <button onClick={() => onDelete(e)} title="Delete" className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredEmployees.length === 0 && <div className="p-8 text-center text-gray-500">No employees found.</div>}
            </div>
        </div>
    );
};

const TimesheetView = ({ employees, attendance, selectedMonth, onMonthChange }: any) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const [searchTerm, setSearchTerm] = useState('');

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'short' });
    const shortYear = year.toString().slice(-2);

    const handlePrevMonth = () => {
        const d = new Date(year, month - 2);
        onMonthChange(d.toISOString().slice(0, 7));
    };

    const handleNextMonth = () => {
        const d = new Date(year, month);
        onMonthChange(d.toISOString().slice(0, 7));
    };

    return (
        <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-4">
                            <button onClick={handlePrevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"><X className="w-4 h-4 rotate-90" /></button>
                            <span className="text-lg font-bold text-gray-800 min-w-[80px] text-center">{monthName} {shortYear}</span>
                            <button onClick={handleNextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"><X className="w-4 h-4 -rotate-90" /></button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Search Employee..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-64 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <button className="flex items-center gap-2 px-3 py-2 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-50 transition-colors">
                            <Calendar className="w-4 h-4" /> Holidays
                        </button>
                        <button className="flex items-center gap-2 px-3 py-2 border border-orange-200 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-50 transition-colors">
                            <Copy className="w-4 h-4" /> Copy
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                    {Object.entries(LEGEND).map(([status, meta]: any) => (
                        <div key={status} className={`px-2 py-1 rounded text-[10px] font-bold ${meta.color.replace('text-800', 'text-gray-700')} border border-gray-100`}>
                            {meta.code} - {meta.label}
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="w-full text-center border-collapse text-[11px]">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="p-3 text-left bg-gray-50 sticky left-0 z-10 border-r border-gray-200 min-w-[40px] font-bold text-gray-500">#</th>
                            <th className="p-3 text-left bg-gray-50 sticky left-40 z-10 border-r border-gray-200 min-w-[150px] font-bold text-gray-900">Employee</th>
                            <th className="p-3 font-bold text-gray-900 border-r border-gray-200">Leave Bal</th>
                            <th className="p-3 font-bold text-indigo-600 border-r border-gray-200">OT</th>
                            {days.map(d => {
                                const date = new Date(year, month - 1, d);
                                const dayName = date.toLocaleString('default', { weekday: 'narrow' });
                                const isSunday = date.getDay() === 0;
                                return (
                                    <th key={d} className={`p-1 w-8 border-r border-gray-100 ${isSunday ? 'text-red-500' : 'text-gray-900'}`}>
                                        <div className="font-bold">{d}</div>
                                        <div className="text-[9px] uppercase">{dayName}</div>
                                    </th>
                                );
                            })}
                            <th className="p-3 font-bold text-gray-900">Summary</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {employees.filter((e: Employee) => e.name.toLowerCase().includes(searchTerm.toLowerCase())).map((e: Employee, idx: number) => (
                            <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-3 text-left border-r border-gray-100 sticky left-0 bg-white z-10 text-gray-400">{idx + 1}</td>
                                <td className="p-3 text-left border-r border-gray-100 sticky left-40 bg-white z-10 font-bold text-gray-900">{e.name}</td>
                                <td className="p-3 border-r border-gray-100 font-bold">{e.leaveBalance}</td>
                                <td className="p-3 border-r border-gray-100 font-bold text-indigo-600">
                                    {attendance.filter(r => r.employeeId === e.id && r.date.startsWith(selectedMonth)).reduce((sum, r) => sum + (r.overtimeHours || 0), 0)}
                                </td>
                                {days.map(d => {
                                    const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
                                    const record = attendance.find((r: AttendanceRecord) => r.employeeId === e.id && r.date === dateStr);
                                    const meta = LEGEND[record?.status] || {};
                                    const isSunday = new Date(year, month - 1, d).getDay() === 0;
                                    return (
                                        <td key={d} className={`border-r border-gray-100 p-1 font-bold ${meta.code ? meta.color : isSunday ? 'text-red-100' : 'text-gray-200'}`}>
                                            {meta.code || (isSunday ? 'S' : '-')}
                                        </td>
                                    );
                                })}
                                <td className="p-3 font-bold text-gray-900">
                                    {attendance.filter(r => r.employeeId === e.id && r.date.startsWith(selectedMonth) && r.status === AttendanceStatus.PRESENT).length}P
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const DeductionsView = ({ employees, deductions, openConfirm }: any) => {
    const [newItem, setNewItem] = useState<Partial<DeductionRecord>>({ type: 'Salary Advance', date: new Date().toISOString().split('T')[0] });

    const handleAdd = async () => {
        if(newItem.employeeId && newItem.amount && newItem.date) {
            await saveDeduction(newItem as any);
            setNewItem({ type: 'Salary Advance', date: new Date().toISOString().split('T')[0] });
        }
    }
    
    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Deductions & Penalties</h2>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-6 text-sm">Add New Deduction</h3>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Employee</label>
                        <select className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500" value={newItem.employeeId || ''} onChange={e => setNewItem({...newItem, employeeId: e.target.value})}>
                            <option value="">Select...</option>
                            {employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</label>
                        <input type="date" className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500" value={newItem.date || ''} onChange={e => setNewItem({...newItem, date: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Type</label>
                        <select className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500" value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value as any})}>
                            <option>Salary Advance</option>
                            <option>Fine Amount</option>
                            <option>Damage Material/Asset</option>
                            <option>Loan Amount</option>
                            <option>Other</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Amount</label>
                        <input type="number" className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500" placeholder="0.00" value={newItem.amount || ''} onChange={e => setNewItem({...newItem, amount: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1.5 md:col-span-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Description / Note</label>
                        <input className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500" placeholder="Reason..." value={newItem.note || ''} onChange={e => setNewItem({...newItem, note: e.target.value})} />
                    </div>
                    <button onClick={handleAdd} className="w-full bg-[#d32f2f] hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-bold transition-all shadow-md shadow-red-100">
                        Add
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-[11px]">
                    <thead className="text-gray-400 font-bold uppercase tracking-wider bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Employee</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Note</th>
                            <th className="p-4 text-right">Amount</th>
                            <th className="p-4 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {deductions.map(d => (
                            <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-4 text-gray-500">{d.date}</td>
                                <td className="p-4 font-bold text-gray-900">{employees.find((e:any)=>e.id===d.employeeId)?.name || 'Unknown'}</td>
                                <td className="p-4 text-gray-600">{d.type}</td>
                                <td className="p-4 text-gray-400 italic">{d.note || '-'}</td>
                                <td className="p-4 text-right font-bold text-gray-900">{d.amount.toFixed(2)}</td>
                                <td className="p-4 text-center">
                                    <button onClick={() => {
                                        openConfirm("Delete Deduction", "Are you sure you want to remove this record?", async () => {
                                            await deleteDeduction(d.id);
                                        });
                                    }} className="p-2 text-gray-300 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4"/></button>
                                </td>
                            </tr>
                        ))}
                        {deductions.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-12 text-center text-gray-400 font-medium">
                                    No deductions recorded.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const LeaveManagementView = ({ employees, leaveRequests, user }: any) => {
    const [showNew, setShowNew] = useState(false);
    const [newReq, setNewReq] = useState({ employeeId: '', type: AttendanceStatus.ANNUAL_LEAVE, startDate: '', endDate: '', reason: '' });

    const handleSave = async () => {
        if(newReq.employeeId && newReq.startDate && newReq.endDate) {
            await saveLeaveRequest(newReq as any, user.name);
            setShowNew(false);
        }
    };

    const handleStatus = async (id: string, status: LeaveStatus) => {
        await updateLeaveRequestStatus(id, status, user.name);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-700">Leave Requests</h3>
                <button onClick={() => setShowNew(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Request
                </button>
            </div>

            {showNew && (
                <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-md animate-in slide-in-from-top-2">
                    <h4 className="font-bold mb-4">New Leave Request</h4>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <select className="border p-2 rounded" value={newReq.employeeId} onChange={e=>setNewReq({...newReq, employeeId:e.target.value})}>
                            <option value="">Select Employee</option>
                            {employees.map((e:any)=><option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <select className="border p-2 rounded" value={newReq.type} onChange={e=>setNewReq({...newReq, type:e.target.value as any})}>
                            <option value={AttendanceStatus.ANNUAL_LEAVE}>Annual Leave</option>
                            <option value={AttendanceStatus.SICK_LEAVE}>Sick Leave</option>
                            <option value={AttendanceStatus.EMERGENCY_LEAVE}>Emergency Leave</option>
                            <option value={AttendanceStatus.UNPAID_LEAVE}>Unpaid Leave</option>
                        </select>
                        <input type="date" className="border p-2 rounded" value={newReq.startDate} onChange={e=>setNewReq({...newReq, startDate:e.target.value})} />
                        <input type="date" className="border p-2 rounded" value={newReq.endDate} onChange={e=>setNewReq({...newReq, endDate:e.target.value})} />
                        <input className="border p-2 rounded col-span-2" placeholder="Reason" value={newReq.reason} onChange={e=>setNewReq({...newReq, reason:e.target.value})} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowNew(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded">Submit Request</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 font-semibold text-gray-500">
                        <tr><th className="p-4">Employee</th><th className="p-4">Dates</th><th className="p-4">Type</th><th className="p-4">Reason</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y">
                        {leaveRequests.map(r => (
                            <tr key={r.id}>
                                <td className="p-4 font-medium">{employees.find((e:any)=>e.id===r.employeeId)?.name}</td>
                                <td className="p-4 text-gray-500">{r.startDate} to {r.endDate}</td>
                                <td className="p-4"><span className="px-2 py-1 bg-gray-100 rounded text-xs">{r.type}</span></td>
                                <td className="p-4 text-gray-600">{r.reason}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'Approved' ? 'bg-green-100 text-green-700' : r.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {r.status}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {r.status === 'Pending' && (
                                        <div className="flex gap-2">
                                            <button onClick={() => handleStatus(r.id, LeaveStatus.APPROVED)} className="p-1 bg-green-50 text-green-600 rounded hover:bg-green-100"><Check className="w-4 h-4"/></button>
                                            <button onClick={() => handleStatus(r.id, LeaveStatus.REJECTED)} className="p-1 bg-red-50 text-red-600 rounded hover:bg-red-100"><X className="w-4 h-4"/></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {leaveRequests.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No leave requests.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PayrollRegisterView = ({ employees, attendance, deductions, selectedMonth, onMonthChange }: any) => {
     
     // Simple export stub
     const handleExport = () => {
        alert("Export functionality would generate a CSV/Excel file here.");
     };

     return (
        <div className="space-y-4">
             <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                 <div className="flex items-center gap-4">
                     <h3 className="font-bold text-gray-700">Payroll Register</h3>
                     <input type="month" value={selectedMonth} onChange={e=>onMonthChange(e.target.value)} className="border p-2 rounded text-sm" />
                 </div>
                 <button onClick={handleExport} className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded flex items-center gap-2 text-sm font-medium">
                     <Download className="w-4 h-4" /> Export Report
                 </button>
             </div>
             
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                 <table className="w-full text-left text-sm whitespace-nowrap">
                     <thead className="bg-gray-50 font-semibold text-gray-500 border-b border-gray-200">
                         <tr>
                             <th className="p-4 sticky left-0 bg-gray-50">Employee</th>
                             <th className="p-4 text-right">Basic</th>
                             <th className="p-4 text-right">Housing</th>
                             <th className="p-4 text-right">Transport</th>
                             <th className="p-4 text-right">Other</th>
                             <th className="p-4 text-right">Gross</th>
                             <th className="p-4 text-right text-red-600">Unpaid Days</th>
                             <th className="p-4 text-right text-red-600">Deductions</th>
                             <th className="p-4 text-right text-green-600">OT Pay</th>
                             <th className="p-4 text-right font-bold">Net Salary</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                         {employees.map((e:Employee) => {
                             const monthRecs = attendance.filter((r:any) => r.employeeId === e.id && r.date.startsWith(selectedMonth));
                             const monthDeds = deductions.filter((d:any) => d.employeeId === e.id && d.date.startsWith(selectedMonth));
                             const p = calculatePayroll(e, monthRecs, monthDeds);
                             
                             return (
                                 <tr key={e.id} className="hover:bg-gray-50">
                                     <td className="p-4 sticky left-0 bg-white font-medium border-r border-gray-100">{e.name}</td>
                                     <td className="p-4 text-right text-gray-500">{p.breakdown.basic.toLocaleString()}</td>
                                     <td className="p-4 text-right text-gray-500">{p.breakdown.housing.toLocaleString()}</td>
                                     <td className="p-4 text-right text-gray-500">{p.breakdown.transport.toLocaleString()}</td>
                                     <td className="p-4 text-right text-gray-500">{p.breakdown.other.toLocaleString()}</td>
                                     <td className="p-4 text-right font-medium">{p.grossSalary.toLocaleString()}</td>
                                     <td className="p-4 text-right text-red-500">{p.totalUnpaidDays}</td>
                                     <td className="p-4 text-right text-red-600">-{p.totalDeductions.toFixed(0)}</td>
                                     <td className="p-4 text-right text-green-600">+{p.otAmount.toFixed(0)}</td>
                                     <td className="p-4 text-right font-bold text-indigo-700 bg-indigo-50/50">{p.netSalary.toFixed(0)}</td>
                                 </tr>
                             )
                         })}
                     </tbody>
                 </table>
             </div>
        </div>
     );
};

const ReportsView = ({ employees, attendance }: any) => {
    // Quick calculations
    const totalStaff = employees.length;
    const totalSpent = employees.reduce((acc: number, e: Employee) => acc + (e.salary.basic + e.salary.housing + e.salary.transport + e.salary.other), 0);
    const lateDays = attendance.filter((r:AttendanceRecord) => r.status === 'P' && r.checkInTime && new Date(r.checkInTime).getHours() > 9).length; 
    
    const companyData = useMemo(() => {
        const counts: Record<string, number> = {};
        employees.filter((e:any) => e.active).forEach((e:any) => {
            counts[e.company] = (counts[e.company] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [employees]);

    const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    return (
        <div className="space-y-6">
            <h3 className="font-bold text-gray-900 text-xl">Company Reports</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h4 className="text-gray-500 text-sm uppercase font-bold">Monthly Payroll Liability</h4>
                    <p className="text-3xl font-bold text-indigo-600 mt-2">AED {totalSpent.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-1">Estimated fixed cost (excluding OT)</p>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h4 className="text-gray-500 text-sm uppercase font-bold">Late Arrivals (This Month)</h4>
                    <p className="text-3xl font-bold text-orange-500 mt-2">{lateDays}</p>
                    <p className="text-xs text-gray-400 mt-1">Based on check-in time &gt; 9:00 AM</p>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h4 className="text-gray-500 text-sm uppercase font-bold">Staff Turnover</h4>
                    <p className="text-3xl font-bold text-blue-500 mt-2">0%</p>
                    <p className="text-xs text-gray-400 mt-1">No exits recorded this month</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border shadow-sm h-80">
                    <h4 className="font-bold text-gray-700 mb-4">Staff Distribution by Company</h4>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={companyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: '#f3f4f6'}} />
                            <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                
                <div className="bg-white p-6 rounded-xl border shadow-sm h-80">
                    <h4 className="font-bold text-gray-700 mb-4">Company Composition</h4>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={companyData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {companyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
