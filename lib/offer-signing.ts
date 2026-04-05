import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { jobs } from "./jobs";

const resend = new Resend(process.env.RESEND_API_KEY!);

export function getRequestClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function baseUrlFromEnv(): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.trim() || "http://localhost:3000";
}

export async function sendOfferSigningLinkEmail(params: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  signingUrl: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL are required to email the signing link.");
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: params.candidateEmail,
    subject: `Please review and sign your offer — ${params.jobTitle}`,
    text: `Hi ${params.candidateName},

Please open the link below to read your offer letter and sign it electronically in our secure portal.

${params.signingUrl}

This link is personal to you. If you have questions, reply to the hiring team.

Best,
The Hiring Team`,
  });
}

export async function sendOfferSignedAlertEmails(params: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  roleId: string;
  signedAtIso: string;
  signerIp: string;
  signatureMethod: "typed" | "drawn";
}): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.warn("[offer-signing] Skipping alert email — Resend not configured.");
    return;
  }

  const job = jobs.find((j) => j.id === params.roleId);
  const primaryTo = job?.interviewerEmail;
  const extra = process.env.OFFER_SIGN_ALERT_EMAIL?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const recipients = [...new Set([primaryTo, ...extra].filter(Boolean) as string[])];

  if (recipients.length === 0) {
    console.warn("[offer-signing] No alert recipients — set job interviewerEmail or OFFER_SIGN_ALERT_EMAIL.");
    return;
  }

  const body = `${params.candidateName} (${params.candidateEmail}) signed the offer letter for ${params.jobTitle}.

Time (server): ${params.signedAtIso}
IP address: ${params.signerIp}
Signature: ${params.signatureMethod === "typed" ? "typed legal name" : "drawn signature (stored)"}

Open the admin candidate record to review the captured signature and audit details.`;

  await Promise.all(
    recipients.map((to) =>
      resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to,
        subject: `Signed: offer letter — ${params.candidateName} (${params.jobTitle})`,
        text: body,
      })
    )
  );
}
