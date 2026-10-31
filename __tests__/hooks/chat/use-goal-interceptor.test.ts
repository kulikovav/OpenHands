import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGoalInterceptor } from "#/hooks/chat/use-goal-interceptor";

const mockStartGoal = vi.hoisted(() =>
  vi.fn<
    (
      id: string,
      req: { objective: string; max_iterations?: number },
      ownerUrl?: string,
    ) => Promise<void>
  >(),
);
const mockToast = vi.hoisted(() => vi.fn<(message: string) => void>());

const { OWNER_URL } = vi.hoisted(() => ({
  OWNER_URL: "https://owner.example/api/conversations/conv-1",
}));

vi.mock("#/hooks/mutation/conversation-mutation-utils", () => ({
  startGoal: (
    ...args: [string, { objective: string; max_iterations?: number }, string?]
  ) => mockStartGoal(...args),
}));

vi.mock("#/hooks/use-owner-conversation-url", () => ({
  useOwnerConversationUrl: () => OWNER_URL,
}));

vi.mock("#/utils/custom-toast-handlers", () => ({
  displayErrorToast: (message: string) => mockToast(message),
}));

const CONV = "conv-1";

describe("useGoalInterceptor", () => {
  beforeEach(() => {
    mockStartGoal.mockReset();
    mockStartGoal.mockResolvedValue(undefined);
    mockToast.mockReset();
  });

  it("falls through to onSubmit for non-/goal messages", () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useGoalInterceptor(CONV, onSubmit));
    act(() => result.current("hello world"));
    expect(onSubmit).toHaveBeenCalledWith("hello world");
    expect(mockStartGoal).not.toHaveBeenCalled();
  });

  it("intercepts /goal and starts the loop with the objective", () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useGoalInterceptor(CONV, onSubmit));
    act(() => result.current("/goal make pytest pass"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockStartGoal).toHaveBeenCalledWith(
      CONV,
      {
        objective: "make pytest pass",
      },
      OWNER_URL,
    );
  });

  it("parses a leading --max N flag", () => {
    const { result } = renderHook(() => useGoalInterceptor(CONV, vi.fn()));
    act(() => result.current("/goal --max 3 make pytest pass"));
    expect(mockStartGoal).toHaveBeenCalledWith(
      CONV,
      {
        objective: "make pytest pass",
        max_iterations: 3,
      },
      OWNER_URL,
    );
  });

  it("parses the --max=N form", () => {
    const { result } = renderHook(() => useGoalInterceptor(CONV, vi.fn()));
    act(() => result.current("/goal --max=5 ship it"));
    expect(mockStartGoal).toHaveBeenCalledWith(
      CONV,
      {
        objective: "ship it",
        max_iterations: 5,
      },
      OWNER_URL,
    );
  });

  it("ignores an invalid --max value and treats the rest as the objective", () => {
    const { result } = renderHook(() => useGoalInterceptor(CONV, vi.fn()));
    act(() => result.current("/goal --max abc do the thing"));
    expect(mockStartGoal).toHaveBeenCalledWith(
      CONV,
      {
        objective: "--max abc do the thing",
      },
      OWNER_URL,
    );
  });

  it("does nothing for a bare /goal with no objective", () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useGoalInterceptor(CONV, onSubmit));
    act(() => result.current("/goal"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockStartGoal).not.toHaveBeenCalled();
  });

  it("falls through when conversationId is null", () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useGoalInterceptor(null, onSubmit));
    act(() => result.current("/goal do it"));
    expect(onSubmit).toHaveBeenCalledWith("/goal do it");
    expect(mockStartGoal).not.toHaveBeenCalled();
  });

  it("shows an error toast when startGoal rejects", async () => {
    mockStartGoal.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useGoalInterceptor(CONV, vi.fn()));
    act(() => result.current("/goal do it"));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("boom"));
  });
});
