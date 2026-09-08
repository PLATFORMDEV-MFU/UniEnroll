'use client';

import React from 'react';
import { Student } from '../types';
import { GraduationCap, User, RotateCcw, BookOpen, Calendar, Terminal } from 'lucide-react';

interface NavbarProps {
  students: Student[];
  selectedStudent: Student | null;
  onSelectStudent: (student: Student) => void;
  activeTab: 'catalog' | 'my_enrollments' | 'api_logs';
  onTabChange: (tab: 'catalog' | 'my_enrollments' | 'api_logs') => void;
  enrolledCount: number;
  apiOnline: boolean;
  onSeedDb: () => void;
  isSeeding: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  students,
  selectedStudent,
  onSelectStudent,
  activeTab,
  onTabChange,
  enrolledCount,
  apiOnline,
  onSeedDb,
  isSeeding,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900 tracking-tight">UniEnroll</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  Cloudflare D1
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => onTabChange('catalog')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'catalog'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Course Catalog
            </button>

            <button
              onClick={() => onTabChange('my_enrollments')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'my_enrollments'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              My Schedule
              {enrolledCount > 0 && (
                <span className="ml-0.5 bg-slate-900 text-white font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                  {enrolledCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange('api_logs')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'api_logs'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              API Logs
            </button>
          </nav>

          {/* Controls: Student Switcher + Status + Seed DB */}
          <div className="flex items-center gap-2.5">
            {/* Status Dot */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className={`w-2 h-2 rounded-full ${apiOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-[11px] font-medium text-slate-600">Online</span>
            </div>

            {/* Active Student Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <select
                aria-label="Select active student"
                value={selectedStudent?.id || ''}
                onChange={(e) => {
                  const student = students.find((s) => s.id === Number(e.target.value));
                  if (student) onSelectStudent(student);
                }}
                className="bg-transparent text-xs text-slate-800 font-medium focus:outline-none cursor-pointer pr-1"
              >
                {students.map((st) => (
                  <option key={st.id} value={st.id} className="bg-white text-slate-800">
                    {st.student_code} - {st.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset / Seed Database Button */}
            <button
              onClick={onSeedDb}
              disabled={isSeeding}
              title="Reset sample data in Cloudflare D1"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin text-slate-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">{isSeeding ? 'Resetting...' : 'Reset Data'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-100">
          <button
            onClick={() => onTabChange('catalog')}
            className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg ${
              activeTab === 'catalog' ? 'bg-slate-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Catalog
          </button>
          <button
            onClick={() => onTabChange('my_enrollments')}
            className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg ${
              activeTab === 'my_enrollments' ? 'bg-slate-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Schedule ({enrolledCount})
          </button>
          <button
            onClick={() => onTabChange('api_logs')}
            className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg ${
              activeTab === 'api_logs' ? 'bg-slate-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Logs
          </button>
        </div>
      </div>
    </header>
  );
};
