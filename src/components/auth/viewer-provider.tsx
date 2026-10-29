"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export type PublicViewer = {
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
const ViewerContext = createContext({ viewer: empty, refresh: async () => {} });
export function ViewerProvider({
  initial,
  children,
}: {
  initial: PublicViewer;
  children: ReactNode;
}) {
  const [viewer, setViewer] = useState(initial);
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
  return <ViewerContext value={{ viewer, refresh }}>{children}</ViewerContext>;
}
export const useViewer = () => useContext(ViewerContext);
