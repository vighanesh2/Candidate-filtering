"use client";

import { useEffect, useState, useCallback } from "react";
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
  status: "new" | "reviewing" | "shortlisted" | "rejected";
};

const STATUS_CONFIG = {
  new:         { label: "New",         cls: "bg-blue-100 text-blue-700" },
  reviewing:   { label: "Reviewing",   cls: "bg-amber-100 text-amber-700" },
  shortlisted: { label: "Shortlisted", cls: "bg-emerald-100 text-emerald-700" },
  rejected:    { label: "Rejected",    cls: "bg-red-100 text-red-600" },
};

const STATUSES = Object.keys(STATUS_CONFIG) as Application["status"][];

function roleLabel(id: string) {
  const job = jobs.find((j) => j.id === id);
  return job ? job.title : id;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminDashboard() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    const res = await fetch("/api/admin/applications");
    const data = await res.json();
    setApplications(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  async function downloadResume(app: Application) {
    setDownloadingId(app.id);
    const res = await fetch(`/api/admin/resume?path=${encodeURIComponent(app.resume_path)}`);
    const { url } = await res.json();
    window.open(url, "_blank");
    setDownloadingId(null);
  }

  async function updateStatus(id: string, status: Application["status"]) {
    setUpdatingId(id);
    await fetch(`/api/admin/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setApplications((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
    setUpdatingId(null);
  }

  const filtered = applications.filter((a) => {
    if (roleFilter !== "all" && a.role_id !== roleFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    return true;
  });

  // Summary counts
  const counts = {
    total: applications.length,
    new: applications.filter((a) => a.status === "new").length,
    shortlisted: applications.filter((a) => a.status === "shortlisted").length,
    reviewing: applications.filter((a) => a.status === "reviewing").length,
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Hiring Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage and review candidate applications</p>
          </div>
          <a
            href="/"
            target="_blank"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            View careers page ↗
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total", value: counts.total, color: "text-slate-900" },
            { label: "New", value: counts.new, color: "text-blue-600" },
            { label: "Reviewing", value: counts.reviewing, color: "text-amber-600" },
            { label: "Shortlisted", value: counts.shortlisted, color: "text-emerald-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All roles</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
          </select>

          <span className="ml-auto self-center text-sm text-slate-400">
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
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-left">Links</th>
                    <th className="px-5 py-3 text-left">Resume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                      {/* Candidate */}
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{app.full_name}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{app.email}</p>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4 text-slate-600">{roleLabel(app.role_id)}</td>

                      {/* Applied */}
                      <td className="px-5 py-4 text-slate-500 whitespace-nowrap">{formatDate(app.created_at)}</td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <select
                          value={app.status ?? "new"}
                          disabled={updatingId === app.id}
                          onChange={(e) => updateStatus(app.id, e.target.value as Application["status"])}
                          className={`rounded-lg border-0 px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer disabled:opacity-60 ${STATUS_CONFIG[app.status ?? "new"].cls}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                      </td>

                      {/* Links */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <a
                            href={app.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 transition-colors"
                            title="LinkedIn"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                          </a>
                          {app.portfolio_url && (
                            <a
                              href={app.portfolio_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-slate-800 transition-colors"
                              title="Portfolio / GitHub"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                              </svg>
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Resume */}
                      <td className="px-5 py-4">
                        <button
                          onClick={() => downloadResume(app)}
                          disabled={downloadingId === app.id}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          {downloadingId === app.id ? "Opening…" : "Download"}
                        </button>
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
