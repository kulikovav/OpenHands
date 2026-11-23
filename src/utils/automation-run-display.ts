import { I18nKey } from "#/i18n/declaration";
import {
  AutomationRunStatus,
  type AutomationRun,
  type AutomationTaskOutcomeStatus,
} from "#/types/automation";

export type AutomationRunBadgeStatus =
  AutomationRunStatus | AutomationTaskOutcomeStatus;

export interface AutomationRunTaskOutcome {
  status: AutomationTaskOutcomeStatus;
  outcomeSummary: string | null;
}

export interface AutomationRunDisplay {
  badgeStatus: AutomationRunBadgeStatus;
  summary: string | null;
  taskOutcome: AutomationRunTaskOutcome | null;
  customTaskMetadata: unknown | null;
  customTaskMetadataText: string | null;
}

const TASK_OUTCOME_STATUSES: readonly AutomationTaskOutcomeStatus[] = [
  "success",
  "partial_success",
  "blocked",
  "failed",
  "unknown",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTaskOutcomeStatus(
  value: unknown,
): value is AutomationTaskOutcomeStatus {
  return (
    typeof value === "string" &&
    TASK_OUTCOME_STATUSES.includes(value as AutomationTaskOutcomeStatus)
  );
}

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

const DEFAULT_FINISH_TOOL_RESPONSE_KEYS = new Set([
  "status",
  "outcome_summary",
]);

export function getAutomationRunFinishToolResponse(
  run: AutomationRun,
): unknown | null {
  const response = run.run_metadata?.finish_tool_response;
  return response === undefined || response === null ? null : response;
}

export function formatAutomationRunTaskMetadata(
  metadata: unknown,
): string | null {
  const trimmed = trimString(metadata);
  if (trimmed) return trimmed;
  if (typeof metadata === "number" || typeof metadata === "boolean") {
    return String(metadata);
  }
  if (metadata === null || metadata === undefined) return null;

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

function getCustomFinishToolMetadata(response: unknown): unknown | null {
  if (response === null || response === undefined) return null;
  if (!isRecord(response)) return response;

  const customEntries = Object.entries(response).filter(
    ([key]) => !DEFAULT_FINISH_TOOL_RESPONSE_KEYS.has(key),
  );
  if (customEntries.length > 0) return Object.fromEntries(customEntries);

  if ("status" in response && !isTaskOutcomeStatus(response.status)) {
    return { status: response.status };
  }

  return null;
}

export function getAutomationRunTaskSummary(run: AutomationRun): string | null {
  const response = getAutomationRunFinishToolResponse(run);
  return isRecord(response) ? trimString(response.outcome_summary) : null;
}

export function getAutomationRunTaskOutcome(
  run: AutomationRun,
): AutomationRunTaskOutcome | null {
  const response = getAutomationRunFinishToolResponse(run);
  if (!isRecord(response)) return null;

  const outcomeSummary = trimString(response.outcome_summary);
  const hasStatus = typeof response.status === "string";
  if (!hasStatus) return null;

  return {
    status: isTaskOutcomeStatus(response.status) ? response.status : "unknown",
    outcomeSummary,
  };
}

export function getAutomationRunDisplay(
  run: AutomationRun,
): AutomationRunDisplay {
  const finishToolResponse = getAutomationRunFinishToolResponse(run);
  const customTaskMetadata = getCustomFinishToolMetadata(finishToolResponse);
  const customTaskMetadataText =
    formatAutomationRunTaskMetadata(customTaskMetadata);
  const taskOutcome = getAutomationRunTaskOutcome(run);
  const systemSummary = trimString(run.error_detail);

  if (run.status === AutomationRunStatus.COMPLETED) {
    const outcomeSummary =
      taskOutcome?.outcomeSummary ??
      (isRecord(finishToolResponse)
        ? trimString(finishToolResponse.outcome_summary)
        : null);

    return {
      badgeStatus: taskOutcome?.status ?? "success",
      summary: outcomeSummary,
      taskOutcome,
      customTaskMetadata,
      customTaskMetadataText,
    };
  }

  return {
    badgeStatus: run.status,
    summary: systemSummary,
    taskOutcome,
    customTaskMetadata,
    customTaskMetadataText,
  };
}

export function getAutomationRunBadgeLabelKey(
  status: AutomationRunBadgeStatus | string,
): I18nKey {
  switch (status) {
    case AutomationRunStatus.COMPLETED:
    case "success":
      return I18nKey.AUTOMATIONS$DETAIL$SUCCESSFUL;
    case AutomationRunStatus.FAILED:
    case "failed":
      return I18nKey.AUTOMATIONS$DETAIL$FAILED;
    case AutomationRunStatus.PENDING:
      return I18nKey.AUTOMATIONS$DETAIL$PENDING;
    case AutomationRunStatus.RUNNING:
      return I18nKey.AUTOMATIONS$DETAIL$RUNNING;
    case AutomationRunStatus.CANCELLED:
      return I18nKey.AUTOMATIONS$DETAIL$CANCELLED;
    case AutomationRunStatus.SKIPPED:
      return I18nKey.AUTOMATIONS$DETAIL$SKIPPED;
    case "blocked":
      return I18nKey.AUTOMATIONS$DETAIL$BLOCKED;
    case "partial_success":
      return I18nKey.AUTOMATIONS$DETAIL$PARTIAL;
    case "unknown":
      return I18nKey.AUTOMATIONS$DETAIL$NEEDS_REVIEW;
    default:
      return I18nKey.FEATURED_AUTOMATIONS$STATUS_UNKNOWN;
  }
}

/**
 * A governed run's target-related outcome, read from the existing
 * `status_detail.code`. The transcript link follows the service's retention:
 * a pending or removed transcript has nothing to open.
 */
export type AutomationRunGovernanceState =
  | "transcript_pending"
  | "policy_denied"
  | "runtime_missing"
  | "transcript_retained"
  | "transcript_unavailable"
  | "target_unavailable";

export interface AutomationRunGovernance {
  state: AutomationRunGovernanceState;
  /** Whether the run's conversation may still be opened. */
  transcriptLink: boolean;
}

const GOVERNANCE_BY_CODE: Record<string, AutomationRunGovernance> = {
  transcript_pending: { state: "transcript_pending", transcriptLink: false },
  policy_denied: { state: "policy_denied", transcriptLink: true },
  runtime_missing: { state: "runtime_missing", transcriptLink: true },
  transcript_retained: { state: "transcript_retained", transcriptLink: true },
  transcript_unavailable: {
    state: "transcript_unavailable",
    transcriptLink: false,
  },
  target_unavailable: { state: "target_unavailable", transcriptLink: false },
};

export function getAutomationRunGovernance(
  run: AutomationRun,
): AutomationRunGovernance | null {
  const code = run.status_detail?.code;
  if (typeof code !== "string" || !code) return null;
  return GOVERNANCE_BY_CODE[code] ?? null;
}

export function getAutomationRunGovernanceLabelKey(
  state: AutomationRunGovernanceState,
): I18nKey {
  switch (state) {
    case "transcript_pending":
      return I18nKey.AUTOMATIONS$DETAIL$TRANSCRIPT_PENDING;
    case "policy_denied":
      return I18nKey.AUTOMATIONS$DETAIL$POLICY_DENIED;
    case "runtime_missing":
      return I18nKey.AUTOMATIONS$DETAIL$RUNTIME_MISSING;
    case "transcript_retained":
      return I18nKey.AUTOMATIONS$DETAIL$TRANSCRIPT_RETAINED;
    case "transcript_unavailable":
      return I18nKey.AUTOMATIONS$DETAIL$TRANSCRIPT_UNAVAILABLE;
    case "target_unavailable":
      return I18nKey.AUTOMATIONS$DETAIL$TARGET_UNAVAILABLE;
  }
}
