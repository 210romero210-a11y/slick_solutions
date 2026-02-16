"use client";

import type { AssessmentSubmissionResponse, SelfAssessmentPhoto } from "@slick/contracts";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type PageProps = {
  params: {
    tenantSlug: string;
  };
};

type PhotoChecklistItem = {
  label: string;
  kind: SelfAssessmentPhoto["kind"];
};

const photoChecklist: PhotoChecklistItem[] = [
  { label: "Front bumper and hood", kind: "front" },
  { label: "Rear bumper and trunk", kind: "rear" },
  { label: "Driver side panels", kind: "left" },
  { label: "Passenger side panels", kind: "right" },
  { label: "Dashboard and front seats", kind: "interior" },
  { label: "Close-up detail damage shots", kind: "detail" },
];

const createRequestId = (tenantSlug: string): string =>
  `${tenantSlug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function TenantInspectionPage({ params }: PageProps): JSX.Element {
  const { tenantSlug } = params;
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [response, setResponse] = useState<AssessmentSubmissionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedFlow = useMemo(
    () => [
      "Contact capture",
      "VIN capture",
      "Photo intake",
      "AI damage triage",
      "AI dynamic pricing",
      "Quote generation",
      "Delivery to customer",
    ],
    [],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const selectedPhotoKinds = formData.getAll("photos").map((value) => String(value));

    const photos: SelfAssessmentPhoto[] = selectedPhotoKinds.map((kind, index) => ({
      id: `${kind}-${index + 1}`,
      kind: kind as SelfAssessmentPhoto["kind"],
      uploadedAt: new Date().toISOString(),
    }));

    const payload = {
      requestId: createRequestId(tenantSlug),
      tenantSlug,
      customer: {
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
      },
      vehicle: {
        vin: String(formData.get("vin") ?? ""),
      },
      assessment: {
        interiorContaminationLevel: String(formData.get("interiorContaminationLevel") ?? "none"),
        requestsCeramicCoating: formData.get("requestsCeramicCoating") === "on",
        notes: String(formData.get("notes") ?? ""),
      },
      pricing: {
        baseExteriorServicePriceCents: 54900,
        taxRate: 0.07,
        currency: "USD",
      },
      photos,
    };

    try {
      const result = await fetch(`/api/self-assessments/${tenantSlug}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!result.ok) {
        const body = (await result.json()) as { message?: string };
        throw new Error(body.message ?? "Submission failed.");
      }

      const body = (await result.json()) as AssessmentSubmissionResponse;
      setResponse(body);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", fontFamily: "sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", color: "#666" }}>
          {tenantSlug} inspection portal
        </p>
        <h1 style={{ marginTop: 6 }}>Vehicle Self-Assessment Intake</h1>
        <p style={{ color: "#444" }}>
          This flow implements the sequential MVP pipeline: customer intake, VIN capture, guided media,
          AI assessment, dynamic pricing, and quote delivery.
        </p>
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Sequential Workflow</h2>
        <ol style={{ marginBottom: 0 }}>
          {orderedFlow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: "1rem" }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>1) Contact Capture</h2>
          <label>
            Full name
            <input required name="fullName" placeholder="Taylor Morgan" style={{ display: "block", width: "100%" }} />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              name="email"
              placeholder="taylor@example.com"
              style={{ display: "block", width: "100%", marginTop: 8 }}
            />
          </label>
          <label>
            Phone
            <input required name="phone" placeholder="+1 555 010 2828" style={{ display: "block", width: "100%", marginTop: 8 }} />
          </label>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>2) VIN Scan / Manual Entry</h2>
          <input
            required
            name="vin"
            minLength={17}
            maxLength={17}
            placeholder="1HGCM82633A004352"
            style={{ display: "block", width: "100%" }}
          />
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>3) Guided Photo Checklist</h2>
          {photoChecklist.map((item) => (
            <label key={item.label} style={{ display: "block", marginBottom: 6 }}>
              <input type="checkbox" name="photos" value={item.kind} defaultChecked /> {item.label}
            </label>
          ))}
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>4) Condition Inputs</h2>
          <label>
            Interior contamination level
            <select name="interiorContaminationLevel" defaultValue="light" style={{ display: "block", width: "100%" }}>
              <option value="none">None</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            <input type="checkbox" name="requestsCeramicCoating" defaultChecked /> Include ceramic coating option
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notes
            <textarea
              name="notes"
              placeholder="Major stain on rear seats and swirl marks around hood."
              style={{ display: "block", width: "100%" }}
            />
          </label>
        </section>

        <button
          type="submit"
          disabled={submitting}
          style={{ background: "#111", color: "white", padding: "0.75rem 1rem", borderRadius: 6 }}
        >
          {submitting ? "Submitting..." : "Submit Self-Assessment"}
        </button>
      </form>

      {error ? (
        <p style={{ color: "#a00", marginTop: "1rem" }}>
          Submission error: {error}
        </p>
      ) : null}

      {response ? (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>AI Estimate Result</h2>
          <p>
            <strong>Status:</strong> {response.status}
          </p>
          <p>{response.message}</p>
          {response.estimate ? (
            <>
              <p>
                <strong>Total:</strong> {(response.estimate.totalCents / 100).toLocaleString("en-US", {
                  style: "currency",
                  currency: response.estimate.currency,
                })}
              </p>
              <ul>
                {response.estimate.lineItems.map((item) => (
                  <li key={item.code}>
                    {item.name}: {(item.totalPriceCents / 100).toLocaleString("en-US", {
                      style: "currency",
                      currency: response.estimate?.currency,
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h3>Pipeline Timeline</h3>
          <ol>
            {response.timeline.map((event) => (
              <li key={`${event.state}-${event.at}`}>
                {event.state} ({event.actor})
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p style={{ marginTop: "1rem", color: "#444" }}>
        Need help? Restart at the <Link href={`/${tenantSlug}/inspect`}>inspection intake</Link>.
      </p>
    </main>
  );
}
