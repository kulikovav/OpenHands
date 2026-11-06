import { useQuery } from "@tanstack/react-query";
import { fetchAutomationRunsBackend } from "#/api/discovery/automation-runs-backend.api";

interface UseAutomationRunsBackendOptions {
  enabled?: boolean;
}

/**
 * Resolve the deployment's automation runs backend from its discovery
 * document. The read is lazy: the conversation route probes it only after an
 * owner lookup misses on a local backend.
 */
export const useAutomationRunsBackend = (
  options: UseAutomationRunsBackendOptions = {},
) =>
  useQuery({
    queryKey: ["automation-runs-backend"],
    queryFn: ({ signal }) => fetchAutomationRunsBackend(signal),
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: 15_000,
    // A deployment without the document is a compatibility state, and the
    // conversation route reports the miss itself.
    meta: { disableToast: true },
  });
