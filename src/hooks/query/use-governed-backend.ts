import { useActiveBackend } from "#/contexts/active-backend-context";
import { isGovernedConversationRuntime } from "#/api/agent-server-compatibility";
import { useServerInfoProbe } from "#/hooks/query/use-conversation-workspace";

/**
 * Whether the active backend runs conversations in a governed sandbox.
 *
 * Observes the same cached `/server_info` probe that gates host workspaces
 * (`useConversationWorkspace` owns it), so the drawer tabs, MCP navigation,
 * automations, and LLM settings all answer from one probe. Cloud backends are
 * never governed. `known` is false while the probe is pending or failed:
 * surfaces that must stay unchanged on ungoverned backends gate on it instead
 * of guessing from an unanswered probe.
 */
export function useGovernedBackend() {
  const { backend } = useActiveBackend();
  const query = useServerInfoProbe();
  const isLocal = backend.kind === "local";
  return {
    governed: isLocal && isGovernedConversationRuntime(query.data),
    known: isLocal ? !!query.data : true,
  };
}
