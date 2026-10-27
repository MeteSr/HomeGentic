import { gatewayPublicBase, oauthCallbackUrl } from "../publicUrl";

describe("gateway public URL for OAuth redirects", () => {
  it("uses IOT_GATEWAY_PUBLIC_URL, without a trailing slash", () => {
    const env = { IOT_GATEWAY_PUBLIC_URL: "https://iot.homegentic.app/" } as NodeJS.ProcessEnv;
    expect(oauthCallbackUrl(3002, "/oauth/device/callback/ecobee", env))
      .toBe("https://iot.homegentic.app/oauth/device/callback/ecobee");
  });

  it("falls back to localhost outside production", () => {
    expect(gatewayPublicBase(3005, {} as NodeJS.ProcessEnv)).toBe("http://localhost:3005");
  });

  it("refuses to run in production without a public URL", () => {
    expect(() => gatewayPublicBase(3002, { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/IOT_GATEWAY_PUBLIC_URL/);
  });
});
