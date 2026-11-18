import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryBackend } from "#/api/discovery/discovery-backends.api";
import {
  discoveryBackendId,
  isDiscoveryBackend,
  seedDiscoveryBackends,
} from "#/api/backend-registry/discovery-seed";
import type { Backend } from "#/api/backend-registry/types";

const SESSION_KEY = "deployment-session-key";

const discoveryEntry = (
  overrides: Partial<DiscoveryBackend> = {},
): DiscoveryBackend => ({
  name: "backend-1",
  role: "slot",
  url: "https://backend-1.oh.example.com",
  port: 18100,
  active: true,
  healthy: true,
  ...overrides,
});

const manualBackend: Backend = {
  id: "default-local",
  name: "Local",
  host: "https://oh.example.com",
  apiKey: SESSION_KEY,
  kind: "local",
};

beforeEach(() => {
  vi.stubEnv("VITE_SESSION_API_KEY", SESSION_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seedDiscoveryBackends", () => {
  it("registers the deployment's backends that the registry lacks", () => {
    const seeded = seedDiscoveryBackends(
      [
        discoveryEntry(),
        discoveryEntry({
          name: "automation-runs",
          role: "automations",
          url: "https://automation-runs1.oh.example.com",
        }),
        discoveryEntry({
          name: "openshell",
          url: "https://oh-backend1.ru1.example.com/",
        }),
      ],
      [manualBackend],
    );

    expect(seeded).toHaveLength(4);
    expect(seeded.slice(1)).toEqual([
      {
        id: discoveryBackendId("backend-1"),
        name: "backend-1",
        host: "https://backend-1.oh.example.com",
        apiKey: SESSION_KEY,
        kind: "local",
      },
      {
        id: discoveryBackendId("automation-runs"),
        name: "automation-runs",
        host: "https://automation-runs1.oh.example.com",
        apiKey: SESSION_KEY,
        kind: "local",
      },
      {
        id: discoveryBackendId("openshell"),
        name: "openshell",
        host: "https://oh-backend1.ru1.example.com",
        apiKey: SESSION_KEY,
        kind: "local",
      },
    ]);
  });

  it("keeps a registered backend at the same address and its manual record", () => {
    const handAdded: Backend = {
      id: "my-slot",
      name: "Slot one",
      host: "https://backend-1.oh.example.com/",
      apiKey: "edited-key",
      kind: "local",
    };

    const seeded = seedDiscoveryBackends([discoveryEntry()], [handAdded]);

    expect(seeded).toEqual([handAdded]);
  });

  it("adds nothing on a second read of the same document", () => {
    const once = seedDiscoveryBackends([discoveryEntry()], [manualBackend]);
    const twice = seedDiscoveryBackends([discoveryEntry()], once);

    expect(twice).toEqual(once);
  });

  it("skips an entry with no address", () => {
    const seeded = seedDiscoveryBackends(
      [discoveryEntry({ url: "" })],
      [manualBackend],
    );

    expect(seeded).toEqual([manualBackend]);
  });

  it("marks a seeded backend as discovered and a manual one as not", () => {
    expect(isDiscoveryBackend({ id: discoveryBackendId("backend-1") })).toBe(
      true,
    );
    expect(isDiscoveryBackend(manualBackend)).toBe(false);
  });
});