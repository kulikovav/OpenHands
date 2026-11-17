import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { clearCachedAgentServerInfo } from "#/api/agent-server-compatibility";
import type { Backend } from "#/api/backend-registry/types";
import { useConversationWorkspace } from "#/hooks/query/use-conversation-workspace";
import { GovernedBackendNotice } from "#/components/features/automations/backend-not-configured";

const localBackend: Backend = {
  id: "governed-local",
  name: "Governed Sandbox",
  host: "http://localhost:18931",
  apiKey: "key",
  kind: "local",
};

// The suite asserts on the keys i18n resolves from, so a key-returning `t`
// keeps the assertions free of literal copy. A call log covers the one
// interpolation: the refusal names the backend it refuses.
const translationCalls: { key: string; values?: Record<string, unknown> }[] = [];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      translationCalls.push({ key, values });
      return key;
    },
  }),
}));

const serverInfoHandler = (body: Record<string, unknown> | null) =>
  http.get("*/server_info", () =>
    body === null ? HttpResponse.error() : HttpResponse.json(body),
  );

function renderWithBackend(ui: ReactNode, backend: Backend = localBackend) {
  setRegisteredBackends([backend]);
  setActiveSelection({ backendId: backend.id });

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ActiveBackendProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

// A one-row probe of the real hook, so the gating message is asserted
// through the same data the launcher and the workspace forms read.
function WorkspaceGateProbe() {
  const { unsupportedMessage, hostWorkspacesUnverified } =
    useConversationWorkspace();
  return (
    <div>
      <p data-testid="workspace-gate-message">
        {unsupportedMessage ?? "none"}
      </p>
      <p data-testid="workspace-gate-unverified">
        {String(hostWorkspacesUnverified)}
      </p>
    </div>
  );
}

describe("governed backend gating", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetActiveStoreForTests();
    clearCachedAgentServerInfo();
  });

  afterEach(() => {
    clearCachedAgentServerInfo();
    __resetActiveStoreForTests();
  });

  describe("host-workspace gating while the probe is unresolved", () => {
    it("gates host workspaces while /server_info is still pending", async () => {
      let released = false;
      server.use(
        http.get("*/server_info", async () => {
          // A probe that never answers keeps the workspace state unverified.
          await new Promise<void>((resolve) => {
            const timer = setInterval(() => {
              if (released) {
                clearInterval(timer);
                resolve();
              }
            }, 50);
          });
          return HttpResponse.json({});
        }),
      );

      renderWithBackend(<WorkspaceGateProbe />);

      await waitFor(() =>
        expect(
          screen.getByTestId("workspace-gate-unverified"),
        ).toHaveTextContent("true"),
      );
      expect(screen.getByTestId("workspace-gate-message")).toHaveTextContent(
        "HOME$WORKSPACE_PROBE_UNVERIFIED",
      );
      expect(
        screen.queryByText("HOME$GOVERNED_WORKSPACE_NOTICE"),
      ).not.toBeInTheDocument();

      // Once the probe answers for a host-local backend, the gate clears.
      released = true;
      await waitFor(() =>
        expect(
          screen.getByTestId("workspace-gate-message"),
        ).toHaveTextContent("none"),
      );
    });

    it("gates host workspaces when /server_info fails", async () => {
      server.use(serverInfoHandler(null));

      renderWithBackend(<WorkspaceGateProbe />);

      await waitFor(() =>
        expect(
          screen.getByTestId("workspace-gate-unverified"),
        ).toHaveTextContent("true"),
      );
      expect(screen.getByTestId("workspace-gate-message")).toHaveTextContent(
        "HOME$WORKSPACE_PROBE_UNVERIFIED",
      );
    });

    it("clears the workspace gate once the probe answers for a host-local backend", async () => {
      server.use(
        serverInfoHandler({
          version: "1.62.0",
          conversation_runtime: "local",
        }),
      );

      renderWithBackend(<WorkspaceGateProbe />);

      await waitFor(() =>
        expect(
          screen.getByTestId("workspace-gate-unverified"),
        ).toHaveTextContent("false"),
      );
      expect(screen.getByTestId("workspace-gate-message")).toHaveTextContent(
        "none",
      );
    });
  });

  describe("GovernedBackendNotice", () => {
    it("names the active backend and offers no retry", () => {
      translationCalls.length = 0;
      renderWithBackend(
        <GovernedBackendNotice backendName={localBackend.name} />,
      );

      const notice = screen.getByTestId("automations-governed-backend");
      const namedCall = translationCalls.find(
        (call) =>
          call.key === "AUTOMATIONS$GOVERNED_BACKEND_MESSAGE" &&
          call.values?.backend === localBackend.name,
      );
      expect(namedCall).toBeDefined();
      // The permanent state has no retry control; only the transient health
      // failure component renders one.
      expect(within(notice).queryByRole("button")).not.toBeInTheDocument();
    });
  });
});