'use client';

import React, { useState } from 'react';
import { Section, Student, Enrollment, StudentIdentityStatus } from '../types';
import { Search, Clock, MapPin, Users, Check, AlertTriangle, BookOpen, RefreshCw, ShieldCheck } from 'lucide-react';

interface CourseCatalogProps {
  sections: Section[];
  selectedStudent: Student | null;
  myEnrollments: Enrollment[];
  onEnroll: (section: Section) => Promise<void>;
  isEnrollingId: number | null;
  identityStatus: StudentIdentityStatus | null;
  identityLoading: boolean;
  identityError: string | null;
  identityRequired: boolean;
  onRefreshIdentity: () => Promise<void>;
}

export const CourseCatalog: React.FC<CourseCatalogProps> = ({
  sections,
  selectedStudent,
  myEnrollments,
  onEnroll,
  isEnrollingId,
  identityStatus,
  identityLoading,
  identityError,
  identityRequired,
  onRefreshIdentity,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // Filter sections
  const filteredSections = sections.filter((sec) => {
    const matchesSearch =
      sec.course_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.course_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.section_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sec.room && sec.room.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesAvailable = !onlyAvailable || sec.available_seats > 0;

    return matchesSearch && matchesAvailable;
  });

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Course Catalog
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Semester 2026/1 • Real-time seat availability backed by Cloudflare D1
          </p>
        </div>

        {selectedStudent && (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
              {selectedStudent.student_code.slice(-2)}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">{selectedStudent.full_name}</p>
              <p className="text-[11px] text-slate-500 font-mono">ID: {selectedStudent.student_code}</p>
            </div>
          </div>
        )}
      </div>

      {identityRequired && (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border px-5 py-4 shadow-sm ${
          identityStatus?.can_enroll
            ? 'bg-emerald-50 border-emerald-200'
            : identityError
            ? 'bg-rose-50 border-rose-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              identityStatus?.can_enroll ? 'bg-emerald-100 text-emerald-700' : 'bg-white/70 text-slate-600'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Student Identity • Team 01</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {identityLoading
                  ? 'Checking your identity and profile consent...'
                  : identityStatus?.can_enroll
                  ? `Verified as ${identityStatus.name}. Profile is complete and ready for enrollment.`
                  : identityStatus
                  ? `Identity check incomplete${identityStatus.missing_fields.length > 0 ? `: ${identityStatus.missing_fields.join(', ')}` : '.'}`
                  : identityError || 'Identity verification is required before enrollment.'}
              </p>
              {identityStatus && (
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  Student ID {identityStatus.student_id} • {identityStatus.duration_ms} ms
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onRefreshIdentity}
            disabled={identityLoading}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${identityLoading ? 'animate-spin' : ''}`} />
            {identityLoading ? 'Checking...' : 'Check Again'}
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by course code, title, room (e.g. CS202, Data Structures)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 shadow-sm transition-colors"
          />
        </div>

        <label className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-600 cursor-pointer shadow-sm hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
          />
          <span>Open Seats Only</span>
        </label>
      </div>

      {/* Sections Grid */}
      {filteredSections.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-700">No matching sections found</h3>
          <p className="text-xs text-slate-400 mt-0.5">Try searching with another keyword.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSections.map((sec) => {
            const isEnrolled = myEnrollments.some(
              (e) => e.section_id === sec.id && e.status === 'ENROLLED'
            );
            const isFull = sec.enrolled_count >= sec.max_capacity;
            const occupancyPercent = Math.min(100, Math.round((sec.enrolled_count / sec.max_capacity) * 100));
            const identityBlocked = identityRequired && !identityStatus?.can_enroll;

            return (
              <div
                key={sec.id}
                className={`rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between shadow-sm bg-white ${
                  isEnrolled
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-slate-100 text-slate-800 border border-slate-200">
                        {sec.course_code}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                        {sec.section_number}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-100">
                        {sec.credits} Credits
                      </span>
                    </div>

                    {isEnrolled ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check className="w-3 h-3" />
                        Enrolled
                      </span>
                    ) : isFull ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertTriangle className="w-3 h-3" />
                        Full (2/2)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        Open
                      </span>
                    )}
                  </div>

                  {/* Course Title */}
                  <h3 className="font-bold text-sm text-slate-900 leading-snug mb-3">
                    {sec.course_title}
                  </h3>

                  {/* Schedule & Location */}
                  <div className="space-y-1 text-xs text-slate-500 mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{sec.schedule}</span>
                    </div>
                    {sec.room && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>Room: {sec.room}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  {/* Seat Availability Progress Bar */}
                  <div className="pt-3 border-t border-slate-100 mb-4">
                    <div className="flex items-center justify-between text-[11px] font-medium mb-1.5">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" />
                        Capacity
                      </span>
                      <span className={isFull ? 'text-rose-600 font-semibold' : 'text-slate-700'}>
                        {sec.enrolled_count} / {sec.max_capacity} Seats ({sec.available_seats} left)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isFull
                            ? 'bg-rose-500'
                            : occupancyPercent > 80
                            ? 'bg-amber-500'
                            : 'bg-slate-800'
                        }`}
                        style={{ width: `${occupancyPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => onEnroll(sec)}
                    disabled={isEnrollingId === sec.id || isEnrolled || identityBlocked}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm ${
                      isEnrolled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                        : identityBlocked
                        ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed'
                        : isFull
                        ? 'bg-slate-100 hover:bg-slate-200 text-rose-700 border border-rose-200'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isEnrollingId === sec.id ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Enrolling...</span>
                      </>
                    ) : isEnrolled ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Registered</span>
                      </>
                    ) : identityBlocked ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Verify Identity to Register</span>
                      </>
                    ) : isFull ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Section Full (Test 422)</span>
                      </>
                    ) : (
                      <span>Register Section</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
