import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { setActiveTenantContext } from "../../../../services/api/http";

export default function TenantScopeRedirect() {
  const { tenantId } = useParams();
  const location = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (tenantId) {
      setActiveTenantContext(tenantId, location.state?.tenantName || "");
    }
    setReady(true);
  }, [location.state, tenantId]);

  if (!tenantId) {
    return <Navigate to="/dashboard/superadmin/tenants" replace />;
  }

  if (!ready) {
    return <div style={{ padding: 24 }}>Loading tenant tools...</div>;
  }

  return <Navigate to="/dashboard/admin/users" replace />;
}
