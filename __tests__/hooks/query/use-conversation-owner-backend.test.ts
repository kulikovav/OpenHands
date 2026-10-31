import { describe, expect, it, vi } from "vitest";
import { resolveConversationOwnerBackend } from "#/hooks/query/use-conversation-owner-backend";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { DiscoveryBackend } from "#/api/discovery/discovery-backends.api";

const peer = (name: string, url: string): DiscoveryBackend => ({
  name,
  role: "slot",
  url,
});

describe("resolveConversationOwnerBackend", () => {
  it("answers a single-server deployment without a request", async () => {
    // Arrange
    const canServe = vi.spyOn(
      AgentServerConversationService,
      "canServeTranscriptOn",
    );

    // Act
    const owner = await resolveConversationOwnerBackend("conv-1", []);

    // Assert
    expect(owner).toBeNull();
    expect(canServe).not.toHaveBeenCalled();
  });

  it("answers null when the active backend serves the transcript", async () => {
    // Arrange
    const canServe = vi
      .spyOn(AgentServerConversationService, "canServeTranscriptOn")
      .mockResolvedValue(true);

    // Act
    const owner = await resolveConversationOwnerBackend("conv-1", [
      peer("slot-a", "https://a1.oh.example:8443"),
    ]);

    // Assert — the active server answered, so no peer is probed.
    expect(owner).toBeNull();
    expect(canServe).toHaveBeenCalledTimes(1);
    expect(canServe).toHaveBeenCalledWith("conv-1", null, expect.any(String));
  });

  it("returns the first peer that serves the transcript", async () => {
    // Arrange — the active server misses; the second peer holds the log.
    vi.spyOn(
      AgentServerConversationService,
      "canServeTranscriptOn",
    ).mockImplementation(async (_id: string, url: string | null | undefined) =>
      url === "https://a2.oh.example:8443",
    );

    // Act
    const owner = await resolveConversationOwnerBackend("conv-1", [
      peer("slot-a", "https://a1.oh.example:8443"),
      peer("slot-b", "https://a2.oh.example:8443"),
      peer("slot-c", "https://a3.oh.example:8443"),
    ]);

    // Assert — sequential probing stops at the owner.
    expect(owner?.url).toBe("https://a2.oh.example:8443");
  });

  it("answers null when no backend serves the transcript", async () => {
    // Arrange
    const canServe = vi
      .spyOn(AgentServerConversationService, "canServeTranscriptOn")
      .mockResolvedValue(false);

    // Act
    const owner = await resolveConversationOwnerBackend("conv-1", [
      peer("slot-a", "https://a1.oh.example:8443"),
    ]);

    // Assert
    expect(owner).toBeNull();
    expect(canServe).toHaveBeenCalledTimes(2);
  });
});