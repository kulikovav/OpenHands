import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/defaults.json", () => ({
  default: {
    compatibility: {
      minimumAgentServer: "1.47.0-rc.2",
    },
  },
}));

import {
  AgentServerUnsupportedVersionError,
  assertAgentServerVersionIsSupported,
  compareAgentServerVersions,
  MINIMUM_COMPATIBLE_AGENT_SERVER_VERSION,
  type AgentServerInfo,
} from "./agent-server-compatibility";

const serverInfo = (version: string): AgentServerInfo =>
  ({ version }) as AgentServerInfo;

describe("agent-server prerelease minimum compatibility", () => {
  it("accepts the stable release for a prerelease minimum", () => {
    expect(MINIMUM_COMPATIBLE_AGENT_SERVER_VERSION).toBe("1.47.0-rc.2");

    expect(() =>
      assertAgentServerVersionIsSupported(serverInfo("1.47.0")),
    ).not.toThrow();
    expect(compareAgentServerVersions("1.47.0", "1.47.0-rc.2")).toBe(1);
  });

  it("normalizes decorated input versions through the public comparator", () => {
    expect(compareAgentServerVersions(" v1.47.0+build.7 ", "1.47.0")).toBe(0);
  });

  it("compares prerelease identifiers at the configured version boundary", () => {
    expect(() =>
      assertAgentServerVersionIsSupported(serverInfo("1.47.0-rc.1")),
    ).toThrow(AgentServerUnsupportedVersionError);
    expect(() =>
      assertAgentServerVersionIsSupported(serverInfo("1.47.0-rc.2")),
    ).not.toThrow();
    expect(() =>
      assertAgentServerVersionIsSupported(serverInfo("1.47.0-rc.3")),
    ).not.toThrow();
  });
});

describe("semver prerelease ordering", () => {
  it("orders multi-digit prerelease numbers numerically", () => {
    expect(
      compareAgentServerVersions("1.62.0-bleenk.2", "1.62.0-bleenk.10"),
    ).toBe(-1);
    expect(
      compareAgentServerVersions("1.62.0-bleenk.10", "1.62.0-bleenk.2"),
    ).toBe(1);
    expect(
      compareAgentServerVersions("1.62.0-bleenk.9", "1.62.0-bleenk.10"),
    ).toBe(-1);
    expect(
      compareAgentServerVersions("1.62.0-bleenk.10", "1.62.0-bleenk.9"),
    ).toBe(1);
    expect(
      compareAgentServerVersions("1.62.0-bleenk.10", "1.62.0-bleenk.10"),
    ).toBe(0);
  });

  it("keeps a stable release above every prerelease of the same core", () => {
    for (const prerelease of [
      "bleenk.2",
      "bleenk.9",
      "bleenk.10",
      "rc.1",
      "1",
    ]) {
      expect(compareAgentServerVersions("1.62.0", `1.62.0-${prerelease}`)).toBe(
        1,
      );
      expect(compareAgentServerVersions(`1.62.0-${prerelease}`, "1.62.0")).toBe(
        -1,
      );
    }
  });

  it("applies numeric, alphanumeric, and prefix-length rules", () => {
    // Numeric identifiers sort below alphanumeric ones.
    expect(compareAgentServerVersions("1.62.0-1", "1.62.0-alpha")).toBe(-1);
    expect(compareAgentServerVersions("1.62.0-alpha", "1.62.0-1")).toBe(1);
    // A shorter equal prefix sorts lower.
    expect(compareAgentServerVersions("1.62.0-alpha", "1.62.0-alpha.1")).toBe(
      -1,
    );
    expect(compareAgentServerVersions("1.62.0-alpha.1", "1.62.0-alpha")).toBe(
      1,
    );
    // Alphanumeric identifiers compare in ASCII order.
    expect(compareAgentServerVersions("1.62.0-alpha", "1.62.0-beta")).toBe(-1);
    expect(compareAgentServerVersions("1.62.0-beta", "1.62.0-alpha")).toBe(1);
  });
});
