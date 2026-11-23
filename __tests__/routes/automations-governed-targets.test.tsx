import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import { resetAutomationMockData } from "#/mocks/automation-handlers";
import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";
import { AutomationRunStatus } from "#/types/automation";
import AutomationsList from "#/routes/automations-list";

// The gate reads the governed capability from /server_info, then the allowed
// targets from the automation service. The capability response comes from MSW
// so the real client and query wiring are exercised.
const governedBackend: Backend = {
  id: "governed-target",
  name: "Governed pilot",
  // Same origin as the test page, so the browser sends no CORS preflight that
  // MSW would have to answer.
  host: window.location.origin,
  apiKey: "session-key",
  kind: "local",
};

const TARGET = {
  id: "target-pilot",
  name: "Pilot sandbox",
  origin: `${window.location.origin}/`,
};

function capabilities(targets: unknown[], features: string[] = []) {
  return {
    ready: true,
    features: ["automationDrafts", ...features],
    triggerKinds: ["cron", "event"],
    eventSources: [],
    eventTypes: [],
    triggers: {},
    targets,
  };
}

function serveCapabilities(body: Record<string, unknown>, status = 200) {
  server.use(
    http.get("*/api/automation/v1/capabilities", () =>
      HttpResponse.json(body, { status }),
    ),
  );
}

function renderList() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <ActiveBackendProvider>
        <MemoryRouter initialEntries={["/automations"]}>
          <AutomationsList />
        </MemoryRouter>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  resetAutomationMockData();
  server.use(
    http.get("*/server_info", () =>
      HttpResponse.json({
        version: "1.62.0",
        conversation_runtime: "docker",
        available_conversation_runtimes: [],
        capabilities: ["governed_conversation_runtime_v1"],
      }),
    ),
  );
  setRegisteredBackends([governedBackend]);
  setActiveSelection({ backendId: governedBackend.id });
});

describe("governed automations capability gate", () => {
  it("enables list, create, and run when a target origin matches the backend", async () => {
    // Arrange — the target's trailing slash and scheme must not defeat the
    // origin match.
    serveCapabilities(
      capabilities([TARGET], ["governedTargets"]),
    );

    // Act
    renderList();

    // Assert — the list renders with create and dispatch available.
    await screen.findByText("PR Triage Digest");
    expect(
      screen.queryByTestId("automations-governed-backend"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("automations-add-automation")).toBeInTheDocument();
    expect(
      screen.getByTestId(
        "automation-run-now-a1000000-0000-0000-0000-000000000001",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the permanent refusal when no target matches the backend", async () => {
    // Arrange — the deployment allows a different origin.
    serveCapabilities(
      capabilities(
        [{ ...TARGET, origin: "https://other.example" }],
        ["governedTargets"],
      ),
    );

    // Act
    renderList();

    // Assert — no retry: a successful 2xx without a target is permanent.
    const notice = await screen.findByTestId("automations-governed-backend");
    expect(within(notice).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("PR Triage Digest")).not.toBeInTheDocument();
  });

  it("offers Retry for a failed capability request and recovers", async () => {
    // Arrange — the first capability request fails, the retry succeeds.
    serveCapabilities({ detail: "capability probe failed" }, 503);
    renderList();

    // Act — the transient state exposes the existing retry affordance.
    const retry = await screen.findByRole("button", {
      name: i18n.t(I18nKey.AUTOMATIONS$BACKEND_UNAVAILABLE_RETRY),
    });
    serveCapabilities(capabilities([TARGET], ["governedTargets"]));
    await userEvent.setup().click(retry);

    // Assert
    await screen.findByText("PR Triage Digest");
    expect(
      screen.queryByTestId("automations-governed-backend"),
    ).not.toBeInTheDocument();
  });

  it("dispatches a legacy automation without a target", async () => {
    // Arrange — the fixtures carry no target_id, so this run keeps the
    // deployment-default behavior.
    serveCapabilities(capabilities([TARGET], ["governedTargets"]));
    const dispatched = vi.fn();
    server.use(
      http.post("*/api/automation/v1/:id/dispatch", ({ params }) => {
        dispatched(params.id);
        return HttpResponse.json({
          id: "run-legacy",
          status: AutomationRunStatus.PENDING,
          conversation_id: null,
          bash_command_id: null,
          error_detail: null,
          started_at: new Date().toISOString(),
          completed_at: null,
        });
      }),
    );
    const user = userEvent.setup();
    renderList();
    const runButton = await screen.findByTestId(
      "automation-run-now-a1000000-0000-0000-0000-000000000001",
    );

    // Act
    await user.click(runButton);

    // Assert
    await waitFor(() =>
      expect(dispatched).toHaveBeenCalledWith(
        "a1000000-0000-0000-0000-000000000001",
      ),
    );
  });
});