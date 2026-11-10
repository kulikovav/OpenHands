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

const { mockGetSecretValue, mockDeleteSecret } = vi.hoisted(() => ({
  mockGetSecretValue: vi.fn(),
  mockDeleteSecret: vi.fn(),
}));

vi.mock("#/api/secrets-service", () => ({
  SecretsService: {
    getSecretsOrThrow: vi.fn(),
    getSecretValue: mockGetSecretValue,
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

type MockedFn = ReturnType<typeof vi.fn>;

function setStoredSecrets(entries: CustomSecretWithoutValue[]): void {
  (SecretsService.getSecretsOrThrow as MockedFn).mockResolvedValue(entries);
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
  vi.clearAllMocks();
  mockGetSecretValue.mockResolvedValue(null);
  (SecretsService.createSecret as MockedFn).mockResolvedValue(undefined);
  (SecretsService.updateSecret as MockedFn).mockResolvedValue(undefined);
  mockDeleteSecret.mockResolvedValue(undefined);
});

afterEach(() => {
  __resetActiveStoreForTests();
});

describe("listGitProviderConnections", () => {
  it("derives the connections from the secrets, reading the host value", async () => {
    setStoredSecrets([
      { name: "GITLAB_TOKEN", description: "self-hosted" },
      { name: "GITLAB_HOST" },
    ]);
    mockGetSecretValue.mockResolvedValue("https://git.uzum.io");

    await expect(listGitProviderConnections()).resolves.toContainEqual({
      provider: "gitlab",
      isConnected: true,
      host: "https://git.uzum.io",
    });
  });

  it("reads the host value from the exact spelling the service asks for", async () => {
    setStoredSecrets([
      { name: "GITLAB_TOKEN" },
      { name: "gitlab_host", description: "stale" },
      { name: "GITLAB_HOST", description: "current" },
    ]);
    mockGetSecretValue.mockResolvedValue("https://git.example.com");

    await expect(listGitProviderConnections()).resolves.toContainEqual({
      provider: "gitlab",
      isConnected: true,
      host: "https://git.example.com",
    });
    expect(mockGetSecretValue).toHaveBeenCalledWith("GITLAB_HOST");
  });

  it("resolves a token saved under either name spelling", async () => {
    setStoredSecrets([{ name: "github_token" }]);

    await expect(listGitProviderConnections()).resolves.toContainEqual({
      provider: "github",
      isConnected: true,
      host: null,
    });
  });
});

describe("saveProviderToken", () => {
  it("creates the secret under the uppercase convention when absent", async () => {
    setStoredSecrets([]);

    await saveProviderToken("gitlab", " glpat-value ");

    expect(SecretsService.createSecret).toHaveBeenCalledWith(
      "GITLAB_TOKEN",
      "glpat-value",
    );
    expect(SecretsService.updateSecret).not.toHaveBeenCalled();
  });

  it("rotates a stored token keeping its stored name and description", async () => {
    setStoredSecrets([{ name: "gitlab_token", description: "Uzum GitLab" }]);

    await saveProviderToken("gitlab", "glpat-next");

    expect(SecretsService.updateSecret).toHaveBeenCalledWith(
      "gitlab_token",
      "gitlab_token",
      "Uzum GitLab",
      "glpat-next",
    );
    expect(SecretsService.createSecret).not.toHaveBeenCalled();
  });

  it("refuses to rotate when two spellings of the name exist", async () => {
    setStoredSecrets([
      { name: "gitlab_token", description: "stale" },
      { name: "GITLAB_TOKEN", description: "current" },
    ]);

    await expect(saveProviderToken("gitlab", "glpat-next")).rejects.toThrow(
      /differ only in case/,
    );
    expect(SecretsService.updateSecret).not.toHaveBeenCalled();
    expect(SecretsService.createSecret).not.toHaveBeenCalled();
  });

  it("rejects an empty token", async () => {
    setStoredSecrets([]);

    await expect(saveProviderToken("gitlab", "   ")).rejects.toThrow();
    expect(SecretsService.createSecret).not.toHaveBeenCalled();
  });
});

describe("saveProviderHost", () => {
  it("creates the host record and trims a trailing slash", async () => {
    setStoredSecrets([]);

    await saveProviderHost("gitlab", " https://git.uzum.io/ ");

    expect(SecretsService.createSecret).toHaveBeenCalledWith(
      "GITLAB_HOST",
      "https://git.uzum.io",
    );
  });

  it("updates a stored host record in place", async () => {
    setStoredSecrets([{ name: "GITLAB_HOST" }]);

    await saveProviderHost("gitlab", "https://git.uzum.io");

    expect(SecretsService.updateSecret).toHaveBeenCalledWith(
      "GITLAB_HOST",
      "GITLAB_HOST",
      undefined,
      "https://git.uzum.io",
    );
  });

  it("removes the stored host record when the host is blank", async () => {
    setStoredSecrets([{ name: "GITLAB_HOST", description: "self-hosted" }]);

    await saveProviderHost("gitlab", "  ");

    expect(mockDeleteSecret).toHaveBeenCalledWith("GITLAB_HOST");
    expect(SecretsService.updateSecret).not.toHaveBeenCalled();
  });

  it("keeps a blank no-op save silent when no record exists", async () => {
    setStoredSecrets([]);

    await saveProviderHost("gitlab", "  ");

    expect(mockDeleteSecret).not.toHaveBeenCalled();
  });
});

describe("disconnectGitProvider", () => {
  it("deletes the token secret and the host record", async () => {
    setStoredSecrets([{ name: "GITLAB_TOKEN" }, { name: "GITLAB_HOST" }]);

    await disconnectGitProvider("gitlab");

    expect(mockDeleteSecret).toHaveBeenCalledTimes(2);
    expect(mockDeleteSecret).toHaveBeenCalledWith("GITLAB_TOKEN");
    expect(mockDeleteSecret).toHaveBeenCalledWith("GITLAB_HOST");
  });

  it("refuses to disconnect when two spellings of the name exist", async () => {
    setStoredSecrets([{ name: "gitlab_token" }, { name: "GITLAB_TOKEN" }]);

    await expect(disconnectGitProvider("gitlab")).rejects.toThrow(
      /differ only in case/,
    );
    expect(mockDeleteSecret).not.toHaveBeenCalled();
  });
});
