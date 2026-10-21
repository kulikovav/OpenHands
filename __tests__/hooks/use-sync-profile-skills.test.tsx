import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileChange } from "#/hooks/mutation/sync-agent-profiles";
import { useSyncProfileSkills } from "#/hooks/use-sync-profile-skills";

const updateEveryMock = vi.fn();
const useSettingsMock = vi.fn();
const useActiveBackendMock = vi.fn();
const useAgentProfilesMock = vi.fn();
const useDefaultProfileSkillsMock = vi.fn();

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({}),
}));
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));
vi.mock("#/hooks/query/use-agent-profiles", () => ({
  useAgentProfiles: () => useAgentProfilesMock(),
}));
vi.mock("#/hooks/use-skill-enablement", () => ({
  useDefaultProfileSkills: () => useDefaultProfileSkillsMock(),
}));
vi.mock("#/hooks/mutation/sync-agent-profiles", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("#/hooks/mutation/sync-agent-profiles")
    >();
  return {
    ...actual,
    updateEveryAgentProfile: (...args: unknown[]) => updateEveryMock(...args),
  };
});

type Profile = Parameters<ProfileChange>[0];
type SkillFields = {
  public_skills?: string[];
  disabled_skills?: string[];
};

const profile = (fields: Record<string, unknown>): Profile =>
  fields as unknown as Profile;

const SETTINGS = {
  enabled_skills: ["docker", "add-skill"],
  disabled_skills: ["house-rules"],
};
const PROFILES = [
  { id: "1", name: "General", agent_kind: "openhands" },
  { id: "2", name: "Review-High", agent_kind: "openhands" },
  { id: "3", name: "Acp", agent_kind: "acp" },
];
const NO_DEFAULT = { ready: true, failed: false, selection: null };

function changeOfCall(index = 0): ProfileChange {
  return updateEveryMock.mock.calls[index][1] as ProfileChange;
}

describe("useSyncProfileSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "local", id: "b1" },
      orgId: null,
    });
    useSettingsMock.mockReturnValue({ data: SETTINGS });
    useAgentProfilesMock.mockReturnValue({ data: { profiles: PROFILES } });
    useDefaultProfileSkillsMock.mockReturnValue(NO_DEFAULT);
    updateEveryMock.mockResolvedValue(undefined);
  });

  it("applies the settings selection when no default profile exists", async () => {
    renderHook(() => useSyncProfileSkills());

    await waitFor(() => expect(updateEveryMock).toHaveBeenCalledTimes(1));
    const change = changeOfCall();
    const fields = change(
      profile({ name: "General", agent_kind: "openhands" }),
    ) as SkillFields | null;
    expect([...(fields?.public_skills ?? [])].sort()).toEqual([
      "add-skill",
      "docker",
    ]);
    expect(fields?.disabled_skills).toEqual(["house-rules"]);
  });

  it("leaves ACP profiles and in-sync profiles alone", async () => {
    renderHook(() => useSyncProfileSkills());

    await waitFor(() => expect(updateEveryMock).toHaveBeenCalledTimes(1));
    const change = changeOfCall();
    expect(change(profile({ name: "Acp", agent_kind: "acp" }))).toBeNull();
    expect(
      change(
        profile({
          name: "General",
          agent_kind: "openhands",
          public_skills: ["add-skill", "docker"],
          disabled_skills: ["house-rules"],
        }),
      ),
    ).toBeNull();
  });

  it("prefers the default profile's selection over settings", async () => {
    useDefaultProfileSkillsMock.mockReturnValue({
      ready: true,
      failed: false,
      selection: { enabledSkills: ["docker"], disabledSkills: [] },
    });

    renderHook(() => useSyncProfileSkills());

    await waitFor(() => expect(updateEveryMock).toHaveBeenCalledTimes(1));
    const fields = changeOfCall()(
      profile({ name: "General", agent_kind: "openhands" }),
    ) as SkillFields | null;
    expect(fields?.public_skills).toEqual(["docker"]);
    expect(fields?.disabled_skills).toEqual([]);
  });

  it("writes once while the invalidated list refetches", async () => {
    const { rerender } = renderHook(() => useSyncProfileSkills());
    rerender();
    rerender();

    await waitFor(() => expect(updateEveryMock).toHaveBeenCalledTimes(1));
  });

  it("waits for the selection and skips a cloud backend", () => {
    useDefaultProfileSkillsMock.mockReturnValue({
      ready: false,
      failed: false,
      selection: null,
    });
    renderHook(() => useSyncProfileSkills());
    expect(updateEveryMock).not.toHaveBeenCalled();

    useDefaultProfileSkillsMock.mockReturnValue(NO_DEFAULT);
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "cloud", id: "cloud" },
      orgId: null,
    });
    renderHook(() => useSyncProfileSkills());
    expect(updateEveryMock).not.toHaveBeenCalled();
  });
});
