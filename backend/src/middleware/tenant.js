// backend/src/middleware/tenant.js
import { normalizeRole, getTenantId } from "./authMiddleware.js";

/**
 * Multi-tenant scoping:
 * - For normal admins/teachers: tenant scope is required
 * - For SUPERADMIN: tenant scope is optional (system-wide access)
 *
 * Resolution order (via getTenantId):
 * - req.user.tenantId
 * - req.user.orgId
 * - req.tenantId (if set earlier)
 *
 * If you want frontend override later, extend getTenantId to read:
 * - req.get("x-tenant-id")
 * - req.query.tenantId
 */
export function requireTenant(req, res, next) {
  const role = normalizeRole(req.userRole || req.user?.role);

  // SUPERADMIN can operate without tenant scoping (system routes)
  if (role === "SUPERADMIN") {
    // still set req.tenantId if present, but do not require it
    req.tenantId = getTenantId(req) || null;
    return next();
  }

  const tenantId = getTenantId(req);

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      message: "Missing tenantId",
    });
  }

  req.tenantId = tenantId;
  return next();
}
