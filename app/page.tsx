"use client";

import { useState } from "react";
import Link from "next/link";
import { jobs, type Job } from "@/lib/jobs";

const remoteColors: Record<Job["remote"], string> = {
  Remote: "bg-emerald-100 text-emerald-700",
  Hybrid: "bg-blue-100 text-blue-700",
  "On-site": "bg-amber-100 text-amber-700",
};

const levelColors: Record<Job["level"], string> = {
  Entry: "bg-slate-100 text-slate-600",
  Mid: "bg-violet-100 text-violet-700",
  Senior: "bg-indigo-100 text-indigo-700",
  Lead: "bg-rose-100 text-rose-700",
  Staff: "bg-orange-100 text-orange-700",
};

function Section({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <h3 className={`text-sm font-semibold uppercase tracking-wide mb-2 ${muted ? "text-slate-400" : "text-slate-700"}`}>
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-600">
            <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{job.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{job.team}</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${remoteColors[job.remote]}`}>
              {job.remote}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${levelColors[job.level]}`}>
              {job.level}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
          {job.location}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
        >
          {expanded ? "Hide" : "View"} full description
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-6 pb-6 pt-5 space-y-5">
          <Section title="Responsibilities" items={job.responsibilities} />
          <Section title="Requirements" items={job.requirements} />
          {job.niceToHave && <Section title="Nice to Have" items={job.niceToHave} muted />}
        </div>
      )}

      <div className="px-6 pb-6">
        <Link
          href={`/apply?role=${job.id}`}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold px-5 py-2.5 transition-colors"
        >
          Apply now
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 mb-4">
            We&apos;re hiring
          </span>
          <h1 className="text-4xl font-bold text-slate-900 leading-tight">
            Build the future of hiring
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto">
            Join a team that&apos;s rethinking how companies find and evaluate talent.
            We move fast, care deeply about craft, and value people who do the same.
          </p>
          <p className="mt-2 text-sm text-slate-400">{jobs.length} open positions</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-5">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </main>
  );
}
