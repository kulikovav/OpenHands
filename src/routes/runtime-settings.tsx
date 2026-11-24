import { useTranslation } from "react-i18next";
import {
  SdkSectionPage,
  type SettingsSourceConfig,
} from "#/components/features/settings/sdk-settings/sdk-section-page";
import { BackendsSettingsSection } from "#/components/features/settings/backends-settings/backends-settings-section";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useConversationWorkspace } from "#/hooks/query/use-conversation-workspace";
import { useSettings } from "#/hooks/query/use-settings";
import { I18nKey } from "#/i18n/declaration";

const CONTAINER_FIELD_KEYS = new Set([
  "container_memory",
  "container_cpus",
  "container_browser",
]);

function RuntimeSettingsScreen() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const { backend } = useActiveBackend();
  const { dockerSelectable, serverInfoLoading } = useConversationWorkspace();
  const dockerUnavailable = !serverInfoLoading && !dockerSelectable;
  const savedDocker =
    settings?.conversation_settings?.default_runtime === "docker";

  const source: SettingsSourceConfig = {
    settingsSource: "conversation_settings",
    sectionKeys: ["runtime"],
  };
  if (dockerUnavailable) {
    source.excludeKeys = CONTAINER_FIELD_KEYS;
    // A saved Docker default stays selectable so the field shows what is saved.
    if (!savedDocker) source.excludeChoices = { default_runtime: ["docker"] };
  }

  return (
    <div className="flex flex-col gap-8">
      <SdkSectionPage
        settingsSources={[source]}
        header={
          dockerUnavailable && savedDocker
            ? () => (
                <p
                  data-testid="runtime-docker-unavailable"
                  className="text-sm text-muted"
                >
                  {t(I18nKey.SETTINGS$RUNTIME_DOCKER_UNAVAILABLE)}
                </p>
              )
            : undefined
        }
        testId="runtime-settings-screen"
      />
      {/* The backend list seeds from a deployment discovery document, which
          only a local deployment publishes, so a cloud backend keeps its own
          backend management and renders no section here. */}
      {backend.kind === "local" && <BackendsSettingsSection />}
    </div>
  );
}

export default RuntimeSettingsScreen;
