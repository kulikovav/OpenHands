import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useDeleteConversation } from "#/hooks/mutation/use-delete-conversation";

describe("useDeleteConversation", () => {
  it("invalidates the conversation list and start-tasks queries on settle", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "deleteConversation",
    ).mockResolvedValue(undefined);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({ conversationId: "conv-1" });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["user", "conversations"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["start-tasks"],
      });
    });
  });

  it("still invalidates both queries when the delete request fails", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "deleteConversation",
    ).mockRejectedValue(new Error("boom"));

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await expect(
      result.current.mutateAsync({ conversationId: "conv-1" }),
    ).rejects.toThrow("boom");

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["user", "conversations"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["start-tasks"],
      });
    });
  });

  it("deletes the conversation on every peer that still lists it", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "deleteConversation",
    ).mockResolvedValue(undefined);
    const deleteOnPeerSpy = vi
      .spyOn(AgentServerConversationService, "deleteConversationOn")
      .mockResolvedValue(undefined);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    // Two peers list the deleted conversation; a third lists another one.
    queryClient.setQueryData(
      ["peer-conversations", "https://oh.example:8443"],
      [
        { id: "conv-1", source_backend_url: "https://oh.example:8443" },
        { id: "conv-2", source_backend_url: "https://oh.example:8443" },
      ],
    );
    queryClient.setQueryData(
      ["peer-conversations", "https://oh.example:8445"],
      [{ id: "conv-1", source_backend_url: "https://oh.example:8445" }],
    );
    queryClient.setQueryData(
      ["peer-conversations", "https://oh.example:8446"],
      [{ id: "conv-3", source_backend_url: "https://oh.example:8446" }],
    );

    const { result } = renderHook(() => useDeleteConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({ conversationId: "conv-1" });

    // Assert — a peer that does not list the conversation is left alone.
    expect(deleteOnPeerSpy).toHaveBeenCalledTimes(2);
    expect(deleteOnPeerSpy).toHaveBeenCalledWith(
      "conv-1",
      "https://oh.example:8443",
    );
    expect(deleteOnPeerSpy).toHaveBeenCalledWith(
      "conv-1",
      "https://oh.example:8445",
    );

    // Assert — the cached peer lists drop the deleted row immediately, and the
    // peer queries refetch to confirm the peers no longer report it.
    expect(
      queryClient.getQueryData([
        "peer-conversations",
        "https://oh.example:8443",
      ]),
    ).toEqual([
      { id: "conv-2", source_backend_url: "https://oh.example:8443" },
    ]);
    expect(
      queryClient.getQueryData([
        "peer-conversations",
        "https://oh.example:8446",
      ]),
    ).toEqual([
      { id: "conv-3", source_backend_url: "https://oh.example:8446" },
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["peer-conversations"],
    });
  });
});
