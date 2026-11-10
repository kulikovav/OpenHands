/**
 * Secret names have two live spellings: the SDK names a provider's token
 * secret after the provider (`gitlab_token`), while settings, integrations,
 * and the automation templates use the environment-variable convention
 * (`GITLAB_TOKEN`). The agent-server store compares names verbatim, so a
 * secret saved under one spelling does not answer a lookup by the other.
 * A name in neither spelling (`GitLab_Token`) matches here but stays
 * invisible to the SDK's fetch, which probes the two all-case spellings only.
 */

/**
 * The spelling the Settings UI saves: the environment-variable convention.
 * Trimming first keeps a name the form validated from failing the store's
 * own check on a stray space.
 */
export function normalizeSecretName(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * The stored secrets whose name matches `name` under the uppercase
 * convention. More than one match means the store holds two spellings of
 * one name, and consumers must refuse to guess between them.
 */
export function findSecretsIgnoringCase<T extends { name: string }>(
  secrets: Iterable<T>,
  name: string,
): T[] {
  const wanted = normalizeSecretName(name);
  const matches: T[] = [];
  for (const secret of secrets) {
    if (normalizeSecretName(secret.name) === wanted) matches.push(secret);
  }
  return matches;
}

/**
 * The stored secret a provider-token style lookup resolves, preferring the
 * exact spelling the caller asked for. This mirrors the SDK's fetch, which
 * probes the requested name before its other-case spellings, so a display
 * or rotation lands on the same secret the clone reads.
 */
export function findSecretIgnoringCase<T extends { name: string }>(
  secrets: Iterable<T>,
  name: string,
): T | undefined {
  for (const secret of secrets) {
    if (secret.name === name) return secret;
  }
  return findSecretsIgnoringCase(secrets, name)[0];
}
