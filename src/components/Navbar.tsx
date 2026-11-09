'use client';

import React from 'react';
import { AuthUser } from '../types';
import { GraduationCap, RotateCcw, BookOpen, Calendar, Terminal, LogOut, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  currentUser: AuthUser | null;
  onLogout: () => void;
  activeTab: 'catalog' | 'my_enrollments' | 'staff_console' | 'api_logs';
  onTabChange: (tab: 'catalog' | 'my_enrollments' | 'staff_console' | 'api_logs') => void;
  enrolledCount: number;
  apiOnline: boolean;
  onSeedDb: () => void;
  isSeeding: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  activeTab,
  onTabChange,
  enrolledCount,
  apiOnline,
  onSeedDb,
  isSeeding,
}) => {
  const isStaff = currentUser?.role === 'STAFF';

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
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
              onClick={() => onTabChange('staff_console')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'staff_console'
                  ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                  : isStaff
                  ? 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Staff Console</span>
              {isStaff && (
                <span className="ml-0.5 bg-indigo-200 text-indigo-900 font-bold px-1.5 py-0.2 rounded-full text-[9px] uppercase">
                  Staff
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange('api_logs')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'api_logs'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              API Logs
            </button>
          </nav>

          {/* Controls: User Profile + Status + Seed DB + Logout */}
          <div className="flex items-center gap-2.5">
            {/* Status Dot */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className={`w-2 h-2 rounded-full ${apiOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-[11px] font-medium text-slate-600">Online</span>
            </div>

            {/* Authenticated Student/Staff Info */}
            {currentUser && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                    isStaff ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {isStaff ? 'ST' : currentUser.student_code.slice(-2)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[130px]">
                    {currentUser.full_name}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono leading-none flex items-center gap-1">
                    <span>{currentUser.student_code}</span>
                    {isStaff && <span className="text-indigo-600 font-bold">• STAFF</span>}
                  </p>
                </div>
              </div>
            )}

            {/* Reset / Seed Database Button */}
            <button
              onClick={onSeedDb}
              disabled={isSeeding}
              title="Reset sample data in Cloudflare D1"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin text-slate-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">{isSeeding ? 'Resetting...' : 'Reset'}</span>
            </button>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              title="Sign Out"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 shadow-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-100">
          <button
            onClick={() => onTabChange('catalog')}
            className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg ${
              activeTab === 'catalog' ? 'bg-slate-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Catalog
          </button>
          <button
            onClick={() => onTabChange('my_enrollments')}
            className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg ${
              activeTab === 'my_enrollments' ? 'bg-slate-900 text-white font-medium' : 'text-slate-600'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Schedule
          </button>
          <button
            onClick={() => onTabChange('staff_console')}
            className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg ${
              activeTab === 'staff_console' ? 'bg-indigo-600 text-white font-medium' : 'text-indigo-600'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Staff
          </button>
          <button
            onClick={() => onTabChange('api_logs')}
            className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg ${
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
