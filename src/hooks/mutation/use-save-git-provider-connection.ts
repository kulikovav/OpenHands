import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  normalizeProviderHost,
  saveProviderHost,
  saveProviderToken,
} from "#/api/git-provider-integrations-service";
import { I18nKey } from "#/i18n/declaration";
import { GIT_INTEGRATIONS_QUERY_KEYS } from "#/hooks/query/query-keys";
import type { Provider } from "#/types/settings";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

interface SaveGitProviderConnectionInput {
  provider: Provider;
  token: string;
  host: string;
  savedHost: string | null;
}

/**
 * Save one provider row: the typed token when present, and the host record
 * when its normalized form differs from the saved one. Refreshes the
 * integrations and secrets queries, both of which read the store the page
 * writes.
 */
export function useSaveGitProviderConnection() {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      provider,
      token,
      host,
      savedHost,
    }: SaveGitProviderConnectionInput) => {
      if (token.trim()) await saveProviderToken(provider, token.trim());
      const nextHost = normalizeProviderHost(host);
      if (nextHost !== savedHost) await saveProviderHost(provider, nextHost);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: GIT_INTEGRATIONS_QUERY_KEYS.all,
      });
      queryClient.invalidateQueries({ queryKey: ["secrets-search"] });
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
    },
    onError: (error) => {
      displayErrorToast(
        retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
      );
    },
  });
}
