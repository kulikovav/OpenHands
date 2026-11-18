import { getAgentServerSessionApiKey } from "../agent-server-config";
import type { DiscoveryBackend } from "../discovery/discovery-backends.api";
import { getRegisteredBackends, setRegisteredBackends } from "./active-store";
import type { Backend } from "./types";

/** Naming rule for a backend the deployment's discovery document names. */
export const DISCOVERY_BACKEND_ID_PREFIX = "discovery-";

export function discoveryBackendId(name: string): string {
  return `${DISCOVERY_BACKEND_ID_PREFIX}${name}`;
}

export function isDiscoveryBackend(backend: Pick<Backend, "id">): boolean {
  return backend.id.startsWith(DISCOVERY_BACKEND_ID_PREFIX);
}

function normalizeHost(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Append the deployment's discovered backends to the registry.
 *
 * The discovery document is the deployment-wide source, so a browser needs no
 * manual entry for the slots, the run server, or the governed backend. A
 * backend already registered at the same address keeps its record and its
 * name: `default-local` is the ingress, and a user who edited an entry keeps
 * the edit. The document shares one session key across every unit, so the
 * seeded entry carries the key the page already uses.
 */
export function seedDiscoveryBackends(
  entries: readonly DiscoveryBackend[],
  backends: readonly Backend[],
): Backend[] {
  const sessionApiKey = getAgentServerSessionApiKey() ?? "";
  const knownHosts = new Set(
    backends.map((backend) => normalizeHost(backend.host)),
  );
  const knownIds = new Set(backends.map((backend) => backend.id));
  const additions: Backend[] = [];

  for (const entry of entries) {
    const host = normalizeHost(entry.url);
    const id = discoveryBackendId(entry.name);
    if (!host || !entry.name || knownHosts.has(host) || knownIds.has(id)) {
      continue;
    }
    knownHosts.add(host);
    knownIds.add(id);
    additions.push({
      id,
      name: entry.name,
      host,
      apiKey: sessionApiKey,
      kind: "local",
    });
  }

  return additions.length > 0 ? [...backends, ...additions] : [...backends];
}

/** Write the seed into the registry. A second call with the same document adds nothing. */
export function seedDiscoveryBackendsIntoRegistry(
  entries: readonly DiscoveryBackend[],
): void {
  const current = getRegisteredBackends();
  const next = seedDiscoveryBackends(entries, current);
  if (next.length !== current.length) setRegisteredBackends(next);
}
