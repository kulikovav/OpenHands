/**
 * Secret names have two live spellings: the SDK names a provider's token
 * secret after the provider (`gitlab_token`), while settings, integrations,
 * and the automation templates use the environment-variable convention
 * (`GITLAB_TOKEN`). The agent-server store compares names verbatim, so a
 * secret saved under one spelling does not answer a lookup by the other.
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
 * The stored secret whose name matches `name` when both are read under the
 * uppercase convention, or undefined when none is.
 */
export function findSecretNameIgnoringCase<T extends { name: string }>(
  secrets: Iterable<T>,
  name: string,
): T | undefined {
  const wanted = normalizeSecretName(name);
  for (const secret of secrets) {
    if (normalizeSecretName(secret.name) === wanted) return secret;
  }
  return undefined;
}
