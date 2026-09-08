'use client';

import React, { useState } from 'react';
import { Enrollment, Section } from '../types';
import { X, ArrowRightLeft, Clock, MapPin, AlertCircle } from 'lucide-react';

interface SwapSectionModalProps {
  enrollment: Enrollment | null;
  allSections: Section[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmSwap: (enrollmentId: number, targetSectionId: number) => Promise<void>;
  isSwapping: boolean;
}

export const SwapSectionModal: React.FC<SwapSectionModalProps> = ({
  enrollment,
  allSections,
  isOpen,
  onClose,
  onConfirmSwap,
  isSwapping,
}) => {
  const [selectedTargetSectionId, setSelectedTargetSectionId] = useState<number | null>(null);

  if (!isOpen || !enrollment) return null;

  // Filter sections available for swap (exclude current section)
  const availableTargetSections = allSections.filter(
    (s) => s.id !== enrollment.section_id
  );

  const selectedTargetSection = allSections.find((s) => s.id === selectedTargetSectionId);

  const handleSwap = () => {
    if (!selectedTargetSectionId) return;
    onConfirmSwap(enrollment.id, selectedTargetSectionId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Swap Course Section</h3>
              <p className="text-xs text-slate-500">Atomic section swap via PATCH /api/enrollments/:id</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Enrollment Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Current Section</span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">
              {enrollment.course_code} - {enrollment.section_number}
            </span>
            <span className="text-xs font-medium text-slate-600">{enrollment.credits} Credits</span>
          </div>
          <p className="text-xs text-slate-600">{enrollment.course_title}</p>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
            <span>{enrollment.schedule}</span>
            {enrollment.room && <span>• Room: {enrollment.room}</span>}
          </div>
        </div>

        {/* Target Section Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            Select Target Section to Swap Into:
          </label>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {availableTargetSections.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No other sections available.</p>
            ) : (
              availableTargetSections.map((target) => {
                const isFull = target.enrolled_count >= target.max_capacity;
                const isSelected = selectedTargetSectionId === target.id;

                return (
                  <div
                    key={target.id}
                    onClick={() => setSelectedTargetSectionId(target.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {target.course_code}
                        </span>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-slate-200' : 'text-slate-700'}`}>
                          {target.section_number}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          isFull
                            ? isSelected
                              ? 'bg-rose-500/30 text-rose-200 border border-rose-400/30'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                            : isSelected
                            ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isFull ? 'FULL' : `${target.available_seats} Seats Left`}
                      </span>
                    </div>

                    <div className={`flex items-center gap-3 text-[11px] ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {target.schedule}
                      </span>
                      {target.room && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {target.room}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {selectedTargetSection && selectedTargetSection.enrolled_count >= selectedTargetSection.max_capacity && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>Target section is full. Submitting will test the 422 ERR_CAPACITY_FULL rule.</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={isSwapping}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSwap}
            disabled={!selectedTargetSectionId || isSwapping}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSwapping ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Swapping...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Confirm Swap</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
