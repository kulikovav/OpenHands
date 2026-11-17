import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  PolicyEventMessage,
  getPolicyEventStatusKey,
} from "#/components/conversation-events/chat/event-message-components/policy-event-message";
import { shouldRenderEvent } from "#/components/conversation-events/chat/event-content-helpers/should-render-event";
import { isPolicyEvent } from "#/types/agent-server/type-guards";
import type {
  OpenHandsEvent,
  PolicyEvent,
} from "#/types/agent-server/core";
import {
  IsInEventGroupContext,
} from "#/components/features/chat/is-in-event-group-context";

vi.mock("react-i18next", () => ({
  useTranslation: (namespace: string) => ({
    t: (key: string) =>
      namespace === "openhands" ? key : `wrong-namespace:${key}`,
  }),
}));

vi.mock("#/components/features/chat/generic-event-message", () => ({
  GenericEventMessage: ({
    title,
    details,
    success,
    className,
  }: {
    title: ReactNode;
    details: ReactNode;
    success?: "success" | "error";
    className?: string;
  }) => (
    <section
      data-testid="generic-event-message"
      data-success={success ?? "none"}
      data-spacing-override={className ? "yes" : "no"}
    >
      <header>{title}</header>
      <div>{details}</div>
    </section>
  ),
}));

const makePolicyEvent = (
  overrides: Partial<PolicyEvent> = {},
): PolicyEvent => ({
  id: "policy-event-1",
  timestamp: "2026-11-16T10:00:00.000Z",
  source: "environment",
  kind: "PolicyEvent",
  status: "denied",
  destination: "registry.example.test:5000",
  reason: "destination not allowed by boundary policy",
  rule: null,
  provenance: {
    proposal: "prop-42",
    scope: "registry.example.test:5000",
    prover: "within_boundary",
  },
  ...overrides,
});

const renderPolicyEvent = (overrides: Partial<PolicyEvent> = {}) =>
  render(<PolicyEventMessage event={makePolicyEvent(overrides)} />);

describe("policy event message", () => {
  it("renders a denial naming the destination, reason, and provenance", () => {
    renderPolicyEvent();

    const message = screen.getByTestId("generic-event-message");
    expect(message).toHaveAttribute("data-success", "none");
    expect(message).toHaveTextContent("POLICY$EVENT_LABEL");
    expect(message).toHaveTextContent("POLICY$STATUS_DENIED");
    expect(message).toHaveTextContent("registry.example.test:5000");
    expect(message).toHaveTextContent(
      "POLICY$REASON: destination not allowed by boundary policy",
    );
    expect(message).toHaveTextContent("proposal: prop-42");
    expect(message).toHaveTextContent("scope: registry.example.test:5000");
    expect(message).toHaveTextContent("prover: within_boundary");
  });

  it("omits the rule row when the boundary named no rule", () => {
    renderPolicyEvent({ rule: null });

    expect(
      screen.queryByTestId("generic-event-message"),
    ).not.toHaveTextContent("POLICY$RULE:");
  });

  it("marks an approval with the single-retry note and a success indicator", () => {
    renderPolicyEvent({
      status: "approved",
      destination: "docs.example.test",
      reason: "operator approved the widening request",
    });

    const message = screen.getByTestId("generic-event-message");
    expect(message).toHaveAttribute("data-success", "success");
    expect(message).toHaveTextContent("POLICY$STATUS_APPROVED");
    expect(message).toHaveTextContent("POLICY$SINGLE_RETRY");
  });

  it("renders a rejection without a retry note", () => {
    renderPolicyEvent({
      status: "rejected",
      reason: "operator rejected the proposal",
    });

    const message = screen.getByTestId("generic-event-message");
    expect(message).toHaveAttribute("data-success", "none");
    expect(message).toHaveTextContent("POLICY$STATUS_REJECTED");
    expect(message).toHaveTextContent("POLICY$REASON: operator rejected the proposal");
    expect(message).not.toHaveTextContent("POLICY$SINGLE_RETRY");
  });

  it("renders an expired proposal", () => {
    renderPolicyEvent({ status: "expired" });

    expect(
      screen.getByTestId("generic-event-message"),
    ).toHaveTextContent("POLICY$STATUS_EXPIRED");
  });

  it("renders nothing for an event from another event family", () => {
    const event = {
      id: "state-event-1",
      timestamp: "2026-11-16T10:00:00.000Z",
      source: "agent",
      kind: "ConversationStateUpdateEvent",
      key: "execution_status",
      value: "idle",
    } as unknown as OpenHandsEvent;

    const { container } = render(<PolicyEventMessage event={event} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the event in the transcript render gate instead of dropping the kind", () => {
    const event = makePolicyEvent();

    expect(isPolicyEvent(event)).toBe(true);
    expect(shouldRenderEvent(event)).toBe(true);
    // Other event kinds keep their existing behavior: the render gate stays
    // closed for them.
    expect(
      shouldRenderEvent({
        id: "system-1",
        timestamp: "2026-11-16T10:00:00.000Z",
        source: "agent",
        system_prompt: "",
        tools: [],
      } as unknown as OpenHandsEvent),
    ).toBe(false);
  });

  it("resolves every wire status to a translation key", () => {
    const statuses: PolicyEvent["status"][] = [
      "denied",
      "approved",
      "rejected",
      "expired",
    ];
    for (const status of statuses) {
      expect(getPolicyEventStatusKey(status)).toMatch(/^POLICY\$STATUS_/);
    }
  });

  it("takes the event-group spacing only when it stands alone in the transcript", () => {
    const event = makePolicyEvent();

    const { unmount } = render(<PolicyEventMessage event={event} />);
    expect(screen.getByTestId("generic-event-message")).toHaveAttribute(
      "data-spacing-override",
      "yes",
    );
    unmount();

    render(
      <IsInEventGroupContext.Provider value>
        <PolicyEventMessage event={event} />
      </IsInEventGroupContext.Provider>,
    );
    expect(screen.getByTestId("generic-event-message")).toHaveAttribute(
      "data-spacing-override",
      "no",
    );
  });
});