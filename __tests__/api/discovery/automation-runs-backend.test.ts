import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentServerBaseUrl } from "#/api/agent-server-config";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  fetchAutomationRunsBackend,
  fetchDiscoveryBackends,
} from "#/api/discovery/automation-runs-backend.api";
import { getFetchCall, mockJsonResponse } from "../cloud/fetch-test-utils";

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const originalFetch = global.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  fetchMock.mockReset();
  global.fetch = fetchMock as typeof fetch;
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  fetchMock.mockReset();
  global.fetch = originalFetch;
});

describe("fetchAutomationRunsBackend", () => {
  it("reads the discovery document with the session key and returns the runs backend", async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        backends: [
          {
            name: "automations",
            role: "ingress",
            url: getAgentServerBaseUrl(),
            healthy: true,
          },
          {
            name: "backend-1",
            role: "slot",
            url: "https://oh.example:8443",
            healthy: true,
          },
          {
            name: "automation-runs",
            role: "automations",
            url: "https://oh.example:8445/",
            healthy: true,
          },
        ],
      }),
    );

    // Act
    const backend = await fetchAutomationRunsBackend();

    // Assert
    const [url, init] = getFetchCall(fetchMock);
    expect(url).toBe(`${getAgentServerBaseUrl()}/api/discovery/backends`);
    expect(init).toMatchObject({
      headers: { "X-Session-API-Key": localBackend.apiKey },
    });
    expect(backend).toMatchObject({
      name: "automation-runs",
      role: "automations",
      url: "https://oh.example:8445",
    });
  });

  it("returns null when the document reports no runs backend", async () => {
    // Arrange — only the ingress and a slot.
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        backends: [
          {
            name: "automations",
            role: "ingress",
            url: getAgentServerBaseUrl(),
          },
        ],
      }),
    );

    // Act and assert
    expect(await fetchAutomationRunsBackend()).toBeNull();
  });

  it("reports a discovery document that does not answer", async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      mockJsonResponse({ error: "unauthorized" }, 401),
    );

    // Act and assert
    await expect(fetchDiscoveryBackends()).rejects.toThrow("HTTP 401");
  });
});
