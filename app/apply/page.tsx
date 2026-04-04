"use client";

import { useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { jobs } from "@/lib/jobs";

type FormState = "idle" | "submitting" | "success" | "error";

function ApplyForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedRole = searchParams.get("role") ?? "";

  const [state, setFormState] = useState<FormState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fields, setFields] = useState({
    fullName: "",
    email: "",
    linkedin: "",
    portfolio: "",
    role: preselectedRole,
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!fields.fullName.trim()) e.fullName = "Full name is required.";
    if (!fields.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) e.email = "Enter a valid email address.";
    if (!fields.role) e.role = "Please select a role.";
    if (!fileInputRef.current?.files?.[0]) e.resume = "Please upload your resume.";
    return e;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setFields((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((err) => ({ ...err, [e.target.name]: "" }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setErrors((err) => ({ ...err, resume: "" }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setFormState("submitting");
    const formData = new FormData();
    Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
    const file = fileInputRef.current!.files![0];
    formData.append("resume", file);

    try {
      const res = await fetch("/api/apply", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      setFormState("success");
    } catch {
      setFormState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="text-center py-16 px-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-5">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Application submitted!</h2>
        <p className="mt-2 text-slate-500 max-w-sm mx-auto">
          Thanks for applying. We review every application carefully and will be in touch soon.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to open roles
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Full Name */}
      <Field label="Full Name" required error={errors.fullName}>
        <input
          type="text"
          name="fullName"
          value={fields.fullName}
          onChange={handleChange}
          placeholder="Jane Smith"
          className={inputCls(errors.fullName)}
        />
      </Field>

      {/* Email */}
      <Field label="Email Address" required error={errors.email}>
        <input
          type="email"
          name="email"
          value={fields.email}
          onChange={handleChange}
          placeholder="jane@example.com"
          className={inputCls(errors.email)}
        />
      </Field>

      {/* LinkedIn */}
      <Field label="LinkedIn URL" required error={errors.linkedin}>
        <input
          type="url"
          name="linkedin"
          value={fields.linkedin}
          onChange={handleChange}
          placeholder="https://linkedin.com/in/janesmith"
          className={inputCls(errors.linkedin)}
        />
      </Field>

      {/* Portfolio / GitHub */}
      <Field label="Portfolio / GitHub URL" hint="Optional" error={errors.portfolio}>
        <input
          type="url"
          name="portfolio"
          value={fields.portfolio}
          onChange={handleChange}
          placeholder="https://github.com/janesmith"
          className={inputCls(errors.portfolio)}
        />
      </Field>

      {/* Role */}
      <Field label="Role" required error={errors.role}>
        <select
          name="role"
          value={fields.role}
          onChange={handleChange}
          className={`${inputCls(errors.role)} bg-white`}
        >
          <option value="">Select a role…</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} — {job.team}
            </option>
          ))}
        </select>
      </Field>

      {/* Resume */}
      <Field label="Resume" required hint="PDF or DOCX" error={errors.resume}>
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            errors.resume
              ? "border-red-300 bg-red-50"
              : "border-slate-200 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50"
          }`}
        >
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          {fileName ? (
            <span className="text-sm font-medium text-indigo-600">{fileName}</span>
          ) : (
            <>
              <span className="text-sm font-medium text-slate-700">Click to upload</span>
              <span className="text-xs text-slate-400">PDF or DOCX, up to 10 MB</span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </Field>

      {state === "error" && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          Something went wrong. Please try again.
        </p>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 text-white text-sm font-semibold py-3 transition-colors"
      >
        {state === "submitting" ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}

function inputCls(error?: string) {
  return `w-full rounded-xl border px-4 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
    error ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:border-slate-300"
  }`;
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-indigo-500">*</span>}
        {hint && <span className="text-xs font-normal text-slate-400">({hint})</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function ApplyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          All open roles
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-slate-900">Apply for a role</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fill out the form below and we&apos;ll get back to you within a few business days.
          </p>

          <div className="mt-8">
            <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
              <ApplyForm />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
