import { BackendsSettingsSection } from "#/components/features/settings/backends-settings/backends-settings-section";
import { useActiveBackend } from "#/contexts/active-backend-context";

/**
 * Settings → Backends: the agent servers this Canvas can reach and the
 * backend new conversations start on. The section reads the deployment's
 * discovery document, which only a local deployment publishes, so a cloud
 * backend keeps its own backend management and renders no section here.
 */
export function BackendsSettingsScreen() {
  const { backend } = useActiveBackend();

  if (backend.kind !== "local") return null;

  return (
    <div data-testid="backends-settings-screen">
      <BackendsSettingsSection />
    </div>
  );
}

export default BackendsSettingsScreen;
