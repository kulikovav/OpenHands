import { useQueries } from "@tanstack/react-query";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useDiscoveredBackends } from "./use-discovered-backends";

/** How often each peer's conversation list is refreshed. */
const PEER_CONVERSATIONS_STALE_TIME_MS = 30_000;

/**
 * The conversations the deployment's peer backends list.
 *
 * The agent servers of one deployment share a conversation store but not a
 * catalog: each builds its catalog once at start and extends it only with the
 * conversations it creates itself. A conversation an automation run created on
 * the runs server is therefore absent from the ingress list until the ingress
 * restarts. Reading each peer's list is what makes one backend show the whole
 * deployment.
 *
 * Every returned entry carries `source_backend_url`, which marks it as owned
 * elsewhere so the caller offers no mutation for it.
 */
export const usePeerConversations = (options: { enabled?: boolean } = {}) => {
  const enabled = options.enabled ?? true;
  const { data: peers, isFetched: peersFetched } = useDiscoveredBackends({
    enabled,
  });
  const ready = enabled && peersFetched && (peers?.length ?? 0) > 0;

  return useQueries({
    queries: (ready ? (peers ?? []) : []).map((peer) => ({
      queryKey: ["peer-conversations", peer.url],
      queryFn: () =>
        AgentServerConversationService.searchConversationsOn(peer.url),
      staleTime: PEER_CONVERSATIONS_STALE_TIME_MS,
      // A peer that cannot answer is a compatibility state; the sidebar must
      // not report it as an error on top of the active backend's own list.
      meta: { disableToast: true },
    })),
    combine: (results): AppConversation[] =>
      results.flatMap((result) => result.data ?? []),
  });
};
