import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { disconnectGitProvider } from "#/api/git-provider-integrations-service";
import { I18nKey } from "#/i18n/declaration";
import { GIT_INTEGRATIONS_QUERY_KEYS } from "#/hooks/query/query-keys";
import type { Provider } from "#/types/settings";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

/**
 * Remove a provider's token secret and host record after the confirmation,
 * and refresh the queries that read the store the page writes.
 */
export function useDisconnectGitProvider() {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: Provider) => disconnectGitProvider(provider),
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
