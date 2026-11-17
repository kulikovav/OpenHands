import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  isGovernedConversationRuntime,
  type AgentServerInfo,
} from "#/api/agent-server-compatibility";
import {
  getConversationServerInfo,
  supportsDockerConversations,
  usesIsolatedWorkspace,
} from "#/api/conversation-workspace";

/** Key prefix of the cached `/server_info` probe for the active local backend. */
export const CONVERSATION_WORKSPACE_QUERY_KEY_PREFIX = "conversation-workspace";

/**
 * The one `/server_info` probe that answers what the active local backend can
 * host. `useConversationWorkspace` and `useGovernedBackend` observe it, so the
 * request runs once per backend and every governed surface agrees.
 */
export function useServerInfoProbe(): UseQueryResult<AgentServerInfo | null> {
  const { backend } = useActiveBackend();
  return useQuery({
    queryKey: [
      CONVERSATION_WORKSPACE_QUERY_KEY_PREFIX,
      backend.id,
      backend.host,
      backend.connectionRevision,
    ],
    queryFn: () => getConversationServerInfo(),
    enabled: backend.kind === "local" && !!backend.host,
    staleTime: 60_000,
    retry: false,
    meta: { disableToast: true },
  });
}

export function useConversationWorkspace() {
  const { t } = useTranslation();
  const { backend } = useActiveBackend();
  const query = useServerInfoProbe();
  const isLocal = backend.kind === "local";
  const isolated = isLocal && usesIsolatedWorkspace(query.data);
  const governed = isLocal && isGovernedConversationRuntime(query.data);
  // While the probe is pending (data undefined) or failed (data null), the
  // backend's runtime is unknown. Host workspaces stay gated for that window:
  // a governed backend would refuse a host-local start with a 422, so the
  // launcher does not offer one. A backend with no host has no probe to wait
  // for, so it keeps the form's own disabled states.
  const probeEnabled = isLocal && !!backend.host;
  const hostWorkspacesUnverified = probeEnabled && !query.data;
  const unsupportedMessage = isolated
    ? t(I18nKey.HOME$ISOLATED_WORKSPACE_NOTICE)
    : governed
      ? t(I18nKey.HOME$GOVERNED_WORKSPACE_NOTICE)
      : hostWorkspacesUnverified
        ? t(I18nKey.HOME$WORKSPACE_PROBE_UNVERIFIED)
        : null;
  return {
    isolated,
    governed,
    dockerSelectable: isLocal && supportsDockerConversations(query.data),
    serverInfoLoading: query.isLoading,
    hostWorkspacesUnverified,
    unsupportedMessage,
  };
}
