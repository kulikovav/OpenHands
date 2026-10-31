import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "test-utils";
import { ConversationPanel } from "#/components/features/conversation-panel/conversation-panel";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import {
  createMockConversation,
  setupConversationPanelTest,
} from "./conversation-panel-test-utils";

const mockStopConversationMutate = vi.fn();
vi.mock("#/hooks/mutation/use-unified-stop-conversation", () => ({
  useUnifiedPauseConversation: () => ({ mutate: mockStopConversationMutate }),
}));
vi.mock("#/utils/custom-toast-handlers", () => ({
  displaySuccessToast: vi.fn(),
  displayErrorToast: vi.fn(),
  TOAST_OPTIONS: {},
}));

// The panel resolves the owner imperatively. `useUserConversation` reads the
// other exports of this module, so only the resolver is replaced.
const resolveOwnerUrl =
  vi.fn<(conversationId: string) => Promise<string | undefined>>();
vi.mock(
  "#/hooks/query/use-conversation-owner-backend",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("#/hooks/query/use-conversation-owner-backend")
    >()),
    useConversationOwnerUrlResolver: () => resolveOwnerUrl,
  }),
);

const OWNER_URL = "https://a1.oh.example:8443";

describe("ConversationPanel owner routing", () => {
  setupConversationPanelTest();

  beforeEach(() => {
    resolveOwnerUrl.mockReset();
    resolveOwnerUrl.mockResolvedValue(OWNER_URL);
  });

  it("reads the record back from the resolved owner before the tag write", async () => {
    // Arrange — the active backend lists the row but does not hold it.
    const slotOwned = createMockConversation({
      id: "slot-1",
      title: "Slot row",
      tags: { owner: "alice", archived: "false" },
    });
    vi.mocked(
      AgentServerConversationService.searchConversations,
    ).mockResolvedValue({ items: [slotOwned], next_page_id: null });

    renderWithProviders(<ConversationPanel />);

    // Act — save the tag editor without changing any row.
    const titleNode = await screen.findByText("Slot row");
    const card = titleNode.closest(
      '[data-testid="conversation-card"]',
    ) as HTMLElement;
    await userEvent.setup().click(within(card).getByTestId("ellipsis-button"));
    await userEvent
      .setup()
      .click(await screen.findByTestId("edit-tags-button"));
    await userEvent.setup().click(await screen.findByTestId("confirm-button"));

    // Assert — the resolver answered for this row, and the read-back that
    // feeds the replace-all tag map addressed that same server.
    await vi.waitFor(() =>
      expect(resolveOwnerUrl).toHaveBeenCalledWith("slot-1"),
    );
    expect(
      AgentServerConversationService.batchGetAppConversations,
    ).toHaveBeenCalledWith(["slot-1"], OWNER_URL);
  });
});
