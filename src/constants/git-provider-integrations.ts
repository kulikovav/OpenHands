import type { Provider } from "#/types/settings";

/**
 * The git providers a Settings → Integrations page manages, adapted from the
 * OpenHands Enterprise git settings page: each provider carries a token secret
 * and a host record in the agent-server secrets store.
 *
 * The token names follow the environment-variable convention; the SDK fetches
 * provider tokens by the provider-name spelling (`gitlab_token`), and the
 * agent-server image patch (`agent-server-1.60.1-token-case-insensitive.patch`)
 * makes that fetch find `GITLAB_TOKEN` too. A name in neither all-case
 * spelling stays invisible to the fetch, so the store must not keep one.
 * The host record names the provider's self-hosted instance,
 * so the automation setup can name a repository's provider from its URL; the
 * value is not a credential and the SDK clone never reads it.
 *
 * Providers the SDK's clone literal does not accept are left out: a `repos`
 * entry whose `provider` the service rejects would fail validation after save.
 */
export interface GitProviderIntegration {
  provider: Provider;
  tokenSecretName: string;
  hostRecordName: string;
}

export const GIT_PROVIDER_INTEGRATIONS: readonly GitProviderIntegration[] = [
  {
    provider: "github",
    tokenSecretName: "GITHUB_TOKEN",
    hostRecordName: "GITHUB_HOST",
  },
  {
    provider: "gitlab",
    tokenSecretName: "GITLAB_TOKEN",
    hostRecordName: "GITLAB_HOST",
  },
  {
    provider: "bitbucket",
    tokenSecretName: "BITBUCKET_TOKEN",
    hostRecordName: "BITBUCKET_HOST",
  },
  {
    provider: "bitbucket_data_center",
    tokenSecretName: "BITBUCKET_DATA_CENTER_TOKEN",
    hostRecordName: "BITBUCKET_DATA_CENTER_HOST",
  },
  {
    provider: "azure_devops",
    tokenSecretName: "AZURE_DEVOPS_TOKEN",
    hostRecordName: "AZURE_DEVOPS_HOST",
  },
];

export function gitProviderIntegration(
  provider: Provider,
): GitProviderIntegration | null {
  return (
    GIT_PROVIDER_INTEGRATIONS.find(
      (integration) => integration.provider === provider,
    ) ?? null
  );
}
