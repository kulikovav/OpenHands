import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import {
  isArchivedByTag,
  isArchivedSandboxStatus,
} from "#/utils/conversation-archive-status";

/**
 * Whether the active conversation's runtime is unavailable, so runtime-backed
 * affordances (chat input, git/panel toggles) are read-only, or a client
 * recorded the shared `archived` tag on it.
 *
 * This is the read-only gate, not the archive predicate: use
 * `isEffectivelyArchivedConversation` for the archived presentation (list
 * visibility, the "Archived" chip, the dimmed title, and the status dot).
 */
export function useIsArchivedConversation() {
  const { data: conversation } = useActiveConversation();
  // Two marks mean archived: the sandbox is gone or errored, or a client
  // archived the conversation and recorded it in the server tag. A runtime on
  // another backend is neither - it only means this backend cannot host it.
  return (
    isArchivedSandboxStatus(
      conversation?.sandbox_status,
      conversation?.runtime_status,
    ) || isArchivedByTag(conversation)
  );
}
