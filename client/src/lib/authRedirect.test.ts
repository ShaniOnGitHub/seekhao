import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAfterLogin, consumeAfterLogin, rememberAfterLogin } from "./authRedirect";

describe("Firebase post-login destination", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the interview destination until it is consumed", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    rememberAfterLogin("/interview");

    expect(values.get("seekhao-after-login")).toBe("/interview");
    expect(consumeAfterLogin()).toBe("/interview");
    expect(consumeAfterLogin()).toBeNull();
  });

  it("clears a failed sign-in destination without throwing", () => {
    const values = new Map<string, string>([["seekhao-after-login", "/interview"]]);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    clearAfterLogin();

    expect(values.has("seekhao-after-login")).toBe(false);
  });

  it("keeps authentication resilient when embedded browsers reject storage", () => {
    const storageError = () => { throw new Error("storage is unavailable"); };
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: storageError,
        setItem: storageError,
        removeItem: storageError,
      },
    });

    expect(() => rememberAfterLogin("/interview")).not.toThrow();
    expect(() => clearAfterLogin()).not.toThrow();
    expect(consumeAfterLogin()).toBeNull();
  });

});
