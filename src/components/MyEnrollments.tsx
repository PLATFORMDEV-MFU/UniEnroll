'use client';

import React, { useState } from 'react';
import { Enrollment, Section, Student } from '../types';
import { SwapSectionModal } from './SwapSectionModal';
import { Clock, MapPin, Trash2, ArrowRightLeft, BookOpen, PlusCircle } from 'lucide-react';

interface MyEnrollmentsProps {
  enrollments: Enrollment[];
  selectedStudent: Student | null;
  allSections: Section[];
  onDrop: (enrollment: Enrollment) => Promise<void>;
  onSwap: (enrollmentId: number, targetSectionId: number) => Promise<void>;
  onNavigateCatalog: () => void;
  isDroppingId: number | null;
  isSwapping: boolean;
}

export const MyEnrollments: React.FC<MyEnrollmentsProps> = ({
  enrollments,
  selectedStudent,
  allSections,
  onDrop,
  onSwap,
  onNavigateCatalog,
  isDroppingId,
  isSwapping,
}) => {
  const [swapModalEnrollment, setSwapModalEnrollment] = useState<Enrollment | null>(null);

  const activeEnrollments = enrollments.filter((e) => e.status === 'ENROLLED');
  const droppedEnrollments = enrollments.filter((e) => e.status === 'DROPPED');

  const totalCredits = activeEnrollments.reduce((sum, e) => sum + (e.credits || 3), 0);
  const maxCredits = 22;
  const minCredits = 9;
  const creditPercent = Math.min(100, Math.round((totalCredits / maxCredits) * 100));

  return (
    <div className="space-y-6">
      {/* Overview & Credits Bento Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Student Profile Card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Student Profile
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              {selectedStudent ? selectedStudent.full_name : 'No Student Selected'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ID: <span className="font-mono font-medium text-slate-700">{selectedStudent?.student_code}</span> • {selectedStudent?.major}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Academic Term:</span>
            <span className="font-semibold text-slate-800">2026/1</span>
          </div>
        </div>

        {/* Registered Credits Card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Semester Credit Load
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">{totalCredits}</span>
              <span className="text-xs text-slate-500">/ {maxCredits} Credits (Max)</span>
            </div>
          </div>

          <div className="space-y-1.5 mt-3">
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  totalCredits > maxCredits
                    ? 'bg-rose-500'
                    : totalCredits >= minCredits
                    ? 'bg-slate-800'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${creditPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Min: {minCredits} cr</span>
              <span>
                {totalCredits >= minCredits ? 'Full-Time Status' : 'Under Minimum Load'}
              </span>
            </div>
          </div>
        </div>

        {/* Enrollment Summary Card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Enrolled Courses
          </span>
          <div className="flex items-center justify-between my-2">
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeEnrollments.length}</p>
              <p className="text-xs text-slate-500">Active Sections</p>
            </div>
            <div>
              <p className="text-xl font-semibold text-slate-400">{droppedEnrollments.length}</p>
              <p className="text-xs text-slate-400">Dropped</p>
            </div>
          </div>
          <button
            onClick={onNavigateCatalog}
            className="w-full mt-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add More Courses</span>
          </button>
        </div>
      </div>

      {/* Active Enrollments List */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-slate-900">
          Enrolled Sections ({activeEnrollments.length})
        </h3>

        {activeEnrollments.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-700">No active course enrollments</h4>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">
              Browse the course catalog to register for available classes.
            </p>
            <button
              onClick={onNavigateCatalog}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              Browse Catalog
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeEnrollments.map((enr) => (
              <div
                key={enr.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-all"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-slate-100 text-slate-800 border border-slate-200">
                        {enr.course_code}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                        {enr.section_number}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-100">
                        {enr.credits} Credits
                      </span>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Confirmed
                    </span>
                  </div>

                  {/* Course Title */}
                  <h4 className="font-bold text-sm text-slate-900 mb-2">{enr.course_title}</h4>

                  {/* Schedule Details */}
                  <div className="space-y-1 text-xs text-slate-500 mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{enr.schedule}</span>
                    </div>
                    {enr.room && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>Room: {enr.room}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions: Swap Section & Drop Section */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => setSwapModalEnrollment(enr)}
                    disabled={isSwapping || isDroppingId === enr.id}
                    className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200 shadow-sm transition-colors disabled:opacity-50"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                    <span>Swap Section</span>
                  </button>

                  <button
                    onClick={() => onDrop(enr)}
                    disabled={isDroppingId === enr.id || isSwapping}
                    className="py-2 px-3 rounded-xl bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold flex items-center justify-center gap-1.5 border border-rose-200 shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isDroppingId === enr.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-rose-400/30 border-t-rose-600 rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    )}
                    <span>Drop</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dropped Courses History */}
      {droppedEnrollments.length > 0 && (
        <div className="pt-4 border-t border-slate-200 space-y-2">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Dropped History ({droppedEnrollments.length})
          </h4>
          <div className="space-y-1.5">
            {droppedEnrollments.map((dr) => (
              <div
                key={dr.id}
                className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs text-slate-500 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-slate-700">{dr.course_code}</span>
                  <span>{dr.course_title}</span>
                  <span className="text-slate-400">({dr.section_number})</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
                  DROPPED
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section Swap Modal */}
      <SwapSectionModal
        isOpen={!!swapModalEnrollment}
        enrollment={swapModalEnrollment}
        allSections={allSections}
        onClose={() => setSwapModalEnrollment(null)}
        onConfirmSwap={async (enrollmentId, targetSectionId) => {
          await onSwap(enrollmentId, targetSectionId);
          setSwapModalEnrollment(null);
        }}
        isSwapping={isSwapping}
      />
    </div>
  );
};
