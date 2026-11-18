import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  getActiveBackend,
  setActiveSelection,
} from "#/api/backend-registry/active-store";
import { __resetHealthStoreForTests } from "#/api/backend-registry/health-store";
import {
  ACTIVE_BACKEND_STORAGE_KEY,
  BACKENDS_STORAGE_KEY,
  DEFAULT_BACKEND_STORAGE_KEY,
  readStoredDefaultBackendId,
  writeStoredDefaultBackendId,
} from "#/api/backend-registry/storage";
import type { Backend } from "#/api/backend-registry/types";

const firstBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:9000",
  apiKey: "k",
  kind: "local",
};

const secondBackend: Backend = {
  id: "local-2",
  name: "Local 2",
  host: "http://localhost:9001",
  apiKey: "k2",
  kind: "local",
};

function writeBackends(backends: Backend[]): void {
  window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify(backends));
}

function writeStoredSelection(backendId: string, storage: Storage): void {
  storage.setItem(
    ACTIVE_BACKEND_STORAGE_KEY,
    JSON.stringify({ backendId, orgId: null }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetHealthStoreForTests();
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetHealthStoreForTests();
  __resetActiveStoreForTests();
});

describe("configured default backend", () => {
  it("starts a new run on the default even when another local backend is first", () => {
    writeBackends([firstBackend, secondBackend]);
    writeStoredDefaultBackendId(secondBackend.id);

    __resetActiveStoreForTests();

    expect(getActiveBackend().backend.id).toBe(secondBackend.id);
  });

  it("keeps the existing last-used and Local behavior when no default is set", () => {
    writeBackends([firstBackend, secondBackend]);
    writeStoredSelection(secondBackend.id, window.localStorage);

    __resetActiveStoreForTests();

    expect(readStoredDefaultBackendId()).toBeNull();
    expect(getActiveBackend().backend.id).toBe(secondBackend.id);
  });

  it("lets this tab's explicit choice win over the default", () => {
    writeBackends([firstBackend, secondBackend]);
    writeStoredDefaultBackendId(secondBackend.id);
    writeStoredSelection(firstBackend.id, window.sessionStorage);

    __resetActiveStoreForTests();

    expect(getActiveBackend().backend.id).toBe(firstBackend.id);
  });

  it("ignores the cross-tab last-used backend when a default is set", () => {
    writeBackends([firstBackend, secondBackend]);
    writeStoredDefaultBackendId(secondBackend.id);
    writeStoredSelection(firstBackend.id, window.localStorage);

    __resetActiveStoreForTests();

    expect(getActiveBackend().backend.id).toBe(secondBackend.id);
  });

  it("falls back when the default backend is no longer registered", () => {
    writeBackends([firstBackend, secondBackend]);
    writeStoredDefaultBackendId("removed-backend");

    __resetActiveStoreForTests();

    expect(getActiveBackend().backend.id).toBe(firstBackend.id);
  });

  it("keeps an explicit selection after the registry notifies", () => {
    writeBackends([firstBackend, secondBackend]);
    writeStoredDefaultBackendId(secondBackend.id);
    __resetActiveStoreForTests();

    setActiveSelection({ backendId: firstBackend.id });

    expect(getActiveBackend().backend.id).toBe(firstBackend.id);
  });

  it("clears the preference and returns to the last-used behavior", () => {
    writeStoredDefaultBackendId(secondBackend.id);
    expect(readStoredDefaultBackendId()).toBe(secondBackend.id);

    writeStoredDefaultBackendId(null);

    expect(readStoredDefaultBackendId()).toBeNull();
    expect(window.localStorage.getItem(DEFAULT_BACKEND_STORAGE_KEY)).toBeNull();
  });
});