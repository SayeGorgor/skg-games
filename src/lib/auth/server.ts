import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
const secret = process.env.NEON_AUTH_COOKIE_SECRET;
// No auth configuration is a supported local/demo mode. Partial configuration
// is an error, rather than silently creating insecure or broken sessions.
if (baseUrl || secret) {
  if (!baseUrl)
    throw new Error(
      "Set NEON_AUTH_BASE_URL from your Neon branch Auth configuration.",
    );
  if (!secret || secret.length < 32)
    throw new Error(
      "NEON_AUTH_COOKIE_SECRET must contain at least 32 characters. Generate it with openssl rand -base64 32.",
    );
  const url = new URL(baseUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && url.hostname === "localhost")
  )
    throw new Error(
      "NEON_AUTH_BASE_URL must use HTTPS (HTTP is allowed only for localhost).",
    );
}
export const auth =
  baseUrl && secret ? createNeonAuth({ baseUrl, cookies: { secret } }) : null;
