import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";

// One PIN protects every locked folder. Only a salted hash is stored, in the
// Android Keystore-backed SecureStore, never the PIN itself. There is no
// recovery: a forgotten PIN can only be reset by erasing what it protects,
// and the setup screen makes the person acknowledge that in writing.
//
// Unlocking is per session: it lasts until the app has been in the
// background for RELOCK_AFTER_MS, or until "Lock now". Wrong attempts back
// off (5 tries, then a wait that doubles), and the counter survives restarts.

const HASH_KEY = "folderlock.hash";
const SALT_KEY = "folderlock.salt";
const ATTEMPTS_KEY = "folderlock.attempts";
const LOCKOUT_KEY = "folderlock.lockoutUntil";
export const PIN_LENGTH = 6;
export const RELOCK_AFTER_MS = 60_000;
const FREE_ATTEMPTS = 5;

let unlocked = false;
let backgroundedAt: number | null = null;
const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function isUnlocked() {
  return unlocked;
}
export function lockNow() {
  if (!unlocked) return;
  unlocked = false;
  notify();
}

AppState.addEventListener("change", (state) => {
  if (state === "background" || state === "inactive") {
    if (backgroundedAt === null) backgroundedAt = Date.now();
    return;
  }
  if (state === "active" && backgroundedAt !== null) {
    if (Date.now() - backgroundedAt >= RELOCK_AFTER_MS) lockNow();
    backgroundedAt = null;
  }
});

async function digest(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export function isValidPin(pin: string) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function hasPin() {
  return !!(await SecureStore.getItemAsync(HASH_KEY));
}

export async function setPin(pin: string) {
  if (!isValidPin(pin)) throw new Error(`The PIN must be ${PIN_LENGTH} digits.`);
  const salt = Crypto.randomUUID();
  await SecureStore.setItemAsync(SALT_KEY, salt);
  await SecureStore.setItemAsync(HASH_KEY, await digest(pin, salt));
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(LOCKOUT_KEY);
  unlocked = true;
  notify();
}

/** Milliseconds until another attempt is allowed; 0 when allowed now. */
export async function lockoutRemaining() {
  const until = Number(await SecureStore.getItemAsync(LOCKOUT_KEY));
  return Number.isFinite(until) && until > Date.now() ? until - Date.now() : 0;
}

export type VerifyOutcome = { ok: true } | { ok: false; attemptsLeft: number; waitMs: number };

export async function verifyPin(pin: string): Promise<VerifyOutcome> {
  const wait = await lockoutRemaining();
  if (wait > 0) return { ok: false, attemptsLeft: 0, waitMs: wait };
  const [hash, salt] = await Promise.all([SecureStore.getItemAsync(HASH_KEY), SecureStore.getItemAsync(SALT_KEY)]);
  if (!hash || !salt) return { ok: false, attemptsLeft: 0, waitMs: 0 };
  if (isValidPin(pin) && (await digest(pin, salt)) === hash) {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    await SecureStore.deleteItemAsync(LOCKOUT_KEY);
    unlocked = true;
    notify();
    return { ok: true };
  }
  const attempts = (Number(await SecureStore.getItemAsync(ATTEMPTS_KEY)) || 0) + 1;
  await SecureStore.setItemAsync(ATTEMPTS_KEY, String(attempts));
  if (attempts >= FREE_ATTEMPTS) {
    // 30 s after the fifth miss, doubling each miss after that, capped at an hour.
    const waitMs = Math.min(60 * 60_000, 30_000 * 2 ** (attempts - FREE_ATTEMPTS));
    await SecureStore.setItemAsync(LOCKOUT_KEY, String(Date.now() + waitMs));
    return { ok: false, attemptsLeft: 0, waitMs };
  }
  return { ok: false, attemptsLeft: FREE_ATTEMPTS - attempts, waitMs: 0 };
}

/**
 * Removes the PIN. The caller is responsible for what happens to locked
 * folders first (unlock them, or erase their documents); this only forgets
 * the secret.
 */
export async function clearPin() {
  for (const key of [HASH_KEY, SALT_KEY, ATTEMPTS_KEY, LOCKOUT_KEY]) await SecureStore.deleteItemAsync(key);
  unlocked = false;
  notify();
}
