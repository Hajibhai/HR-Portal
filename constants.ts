
import { Employee, StaffType, ShiftType, SystemUser, UserRole, AboutData } from "./types";

// Known Public Holidays (YYYY-MM-DD)
export const PUBLIC_HOLIDAYS = [
    '2025-12-02', // UAE National Day
    '2025-12-25'  // Christmas
];

// Default Admin User
export const DEFAULT_ADMIN: SystemUser = {
    uid: 'admin-default',
    email: 'admin@shiftsync.local',
    username: 'admin',
    password: '123', // Simple for demo
    name: 'System Administrator',
    role: UserRole.ADMIN,
    active: true,
    permissions: {
        canViewDashboard: true,
        canManageEmployees: true,
        canViewDirectory: true,
        canManageAttendance: true,
        canViewTimesheet: true,
        canManageLeaves: true,
        canViewPayroll: true,
        canManagePayroll: true,
        canViewReports: true,
        canManageUsers: true,
        canManageSettings: true
    }
};

export const CREATOR_USER: SystemUser = {
    uid: 'creator-default',
    email: 'abdulkaderp3010@gmail.com',
    username: 'abdulkaderp3010@gmail.com',
    password: 'Haji@3010',
    name: 'Mohamed Abdul Kader',
    role: UserRole.CREATOR,
    active: true,
    permissions: {
        canViewDashboard: true,
        canManageEmployees: true,
        canViewDirectory: true,
        canManageAttendance: true,
        canViewTimesheet: true,
        canManageLeaves: true,
        canViewPayroll: true,
        canManagePayroll: true,
        canViewReports: true,
        canManageUsers: true,
        canManageSettings: true
    }
};

export const DEFAULT_ABOUT_DATA: AboutData = {
    name: 'Mohamed Abdul Kader',
    title: 'Full Stack Developer & System Architect',
    bio: 'Passionate developer dedicated to building efficient, user-friendly workforce management solutions. Expert in React, modern web technologies, and system automation.',
    profileImage: '', // Will default to placeholder in UI if empty
    email: 'abdulkaderp3010@gmail.com',
    contactInfo: 'Contact for support and custom development.'
};

export const STORAGE_KEYS = {
  EMPLOYEES: 'shiftsync_employees_v2',
  ATTENDANCE: 'shiftsync_attendance_v2',
  LEAVE_REQUESTS: 'shiftsync_leave_requests_v1',
  PUBLIC_HOLIDAYS: 'shiftsync_public_holidays_v1',
  COMPANIES: 'shiftsync_companies_v1',
  USERS: 'shiftsync_users_v1',
  ABOUT: 'shiftsync_about_v1',
  DEDUCTIONS: 'shiftsync_deductions_v1'
};
