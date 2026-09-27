import type { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Server-side tag key that marks a conversation archived. The agent-server has
 * no archive field, so the tag is the only archive channel the server itself
 * carries. The bridge writes it together with its own `bridgearchived` key, and
 * the panel writes it on archive and unarchive, so the mark survives the
 * browser and reaches every client of the same backend.
 */
export const CONVERSATION_ARCHIVED_TAG = "archived";

export function isArchivedSandboxStatus(
  sandboxStatus: SandboxStatus | null | undefined,
): boolean {
  return sandboxStatus === "MISSING" || sandboxStatus === "ERROR";
}

/**
 * Reports whether a conversation's own server tags mark it archived. A
 * backend that returns no tags (cloud) never reads as tag-archived.
 */
export function isArchivedByTag(
  conversation: { tags?: Record<string, string> | null } | null | undefined,
): boolean {
  const value = conversation?.tags?.[CONVERSATION_ARCHIVED_TAG];
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/**
 * Returns the tag map to send when the archive state changes. The agent-server
 * replaces the complete map on PATCH, so the caller must pass the result as the
 * full map, never a single key.
 */
export function withArchivedTag(
  tags: Record<string, string> | null | undefined,
  archived: boolean,
): Record<string, string> {
  return {
    ...(tags ?? {}),
    [CONVERSATION_ARCHIVED_TAG]: archived ? "true" : "false",
  };
}
