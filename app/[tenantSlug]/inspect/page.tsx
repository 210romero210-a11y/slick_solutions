"use client";

import type { AssessmentSubmissionResponse, SelfAssessmentPhoto } from "@slick/contracts";
import { type FormEvent, use, useMemo, useState } from "react";

type InspectPageProps = {
  params: Promise<{
    tenantSlug: string;
  }>;
};

type PhotoChecklistItem = {
  label: string;
  kind: SelfAssessmentPhoto["kind"];
};

type UploadedPhoto = {
  kind: SelfAssessmentPhoto["kind"];
  storageId: string;
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

export default function TenantInspectionPage({ params }: InspectPageProps): JSX.Element {
  const { tenantSlug } = use(params);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [response, setResponse] = useState<AssessmentSubmissionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);

  const orderedFlow = useMemo(
    () => [
      "Contact capture",
      "VIN capture",
      "Signed media upload",
      "AI damage triage",
      "AI dynamic pricing",
      "Quote generation",
      "Delivery to customer",
    ],
    [],
  );

  const uploadPhoto = async (kind: SelfAssessmentPhoto["kind"], file: File): Promise<void> => {
    setUploading(true);

    try {
      const signResponse = await fetch("/api/self-assessments/uploads/sign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          kind,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });

      if (!signResponse.ok) {
        throw new Error("Failed to create upload URL.");
      }

      const signedBody = (await signResponse.json()) as {
        uploadUrl: string;
      };

      const uploadResponse = await fetch(signedBody.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Photo upload failed.");
      }

      const uploadBody = (await uploadResponse.json()) as { storageId: string };
      setUploadedPhotos((current) => {
        const withoutKind = current.filter((entry) => entry.kind !== kind);
        return [...withoutKind, { kind, storageId: uploadBody.storageId }];
      });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    const photos: SelfAssessmentPhoto[] = uploadedPhotos.map((photo, index) => ({
      id: photo.storageId,
      kind: photo.kind,
      uploadedAt: new Date().toISOString(),
      storageId: photo.storageId,
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
            <input required type="email" name="email" placeholder="taylor@example.com" style={{ display: "block", width: "100%", marginTop: 8 }} />
          </label>
          <label>
            Phone
            <input required name="phone" placeholder="+1 555 010 2828" style={{ display: "block", width: "100%", marginTop: 8 }} />
          </label>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>2) VIN Scan / Manual Entry</h2>
          <input required name="vin" minLength={17} maxLength={17} placeholder="1HGCM82633A004352" style={{ display: "block", width: "100%" }} />
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>3) Signed Photo Uploads</h2>
          {photoChecklist.map((item) => {
            const uploaded = uploadedPhotos.find((photo) => photo.kind === item.kind);

            return (
              <label key={item.kind} style={{ display: "block", marginBottom: 10 }}>
                <div>{item.label}</div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) {
                      void uploadPhoto(item.kind, file);
                    }
                  }}
                />
                <div style={{ fontSize: 12, color: "#666" }}>{uploaded ? `Stored: ${uploaded.storageId}` : "Not uploaded yet."}</div>
              </label>
            );
          })}
          <p style={{ marginBottom: 0, color: "#444" }}>{uploading ? "Uploading to signed destination..." : "Each file uploads through a signed URL."}</p>
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
            <textarea name="notes" placeholder="Major stain on rear seats and swirl marks around hood." style={{ display: "block", width: "100%" }} />
          </label>
        </section>

        <button type="submit" disabled={submitting || uploading} style={{ background: "#111", color: "white", padding: "0.75rem 1rem", borderRadius: 6 }}>
          {submitting ? "Submitting..." : "Submit Self-Assessment"}
        </button>
      </form>

      {error ? <p style={{ color: "#a00", marginTop: "1rem" }}>Submission error: {error}</p> : null}

      {response ? (
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", marginTop: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>AI Estimate Result</h2>
          <p>
            <strong>Status:</strong> {response.status}
          </p>
          <p>{response.message}</p>
        </section>
      ) : null}
    </main>
  );
}
