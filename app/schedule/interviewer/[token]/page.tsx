"use client";

import { useEffect, useState, use } from "react";

type Summary = {
  candidateName: string;
  jobTitle: string;
  candidateNote: string | null;
  slots: { label: string }[];
  status: string;
};

export default function InterviewerDecisionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/schedule/interviewer/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load."));
  }, [token]);

  async function act(action: "approve" | "decline") {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/schedule/interviewer/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Request failed");
      return;
    }
    if (action === "approve") {
      setDone("Approved. The candidate was emailed the new times.");
    } else {
      setDone(
        body.nextRound
          ? "Declined. A new set of options was emailed to you for review."
          : "Declined. No further automatic suggestions — coordinate manually if needed."
      );
    }
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <p className="text-red-600 text-sm">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </main>
    );
  }

  if (data.status !== "pending") {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md text-center text-sm text-slate-600">
          This request was already {data.status}. No further action needed.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-900">Alternative interview times</h1>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">{data.candidateName}</span> —{" "}
          {data.jobTitle}
        </p>
        {data.candidateNote && (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="text-xs font-semibold text-slate-400 uppercase">Note</span>
            <p className="mt-1">{data.candidateNote}</p>
          </div>
        )}
        <ul className="space-y-2 text-sm text-slate-800">
          {data.slots.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-indigo-500 font-semibold">{i + 1}.</span>
              {s.label}
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-emerald-700">{done}</p>}
        {!done && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act("approve")}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5"
            >
              {busy === "approve" ? "Working…" : "Approve & notify candidate"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act("decline")}
              className="flex-1 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-sm font-semibold py-2.5"
            >
              {busy === "decline" ? "Working…" : "Decline — next options"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
