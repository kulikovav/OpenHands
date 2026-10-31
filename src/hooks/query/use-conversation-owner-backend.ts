import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAgentServerSessionApiKey } from "#/api/agent-server-config";
import { getEffectiveLocalBackend } from "#/api/backend-registry/active-store";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { DiscoveryBackend } from "#/api/discovery/discovery-backends.api";
import {
  discoveryBackendsQueryOptions,
  useDiscoveredBackends,
} from "./use-discovered-backends";

interface UseConversationOwnerBackendOptions {
  enabled?: boolean;
}

/**
 * Ask the servers of the deployment which one serves a conversation's
 * transcript. Returns null when the active backend already serves it, when the
 * deployment publishes no peer, and when no peer can serve it.
 *
 * The servers of one deployment share a conversation store, so the active
 * backend can list a conversation whose event log it does not hold: opening it
 * there fails with `404 Conversation not found` from the event search. Only the
 * server that owns the conversation answers that read, so the probe asks it
 * directly rather than trusting a metadata field — no field names the owner.
 */
export async function resolveConversationOwnerBackend(
  conversationId: string,
  peers: DiscoveryBackend[],
): Promise<DiscoveryBackend | null> {
  const apiKey =
    getEffectiveLocalBackend()?.apiKey ??
    getAgentServerSessionApiKey() ??
    undefined;

  // A deployment with no peer has nowhere else to read from. Answering
  // without a request keeps a single-server deployment at zero cost.
  if (peers.length === 0) return null;

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
  for (const peer of peers) {
    const peerServes =
      await AgentServerConversationService.canServeTranscriptOn(
        conversationId,
        peer.url,
        apiKey,
      );
    if (peerServes) return peer;
  }
  return null;
}

/**
 * Resolve the peer backend that serves a conversation's transcript.
 *
 * Returns null in the same cases as {@link resolveConversationOwnerBackend}.
 * The caller then keeps its normal path, which is correct for a conversation
 * the active backend owns and for a single-server deployment.
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
      return resolveConversationOwnerBackend(conversationId, peers ?? []);
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

/**
 * Resolve the owning backend URL for a conversation on demand.
 *
 * The conversation route resolves the owner declaratively with
 * {@link useConversationOwnerBackend}. A caller that mutates a row it did not
 * open — the conversation panel's tag writes — needs the answer at the moment
 * of the write.
 *
 * The answer waits for the discovery document: an unfetched peer list would
 * read as "no other owner" and send the write to the wrong backend.
 */
export const useConversationOwnerUrlResolver = () => {
  const queryClient = useQueryClient();
  const { data: peers, isFetched } = useDiscoveredBackends();

  return useCallback(
    async (conversationId: string): Promise<string | undefined> => {
      // A failed refresh keeps the last known list; only a cold failure (no
      // list at all) is a discovery error, and it must not read as "no owner".
      if (!isFetched) {
        const refreshed = await queryClient.fetchQuery(
          discoveryBackendsQueryOptions(),
        );
        if (refreshed === undefined) return undefined;
      }
      const owner = await resolveConversationOwnerBackend(
        conversationId,
        peers ?? [],
      );
      return owner?.url;
    },
    [isFetched, peers, queryClient],
  );
};
