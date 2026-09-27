import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import {
  isArchivedByTag,
  isRuntimeUnavailableSandboxStatus,
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
  // Two marks mean archived: the runtime is unavailable, or a client archived
  // the conversation and recorded it in the server tag.
  return (
    isRuntimeUnavailableSandboxStatus(conversation?.sandbox_status) ||
    isArchivedByTag(conversation)
  );
}
