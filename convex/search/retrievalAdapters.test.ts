import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTopKResults, type RawSearchResult } from "./types.ts";

test("normalizeTopKResults prevents cross-tenant leakage", () => {
  const rows: RawSearchResult[] = [
    { _id: "a", _score: 0.9, tenantId: "tenant_a", snippet: "A1" },
    { _id: "b", _score: 0.99, tenantId: "tenant_b", snippet: "B1" },
    { _id: "c", _score: 0.8, tenantId: "tenant_a", snippet: "A2" },
  ];

  const normalized = normalizeTopKResults(rows, "tenant_a", 10, {
    kind: "upsell",
    sourceTable: "upsellCatalog",
    sourceIndex: "by_tenant_upsell_embedding",
    tenantFilterApplied: true,
    matchField: "upsellEmbedding",
  });

  assert.equal(normalized.length, 2);
  assert.ok(normalized.every((result) => result.recordId !== "b"));
});

test("normalizeTopKResults enforces top-k ranking by score desc", () => {
  const rows: RawSearchResult[] = [
    { _id: "a", _score: 0.75, tenantId: "tenant_a", snippet: "A1" },
    { _id: "b", _score: 0.97, tenantId: "tenant_a", snippet: "A2" },
    { _id: "c", _score: 0.88, tenantId: "tenant_a", snippet: "A3" },
    { _id: "d", _score: 0.93, tenantId: "tenant_a", snippet: "A4" },
  ];

  const normalized = normalizeTopKResults(rows, "tenant_a", 3, {
    kind: "pricingRule",
    sourceTable: "pricingRules",
    sourceIndex: "by_tenant_pricing_rule_embedding",
    tenantFilterApplied: true,
    matchField: "pricingRuleEmbedding",
  });

  assert.deepEqual(
    normalized.map((result) => result.recordId),
    ["b", "d", "c"],
  );
});
