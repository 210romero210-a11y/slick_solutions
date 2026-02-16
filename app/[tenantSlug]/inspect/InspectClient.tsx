"use client";

import { type FormEvent, type ReactElement, useMemo, useState } from "react";

type InspectClientProps = {
  tenantSlug: string;
};

type AssessmentResult = {
  inspectionId: string;
  status: "quote_ready";
  difficultyScore: number;
  quoteCents: number;
  timelineCount: number;
  ai: {
    source: "ollama" | "heuristic_fallback";
    severity: "minor" | "moderate" | "major" | "critical";
    confidence: number;
    summary: string;
    recommendedServices: string[];
    model: string;
  };
  assessmentRunId: string;
  needsManualReview: boolean;
  reviewStatus: "pending" | "approved" | "rejected";
};

const requiredAngles: string[] = [
  "Front bumper and hood",
  "Rear bumper and trunk",
  "Driver side profile",
  "Passenger side profile",
  "Close-up imperfections",
];

export function InspectClient({ tenantSlug }: InspectClientProps): ReactElement {
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inspectionId = useMemo(() => `insp-${Date.now()}`, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      tenantSlug,
      inspectionId,
      contact: {
        fullName: String(form.get("fullName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
      },
      vin: String(form.get("vin") ?? "").toUpperCase(),
      concernNotes: String(form.get("concernNotes") ?? ""),
      photoUrls: String(form.get("photoUrls") ?? "")
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
      selectedServices: String(form.get("selectedServices") ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    };

    const response = await fetch("/api/assessment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: unknown };
      setError(`Submission failed: ${JSON.stringify(body.error ?? "unknown validation error")}`);
      return;
    }

    const body = (await response.json()) as AssessmentResult;
    setResult(body);
  }

  return (
    <main className="container">
      <h1>Slick Solutions Self-Assessment</h1>
      <p>
        Tenant: <strong>{tenantSlug}</strong> · Inspection ID: <strong>{inspectionId}</strong>
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: "1rem", maxWidth: 680 }}>
        <label>
          Full name
          <input required name="fullName" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Email
          <input required type="email" name="email" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Phone
          <input required name="phone" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          VIN (17 chars)
          <input required name="vin" minLength={17} maxLength={17} style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Requested services (comma separated)
          <input required name="selectedServices" defaultValue="Exterior detail, Interior detail" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Photo URLs (one per line)
          <textarea
            name="photoUrls"
            rows={6}
            defaultValue={"https://example.com/front.jpg\nhttps://example.com/rear.jpg\nhttps://example.com/detail.jpg"}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Notes
          <textarea name="concernNotes" rows={3} style={{ display: "block", width: "100%" }} />
        </label>

        <section>
          <h2>Required capture guide</h2>
          <ul>
            {requiredAngles.map((angle) => (
              <li key={angle}>{angle}</li>
            ))}
          </ul>
        </section>

        <button type="submit">Generate AI-assisted estimate</button>
      </form>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      {result ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>Quote Ready</h2>
          <p>Status: {result.status}</p>
          <p>Difficulty score: {result.difficultyScore}</p>
          <p>Estimated total: ${(result.quoteCents / 100).toFixed(2)}</p>
          <p>Timeline events generated: {result.timelineCount}</p>
          <p>AI source: {result.ai.source}</p>
          <p>AI model: {result.ai.model}</p>
          <p>AI severity: {result.ai.severity}</p>
          <p>AI confidence: {Math.round(result.ai.confidence * 100)}%</p>
          <p>AI summary: {result.ai.summary}</p>
          <p>AI recommended services: {result.ai.recommendedServices.join(", ") || "None"}</p>
          <p>Assessment run ID: {result.assessmentRunId}</p>
          <p>Needs manual review: {result.needsManualReview ? "Yes" : "No"}</p>
          <p>Review status: {result.reviewStatus}</p>
        </section>
      ) : null}
    </main>
  );
}
