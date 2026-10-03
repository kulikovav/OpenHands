import React from "react";
import { useNavigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";

import { useConversationId } from "#/hooks/use-conversation-id";
import { useConversationPanelRoute } from "#/hooks/use-conversation-panel-route";
import { useCommandStore } from "#/stores/command-store";
import { useConversationStore } from "#/stores/conversation-store";
import { useAgentStore } from "#/stores/agent-store";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  clearLastConversationId,
  setLastConversationId,
} from "#/api/backend-registry/last-conversation-store";
import { AgentState } from "#/types/agent-state";

import { EventHandler } from "../wrapper/event-handler";

import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSharedConversation } from "#/hooks/query/use-shared-conversation";
import { useConversationOwnerBackend } from "#/hooks/query/use-conversation-owner-backend";
import { useTaskPollingController } from "#/hooks/query/use-task-polling";

import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useIsAuthed } from "#/hooks/query/use-is-authed";
import { ConversationMain } from "#/components/features/conversation/conversation-main/conversation-main";
import { ConversationMobilePanelPage } from "#/components/features/conversation/conversation-main/conversation-mobile-panel-page";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { ConversationOverviewDrawerProvider } from "#/components/features/conversation/conversation-overview-drawer-context";

import { WebSocketProviderWrapper } from "#/contexts/websocket-provider-wrapper";
import { useErrorMessageStore } from "#/stores/error-message-store";
import { I18nKey } from "#/i18n/declaration";
import { useCloudSandboxAutoResume } from "#/hooks/mutation/use-cloud-sandbox-auto-resume";

