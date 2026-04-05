"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { jobs } from "@/lib/jobs";
import type { AIParsed, StatusHistoryEntry } from "@/lib/screen";
import type { ResearchProfile, ResearchSource } from "@/lib/research";

type InterviewTranscriptRecord = {
  id: string;
  provider: string;
  external_id: string | null;
  title: string | null;
  transcript: string | null;
  summary: string | null;
  action_items: unknown;
  created_at: string;
};

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
  ai_rationale: string | null;
  ai_parsed: AIParsed | null;
  ai_screened_at: string | null;
  override_note: string | null;
  status_history: StatusHistoryEntry[];
  research_profile: ResearchProfile | null;
  research_completed_at: string | null;
  confirmed_interview_slot?: {
    calendar_candidate_rsvp: string | null;
    calendar_rsvp_synced_at: string | null;
    start_time: string;
  } | null;
};

const STATUS_OPTIONS = [
  { value: "applied",           label: "Applied" },
  { value: "screened",          label: "Screened" },
  { value: "shortlisted",       label: "Shortlisted" },
  { value: "scheduling_sent",   label: "Scheduling Sent" },
  { value: "in_interview",      label: "In Interview" },
  { value: "offer",             label: "Offer" },
  { value: "rejected",          label: "Rejected" },
];

