/**
 * Execution-target helpers for the governed Automations surface.
 *
 * The automation service allows a governed backend only when one of its
 * targets has the same origin as the active backend. The comparison ignores
 * the scheme and trailing slashes: the service stores the deployment's public
 * origin while Canvas may hold the same host over either scheme.
 */
import type { AutomationTarget } from "#/manifests/types";
import { AutomationRunStatus, type AutomationRun } from "#/types/automation";
import { getApiErrorBody } from "#/utils/api-error-message";

/** Capability feature that announces the target list. */
export const AUTOMATION_GOVERNED_TARGETS_FEATURE = "governedTargets";

/** The form value that means "no target": the deployment's default backend. */
export const AUTOMATION_DEFAULT_TARGET = "";

export function normalizeAutomationOrigin(origin: string): string {
  return origin
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/\/+$/, "");
}

/**
 * The target whose origin is the active backend, or null when the deployment
 * allows none. A deployment or backend without targets refuses the surface.
 */
export function findAutomationTarget(
  targets: readonly AutomationTarget[] | null | undefined,
  backendOrigin: string,
): AutomationTarget | null {
  if (!targets?.length) return null;
  const origin = normalizeAutomationOrigin(backendOrigin);
  if (!origin) return null;
  return (
    targets.find(
      (target) => normalizeAutomationOrigin(target.origin) === origin,
    ) ?? null
  );
}

/**
 * Whether a target change is locked. The service refuses a change while any
 * run of the automation is still pending or running, so the selector says so
 * instead of letting the save fail.
 */
export function hasLiveAutomationRun(
  runs: readonly AutomationRun[] | null | undefined,
): boolean {
  return (runs ?? []).some(
    (run) =>
      run.status === AutomationRunStatus.PENDING ||
      run.status === AutomationRunStatus.RUNNING,
  );
}

function structuredFieldErrors(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const detail = (body as { detail?: unknown }).detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const errors = (detail as { errors?: unknown }).errors;
    if (Array.isArray(errors)) return errors;
  }
  const errors = (body as { errors?: unknown }).errors;
  return Array.isArray(errors) ? errors : [];
}

/**
 * The server's message for a refused field, such as `target_unavailable` on
 * `target_id`. Returns null when the failure is not addressed to the field, so
 * the caller keeps the generic error toast.
 */
export function getAutomationTargetFieldError(
  error: unknown,
  field = "target_id",
): string | null {
  for (const entry of structuredFieldErrors(getApiErrorBody(error))) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (record.field !== field && record.code !== "target_unavailable") {
      continue;
    }
    if (typeof record.message === "string" && record.message) {
      return record.message;
    }
  }
  return null;
}
