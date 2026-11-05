"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authUrl } from "@/lib/auth/flow";
import { useViewer } from "./viewer-provider";
import { endResultSession } from "@/lib/results/local";
export function AccountControls({
  mode,
  primary = false,
  variant = "account",
}: {
  mode?: "sign-in" | "sign-up";
  primary?: boolean;
  variant?: "account" | "sign-out" | "menu-auth";
}) {
  const { viewer, adsEnabled } = useViewer();
  const authMode = mode ?? (adsEnabled ? "sign-in" : "sign-up");
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      window.dispatchEvent(new Event("skg-auth-leaving"));
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      endResultSession();
      window.location.replace(new URL("/", window.location.origin).href);
    } catch {
      setError("Could not sign out. Try again.");
      setBusy(false);
    }
  }
  if (variant === "sign-out" && !viewer.authenticated) return null;
  return (
    <div
      className={`header-account${variant === "sign-out" ? " header-menu-sign-out" : ""}`}
    >
      {viewer.authenticated ? (
        <>
          {variant === "account" && (
            <Link className="header-plus" href="/account">
              {adsEnabled && viewer.premium ? "Account · Plus" : "Account"}
            </Link>
          )}
          {variant === "sign-out" && (
            <button
              className="header-sign-in"
              type="button"
              disabled={busy}
              onClick={signOut}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          )}
        </>
      ) : (
        <>
          <Link
            className={
              variant === "menu-auth"
                ? undefined
                : primary
                  ? "header-plus"
                  : "header-sign-in"
            }
            href={authUrl(authMode, "standard", path)}
            onClick={(event) => {
              event.preventDefault();
              router.push(
                authUrl(
                  authMode,
                  "standard",
                  window.location.pathname + window.location.search,
                ),
              );
            }}
          >
            {authMode === "sign-up" ? "Sign up" : "Sign in"}
          </Link>
        </>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
