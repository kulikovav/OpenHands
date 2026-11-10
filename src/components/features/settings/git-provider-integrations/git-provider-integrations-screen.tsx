import React from "react";
import { useTranslation } from "react-i18next";

import { GIT_PROVIDER_INTEGRATIONS } from "#/constants/git-provider-integrations";
import { BrandButton } from "#/components/features/settings/brand-button";
import { GitProviderIntegrationRow } from "#/components/features/settings/git-provider-integrations/git-provider-integration-row";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { useGitProviderConnections } from "#/hooks/query/use-git-provider-connections";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { cloudIntegrationsUrl } from "#/utils/cloud-integrations-url";
import { cn } from "#/utils/utils";
import {
  settingsListContainerClassName,
  settingsListDividerClassName,
} from "#/utils/settings-list-classes";

export function IntegrationsSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { backend, orgId } = useActiveBackend();
  const { connections, isLoading, isError, error, refetch } =
    useGitProviderConnections();

  if (backend.kind !== "local") {
    return (
      <div
        data-testid="integrations-settings-screen"
        className="flex flex-col gap-6"
      >
        <Typography.H2>{t(I18nKey.SETTINGS$NAV_INTEGRATIONS)}</Typography.H2>
        <p className="text-sm text-muted">
          {t(I18nKey.INTEGRATIONS$CLOUD_NOTICE)}
        </p>
        <div>
          <BrandButton
            type="button"
            variant="primary"
            className="bg-contrast text-contrast-foreground"
            testId="integrations-open-cloud"
            onClick={() =>
              window.open(
                cloudIntegrationsUrl(backend, orgId),
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            {t(I18nKey.INTEGRATIONS$OPEN_CLOUD_INTEGRATIONS)}
          </BrandButton>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="integrations-settings-screen"
      className="flex flex-col gap-6"
    >
      <div className="min-w-0 space-y-1">
        <Typography.H2>{t(I18nKey.SETTINGS$NAV_INTEGRATIONS)}</Typography.H2>
        <p
          data-testid="settings-page-subtitle"
          className="text-sm leading-5 text-tertiary-light"
        >
          {t(I18nKey.SETTINGS$PAGE_INTEGRATIONS_SUBLINE)}
        </p>
      </div>

      <p className="text-sm text-muted">{t(I18nKey.INTEGRATIONS$INTRO)}</p>

      {isLoading ? (
        <p className="text-sm text-muted">{t(I18nKey.INTEGRATIONS$LOADING)}</p>
      ) : isError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted">
            {retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC)}
          </p>
          <BrandButton
            type="button"
            variant="secondary"
            testId="integrations-retry"
            onClick={() => refetch()}
          >
            {t(I18nKey.BUTTON$REFRESH)}
          </BrandButton>
        </div>
      ) : (
        <div
          className={cn(
            settingsListContainerClassName,
            settingsListDividerClassName,
          )}
        >
          {GIT_PROVIDER_INTEGRATIONS.map(({ provider }) => (
            <GitProviderIntegrationRow
              key={provider}
              provider={provider}
              connection={
                connections.find(
                  (connection) => connection.provider === provider,
                ) ?? null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
