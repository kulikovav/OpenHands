import React from "react";
import { useTranslation } from "react-i18next";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import {
  isDiscoveryBackend,
  seedDiscoveryBackendsIntoRegistry,
} from "#/api/backend-registry/discovery-seed";
import {
  readStoredDefaultBackendId,
  writeStoredDefaultBackendId,
} from "#/api/backend-registry/storage";
import { ManageBackendsModal } from "#/components/features/backends/manage-backends-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { useDiscoveredBackends } from "#/hooks/query/use-discovered-backends";
import { I18nKey } from "#/i18n/declaration";

/** Select key that clears the preference; never a backend id. */
const NO_DEFAULT_BACKEND_KEY = "__none__";

/**
 * The backends configuration on the Runtime settings page: the deployment's
 * backend list and the backend every new run starts on.
 *
 * The list seeds from the openhands-discovery document, so a browser needs no
 * manual registration for the slots, the run server, or the governed backend.
 * A deployment without that document keeps the entries the user added, and
 * Manage Backends stays the manual fallback. The preference is durable in
 * `openhands-default-backend`, and the backend selector keeps its per-chat
 * override: an explicit pick in this tab outranks the default.
 */
export function BackendsSettingsSection() {
  const { t } = useTranslation("openhands");
  const { backends, active } = useActiveBackendContext();
  const [defaultBackendId, setDefaultBackendId] = React.useState<string | null>(
    () => readStoredDefaultBackendId(),
  );
  const [manageOpen, setManageOpen] = React.useState(false);

  const discovery = useDiscoveredBackends({
    enabled: active.backend.kind === "local",
  });

  React.useEffect(() => {
    if (!discovery.data || discovery.data.length === 0) return;
    seedDiscoveryBackendsIntoRegistry(discovery.data);
  }, [discovery.data]);

  // A default that is no longer registered reads as no default, so the
  // selector never holds a key its option list does not offer.
  const selectedDefaultId = backends.some(
    (backend) => backend.id === defaultBackendId,
  )
    ? defaultBackendId
    : null;
  const selectedDefault = backends.find(
    (backend) => backend.id === selectedDefaultId,
  );

  const defaultItems = [
    {
      key: NO_DEFAULT_BACKEND_KEY,
      label: t(I18nKey.SETTINGS$BACKENDS_DEFAULT_NONE),
    },
    ...backends.map((backend) => ({
      key: backend.id,
      label: backend.name,
    })),
  ];

  const handleDefaultChange = (key: React.Key | null) => {
    const next = !key || key === NO_DEFAULT_BACKEND_KEY ? null : String(key);
    writeStoredDefaultBackendId(next);
    setDefaultBackendId(next);
  };

  return (
    <section
      data-testid="backends-settings-section"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">
          {t(I18nKey.SETTINGS$BACKENDS_LIST_LABEL)}
        </h3>
        <p className="text-sm leading-5 text-text-secondary">
          {t(I18nKey.SETTINGS$BACKENDS_DESCRIPTION)}
        </p>
      </div>

      {discovery.isLoading && (
        <p role="status" className="text-sm text-text-secondary">
          {t(I18nKey.SETTINGS$BACKENDS_LOADING)}
        </p>
      )}
      {!discovery.isLoading && discovery.isError && (
        <p role="status" className="text-sm text-text-secondary">
          {t(I18nKey.SETTINGS$BACKENDS_DISCOVERY_UNAVAILABLE)}
        </p>
      )}
      {backends.length === 0 && (
        <p role="status" className="text-sm text-text-secondary">
          {t(I18nKey.SETTINGS$BACKENDS_EMPTY)}
        </p>
      )}
      {backends.length > 0 && (
        <ul className="flex flex-col gap-2">
          {backends.map((backend) => (
            <li
              key={backend.id}
              data-testid="backends-settings-item"
              className="flex flex-col gap-1 rounded-md border border-border p-3"
            >
              <span className="text-sm font-medium">{backend.name}</span>
              <span className="text-xs text-text-secondary">
                {backend.host}
              </span>
              <span className="text-2xs text-tertiary-light">
                {t(
                  isDiscoveryBackend(backend)
                    ? I18nKey.SETTINGS$BACKENDS_SOURCE_DISCOVERY
                    : I18nKey.SETTINGS$BACKENDS_SOURCE_MANUAL,
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <SettingsDropdownInput
          testId="default-backend-input"
          name="default-backend-input"
          label={t(I18nKey.SETTINGS$BACKENDS_DEFAULT_LABEL)}
          items={defaultItems}
          selectedKey={selectedDefaultId ?? NO_DEFAULT_BACKEND_KEY}
          isDisabled={backends.length === 0}
          onSelectionChange={handleDefaultChange}
        />
        <p className="text-xs text-tertiary-light">
          {selectedDefault
            ? t(I18nKey.SETTINGS$BACKENDS_DEFAULT_HINT, {
                name: selectedDefault.name,
              })
            : t(I18nKey.SETTINGS$BACKENDS_DEFAULT_UNSET_HINT)}
        </p>
      </div>

      <div className="flex justify-start">
        <BrandButton
          testId="manage-backends-button"
          variant="secondary"
          type="button"
          onClick={() => setManageOpen(true)}
        >
          {t(I18nKey.SETTINGS$BACKENDS_MANAGE)}
        </BrandButton>
      </div>

      {manageOpen && (
        <ManageBackendsModal onClose={() => setManageOpen(false)} />
      )}
    </section>
  );
}
