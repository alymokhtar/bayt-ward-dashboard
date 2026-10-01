"use client";

import { useEffect } from "react";

export default function ThemeInitializer() {
  useEffect(() => {
    let darkMode = false;
    try {
      darkMode = window.localStorage.getItem("bayt-ward-theme") === "dark";
    } catch {
      // Keep the default light theme when browser storage is unavailable.
    }
    document.documentElement.classList.toggle("dark", darkMode);
    window.dispatchEvent(new Event("bayt-ward-theme-change"));
  }, []);

  return null;
}