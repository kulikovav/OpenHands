import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackendKind } from "#/api/backend-registry/types";
import { IntegrationsSettingsScreen } from "#/routes/git-providers-settings";

const mocks = vi.hoisted(() => ({
  backendKind: "local" as BackendKind,
  listConnections: vi.fn(),
  saveToken: vi.fn(),
  saveHost: vi.fn(),
  disconnect: vi.fn(),
  cloudUrl: vi.fn(),
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => ({
    backend: { kind: mocks.backendKind, id: "backend", host: "" },
    orgId: null,
  }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({
    backend: { kind: mocks.backendKind, id: "backend", host: "" },
    orgId: null,
  }),
}));

vi.mock("#/api/git-provider-integrations-service", () => ({
  gitProviderIntegrations: () => [
    {
      provider: "github",
      tokenSecretName: "GITHUB_TOKEN",
      hostRecordName: "GITHUB_HOST",
    },
    {
      provider: "gitlab",
      tokenSecretName: "GITLAB_TOKEN",
      hostRecordName: "GITLAB_HOST",
    },
  ],
  listGitProviderConnections: mocks.listConnections,
  saveProviderToken: mocks.saveToken,
  saveProviderHost: mocks.saveHost,
  disconnectGitProvider: mocks.disconnect,
}));

vi.mock("#/utils/cloud-integrations-url", () => ({
  cloudIntegrationsUrl: mocks.cloudUrl,
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => ({ data: { provider_tokens_set: {} } }),
}));

function renderScreen() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <IntegrationsSettingsScreen />
    </QueryClientProvider>,
  );
}

function gitlabHostInput() {
  return screen.getByTestId(
    "git-provider-host-input-gitlab",
  ) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listConnections.mockResolvedValue([
    { provider: "github", isConnected: false, host: null },
    { provider: "gitlab", isConnected: true, host: "https://git.uzum.io" },
  ]);
  mocks.saveToken.mockResolvedValue(undefined);
  mocks.saveHost.mockResolvedValue(undefined);
  mocks.disconnect.mockResolvedValue(undefined);
});

describe("Integrations settings", () => {
  it("renders every provider row with its saved state", async () => {
    renderScreen();

    await waitFor(() => {
      expect(gitlabHostInput()).toHaveValue("https://git.uzum.io");
    });
    expect(
      screen.getByTestId(`git-provider-integration-status-gitlab`),
    ).toBeInTheDocument();
    const save = screen.getByTestId("git-provider-save-gitlab");
    expect(save).toBeDisabled();
    // The row is interactive only when the user edits something.
    await userEvent.type(
      screen.getByTestId("git-provider-token-input-gitlab"),
      "glpat-new",
    );
    expect(save).toBeEnabled();
  });

  it("saves a typed host change and not an untouched token", async () => {
    renderScreen();

    await waitFor(() => {
      expect(gitlabHostInput()).toHaveValue("https://git.uzum.io");
    });
    // A trailing-slash-only edit normalizes to no change, so the save stays
    // disabled until the host truly differs.
    await userEvent.clear(gitlabHostInput());
    await userEvent.type(gitlabHostInput(), "https://git.example.com");

    await userEvent.click(screen.getByTestId("git-provider-save-gitlab"));

    await waitFor(() => {
      expect(mocks.saveHost).toHaveBeenCalledWith(
        "gitlab",
        "https://git.example.com",
      );
    });
    expect(mocks.saveToken).not.toHaveBeenCalled();
  });

  it("disconnects through the confirmation dialog", async () => {
    renderScreen();

    await waitFor(() => {
      expect(
        screen.getByTestId("git-provider-disconnect-gitlab"),
      ).toBeEnabled();
    });
    await userEvent.click(screen.getByTestId("git-provider-disconnect-gitlab"));
    await userEvent.click(screen.getByTestId("confirm-button"));

    await waitFor(() => {
      expect(mocks.disconnect).toHaveBeenCalledWith("gitlab");
    });
  });

  it("points a cloud backend at the instance's integrations page", async () => {
    mocks.backendKind = "cloud";
    renderScreen();

    expect(
      screen.getByTestId("integrations-settings-screen"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("git-provider-save-gitlab")).toBeNull();
    await userEvent.click(screen.getByTestId("integrations-open-cloud"));
    expect(mocks.cloudUrl).toHaveBeenCalledWith(
      { kind: "cloud", id: "backend", host: "" },
      null,
    );
  });
});