import { useEffect, useState } from "react";

import {
  ACTIVE_TENANT_EVENT,
  getActiveTenantContext,
} from "../../../services/api/http.js";

export default function useActiveTenantScope() {
  const [scope, setScope] = useState(() => getActiveTenantContext());

  useEffect(() => {
    const sync = () => setScope(getActiveTenantContext());

    window.addEventListener("storage", sync);
    window.addEventListener(ACTIVE_TENANT_EVENT, sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ACTIVE_TENANT_EVENT, sync);
    };
  }, []);

  return scope;
}