function AppContent() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const showsMobilePanelPage = useConversationPanelRoute(conversationId);

  const { isTask, taskStatus, taskDetail } = useTaskPollingController();

  // The conversationId in the URL belongs to whichever backend was
  // active when the route first mounted. If the user switches backends
  // while this route is still mounted, the id is meaningless under the
  // new backend — disable the active-conversation fetch (and its 404
  // toast) so we don't fire a request that the BackendSelector's
  // redirect will immediately navigate away from anyway. Mirrors the
  // same guard in `routes/automation-detail.tsx`.
  const active = useActiveBackend();
  const mountedBackendId = React.useRef(active.backend.id);
  const mountedOrgId = React.useRef(active.orgId);
  const backendChanged =
    mountedBackendId.current !== active.backend.id ||
    mountedOrgId.current !== active.orgId;

  const { data: conversation, isFetched } = useActiveConversation();
  const { data: isAuthed } = useIsAuthed();
  const { resetConversationState } = useConversationStore();
  const navigate = useNavigate();
  const location = useLocation();
  const clearTerminal = useCommandStore((state) => state.clearTerminal);
  const resetConversationRuntimeState = useConversationStateStore(
    (state) => state.reset,
  );
  const setCurrentAgentState = useAgentStore(
    (state) => state.setCurrentAgentState,
  );
  const removeErrorMessage = useErrorMessageStore(
    (state) => state.removeErrorMessage,
  );

  // Per-conversation UI/runtime resets. The event store is cleared separately,
  // inside ConversationWebSocketProvider, so the clear is ordered *before* the
  // preloaded-history re-seed (see the note there) — clearing it here would run
  // too late and wipe the freshly seeded history on a conversation switch.
  React.useEffect(() => {
    clearTerminal();
    resetConversationState();
    resetConversationRuntimeState();
    setCurrentAgentState(AgentState.LOADING);
    removeErrorMessage();
  }, [
    conversationId,
    clearTerminal,
    resetConversationState,
    resetConversationRuntimeState,
    setCurrentAgentState,
    removeErrorMessage,
  ]);

  React.useEffect(() => {
    if (isTask && taskStatus === "ERROR") {
      displayErrorToast(
        taskDetail || t(I18nKey.CONVERSATION$FAILED_TO_START_FROM_TASK),
      );
      // Navigate back to the original conversation when a resume task fails so
      // the user isn't stranded at the dead task-{id} URL. The resume effect's
      // ref prevents it from immediately retrying once we land there.
      const resumedFrom = (location.state as Record<string, unknown> | null)
        ?.resumedFromConversationId as string | undefined;
      navigate(
        resumedFrom ? `/conversations/${resumedFrom}` : "/conversations",
        { replace: true },
      );
    }
  }, [isTask, taskStatus, taskDetail, t, navigate, location.state]);

  // The BackendSelector is in the middle of redirecting us away from
  // this route — don't toast/navigate based on a 404 that's just
  // "this id doesn't exist on the new backend".
  const ownerLookupMissed =
    isFetched && !!isAuthed && !backendChanged && !conversation;

  // On cloud, a conversation the owner lookup cannot see may still be shared
  // with this user: public, or created by an automation in one of their orgs.
  // Probe the shared lookup before giving up and send them to the read-only
  // view when it resolves. Local backends have no sharing, and start-task ids
  // are not conversations.
  const shouldProbeShared =
    ownerLookupMissed &&
    active.backend.kind === "cloud" &&
    !!conversationId &&
    !conversationId.startsWith("task-");
  const { data: sharedConversation, isFetched: isSharedProbeFetched } =
    useSharedConversation(conversationId, { enabled: shouldProbeShared });

  // On a local deployment, the active backend can list a conversation whose
  // event log it does not hold: the deployment's servers share one conversation
  // store, so the catalog read answers everywhere, while the transcript read
  // (`events/search`) answers only on the server that owns the conversation.
  // Reading it here fails with `404 Conversation not found`, so the peer that
  // can serve it is resolved first and the transcript is read there.
  //
  // Start-task ids are not conversations.
  const shouldResolveForeignOwner =
    active.backend.kind === "local" &&
    !!conversationId &&
    !conversationId.startsWith("task-") &&
    !backendChanged;

  const { data: ownerBackend, isFetched: isOwnerBackendFetched } =
    useConversationOwnerBackend(conversationId, {
      enabled: shouldResolveForeignOwner,
    });
  const ownerHost = ownerBackend?.url ?? "";

  // Reading the conversation from the owner proves it exists there, which is
  // what turns a missed lookup into a transcript instead of a "not found".
  const { data: foreignConversation, isFetched: isForeignProbeFetched } =
    useSharedConversation(conversationId, {
      enabled: shouldResolveForeignOwner && !!ownerHost,
      host: ownerHost,
    });
  // The foreign probe is settled when the owner lookup answered without an
  // owner, or when the transcript read answered.
  const foreignProbeSettled =
    !shouldResolveForeignOwner ||
    (isOwnerBackendFetched && (!ownerHost || isForeignProbeFetched));

  React.useEffect(() => {
    if (!ownerLookupMissed) return;
    if (shouldProbeShared && !isSharedProbeFetched) return;
    if (!foreignProbeSettled) return;
    if (shouldProbeShared && sharedConversation) {
      navigate(`/shared/conversations/${conversationId}`, { replace: true });
      return;
    }
    if (ownerHost && foreignConversation) {
      navigate(
        `/shared/conversations/${conversationId}?host=${encodeURIComponent(ownerHost)}`,
        { replace: true },
      );
      return;
    }
    // Clear the per-backend "last selected" slot so the next switch
    // to this backend doesn't try to revisit a stale id.
    clearLastConversationId(active.backend.id, active.orgId);
    displayErrorToast(t(I18nKey.CONVERSATION$NOT_EXIST_OR_NO_PERMISSION));
    navigate("/conversations");
  }, [
    ownerLookupMissed,
    shouldProbeShared,
    isSharedProbeFetched,
    sharedConversation,
    foreignProbeSettled,
    ownerHost,
    foreignConversation,
    conversationId,
    navigate,
    t,
    active.backend.id,
    active.orgId,
  ]);

  // The active backend lists the conversation but does not hold its transcript:
  // hand the read to the peer that does. This waits for the transcript read to
  // succeed, so a peer that cannot serve it leaves the user on the conversation
  // view instead of landing on a not-found page. A miss here is silent — the
  // first effect owns the "not found" report.
  React.useEffect(() => {
    if (!ownerHost) return;
    if (!foreignConversation) return;
    navigate(
      `/shared/conversations/${conversationId}?host=${encodeURIComponent(ownerHost)}`,
      { replace: true },
    );
  }, [ownerHost, foreignConversation, conversationId, navigate]);

  // Remember the most recently selected conversation for the current
  // (backend, org) so flipping back to this backend later restores the
  // user to where they left off. Skip while a backend switch is in
  // flight: the id in the URL is from the previous backend and would
  // otherwise overwrite the new backend's memory.
  React.useEffect(() => {
    if (backendChanged) return;
    if (!conversationId) return;
    if (conversationId.startsWith("task-")) return;
    setLastConversationId(active.backend.id, active.orgId, conversationId);
  }, [conversationId, backendChanged, active.backend.id, active.orgId]);

  useCloudSandboxAutoResume({
    backendChanged,
    backendKind: active.backend.kind,
    conversation,
    conversationId,
    isFetched,
  });

  // A backend switch is in flight (BackendSelector flips the active backend
  // and redirects to /conversations on the next tick). The conversationId in
  // the URL belongs to the *previous* backend, so unmount the whole
  // conversation subtree now — before any per-conversation query (history,
  // metrics, sub-conversations, runtime info, …) re-fires against a backend
  // the id is foreign to. Those foreign fetches fail response validation and
  // surface "agent server returned data this UI does not understand". This is
  // deterministic regardless of the navigate-vs-setActive render race: React
  // re-renders this parent before its children, so returning null removes them
  // before they can issue the request.
  if (backendChanged) {
    return null;
  }

  // The conversation subtree loads history, metrics, and the event socket
  // against the active backend. Mounting it before the owning peer is known
  // would address a server that does not hold this conversation and surface a
  // 404 the redirect is about to fix.
  if (shouldResolveForeignOwner && !isOwnerBackendFetched) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }
  // A peer holds the transcript: hold the subtree until the redirect lands.
  // When the read from that peer fails there is no redirect to wait for, so the
  // conversation renders here instead of leaving the route empty.
  if (ownerHost) {
    if (!isForeignProbeFetched) {
      return (
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner size="large" />
        </div>
      );
    }
    if (foreignConversation) {
      return null;
    }
  }

  const content = (
    <EventHandler>
      <ConversationOverviewDrawerProvider>
        <div data-testid="app-route" className="flex h-full flex-col">
          {showsMobilePanelPage ? (
            <ConversationMobilePanelPage
              onNavigateBack={() =>
                navigate(`/conversations/${conversationId}`)
              }
            />
          ) : (
            <ConversationMain />
          )}
        </div>
      </ConversationOverviewDrawerProvider>
    </EventHandler>
  );

  return (
    <WebSocketProviderWrapper conversationId={conversationId}>
      {content}
    </WebSocketProviderWrapper>
  );
}

export function ConversationView() {
  return <AppContent />;
}

export default ConversationView;
