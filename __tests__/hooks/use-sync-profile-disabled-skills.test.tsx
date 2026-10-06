import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDisabledCatalogSkills } from "#/utils/skill-enablement";
import { useSyncProfileDisabledSkills } from "#/hooks/use-sync-profile-disabled-skills";

const useSettingsMock = vi.fn();
const useActiveBackendMock = vi.fn();
const useAgentProfilesMock = vi.fn();
const saveProfileMock = vi.fn();
const fetchQueryMock = vi.fn();

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));
vi.mock("#/hooks/query/use-agent-profiles", () => ({
  useAgentProfiles: () => useAgentProfilesMock(),
}));
vi.mock("#/hooks/mutation/use-save-agent-profile", () => ({
  useSaveAgentProfile: () => ({ mutateAsync: saveProfileMock }),
}));
vi.mock("#/api/agent-profiles-service/agent-profiles-service.api", () => ({
  default: { getProfile: vi.fn() },
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ fetchQuery: fetchQueryMock }),
}));

const SETTINGS = {
  enabled_skills: ["add-skill"],
  disabled_skills: ["house-rules"],
};
const EXPLORER = {
  id: "p1",
  name: "explorer",
  agent_kind: "openhands",
  revision: 3,
};
const REVIEWER = {
  id: "p2",
  name: "code-review",
  agent_kind: "openhands",
  revision: 5,
};
const DENIED = resolveDisabledCatalogSkills({
  enabledSkills: SETTINGS.enabled_skills,
  disabledSkills: SETTINGS.disabled_skills,
});

function detail(name: string, revision: number, disabledSkills: string[]) {
  return {
    name,
    profile: {
      id: name === EXPLORER.name ? EXPLORER.id : REVIEWER.id,
      name,
      revision,
      agent_kind: "openhands",
      llm_profile_ref: "deepseek-v4.1-flash",
      disabled_skills: disabledSkills,
    },
  };
}

describe("useSyncProfileDisabledSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "local", id: "b1" },
      orgId: null,
    });
    useSettingsMock.mockReturnValue({
      data: SETTINGS,
      isLoading: false,
      isError: false,
    });
    useAgentProfilesMock.mockReturnValue({ data: { profiles: [EXPLORER] } });
    saveProfileMock.mockResolvedValue({});
  });

  it("writes the catalog complement onto a stale profile", async () => {
    // The stored list still denies an enabled skill and misses the rest.
    fetchQueryMock.mockResolvedValue(
      detail(EXPLORER.name, EXPLORER.revision, ["add-skill"]),
    );

    renderHook(() => useSyncProfileDisabledSkills());

    await waitFor(() => expect(saveProfileMock).toHaveBeenCalledTimes(1));
    const [saved] = saveProfileMock.mock.calls[0] as [
      { name: string; profile: Record<string, unknown> },
    ];
    expect(saved.name).toBe(EXPLORER.name);
    expect(saved.profile.disabled_skills).toEqual(DENIED);
    expect(saved.profile.disabled_skills).not.toContain("add-skill");
    // A whole-profile overwrite keeps the stored fields and drops identity.
    expect(saved.profile.llm_profile_ref).toBe("deepseek-v4.1-flash");
    expect(saved.profile).not.toHaveProperty("id");
    expect(saved.profile).not.toHaveProperty("revision");
  });

  it("leaves an in-sync profile alone", async () => {
    fetchQueryMock.mockResolvedValue(
      detail(EXPLORER.name, EXPLORER.revision, DENIED),
    );

    renderHook(() => useSyncProfileDisabledSkills());

    await waitFor(() => expect(fetchQueryMock).toHaveBeenCalled());
    expect(saveProfileMock).not.toHaveBeenCalled();
  });

  it("skips a profile saved after the list was read", async () => {
    fetchQueryMock.mockResolvedValue(
      detail(EXPLORER.name, EXPLORER.revision + 1, []),
    );

    renderHook(() => useSyncProfileDisabledSkills());

    await waitFor(() => expect(fetchQueryMock).toHaveBeenCalled());
    expect(saveProfileMock).not.toHaveBeenCalled();
  });

  it("keeps syncing other profiles after one fails", async () => {
    useAgentProfilesMock.mockReturnValue({
      data: { profiles: [EXPLORER, REVIEWER] },
    });
    fetchQueryMock.mockImplementation((options: { queryKey: unknown[] }) => {
      const name = options.queryKey.at(-1);
      if (name === EXPLORER.name) {
        return Promise.reject(new Error("profile store busy"));
      }
      return Promise.resolve(detail(REVIEWER.name, REVIEWER.revision, []));
    });

    renderHook(() => useSyncProfileDisabledSkills());

    await waitFor(() => expect(saveProfileMock).toHaveBeenCalledTimes(1));
    expect(saveProfileMock.mock.calls[0][0].name).toBe(REVIEWER.name);
  });

  it("runs at most once while the invalidated list refetches", async () => {
    fetchQueryMock.mockResolvedValue(
      detail(EXPLORER.name, EXPLORER.revision, []),
    );

    const { rerender } = renderHook(() => useSyncProfileDisabledSkills());
    rerender();
    rerender();

    await waitFor(() => expect(saveProfileMock).toHaveBeenCalledTimes(1));
    expect(fetchQueryMock).toHaveBeenCalledTimes(1);
  });

  it("skips cloud, which never reads the allow-list", async () => {
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "cloud", id: "cloud" },
      orgId: null,
    });

    renderHook(() => useSyncProfileDisabledSkills());

    await waitFor(() => expect(fetchQueryMock).not.toHaveBeenCalled());
  });

  it("skips ACP profiles, whose launches ignore the deny-list", async () => {
    useAgentProfilesMock.mockReturnValue({
      data: { profiles: [{ ...EXPLORER, agent_kind: "acp" }] },
    });

    renderHook(() => useSyncProfileDisabledSkills());

    await waitFor(() => expect(fetchQueryMock).not.toHaveBeenCalled());
  });
});
