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
    const root = document.documentElement;
    root.classList.add("theme-changing");
    root.dataset.theme = next;
    // Commit the new palette without animating; restore transitions for hover.
    document
      .querySelectorAll(".header-plus, .header-sign-in")
      .forEach((button) => void getComputedStyle(button).backgroundColor);
    root.classList.remove("theme-changing");
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
