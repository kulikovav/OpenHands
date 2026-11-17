import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { LlmSettingsLocalView } from "#/components/features/settings/llm-profiles/llm-settings-local-view";
import ProfilesService, {
  ProfileInfo,
} from "#/api/profiles-service/profiles-service.api";
import ProviderConnectionsService from "#/api/provider-connections-service/provider-connections-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";
import { clearCachedAgentServerInfo } from "#/api/agent-server-compatibility";

// The governed read-only decision reads the /server_info capability probe;
// the client below is the mock seam. Ungoverned is the default so the
// editable-otherwise assertions run through the same component.
const getServerInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return { getServerInfo: getServerInfoMock };
  }),
  LLMMetadataClient: vi.fn(function LLMMetadataClientMock() {
    return { searchModels: vi.fn().mockRejectedValue(new Error("unused")) };
  }),
  SettingsClient: vi.fn(function SettingsClientMock() {
    return { getSettings: vi.fn().mockRejectedValue(new Error("unused")) };
  }),
}));

const localServerInfo = {
  version: "1.62.0",
  conversation_runtime: "local",
};

const governedServerInfo = {
  version: "1.62.0",
  conversation_runtime: "docker",
  available_conversation_runtimes: [],
  capabilities: ["governed_conversation_runtime_v1"],
};

const makeProfile = (overrides: Partial<ProfileInfo> = {}): ProfileInfo => ({
  name: "gpt-4-profile",
  model: "openai/gpt-4",
  base_url: null,
  api_key_set: true,
  ...overrides,
});

describe("LLM settings on a governed backend", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCachedAgentServerInfo();
    vi.spyOn(ProfilesService, "listProfiles").mockResolvedValue({
      profiles: [
        makeProfile(),
        makeProfile({
          name: "claude-profile",
          model: "anthropic/claude-3",
          api_key_set: false,
        }),
      ],
      active_profile: "gpt-4-profile",
    });
    vi.spyOn(ProviderConnectionsService, "list").mockResolvedValue([]);
    vi.spyOn(SettingsService, "getSettings").mockRejectedValue(
      new Error("unused in this suite"),
    );
  });

  afterEach(() => {
    clearCachedAgentServerInfo();
  });

  it("removes every profile write action and explains the key owner while rows stay readable", async () => {
    getServerInfoMock.mockResolvedValue(governedServerInfo);

    renderWithProviders(<LlmSettingsLocalView />);

    // The profile list stays visible, so the active model stays readable.
    const rows = await screen.findAllByTestId("profile-row");
    expect(rows).toHaveLength(2);
    expect(
      await within(rows[0]).findByText("openai/gpt-4"),
    ).toBeInTheDocument();

    await screen.findByTestId("llm-settings-governed-notice");

    expect(screen.queryByTestId("add-llm-profile")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("add-models-from-provider"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("profile-menu-trigger"),
    ).not.toBeInTheDocument();
  });

  it("keeps the profiles editable on an ungoverned backend", async () => {
    getServerInfoMock.mockResolvedValue(localServerInfo);

    renderWithProviders(<LlmSettingsLocalView />);

    await screen.findAllByTestId("profile-row");
    await waitFor(() =>
      expect(screen.getByTestId("add-llm-profile")).toBeInTheDocument(),
    );
    // The first row offers its actions menu, so the list is not read-only.
    await waitFor(() =>
      expect(
        screen.getAllByTestId("profile-menu-trigger").length,
      ).toBeGreaterThan(0),
    );
    expect(
      screen.queryByTestId("llm-settings-governed-notice"),
    ).not.toBeInTheDocument();
  });
});