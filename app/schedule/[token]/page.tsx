"use client";

import { useEffect, useState, use } from "react";
import type { InterviewSlot } from "@/lib/schedule";

type PageData = {
  candidateName: string;
  jobTitle: string;
  slots: InterviewSlot[];
  alreadyConfirmed: boolean;
};

function formatSlot(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
  };
}

export default function SchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetch(`/api/schedule/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load scheduling page."));
  }, [token]);

  async function handleConfirm(slotId: string) {
    setConfirming(slotId);
    const res = await fetch(`/api/schedule/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId }),
    });
    const body = await res.json();
    if (res.ok) {
      setConfirmed(true);
      setData((prev) =>
        prev
          ? {
              ...prev,
              slots: prev.slots.map((s) =>
                s.id === slotId
                  ? { ...s, status: "confirmed" }
                  : { ...s, status: "cancelled" }
              ),
            }
          : prev
      );
    } else {
      setError(body.error ?? "Failed to confirm slot.");
    }
    setConfirming(null);
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-red-100 p-8 max-w-md w-full text-center">
          <p className="text-red-500 font-medium">{error}</p>
          <p className="text-sm text-slate-400 mt-2">
            This link may have expired or already been used.
          </p>
        </div>
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

  const tentativeSlots = data.slots.filter((s) => s.status === "tentative");
  const confirmedSlot = data.slots.find((s) => s.status === "confirmed");

  if (confirmed || data.alreadyConfirmed || confirmedSlot) {
    const slot = confirmedSlot ?? data.slots[0];
    const { day, time } = slot ? formatSlot(slot.start_time) : { day: "", time: "" };
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-emerald-100 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">Interview confirmed!</h1>
          <p className="text-slate-500 text-sm mb-4">
            Hi {data.candidateName}, you&apos;re all set for your <strong>{data.jobTitle}</strong> interview.
          </p>
          {slot && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold">{day}</p>
              <p className="text-slate-500">{time} · 45 minutes</p>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4">
            A confirmation email has been sent to you. Please reach out if you need to reschedule.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Choose your interview time</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Hi {data.candidateName} — please select a 45-minute slot for your{" "}
            <strong>{data.jobTitle}</strong> interview.
          </p>
        </div>

        {tentativeSlots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">
            No slots are currently available. Please contact the hiring team.
          </div>
        ) : (
          <div className="space-y-3">
            {tentativeSlots.map((slot) => {
              const { day, time } = formatSlot(slot.start_time);
              const isConfirming = confirming === slot.id;
              return (
                <div
                  key={slot.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{day}</p>
                    <p className="text-sm text-slate-500">{time} · 45 minutes</p>
                  </div>
                  <button
                    onClick={() => handleConfirm(slot.id)}
                    disabled={!!confirming}
                    className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 transition-colors"
                  >
                    {isConfirming ? "Confirming…" : "Select"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-400 text-center mt-6">
          Slots are held for a limited time. Select as soon as possible to secure your preferred time.
        </p>
      </div>
    </main>
  );
}
