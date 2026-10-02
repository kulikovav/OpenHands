import { useInfiniteQuery } from "@tanstack/react-query";
import { SharedClient } from "@openhands/typescript-client/clients";
import EventService from "#/api/event-service/event-service.api";
import { getAgentServerSessionApiKey } from "#/api/agent-server-config";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "#/api/backend-registry/active-store";
import {
  searchCloudSharedEvents,
  type SharedEventPage,
} from "#/api/cloud/shared-conversation-service.api";

interface UseSharedConversationEventsOptions {
  /**
   * Root of the deployment that owns the conversation, for a read-only
   * transcript of an automation run. An empty value keeps the active backend.
   */
  host?: string;
}

export const useSharedConversationEvents = (
  conversationId?: string,
  options: UseSharedConversationEventsOptions = {},
) => {
  const host = options.host?.trim() ?? "";
  return useInfiniteQuery({
    queryKey: ["shared-conversation-events", conversationId, host],
    queryFn: async ({ pageParam }): Promise<SharedEventPage> => {
      if (!conversationId) {
        throw new Error("Conversation ID is required");
      }
      const request = { conversationId, limit: 100, pageId: pageParam };
      if (host) {
        // The runs backend serves the agent-server event search, which is the
        // same log the live conversation view reads.
        const apiKey =
          getEffectiveLocalBackend()?.apiKey ??
          getAgentServerSessionApiKey() ??
          undefined;
        const page = await EventService.searchEvents(
          conversationId,
          host,
          apiKey,
          { limit: request.limit, pageId: request.pageId },
        );
        return { items: page.items, next_page_id: page.next_page_id ?? null };
      }
      if (getActiveBackend().backend.kind === "cloud") {
        return searchCloudSharedEvents(request);
      }
      return new SharedClient(getAgentServerClientOptions()).searchSharedEvents(
        request,
      ) as Promise<SharedEventPage>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_page_id ?? undefined,
    enabled: !!conversationId,
    retry: false, // Don't retry for shared conversations
  });
};
