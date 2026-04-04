import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { jobs } from "@/lib/jobs";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const RESUME_BUCKET = "resumes";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const linkedin = (formData.get("linkedin") as string)?.trim();
  const portfolio = (formData.get("portfolio") as string)?.trim() ?? "";
  const role = (formData.get("role") as string)?.trim();
  const resume = formData.get("resume") as File | null;

  // Validate required fields
  if (!fullName) return NextResponse.json({ error: "Missing: fullName" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Missing: email" }, { status: 400 });
  if (!linkedin) return NextResponse.json({ error: "Missing: linkedin" }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Missing: role" }, { status: 400 });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const job = jobs.find((j) => j.id === role);
  if (!job) {
    return NextResponse.json({ error: `Invalid role: "${role}"` }, { status: 400 });
  }

  // Edge case: role closed/paused
  if (!job.open) {
    return NextResponse.json(
      { error: "This position is no longer accepting applications." },
      { status: 409 }
    );
  }

  // Edge case: invalid file format or oversized resume
  if (!resume || resume.size === 0) {
    return NextResponse.json({ error: "Resume is required." }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(resume.type)) {
    return NextResponse.json(
      { error: "Invalid file format. Please upload a PDF or DOCX file." },
      { status: 400 }
    );
  }
  if (resume.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (${(resume.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.` },
      { status: 400 }
    );
  }

  // Ensure bucket exists (creates it on first run if missing)
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.find((b) => b.name === RESUME_BUCKET)) {
    const { error: bucketError } = await supabaseAdmin.storage.createBucket(RESUME_BUCKET, {
      public: false,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      fileSizeLimit: MAX_FILE_SIZE,
    });
    if (bucketError) {
      console.error("Failed to create bucket:", bucketError.message);
      return NextResponse.json({ error: "Storage unavailable. Please try again." }, { status: 500 });
    }
  }

  // Upload resume to Supabase Storage
  const ext = resume.name.split(".").pop();
  const storagePath = `${role}/${Date.now()}_${email.replace(/[^a-z0-9]/gi, "_")}.${ext}`;
  const resumeBytes = await resume.arrayBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .upload(storagePath, resumeBytes, {
      contentType: resume.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Resume upload failed:", uploadError.message);
    return NextResponse.json({ error: "Failed to upload resume. Please try again." }, { status: 500 });
  }

  // Insert application row into `applications` table
  const { error: insertError } = await supabaseAdmin.from("applications").insert({
    full_name: fullName,
    email,
    linkedin_url: linkedin,
    portfolio_url: portfolio || null,
    role_id: role,
    resume_path: storagePath,
  });

  if (insertError) {
    await supabaseAdmin.storage.from(RESUME_BUCKET).remove([storagePath]);
    // Edge case: duplicate application (unique constraint on email + role_id)
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You've already applied for this role. We'll be in touch if there's a match." },
        { status: 409 }
      );
    }
    console.error("DB insert failed:", insertError.message);
    return NextResponse.json({ error: "Failed to save application. Please try again." }, { status: 500 });
  }

  // Send confirmation email (non-blocking — don't fail the request if email fails)
  resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: `We received your application — ${job.title}`,
    html: confirmationEmail({ fullName, jobTitle: job.title, team: job.team }),
  }).catch((err) => console.error("Confirmation email failed:", err));

  return NextResponse.json({ success: true }, { status: 200 });
}

function confirmationEmail({ fullName, jobTitle, team }: { fullName: string; jobTitle: string; team: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#4f46e5;padding:32px 40px;">
            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#c7d2fe;">We're hiring</p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Application received</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${fullName},</p>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              Thanks for applying — we've got your application for the <strong>${jobTitle}</strong> role on our <strong>${team}</strong> team.
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Our team reviews every application carefully. If your background looks like a good fit, we'll reach out within a few business days to set up a call.
            </p>

            <!-- Role pill -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#eef2ff;border-radius:8px;padding:14px 20px;">
                  <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6366f1;">Role applied for</p>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1e1b4b;">${jobTitle} &mdash; ${team}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
              In the meantime, feel free to check out more open roles on our careers page.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              You're receiving this because you applied for a role. If this was a mistake, you can ignore this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
