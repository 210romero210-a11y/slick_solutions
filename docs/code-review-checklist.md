# Code review checklist

## Multi-tenant Convex domains

- [ ] All quote/rule/service Convex endpoints call `requireTenantAccess(ctx, tenantId?)` as the first step.
- [ ] Endpoint tenant context is derived from authenticated identity/session; any provided `tenantId` is treated as optional and rejected when mismatched.
- [ ] Tenant data reads use tenant-scoped indexes only (`by_tenant`, `by_tenant_*`, or `byTenant*`).
- [ ] No unscoped `ctx.db.query("<tenant table>")` access in tenant data domains unless immediately constrained by a tenant index.
