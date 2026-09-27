import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import {
  isArchivedByTag,
  isArchivedSandboxStatus,
} from "#/utils/conversation-archive-status";

export function useIsArchivedConversation() {
  const { data: conversation } = useActiveConversation();
  // Two marks mean archived: the sandbox is gone, or a client archived the
  // conversation and recorded it in the server tag.
  return (
    isArchivedSandboxStatus(conversation?.sandbox_status) ||
    isArchivedByTag(conversation)
  );
}
