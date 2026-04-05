"use client";

import { useEffect, useRef, useState, use } from "react";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      candidateFirstName: string;
      letterBody: string;
      alreadySigned: boolean;
      signedAt: string | null;
    };

export default function OfferSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState("");
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    fetch(`/api/offer/sign/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setLoad({ kind: "error", message: d.error });
          return;
        }
        setLoad({
          kind: "ready",
          candidateFirstName: d.candidateFirstName ?? "there",
          letterBody: d.letterBody ?? "",
          alreadySigned: !!d.alreadySigned,
          signedAt: d.signedAt ?? null,
        });
      })
      .catch(() => setLoad({ kind: "error", message: "Could not load this page." }));
  }, [token]);

  useEffect(() => {
    if (load.kind !== "ready" || load.alreadySigned || mode !== "drawn") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    hasInk.current = false;
  }, [load, mode]);

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    if ("touches" in e && e.touches[0]) {
      return {
        x: (e.touches[0].clientX - r.left) * scaleX,
        y: (e.touches[0].clientY - r.top) * scaleY,
      };
    }
    const me = e as React.MouseEvent;
    return {
      x: (me.clientX - r.left) * scaleX,
      y: (me.clientY - r.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (load.kind !== "ready" || load.alreadySigned) return;
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    hasInk.current = true;
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }

  function endDraw() {
    drawing.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }

  async function submit() {
    if (load.kind !== "ready" || load.alreadySigned) return;
    setSubmitError(null);
    if (!accept) {
      setSubmitError("Please confirm that you accept electronic signature.");
      return;
    }

    let body: Record<string, unknown> = {
      acceptElectronicSignature: true,
      signatureMethod: mode,
    };

    if (mode === "typed") {
      if (typedName.trim().length < 2) {
        setSubmitError("Enter your full legal name.");
        return;
      }
      body.typedLegalName = typedName.trim();
    } else {
      const canvas = canvasRef.current;
      if (!canvas || !hasInk.current) {
        setSubmitError("Please draw your signature in the box.");
        return;
      }
      body.drawnSignaturePng = canvas.toDataURL("image/png");
    }

    setSubmitting(true);
    const res = await fetch(`/api/offer/sign/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(data.error ?? "Could not submit signature.");
      return;
    }
    setLoad({
      kind: "ready",
      candidateFirstName: load.candidateFirstName,
      letterBody: load.letterBody,
      alreadySigned: true,
      signedAt: data.signedAt ?? new Date().toISOString(),
    });
  }

  if (load.kind === "loading") {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading offer…</p>
      </main>
    );
  }

  if (load.kind === "error") {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-red-100 p-8 max-w-md text-center">
          <p className="text-red-600 font-medium">{load.message}</p>
        </div>
      </main>
    );
  }

  if (load.alreadySigned) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl border border-emerald-200 p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Thank you, {load.candidateFirstName}</h1>
          <p className="text-slate-600 text-sm mt-2">
            Your signature has been recorded. The hiring team has been notified.
          </p>
          {load.signedAt && (
            <p className="text-xs text-slate-400 mt-4">
              Submitted {new Date(load.signedAt).toLocaleString()}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Sign your offer letter</h1>
          <p className="text-slate-600 text-sm mt-1">
            Hi {load.candidateFirstName} — please read the document below, then sign electronically.
          </p>
        </header>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 max-h-[50vh] overflow-y-auto">
          <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans leading-relaxed">
            {load.letterBody}
          </pre>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-800">Your signature</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("typed")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                mode === "typed" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              Type full legal name
            </button>
            <button
              type="button"
              onClick={() => setMode("drawn")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                mode === "drawn" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              Draw signature
            </button>
          </div>

          {mode === "typed" ? (
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Full legal name (as on government ID)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          ) : (
            <div className="space-y-2">
              <canvas
                ref={canvasRef}
                width={560}
                height={180}
                className="w-full max-w-full h-40 border-2 border-slate-200 rounded-xl touch-none cursor-crosshair bg-white"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={(e) => {
                  e.preventDefault();
                  startDraw(e);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  draw(e);
                }}
                onTouchEnd={endDraw}
              />
              <button
                type="button"
                onClick={clearCanvas}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Clear
              </button>
            </div>
          )}

          <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-1 rounded border-slate-300"
            />
            <span>
              I have read this offer letter and agree that my {mode === "typed" ? "typed name" : "drawn signature"}{" "}
              constitutes my electronic signature and has the same legal effect as a handwritten signature.
            </span>
          </label>

          {submitError && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-3"
          >
            {submitting ? "Submitting…" : "Submit signature"}
          </button>
        </section>
      </div>
    </main>
  );
}
