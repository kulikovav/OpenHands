import React from "react";
import { useTranslation } from "react-i18next";

import type { GitProviderConnection } from "#/api/git-provider-integrations-service";
import { normalizeProviderHost } from "#/api/git-provider-integrations-service";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { I18nKey } from "#/i18n/declaration";
import { useDisconnectGitProvider } from "#/hooks/mutation/use-disconnect-git-provider";
import { useSaveGitProviderConnection } from "#/hooks/mutation/use-save-git-provider-connection";
import { cn, getProviderName } from "#/utils/utils";

interface GitProviderIntegrationRowProps {
  provider: GitProviderConnection["provider"];
  connection: GitProviderConnection | null;
}

export function GitProviderIntegrationRow({
  provider,
  connection,
}: GitProviderIntegrationRowProps) {
  const { t } = useTranslation("openhands");

  const isConnected = connection?.isConnected ?? false;
  const savedHost = normalizeProviderHost(connection?.host);

  const [token, setToken] = React.useState("");
  const [host, setHost] = React.useState(savedHost);
  const [pendingDisconnect, setPendingDisconnect] = React.useState(false);

  // The saved host may still be loading; keep the input empty until it is
  // known rather than flashing a false difference.
  const hostValue = connection === null ? "" : host;
  const isDirty =
    token.trim().length > 0 ||
    (connection !== null && normalizeProviderHost(hostValue) !== savedHost);

  const { mutate: save, isPending: isSaving } = useSaveGitProviderConnection();
  const { mutate: disconnect, isPending: isDisconnecting } =
    useDisconnectGitProvider();

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
        <SettingsInput
          testId={`git-provider-token-input-${provider}`}
          name={`${provider}-token-input`}
          label={t(I18nKey.INTEGRATIONS$TOKEN_LABEL)}
          type="password"
          autoComplete="new-password"
          placeholder={t(I18nKey.INTEGRATIONS$TOKEN_PLACEHOLDER)}
          value={token}
          onChange={setToken}
        />
        <SettingsInput
          testId={`git-provider-host-input-${provider}`}
          name={`${provider}-host-input`}
          label={t(I18nKey.INTEGRATIONS$HOST_LABEL)}
          type="text"
          placeholder={t(I18nKey.INTEGRATIONS$HOST_PLACEHOLDER)}
          hint={t(I18nKey.INTEGRATIONS$HOST_HELP)}
          value={hostValue}
          onChange={setHost}
        />
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
          onClick={() => save({ provider, token, host: hostValue, savedHost })}
        >
          {t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>

      {pendingDisconnect && (
        <ConfirmationModal
          text={t(I18nKey.INTEGRATIONS$CONFIRM_DISCONNECT, {
            provider: getProviderName(provider),
          })}
          onConfirm={() => disconnect(provider)}
          onCancel={() => setPendingDisconnect(false)}
        />
      )}
    </div>
  );
}
