'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Section, Enrollment, Override, AuthUser } from '../types';
import { api } from '../lib/api';
import {
  ShieldAlert,
  ShieldCheck,
  PlusCircle,
  FileText,
  Clock,
  Search,
  CheckCircle2,
  Users,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface StaffConsoleProps {
  currentUser: AuthUser | null;
  allSections: Section[];
  allEnrollments: Enrollment[];
  onRefresh: () => Promise<void>;
  onDrop: (enrollment: Enrollment) => Promise<void>;
  onWithdraw: (enrollment: Enrollment, reason?: string) => Promise<void>;
  addToast: (type: 'success' | 'error' | 'info', title: string, message: string, code?: string) => void;
}

export const StaffConsole: React.FC<StaffConsoleProps> = ({
  currentUser,
  allSections,
  allEnrollments,
  onRefresh,
  onDrop,
  onWithdraw,
  addToast,
}) => {
  const isStaff = currentUser?.role === 'STAFF';

  // Overrides list state
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(true);

  // Grant Override form state
  const [targetStudentCode, setTargetStudentCode] = useState('65010042');
  const [targetSectionId, setTargetSectionId] = useState<number | ''>('');
  const [overrideType, setOverrideType] = useState<'CAPACITY' | 'PREREQUISITE' | 'LATE_ADD' | 'SPECIAL_PERMISSION'>('CAPACITY');
  const [overrideReason, setOverrideReason] = useState('Dean authorized section capacity exception');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENROLLED' | 'OVERRIDDEN' | 'WITHDRAWN' | 'DROPPED'>('ALL');

  // Withdraw Modal State
  const [withdrawModalEnrollment, setWithdrawModalEnrollment] = useState<Enrollment | null>(null);
  const [withdrawalReasonInput, setWithdrawalReasonInput] = useState('Registrar approved academic withdrawal');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const fetchOverrides = useCallback(async () => {
    setLoadingOverrides(true);
    const res = await api.getOverrides();
    if (res.data) {
      setOverrides(res.data);
    }
    setLoadingOverrides(false);
  }, []);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  // Set default section if not chosen
  useEffect(() => {
    if (allSections.length > 0 && targetSectionId === '') {
      // Find full section first for convenient capacity override demo
      const fullSection = allSections.find((s) => s.enrolled_count >= s.max_capacity);
      setTargetSectionId(fullSection ? fullSection.id : allSections[0].id);
    }
  }, [allSections, targetSectionId]);

  const handleGrantOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSectionId || !targetStudentCode.trim() || !overrideReason.trim()) {
      addToast('error', 'Validation Error', 'Please complete all override fields.');
      return;
    }

    setIsSubmitting(true);
    const res = await api.createOverride({
      student_code: targetStudentCode.trim(),
      section_id: Number(targetSectionId),
      override_type: overrideType,
      reason: overrideReason.trim(),
    });
    setIsSubmitting(false);

    if (res.success) {
      addToast(
        'success',
        'Staff Override Granted',
        `Authorized override for student ${targetStudentCode.trim()} (${overrideType})`
      );
      await Promise.all([fetchOverrides(), onRefresh()]);
    } else {
      const errCode = res.error_code || (res.status === 403 ? 'ERR_UNAUTHORIZED_OVERRIDE_AUTHORITY' : 'ERR_OVERRIDE_FAILED');
      addToast('error', 'Override Authorization Failed', res.error || 'Could not grant override', errCode);
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawModalEnrollment) return;

    setIsWithdrawing(true);
    await onWithdraw(withdrawModalEnrollment, withdrawalReasonInput);
    setIsWithdrawing(false);
    setWithdrawModalEnrollment(null);
    await Promise.all([fetchOverrides(), onRefresh()]);
  };

  // Filter enrollments
  const filteredEnrollments = allEnrollments.filter((enr) => {
    const matchesSearch =
      enr.student_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      enr.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      enr.course_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      enr.section_number.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || enr.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalEnrollments = allEnrollments.length;
  const activeCount = allEnrollments.filter((e) => e.status === 'ENROLLED' || e.status === 'OVERRIDDEN').length;
  const withdrawnCount = allEnrollments.filter((e) => e.status === 'WITHDRAWN').length;
  const overridesCount = overrides.length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              ROLE_STAFF Authorized Console
            </span>
            <span className="text-xs text-slate-400 font-mono">FR-07 Audit Trail</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Academic Registrar Staff Console</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Grant authorized section capacity waivers, execute prerequisite overrides, and process post-deadline course withdrawals with full audit logging.
          </p>
        </div>

        <button
          onClick={async () => {
            await Promise.all([fetchOverrides(), onRefresh()]);
            addToast('info', 'Refreshed', 'Staff console data synchronised.');
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-colors cursor-pointer self-start md:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Refresh Records</span>
        </button>
      </div>

      {!isStaff && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <span className="font-semibold">Notice:</span> You are currently signed in as a student (
            <span className="font-mono">{currentUser?.student_code}</span>). You can view the audit records, but executing overrides requires{' '}
            <span className="font-semibold font-mono">ROLE_STAFF</span> privileges (e.g. sign in as{' '}
            <span className="font-mono bg-amber-100 px-1 py-0.5 rounded">staff01</span>).
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Records</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalEnrollments}</p>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Across all semesters</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Students</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Currently seated</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Overrides Issued</span>
          <p className="text-2xl font-bold text-purple-600 mt-1">{overridesCount}</p>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Authorized exceptions</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Withdrawn Records</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">{withdrawnCount}</p>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Recorded with Grade W</span>
        </div>
      </div>

      {/* Main Grid: Grant Override Form & Override Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Grant Override Form */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">Grant Staff Override</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              POST /overrides • Bypasses section capacity or rules with audit logging
            </p>
          </div>

          <form onSubmit={handleGrantOverride} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Student Code / ID
              </label>
              <input
                type="text"
                required
                value={targetStudentCode}
                onChange={(e) => setTargetStudentCode(e.target.value)}
                placeholder="e.g. 65010042"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white"
              />
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {['65010042', '65010088', '66010123', '66010199'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTargetStudentCode(c)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      targetStudentCode === c
                        ? 'bg-indigo-100 text-indigo-700 font-bold'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Course Section
              </label>
              <select
                required
                value={targetSectionId}
                onChange={(e) => setTargetSectionId(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white"
              >
                {allSections.map((sec) => {
                  const isFull = sec.enrolled_count >= sec.max_capacity;
                  return (
                    <option key={sec.id} value={sec.id}>
                      {sec.course_code} - {sec.section_number} ({sec.enrolled_count}/{sec.max_capacity} seats){' '}
                      {isFull ? '⚠️ [FULL]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Override Type
              </label>
              <select
                value={overrideType}
                onChange={(e) => setOverrideType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white"
              >
                <option value="CAPACITY">CAPACITY (Full Section Seat Expansion)</option>
                <option value="PREREQUISITE">PREREQUISITE (Prerequisite Waiver)</option>
                <option value="LATE_ADD">LATE_ADD (Late Registration Exception)</option>
                <option value="SPECIAL_PERMISSION">SPECIAL_PERMISSION (Dean / Advisor Permission)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Authorization Reason / Justification
              </label>
              <textarea
                required
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="State reason for granting exception..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Authorizing Override...' : 'Execute Override Authorization'}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Override Audit Log */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-sm text-slate-900">Immutable Override Audit Log</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                History of authorized administrative exceptions and waivers
              </p>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md border border-purple-200">
              {overrides.length} Logged
            </span>
          </div>

          {loadingOverrides ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading override records...</div>
          ) : overrides.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No override records logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="pb-2.5">Time</th>
                    <th className="pb-2.5">Student</th>
                    <th className="pb-2.5">Course / Section</th>
                    <th className="pb-2.5">Type</th>
                    <th className="pb-2.5">Reason & Staff</th>
                    <th className="pb-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {overrides.map((ov) => (
                    <tr key={ov.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 pr-2 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(ov.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 pr-2 whitespace-nowrap">
                        <span className="font-mono font-semibold text-slate-800">{ov.student_code}</span>
                        <div className="text-[10px] text-slate-400 truncate max-w-[100px]">{ov.student_name}</div>
                      </td>
                      <td className="py-2.5 pr-2 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-800">{ov.course_code}</span>{' '}
                        <span className="text-slate-500">{ov.section_number}</span>
                      </td>
                      <td className="py-2.5 pr-2 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-50 text-purple-700 border border-purple-200">
                          {ov.override_type}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 max-w-[200px]">
                        <p className="truncate text-slate-700 font-medium">{ov.reason}</p>
                        <span className="text-[10px] text-slate-400 truncate block">
                          By: {ov.staff_name || 'Registrar Staff'}
                        </span>
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {ov.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* All Student Enrollments Table with Staff Management & Withdraw Action */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700" />
              <h3 className="font-bold text-sm text-slate-900">All Student Enrollment Records</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live course registration state across the university with administrative actions
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student or course..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white w-48"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-[11px]">
              {(['ALL', 'ENROLLED', 'OVERRIDDEN', 'WITHDRAWN', 'DROPPED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                    statusFilter === st ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredEnrollments.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No enrollment records match the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="pb-2.5">ID</th>
                  <th className="pb-2.5">Student</th>
                  <th className="pb-2.5">Course Section</th>
                  <th className="pb-2.5">Schedule</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5">Details</th>
                  <th className="pb-2.5 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {filteredEnrollments.map((enr) => {
                  const isActive = enr.status === 'ENROLLED' || enr.status === 'OVERRIDDEN';

                  return (
                    <tr key={enr.id} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-2 font-mono text-[11px] text-slate-400">#{enr.id}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900">{enr.student_code}</span>
                        <div className="text-[11px] text-slate-500">{enr.student_name}</div>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900 font-mono">{enr.course_code}</span>{' '}
                        <span className="text-slate-600 font-medium">{enr.section_number}</span>
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{enr.course_title}</div>
                      </td>
                      <td className="py-3 pr-3 text-slate-500 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{enr.schedule}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {enr.status === 'ENROLLED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ENROLLED
                          </span>
                        )}
                        {enr.status === 'OVERRIDDEN' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            OVERRIDDEN
                          </span>
                        )}
                        {enr.status === 'WITHDRAWN' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            WITHDRAWN (W)
                          </span>
                        )}
                        {enr.status === 'DROPPED' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            DROPPED
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[11px] max-w-[180px]">
                        {enr.withdrawal_reason ? (
                          <span className="text-amber-700 italic truncate block">Note: {enr.withdrawal_reason}</span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">
                            {new Date(enr.enrolled_at).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap space-x-1.5">
                        {isActive ? (
                          <>
                            <button
                              onClick={() => {
                                setWithdrawModalEnrollment(enr);
                                setWithdrawalReasonInput('Registrar staff authorized withdrawal with W grade');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Withdraw (W)
                            </button>
                            <button
                              onClick={() => onDrop(enr)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Drop
                            </button>
                          </>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">No active action</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Withdraw Modal Confirmation */}
      {withdrawModalEnrollment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Authorize Course Withdrawal</h3>
                <p className="text-xs text-slate-500">POST /enrollments/:id/withdraw (Records &apos;W&apos; Grade)</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
              <p>
                <span className="text-slate-500">Student:</span>{' '}
                <span className="font-bold font-mono text-slate-800">
                  {withdrawModalEnrollment.student_code} ({withdrawModalEnrollment.student_name})
                </span>
              </p>
              <p>
                <span className="text-slate-500">Course Section:</span>{' '}
                <span className="font-bold font-mono text-slate-800">
                  {withdrawModalEnrollment.course_code} - {withdrawModalEnrollment.section_number}
                </span>
              </p>
              <p className="text-[11px] text-amber-700 pt-1">
                ⚠️ Withdrawing from this course will record a permanent grade of &apos;W&apos; on the student&apos;s academic record and return 1 seat back to the section.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Withdrawal Reason / Justification
              </label>
              <input
                type="text"
                required
                value={withdrawalReasonInput}
                onChange={(e) => setWithdrawalReasonInput(e.target.value)}
                placeholder="Reason for late withdrawal..."
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
                <span>{isWithdrawing ? 'Processing Withdrawal...' : 'Confirm Withdrawal (Grade W)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
