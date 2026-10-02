import { useInfiniteQuery } from "@tanstack/react-query";
import { SharedClient } from "@openhands/typescript-client/clients";
import { RemoteEventsList } from "@openhands/typescript-client/events/remote-events-list";
import { getAgentServerSessionApiKey } from "#/api/agent-server-config";
import {
  getAgentServerClientOptions,
  getAgentServerHttpClientOptions,
} from "#/api/agent-server-client-options";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "#/api/backend-registry/active-store";
import {
  searchCloudSharedEvents,
  type SharedEventPage,
} from "#/api/cloud/shared-conversation-service.api";
import { useAutomationRunsBackend } from "#/hooks/query/use-automation-runs-backend";
import type { OpenHandsEvent } from "#/types/agent-server/core";

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
  const requestedHost = options.host?.trim() ?? "";
  const { data: runsBackend, isFetched: isRunsBackendFetched } =
    useAutomationRunsBackend({ enabled: !!requestedHost });
  // A host is honoured only when the deployment's own discovery document
  // reports it as the automation runs backend. Any other value would send the
  // session key to an address the link chose.
  const hostAllowed =
    !requestedHost ||
    (isRunsBackendFetched && runsBackend?.url === requestedHost);
  const host = hostAllowed ? requestedHost : "";
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
        const page = await new RemoteEventsList(
          getAgentServerHttpClientOptions({
            conversationUrl: host,
            sessionApiKey: apiKey,
          }),
          conversationId,
        ).search({
          limit: request.limit,
          ...(request.pageId ? { page_id: request.pageId } : {}),
        });
        return {
          items: (page?.items ?? []) as OpenHandsEvent[],
          next_page_id: page?.next_page_id ?? null,
        };
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
    enabled: !!conversationId && hostAllowed,
    retry: false, // Don't retry for shared conversations
  });
};
