import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import {
  createMockConversation,
  setupConversationPanelTest,
} from "./conversation-panel-test-utils";

// Conversations the deployment's peer backends list. The panel merges these
// into its own list, and marks them as owned elsewhere.
const mockPeerConversations = vi.fn<() => AppConversation[]>(() => []);
vi.mock("#/hooks/query/use-peer-conversations", () => ({
  usePeerConversations: () => mockPeerConversations(),
}));

describe("ConversationPanel peer backend conversations", () => {
  setupConversationPanelTest();

  beforeEach(() => {
    // No peer conversations unless a test asks for them.
    mockPeerConversations.mockReturnValue([]);
  });

  const PEER_BACKEND_URL = "https://oh.example:8445";

  const renderPanel = () => renderWithProviders(<ConversationPanel />);

  /** The card that renders `title`, whichever position it sorts into. */
  const cardForTitle = async (title: string): Promise<HTMLElement> => {
    const titleNode = await screen.findByText(title);
    const card = titleNode.closest('[data-testid="conversation-card"]');
    expect(card).not.toBeNull();
    return card as HTMLElement;
  };

  it("lists a conversation only another backend carries", async () => {
    // Arrange — an automation run's conversation. Each agent server builds its
    // catalog once at start, so this one is absent from the active backend's
    // list and only a peer reports it.
    mockPeerConversations.mockReturnValue([
      createMockConversation({
        id: "run-1",
        title: "Automation Run",
        source_backend_url: PEER_BACKEND_URL,
      }),
    ]);

    // Act
    renderPanel();

    // Assert — the sidebar shows the whole deployment, not one backend.
    expect(await screen.findByText("Automation Run")).toBeInTheDocument();
  });

  it("offers no mutation for a conversation another backend owns", async () => {
    // A mutation would be sent to the active backend, which does not hold the
    // conversation, so the row must offer navigation only.
    mockPeerConversations.mockReturnValue([
      createMockConversation({
        id: "run-1",
        title: "Automation Run",
        source_backend_url: PEER_BACKEND_URL,
      }),
    ]);

    renderPanel();

    // Act
    const card = await cardForTitle("Automation Run");

    // Assert — the card renders no action affordance at all. The ellipsis is
    // only drawn when the card has an action to offer, so its absence is what
    // proves no mutation can be reached for a conversation owned elsewhere.
    expect(within(card).queryByTestId("ellipsis-button")).toBeNull();
    expect(
      within(card).queryByTestId("conversation-card-hover-actions"),
    ).toBeNull();
  });

  it("keeps the local copy, and its mutations, when both backends list a conversation", async () => {
    // Arrange — the active backend lists id "1"; a peer reports the same id.
    mockPeerConversations.mockReturnValue([
      createMockConversation({
        id: "1",
        title: "Peer Copy",
        source_backend_url: PEER_BACKEND_URL,
      }),
    ]);

    // Act
    renderPanel();

    // Assert — one card, and it is the local one, so the row still offers its
    // mutations.
    expect(await screen.findByText("Conversation 1")).toBeInTheDocument();
    expect(screen.queryByText("Peer Copy")).toBeNull();

    const user = userEvent.setup();
    const card = await cardForTitle("Conversation 1");
    await user.click(within(card).getByTestId("ellipsis-button"));
    expect(screen.getByTestId("delete-button")).toBeInTheDocument();
  });

  it("renders one card when several peers list the same conversation", async () => {
    // Arrange — the servers share a conversation store, so several peers can
    // report the same conversation. The active backend's loaded pages do not
    // hold it (e.g. it was just deleted), so nothing else suppresses the
    // copies, and the panel must dedupe them against each other.
    mockPeerConversations.mockReturnValue([
      createMockConversation({
        id: "shared-1",
        title: "Shared Conversation",
        source_backend_url: PEER_BACKEND_URL,
      }),
      createMockConversation({
        id: "shared-1",
        title: "Shared Conversation",
        source_backend_url: "https://oh.example:8444",
      }),
    ]);

    // Act
    renderPanel();

    // Assert — one row, not one per peer.
    expect(await screen.findAllByText("Shared Conversation")).toHaveLength(1);
  });
});
