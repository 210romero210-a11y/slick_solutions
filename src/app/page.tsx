import { CreateLeadRequestSchema } from "@slick/contracts";

export default function HomePage(): JSX.Element {
  const schemaFields = Object.keys(CreateLeadRequestSchema.shape).join(", ");

  return (
    <main className="container">
      <h1>Next.js + Convex Baseline</h1>
      <p>
        Shared contracts are wired: <strong>{schemaFields}</strong>
      </p>
    </main>
  );
}
