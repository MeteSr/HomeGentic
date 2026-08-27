/**
 * Unit tests for useAuthStore (Zustand)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "@/store/authStore";

function getStore() {
  return useAuthStore.getState();
}

function resetStore() {
  useAuthStore.setState({
    isAuthenticated: false,
    principal: null,
    profile: null,
    isLoading: true,
    lastLoginAt: null,
    tier: null,
  });
}

describe("useAuthStore — initial state", () => {
  beforeEach(resetStore);

  it("starts unauthenticated", () => {
    expect(getStore().isAuthenticated).toBe(false);
  });

  it("starts with null principal", () => {
    expect(getStore().principal).toBeNull();
  });

  it("starts with null profile", () => {
    expect(getStore().profile).toBeNull();
  });

  it("starts with isLoading true", () => {
    expect(getStore().isLoading).toBe(true);
  });

  it("starts with null tier", () => {
    expect(getStore().tier).toBeNull();
  });

  it("starts with null lastLoginAt", () => {
    expect(getStore().lastLoginAt).toBeNull();
  });
});

describe("useAuthStore — setAuthenticated", () => {
  beforeEach(resetStore);

  it("sets isAuthenticated to true and stores principal", () => {
    getStore().setAuthenticated("abc-123");
    expect(getStore().isAuthenticated).toBe(true);
    expect(getStore().principal).toBe("abc-123");
  });

  it("throws when called with empty string", () => {
    expect(() => getStore().setAuthenticated("")).toThrow();
  });
});

describe("useAuthStore — setProfile", () => {
  beforeEach(resetStore);

  it("stores the profile object", () => {
    const profile = { id: "xyz", name: "Jane", role: "Homeowner" } as any;
    getStore().setProfile(profile);
    expect(getStore().profile).toEqual(profile);
  });
});

describe("useAuthStore — setLoading", () => {
  beforeEach(resetStore);

  it("sets isLoading to false", () => {
    getStore().setLoading(false);
    expect(getStore().isLoading).toBe(false);
  });

  it("sets isLoading back to true", () => {
    getStore().setLoading(false);
    getStore().setLoading(true);
    expect(getStore().isLoading).toBe(true);
  });
});

describe("useAuthStore — setTier", () => {
  beforeEach(resetStore);

  it("stores the tier", () => {
    getStore().setTier("Pro");
    expect(getStore().tier).toBe("Pro");
  });
});

describe("useAuthStore — setLastLoginAt", () => {
  beforeEach(resetStore);

  it("stores the timestamp", () => {
    const ts = Date.now();
    getStore().setLastLoginAt(ts);
    expect(getStore().lastLoginAt).toBe(ts);
  });

  it("accepts null to clear", () => {
    getStore().setLastLoginAt(12345);
    getStore().setLastLoginAt(null);
    expect(getStore().lastLoginAt).toBeNull();
  });
});

describe("useAuthStore — clearAuth", () => {
  beforeEach(resetStore);

  it("resets all auth fields to defaults", () => {
    getStore().setAuthenticated("some-principal");
    getStore().setProfile({ id: "u1", name: "Bob" } as any);
    getStore().setTier("Premium");
    getStore().setLastLoginAt(Date.now());

    getStore().clearAuth();

    const state = getStore();
    expect(state.isAuthenticated).toBe(false);
    expect(state.principal).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.tier).toBeNull();
    expect(state.lastLoginAt).toBeNull();
  });
});
