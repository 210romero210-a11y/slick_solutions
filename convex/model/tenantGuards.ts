
import { requireAuthenticatedIdentity } from "./auth.ts";

type TenantIdentityShape = {
  tenantId?: string;
  claims?: {
    tenantId?: string;
  };
  organization_id?: string;
};

export function extractTenantIdFromIdentity(identity: unknown): string | null {
  if (!identity || typeof identity !== "object") {
    return null;
  }

  const typedIdentity = identity as TenantIdentityShape;
  const rawTenantId = typedIdentity.tenantId ?? typedIdentity.claims?.tenantId ?? typedIdentity.organization_id;

  if (!rawTenantId) {
    return null;
  }

  return rawTenantId as string;
}

export function resolveEffectiveTenantId(
  identity: unknown,
  requestedTenantId?: string,
): string {
  const identityTenantId = extractTenantIdFromIdentity(identity);

  if (identityTenantId && requestedTenantId && identityTenantId !== requestedTenantId) {
    throw new Error("Forbidden: tenantId does not match authenticated session");
  }

  const effectiveTenantId = identityTenantId ?? requestedTenantId;

  if (!effectiveTenantId) {
    throw new Error("Forbidden: tenant context is required");
  }

  return effectiveTenantId;
}

export async function requireTenantAccess(
  ctx: { auth: { getUserIdentity: () => Promise<unknown> } },
  requestedTenantId?: string,
): Promise<string> {
  const identity = await requireAuthenticatedIdentity(ctx);
  return resolveEffectiveTenantId(identity, requestedTenantId);
}
