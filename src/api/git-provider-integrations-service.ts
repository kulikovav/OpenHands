import { SecretsService } from "#/api/secrets-service";
import type { CustomSecretWithoutValue } from "#/api/secrets-service.types";
import {
  GIT_PROVIDER_INTEGRATIONS,
  gitProviderIntegration,
  type GitProviderIntegration,
} from "#/constants/git-provider-integrations";
import type { Provider } from "#/types/settings";
import {
  findSecretIgnoringCase,
  findSecretsIgnoringCase,
} from "#/utils/secret-name";

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
  host: string | null;
}

function requireIntegration(provider: Provider): GitProviderIntegration {
  const integration = gitProviderIntegration(provider);
  if (!integration) {
    throw new Error(`Unknown git provider: ${provider}`);
  }
  return integration;
}

async function findStoredSecret(
  name: string,
): Promise<CustomSecretWithoutValue | null> {
  const secrets = await SecretsService.getSecretsOrThrow();
  const matches = findSecretsIgnoringCase(secrets, name);
  if (matches.length > 1) {
    // Rotating or removing one of them would leave the clone reading the
    // other spelling, so every write refuses until the store is unambiguous.
    throw new Error(
      `Multiple secrets named "${name.trim().toUpperCase()}" differ only in case; remove or rename the duplicates first.`,
    );
  }
  return matches[0] ?? null;
}

async function upsertStoredSecret(
  recordName: string,
  value: string,
): Promise<void> {
  const stored = await findStoredSecret(recordName);
  if (stored) {
    await SecretsService.updateSecret(
      stored.name,
      stored.name,
      stored.description,
      value,
    );
    return;
  }
  await SecretsService.createSecret(recordName, value);
}

/** The stored form of a host: trimmed, without a trailing slash. */
export function normalizeProviderHost(host: string | null | undefined): string {
  return (host ?? "").trim().replace(/\/+$/, "");
}

async function getSecretValue(name: string): Promise<string | null> {
  const value = await SecretsService.getSecretValue(name);
  return value?.trim() ? value : null;
}

export async function listGitProviderConnections(): Promise<
  GitProviderConnection[]
> {
  const secrets = await SecretsService.getSecretsOrThrow();
  return Promise.all(
    GIT_PROVIDER_INTEGRATIONS.map(async (integration) => {
      const hostRecord = findSecretIgnoringCase(
        secrets,
        integration.hostRecordName,
      );
      return {
        provider: integration.provider,
        isConnected: Boolean(
          findSecretIgnoringCase(secrets, integration.tokenSecretName),
        ),
        host: hostRecord ? await getSecretValue(hostRecord.name) : null,
      };
    }),
  );
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
  const integration = requireIntegration(provider);
  const value = token.trim();
  if (!value) {
    throw new Error("A git provider token must not be empty.");
  }
  await upsertStoredSecret(integration.tokenSecretName, value);
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
  const integration = requireIntegration(provider);
  const value = normalizeProviderHost(host);
  if (!value) {
    // A blank host means "the provider's hosted service": drop the record.
    const stored = await findStoredSecret(integration.hostRecordName);
    if (stored) {
      await SecretsService.deleteSecret(stored.name);
    }
    return;
  }
  await upsertStoredSecret(integration.hostRecordName, value);
}

export async function disconnectGitProvider(provider: Provider): Promise<void> {
  const integration = requireIntegration(provider);
  const [token, host] = await Promise.all([
    findStoredSecret(integration.tokenSecretName),
    findStoredSecret(integration.hostRecordName),
  ]);
  if (token) await SecretsService.deleteSecret(token.name);
  if (host) await SecretsService.deleteSecret(host.name);
}
