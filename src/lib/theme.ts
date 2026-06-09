export type Theme = "dark" | "light";

const STORAGE_KEY = "tailor-it-theme";

export function getStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function getPreferredTheme(): Theme {
  return getStoredTheme() ?? "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

/** Call once before React mounts (also mirrored in index.html inline script). */
export function initTheme(): Theme {
  const theme = getPreferredTheme();
  applyTheme(theme);
  return theme;
}
