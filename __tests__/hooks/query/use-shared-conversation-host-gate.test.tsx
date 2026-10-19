import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useSharedConversation } from "#/hooks/query/use-shared-conversation";
import { useSharedConversationEvents } from "#/hooks/query/use-shared-conversation-events";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

const INGRESS_URL = "https://oh.example";
const SLOT_URL = "https://oh.example:8443";
const FOREIGN_URL = "https://attacker.example";

vi.mock("#/api/agent-server-config", () => ({
  getAgentServerBaseUrl: () => INGRESS_URL,
  getAgentServerSessionApiKey: () => "session-key",
}));

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      getRuntimeConversation: vi.fn(),
    },
  }),
);

// Only the fetch is stubbed, so the real peer selection and host gate run.
vi.mock("#/api/discovery/discovery-backends.api", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("#/api/discovery/discovery-backends.api")
  >()),
  fetchDiscoveryBackends: vi.fn(),
}));

const { fetchDiscoveryBackends } =
  await import("#/api/discovery/discovery-backends.api");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function QueryWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return QueryWrapper;
}

const runtimeConversation = {
  id: "conv-1",
  title: "Nightly review",
  metrics: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  status: "idle",
  stats: { usage_to_metrics: {} },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchDiscoveryBackends).mockResolvedValue([
    { name: "automations", role: "ingress", url: INGRESS_URL, healthy: true },
    { name: "backend-1", role: "slot", url: SLOT_URL, healthy: true },
  ]);
  vi.mocked(
    AgentServerConversationService.getRuntimeConversation,
  ).mockResolvedValue(runtimeConversation);
});

describe("shared conversation host gate", () => {
  it("reads the transcript from a backend the discovery document reports", async () => {
    // Arrange and act
    const { result } = renderHook(
      () => useSharedConversation("conv-1", { host: SLOT_URL }),
      { wrapper: createWrapper() },
    );

    // Assert — the session key rides to the discovered peer.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      AgentServerConversationService.getRuntimeConversation,
    ).toHaveBeenCalledWith("conv-1", SLOT_URL, "session-key");
  });

  it("never sends the session key to an address the document does not report", async () => {
    // Arrange and act — a crafted ?host= link naming a foreign address.
    const { result } = renderHook(
      () => useSharedConversation("conv-1", { host: FOREIGN_URL }),
      { wrapper: createWrapper() },
    );

    // Assert — the read stays disabled and no request is made.
    await waitFor(() => expect(fetchDiscoveryBackends).toHaveBeenCalled());
    expect(
      AgentServerConversationService.getRuntimeConversation,
    ).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("never sends the session key to the ingress address", async () => {
    // The ingress is reachable at the same origin, so it is not a peer and a
    // link naming it must not be treated as a foreign read.
    renderHook(() => useSharedConversation("conv-1", { host: INGRESS_URL }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(fetchDiscoveryBackends).toHaveBeenCalled());
    expect(
      AgentServerConversationService.getRuntimeConversation,
    ).not.toHaveBeenCalled();
  });

  it("does not read a foreign transcript until the document answers", async () => {
    // Arrange — discovery is slow, so the gate cannot have allowed the host yet.
    vi.mocked(fetchDiscoveryBackends).mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(
      () => useSharedConversationEvents("conv-1", { host: SLOT_URL }),
      { wrapper: createWrapper() },
    );

    // Assert
    expect(
      AgentServerConversationService.getRuntimeConversation,
    ).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });
});
