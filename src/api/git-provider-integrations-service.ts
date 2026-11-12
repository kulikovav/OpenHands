import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { SecretsService } from "#/api/secrets-service";
import {
  GIT_PROVIDER_INTEGRATIONS,
  gitProviderIntegration,
} from "#/constants/git-provider-integrations";
import type { Provider } from "#/types/settings";
import { findSecretNameIgnoringCase } from "#/utils/secret-name";

/**
 * Git provider connections adapted from the OpenHands Enterprise git settings
 * page: per provider a token secret and a host record in the agent-server
 * secrets store. The token authenticates the automation clone; the host names
 * the provider's self-hosted instance, so the automation setup can tell a
 * repository's provider from its URL. Both are read by name, and the token is
 * resolved case-insensitively, because the SDK looks its provider tokens up
 * under the provider-name spelling (`gitlab_token`).
 *
 * Callers gate this on a local backend: a cloud backend manages its git
 * providers on the cloud instance, and its `provider_tokens_set` already
 * carries the hosts.
 */
export interface GitProviderConnection {
  provider: Provider;
  /** The token secret exists in the store, under either name spelling. */
  isConnected: boolean;
  /** The host record's stored value, or null when none is set. */
  host: string | null;
}

/** The per-provider integration definitions, in page order. */
export function gitProviderIntegrations() {
  return GIT_PROVIDER_INTEGRATIONS;
}

async function getSecretValue(name: string): Promise<string | null> {
  const value = await new SettingsClient(
    getAgentServerClientOptions(),
  ).getSecret(name);
  return value?.trim() ? value : null;
}

/** The connections in page order, derived from the backend's secrets store. */
export async function listGitProviderConnections(): Promise<
  GitProviderConnection[]
> {
  const secrets = await SecretsService.getSecretsOrThrow();
  return Promise.all(
    GIT_PROVIDER_INTEGRATIONS.map(async (integration) => {
      const hostRecord = findSecretNameIgnoringCase(
        secrets,
        integration.hostRecordName,
      );
      return {
        provider: integration.provider,
        isConnected: Boolean(
          findSecretNameIgnoringCase(secrets, integration.tokenSecretName),
        ),
        host: hostRecord ? await getSecretValue(hostRecord.name) : null,
      };
    }),
  );
}

async function findStoredSecret(name: string): Promise<{
  name: string;
  description: string | undefined;
} | null> {
  try {
    const secrets = await SecretsService.getSecretsOrThrow();
    const stored = findSecretNameIgnoringCase(secrets, name);
    return stored
      ? { name: stored.name, description: stored.description ?? undefined }
      : null;
  } catch {
    return null;
  }
}

/**
 * Save the token: rotate the stored secret's value when it exists, keeping its
 * stored name and description; create it under the uppercase convention
 * otherwise.
 */
export async function saveProviderToken(
  provider: Provider,
  token: string,
): Promise<void> {
  const integration = gitProviderIntegration(provider);
  if (!integration) {
    throw new Error(`Unknown git provider: ${provider}`);
  }
  const value = token.trim();
  if (!value) {
    throw new Error("A git provider token must not be empty.");
  }
  const stored = await findStoredSecret(integration.tokenSecretName);
  if (stored) {
    await SecretsService.updateSecret(
      stored.name,
      stored.name,
      stored.description,
      value,
    );
    return;
  }
  await SecretsService.createSecret(integration.tokenSecretName, value);
}

/**
 * Save the host record, or remove it when the host is blank. The record is
 * not a credential; it tells the automation setup which provider a repository
 * URL on this instance belongs to.
 */
export async function saveProviderHost(
  provider: Provider,
  host: string,
): Promise<void> {
  const integration = gitProviderIntegration(provider);
  if (!integration) {
    throw new Error(`Unknown git provider: ${provider}`);
  }
  const value = host.trim().replace(/\/+$/, "");
  if (!value) {
    throw new Error("A git provider host must not be empty.");
  }
  const stored = await findStoredSecret(integration.hostRecordName);
  if (stored) {
    await SecretsService.updateSecret(
      stored.name,
      stored.name,
      stored.description,
      value,
    );
    return;
  }
  await SecretsService.createSecret(integration.hostRecordName, value);
}

/** Remove a provider's token secret and host record; a missing one stays gone. */
export async function disconnectGitProvider(provider: Provider): Promise<void> {
  const integration = gitProviderIntegration(provider);
  if (!integration) {
    throw new Error(`Unknown git provider: ${provider}`);
  }
  const [token, host] = await Promise.all([
    findStoredSecret(integration.tokenSecretName),
    findStoredSecret(integration.hostRecordName),
  ]);
  if (token) await SecretsService.deleteSecret(token.name);
  if (host) await SecretsService.deleteSecret(host.name);
}
