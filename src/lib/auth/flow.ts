export type AuthIntent = "standard" | "premium";
export function parseAuthIntent(value: unknown): AuthIntent {
  return value === "premium" ? "premium" : "standard";
}
export function sanitizeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s\u0000-\u001f]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://skg.invalid");
    if (
      url.origin !== "https://skg.invalid" ||
      url.pathname.startsWith("/auth") ||
      url.pathname.startsWith("/api")
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
export function authUrl(path: string, intent: AuthIntent, returnTo: string) {
  return `/auth/${path}?${new URLSearchParams({ intent, returnTo: sanitizeReturnTo(returnTo) })}`;
}
export function shouldShowSignupUpsell(
  isNew: boolean,
  intent: AuthIntent,
  premium: boolean,
) {
  return isNew && intent === "standard" && !premium;
}
export function premiumDestination(authenticated: boolean, premium: boolean) {
  return premium
    ? "/account"
    : authenticated
      ? "/plus?purchase=1"
      : authUrl("sign-up", "premium", "/plus");
}
export function validAnonymousId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function hasPremiumSubscription(
  subscription: { status: string; currentPeriodEnd: Date | null } | undefined,
  now = new Date(),
) {
  return (
    !!subscription &&
    ["active", "trialing"].includes(subscription.status) &&
    !!subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd > now
  );
}
