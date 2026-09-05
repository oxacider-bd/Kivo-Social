"use client";

/**
 * OneSignal Web Push (v16) — the single, centralized client integration.
 *
 * - The official SDK is loaded ONCE from the CDN (deferred, non-blocking);
 *   no raw script tags anywhere else in the app.
 * - Initialized exactly once per page load; duplicate calls are no-ops.
 * - Identity: `OneSignal.login(externalId)` with the STABLE Supabase user
 *   UUID (never email). Logout clears it so identities never leak across
 *   accounts on a shared device.
 * - The browser permission prompt is never forced on load — users opt in
 *   from Settings (the OneSignal dashboard prompt is used when registering).
 * - Push is an optional delivery layer: every failure is caught and logged;
 *   Supabase Realtime and the app keep working without it.
 */

// App ID is public by design (like the Supabase publishable key). The env var
// takes precedence; the documented KIVO app id is the built-in fallback so the
// integration activates on Vercel without extra configuration.
const APP_ID = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? "ad47b6a9-2829-4b27-b6c4-c7bb0c3c3b88").trim();
const SDK_URL = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";

interface OneSignalSdk {
  init(options: { appId: string; allowLocalhostAsSecureOrigin?: boolean }): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  Notifications: {
    permission: boolean;
    permissionNative?: NotificationPermission;
    registerForPushNotifications(): Promise<void>;
    addEventListener(event: string, listener: (arg?: unknown) => void): void;
    removeEventListener(event: string, listener: (arg?: unknown) => void): void;
  };
}

declare global {
  interface Window {
    OneSignalDeferred?: Array<(sdk: OneSignalSdk) => void>;
  }
}

let loadPromise: Promise<void> | null = null;
let sdk: OneSignalSdk | null = null;
let initialized = false;
let identityInFlight: Promise<void> | null = null;

export function isPushConfigured(): boolean {
  return APP_ID.length > 0;
}

export function pushPermission(): NotificationPermission {
  if (typeof window === "undefined" || !sdk) return "default";
  return sdk.Notifications.permissionNative ?? (sdk.Notifications.permission ? "granted" : "default");
}

function loadSdk(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("no window"));
      return;
    }
    if (window.OneSignalDeferred) {
      resolve();
      return;
    }
    window.OneSignalDeferred = [];
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("OneSignal SDK failed to load"));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** Loads + initializes the SDK once. Safe to call repeatedly. */
export async function initOneSignal(): Promise<boolean> {
  if (!APP_ID) return false; // not configured (e.g. local development)
  if (initialized && sdk) return true;
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadSdk();
      await new Promise<void>((resolve, reject) => {
        window.OneSignalDeferred!.push((instance) => {
          sdk = instance;
          instance
            .init({
              appId: APP_ID,
              allowLocalhostAsSecureOrigin: window.location.hostname === "localhost",
            })
            .then(() => resolve())
            .catch(reject);
        });
      });
    })();
  }
  try {
    await loadPromise;
    initialized = true;
    return true;
  } catch (err) {
    console.warn("[onesignal] init failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Associates the signed-in KIVO identity with OneSignal (external_id = the
 * Supabase user UUID) or clears it on logout — the previous user's identity
 * is never left attached to the next user on a shared device. Serialized so
 * concurrent identity changes can never interleave.
 */
export async function setOneSignalIdentity(authId: string | null): Promise<void> {
  if (!APP_ID) return;
  if (identityInFlight) await identityInFlight.catch(() => undefined);
  identityInFlight = (async () => {
    try {
      const ready = await initOneSignal();
      if (!ready || !sdk) return;
      if (authId) await sdk.login(authId);
      else await sdk.logout();
    } catch (err) {
      console.warn("[onesignal] identity update failed:", err instanceof Error ? err.message : err);
    }
  })();
  await identityInFlight;
}

/**
 * Opt-in: registers for push via the OneSignal dashboard-configured prompt.
 * Returns the resulting permission state. Called explicitly from Settings —
 * never automatically on load — and the browser itself never re-prompts a
 * user who previously denied.
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  const ready = await initOneSignal();
  if (!ready || !sdk) return "default";
  try {
    await sdk.Notifications.registerForPushNotifications();
  } catch (err) {
    console.warn("[onesignal] registration failed:", err instanceof Error ? err.message : err);
  }
  return pushPermission();
}