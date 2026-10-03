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
 * Resolve the peer backend that serves a conversation's transcript.
 *
 * The servers of one deployment share a conversation store, so the active
 * backend can list a conversation whose event log it does not hold: opening it
 * there fails with `404 Conversation not found` from the event search. Only the
 * server that owns the conversation answers that read, so the probe asks it
 * directly rather than trusting a metadata field — no field names the owner.
 *
 * Returns null when the active backend already serves the transcript, when the
 * deployment publishes no peers, and when no peer can serve it. The caller then
 * keeps its normal path, which is correct for a conversation the active backend
 * owns and for a single-server deployment.
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

      // A deployment with no peer has nowhere else to read from. Answering
      // without a request keeps a single-server deployment at zero cost.
      if ((peers?.length ?? 0) === 0) return null;

      const apiKey =
        getEffectiveLocalBackend()?.apiKey ??
        getAgentServerSessionApiKey() ??
        undefined;

      // Ask the active backend first. When it answers, there is nothing to
      // resolve and the common case stays at a single request.
      const activeServes =
        await AgentServerConversationService.canServeTranscriptOn(
          conversationId,
          null,
          apiKey,
        );
      if (activeServes) return null;

      // Sequential on purpose: the owner is usually the first or second peer,
      // and one open conversation must not fan out a request per slot.
      for (const peer of peers ?? []) {
        const peerServes =
          await AgentServerConversationService.canServeTranscriptOn(
            conversationId,
            peer.url,
            apiKey,
          );
        if (peerServes) return peer;
      }
      return null;
    },
    // Waiting for the document keeps the answer correct; the read that would
    // otherwise run against the wrong server waits with it.
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
