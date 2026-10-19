import { useQuery } from "@tanstack/react-query";
import { getAgentServerSessionApiKey } from "#/api/agent-server-config";
import { getEffectiveLocalBackend } from "#/api/backend-registry/active-store";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { DiscoveryBackend } from "#/api/discovery/discovery-backends.api";
import { useDiscoveredBackends } from "./use-discovered-backends";

interface UseConversationOwnerBackendOptions {
  enabled?: boolean;
}

/**
 * Resolve the peer backend that owns a conversation's live runtime.
 *
 * The servers of one deployment share a conversation store, so the active
 * backend can usually catalogue a conversation it does not run. Opening such a
 * conversation against the active backend attaches to a runtime that is not
 * there. This hook finds the server that actually holds it, so the caller can
 * route the transcript read to that peer.
 *
 * Returns null when no peer reports ownership — the caller then keeps its
 * normal path, which is the correct behavior for a conversation the active
 * backend does run, for a single-server deployment, and for a peer set that is
 * unreachable or not yet loaded.
 */
export const useConversationOwnerBackend = (
  conversationId: string | null,
  options: UseConversationOwnerBackendOptions = {},
) => {
  const { data: peers, isFetched: peersFetched } = useDiscoveredBackends({
    enabled: options.enabled ?? true,
  });

  return useQuery({
    // The probe depends on the peer set, so the set belongs in the key: a slot
    // that starts or restarts changes the answer, and the cached result must
    // not outlive it. React Query hashes the array deterministically.
    queryKey: ["conversation-owner-backend", conversationId, peers ?? []],
    queryFn: async (): Promise<DiscoveryBackend | null> => {
      if (!conversationId) return null;

      const apiKey =
        getEffectiveLocalBackend()?.apiKey ??
        getAgentServerSessionApiKey() ??
        undefined;

      // Sequential on purpose: the owner is usually the first or second peer,
      // and one open conversation must not fan out a request per slot. A peer
      // that cannot answer is not the owner, so a failure tries the next one.
      for (const peer of peers ?? []) {
        try {
          const owns = await AgentServerConversationService.ownsRuntimeOn(
            conversationId,
            peer.url,
            apiKey,
          );
          if (owns) return peer;
        } catch {
          continue;
        }
      }
      return null;
    },
    enabled: (options.enabled ?? true) && !!conversationId && peersFetched,
    retry: false,
    staleTime: 15_000,
    // The probe costs one request per peer, so it must not re-run every time
    // the window regains focus.
    refetchOnWindowFocus: false,
    // The conversation route reports a miss itself; a probe must stay silent.
    meta: { disableToast: true },
  });
};
