import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AgentProfilesService, {
  type AgentProfileSaveInput,
} from "#/api/agent-profiles-service/agent-profiles-service.api";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useSaveAgentProfile } from "#/hooks/mutation/use-save-agent-profile";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import {
  AGENT_PROFILES_QUERY_KEYS,
  AGENT_PROFILES_RETRY_OPTIONS,
} from "#/hooks/query/query-keys";
import { useSettings } from "#/hooks/query/use-settings";
import {
  resolveDisabledCatalogSkills,
  toSkillEnablement,
} from "#/utils/skill-enablement";

/** The profile's deny-list, whatever shape the detail response carries. */
function readDisabledSkills(profile: Record<string, unknown>): string[] {
  const value = profile.disabled_skills;
  return Array.isArray(value) ? (value as string[]) : [];
}

function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((name, index) => name === sortedRight[index]);
}

/**
 * The list summary and the detail are read at different times, so a save in
 * between leaves the detail stale. Skip it: writing it back would clobber the
 * other save, and the next pass reads the new revision.
 */
function isStale(
  summaryRevision: number | null | undefined,
  detail: Record<string, unknown>,
): boolean {
  const detailRevision = detail.revision;
  return (
    typeof summaryRevision === "number" &&
    typeof detailRevision === "number" &&
    summaryRevision !== detailRevision
  );
}

/**
 * Carry the Skills page selection to server-resolved profile launches.
 *
 * A profile launch sends only `agent_profile_id`: the agent server discovers
 * the skill catalog itself and keeps all of it except the profile's own
 * `disabled_skills` deny-list. The SDK has no allow-list, so each OpenHands
 * profile's deny-list is kept at the catalog complement plus the user's
 * disabled names.
 *
 * Silent on failure: the next app load retries, and an unsynced profile only
 * means the launch sees more skills than the page shows.
 */
export function useSyncProfileDisabledSkills(): void {
  const { backend, orgId } = useActiveBackend();
  const isLocal = backend.kind === "local" && !isNoBackend(backend);
  const { data: settings, isLoading, isError } = useSettings();
  const { data: profilesData } = useAgentProfiles({ enabled: isLocal });
  const { mutateAsync: saveProfile } = useSaveAgentProfile();
  const queryClient = useQueryClient();

  // One attempt per backend, selection, and profile set: the saves invalidate
  // the profile list, so without this the refetch would re-enter.
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    syncedRef.current = null;
  }, [backend.id]);

  useEffect(() => {
    if (!isLocal || isLoading || isError || !settings || !profilesData) return;
    const profiles = profilesData.profiles.filter(
      (profile) => profile.agent_kind === "openhands",
    );
    if (profiles.length === 0) return;

    const desired = resolveDisabledCatalogSkills(toSkillEnablement(settings));
    // Revisions in the key: any external save (onboarding, the editor) must
    // re-run the check, not just a new selection or profile set.
    const key = JSON.stringify([
      backend.id,
      desired,
      profiles.map((profile) => `${profile.id}:${profile.revision}`).sort(),
    ]);
    if (syncedRef.current === key) return;
    syncedRef.current = key;

    void (async () => {
      for (const profile of profiles) {
        try {
          const detail = await queryClient.fetchQuery({
            queryKey: AGENT_PROFILES_QUERY_KEYS.detail(
              backend.id,
              orgId,
              profile.name,
            ),
            queryFn: () => AgentProfilesService.getProfile(profile.name),
            ...AGENT_PROFILES_RETRY_OPTIONS,
          });
          const stored = detail.profile as unknown as Record<string, unknown>;
          if (stored.agent_kind !== "openhands") continue;
          if (isStale(profile.revision, stored)) continue;
          if (sameMembers(readDisabledSkills(stored), desired)) continue;
          // The save is a whole-profile overwrite: keep every stored field and
          // drop the server-managed identity, like the profile editor does.
          const { id, name, revision, ...preserved } = stored;
          await saveProfile({
            name: profile.name,
            profile: {
              ...preserved,
              disabled_skills: desired,
            } as unknown as AgentProfileSaveInput,
          });
        } catch (error) {
          console.warn(
            `Could not sync disabled skills onto agent profile "${profile.name}"`,
            error,
          );
        }
      }
    })();
  }, [
    isLocal,
    isLoading,
    isError,
    settings,
    profilesData,
    backend.id,
    orgId,
    queryClient,
    saveProfile,
  ]);
}
