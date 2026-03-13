import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocFromServer 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Employee, 
  AttendanceRecord, 
  AttendanceStatus, 
  StaffType, 
  LeaveRequest, 
  LeaveStatus, 
  PublicHoliday, 
  OffboardingDetails, 
  SystemUser, 
  AboutData, 
  DeductionRecord,
  Company,
  AuditLog,
  UserRole
} from "../types";

// Helper for error handling as per spec
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  console.error(`Firestore Error [${operationType}] at ${path}:`, error);
  // In a real app, we'd follow the JSON error spec here
  throw error;
};

// Test connection on boot
export const testConnection = async () => {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
};

// --- Employees ---
export const saveEmployee = async (employee: Employee) => {
  try {
    await setDoc(doc(db, 'employees', employee.id), employee);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `employees/${employee.id}`);
  }
};

export const deleteEmployee = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'employees', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `employees/${id}`);
  }
};

export const offboardEmployee = async (id: string, details: OffboardingDetails) => {
  try {
    await updateDoc(doc(db, 'employees', id), {
      status: 'Inactive',
      active: false,
      offboardingDetails: details
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `employees/${id}`);
  }
};

export const rehireEmployee = async (id: string, rejoiningDate: string, reason: string) => {
  try {
    await updateDoc(doc(db, 'employees', id), {
      status: 'Active',
      active: true,
      joiningDate: rejoiningDate,
      rejoiningDate: rejoiningDate,
      rejoiningReason: reason,
      offboardingDetails: null
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `employees/${id}`);
  }
};

// --- Attendance ---
export const logAttendance = async (
  employeeId: string, 
  status: AttendanceStatus,
  dateOverride?: string,
  overtimeHours?: number,
  otAttachment?: string,
  updatedBy?: string,
  note?: string
) => {
  const now = new Date();
  let dateStr = dateOverride;
  if (!dateStr) {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
  }

  const recordId = `${employeeId}_${dateStr}`;
  const recordRef = doc(db, 'attendance', recordId);

  let hours = 0;
  if (status === AttendanceStatus.PRESENT) hours = 8;

  try {
    const snap = await getDoc(recordRef);
    if (!snap.exists()) {
      const newRecord: AttendanceRecord = {
        id: recordId,
        employeeId,
        date: dateStr,
        status,
        hoursWorked: hours,
        overtimeHours: overtimeHours || 0,
        checkInTime: status === AttendanceStatus.PRESENT ? new Date().toISOString() : undefined,
        otAttachment: otAttachment,
        updatedBy: updatedBy || 'System',
        note: note
      };
      await setDoc(recordRef, newRecord);
    } else {
      const updates: any = {
        status,
        hoursWorked: hours,
        updatedBy: updatedBy || 'System'
      };
      if (note !== undefined) updates.note = note;
      if (overtimeHours !== undefined) updates.overtimeHours = overtimeHours;
      if (otAttachment !== undefined) updates.otAttachment = otAttachment;
      if (status === AttendanceStatus.PRESENT && !snap.data().checkInTime) {
        updates.checkInTime = new Date().toISOString();
      }
      await updateDoc(recordRef, updates);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `attendance/${recordId}`);
  }
};

export const deleteAttendanceRecord = async (employeeId: string, date: string) => {
  const recordId = `${employeeId}_${date}`;
  try {
    await deleteDoc(doc(db, 'attendance', recordId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `attendance/${recordId}`);
  }
};

// --- Leaves ---
export const saveLeaveRequest = async (request: Omit<LeaveRequest, 'id' | 'status' | 'appliedOn'>, createdBy: string) => {
  const id = Math.random().toString(36).substr(2, 9);
  const newRequest: LeaveRequest = {
    ...request,
    id,
    status: LeaveStatus.PENDING,
    appliedOn: new Date().toISOString().split('T')[0],
    createdBy: createdBy
  };
  try {
    await setDoc(doc(db, 'leaves', id), newRequest);
    return newRequest;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `leaves/${id}`);
  }
};

export const updateLeaveRequestStatus = async (id: string, status: LeaveStatus, approvedBy?: string) => {
  try {
    const leaveRef = doc(db, 'leaves', id);
    const snap = await getDoc(leaveRef);
    if (!snap.exists()) return;
    const req = snap.data() as LeaveRequest;

    const updates: any = { status };
    if (approvedBy && status === LeaveStatus.APPROVED) {
      updates.approvedBy = approvedBy;
    }
    await updateDoc(leaveRef, updates);

    if (status === LeaveStatus.APPROVED) {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
         const dateStr = d.toISOString().split('T')[0];
         await logAttendance(req.employeeId, req.type, dateStr, 0, undefined, approvedBy || 'System', `Leave Approved by ${approvedBy || 'System'}`);
      }

      if (req.type === AttendanceStatus.ANNUAL_LEAVE || req.type === AttendanceStatus.SICK_LEAVE) {
        const empRef = doc(db, 'employees', req.employeeId);
        const empSnap = await getDoc(empRef);
        if (empSnap.exists()) {
          const emp = empSnap.data() as Employee;
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
          await updateDoc(empRef, {
            leaveBalance: Math.max(0, emp.leaveBalance - diffDays)
          });
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leaves/${id}`);
  }
};

// --- Deductions ---
export const saveDeduction = async (deduction: Omit<DeductionRecord, 'id'>) => {
  const id = Math.random().toString(36).substr(2, 9);
  const newRecord: DeductionRecord = { ...deduction, id };
  try {
    await setDoc(doc(db, 'deductions', id), newRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `deductions/${id}`);
  }
};

export const deleteDeduction = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'deductions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `deductions/${id}`);
  }
};

// --- Companies ---
export const addCompany = async (companyData: Omit<Company, 'id'>) => {
  const id = Math.random().toString(36).substr(2, 9);
  const newCompany: Company = {
    id,
    ...companyData
  };
  try {
    await setDoc(doc(db, 'companies', id), newCompany);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `companies/${id}`);
  }
};

export const updateCompany = async (company: Company) => {
  try {
    await setDoc(doc(db, 'companies', company.id), company);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `companies/${company.id}`);
  }
};

export const deleteCompany = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'companies', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `companies/${id}`);
  }
};

// --- System Users ---
export const saveSystemUser = async (user: SystemUser) => {
  try {
    await setDoc(doc(db, 'users', user.uid), user);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
};

export const deleteSystemUser = async (uid: string) => {
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }
};

// --- About Data ---
export const saveAboutData = async (data: AboutData) => {
  try {
    await setDoc(doc(db, 'settings', 'about'), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/about');
  }
};

// --- Audit Logs ---
export const logAudit = async (user: SystemUser, action: string, details: string, type: 'create' | 'update' | 'delete' | 'system') => {
  const id = Math.random().toString(36).substr(2, 9);
  const log: AuditLog = {
    id,
    timestamp: new Date().toISOString(),
    userId: user.uid,
    userName: user.name,
    userRole: user.role,
    action,
    details,
    type,
    isCreator: user.role === UserRole.CREATOR || user.email === 'abdulkaderp3010@gmail.com'
  };
  try {
    await setDoc(doc(db, 'audit_logs', id), log);
  } catch (error) {
    console.error("Failed to log audit:", error);
  }
};
