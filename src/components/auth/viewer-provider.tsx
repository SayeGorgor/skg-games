"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  migrateLocalResults,
  setResultActor,
  syncResults,
  RESULTS_CHANGED,
  localResults,
} from "@/lib/results/local";
import { dailyStreak } from "@/lib/results/shared";
export type PublicViewer = {
  accountKey?: string | null;
  name: string | null;
  email: string | null;
  authenticated: boolean;
  premium: boolean;
};
const empty: PublicViewer = {
  name: null,
  email: null,
  authenticated: false,
  premium: false,
};
const ViewerContext = createContext({
  viewer: empty,
  adsEnabled: false,
  refresh: async () => {},
  syncStatus: "idle" as "idle" | "syncing" | "saved" | "error",
  syncError: "",
  retryResults: async () => {},
  streak: 0,
});
export function ViewerProvider({
  initial,
  adsEnabled,
  children,
}: {
  initial: PublicViewer;
  adsEnabled: boolean;
  children: ReactNode;
}) {
  const [viewer, setViewer] = useState(initial);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "saved" | "error"
  >("idle");
  const [syncError, setSyncError] = useState("");
  const [streakState, setStreak] = useState({ scope: "", value: 0 });
  const resultScope = viewer.authenticated
    ? (viewer.accountKey ?? "")
    : "guest";
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      if (!viewer.authenticated) {
        setStreak({
          scope: resultScope,
          value: dailyStreak(localResults(null)).current,
        });
        return;
      }
      if (!viewer.accountKey) return;
      try {
        const response = await fetch("/api/stats", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data.accountKey === viewer.accountKey && !controller.signal.aborted)
          setStreak({ scope: resultScope, value: data.summary.streak.current });
      } catch {
        /* Keep the last confirmed streak while offline. */
      }
    };
    const frame = requestAnimationFrame(() => void update());
    window.addEventListener("skg-results-synced", update);
    if (!viewer.authenticated) window.addEventListener(RESULTS_CHANGED, update);
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
      window.removeEventListener("skg-results-synced", update);
      window.removeEventListener(RESULTS_CHANGED, update);
    };
  }, [viewer.authenticated, viewer.accountKey, resultScope]);
  const retryResults = useCallback(async () => {
    if (!viewer.authenticated || !viewer.accountKey) return;
    setResultActor(viewer.accountKey);
    setSyncStatus("syncing");
    try {
      const changed = await syncResults(viewer.accountKey);
      setSyncStatus("saved");
      setSyncError("");
      if (changed) window.dispatchEvent(new Event("skg-results-synced"));
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "Your browser history is safe. Try again later.",
      );
    }
  }, [viewer.accountKey, viewer.authenticated]);
  useEffect(() => {
    setResultActor(viewer.authenticated ? (viewer.accountKey ?? null) : null);
    migrateLocalResults();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void retryResults(), 500);
    };
    schedule();
    const visible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    window.addEventListener(RESULTS_CHANGED, schedule);
    window.addEventListener("online", schedule);
    window.addEventListener("focus", schedule);
    window.addEventListener("storage", schedule);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(RESULTS_CHANGED, schedule);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("storage", schedule);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retryResults, viewer.accountKey, viewer.authenticated]);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/auth/viewer", { cache: "no-store" });
    if (response.ok) setViewer(await response.json());
  }, []);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  return (
    <ViewerContext
      value={{
        viewer,
        adsEnabled,
        refresh,
        syncStatus,
        syncError,
        retryResults,
        streak: streakState.scope === resultScope ? streakState.value : 0,
      }}
    >
      {children}
    </ViewerContext>
  );
}
export const useViewer = () => useContext(ViewerContext);
