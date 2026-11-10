import { useMutation, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { useTranslation } from "react-i18next";

import {
  disconnectGitProvider,
  gitProviderIntegrations,
  saveProviderHost,
  saveProviderToken,
  type GitProviderConnection,
} from "#/api/git-provider-integrations-service";
import type { Provider } from "#/types/settings";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useGitProviderConnections } from "#/hooks/query/use-git-provider-connections";
import { GIT_INTEGRATIONS_QUERY_KEYS } from "#/hooks/query/query-keys";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { cloudIntegrationsUrl } from "#/utils/cloud-integrations-url";
import { cn, getProviderName } from "#/utils/utils";
import {
  settingsListContainerClassName,
  settingsListDividerClassName,
} from "#/utils/settings-list-classes";

export const handle = { hideTitle: true };

const CONNECTION_PLACEHOLDER_HOST = "https://git.example.com";

function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().replace(/\/+$/, "");
}

interface GitProviderIntegrationRowProps {
  provider: Provider;
  connection: GitProviderConnection | null;
}

function GitProviderIntegrationRow({
  provider,
  connection,
}: GitProviderIntegrationRowProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("openhands");

  const isConnected = connection?.isConnected ?? false;
  const savedHost = normalizeHost(connection?.host);

  const [token, setToken] = React.useState("");
  const [host, setHost] = React.useState(savedHost);
  const [pendingDisconnect, setPendingDisconnect] = React.useState(false);

  // The saved host may still be loading; keep the input empty until it is
  // known rather than flashing a false difference.
  const hostValue = connection === null ? "" : host;
  const isDirty =
    token.trim().length > 0 ||
    (connection !== null && normalizeHost(hostValue) !== savedHost);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: GIT_INTEGRATIONS_QUERY_KEYS.all,
    });
    queryClient.invalidateQueries({ queryKey: ["secrets-search"] });
    queryClient.invalidateQueries({ queryKey: ["secrets"] });
  };

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      const trimmedToken = token.trim();
      if (trimmedToken) {
        await saveProviderToken(provider, trimmedToken);
      }
      if (normalizeHost(hostValue) !== savedHost) {
        await saveProviderHost(provider, hostValue.trim());
      }
    },
    onSuccess: () => {
      setToken("");
      invalidate();
      displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
    },
    onError: (error) => {
      displayErrorToast(
        retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
      );
    },
  });

  const { mutate: disconnect, isPending: isDisconnecting } = useMutation({
    mutationFn: () => disconnectGitProvider(provider),
    onSuccess: () => {
      setPendingDisconnect(false);
      setToken("");
      setHost("");
      invalidate();
      displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
    },
    onError: (error) => {
      displayErrorToast(
        retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
      );
    },
  });

  const hostInputId = React.useId();
  const tokenInputId = React.useId();

  return (
    <div
      data-testid={`git-provider-integration-${provider}`}
      className="flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-contrast">
          {getProviderName(provider)}
        </span>
        <span
          data-testid={`git-provider-integration-status-${provider}`}
          className={cn(
            "text-xs",
            isConnected ? "text-feedback-success" : "text-muted",
          )}
        >
          {isConnected
            ? t(I18nKey.STATUS$CONNECTED)
            : t(I18nKey.INTEGRATIONS$NOT_CONNECTED)}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="flex flex-col gap-2" htmlFor={tokenInputId}>
            <span className="text-sm">
              {t(I18nKey.INTEGRATIONS$TOKEN_LABEL)}
            </span>
            <input
              id={tokenInputId}
              data-testid={`git-provider-token-input-${provider}`}
              name={`${provider}-token-input`}
              type="password"
              autoComplete="new-password"
              value={token}
              onChange={(event) => setToken(event.currentTarget.value)}
              placeholder={t(I18nKey.INTEGRATIONS$TOKEN_PLACEHOLDER)}
              className={cn(
                "w-full min-w-0",
                "h-9 rounded-md border border-border bg-surface px-3 text-sm",
              )}
            />
          </label>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label className="flex flex-col gap-2" htmlFor={hostInputId}>
            <span className="text-sm">
              {t(I18nKey.INTEGRATIONS$HOST_LABEL)}
            </span>
            <input
              id={hostInputId}
              data-testid={`git-provider-host-input-${provider}`}
              name={`${provider}-host-input`}
              type="text"
              value={hostValue}
              onChange={(event) => setHost(event.currentTarget.value)}
              placeholder={CONNECTION_PLACEHOLDER_HOST}
              className={cn(
                "w-full min-w-0",
                "h-9 rounded-md border border-border bg-surface px-3 text-sm",
              )}
            />
          </label>
          <p className="text-xs text-muted">
            {t(I18nKey.INTEGRATIONS$HOST_HELP)}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        {isConnected && (
          <BrandButton
            type="button"
            variant="secondary"
            testId={`git-provider-disconnect-${provider}`}
            isDisabled={isSaving || isDisconnecting}
            onClick={() => setPendingDisconnect(true)}
          >
            {t(I18nKey.INTEGRATIONS$DISCONNECT)}
          </BrandButton>
        )}
        <BrandButton
          type="button"
          variant="primary"
          className="bg-contrast text-contrast-foreground"
          testId={`git-provider-save-${provider}`}
          isDisabled={!isDirty || isSaving || isDisconnecting}
          onClick={() => save()}
        >
          {t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>

      {pendingDisconnect && (
        <ConfirmationModal
          text={t(I18nKey.INTEGRATIONS$CONFIRM_DISCONNECT, {
            provider: getProviderName(provider),
          })}
          onConfirm={() => disconnect()}
          onCancel={() => setPendingDisconnect(false)}
        />
      )}
    </div>
  );
}

export function IntegrationsSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { backend, orgId } = useActiveBackend();
  const { connections, isLoading } = useGitProviderConnections();

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
      ) : (
        <div
          className={cn(
            settingsListContainerClassName,
            settingsListDividerClassName,
          )}
        >
          {gitProviderIntegrations().map(({ provider }) => (
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

export default IntegrationsSettingsScreen;
