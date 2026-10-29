"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { authUrl, type AuthIntent } from "@/lib/auth/flow";
type Mode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";
export function AuthForm({
  mode,
  intent,
  returnTo,
  token,
  initialError,
  enabled,
}: {
  mode: Mode;
  intent: AuthIntent;
  returnTo: string;
  token?: string;
  initialError?: boolean;
  enabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      initialError
        ? "Sign-in was cancelled or could not be completed. Please try again."
        : "",
    ),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const callback = (isNew: boolean) =>
    new URL(
      authUrl("complete", intent, returnTo) + `&new=${isNew ? 1 : 0}`,
      window.location.origin,
    ).href;
  const signup = mode === "sign-up",
    login = mode === "sign-in";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim(),
      password = String(form.get("password") ?? ""),
      name = String(form.get("name") ?? "").trim();
    if (
      (signup || mode === "reset-password") &&
      password !== form.get("confirm")
    ) {
      setError("Passwords must match.");
      return;
    }
    if (signup && !name) {
      setError("Enter your name.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot-password") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: new URL(
            authUrl("reset-password", intent, returnTo),
            window.location.origin,
          ).href,
        });
        if (result.error) throw new Error(result.error.message);
        setNotice(
          "If an account exists for this email, we’ve sent password reset instructions. Check your inbox.",
        );
      } else if (mode === "reset-password") {
        if (!token)
          throw new Error(
            "This reset link is missing or expired. Request a new one.",
          );
        const result = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (result.error) throw new Error(result.error.message);
        setNotice("Your password has been updated. You can now sign in.");
      } else {
        const result = signup
          ? await authClient.signUp.email({
              name,
              email,
              password,
              callbackURL: callback(true),
            })
          : await authClient.signIn.email({
              email,
              password,
              callbackURL: callback(false),
            });
        if (result.error) throw new Error(result.error.message);
        const session = await authClient.getSession();
        if (session.data?.user) {
          let isNew = signup;
          try {
            const pending = JSON.parse(
              sessionStorage.getItem("skg-pending-signup") ?? "null",
            );
            if (
              pending?.email === email &&
              Date.now() - pending.createdAt < 86400000
            )
              isNew = true;
            sessionStorage.removeItem("skg-pending-signup");
          } catch {}
          window.location.assign(callback(isNew));
          return;
        }
        if (signup)
          try {
            sessionStorage.setItem(
              "skg-pending-signup",
              JSON.stringify({ email, createdAt: Date.now() }),
            );
          } catch {}
        setNotice(
          "Check your email to verify your account, then sign in to continue. Free games are still available.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function google() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: callback(false),
        newUserCallbackURL: callback(true),
        errorCallbackURL: new URL(
          authUrl(mode, intent, returnTo) + "&error=oauth",
          window.location.origin,
        ).href,
      });
      if (result.error) throw new Error(result.error.message);
    } catch {
      setError("Google sign-in could not be started. Please try again.");
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {!enabled && (
        <p role="status">
          Account services are not available yet. You can keep playing all free
          games.
        </p>
      )}
      {intent === "premium" && (
        <p>Sign in or create an account to continue to SKG Plus.</p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <fieldset disabled={busy || !enabled}>
          {signup && (
            <label>
              Name
              <input name="name" autoComplete="name" required maxLength={120} />
            </label>
          )}
          {mode !== "reset-password" && (
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          )}
          {mode !== "forgot-password" && (
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={login ? "current-password" : "new-password"}
                required
                minLength={login ? 1 : 8}
                maxLength={128}
              />
            </label>
          )}
          {(signup || mode === "reset-password") && (
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
              />
            </label>
          )}
          <button className="button primary" type="submit">
            {busy
              ? "Please wait…"
              : signup
                ? "Create account"
                : login
                  ? "Sign in"
                  : mode === "forgot-password"
                    ? "Send reset instructions"
                    : "Update password"}
          </button>
          {(login || signup) && (
            <button className="button secondary" type="button" onClick={google}>
              {busy ? "Connecting…" : "Continue with Google"}
            </button>
          )}
        </fieldset>
      </form>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="auth-links">
        {login && (
          <Link href={authUrl("forgot-password", intent, returnTo)}>
            Forgot password?
          </Link>
        )}
        <Link href={authUrl(signup ? "sign-in" : "sign-up", intent, returnTo)}>
          {signup ? "Already have an account? Sign in" : "Create an account"}
        </Link>
        {!login && !signup && (
          <Link href={authUrl("sign-in", intent, returnTo)}>
            Back to sign in
          </Link>
        )}
        <Link href={returnTo}>Continue playing free</Link>
      </div>
    </>
  );
}
