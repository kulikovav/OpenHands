import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackendKind } from "#/api/backend-registry/types";
import { translationResources } from "#/i18n/resources";
import { IntegrationsSettingsScreen } from "#/routes/git-providers-settings";

// Resolve the real English copy so the per-provider help text contract is
// exercised; the global setup mock would return the raw key instead.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      Object.entries(options ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{{${name}}}`, value),
        translationResources.en[key] ?? key,
      ),
    i18n: { language: "en", exists: () => true },
  }),
}));

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

vi.mock("#/api/git-provider-integrations-service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("#/api/git-provider-integrations-service")
    >();
  return {
    ...actual,
    listGitProviderConnections: mocks.listConnections,
    saveProviderToken: mocks.saveToken,
    saveProviderHost: mocks.saveHost,
    disconnectGitProvider: mocks.disconnect,
  };
});

vi.mock("#/utils/cloud-integrations-url", () => ({
  cloudIntegrationsUrl: mocks.cloudUrl,
}));

function renderScreen() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
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
  mocks.backendKind = "local";
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
    await userEvent.type(
      screen.getByTestId("git-provider-token-input-gitlab"),
      "glpat-new",
    );
    expect(save).toBeEnabled();
  });

  it("describes the instance URL input with its help text", async () => {
    renderScreen();

    await waitFor(() => {
      expect(gitlabHostInput()).toHaveValue("https://git.uzum.io");
    });
    const help = screen.getByTestId("git-provider-host-help-gitlab");
    expect(help.textContent?.trim()).not.toBe("");
    // GitHub needs no instance URL, GitLab does, so the help text is per
    // provider.
    expect(
      screen.getByTestId("git-provider-host-help-github").textContent,
    ).toContain("github.com");
    expect(help.textContent).toContain("gitlab.com");
    expect(
      screen.getByTestId("git-provider-host-help-github").textContent,
    ).not.toBe(help.textContent);
    expect(gitlabHostInput()).toHaveAttribute("aria-describedby", help.id);
  });

  it("treats a trailing-slash-only host edit as no change", async () => {
    renderScreen();

    await waitFor(() => {
      expect(gitlabHostInput()).toHaveValue("https://git.uzum.io");
    });
    await userEvent.type(gitlabHostInput(), "/");
    expect(screen.getByTestId("git-provider-save-gitlab")).toBeDisabled();
  });

  it("saves a typed host change and not an untouched token", async () => {
    renderScreen();

    await waitFor(() => {
      expect(gitlabHostInput()).toHaveValue("https://git.uzum.io");
    });
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

  it("saves a cleared host as the record's removal", async () => {
    renderScreen();

    await waitFor(() => {
      expect(gitlabHostInput()).toHaveValue("https://git.uzum.io");
    });
    await userEvent.clear(gitlabHostInput());

    await userEvent.click(screen.getByTestId("git-provider-save-gitlab"));

    await waitFor(() => {
      expect(mocks.saveHost).toHaveBeenCalledWith("gitlab", "");
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

    // The provider name interpolates; a literal {{provider}} would regress the
    // double-brace fix.
    expect(screen.getByText(/Disconnect GitLab\?/)).toBeInTheDocument();
    expect(screen.queryByText(/\{\{provider\}\}/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("confirm-button"));

    await waitFor(() => {
      expect(mocks.disconnect).toHaveBeenCalledWith("gitlab");
    });
  });

  it("shows an error with a retry instead of lying rows when the store read fails", async () => {
    mocks.listConnections.mockRejectedValue(new Error("store down"));
    renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId("integrations-retry")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("git-provider-save-gitlab")).toBeNull();
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
