import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  updateEveryAgentProfile,
  withSkillSelection,
} from "#/hooks/mutation/sync-agent-profiles";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useSettings } from "#/hooks/query/use-settings";
import { useDefaultProfileSkills } from "#/hooks/use-skill-enablement";
import {
  toSkillEnablement,
  type SkillEnablement,
} from "#/utils/skill-enablement";

/** Stable form of a selection, so an unchanged one does not re-enter. */
function selectionKey(selection: SkillEnablement): string {
  return JSON.stringify([
    [...(selection.enabledSkills ?? [])].sort(),
    [...(selection.disabledSkills ?? [])].sort(),
  ]);
}

/**
 * Carry the Skills page selection to every local OpenHands profile.
 *
 * A profile launch sends only `agent_profile_id`, so the agent server resolves
 * the skills from the profile itself. Upstream syncs only `default`, and a
 * profile without `public_skills` loads the whole catalog, so this applies the
 * page's selection to every profile once per selection. A launch then never
 * sees more skills than the page shows.
 *
 * Cloud launches never read the lists, and ACP profiles ignore them. A failed
 * write is silent: the next app load retries, and an unsynced profile only
 * means the launch sees more skills than the page shows.
 */
export function useSyncProfileSkills(): void {
  const { backend } = useActiveBackend();
  const isLocal = backend.kind === "local" && !isNoBackend(backend);
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { data: profiles } = useAgentProfiles({ enabled: isLocal });
  const defaultSkills = useDefaultProfileSkills();
  const syncedRef = useRef<string | null>(null);

  // One attempt per backend and selection; the saves invalidate the list.
  useEffect(() => {
    syncedRef.current = null;
  }, [backend.id]);

  useEffect(() => {
    if (!isLocal || !defaultSkills.ready || !profiles) return;
    // Same source as the page: `default` when it exists, settings otherwise.
    const selection =
      defaultSkills.selection ??
      (settings ? toSkillEnablement(settings) : null);
    if (!selection) return;
    const key = `${profiles.profiles.length}:${selectionKey(selection)}`;
    if (syncedRef.current === key) return;
    syncedRef.current = key;
    void updateEveryAgentProfile(queryClient, withSkillSelection(selection), {
      onError: () => undefined,
    });
  }, [
    isLocal,
    defaultSkills.ready,
    defaultSkills.selection,
    profiles,
    settings,
    queryClient,
  ]);
}
