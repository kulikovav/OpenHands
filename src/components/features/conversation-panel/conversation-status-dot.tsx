import { useTranslation } from "react-i18next";
import { FaArchive } from "react-icons/fa";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

interface ConversationStatusDotProps {
  executionStatus: ExecutionStatus | null | undefined;
  /**
   * Cloud-only sandbox lifecycle status. When provided, MISSING and ERROR
   * override the execution-status visual so the dot reflects the sandbox
   * state rather than the last agent execution state.
   */
  sandboxStatus?: SandboxStatus | null;
  /**
   * Local runtime state. `missing` means the backend that answered does not
   * host this conversation's runtime — in a multi-backend deployment another
   * server owns it. It overrides the archive reading of a derived `MISSING`
   * sandbox status, because a conversation that runs elsewhere is not archived.
   */
  runtimeStatus?: string | null;
  /**
   * Wrap the dot in a tooltip showing the human-readable status label.
   * Disable this when the dot is already nested inside a larger tooltip
   * (e.g. the collapsed-sidebar conversation preview) so the smaller
   * tooltip doesn't intercept the hover.
   */
  showTooltip?: boolean;
}

type Visual =
  | "check"
  | "working"
  | "active"
  | "paused"
  | "error"
  | "unknown"
  | "remote";

const visualFor = (status: ExecutionStatus | null | undefined): Visual => {
  switch (status) {
    case ExecutionStatus.FINISHED:
      return "check";
    case ExecutionStatus.RUNNING:
      return "working";
    case ExecutionStatus.IDLE:
    case ExecutionStatus.WAITING_FOR_CONFIRMATION:
      return "active";
    case ExecutionStatus.PAUSED:
      return "paused";
    case ExecutionStatus.ERROR:
    case ExecutionStatus.STUCK:
      return "error";
    default:
      return "unknown";
  }
};

const labelKeyFor = (visual: Visual, isArchived?: boolean): string => {
  if (isArchived) return "COMMON$ARCHIVED";
  switch (visual) {
    case "check":
      return "COMMON$FINISHED";
    case "working":
    case "active":
      return "COMMON$WORKING";
    case "paused":
      return "COMMON$PAUSED";
    case "error":
      return "COMMON$ERROR";
    case "remote":
      return "BACKEND$KIND_REMOTE";
    default:
      return "COMMON$STOPPED";
  }
};

function renderIndicator(visual: Visual) {
  switch (visual) {
    case "check":
      return (
        <svg
          data-testid="conversation-status-check"
          viewBox="0 0 12 12"
          className="w-2.5 h-2.5 stroke-status-success"
          fill="none"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      );
    case "working":
      return (
        <span
          data-testid="conversation-status-working"
          className="w-1.5 h-1.5 rounded-full animate-pulse bg-status-success"
        />
      );
    case "active":
      return (
        <span
          data-testid="conversation-status-active"
          className="w-1.5 h-1.5 rounded-full bg-status-success"
        />
      );
    case "paused":
      return (
        <span
          data-testid="conversation-status-paused"
          className="w-1.5 h-1.5 rounded-full bg-muted"
        />
      );
    case "error":
      return (
        <span
          data-testid="conversation-status-error"
          className="w-1.5 h-1.5 rounded-full bg-status-error"
        />
      );
    case "remote":
      // A hollow ring: the conversation exists, but its runtime is on another
      // backend, so the state here is unknown until you open it.
      return (
        <span
          data-testid="conversation-status-remote"
          className="w-2 h-2 rounded-full border border-muted bg-transparent"
        />
      );
    default:
      return (
        <span
          data-testid="conversation-status-unknown"
          className="w-1.5 h-1.5 rounded-full bg-tertiary"
        />
      );
  }
}

export function ConversationStatusDot({
  executionStatus,
  sandboxStatus,
  runtimeStatus,
  showTooltip = true,
}: ConversationStatusDotProps) {
  const { t } = useTranslation("openhands");

  // A runtime on another backend outranks every sandbox reading: the
  // conversation runs elsewhere, so nothing about this backend's sandbox or
  // archive state describes it. Otherwise:
  // sandbox_status === "MISSING" → show archived (gray) dot
  // sandbox_status === "ERROR"   → show error (red) dot
  // and fall through to the execution-status visual.
  const runsOnAnotherBackend = runtimeStatus === "missing";
  const isArchived = !runsOnAnotherBackend && sandboxStatus === "MISSING";
  const effectiveVisual: Visual = runsOnAnotherBackend
    ? "remote"
    : sandboxStatus === "ERROR"
      ? "error"
      : isArchived
        ? "paused"
        : visualFor(executionStatus);

  const visual = effectiveVisual;
  const label = t(labelKeyFor(visual, isArchived));
  const indicator = isArchived ? (
    <FaArchive
      data-testid="conversation-status-archived"
      size={10}
      className="shrink-0 text-muted opacity-60"
      aria-hidden
    />
  ) : (
    renderIndicator(visual)
  );

  const dot = (
    <div className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
      {indicator}
    </div>
  );

  if (!showTooltip) return dot;

  return (
    <StyledTooltip
      content={label}
      placement="right"
      showArrow
      tooltipClassName="bg-base text-contrast text-xs shadow-lg"
    >
      {dot}
    </StyledTooltip>
  );
}
