import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentServerBaseUrl } from "#/api/agent-server-config";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  fetchDiscoveryBackends,
  isDiscoveredPeerHost,
  selectForeignReadBackends,
} from "#/api/discovery/discovery-backends.api";
import { getFetchCall, mockJsonResponse } from "../cloud/fetch-test-utils";

const localBackend: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

/** The shape the deployment's discovery service publishes. */
const discoveryDocument = {
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

describe("fetchDiscoveryBackends", () => {
  it("reads the discovery document with the session key", async () => {
    // Arrange
    fetchMock.mockResolvedValue(mockJsonResponse(discoveryDocument));

    // Act
    const backends = await fetchDiscoveryBackends();

    // Assert
    const [url, init] = getFetchCall(fetchMock);
    expect(url).toBe(`${getAgentServerBaseUrl()}/api/discovery/backends`);
    expect(init).toMatchObject({
      headers: { "X-Session-API-Key": localBackend.apiKey },
    });
    expect(backends).toHaveLength(3);
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

describe("selectForeignReadBackends", () => {
  const ingressUrl = "https://oh.example";

  it("keeps every discovered backend that is not the ingress, slots included", () => {
    // Arrange — the ingress is reachable at the same origin, so a foreign read
    // must never be pointed back at it.
    const backends = [
      { name: "automations", role: "ingress", url: ingressUrl, healthy: true },
      {
        name: "backend-1",
        role: "slot",
        url: "https://oh.example:8443",
        healthy: true,
      },
      {
        name: "backend-2",
        role: "slot",
        url: "https://oh.example:8444/",
        healthy: true,
      },
      {
        name: "automation-runs",
        role: "automations",
        url: "https://oh.example:8445",
        healthy: true,
      },
    ];

    // Act
    const peers = selectForeignReadBackends(backends, ingressUrl);

    // Assert — the ingress is dropped, both slots survive with a normalized url.
    expect(peers.map((peer) => peer.name)).toEqual([
      "backend-1",
      "backend-2",
      "automation-runs",
    ]);
    expect(peers.map((peer) => peer.url)).toEqual([
      "https://oh.example:8443",
      "https://oh.example:8444",
      "https://oh.example:8445",
    ]);
  });

  it("drops an unhealthy backend and an entry with no url", () => {
    // Arrange
    const backends = [
      {
        name: "backend-1",
        role: "slot",
        url: "https://oh.example:8443",
        healthy: false,
      },
      { name: "backend-2", role: "slot", url: "https://oh.example:8444" },
      { name: "backend-3", role: "slot", url: "" },
    ];

    // Act
    const peers = selectForeignReadBackends(backends, ingressUrl);

    // Assert
    expect(peers.map((peer) => peer.name)).toEqual(["backend-2"]);
  });

  it("normalizes a trailing slash so the ingress is recognized either way", () => {
    // Arrange
    const backends = [
      { name: "automations", role: "ingress", url: `${ingressUrl}/` },
    ];

    // Act and assert
    expect(selectForeignReadBackends(backends, ingressUrl)).toEqual([]);
  });
});

describe("isDiscoveredPeerHost", () => {
  const peers = [
    {
      name: "backend-1",
      role: "slot",
      url: "https://oh.example:8443",
    },
  ];

  it("accepts a discovered peer, trailing slash and all", () => {
    expect(isDiscoveredPeerHost("https://oh.example:8443", peers)).toBe(true);
    expect(isDiscoveredPeerHost("https://oh.example:8443/", peers)).toBe(true);
  });

  it("refuses an address the document does not report", () => {
    // The session key must never ride to an address a link chose.
    expect(isDiscoveredPeerHost("https://attacker.example", peers)).toBe(false);
    expect(isDiscoveredPeerHost("", peers)).toBe(false);
    // A prefix of a real peer is not a peer.
    expect(isDiscoveredPeerHost("https://oh.example:844", peers)).toBe(false);
  });
});
