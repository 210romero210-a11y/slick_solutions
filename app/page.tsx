import type { ReactElement } from "react";
import Link from "next/link";

import { sequentialImplementationPlan } from "@/lib/sequentialPlan";

export default function HomePage(): ReactElement {
  return (
    <main className="container">
      <h1>Slick Solutions · Sequential Build</h1>
      <p>
        This codebase now includes a sequential implementation foundation for onboarding, self-assessment,
        dynamic pricing, and booking conversion.
      </p>

      <p>
        Demo tenant flow: <Link href="/demo-detailing/inspect">/demo-detailing/inspect</Link>
      </p>

      <section>
        <h2>Implementation Phases</h2>
        {sequentialImplementationPlan.map((phase) => (
          <article key={phase.id} style={{ marginBottom: "1rem", padding: "0.75rem", border: "1px solid #ccc", borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>{phase.title}</h3>
            <p>{phase.objective}</p>
            <ol>
              {phase.tasks.map((task) => (
                <li key={task.id}>
                  <strong>
                    {task.id} · {task.title}
                  </strong>{" "}
                  [{task.status}] — {task.description}
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>
    </main>
  );
}
