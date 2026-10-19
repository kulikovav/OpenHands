import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { PEER_CONVERSATIONS_QUERY_KEYS } from "#/hooks/query/query-keys";
import { clearConversationLocalStorage } from "#/utils/conversation-local-storage";

/**
 * Every peer backend whose cached list still holds `conversationId`.
 *
 * The peer lists are the only record of which backend still reports the
 * conversation, so the cleanup below targets exactly those backends.
 */
function peerBackendsListingConversation(
  queryClient: QueryClient,
  conversationId: string,
): string[] {
  const urls = new Set<string>();
  for (const [, conversations] of queryClient.getQueriesData<AppConversation[]>(
    {
      queryKey: PEER_CONVERSATIONS_QUERY_KEYS.all,
    },
  )) {
    for (const conversation of conversations ?? []) {
      if (
        conversation.id === conversationId &&
        conversation.source_backend_url
      ) {
        urls.add(conversation.source_backend_url);
      }
    }
  }
  return [...urls];
}

/**
 * Make every peer that still lists a deleted conversation forget it.
 *
 * The deployment's servers share a conversation store but each keeps its own
 * in-memory catalog, so a peer that ran or opened the conversation goes on
 * listing it after another backend deletes it — the panel would show the
 * deleted conversation again from that peer's list. A best-effort delete on
 * each such peer drops the stale record; a peer that cannot act is ignored,
 * because the active backend's delete is the operation that must succeed. The
 * cached peer lists drop the row immediately, so the panel does not wait for
 * the refetch that then confirms the peers no longer report it.
 */
async function forgetDeletedConversationOnPeers(
  queryClient: QueryClient,
  conversationId: string,
): Promise<void> {
  try {
    const peerUrls = peerBackendsListingConversation(
      queryClient,
      conversationId,
    );
    if (peerUrls.length === 0) {
      return;
    }

    queryClient.setQueriesData<AppConversation[]>(
      { queryKey: PEER_CONVERSATIONS_QUERY_KEYS.all },
      (conversations) =>
        conversations?.filter(
          (conversation) => conversation.id !== conversationId,
        ),
    );

    await Promise.allSettled(
      peerUrls.map((peerUrl) =>
        AgentServerConversationService.deleteConversationOn(
          conversationId,
          peerUrl,
        ),
      ),
    );

    queryClient.invalidateQueries({
      queryKey: PEER_CONVERSATIONS_QUERY_KEYS.all,
    });
  } catch (error) {
    // Best-effort: the cleanup must never turn a successful delete into a
    // failed one. React Query awaits onSuccess inside the mutation's own try
    // block, so a throw here would report the delete as failed.
    console.warn(
      `Failed to clean up deleted conversation ${conversationId} on its peers`,
      error,
    );
  }
}

export const useDeleteConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { conversationId: string }) =>
      AgentServerConversationService.deleteConversation(
        variables.conversationId,
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["user", "conversations"] });
      const previousConversations = queryClient.getQueryData([
        "user",
        "conversations",
      ]);

      queryClient.setQueryData(
        ["user", "conversations"],
        (old: { conversation_id: string }[] | undefined) =>
          old?.filter(
            (conv) => conv.conversation_id !== variables.conversationId,
          ),
      );

      return { previousConversations };
    },

    onSuccess: async (_, variables) => {
      clearConversationLocalStorage(variables.conversationId);
      await forgetDeletedConversationOnPeers(
        queryClient,
        variables.conversationId,
      );
    },

    onError: (err, variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(
          ["user", "conversations"],
          context.previousConversations,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
      // Mirror useCreateConversation: cloud surfaces in-flight
      // conversations via useStartTasks, so invalidate that key too so the
      // panel refreshes regardless of whether the deleted item was a ready
      // conversation or a still-provisioning start task.
      queryClient.invalidateQueries({ queryKey: ["start-tasks"] });
    },
  });
};
