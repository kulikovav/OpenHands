import { describe, expect, it } from "vitest";
import {
  CONVERSATION_ARCHIVED_TAG,
  isArchivedByTag,
  isArchivedSandboxStatus,
  withArchivedTag,
} from "#/utils/conversation-archive-status";

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

describe("isArchivedByTag", () => {
  it("reads the archive tag of a conversation", () => {
    // Arrange — the value a client writes when it archives.
    const conversation = { tags: { [CONVERSATION_ARCHIVED_TAG]: "true" } };

    // Act + Assert
    expect(isArchivedByTag(conversation)).toBe(true);
  });

  it("accepts a padded or upper-case value", () => {
    // The bridge and the panel both trim and fold the value, so a hand-written
    // tag must read the same way.
    expect(
      isArchivedByTag({ tags: { [CONVERSATION_ARCHIVED_TAG]: " TRUE " } }),
    ).toBe(true);
  });

  it("treats every other value as unarchived", () => {
    expect(
      isArchivedByTag({ tags: { [CONVERSATION_ARCHIVED_TAG]: "false" } }),
    ).toBe(false);
    expect(
      isArchivedByTag({ tags: { [CONVERSATION_ARCHIVED_TAG]: "1" } }),
    ).toBe(false);
    expect(isArchivedByTag({ tags: { bridgemode: "cloudagent" } })).toBe(false);
    expect(isArchivedByTag({ tags: null })).toBe(false);
    expect(isArchivedByTag({})).toBe(false);
    expect(isArchivedByTag(null)).toBe(false);
    expect(isArchivedByTag(undefined)).toBe(false);
  });
});

describe("withArchivedTag", () => {
  it("keeps the sibling tags, because the server replaces the whole map", () => {
    // Arrange — the ownership tags the Cursor bridge reads back.
    const tags = { bridgemode: "cloudagent", bridgerepo: "github.com/a/b" };

    // Act + Assert
    expect(withArchivedTag(tags, true)).toEqual({
      bridgemode: "cloudagent",
      bridgerepo: "github.com/a/b",
      [CONVERSATION_ARCHIVED_TAG]: "true",
    });
    expect(withArchivedTag(tags, false)).toEqual({
      bridgemode: "cloudagent",
      bridgerepo: "github.com/a/b",
      [CONVERSATION_ARCHIVED_TAG]: "false",
    });
  });

  it("starts a map for a conversation without tags and never mutates it", () => {
    // Arrange — a conversation no client tagged yet.
    const tags = null;

    // Act + Assert
    expect(withArchivedTag(tags, true)).toEqual({
      [CONVERSATION_ARCHIVED_TAG]: "true",
    });
    expect(withArchivedTag(undefined, false)).toEqual({
      [CONVERSATION_ARCHIVED_TAG]: "false",
    });
  });
});
