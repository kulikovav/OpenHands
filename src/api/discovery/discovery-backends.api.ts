import {
  getAgentServerBaseUrl,
  getAgentServerSessionApiKey,
} from "#/api/agent-server-config";
import { getEffectiveLocalBackend } from "#/api/backend-registry/active-store";

/** The discovery route the deployment publishes its backend list on. */
export const DISCOVERY_BACKENDS_PATH = "/api/discovery/backends";

/**
 * One backend the deployment's discovery document reports.
 *
 * The document names a `role` for each backend (`ingress`, `slot`,
 * `automations`), but this UI does not gate behavior on it: every reported
 * backend is a full agent server, so a conversation the owner lookup places on
 * one opens live, read from that backend.
 */
export interface DiscoveryBackend {
  name: string;
  role: string;
  url: string;
  port?: number;
  active?: boolean;
  healthy?: boolean;
  version?: string;
  error?: string;
}

function normalizeRoot(url: string | null | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "");
}

/**
 * Every discovered backend a read-only foreign transcript may target.
 *
 * The deployment's own discovery document is the only source of these
 * addresses, so a link cannot point the session key at an address it chose.
 * The ingress is dropped because a same-origin read already reaches it, an
 * entry with no url is dropped because it names nothing, and a backend the
 * document's own probe reports unhealthy is dropped because it cannot answer.
 */
export function selectForeignReadBackends(
  backends: DiscoveryBackend[],
  ingressUrl: string,
): DiscoveryBackend[] {
  const ingress = normalizeRoot(ingressUrl);
  return backends
    .filter((backend) => backend.healthy !== false)
    .map((backend) => ({ ...backend, url: normalizeRoot(backend.url) }))
    .filter((backend) => backend.url !== "" && backend.url !== ingress);
}

/**
 * The discovered peer a host names, or null when the deployment's document
 * reports no such backend. Trailing slashes are ignored on both sides.
 */
export function findDiscoveredPeer(
  host: string,
  peers: DiscoveryBackend[],
): DiscoveryBackend | null {
  const normalized = normalizeRoot(host);
  if (normalized === "") return null;
  return peers.find((peer) => peer.url === normalized) ?? null;
}

/**
 * Whether a host may receive the session key for a read-only foreign read.
 *
 * Only an address the deployment's own discovery document reports qualifies.
 * Any other value would send the session key to an address a link chose.
 */
export function isDiscoveredPeerHost(
  host: string,
  peers: DiscoveryBackend[],
): boolean {
  return findDiscoveredPeer(host, peers) !== null;
}

/**
 * Fetch the deployment's backend discovery document. The document is the only
 * source of the deployment's peer backends, so no address is kept by hand.
 */
export async function fetchDiscoveryBackends(
  signal?: AbortSignal,
): Promise<DiscoveryBackend[]> {
  const host = normalizeRoot(getAgentServerBaseUrl());
  const apiKey =
    getEffectiveLocalBackend()?.apiKey ?? getAgentServerSessionApiKey();
  if (!host || !apiKey) return [];
  const response = await fetch(`${host}${DISCOVERY_BACKENDS_PATH}`, {
    headers: { "X-Session-API-Key": apiKey },
    signal,
  });
  if (!response.ok) {
    throw new Error(`the discovery document answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as { backends?: DiscoveryBackend[] };
  return Array.isArray(body.backends) ? body.backends : [];
}
