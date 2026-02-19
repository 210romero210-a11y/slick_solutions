import assert from "node:assert/strict";
import test from "node:test";

import { AgentRunner, type AgentPersistence, type TenantMemoryRecord } from "./agentRunner.ts";
import { deliveryAgent, inspectionAgent, pricingAgent, upsellAgent } from "./agents/index.ts";
import { createDefaultToolRegistry } from "./tools.ts";

class InMemoryPersistence implements AgentPersistence {
  private runCount = 0;

  private readonly memory = new Map<string, TenantMemoryRecord[]>();

  async createRun(_entry: {
    tenantId: string;
    agentName: string;
    runType: string;
    targetType?: string;
    targetId?: string;
    input: unknown;
    startedAt: number;
  }): Promise<string> {
    this.runCount += 1;
    return `run_${this.runCount}`;
  }

  async completeRun(_runId: string, _output: unknown, _finishedAt: number): Promise<void> {}

  async failRun(_runId: string, _error: unknown, _finishedAt: number): Promise<void> {}

  async getTenantMemory(tenantId: string, namespace: string, _limit?: number): Promise<TenantMemoryRecord[]> {
    return this.memory.get(`${tenantId}:${namespace}`) ?? [];
  }

  async storeTenantMemory(record: {
    tenantId: string;
    namespace: string;
    key: string;
    value: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const bucketKey = `${record.tenantId}:${record.namespace}`;
    const current = this.memory.get(bucketKey) ?? [];
    const id = `mem_${current.length + 1}`;

    current.unshift({
      id,
      tenantId: record.tenantId,
      namespace: record.namespace,
      key: record.key,
      content: record.value,
      ...(record.metadata ? { metadata: record.metadata } : {}),
      createdAt: Date.now(),
    });
    this.memory.set(bucketKey, current);
    return id;
  }
}

test("agents return schema-validated structured outputs", async () => {
  const runner = new AgentRunner(new InMemoryPersistence(), createDefaultToolRegistry());

  const inspection = await runner.run("tenant_1", inspectionAgent, { vin: "WVWTEST123" });
  assert.ok(inspection.output.summary.length > 0);

  const pricing = await runner.run("tenant_1", pricingAgent, {
    laborCents: 30_000,
    materialsCents: 10_000,
    taxRate: 0.08,
  });
  assert.equal(pricing.output.total, 43_200);

  const upsell = await runner.run("tenant_1", upsellAgent, {
    summary: inspection.output.summary,
    estimatedTotalCents: pricing.output.total,
  });
  assert.ok(upsell.output.opportunities.length > 0);

  const delivery = await runner.run("tenant_1", deliveryAgent, {
    customerName: "Alex",
    priceTotalCents: pricing.output.total,
  });
  assert.equal(delivery.output.channel, "email");
});

test("memory namespace strategy isolates tenant memory", async () => {
  const persistence = new InMemoryPersistence();
  const runner = new AgentRunner(persistence, createDefaultToolRegistry());

  await runner.remember("tenant_a", "inspection", "summary", "Tenant A only");
  await runner.remember("tenant_b", "inspection", "summary", "Tenant B only");

  const tenantAResult = await runner.run("tenant_a", inspectionAgent, { vin: "AAA111" });
  const tenantBResult = await runner.run("tenant_b", inspectionAgent, { vin: "BBB111" });

  assert.ok(tenantAResult.output.recommendedActions.some((item) => item.includes("Tenant A")));
  assert.ok(tenantBResult.output.recommendedActions.some((item) => item.includes("Tenant B")));
  assert.ok(!tenantAResult.output.recommendedActions.some((item) => item.includes("Tenant B")));
});
