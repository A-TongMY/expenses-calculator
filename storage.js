import { exportBackup, importBackup } from "./backup.js";

export const STORAGE_KEY = "expenses-calculator";
const UNREADABLE_PREFIX = `${STORAGE_KEY}:unreadable:`;

export const blankState = () => ({ income: 0, commitments: [], lifestyle: [], checkIns: [] });

function keepUnreadableCopy(saved) {
  try {
    const existing = Object.keys(localStorage).find(
      (key) => key.startsWith(UNREADABLE_PREFIX) && localStorage.getItem(key) === saved,
    );
    if (existing) return existing;
    const key = `${UNREADABLE_PREFIX}${new Date().toISOString()}`;
    localStorage.setItem(key, saved);
    return key;
  } catch {
    return null;
  }
}

// Never throws: problems come back as a notice for the caller to show.
export function loadState() {
  let saved;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    return {
      state: blankState(),
      notice: "This browser is blocking storage, so changes will not be saved. Use Export backup to keep your data.",
    };
  }
  if (!saved) return { state: blankState() };
  try {
    return { state: importBackup(saved) };
  } catch {
    const key = keepUnreadableCopy(saved);
    return {
      state: blankState(),
      notice: key
        ? `Your saved data could not be read, so the app started empty. The original was kept untouched in this browser (storage key "${key}").`
        : "Your saved data could not be read, so the app started empty, and a copy could not be kept. Do not make changes if you want to recover it.",
    };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, exportBackup(state));
    return true;
  } catch {
    return false;
  }
}
