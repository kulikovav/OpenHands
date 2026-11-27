import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import {
  findAutomationTarget,
  getAutomationTargetFieldError,
  getAutomationTargetKinds,
  hasLiveAutomationRun,
  normalizeAutomationOrigin,
  targetRunsCreationPath,
} from "#/utils/automation-targets";
import { AutomationRunStatus, type AutomationRun } from "#/types/automation";
import type { AutomationTarget } from "#/manifests/types";

const targets = [
  {
    id: "pilot",
    name: "Pilot sandbox",
    origin: "https://OH.uk1.example/",
  },
  { id: "other", name: "Other", origin: "https://other.example" },
];

function makeRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  return {
    id: "run-1",
    status: AutomationRunStatus.COMPLETED,
    conversation_id: null,
    bash_command_id: null,
    error_detail: null,
    started_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:01:00Z",
    ...overrides,
  };
}

describe("automation target matching", () => {
  it("normalizes the scheme, case, and trailing slashes", () => {
    expect(normalizeAutomationOrigin("HTTPS://Oh.Uk1.Example///")).toBe(
      "oh.uk1.example",
    );
  });

  it("matches the target at the active backend origin", () => {
    expect(findAutomationTarget(targets, "http://oh.uk1.example")?.id).toBe(
      "pilot",
    );
  });

  it("returns null when no target has that origin", () => {
    expect(
      findAutomationTarget(targets, "https://unlisted.example"),
    ).toBeNull();
    expect(findAutomationTarget([], "https://oh.uk1.example")).toBeNull();
  });
});

describe("automation target kinds", () => {
  const target = (kinds?: string[]): AutomationTarget => ({
    id: "pilot",
    name: "Pilot sandbox",
    origin: "https://oh.uk1.example",
    ...(kinds ? { kinds } : {}),
  });

  it("treats an absent list as prompt only", () => {
    expect(getAutomationTargetKinds(target())).toEqual(["prompt"]);
    expect(targetRunsCreationPath(target(), "prompt")).toBe(true);
    expect(targetRunsCreationPath(target(), "plugin")).toBe(false);
    expect(targetRunsCreationPath(target(), "custom")).toBe(false);
  });

  it("offers every creation path a target that runs all four kinds", () => {
    const all = target(["prompt", "script", "plugin", "custom_tarball"]);
    expect(targetRunsCreationPath(all, "prompt")).toBe(true);
    expect(targetRunsCreationPath(all, "plugin")).toBe(true);
    expect(targetRunsCreationPath(all, "custom")).toBe(true);
  });

  it("runs the upload path only from custom_tarball", () => {
    expect(targetRunsCreationPath(target(["custom_tarball"]), "custom")).toBe(
      true,
    );
    // The custom body sends no template, so the service creates
    // custom_tarball and a script-only target would answer 422.
    expect(targetRunsCreationPath(target(["script"]), "custom")).toBe(false);
  });

  it("keeps an unknown kind from widening another path", () => {
    const future = target(["prompt", "future_kind"]);
    expect(targetRunsCreationPath(future, "prompt")).toBe(true);
    expect(targetRunsCreationPath(future, "plugin")).toBe(false);
    expect(targetRunsCreationPath(future, "custom")).toBe(false);
  });

  it("keeps every path for a deployment without a target", () => {
    expect(targetRunsCreationPath(null, "prompt")).toBe(true);
    expect(targetRunsCreationPath(undefined, "plugin")).toBe(true);
    expect(targetRunsCreationPath(null, "custom")).toBe(true);
  });
});

describe("hasLiveAutomationRun", () => {
  it("is true while a run is pending or running", () => {
    expect(
      hasLiveAutomationRun([
        makeRun(),
        makeRun({ id: "run-2", status: AutomationRunStatus.PENDING }),
      ]),
    ).toBe(true);
    expect(
      hasLiveAutomationRun([makeRun({ status: AutomationRunStatus.RUNNING })]),
    ).toBe(true);
  });

  it("is false once every run is terminal", () => {
    expect(
      hasLiveAutomationRun([
        makeRun(),
        makeRun({ id: "run-2", status: AutomationRunStatus.FAILED }),
      ]),
    ).toBe(false);
    expect(hasLiveAutomationRun(undefined)).toBe(false);
  });
});

describe("getAutomationTargetFieldError", () => {
  it("returns the server's target field message", () => {
    const error = new AxiosError("Request failed with status code 422");
    error.response = {
      status: 422,
      data: {
        detail: {
          message: "The draft is invalid.",
          errors: [
            {
              field: "target_id",
              code: "target_unavailable",
              message: "That target is no longer available.",
            },
          ],
        },
      },
    } as AxiosError["response"];

    expect(getAutomationTargetFieldError(error)).toBe(
      "That target is no longer available.",
    );
  });

  it("ignores an error that is not addressed to the target field", () => {
    const error = new AxiosError("Request failed with status code 422");
    error.response = {
      status: 422,
      data: { detail: { errors: [{ field: "prompt", message: "Required" }] } },
    } as AxiosError["response"];

    expect(getAutomationTargetFieldError(error)).toBeNull();
  });
});
