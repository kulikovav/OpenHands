import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";

import type { GitProviderConnection } from "#/api/git-provider-integrations-service";
import { listGitProviderConnections } from "#/api/git-provider-integrations-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { GIT_INTEGRATIONS_QUERY_KEYS } from "#/hooks/query/query-keys";
import { useSettings } from "#/hooks/query/use-settings";
import type { Provider } from "#/types/settings";

export interface UseGitProviderConnectionsResult {
  /** Connections in page order; empty while loading or on a cloud backend. */
  connections: readonly GitProviderConnection[];
  isLoading: boolean;
  refetch: UseQueryResult<GitProviderConnection[]>["refetch"];
}

/**
 * The git provider connections of the active local backend, derived from its
 * secrets store. On a cloud backend the instance's own Settings → Integrations
 * page owns the connections, so this hook stays idle there. No stale time:
 * the secrets the store holds change outside this page too.
 */
export function useGitProviderConnections(): UseGitProviderConnectionsResult {
  const { backend, orgId } = useActiveBackend();
  const isLocal = backend.kind === "local";

  const query = useQuery<GitProviderConnection[]>({
    queryKey: GIT_INTEGRATIONS_QUERY_KEYS.connections(backend.id, orgId),
    queryFn: listGitProviderConnections,
    enabled: isLocal,
    staleTime: 0,
    gcTime: 1000 * 60 * 15,
  });

  return {
    connections: query.data ?? [],
    isLoading: isLocal && query.isLoading,
    refetch: query.refetch,
  };
}

/**
 * The host each git provider is served on, merging what a cloud instance
 * reports natively (`provider_tokens_set`) with the local Integrations page's
 * host records. Consumers match a repository URL against it to name the
 * repository's provider.
 */
export function useGitProviderHosts(): {
  hosts: Partial<Record<Provider, string | null>>;
  isLoading: boolean;
} {
  const { data: settings } = useSettings();
  const isLocal = useActiveBackend().backend.kind === "local";
  const { connections, isLoading } = useGitProviderConnections();

  return useMemo(() => {
    const hosts: Partial<Record<Provider, string | null>> = {
      ...settings?.provider_tokens_set,
    };
    if (isLocal) {
      for (const connection of connections) {
        if (connection.host) hosts[connection.provider] = connection.host;
      }
    }
    return { hosts, isLoading: isLocal ? isLoading : false };
  }, [settings?.provider_tokens_set, isLocal, connections, isLoading]);
}
