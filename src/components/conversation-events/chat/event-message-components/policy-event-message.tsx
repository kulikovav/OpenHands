import { useTranslation } from "react-i18next";
import { isPolicyEvent } from "#/types/agent-server/type-guards";
import { OpenHandsEvent, PolicyEvent } from "#/types/agent-server/core";
import { GenericEventMessage } from "#/components/features/chat/generic-event-message";
import { useStandaloneEventRowClass } from "#/components/features/chat/is-in-event-group-context";
import { I18nKey } from "#/i18n/declaration";

interface PolicyEventMessageProps {
  event: OpenHandsEvent;
}

const STATUS_I18N_KEY: Record<PolicyEvent["status"], I18nKey> = {
  denied: I18nKey.POLICY$STATUS_DENIED,
  approved: I18nKey.POLICY$STATUS_APPROVED,
  rejected: I18nKey.POLICY$STATUS_REJECTED,
  expired: I18nKey.POLICY$STATUS_EXPIRED,
};

export const getPolicyEventStatusKey = (status: PolicyEvent["status"]) =>
  STATUS_I18N_KEY[status];

/**
 * A governed-runtime policy decision card: what the boundary decided about a
 * destination, why, and — on an approval — that exactly one retry unlocks.
 * Provenance labels (proposal id, requested scope, prover verdict) render as
 * the details so the decision stays auditable.
 */
export function PolicyEventMessage({ event }: PolicyEventMessageProps) {
  const { t } = useTranslation("openhands");
  const standaloneRowClass = useStandaloneEventRowClass();

  if (!isPolicyEvent(event)) {
    return null;
  }

  const title = (
    <span>
      {t(I18nKey.POLICY$EVENT_LABEL)}
      {": "}
      <span className="text-muted">{t(STATUS_I18N_KEY[event.status])}</span>
      <span className="text-muted ml-2">{event.destination}</span>
      {event.status === "approved" && (
        <span className="ml-2 px-1 py-0.5 rounded text-xs bg-feedback-success/10 text-feedback-success">
          {t(I18nKey.POLICY$SINGLE_RETRY)}
        </span>
      )}
    </span>
  );

  const details = (
    <div className="flex flex-col gap-2 text-muted">
      <div>
        <span className="text-text-subtle">{t(I18nKey.POLICY$REASON)}:</span>{" "}
        <span
          className={event.status === "denied" ? "text-feedback-error" : ""}
        >
          {event.reason}
        </span>
      </div>
      {event.rule && (
        <div>
          <span className="text-text-subtle">{t(I18nKey.POLICY$RULE)}:</span>{" "}
          <code className="text-xs bg-surface px-1 py-0.5 rounded">
            {event.rule}
          </code>
        </div>
      )}
      {Object.entries(event.provenance).map(([name, value]) => (
        <div key={`${name}-${value}`}>
          <span className="text-text-subtle">{name}:</span> {value}
        </div>
      ))}
    </div>
  );

  return (
    <GenericEventMessage
      title={title}
      details={details}
      success={event.status === "approved" ? "success" : undefined}
      className={standaloneRowClass}
    />
  );
}
