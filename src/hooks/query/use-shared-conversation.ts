import { useQuery } from "@tanstack/react-query";
import { SharedClient } from "@openhands/typescript-client/clients";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { getAgentServerSessionApiKey } from "#/api/agent-server-config";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "#/api/backend-registry/active-store";
import { getCloudSharedConversation } from "#/api/cloud/shared-conversation-service.api";
import { useAutomationRunsBackend } from "#/hooks/query/use-automation-runs-backend";

interface UseSharedConversationOptions {
  enabled?: boolean;
  /**
   * Root of the deployment that owns the conversation, for a read-only
   * transcript of an automation run. An empty value keeps the active backend.
   */
  host?: string;
}

/** The fields the read-only viewer renders, from either source. */
export interface SharedConversationView {
  id: string;
  title?: string | null;
  selected_branch?: string | null;
  selected_repository?: string | null;
  llm_model?: string | null;
  created_by_user_id?: string | null;
}

export const useSharedConversation = (
  conversationId?: string,
  options: UseSharedConversationOptions = {},
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
  return useQuery<SharedConversationView | null>({
    queryKey: ["shared-conversation", conversationId, host],
    queryFn: async () => {
      if (!conversationId) {
        throw new Error("Conversation ID is required");
      }
      if (host) {
        // An automation run's conversation lives on the runs backend, which
        // serves the agent-server REST API. The read is read-only by
        // construction: this hook never starts or mutates the conversation.
        const apiKey =
          getEffectiveLocalBackend()?.apiKey ??
          getAgentServerSessionApiKey() ??
          undefined;
        const conversation =
          await AgentServerConversationService.getRuntimeConversation(
            conversationId,
            host,
            apiKey,
          );
        return { id: conversation.id, title: conversation.title };
      }
      if (getActiveBackend().backend.kind === "cloud") {
        return getCloudSharedConversation(conversationId);
      }
      return new SharedClient(
        getAgentServerClientOptions(),
      ).getSharedConversation(conversationId);
    },
    enabled: !!conversationId && (options.enabled ?? true) && hostAllowed,
    retry: false, // Don't retry for shared conversations
    // The shared page renders its own not-found state, and the conversation
    // route uses this query as a silent probe before reporting a miss.
    meta: { disableToast: true },
  });
};