const STATUS_COLORS: Record<string, string> = {
  applied:           "bg-slate-100 text-slate-600",
  screened:          "bg-blue-100 text-blue-700",
  shortlisted:       "bg-emerald-100 text-emerald-700",
  scheduling_sent:   "bg-sky-100 text-sky-700",
  in_interview:      "bg-violet-100 text-violet-700",
  offer:             "bg-amber-100 text-amber-700",
  rejected:          "bg-red-100 text-red-600",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

function scoreRing(score: number) {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 60) return "stroke-amber-500";
  return "stroke-red-400";
}

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-700 ${scoreRing(score)}`}
        />
      </svg>
      <span className={`absolute text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideStatus, setOverrideStatus] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloadingResume, setDownloadingResume] = useState(false);
  const [runningResearch, setRunningResearch] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [sendingSchedule, setSendingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSent, setScheduleSent] = useState(false);
  const [interviewTranscripts, setInterviewTranscripts] = useState<InterviewTranscriptRecord[]>([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [assemblyAudioUrl, setAssemblyAudioUrl] = useState("");
  const [firefliesTranscriptId, setFirefliesTranscriptId] = useState("");
  const [transcriptImporting, setTranscriptImporting] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  type OfferQuestionnaireForm = {
    job_title: string;
    start_date: string;
    base_salary: string;
    compensation_structure: string;
    equity_bonus: string;
    reporting_manager: string;
    custom_terms: string;
  };

  const emptyOfferForm = (): OfferQuestionnaireForm => ({
    job_title: "",
    start_date: "",
    base_salary: "",
    compensation_structure: "",
    equity_bonus: "",
    reporting_manager: "",
    custom_terms: "",
  });

  const [offerForm, setOfferForm] = useState<OfferQuestionnaireForm>(emptyOfferForm);
  const [offerDraft, setOfferDraft] = useState("");
  const [offerReviewStatus, setOfferReviewStatus] = useState<"draft" | "approved" | "sent">("draft");
  const [offerFetchLoading, setOfferFetchLoading] = useState(false);
  const [offerGenerating, setOfferGenerating] = useState(false);
  const [offerSaving, setOfferSaving] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSignMessage, setOfferSignMessage] = useState<string | null>(null);
  const [offerSignedAt, setOfferSignedAt] = useState<string | null>(null);
  const [offerSigningEmailSentAt, setOfferSigningEmailSentAt] = useState<string | null>(null);
  const [offerSignerIp, setOfferSignerIp] = useState<string | null>(null);
  const [offerSignatureMethod, setOfferSignatureMethod] = useState<string | null>(null);
  const [offerSignatureCaptured, setOfferSignatureCaptured] = useState<string | null>(null);
  const [offerSigningToken, setOfferSigningToken] = useState<string | null>(null);
  const [sendingSignLink, setSendingSignLink] = useState(false);

  function resetOfferFormToDefaults(defaultTitle: string) {
    setOfferForm({ ...emptyOfferForm(), job_title: defaultTitle });
    setOfferDraft("");
    setOfferReviewStatus("draft");
    setOfferSignedAt(null);
    setOfferSigningEmailSentAt(null);
    setOfferSignerIp(null);
    setOfferSignatureMethod(null);
    setOfferSignatureCaptured(null);
    setOfferSigningToken(null);
  }

  function applyOfferBackendRow(row: Record<string, unknown> | null, defaultTitle: string) {
    if (!row || typeof row !== "object" || !row.questionnaire) {
      resetOfferFormToDefaults(defaultTitle);
      return;
    }
    const q = row.questionnaire as OfferQuestionnaireForm;
    setOfferForm({
      job_title: q.job_title ?? "",
      start_date: q.start_date ?? "",
      base_salary: q.base_salary ?? "",
      compensation_structure: q.compensation_structure ?? "",
      equity_bonus: q.equity_bonus ?? "",
      reporting_manager: q.reporting_manager ?? "",
      custom_terms: q.custom_terms ?? "",
    });
    setOfferDraft(typeof row.draft_body === "string" ? row.draft_body : "");
    if (row.review_status === "approved" || row.review_status === "sent") {
      setOfferReviewStatus(row.review_status as "approved" | "sent");
    } else {
      setOfferReviewStatus("draft");
    }
    setOfferSignedAt(typeof row.signed_at === "string" ? row.signed_at : null);
    setOfferSigningEmailSentAt(
      typeof row.signing_email_sent_at === "string" ? row.signing_email_sent_at : null
    );
    setOfferSignerIp(typeof row.signer_ip === "string" ? row.signer_ip : null);
    setOfferSignatureMethod(
      row.signature_method === "typed" || row.signature_method === "drawn"
        ? row.signature_method
        : null
    );
    setOfferSignatureCaptured(
      typeof row.signature_captured === "string" ? row.signature_captured : null
    );
    setOfferSigningToken(typeof row.signing_token === "string" ? row.signing_token : null);
  }

  useEffect(() => {
    fetch(`/api/admin/applications/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setApp(data);
        setOverrideStatus(data.status);
        setLoading(false);
      });
  }, [id]);

  const showNotetakerSection =
    app?.status === "in_interview" || app?.status === "offer";

  const showOfferLetterSection =
    app?.status === "in_interview" || app?.status === "offer";

  useEffect(() => {
    if (!showOfferLetterSection || !id || !app) return;
    setOfferFetchLoading(true);
    setOfferError(null);
    const job = jobs.find((j) => j.id === app.role_id);
    const defaultTitle = job?.title ?? "";

    fetch(`/api/admin/applications/${id}/offer-letter`)
      .then((r) => r.json())
      .then((row) => {
        applyOfferBackendRow(row, defaultTitle);
      })
      .catch(() => {})
      .finally(() => setOfferFetchLoading(false));
  }, [id, showOfferLetterSection, app?.id, app?.role_id]);

  useEffect(() => {
    if (!showNotetakerSection || !id) return;
    setTranscriptsLoading(true);
    fetch(`/api/admin/applications/${id}/interview-transcript`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setInterviewTranscripts(data);
      })
      .catch(() => setInterviewTranscripts([]))
      .finally(() => setTranscriptsLoading(false));
  }, [id, showNotetakerSection, app?.status]);

  async function refreshTranscripts() {
    if (!id) return;
    const r = await fetch(`/api/admin/applications/${id}/interview-transcript`);
    const data = await r.json();
    if (Array.isArray(data)) setInterviewTranscripts(data);
  }

  async function importAssemblyFromUrl() {
    if (!app) return;
    setTranscriptImporting(true);
    setTranscriptError(null);
    const res = await fetch(`/api/admin/applications/${app.id}/interview-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assemblyAudioUrl: assemblyAudioUrl.trim() }),
    });
    const body = await res.json();
    setTranscriptImporting(false);
    if (res.ok) {
      setAssemblyAudioUrl("");
      await refreshTranscripts();
    } else {
      setTranscriptError(body.error ?? "Transcription failed");
    }
  }

  async function importAssemblyFromFile(file: File) {
    if (!app) return;
    setTranscriptImporting(true);
    setTranscriptError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(
      `/api/admin/applications/${app.id}/interview-transcript/assembly`,
      { method: "POST", body: fd }
    );
    const body = await res.json();
    setTranscriptImporting(false);
    if (res.ok) {
      await refreshTranscripts();
    } else {
      setTranscriptError(body.error ?? "Upload failed");
    }
  }

  async function importFirefliesTranscript() {
    if (!app) return;
    setTranscriptImporting(true);
    setTranscriptError(null);
    const res = await fetch(`/api/admin/applications/${app.id}/interview-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firefliesTranscriptId: firefliesTranscriptId.trim() }),
    });
    const body = await res.json();
    setTranscriptImporting(false);
    if (res.ok) {
      setFirefliesTranscriptId("");
      await refreshTranscripts();
    } else {
      setTranscriptError(body.error ?? "Import failed");
    }
  }

  async function importMockTranscript() {
    if (!app) return;
    setTranscriptImporting(true);
    setTranscriptError(null);
    const res = await fetch(`/api/admin/applications/${app.id}/interview-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useMock: true }),
    });
    const body = await res.json();
    setTranscriptImporting(false);
    if (res.ok) {
      await refreshTranscripts();
    } else {
      setTranscriptError(body.error ?? "Mock import failed");
    }
  }

  async function generateOfferLetter() {
    if (!app) return;
    setOfferGenerating(true);
    setOfferError(null);
    setOfferSignMessage(null);
    const res = await fetch(`/api/admin/applications/${app.id}/offer-letter/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(offerForm),
    });
    const body = await res.json();
    setOfferGenerating(false);
    if (res.ok && body.offerLetter) {
      const job = jobs.find((j) => j.id === app.role_id);
      applyOfferBackendRow(body.offerLetter as Record<string, unknown>, job?.title ?? "");
    } else {
      setOfferError(body.error ?? "Could not generate offer letter");
    }
  }

  async function saveOfferDraftEdits() {
    if (!app) return;
    setOfferSaving(true);
    setOfferError(null);
    setOfferSignMessage(null);
    const res = await fetch(`/api/admin/applications/${app.id}/offer-letter`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_body: offerDraft }),
    });
    const body = await res.json();
    setOfferSaving(false);
    if (res.ok && body.draft_body !== undefined) {
      const job = jobs.find((j) => j.id === app.role_id);
      applyOfferBackendRow(body as Record<string, unknown>, job?.title ?? "");
      setOfferSignMessage("Draft saved.");
    } else if (!res.ok) {
      setOfferError(body.error ?? "Save failed");
    }
  }

  async function markOfferApproved() {
    if (!app) return;
    setOfferSaving(true);
    setOfferError(null);
    setOfferSignMessage(null);
    const res = await fetch(`/api/admin/applications/${app.id}/offer-letter`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_status: "approved" }),
    });
    const body = await res.json();
    setOfferSaving(false);
    if (res.ok && body.review_status) {
      const job = jobs.find((j) => j.id === app.role_id);
      applyOfferBackendRow(body as Record<string, unknown>, job?.title ?? "");
      setOfferSignMessage("Marked approved — you can email the signing link next.");
    } else {
      setOfferError(body.error ?? "Could not update status");
    }
  }

  async function sendOfferSigningLink() {
    if (!app) return;
    setSendingSignLink(true);
    setOfferError(null);
    setOfferSignMessage(null);
    const res = await fetch(
      `/api/admin/applications/${app.id}/offer-letter/send-for-signature`,
      { method: "POST" }
    );
    const body = await res.json();
    setSendingSignLink(false);
    const job = jobs.find((j) => j.id === app.role_id);
    if (body.offerLetter) {
      applyOfferBackendRow(body.offerLetter as Record<string, unknown>, job?.title ?? "");
    }
    if (res.ok) {
      setOfferSignMessage(
        body.signingUrl
          ? `Signing link emailed to candidate. Copy if needed: ${body.signingUrl}`
          : "Signing link emailed to candidate."
      );
    } else {
      setOfferError(body.error ?? "Could not send signing link");
      if (body.signingUrl) {
        setOfferSignMessage(`Link (email may have failed): ${body.signingUrl}`);
      }
    }
  }

  function copyOfferSigningLink() {
    const base = (process.env.NEXT_PUBLIC_BASE_URL ?? window.location.origin).replace(/\/$/, "");
    if (!offerSigningToken) return;
    void navigator.clipboard.writeText(`${base}/offer/sign/${offerSigningToken}`);
    setOfferSignMessage("Signing link copied to clipboard.");
  }

  async function handleOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!app) return;
    setSaving(true);

    const res = await fetch(`/api/admin/applications/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: overrideStatus, note: overrideNote }),
    });

    if (res.ok) {
      setApp((prev) =>
        prev
          ? {
              ...prev,
              status: overrideStatus,
              override_note: overrideNote,
              status_history: [
                ...prev.status_history,
                { status: overrideStatus, note: overrideNote || null, changed_at: new Date().toISOString(), is_override: true },
              ],
            }
          : prev
      );
      setOverrideNote("");
    }
    setSaving(false);
  }

  async function downloadResume() {
    if (!app) return;
    setDownloadingResume(true);
    const res = await fetch(`/api/admin/resume?path=${encodeURIComponent(app.resume_path)}`);
    const { url } = await res.json();
    window.open(url, "_blank");
    setDownloadingResume(false);
  }

  async function sendSchedule() {
    if (!app) return;
    setSendingSchedule(true);
    setScheduleError(null);
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/schedule`, { method: "POST" });
      if (res.ok) {
        setScheduleSent(true);
        setApp((prev) => prev ? { ...prev, status: "scheduling_sent" } : prev);
      } else {
        const body = await res.json().catch(() => ({}));
        setScheduleError(body.error ?? `Error ${res.status}`);
      }
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Network error");
    }
    setSendingSchedule(false);
  }

  async function runResearch() {
    if (!app) return;
    setRunningResearch(true);
    setResearchError(null);
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/research`, { method: "POST" });
      if (res.ok) {
        const updated = await fetch(`/api/admin/applications/${app.id}`).then((r) => r.json());
        setApp(updated);
      } else {
        const body = await res.json().catch(() => ({}));
        setResearchError(body.error ?? `Server error ${res.status}`);
      }
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : "Network error");
    }
    setRunningResearch(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </main>
    );
  }

  if (!app) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-red-500">Application not found.</p>
      </main>
    );
  }

  const job = jobs.find((j) => j.id === app.role_id);

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-700">{app.full_name}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Candidate info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{app.full_name}</h1>
                <p className="text-slate-500 mt-0.5">{app.email}</p>
                <p className="text-sm text-slate-400 mt-1">Applied {formatDate(app.created_at)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap gap-2 justify-end">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[app.status] ?? "bg-slate-100 text-slate-500"}`}>
                    {STATUS_OPTIONS.find((s) => s.value === app.status)?.label ?? app.status}
                  </span>
                  {offerSignedAt && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                      Offer e-signed
                    </span>
                  )}
                </div>
                {job && <p className="text-sm text-slate-500">{job.title} — {job.team}</p>}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a href={app.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                LinkedIn
              </a>
              {app.portfolio_url && (
                <a href={app.portfolio_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Portfolio / GitHub
                </a>
              )}
              <button onClick={downloadResume} disabled={downloadingResume}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {downloadingResume ? "Opening…" : "Download Resume"}
              </button>
            </div>
          </div>

          {/* AI Screening */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">AI Screening</h2>

            {!app.ai_screened_at ? (
              <div className="flex items-center gap-3 text-sm text-slate-500 py-4">
                <svg className="w-5 h-5 animate-spin text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                AI is analysing this resume — check back in a moment.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Score + rationale */}
                <div className="flex gap-6 items-start flex-wrap">
                  <div className="text-center">
                    <ScoreRing score={app.ai_score ?? 0} />
                    <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">Fit Score</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-relaxed">{app.ai_rationale}</p>
                    <p className="text-xs text-slate-400 mt-2">Screened {formatDate(app.ai_screened_at)}</p>
                  </div>
                </div>

                {app.ai_parsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-slate-100">
                    <ParsedSection title="Skills" items={app.ai_parsed.skills} pill />
                    <ParsedSection title="Past Employers" items={app.ai_parsed.employers} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Experience</p>
                      <p className="text-sm text-slate-700">{app.ai_parsed.experience_years} year{app.ai_parsed.experience_years !== 1 ? "s" : ""}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Education</p>
                      <p className="text-sm text-slate-700">{app.ai_parsed.education || "—"}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <ParsedSection title="Key Achievements" items={app.ai_parsed.achievements} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interview Scheduling */}
          {(app.status === "shortlisted" || app.status === "scheduling_sent" || app.status === "in_interview") && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">Interview Scheduling</h2>

              {app.status === "in_interview" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Interview confirmed — candidate selected a slot. Google Calendar invite sent; RSVP is synced from
                    Calendar (not email).
                  </div>
                  {app.confirmed_interview_slot && (
                    <div className="text-xs text-slate-600 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="font-semibold text-slate-700 mb-1">Calendar invite (candidate)</p>
                      <p>
                        RSVP:{" "}
                        <span className="font-medium">
                          {app.confirmed_interview_slot.calendar_candidate_rsvp === "accepted"
                            ? "Accepted (Yes)"
                            : app.confirmed_interview_slot.calendar_candidate_rsvp === "declined"
                              ? "Declined"
                              : app.confirmed_interview_slot.calendar_candidate_rsvp === "tentative"
                                ? "Maybe"
                                : app.confirmed_interview_slot.calendar_candidate_rsvp === "needs_action"
                                  ? "Awaiting response in Google Calendar"
                                  : "Pending sync"}
                        </span>
                      </p>
                      {app.confirmed_interview_slot.calendar_rsvp_synced_at && (
                        <p className="text-slate-400 mt-1">
                          Last checked:{" "}
                          {new Date(app.confirmed_interview_slot.calendar_rsvp_synced_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : scheduleSent || app.status === "scheduling_sent" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-sky-700 bg-sky-50 rounded-xl px-4 py-3">
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Scheduling email sent — waiting for candidate to pick a slot.
                  </div>
                  <button
                    onClick={sendSchedule}
                    disabled={sendingSchedule}
                    className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
                  >
                    {sendingSchedule ? "Sending…" : "Resend with new slots"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">
                    Send the candidate three available 45-minute slots. Other pending candidates cannot claim the same windows. Tentative holds stay on the interviewer&apos;s calendar until the candidate confirms one.
                  </p>
                  {scheduleError && (
                    <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                      {scheduleError}
                    </div>
                  )}
                  <button
                    onClick={sendSchedule}
                    disabled={sendingSchedule}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 transition-colors"
                  >
                    {sendingSchedule ? "Finding slots & sending…" : "Send scheduling options"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Phase 5A — AI offer letter (human review before send) */}
          {showOfferLetterSection && (
            <div className="bg-white rounded-2xl border border-amber-200 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Offer letter (AI draft)</h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl">
                    Phase 5B uses an <strong>in-app</strong> signing portal (no DocuSign). After approval, email the
                    candidate a personal link; on sign we store timestamp, IP, and signature and alert the interviewer.
                    Set <code className="text-slate-600">OFFER_SIGN_ALERT_EMAIL</code> for extra alert recipients.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {offerSignedAt && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                      Offer signed
                    </span>
                  )}
                  {offerReviewStatus === "approved" && !offerSignedAt && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-800">
                      Approved for send
                    </span>
                  )}
                  {offerReviewStatus === "sent" && !offerSignedAt && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-sky-100 text-sky-800">
                      Awaiting signature
                    </span>
                  )}
                </div>
              </div>

              {offerSignedAt && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 mb-4 space-y-2">
                  <p className="font-semibold">Signature on file</p>
                  <p className="text-xs text-emerald-800">
                    Signed {new Date(offerSignedAt).toLocaleString()}
                    {offerSignerIp ? ` · IP ${offerSignerIp}` : ""}
                    {offerSignatureMethod ? ` · ${offerSignatureMethod === "typed" ? "Typed name" : "Drawn"}` : ""}
                  </p>
                  {offerSignatureMethod === "drawn" && offerSignatureCaptured?.startsWith("data:image") && (
                    <img
                      src={offerSignatureCaptured}
                      alt="Candidate signature"
                      className="max-h-24 border border-emerald-200 rounded-lg bg-white mt-2"
                    />
                  )}
                  {offerSignatureMethod === "typed" && offerSignatureCaptured && (
                    <p className="text-sm font-medium text-emerald-950 mt-1">“{offerSignatureCaptured}”</p>
                  )}
                </div>
              )}

              {offerFetchLoading && (
                <p className="text-sm text-slate-400 mb-4">Loading saved offer letter…</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <label className="block text-sm">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirmed job title</span>
                  <input
                    value={offerForm.job_title}
                    onChange={(e) => setOfferForm((f) => ({ ...f, job_title: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Start date</span>
                  <input
                    value={offerForm.start_date}
                    onChange={(e) => setOfferForm((f) => ({ ...f, start_date: e.target.value }))}
                    placeholder="e.g. May 1, 2026"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Base salary</span>
                  <input
                    value={offerForm.base_salary}
                    onChange={(e) => setOfferForm((f) => ({ ...f, base_salary: e.target.value }))}
                    placeholder="e.g. $180,000 USD annually"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Compensation structure
                  </span>
                  <textarea
                    value={offerForm.compensation_structure}
                    onChange={(e) => setOfferForm((f) => ({ ...f, compensation_structure: e.target.value }))}
                    placeholder="Pay frequency, overtime, benefits summary, etc."
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 resize-y min-h-[3rem]"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Equity or bonus (optional)
                  </span>
                  <textarea
                    value={offerForm.equity_bonus}
                    onChange={(e) => setOfferForm((f) => ({ ...f, equity_bonus: e.target.value }))}
                    placeholder="RSUs, options, signing bonus, performance bonus…"
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 resize-y min-h-[3rem]"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reporting manager</span>
                  <input
                    value={offerForm.reporting_manager}
                    onChange={(e) => setOfferForm((f) => ({ ...f, reporting_manager: e.target.value }))}
                    placeholder="Name and title"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Custom terms (optional)
                  </span>
                  <textarea
                    value={offerForm.custom_terms}
                    onChange={(e) => setOfferForm((f) => ({ ...f, custom_terms: e.target.value }))}
                    placeholder="Relocation, probation, IP, non-compete, or other candidate-specific terms…"
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 resize-y min-h-[4rem]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => void generateOfferLetter()}
                  disabled={offerGenerating || !!offerSignedAt}
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                >
                  {offerGenerating ? "Generating…" : "Generate offer letter"}
                </button>
                <button
                  type="button"
                  onClick={() => void saveOfferDraftEdits()}
                  disabled={offerSaving || !offerDraft.trim() || !!offerSignedAt}
                  className="rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-sm font-semibold px-4 py-2"
                >
                  {offerSaving ? "Saving…" : "Save draft edits"}
                </button>
                <button
                  type="button"
                  onClick={() => void markOfferApproved()}
                  disabled={
                    offerSaving ||
                    !offerDraft.trim() ||
                    offerReviewStatus === "approved" ||
                    offerReviewStatus === "sent" ||
                    !!offerSignedAt
                  }
                  className="rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-900 text-sm font-semibold px-4 py-2"
                >
                  Mark approved for send
                </button>
                <button
                  type="button"
                  onClick={() => void sendOfferSigningLink()}
                  disabled={
                    sendingSignLink ||
                    !!offerSignedAt ||
                    !offerDraft.trim() ||
                    (offerReviewStatus !== "approved" && offerReviewStatus !== "sent")
                  }
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                >
                  {sendingSignLink ? "Sending…" : offerSigningEmailSentAt ? "Resend signing email" : "Email signing link"}
                </button>
                <button
                  type="button"
                  onClick={copyOfferSigningLink}
                  disabled={!offerSigningToken || !!offerSignedAt}
                  className="rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-sm font-semibold px-4 py-2"
                >
                  Copy signing link
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(offerDraft)}
                  disabled={!offerDraft.trim()}
                  className="rounded-xl text-slate-500 hover:text-slate-700 text-sm font-medium px-3 py-2 disabled:opacity-50"
                >
                  Copy letter
                </button>
              </div>

              {offerSignMessage && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-2 text-sm text-emerald-800 mb-4 break-all">
                  {offerSignMessage}
                </div>
              )}

              {offerError && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-2 text-sm text-red-700 mb-4">
                  {offerError}
                </div>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Draft (editable)</span>
                <textarea
                  value={offerDraft}
                  onChange={(e) => setOfferDraft(e.target.value)}
                  rows={18}
                  placeholder="Generated letter appears here. Edit before sending to the candidate."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 font-mono outline-none focus:ring-2 focus:ring-amber-500 resize-y min-h-[12rem]"
                />
              </label>
            </div>
          )}

          {/* Phase 04 — AI notetaker / transcript */}
          {showNotetakerSection && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-1">Interview transcript &amp; notes</h2>
              <p className="text-xs text-slate-500 mb-4">
                Recommended:{" "}
                <a
                  href="https://www.assemblyai.com/dashboard"
                  className="text-indigo-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  AssemblyAI
                </a>{" "}
                (free developer credits) — paste a <strong>public</strong> recording URL (HTTPS). Optional: small file
                upload (≤4 MB; larger files use a URL). Alternatives:{" "}
                <a
                  href="https://docs.fireflies.ai/graphql-api/query/transcript"
                  className="text-indigo-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Fireflies
                </a>{" "}
                (often paid API) or mock for demos. See{" "}
                <code className="text-slate-600">docs/phase-04-notetaker.md</code>.
              </p>

              <div className="space-y-3 mb-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="url"
                    value={assemblyAudioUrl}
                    onChange={(e) => setAssemblyAudioUrl(e.target.value)}
                    placeholder="https://… (public audio / video URL)"
                    className="flex-1 min-w-[220px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={importAssemblyFromUrl}
                    disabled={transcriptImporting || !assemblyAudioUrl.trim()}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                  >
                    {transcriptImporting ? "Transcribing…" : "Transcribe (free tier)"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-xs text-slate-500">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <span className="text-slate-600">Or upload small file</span>
                    <input
                      type="file"
                      accept="audio/*,video/*,.mp3,.m4a,.wav,.webm,.mp4"
                      disabled={transcriptImporting}
                      className="text-sm text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void importAssemblyFromFile(f);
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={firefliesTranscriptId}
                    onChange={(e) => setFirefliesTranscriptId(e.target.value)}
                    placeholder="Fireflies transcript ID"
                    className="flex-1 min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={importFirefliesTranscript}
                    disabled={transcriptImporting || !firefliesTranscriptId.trim()}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2"
                  >
                    {transcriptImporting ? "Importing…" : "Import from Fireflies"}
                  </button>
                  <button
                    type="button"
                    onClick={importMockTranscript}
                    disabled={transcriptImporting}
                    className="rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-sm font-semibold px-4 py-2"
                  >
                    Load mock transcript
                  </button>
                </div>
              </div>
              {transcriptError && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-2 text-sm text-red-700 mb-4">
                  {transcriptError}
                </div>
              )}

              {transcriptsLoading ? (
                <p className="text-sm text-slate-400">Loading transcripts…</p>
              ) : interviewTranscripts.length === 0 ? (
                <p className="text-sm text-slate-400">No transcript stored yet.</p>
              ) : (
                <div className="space-y-4">
                  {interviewTranscripts.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">
                          {t.title ?? "Interview"}
                        </span>
                        <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5">
                          {t.provider}
                        </span>
                        {t.external_id && <span className="font-mono truncate max-w-[12rem]">{t.external_id}</span>}
                        <span>{formatDate(t.created_at)}</span>
                      </div>
                      {t.summary && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                            Summary
                          </p>
                          <p className="text-slate-700 whitespace-pre-wrap">{t.summary}</p>
                        </div>
                      )}
                      {Array.isArray(t.action_items) && t.action_items.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                            Action items
                          </p>
                          <ul className="list-disc pl-4 text-slate-700">
                            {(t.action_items as string[]).map((item, i) => (
                              <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {t.transcript && (
                        <details className="text-slate-600">
                          <summary className="cursor-pointer text-indigo-600 font-medium">
                            Full transcript
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap text-xs bg-white border border-slate-100 rounded-lg p-3 max-h-64 overflow-y-auto">
                            {t.transcript}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Research Profile */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Research Profile</h2>
              <button
                onClick={runResearch}
                disabled={runningResearch}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
              >
                {runningResearch ? "Researching…" : app.research_completed_at ? "Re-run" : "Run research"}
              </button>
            </div>

            {runningResearch ? (
              <div className="flex items-center gap-3 text-sm text-slate-500 py-4">
                <svg className="w-5 h-5 animate-spin text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Researching candidate across LinkedIn, GitHub, and portfolio…
              </div>
            ) : researchError ? (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                Research failed: {researchError}
              </div>
            ) : !app.research_profile ? (
              <p className="text-sm text-slate-400 py-2">
                Research runs automatically for shortlisted candidates, or click &ldquo;Run research&rdquo; above.
              </p>
            ) : (
              <div className="space-y-5">
                {/* Candidate Brief */}
                {app.research_profile.candidate_brief && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 mb-1.5">60-second brief</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{app.research_profile.candidate_brief}</p>
                  </div>
                )}

                {/* Discrepancies */}
                {app.research_profile.discrepancies.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-2">Discrepancies flagged</p>
                    <ul className="space-y-1">
                      {app.research_profile.discrepancies.map((d, i) => (
                        <li key={i} className="flex gap-2 text-sm text-red-700">
                          <span className="mt-1 shrink-0">⚠</span>{d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Source cards */}
                <div className="space-y-3">
                  <ResearchCard label="LinkedIn" source={app.research_profile.linkedin} />
                  <ResearchCard label="GitHub" source={app.research_profile.github} />
                  <ResearchCard label="Portfolio" source={app.research_profile.portfolio} />
                  <ResearchCard label="X / Twitter" source={app.research_profile.twitter} />
                </div>

                <p className="text-xs text-slate-400">
                  Completed {formatDate(app.research_completed_at!)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">

          {/* Manual Override */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Update Status</h2>
            <form onSubmit={handleOverride} className="space-y-3">
              <select
                value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <textarea
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="Add a note (optional)…"
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <button
                type="submit"
                disabled={saving || overrideStatus === app.status}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition-colors"
              >
                {saving ? "Saving…" : "Save override"}
              </button>
            </form>
          </div>

          {/* Status History */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">Status History</h2>
            {(app.status_history ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">No history yet.</p>
            ) : (
              <ol className="space-y-4">
                {[...(app.status_history ?? [])].reverse().map((entry, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${entry.is_override ? "bg-amber-400" : "bg-indigo-400"}`} />
                      {i < (app.status_history ?? []).length - 1 && <div className="w-px flex-1 bg-slate-100 mt-1" />}
                    </div>
                    <div className="pb-4 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {STATUS_OPTIONS.find((s) => s.value === entry.status)?.label ?? entry.status}
                        </span>
                        {entry.is_override && (
                          <span className="text-xs text-amber-600 font-medium">Manual override</span>
                        )}
                      </div>
                      {entry.note && <p className="text-xs text-slate-500 mt-1">{entry.note}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.changed_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function ResearchCard({ label, source }: { label: string; source: ResearchSource }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        {source.success ? (
          <span className="text-xs text-emerald-600 font-medium">fetched</span>
        ) : source.attempted ? (
          <span className="text-xs text-amber-500 font-medium">unavailable</span>
        ) : (
          <span className="text-xs text-slate-400 font-medium">not attempted</span>
        )}
      </div>
      {source.summary && <p className="text-sm text-slate-600 leading-relaxed">{source.summary}</p>}
      {source.note && <p className="text-xs text-slate-400 mt-1 italic">{source.note}</p>}
    </div>
  );
}

function ParsedSection({ title, items, pill }: { title: string; items: string[]; pill?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{title}</p>
      {pill ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="text-xs font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{item}</span>
          ))}
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600">
              <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-slate-300" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
