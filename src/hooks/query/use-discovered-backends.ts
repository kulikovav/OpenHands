import { useQuery } from "@tanstack/react-query";
import { getAgentServerBaseUrl } from "#/api/agent-server-config";
import {
  fetchDiscoveryBackends,
  selectForeignReadBackends,
  type DiscoveryBackend,
} from "#/api/discovery/discovery-backends.api";

interface UseDiscoveredBackendsOptions {
  enabled?: boolean;
}

/**
 * The deployment's peer backends: every backend its discovery document reports
 * that is not the ingress itself.
 *
 * This list is the sole permission source for a read-only foreign transcript
 * read, so a caller must never target a host this hook did not return. The
 * document is refreshed often because the deployment compiles it from the live
 * slot units: a slot that starts, stops, or restarts appears without a reload.
 */
export const useDiscoveredBackends = (
  options: UseDiscoveredBackendsOptions = {},
) =>
  useQuery({
    queryKey: ["discovery-backends"],
    queryFn: async ({ signal }): Promise<DiscoveryBackend[]> =>
      selectForeignReadBackends(
        await fetchDiscoveryBackends(signal),
        getAgentServerBaseUrl() ?? "",
      ),
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: 15_000,
    // A deployment without the document is a compatibility state, and the
    // conversation route reports the miss itself.
    meta: { disableToast: true },
  });
