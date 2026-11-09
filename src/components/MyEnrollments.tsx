'use client';

import React, { useState } from 'react';
import { Enrollment, Section, Student } from '../types';
import { SwapSectionModal } from './SwapSectionModal';
import { Clock, MapPin, Trash2, ArrowRightLeft, BookOpen, PlusCircle, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';

interface MyEnrollmentsProps {
  enrollments: Enrollment[];
  selectedStudent: Student | null;
  allSections: Section[];
  onDrop: (enrollment: Enrollment) => Promise<void>;
  onSwap: (enrollmentId: number, targetSectionId: number) => Promise<void>;
  onWithdraw?: (enrollment: Enrollment, reason?: string) => Promise<void>;
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
  onWithdraw,
  onNavigateCatalog,
  isDroppingId,
  isSwapping,
}) => {
  const [swapModalEnrollment, setSwapModalEnrollment] = useState<Enrollment | null>(null);
  const [withdrawModalEnrollment, setWithdrawModalEnrollment] = useState<Enrollment | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('Personal schedule conflict');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const activeEnrollments = enrollments.filter((e) => e.status === 'ENROLLED' || e.status === 'OVERRIDDEN');
  const withdrawnEnrollments = enrollments.filter((e) => e.status === 'WITHDRAWN');
  const droppedEnrollments = enrollments.filter((e) => e.status === 'DROPPED');

  const totalCredits = activeEnrollments.reduce((sum, e) => sum + (e.credits || 3), 0);
  const maxCredits = 22;
  const minCredits = 9;
  const creditPercent = Math.min(100, Math.round((totalCredits / maxCredits) * 100));

  const handleConfirmWithdraw = async () => {
    if (!withdrawModalEnrollment || !onWithdraw) return;
    setIsWithdrawing(true);
    await onWithdraw(withdrawModalEnrollment, withdrawReason);
    setIsWithdrawing(false);
    setWithdrawModalEnrollment(null);
  };

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

        {/* Credit Hours Summary Card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Total Credits
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  totalCredits < minCredits
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : totalCredits > maxCredits
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {totalCredits < minCredits ? 'Under Min' : totalCredits > maxCredits ? 'Over Max' : 'Normal Load'}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-slate-900">{totalCredits}</span>
              <span className="text-xs text-slate-400">/ {maxCredits} max</span>
            </div>
          </div>

          <div className="mt-4">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  totalCredits < minCredits
                    ? 'bg-amber-500'
                    : totalCredits > maxCredits
                    ? 'bg-rose-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${creditPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Min: {minCredits}</span>
              <span>Max: {maxCredits}</span>
            </div>
          </div>
        </div>

        {/* Enrollment Status Stat */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Enrolled Courses
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-900">{activeEnrollments.length}</span>
              <span className="text-xs text-slate-400">Sections Confirmed</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Add/Drop Period:</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
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
                    <div className="flex items-center gap-1.5 flex-wrap">
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

                    {enr.status === 'OVERRIDDEN' ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        Staff Override
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Confirmed
                      </span>
                    )}
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

                {/* Actions: Swap Section, Drop, Withdraw (W) */}
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => setSwapModalEnrollment(enr)}
                    disabled={isSwapping || isDroppingId === enr.id}
                    className="flex-1 py-2 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                    <span>Swap</span>
                  </button>

                  {onWithdraw && (
                    <button
                      onClick={() => setWithdrawModalEnrollment(enr)}
                      disabled={isDroppingId === enr.id || isSwapping}
                      className="py-2 px-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-700 text-xs font-semibold flex items-center justify-center gap-1.5 border border-amber-200 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                      title="Post-deadline withdrawal (Records 'W' grade)"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-600" />
                      <span>Withdraw (W)</span>
                    </button>
                  )}

                  <button
                    onClick={() => onDrop(enr)}
                    disabled={isDroppingId === enr.id || isSwapping}
                    className="py-2 px-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold flex items-center justify-center gap-1.5 border border-rose-200 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
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

      {/* Withdrawn Courses (Grade W) */}
      {withdrawnEnrollments.length > 0 && (
        <div className="pt-4 border-t border-slate-200 space-y-2">
          <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Withdrawn Courses ({withdrawnEnrollments.length}) • Grade &apos;W&apos; Recorded</span>
          </h4>
          <div className="space-y-1.5">
            {withdrawnEnrollments.map((w) => (
              <div
                key={w.id}
                className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-800">{w.course_code}</span>
                  <span className="font-medium text-slate-700">{w.course_title}</span>
                  <span className="text-slate-400">({w.section_number})</span>
                  {w.withdrawal_reason && (
                    <span className="text-amber-800 italic text-[11px] block sm:inline">
                      — &ldquo;{w.withdrawal_reason}&rdquo;
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    GRADE: W
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(w.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Course Withdrawal Modal */}
      {withdrawModalEnrollment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Withdraw from Course</h3>
                <p className="text-xs text-slate-500">POST /enrollments/:id/withdraw</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to withdraw from{' '}
              <span className="font-bold text-slate-900 font-mono">
                {withdrawModalEnrollment.course_code} ({withdrawModalEnrollment.section_number})
              </span>
              ? A grade of <span className="font-bold text-amber-700 font-mono">W</span> will be officially recorded on your academic transcript.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Withdrawal
              </label>
              <input
                type="text"
                required
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="State your reason..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-400 focus:bg-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWithdrawModalEnrollment(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdraw}
                disabled={isWithdrawing}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isWithdrawing ? 'Withdrawing...' : 'Confirm Withdrawal (Grade W)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
