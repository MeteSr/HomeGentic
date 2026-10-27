/**
 * The gateway's public base URL, for OAuth redirect_uri values.
 *
 * Every vendor checks the redirect_uri against the one registered for the
 * app, and the browser follows it after sign-in, so it has to be the address
 * the gateway is reachable at (IOT_GATEWAY_PUBLIC_URL), not localhost. Local
 * dev without the var still gets http://localhost:<port>.
 */
export function gatewayPublicBase(port: number, env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.IOT_GATEWAY_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (env.NODE_ENV === "production") {
    throw new Error("IOT_GATEWAY_PUBLIC_URL must be set in production (OAuth redirects need the public address)");
  }
  return `http://localhost:${port}`;
}

export function oauthCallbackUrl(port: number, path: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${gatewayPublicBase(port, env)}${path.startsWith("/") ? path : `/${path}`}`;
}
