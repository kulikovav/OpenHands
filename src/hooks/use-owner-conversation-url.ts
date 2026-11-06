import { useActiveConversation } from "#/hooks/query/use-active-conversation";

/**
 * The conversation URL of the backend that holds the open conversation.
 *
 * The conversation route resolves the owning server into `conversation_url`, so
 * a conversation-view operation passes this to target the server that holds the
 * conversation instead of the active backend. Returns `undefined` when the
 * loaded conversation is not the requested one, so a mismatch cannot point an
 * operation at another conversation's server.
 */
export const useOwnerConversationUrl = (
  conversationId: string | null | undefined,
): string | undefined => {
  const { data: conversation } = useActiveConversation();
  return conversation?.id === conversationId
    ? (conversation?.conversation_url ?? undefined)
    : undefined;
};
