import { useConversationOwnerBackend } from "#/hooks/query/use-conversation-owner-backend";

/**
 * Root of the deployment that owns a conversation, or null when the active
 * backend does. Mutations pass it so a peer-owned conversation is written on
 * the server that holds it instead of the one that only lists it.
 */
export function useOwnerConversationUrl(conversationId?: string | null) {
  const { data: ownerBackend } = useConversationOwnerBackend(
    conversationId ?? null,
    { enabled: !!conversationId },
  );
  return ownerBackend?.url ?? null;
}
