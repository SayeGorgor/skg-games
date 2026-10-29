"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { authUrl } from "@/lib/auth/flow";
import { useViewer } from "./viewer-provider";
export function AccountControls() {
  const { viewer } = useViewer();
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
      window.location.replace(new URL("/", window.location.origin).href);
    } catch {
      setError("Could not sign out. Try again.");
      setBusy(false);
    }
  }
  return (
    <div className="header-account">
      {viewer.authenticated ? (
        <>
          <Link href="/account">
            {viewer.premium ? "Account · Plus" : "Account"}
          </Link>
          <button type="button" disabled={busy} onClick={signOut}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </>
      ) : (
        <>
          <Link
            href={authUrl("sign-in", "standard", path)}
            onClick={(event) => {
              event.preventDefault();
              router.push(
                authUrl(
                  "sign-in",
                  "standard",
                  window.location.pathname + window.location.search,
                ),
              );
            }}
          >
            Sign in
          </Link>
          <Link
            href={authUrl("sign-up", "standard", path)}
            onClick={(event) => {
              event.preventDefault();
              router.push(
                authUrl(
                  "sign-up",
                  "standard",
                  window.location.pathname + window.location.search,
                ),
              );
            }}
          >
            Sign up
          </Link>
        </>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
