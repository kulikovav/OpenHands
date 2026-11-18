import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryBackend } from "#/api/discovery/discovery-backends.api";
import {
  __resetActiveStoreForTests,
  getRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { __resetHealthStoreForTests } from "#/api/backend-registry/health-store";
import {
  BACKENDS_STORAGE_KEY,
  DEFAULT_BACKEND_STORAGE_KEY,
  readStoredDefaultBackendId,
  writeStoredDefaultBackendId,
} from "#/api/backend-registry/storage";
import type { Backend } from "#/api/backend-registry/types";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { BackendsSettingsSection } from "#/components/features/settings/backends-settings/backends-settings-section";

const mockUseDiscoveredBackends = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-discovered-backends", () => ({
  useDiscoveredBackends: () => mockUseDiscoveredBackends(),
}));

vi.mock("#/components/features/backends/manage-backends-modal", () => ({
  ManageBackendsModal: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const manualBackend: Backend = {
  id: "default-local",
  name: "Local",
  host: "https://oh.example.com",
  apiKey: "key",
  kind: "local",
};

const slotEntry: DiscoveryBackend = {
  name: "backend-1",
  role: "slot",
  url: "https://backend-1.oh.example.com",
  healthy: true,
};

const runsEntry: DiscoveryBackend = {
  name: "automation-runs",
  role: "automations",
  url: "https://automation-runs1.oh.example.com",
  healthy: true,
};

function registerBackends(backends: Backend[]): void {
  window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify(backends));
  __resetActiveStoreForTests();
}

function renderSection() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ActiveBackendProvider>
        <BackendsSettingsSection />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetHealthStoreForTests();
  __resetActiveStoreForTests();
  mockUseDiscoveredBackends.mockReturnValue({
    data: [slotEntry, runsEntry],
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetHealthStoreForTests();
  __resetActiveStoreForTests();
});

describe("BackendsSettingsSection", () => {
  it("renders the backend list seeded from the discovery document", async () => {
    registerBackends([manualBackend]);

    renderSection();

    expect(await screen.findByText("backend-1")).toBeInTheDocument();
    expect(screen.getByText("automation-runs")).toBeInTheDocument();
    expect(screen.getByText(manualBackend.name)).toBeInTheDocument();
    expect(
      screen.getAllByText("SETTINGS$BACKENDS_SOURCE_DISCOVERY"),
    ).toHaveLength(2);
    expect(
      screen.getByText("SETTINGS$BACKENDS_SOURCE_MANUAL"),
    ).toBeInTheDocument();
    // The seed reaches the registry, so the rest of the app sees the entries.
    expect(getRegisteredBackends().map((backend) => backend.name)).toEqual([
      manualBackend.name,
      "backend-1",
      "automation-runs",
    ]);
  });

  it("hydrates the stored default backend", async () => {
    registerBackends([
      manualBackend,
      {
        id: "discovery-backend-1",
        name: "backend-1",
        host: slotEntry.url,
        apiKey: "key",
        kind: "local",
      },
    ]);
    writeStoredDefaultBackendId("discovery-backend-1");

    renderSection();

    expect(
      await screen.findByText("SETTINGS$BACKENDS_DEFAULT_HINT"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("SETTINGS$BACKENDS_DEFAULT_UNSET_HINT"),
    ).not.toBeInTheDocument();
  });

  it("saves the picked default and explains it applies to new chats", async () => {
    registerBackends([manualBackend]);
    const user = userEvent.setup();

    renderSection();
    await screen.findByText("backend-1");

    await user.click(screen.getByTestId("default-backend-input"));
    const option = (await screen.findAllByRole("option")).find((candidate) =>
      candidate.textContent?.includes("backend-1"),
    );
    expect(option).toBeDefined();
    await user.click(option!);

    expect(readStoredDefaultBackendId()).toBe("discovery-backend-1");
    expect(window.localStorage.getItem(DEFAULT_BACKEND_STORAGE_KEY)).toBe(
      "discovery-backend-1",
    );
    expect(
      screen.getByText("SETTINGS$BACKENDS_DEFAULT_HINT"),
    ).toBeInTheDocument();
  });
});