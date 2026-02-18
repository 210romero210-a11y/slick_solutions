import { ConvexHttpClient } from "convex/browser";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type QuoteExplainResponse = {
  quoteId: string;
  message?: string;
  currentQuoteTotal?: {
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    currency: string;
  };
  coefficientBreakdown?: Array<{
    coefficientKey: string;
    coefficientValue: unknown;
  }>;
  explanationTrace?: string[];
};

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required for quote dashboard.");
  }

  return new ConvexHttpClient(convexUrl);
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function QuoteDashboardPage({ params }: PageProps) {
  const { id } = await params;
  const requestHeaders = await headers();
  const cookieStore = await cookies();

  const tenantId = requestHeaders.get("x-tenant-id") ?? cookieStore.get("tenantId")?.value;

  if (!tenantId) {
    redirect("/");
  }

  const client = getConvexClient();

  const quoteExplanation = (await (client as any).query("quotes:explainQuotePrice", {
    tenantId,
    quoteId: id,
  })) as QuoteExplainResponse;

  if (!quoteExplanation) {
    notFound();
  }

  return (
    <main style={{ padding: "2rem", display: "grid", gap: "1.5rem" }}>
      <header>
        <h1>Quote {id}</h1>
        {quoteExplanation.currentQuoteTotal ? (
          <p>
            Current total:{" "}
            <strong>
              {formatCurrency(
                quoteExplanation.currentQuoteTotal.totalCents,
                quoteExplanation.currentQuoteTotal.currency,
              )}
            </strong>
          </p>
        ) : null}
        {quoteExplanation.message ? <p>{quoteExplanation.message}</p> : null}
      </header>

      <section>
        <h2>Coefficient breakdown</h2>
        <ul>
          {(quoteExplanation.coefficientBreakdown ?? []).map((entry) => (
            <li key={entry.coefficientKey}>
              <strong>{entry.coefficientKey}:</strong> {JSON.stringify(entry.coefficientValue)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Explanation trace</h2>
        <ol>
          {(quoteExplanation.explanationTrace ?? []).map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
