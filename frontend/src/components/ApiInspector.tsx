'use client';

import React, { useState } from 'react';
import { ApiLog } from '../types';
import { Terminal, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';

interface ApiInspectorProps {
  logs: ApiLog[];
  onClearLogs: () => void;
}

export const ApiInspector: React.FC<ApiInspectorProps> = ({ logs, onClearLogs }) => {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'GET':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'POST':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PATCH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'DELETE':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (status >= 400 && status < 500) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    } else {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              API Traffic Inspector
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {logs.length} calls
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Live HTTP traffic to <span className="font-mono text-slate-700">{API_BASE_URL}</span>
            </p>
          </div>
        </div>

        <button
          onClick={onClearLogs}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-200 shadow-sm transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5 text-slate-500" />
          Clear Logs
        </button>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Terminal className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-600 font-medium">No API calls recorded yet</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Register or swap sections in the app to view live network traffic.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div
                key={log.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all"
              >
                {/* Log Row */}
                <div
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                      {log.timestamp}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${getMethodBadge(
                        log.method
                      )}`}
                    >
                      {log.method}
                    </span>

                    <span className="text-xs font-mono font-medium text-slate-800 truncate">
                      {log.endpoint}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${getStatusBadge(
                        log.status
                      )}`}
                    >
                      {log.status === 0 ? 'FAIL' : log.status}
                    </span>

                    <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                      {log.durationMs}ms
                    </span>

                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded JSON Inspector */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3 text-xs font-mono">
                    {log.payload && (
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                          Request Payload (Body)
                        </span>
                        <pre className="mt-1 p-3 rounded-lg bg-slate-900 text-slate-100 overflow-x-auto text-[11px]">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                        Response Payload
                      </span>
                      <pre className="mt-1 p-3 rounded-lg bg-slate-900 text-slate-100 overflow-x-auto text-[11px]">
                        {JSON.stringify(log.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
