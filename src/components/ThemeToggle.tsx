import clsx from "clsx";

import { useTheme } from "../contexts/ThemeContext";

type ThemeToggleProps = {
  collapsed?: boolean;
  className?: string;
};

export function ThemeToggle({ collapsed = false, className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      className={clsx("theme-toggle", collapsed && "theme-toggle--collapsed", className)}
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Dark mode" : "Light mode"}
    >
      <span className="theme-toggle__track" aria-hidden>
        <span className={clsx("theme-toggle__thumb", isLight && "theme-toggle__thumb--light")} />
      </span>
      {!collapsed ? (
        <span className="theme-toggle__label">{isLight ? "Light" : "Dark"}</span>
      ) : null}
    </button>
  );
}
