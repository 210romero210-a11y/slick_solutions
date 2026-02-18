import assert from "node:assert/strict";
import test from "node:test";

import { resolveEffectiveTenantId } from "./tenantGuards.ts";

test("cross-tenant read attempt is rejected when request tenant differs from identity tenant", () => {
  assert.throws(
    () => resolveEffectiveTenantId({ tenantId: "tenant_a" }, "tenant_b"),
    /tenantId does not match authenticated session/,
  );
});

test("cross-tenant write attempt is rejected when request tenant differs from identity tenant", () => {
  assert.throws(
    () => resolveEffectiveTenantId({ claims: { tenantId: "tenant_a" } }, "tenant_b"),
    /tenantId does not match authenticated session/,
  );
});

test("tenant is derived from authenticated identity when no tenant argument is provided", () => {
  assert.equal(resolveEffectiveTenantId({ tenantId: "tenant_a" }), "tenant_a");
});

test("tenant argument is accepted when identity tenant claim is absent", () => {
  assert.equal(resolveEffectiveTenantId({}, "tenant_b"), "tenant_b");
});
