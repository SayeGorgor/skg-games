"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  function choose(next: "light" | "dark") {
    document.documentElement.dataset.theme = next;
    localStorage.setItem("skg-theme", next);
    setTheme(next);
  }

  return (
    <div className="theme-switch" aria-label="Color theme">
      <button
        className={theme === "light" ? "active" : ""}
        onClick={() => choose("light")}
      >
        LIGHT
      </button>
      <button
        className={theme === "dark" ? "active" : ""}
        onClick={() => choose("dark")}
      >
        DARK
      </button>
    </div>
  );
}
