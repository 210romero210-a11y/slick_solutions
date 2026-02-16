import Link from "next/link";

type PageProps = {
  params: {
    tenantSlug: string;
  };
};

const photoChecklist = [
  "Front bumper and hood",
  "Rear bumper and trunk",
  "Driver side panels",
  "Passenger side panels",
  "Close-up detail damage shots",
];

export default function TenantInspectionPage({ params }: PageProps) {
  const { tenantSlug } = params;

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1rem", fontFamily: "sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", color: "#666" }}>
          {tenantSlug} inspection portal
        </p>
        <h1 style={{ marginTop: 6 }}>Vehicle Inspection Intake</h1>
        <p style={{ color: "#444" }}>
          You arrived from a static QR code. Complete your contact details, provide VIN data, and upload
          guided photos to start the AI-assisted inspection workflow.
        </p>
      </header>

      <form action="/api/quotes/demo/deliver" method="post" style={{ display: "grid", gap: "1rem" }}>
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
          <p style={{ marginTop: 0, color: "#444" }}>
            Scan the VIN barcode from your registration card or type the 17-character VIN below.
          </p>
          <input required name="vin" minLength={17} maxLength={17} placeholder="1HGCM82633A004352" style={{ display: "block", width: "100%" }} />
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>3) Guided Photo Upload</h2>
          <ul>
            {photoChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <input name="photos" type="file" multiple accept="image/*" />
          <p style={{ color: "#555", marginBottom: 0 }}>
            Photos are attached to your inspection timeline and passed into damage triage + report generation.
          </p>
        </section>

        <button type="submit" style={{ background: "#111", color: "white", padding: "0.75rem 1rem", borderRadius: 6 }}>
          Submit Inspection Intake
        </button>
      </form>

      <p style={{ marginTop: "1rem", color: "#444" }}>
        Need help? Return to the <Link href={`/${tenantSlug}/inspect`}>inspection start</Link>.
      </p>
    </main>
  );
}
