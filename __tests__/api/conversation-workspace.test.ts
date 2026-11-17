import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { server } from "#/mocks/node";
import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import type { AgentServerInfo } from "#/api/agent-server-compatibility";
import {
  clearCachedAgentServerInfo,
  GOVERNED_CONVERSATION_RUNTIME_CAPABILITY,
  isGovernedConversationRuntime,
} from "#/api/agent-server-compatibility";
import {
  getConversationServerInfo,
  resolveNewConversationWorkspace,
  usesIsolatedWorkspace,
} from "#/api/conversation-workspace";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

const governedDockerOnly: AgentServerInfo = {
  version: "1.62.0",
  uptime: 0,
  idle_time: 0,
  conversation_runtime: "docker",
  available_conversation_runtimes: [],
  capabilities: [GOVERNED_CONVERSATION_RUNTIME_CAPABILITY],
};

// An older governed deployment: the docker-only report predates the
// capability flag, so the missing capability must still read as governed.
const dockerOnlyWithoutCapability: AgentServerInfo = {
  version: "1.62.0",
  uptime: 0,
  idle_time: 0,
  conversation_runtime: "docker",
  available_conversation_runtimes: [],
};

const ungovernedLocalHost: AgentServerInfo = {
  version: "1.62.0",
  uptime: 0,
  idle_time: 0,
  conversation_runtime: "local",
  available_conversation_runtimes: [],
};

const serverInfoHandler = (info: AgentServerInfo | null) =>
  http.get("*/server_info", () =>
    info === null
      ? HttpResponse.error()
      : HttpResponse.json(info),
  );

const localBackend: Backend = {
  id: "local-canvas-1",
  name: "Local",
  host: "http://localhost:18923",
  apiKey: "key",
  kind: "local",
};

describe("conversation workspace gating", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
  });

  afterEach(() => {
    clearCachedAgentServerInfo();
    __resetActiveStoreForTests();
  });

  describe("isolated-workspace refusal (regression: existing branch, no new gating)", () => {
    it("refuses a repo workspace on a docker-only server with the isolated-workspace reason", async () => {
      server.use(serverInfoHandler(dockerOnlyWithoutCapability));

      await expect(
        resolveNewConversationWorkspace({
          conversationId: "conv-1",
          workingDir: "/repo/project",
          selectedRepository: null,
        }),
      ).rejects.toThrow(i18n.t(I18nKey.HOME$ISOLATED_WORKSPACE_NOTICE));
    });

    it("refuses an attached host workspace on a docker-only server", async () => {
      server.use(serverInfoHandler(dockerOnlyWithoutCapability));

      await expect(
        resolveNewConversationWorkspace({
          conversationId: "conv-1",
          workingDir: undefined,
          selectedRepository: "owner/repo",
        }),
      ).rejects.toThrow(i18n.t(I18nKey.HOME$ISOLATED_WORKSPACE_NOTICE));
    });

    it("accepts the isolated /workspace start when no host selection is forwarded", async () => {
      server.use(serverInfoHandler(dockerOnlyWithoutCapability));

      const workspace = await resolveNewConversationWorkspace({
        conversationId: "conv-1",
        workingDir: "/workspace",
        parentConversationId: "conv-0",
        selectedRepository: null,
      });

      expect(workspace.isolated).toBe(true);
      expect(workspace.workingDir).toBe("/workspace");
      expect(workspace.runtimeSelectable).toBe(false);
      // An isolated workspace loads no host hooks.
      expect(workspace.hooksProjectDir).toBeNull();
    });

    it("keeps every workspace mode on an ungoverned local host", async () => {
      server.use(serverInfoHandler(ungovernedLocalHost));

      const workspace = await resolveNewConversationWorkspace({
        conversationId: "conv-1",
        // Absolute so the suite needs no /api/file/home round-trip.
        workingDir: "/repo/project",
        selectedRepository: null,
      });

      expect(workspace.isolated).toBe(false);
      expect(workspace.workingDir).toBe("/repo/project");
      expect(usesIsolatedWorkspace(ungovernedLocalHost)).toBe(false);
    });

    it("falls back to host behavior when the probe fails and leaves the server-side 422 as the backstop", async () => {
      server.use(serverInfoHandler(null));

      const info = await getConversationServerInfo();
      expect(info).toBeNull();
      const workspace = await resolveNewConversationWorkspace({
        conversationId: "conv-1",
        workingDir: "/repo/project",
        selectedRepository: null,
      });
      // No client refusal; the governed server rejects a host start itself.
      expect(workspace.isolated).toBe(false);
    });
  });

  describe("governed runtime capability", () => {
    it("reads governance from the advertised capability", () => {
      expect(isGovernedConversationRuntime(governedDockerOnly)).toBe(true);
    });

    it("treats a docker-only server without the capability as governed", () => {
      expect(isGovernedConversationRuntime(dockerOnlyWithoutCapability)).toBe(
        true,
      );
    });

    it("keeps a host-local backend ungoverned", () => {
      expect(isGovernedConversationRuntime(ungovernedLocalHost)).toBe(false);
    });

    it("does not infer governance from an unanswered probe", () => {
      expect(isGovernedConversationRuntime(null)).toBe(false);
      expect(isGovernedConversationRuntime(undefined)).toBe(false);
    });
  });
});