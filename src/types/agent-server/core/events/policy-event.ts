import { BaseEvent } from "../base/event";

/**
 * Decision the governed boundary reached (U4 wire contract, SDK
 * `PolicyEvent`). "denied" and "expired" answer a widening request without a
 * human decision; "approved" and "rejected" carry the operator's decision.
 */
export type PolicyDecision = "denied" | "approved" | "rejected" | "expired";

/**
 * PolicyEvent - a governance decision the sandbox boundary recorded.
 *
 * Emitted when the gateway denies egress or when a human decision answers a
 * widening request. The event is not sent to the LLM: the governance context
 * in the system prompt carries the standing rules, and this event keeps each
 * decision visible in the conversation.
 */
export interface PolicyEvent extends BaseEvent {
  /** Discriminator field for type guards. */
  kind: "PolicyEvent";

  source: "environment";

  /** Decision the boundary reached. */
  status: PolicyDecision;

  /** Host, URL, pattern, or scope name the decision covers. */
  destination: string;

  /** Policy, rule, expiry, or human reason for the decision. */
  reason: string;

  /** Matched policy rule, if the boundary named one. */
  rule: string | null;

  /**
   * Provenance labels tying the decision to its request: the proposal record
   * id, the requested scope, and the prover verdict.
   */
  provenance: Record<string, string>;
}
