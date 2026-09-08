'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Course, Section, Student, Enrollment, ApiLog } from '../types';
import { api, subscribeApiLogs } from '../lib/api';
import { Navbar } from '../components/Navbar';
import { CourseCatalog } from '../components/CourseCatalog';
import { MyEnrollments } from '../components/MyEnrollments';
import { ApiInspector } from '../components/ApiInspector';
import { ToastContainer, ToastMessage } from '../components/Toast';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<Enrollment[]>([]);
  const [activeTab, setActiveTab] = useState<'catalog' | 'my_enrollments' | 'api_logs'>('catalog');

  const [isLoading, setIsLoading] = useState(true);
  const [isEnrollingId, setIsEnrollingId] = useState<number | null>(null);
  const [isDroppingId, setIsDroppingId] = useState<number | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [apiOnline, setApiOnline] = useState(true);

  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  // Subscribe to API Logs for real-time inspector
  useEffect(() => {
    const unsubscribe = subscribeApiLogs((newLog) => {
      setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
    });
    return unsubscribe;
  }, []);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const [healthRes, studentsRes, coursesRes, sectionsRes] = await Promise.all([
        api.getHealth(),
        api.getStudents(),
        api.getCourses(),
        api.getSections(),
      ]);

      setApiOnline(healthRes.status === 200);

      if (studentsRes.data && studentsRes.data.length > 0) {
        setStudents(studentsRes.data);
        if (!selectedStudent) {
          setSelectedStudent(studentsRes.data[0]);
        }
      }

      if (coursesRes.data) setCourses(coursesRes.data);
      if (sectionsRes.data) setSections(sectionsRes.data);
    } catch (err: any) {
      setApiOnline(false);
      addToast('error', 'Connection Failed', 'Could not connect to Cloudflare Workers API');
    } finally {
      setIsLoading(false);
    }
  }, [selectedStudent]);

  // Fetch enrollments for selected student
  const fetchStudentEnrollments = useCallback(async (studentId: number) => {
    const res = await api.getEnrollments(studentId);
    if (res.data) {
      setMyEnrollments(res.data);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentEnrollments(selectedStudent.id);
    }
  }, [selectedStudent, fetchStudentEnrollments]);

  // Refresh sections list to update seats count
  const refreshSections = async () => {
    const res = await api.getSections();
    if (res.data) setSections(res.data);
  };

  // Action: Enroll in section
  const handleEnroll = async (section: Section) => {
    if (!selectedStudent) {
      addToast('error', 'No Student Selected', 'Please select a student profile from the top bar first.');
      return;
    }

    setIsEnrollingId(section.id);
    const res = await api.createEnrollment(selectedStudent.id, section.id);
    setIsEnrollingId(null);

    if (res.success && res.data) {
      addToast(
        'success',
        'Registration Successful',
        `Successfully enrolled in ${section.course_code} ${section.section_number}`
      );
      await Promise.all([fetchStudentEnrollments(selectedStudent.id), refreshSections()]);
    } else {
      const errorCode = res.error_code || (res.status === 409 ? 'ERR_DUPLICATE_ENROLLMENT' : res.status === 422 ? 'ERR_CAPACITY_FULL' : 'ERR_ENROLLMENT_FAILED');
      addToast(
        'error',
        'Enrollment Failed',
        res.error || 'Failed to complete registration',
        errorCode
      );
    }
  };

  // Action: Drop section
  const handleDrop = async (enrollment: Enrollment) => {
    if (!selectedStudent) return;

    setIsDroppingId(enrollment.id);
    const res = await api.deleteEnrollment(enrollment.id);
    setIsDroppingId(null);

    if (res.success) {
      addToast(
        'info',
        'Course Dropped',
        `Dropped ${enrollment.course_code} ${enrollment.section_number} - 1 seat returned to section.`
      );
      await Promise.all([fetchStudentEnrollments(selectedStudent.id), refreshSections()]);
    } else {
      addToast('error', 'Drop Failed', res.error || 'Could not drop course');
    }
  };

  // Action: Swap section (PATCH)
  const handleSwap = async (enrollmentId: number, targetSectionId: number) => {
    if (!selectedStudent) return;

    setIsSwapping(true);
    const res = await api.updateEnrollment(enrollmentId, { section_id: targetSectionId });
    setIsSwapping(false);

    if (res.success) {
      addToast('success', 'Section Swapped', 'Section updated on Cloudflare D1.');
      await Promise.all([fetchStudentEnrollments(selectedStudent.id), refreshSections()]);
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
      if (selectedStudent) {
        await Promise.all([fetchData(), fetchStudentEnrollments(selectedStudent.id)]);
      } else {
        await fetchData();
      }
    } else {
      addToast('error', 'Reset Failed', res.error || 'Could not seed database');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 space-y-3">
        <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
        <div className="text-center">
          <h3 className="font-semibold text-sm text-slate-800">Connecting to Cloudflare Workers...</h3>
          <p className="text-xs text-slate-400 mt-0.5">Loading course data</p>
        </div>
      </div>
    );
  }

  const activeEnrolledCount = myEnrollments.filter((e) => e.status === 'ENROLLED').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Navbar */}
      <Navbar
        students={students}
        selectedStudent={selectedStudent}
        onSelectStudent={setSelectedStudent}
        activeTab={activeTab}
        onTabChange={setActiveTab}
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
            selectedStudent={selectedStudent}
            myEnrollments={myEnrollments}
            onEnroll={handleEnroll}
            isEnrollingId={isEnrollingId}
          />
        )}

        {activeTab === 'my_enrollments' && (
          <MyEnrollments
            enrollments={myEnrollments}
            selectedStudent={selectedStudent}
            allSections={sections}
            onDrop={handleDrop}
            onSwap={handleSwap}
            onNavigateCatalog={() => setActiveTab('catalog')}
            isDroppingId={isDroppingId}
            isSwapping={isSwapping}
          />
        )}

        {activeTab === 'api_logs' && (
          <ApiInspector logs={logs} onClearLogs={() => setLogs([])} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>UniEnroll • Assignment 2 • Cloudflare Workers + Hono + TypeScript + D1</p>
      </footer>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
