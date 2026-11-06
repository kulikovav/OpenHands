import {
  getAgentServerBaseUrl,
  getAgentServerSessionApiKey,
} from "#/api/agent-server-config";
import { getEffectiveLocalBackend } from "#/api/backend-registry/active-store";

/** The discovery route the deployment publishes its backend list on. */
export const DISCOVERY_BACKENDS_PATH = "/api/discovery/backends";

/** The role the deployment gives the backend that runs automation tasks. */
export const AUTOMATION_RUNS_ROLE = "automations";

/** One backend the deployment's discovery document reports. */
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
 * Fetch the deployment's backend discovery document. The document is the only
 * source of the automation runs backend, so no address is kept by hand.
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

/**
 * Resolve the backend that runs automation tasks, or null when the document
 * reports none. Its root is a different origin from the served one, so the
 * caller passes it as the host of a read-only transcript read.
 */
export async function fetchAutomationRunsBackend(
  signal?: AbortSignal,
): Promise<DiscoveryBackend | null> {
  const backends = await fetchDiscoveryBackends(signal);
  const ingress = normalizeRoot(getAgentServerBaseUrl());
  for (const backend of backends) {
    if (backend.role !== AUTOMATION_RUNS_ROLE) continue;
    const url = normalizeRoot(backend.url);
    if (!url || url === ingress) continue;
    return { ...backend, url };
  }
  return null;
}
