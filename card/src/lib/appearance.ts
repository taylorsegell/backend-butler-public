/** Butler's optional accent override is local to this browser/origin. */
export const APPEARANCE_STORAGE_KEY = 'backend-butler-accent';
let accent: string | null | undefined;
const listeners = new Set<() => void>();

/** Accept only CSS hex colors; storing a normalized value keeps style injection out. */
export function normalizeAccent(value: string): string | null {
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return '#' + [...hex.slice(1)].map((digit) => digit + digit).join('').toUpperCase();
  }
  return null;
}

export function getAppearanceAccent(): string | null {
  if (accent === undefined) {
    try {
      accent = normalizeAccent(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '');
    } catch {
      accent = null;
    }
  }
  return accent;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Apply immediately; return false when browser storage could not persist the choice. */
export function setAppearanceAccent(value: string | null): boolean {
  const next = value === null ? null : normalizeAccent(value);
  if (value !== null && !next) throw new Error('Enter a hex color such as #4C8DFF.');
  const changed = next !== getAppearanceAccent();
  accent = next;
  let saved = true;
  try {
    if (next) window.localStorage.setItem(APPEARANCE_STORAGE_KEY, next);
    else window.localStorage.removeItem(APPEARANCE_STORAGE_KEY);
  } catch {
    saved = false;
  }
  if (changed) notify();
  return saved;
}

function onStorage(event: StorageEvent): void {
  if (event.key !== APPEARANCE_STORAGE_KEY && event.key !== null) return;
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
  } catch {
    return;
  }
  const next = event.key === null ? null : normalizeAccent(event.newValue ?? '');
  if (next !== getAppearanceAccent()) {
    accent = next;
    notify();
  }
}

export function subscribeAppearance(listener: () => void): () => void {
  if (!listeners.size && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Called by the card host before contrast derivation, including after theme changes. */
export function applyAppearance(host: HTMLElement): void {
  const custom = getAppearanceAccent();
  const current = host.style.getPropertyValue('--lk-accent').trim();
  if (custom) {
    if (current !== custom) host.style.setProperty('--lk-accent', custom);
  } else if (current) {
    host.style.removeProperty('--lk-accent');
  }
}
