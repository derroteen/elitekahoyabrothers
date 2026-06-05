// Routes Supabase auth tokens to sessionStorage by default so closing the
// browser ends the session. When the user opts into "Remember Me" we set
// `ekb-remember-me=1` in localStorage and tokens persist there instead.
//
// We monkey-patch Storage.prototype so the auto-generated supabase client
// (which is hard-coded to localStorage) transparently uses the right backing
// store for keys matching `sb-*-auth-token`.

export const REMEMBER_KEY = "ekb-remember-me";

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  if (remember) window.localStorage.setItem(REMEMBER_KEY, "1");
  else window.localStorage.removeItem(REMEMBER_KEY);
}

export function isRememberMe(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REMEMBER_KEY) === "1";
}

let installed = false;

export function installSessionStorageShim() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const isAuthKey = (k: string) =>
    typeof k === "string" && k.startsWith("sb-") && k.includes("-auth-token");

  const origGet = Storage.prototype.getItem;
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;

  Storage.prototype.getItem = function (key: string) {
    if (this === window.localStorage && isAuthKey(key) && !isRememberMe()) {
      return origGet.call(window.sessionStorage, key);
    }
    return origGet.call(this, key);
  };

  Storage.prototype.setItem = function (key: string, value: string) {
    if (this === window.localStorage && isAuthKey(key) && !isRememberMe()) {
      return origSet.call(window.sessionStorage, key, value);
    }
    return origSet.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key: string) {
    if (this === window.localStorage && isAuthKey(key)) {
      // Always clear from both stores so sign-out is thorough.
      try { origRemove.call(window.sessionStorage, key); } catch {}
    }
    return origRemove.call(this, key);
  };
}

// Install on module import (client-only).
installSessionStorageShim();
