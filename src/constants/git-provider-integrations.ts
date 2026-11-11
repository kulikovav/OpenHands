import type { Provider } from "#/types/settings";

/**
 * The git providers the Settings → Integrations page manages, adapted from the
 * OpenHands Enterprise git settings page: each provider carries a token secret
 * and a host record in the agent-server secrets store.
 *
 * The token names follow the environment-variable convention; the SDK fetches
 * provider tokens by the provider-name spelling (`gitlab_token`), and the
 * agent-server image patch (`agent-server-1.61.0-token-case-insensitive.patch`)
 * makes that fetch find `GITLAB_TOKEN` too. A name in neither all-case
 * spelling stays invisible to the fetch, so the store must not keep one.
 *
 * The host record names the address the provider serves repositories on, so
 * the automation setup can address a connection's repositories and name a
 * repository's provider from a matching URL; the value is not a credential
 * and the SDK clone never reads it. Hosted GitHub repositories are addressed
 * by owner/name and clone without it, and hosted GitLab repositories still
 * need the record to be listed; a repository on a self-managed instance
 * cannot be cloned without it, because the SDK auto-detects providers only
 * on the hosted hosts (github.com, gitlab.com, bitbucket.org, dev.azure.com).
 *
 * Bitbucket, Bitbucket Data Center and Azure DevOps stay out of the page on
 * this deployment's request. The SDK accepts them as clone providers; their
 * hosted-service URLs still auto-detect, while a URL on any other instance
 * gets no provider without a matching host record.
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
