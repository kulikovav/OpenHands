/**
 * The Automations surface gate.
 *
 * A governed backend can serve automations only when the automation service
 * advertises a target whose origin is that backend. The capability response is
 * the single source of truth: a successful response without a matching target
 * is a permanent refusal, while a failed request is transient and retryable.
 * An ungoverned backend keeps its existing path unchanged.
 */
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useDeploymentCapabilities } from "#/hooks/query/use-manifest-capabilities";
import { useGovernedBackend } from "#/hooks/query/use-governed-backend";
import type { AutomationTarget } from "#/manifests/types";
import { findAutomationTarget } from "#/utils/automation-targets";

export type AutomationSurfaceState =
  "available" | "pending" | "error" | "refused";

export interface AutomationSurface {
  state: AutomationSurfaceState;
  /** Whether the active backend runs conversations in a governed sandbox. */
  governed: boolean;
  /** The allowed targets the capability response carries, if any. */
  targets: AutomationTarget[];
  /** The target that admits this backend; null when none does. */
  target: AutomationTarget | null;
  /** Re-asks the capability endpoint after a failed request. */
  retry: () => void;
}

export function useAutomationSurface(): AutomationSurface {
  const { backend } = useActiveBackend();
  const { governed } = useGovernedBackend();
  const capabilities = useDeploymentCapabilities({ enabled: governed });
  const targets = capabilities.data?.targets ?? [];
  const target = findAutomationTarget(targets, backend.host);
  const retry = () => {
    void capabilities.refetch();
  };

  if (!governed) {
    return { state: "available", governed, targets: [], target: null, retry };
  }
  if (capabilities.isError) {
    return { state: "error", governed, targets: [], target: null, retry };
  }
  if (!capabilities.data) {
    return { state: "pending", governed, targets: [], target: null, retry };
  }
  return {
    state: target ? "available" : "refused",
    governed,
    targets,
    target,
    retry,
  };
}
