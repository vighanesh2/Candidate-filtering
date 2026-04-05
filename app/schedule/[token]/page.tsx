"use client";

import { useEffect, useState, use } from "react";
import type { InterviewSlot } from "@/lib/schedule";

type PageData = {
  candidateName: string;
  jobTitle: string;
  slots: InterviewSlot[];
  alreadyConfirmed: boolean;
  awaitingAlternatives: boolean;
  hasPendingAlternativeRequest: boolean;
  calendarInviteRsvp: string | null;
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
  const [confirmedMeetLink, setConfirmedMeetLink] = useState<string | null>(null);
  const [altNote, setAltNote] = useState("");
  const [altSubmitting, setAltSubmitting] = useState(false);
  const [altMessage, setAltMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/schedule/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load scheduling page."));
  }, [token]);

  // Refresh RSVP from server (cron syncs Google Calendar — no email reply required).
  useEffect(() => {
    if (!data) return;
    const hasConfirmed =
      confirmed || data.alreadyConfirmed || data.slots.some((s) => s.status === "confirmed");
    if (!hasConfirmed) return;
    const rsvp =
      data.calendarInviteRsvp ??
      data.slots.find((s) => s.status === "confirmed")?.calendar_candidate_rsvp ??
      null;
    if (rsvp === "accepted" || rsvp === "declined") return;
    const id = setInterval(() => {
      fetch(`/api/schedule/${token}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) setData(d);
        })
        .catch(() => {});
    }, 90_000);
    return () => clearInterval(id);
  }, [data, confirmed, token]);

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
      setConfirmedMeetLink(typeof body.meetLink === "string" ? body.meetLink : null);
      setData((prev) =>
        prev
          ? {
              ...prev,
              calendarInviteRsvp: "needs_action",
              slots: prev.slots.map((s) =>
                s.id === slotId
                  ? { ...s, status: "confirmed", calendar_candidate_rsvp: "needs_action" }
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

  async function submitAlternatives() {
    setAltSubmitting(true);
    setAltMessage(null);
    const res = await fetch(`/api/schedule/${token}/alternatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: altNote }),
    });
    const body = await res.json();
    setAltSubmitting(false);
    if (res.ok) {
      setAltMessage(
        "Request sent. The hiring team will review new times. Your current slots stay reserved until then."
      );
      setAltNote("");
      setData((prev) =>
        prev
          ? {
              ...prev,
              hasPendingAlternativeRequest: true,
              awaitingAlternatives: true,
            }
          : prev
      );
    } else {
      setAltMessage(body.error ?? "Could not send request.");
    }
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
    const rsvp =
      data.calendarInviteRsvp ??
      slot?.calendar_candidate_rsvp ??
      null;
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
          {confirmedMeetLink && (
            <a
              href={confirmedMeetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-3 px-4 transition-colors"
            >
              Open Google Meet
            </a>
          )}
          {rsvp === "accepted" ? (
            <p className="text-sm text-emerald-700 mt-4 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
              You&apos;ve accepted the Google Calendar invite. No email reply needed.
            </p>
          ) : rsvp === "declined" ? (
            <p className="text-sm text-amber-800 mt-4 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
              Your calendar shows Declined — please email the hiring team if this was a mistake.
            </p>
          ) : (
            <p className="text-sm text-indigo-800 mt-4 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-left">
              <span className="font-semibold">Next step:</span> open the Google Calendar invitation (check your inbox)
              and tap <strong>Yes</strong> / Accept. You don&apos;t need to reply to our email — this page updates when
              we detect your response (usually within an hour).
            </p>
          )}
          <p className="text-xs text-slate-400 mt-4">
            A confirmation email was also sent. Reach out if you need to reschedule.
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

        {(data.hasPendingAlternativeRequest || data.awaitingAlternatives) && (
          <div className="mt-8 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {data.hasPendingAlternativeRequest
              ? "We're checking alternative times with the hiring team. You can still confirm one of the options above while you wait."
              : "A scheduling request is being processed."}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Need a different time?</h2>
          <p className="text-xs text-slate-500 mb-3">
            We&apos;ll find other slots (AI-ranked when available), ask the interviewer to approve, then email
            you updated options. Your current holds stay in place until new times are approved.
          </p>
          <textarea
            value={altNote}
            onChange={(e) => setAltNote(e.target.value)}
            placeholder="Optional: preferred days or times…"
            rows={3}
            disabled={altSubmitting || data.hasPendingAlternativeRequest}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:bg-slate-50"
          />
          <button
            type="button"
            onClick={submitAlternatives}
            disabled={altSubmitting || data.hasPendingAlternativeRequest}
            className="mt-3 w-full rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-sm font-semibold py-2.5"
          >
            {altSubmitting ? "Sending…" : "Request different times"}
          </button>
          {altMessage && <p className="text-xs mt-2 text-slate-600">{altMessage}</p>}
        </div>
      </div>
    </main>
  );
}
