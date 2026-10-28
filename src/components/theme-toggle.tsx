"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const current =
        document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      setTheme(current);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function choose(next: "light" | "dark") {
    document.documentElement.dataset.theme = next;
    localStorage.setItem("skg-theme", next);
    setTheme(next);
  }

  return (
    <div className="theme-switch" aria-label="Color theme">
      <button
        aria-pressed={theme === "light"}
        className={theme === "light" ? "active" : ""}
        onClick={() => choose("light")}
      >
        LIGHT
      </button>
      <button
        aria-pressed={theme === "dark"}
        className={theme === "dark" ? "active" : ""}
        onClick={() => choose("dark")}
      >
        DARK
      </button>
    </div>
  );
}
