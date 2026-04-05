import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { setActiveTenantId } from "../../../../services/api/http";

export default function TenantScopeRedirect() {
  const { tenantId } = useParams();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (tenantId) {
      setActiveTenantId(tenantId);
    }
    setReady(true);
  }, [tenantId]);

  if (!tenantId) {
    return <Navigate to="/dashboard/superadmin/tenants" replace />;
  }

  if (!ready) {
    return <div style={{ padding: 24 }}>Loading tenant tools...</div>;
  }

  return <Navigate to="/dashboard/admin/users" replace />;
}
