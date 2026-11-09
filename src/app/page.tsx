'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Section, Student, Enrollment, ApiLog } from '../types';
import { api, subscribeApiLogs } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';
import { CourseCatalog } from '../components/CourseCatalog';
import { MyEnrollments } from '../components/MyEnrollments';
import { StaffConsole } from '../components/StaffConsole';
import { ApiInspector } from '../components/ApiInspector';
import { ToastContainer, ToastMessage } from '../components/Toast';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [sections, setSections] = useState<Section[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<Enrollment[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<Enrollment[]>([]);
  const [activeTab, setActiveTab] = useState<'catalog' | 'my_enrollments' | 'staff_console' | 'api_logs'>('catalog');

  const [isLoading, setIsLoading] = useState(true);
  const [isEnrollingId, setIsEnrollingId] = useState<number | null>(null);
  const [isDroppingId, setIsDroppingId] = useState<number | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);

  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Convert authenticated AuthUser to Student format for UI components
  const currentStudent: Student | null = user
    ? {
        id: user.id,
        student_code: user.student_code,
        full_name: user.full_name,
        email: user.email,
        major: user.major,
        role: user.role,
      }
    : null;

  const addToast = (type: 'success' | 'error' | 'info', title: string, message: string, code?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message, code }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Redirect to /login if unauthenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Restore active tab from localStorage
  useEffect(() => {
    const savedTab = localStorage.getItem('unienroll_active_tab');
    if (
      savedTab === 'catalog' ||
      savedTab === 'my_enrollments' ||
      savedTab === 'staff_console' ||
      savedTab === 'api_logs'
    ) {
      setActiveTab(savedTab);
    }
  }, []);

  const handleTabChange = (tab: 'catalog' | 'my_enrollments' | 'staff_console' | 'api_logs') => {
    setActiveTab(tab);
    localStorage.setItem('unienroll_active_tab', tab);
  };

  // Subscribe to API Logs for real-time inspector
  useEffect(() => {
    const unsubscribe = subscribeApiLogs((newLog) => {
      setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
    });
    return unsubscribe;
  }, []);

  // Fetch initial course catalog data
  const fetchData = useCallback(async () => {
    try {
      const [healthRes, sectionsRes] = await Promise.all([
        api.getHealth(),
        api.getSections(),
      ]);

      setApiOnline(healthRes.status === 200);
      if (sectionsRes.data) setSections(sectionsRes.data);
    } catch {
      setApiOnline(false);
      addToast('error', 'Connection Failed', 'Could not connect to Cloudflare Workers API');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch enrollments for the authenticated student
  const fetchStudentEnrollments = useCallback(async (studentId: number) => {
    const res = await api.getEnrollments(studentId);
    if (res.data) {
      setMyEnrollments(res.data);
    }
  }, []);

  // Fetch all enrollments for staff management console
  const fetchAllEnrollments = useCallback(async () => {
    const res = await api.getEnrollments();
    if (res.data) {
      setAllEnrollments(res.data);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      fetchAllEnrollments();
    }
  }, [isAuthenticated, fetchData, fetchAllEnrollments]);

  useEffect(() => {
    if (user) {
      fetchStudentEnrollments(user.id);
    }
  }, [user, fetchStudentEnrollments]);

  // Refresh sections list to update seats count
  const refreshSections = async () => {
    const res = await api.getSections();
    if (res.data) setSections(res.data);
  };

  // Action: Enroll in section
  const handleEnroll = async (section: Section) => {
    if (!user) {
      addToast('error', 'Authentication Required', 'Please sign in to register for classes.');
      router.push('/login');
      return;
    }

    setIsEnrollingId(section.id);
    const res = await api.createEnrollment(section.id);
    setIsEnrollingId(null);

    if (res.success && res.data) {
      addToast(
        'success',
        'Registration Successful',
        `Successfully enrolled in ${section.course_code} ${section.section_number}`
      );
      await Promise.all([fetchStudentEnrollments(user.id), fetchAllEnrollments(), refreshSections()]);
    } else {
      const errorCode =
        res.error_code ||
        (res.status === 409
          ? 'ERR_DUPLICATE_ENROLLMENT'
          : res.status === 422
          ? 'ERR_CAPACITY_FULL'
          : 'ERR_ENROLLMENT_FAILED');
      addToast('error', 'Enrollment Failed', res.error || 'Failed to complete registration', errorCode);
    }
  };

  // Action: Drop section
  const handleDrop = async (enrollment: Enrollment) => {
    if (!user) return;

    setIsDroppingId(enrollment.id);
    const res = await api.deleteEnrollment(enrollment.id);
    setIsDroppingId(null);

    if (res.success) {
      addToast(
        'info',
        'Course Dropped',
        `Dropped ${enrollment.course_code} ${enrollment.section_number} - 1 seat returned to section.`
      );
      await Promise.all([fetchStudentEnrollments(user.id), fetchAllEnrollments(), refreshSections()]);
    } else {
      addToast('error', 'Drop Failed', res.error || 'Could not drop course');
    }
  };

  // Action: Withdraw from section (Grade W)
  const handleWithdraw = async (enrollment: Enrollment, reason?: string) => {
    if (!user) return;

    const res = await api.withdrawEnrollment(enrollment.id, reason);
    if (res.success) {
      addToast(
        'info',
        'Course Withdrawn',
        `Withdrawn from ${enrollment.course_code} ${enrollment.section_number} - Grade 'W' officially recorded.`
      );
      await Promise.all([fetchStudentEnrollments(user.id), fetchAllEnrollments(), refreshSections()]);
    } else {
      const errCode = res.error_code || 'ERR_WITHDRAWAL_FAILED';
      addToast('error', 'Withdrawal Failed', res.error || 'Could not withdraw from course', errCode);
    }
  };

  // Action: Swap section
  const handleSwap = async (oldEnrollmentId: number, newSectionId: number) => {
    if (!user) return;

    setIsSwapping(true);
    const res = await api.swapSection(oldEnrollmentId, newSectionId);
    setIsSwapping(false);

    if (res.success) {
      addToast('success', 'Section Swapped', 'Section updated on Cloudflare D1.');
      await Promise.all([fetchStudentEnrollments(user.id), fetchAllEnrollments(), refreshSections()]);
    } else {
      const errorCode = res.error_code || (res.status === 422 ? 'ERR_CAPACITY_FULL' : 'ERR_SWAP_FAILED');
      addToast('error', 'Swap Failed', res.error || 'Could not swap section', errorCode);
    }
  };

  // Action: Seed / Reset Database
  const handleSeedDb = async () => {
    setIsSeeding(true);
    const res = await api.seedDatabase();
    setIsSeeding(false);

    if (res.success) {
      addToast('success', 'Data Restored', 'D1 database restored with fresh demo dataset.');
      if (user) {
        await Promise.all([fetchData(), fetchAllEnrollments(), fetchStudentEnrollments(user.id)]);
      } else {
        await fetchData();
      }
    } else {
      addToast('error', 'Reset Failed', res.error || 'Could not seed database');
    }
  };

  if (authLoading || (isLoading && isAuthenticated)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 space-y-3">
        <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
        <div className="text-center">
          <h3 className="font-semibold text-sm text-slate-800">Connecting to UniEnroll Platform...</h3>
          <p className="text-xs text-slate-400 mt-0.5">Verifying authentication & loading course data</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const activeEnrolledCount = myEnrollments.filter(
    (e) => e.status === 'ENROLLED' || e.status === 'OVERRIDDEN'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Navbar */}
      <Navbar
        currentUser={user}
        onLogout={logout}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        enrolledCount={activeEnrolledCount}
        apiOnline={apiOnline}
        onSeedDb={handleSeedDb}
        isSeeding={isSeeding}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'catalog' && (
          <CourseCatalog
            sections={sections}
            selectedStudent={currentStudent}
            myEnrollments={myEnrollments}
            onEnroll={handleEnroll}
            isEnrollingId={isEnrollingId}
          />
        )}

        {activeTab === 'my_enrollments' && (
          <MyEnrollments
            enrollments={myEnrollments}
            selectedStudent={currentStudent}
            allSections={sections}
            onDrop={handleDrop}
            onSwap={handleSwap}
            onWithdraw={handleWithdraw}
            onNavigateCatalog={() => handleTabChange('catalog')}
            isDroppingId={isDroppingId}
            isSwapping={isSwapping}
          />
        )}

        {activeTab === 'staff_console' && (
          <StaffConsole
            currentUser={user}
            allSections={sections}
            allEnrollments={allEnrollments}
            onRefresh={async () => {
              await Promise.all([
                refreshSections(),
                fetchAllEnrollments(),
                user ? fetchStudentEnrollments(user.id) : Promise.resolve(),
              ]);
            }}
            onDrop={handleDrop}
            onWithdraw={handleWithdraw}
            addToast={addToast}
          />
        )}

        {activeTab === 'api_logs' && (
          <ApiInspector logs={logs} onClearLogs={() => setLogs([])} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>UniEnroll • PRD Team 03 • Cloudflare Workers + Hono JWT + TypeScript + D1</p>
      </footer>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
