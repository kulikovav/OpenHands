import { describe, expect, it } from "vitest";
import {
  isArchivedSandboxStatus,
  isEffectivelyArchivedConversation,
  isMissingSandboxStatus,
  isRuntimeUnavailableSandboxStatus,
} from "#/utils/conversation-archive-status";
import type { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";

describe("conversation archive predicates", () => {
  it.each<[SandboxStatus | null | undefined, boolean]>([
    ["MISSING", true],
    ["ERROR", false],
    ["PAUSED", false],
    ["RUNNING", false],
    ["STARTING", false],
    [null, false],
    [undefined, false],
  ])("isMissingSandboxStatus(%s) === %s", (status, expected) => {
    expect(isMissingSandboxStatus(status)).toBe(expected);
  });

  it.each<[SandboxStatus | null | undefined, boolean]>([
    ["MISSING", true],
    ["ERROR", true],
    ["PAUSED", false],
    ["RUNNING", false],
    [null, false],
    [undefined, false],
  ])("isRuntimeUnavailableSandboxStatus(%s) === %s", (status, expected) => {
    expect(isRuntimeUnavailableSandboxStatus(status)).toBe(expected);
  });

  it("treats a missing runtime as effectively archived", () => {
    expect(isEffectivelyArchivedConversation("MISSING", false)).toBe(true);
  });

  it("treats an explicit archive as effectively archived", () => {
    expect(isEffectivelyArchivedConversation(null, true)).toBe(true);
    expect(isEffectivelyArchivedConversation("RUNNING", true)).toBe(true);
  });

  it("does not treat an errored runtime as archived on its own", () => {
    expect(isEffectivelyArchivedConversation("ERROR", false)).toBe(false);
  });

  it("does not treat a running runtime as archived on its own", () => {
    expect(isEffectivelyArchivedConversation("RUNNING", false)).toBe(false);
    expect(isEffectivelyArchivedConversation(null, false)).toBe(false);
  });
});

describe("isArchivedSandboxStatus", () => {
  it("reads a gone sandbox or an errored one as archived", () => {
    expect(isArchivedSandboxStatus("MISSING")).toBe(true);
    expect(isArchivedSandboxStatus("ERROR")).toBe(true);
    expect(isArchivedSandboxStatus("RUNNING")).toBe(false);
    expect(isArchivedSandboxStatus(null)).toBe(false);
    expect(isArchivedSandboxStatus(undefined)).toBe(false);
  });

  it("does not read a runtime on another backend as archived", () => {
    // A local runtime the active backend does not host derives a MISSING
    // sandbox status, but that means the conversation runs elsewhere in the
    // deployment. Reading it as archived would hide a live conversation.
    expect(isArchivedSandboxStatus("MISSING", "missing")).toBe(false);
    expect(isArchivedSandboxStatus("ERROR", "missing")).toBe(false);
    // A hosted runtime keeps the normal sandbox reading.
    expect(isArchivedSandboxStatus("MISSING", "available")).toBe(true);
    expect(isArchivedSandboxStatus("ERROR", "ownership_lost")).toBe(true);
  });
});
