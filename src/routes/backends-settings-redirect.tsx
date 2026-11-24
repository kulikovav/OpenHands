import { Navigate } from "react-router";

/**
 * `/settings/backends` duplicated the backend list now owned by Runtime.
 * Send old deep links there instead of the not-found route.
 */
export default function BackendsSettingsRedirect() {
  return <Navigate to="/settings/runtime" replace />;
}
