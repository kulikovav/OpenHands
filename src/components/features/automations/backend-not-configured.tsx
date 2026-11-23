import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import ExclamationCircleIcon from "#/icons/exclamation-circle.svg?react";
import { BrandButton } from "#/components/features/settings/brand-button";

interface BackendUnavailableProps {
  onRetry: () => void;
}

export function BackendUnavailable({ onRetry }: BackendUnavailableProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <ExclamationCircleIcon className="size-12 text-warning" />
      <h2 className="mt-4 text-lg font-medium text-content">
        {t(I18nKey.AUTOMATIONS$BACKEND_UNAVAILABLE_TITLE)}
      </h2>
      <p className="mt-2 text-sm text-muted text-center max-w-md">
        {t(I18nKey.AUTOMATIONS$BACKEND_UNAVAILABLE_MESSAGE)}
      </p>
      <BrandButton
        type="button"
        variant="secondary"
        className="mt-6"
        onClick={onRetry}
      >
        {t(I18nKey.AUTOMATIONS$BACKEND_UNAVAILABLE_RETRY)}
      </BrandButton>
    </div>
  );
}

// Keep old export name for backward compatibility
export { BackendUnavailable as BackendNotConfigured };

interface GovernedBackendNoticeProps {
  /** Name of the active backend, so the refusal names what cannot serve automations. */
  backendName: string;
}

/**
 * The permanent Automations refusal for a governed backend.
 *
 * The automation service decides this: a successful capability response that
 * names no target at the active backend's origin is permanent, so this state
 * offers no retry and points the user at an ungoverned one. The transient
 * {@link BackendUnavailable} state stays in charge of a failed capability or
 * health request, which a retry can fix.
 */
export function GovernedBackendNotice({
  backendName,
}: GovernedBackendNoticeProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="automations-governed-backend"
      className="flex flex-col items-center justify-center py-20 px-4"
    >
      <ExclamationCircleIcon className="size-12 text-warning" />
      <h2 className="mt-4 text-lg font-medium text-content">
        {t(I18nKey.AUTOMATIONS$GOVERNED_BACKEND_TITLE)}
      </h2>
      <p className="mt-2 text-sm text-muted text-center max-w-md">
        {t(I18nKey.AUTOMATIONS$GOVERNED_BACKEND_MESSAGE, {
          backend: backendName,
        })}
      </p>
    </div>
  );
}
