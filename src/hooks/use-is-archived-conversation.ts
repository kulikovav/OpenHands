import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import {
  isArchivedByTag,
  isArchivedSandboxStatus,
} from "#/utils/conversation-archive-status";

export function useIsArchivedConversation() {
  const { data: conversation } = useActiveConversation();
  // Two marks mean archived: the sandbox is gone, or a client archived the
  // conversation and recorded it in the server tag. A runtime on another
  // backend is neither — it only means this backend cannot host it.
  return (
    isArchivedSandboxStatus(
      conversation?.sandbox_status,
      conversation?.runtime_status,
    ) || isArchivedByTag(conversation)
  );
}
