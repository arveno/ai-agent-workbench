export function readSessionStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const rawValue = window.sessionStorage.getItem(key);

  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

export function writeSessionStorageJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
}
