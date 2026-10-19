import type { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * A sandbox whose runtime is gone and cannot be resumed. Set for a Cloud
 * `sandbox_status: "MISSING"` and for a local runtime the adapter maps from
 * `runtime_info.runtime_status: "missing"` with `can_resume: false`.
 *
 * `ERROR` is deliberately excluded: an errored runtime keeps its red "Error"
 * indicator and is not treated as archived.
 */
export function isMissingSandboxStatus(
  sandboxStatus: SandboxStatus | null | undefined,
): boolean {
  return sandboxStatus === "MISSING";
}

/**
 * Whether the conversation's runtime is unavailable, so runtime-backed
 * affordances (WebSocket, chat input, git/panel toggles) are read-only and
 * its persisted history is the only thing left to read. Covers both a missing
 * (non-resumable) sandbox and an errored one.
 *
 * This is a runtime concern, not an archive concern: do not use it to decide
 * list visibility, the "Archived" chip, or the archive/unarchive direction.
 */
export function isRuntimeUnavailableSandboxStatus(
  sandboxStatus: SandboxStatus | null | undefined,
): boolean {
  return sandboxStatus === "MISSING" || sandboxStatus === "ERROR";
}

/**
 * The single "effective archived" predicate: a conversation is archived when
 * the user explicitly archived it, or when its runtime is missing and
 * non-resumable. Drives the archived presentation (list visibility, the
 * "Archived" chip, the dimmed title, and the status dot) so those never
 * disagree.
 *
 * This is presentation only. Menu availability is a separate concern: a
 * missing, non-resumable runtime cannot be restored from the menu, so such a
 * row offers neither "Archive" nor "Unarchive" even when this returns true.
 */
export function isEffectivelyArchivedConversation(
  sandboxStatus: SandboxStatus | null | undefined,
  explicitlyArchived: boolean,
): boolean {
  return explicitlyArchived || isMissingSandboxStatus(sandboxStatus);
}

/**
 * Server-side tag key that marks a conversation archived. The agent-server has
 * no archive field, so the tag is the only archive channel the server itself
 * carries. The bridge writes it together with its own `bridgearchived` key, and
 * the panel writes it on archive and unarchive, so the mark survives the
 * browser and reaches every client of the same backend.
 */
export const CONVERSATION_ARCHIVED_TAG = "archived";

/**
 * Whether a conversation reads as archived from its backend-reported status.
 *
 * A local runtime the active backend does not host derives `MISSING` on
 * `sandbox_status`, but that means "runs on another backend of this
 * deployment", not "archived". The caller passes the conversation's
 * `runtime_status` so the two cannot be confused; the archive mark itself lives
 * in the browser store and the `archived` tag.
 */
export function isArchivedSandboxStatus(
  sandboxStatus: SandboxStatus | null | undefined,
  runtimeStatus?: string | null,
): boolean {
  if (runtimeStatus === "missing") return false;
  return isRuntimeUnavailableSandboxStatus(sandboxStatus);
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
