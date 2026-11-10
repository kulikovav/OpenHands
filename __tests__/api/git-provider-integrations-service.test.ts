import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Backend } from "#/api/backend-registry/types";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import {
  disconnectGitProvider,
  listGitProviderConnections,
  saveProviderHost,
  saveProviderToken,
} from "#/api/git-provider-integrations-service";
import type { CustomSecretWithoutValue } from "#/api/secrets-service.types";

const { mockUpsertSecret, mockDeleteSecret, mockGetSecret } = vi.hoisted(() => ({
  mockUpsertSecret: vi.fn(),
  mockDeleteSecret: vi.fn(),
  mockGetSecret: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: vi.fn(function SettingsClientMock() {
    return { getSecret: mockGetSecret };
  }),
}));

vi.mock("#/api/secrets-service", () => ({
  SecretsService: {
    getSecretsOrThrow: vi.fn(),
    createSecret: vi.fn(),
    updateSecret: vi.fn(),
    deleteSecret: mockDeleteSecret,
  },
}));

import { SecretsService } from "#/api/secrets-service";

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8000",
  apiKey: "",
  kind: "local",
};

function storedSecrets(
  entries: CustomSecretWithoutValue[],
): CustomSecretWithoutValue[] {
  return entries;
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
  vi.clearAllMocks();
  mockGetSecret.mockResolvedValue("");
  (SecretsService.createSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined,
  );
  (SecretsService.updateSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined,
  );
  mockDeleteSecret.mockResolvedValue(undefined);
});

afterEach(() => {
  __resetActiveStoreForTests();
});

describe("listGitProviderConnections", () => {
  it("derives the connections from the secrets, reading the host value", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue(
      storedSecrets([
        { name: "GITLAB_TOKEN", description: "self-hosted" },
        { name: "GITLAB_HOST" },
      ]),
    );
    mockGetSecret.mockResolvedValue("https://git.uzum.io");

    await expect(listGitProviderConnections()).resolves.toContainEqual({
      provider: "gitlab",
      isConnected: true,
      host: "https://git.uzum.io",
    });
  });

  it("resolves a token saved under either name spelling", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue(storedSecrets([{ name: "github_token" }]));

    await expect(listGitProviderConnections()).resolves.toContainEqual({
      provider: "github",
      isConnected: true,
      host: null,
    });
  });
});

describe("saveProviderToken", () => {
  it("creates the secret under the uppercase convention when absent", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    await saveProviderToken("gitlab", " glpat-value ");

    expect(SecretsService.createSecret).toHaveBeenCalledWith(
      "GITLAB_TOKEN",
      "glpat-value",
    );
    expect(SecretsService.updateSecret).not.toHaveBeenCalled();
  });

  it("rotates a stored token keeping its stored name and description", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "gitlab_token", description: "Uzum GitLab" },
    ]);

    await saveProviderToken("gitlab", "glpat-next");

    expect(SecretsService.updateSecret).toHaveBeenCalledWith(
      "gitlab_token",
      "gitlab_token",
      "Uzum GitLab",
      "glpat-next",
    );
    expect(SecretsService.createSecret).not.toHaveBeenCalled();
  });

  it("rejects an empty token", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    await expect(saveProviderToken("gitlab", "   ")).rejects.toThrow();
    expect(SecretsService.createSecret).not.toHaveBeenCalled();
  });
});

describe("saveProviderHost", () => {
  it("creates the host record and trims a trailing slash", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    await saveProviderHost("gitlab", " https://git.uzum.io/ ");

    expect(SecretsService.createSecret).toHaveBeenCalledWith(
      "GITLAB_HOST",
      "https://git.uzum.io",
    );
  });

  it("updates a stored host record in place", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ name: "GITLAB_HOST" }]);

    await saveProviderHost("gitlab", "https://git.uzum.io");

    expect(SecretsService.updateSecret).toHaveBeenCalledWith(
      "GITLAB_HOST",
      "GITLAB_HOST",
      undefined,
      "https://git.uzum.io",
    );
  });

  it("rejects an empty host", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    await expect(saveProviderHost("gitlab", "  ")).rejects.toThrow();
  });
});

describe("disconnectGitProvider", () => {
  it("deletes the token secret and the host record", async () => {
    (
      SecretsService.getSecretsOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { name: "GITLAB_TOKEN", description: null },
      { name: "GITLAB_HOST", description: null },
    ]);

    await disconnectGitProvider("gitlab");

    expect(mockDeleteSecret).toHaveBeenCalledTimes(2);
    expect(mockDeleteSecret).toHaveBeenCalledWith("GITLAB_TOKEN");
    expect(mockDeleteSecret).toHaveBeenCalledWith("GITLAB_HOST");
  });
});