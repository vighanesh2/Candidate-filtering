"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { jobs } from "@/lib/jobs";

type Application = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  linkedin_url: string;
  portfolio_url: string | null;
  role_id: string;
  resume_path: string;
  status: string;
  ai_score: number | null;
  ai_screened_at: string | null;
};

const STATUS_OPTIONS = [
  { value: "applied",      label: "Applied",      cls: "bg-slate-100 text-slate-600" },
  { value: "screened",     label: "Screened",     cls: "bg-blue-100 text-blue-700" },
  { value: "shortlisted",  label: "Shortlisted",  cls: "bg-emerald-100 text-emerald-700" },
  { value: "in_interview", label: "In Interview", cls: "bg-violet-100 text-violet-700" },
  { value: "offer",        label: "Offer",        cls: "bg-amber-100 text-amber-700" },
  { value: "rejected",     label: "Rejected",     cls: "bg-red-100 text-red-600" },
];

function statusCls(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.cls ?? "bg-slate-100 text-slate-500";
}
function statusLabel(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}
function roleLabel(id: string) {
  return jobs.find((j) => j.id === id)?.title ?? id;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600 font-bold";
  if (score >= 60) return "text-amber-600 font-bold";
  return "text-red-500 font-bold";
}

export default function AdminDashboard() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchApplications = useCallback(async () => {
    const res = await fetch("/api/admin/applications");
    const data = await res.json();
    setApplications(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const filtered = applications.filter((a) => {
    if (roleFilter !== "all" && a.role_id !== roleFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (dateFrom && new Date(a.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(a.created_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const counts = {
    total:       applications.length,
    applied:     applications.filter((a) => a.status === "applied").length,
    shortlisted: applications.filter((a) => a.status === "shortlisted").length,
    avgScore:    (() => {
      const scored = applications.filter((a) => a.ai_score !== null);
      return scored.length ? Math.round(scored.reduce((s, a) => s + (a.ai_score ?? 0), 0) / scored.length) : null;
    })(),
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Hiring Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">AI-powered candidate review</p>
          </div>
          <a href="/" target="_blank" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
            View careers page ↗
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total",       value: counts.total,       color: "text-slate-900" },
            { label: "Pending Review", value: counts.applied,  color: "text-blue-600" },
            { label: "Shortlisted", value: counts.shortlisted, color: "text-emerald-600" },
            { label: "Avg AI Score", value: counts.avgScore !== null ? `${counts.avgScore}` : "—", color: counts.avgScore !== null ? scoreColor(counts.avgScore) : "text-slate-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">All roles</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-slate-400 text-sm">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {(roleFilter !== "all" || statusFilter !== "all" || dateFrom || dateTo) && (
            <button onClick={() => { setRoleFilter("all"); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}
              className="text-xs text-slate-400 hover:text-slate-700 underline transition-colors">
              Clear filters
            </button>
          )}

          <span className="ml-auto text-sm text-slate-400">
            {filtered.length} {filtered.length === 1 ? "applicant" : "applicants"}
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-slate-400">Loading applications…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-slate-400">No applications match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 text-left">Candidate</th>
                    <th className="px-5 py-3 text-left">Role</th>
                    <th className="px-5 py-3 text-left">Applied</th>
                    <th className="px-5 py-3 text-left">AI Score</th>
                    <th className="px-5 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((app) => (
                    <tr
                      key={app.id}
                      onClick={() => router.push(`/admin/candidate/${app.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{app.full_name}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{app.email}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{roleLabel(app.role_id)}</td>
                      <td className="px-5 py-4 text-slate-500 whitespace-nowrap">{formatDate(app.created_at)}</td>
                      <td className="px-5 py-4">
                        {app.ai_score !== null ? (
                          <span className={`text-base ${scoreColor(app.ai_score)}`}>{app.ai_score}</span>
                        ) : (
                          <span className="text-xs text-slate-300 italic">
                            {app.ai_screened_at ? "—" : "Screening…"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCls(app.status)}`}>
                          {statusLabel(app.status)}
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
    </main>
  );
}
