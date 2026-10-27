import { getStateFromPath } from "@react-navigation/native";
import appJson from "../../../app.json";
import { UNIVERSAL_LINK_ORIGIN, UNIVERSAL_LINK_PATHS } from "../../services/deepLinks";
import { linkingConfig } from "../../navigation/linking";

const host = new URL(UNIVERSAL_LINK_ORIGIN).host;

describe("universal links", () => {
  it("iOS associates the web domain", () => {
    expect(appJson.expo.ios.associatedDomains).toContain(`applinks:${host}`);
  });

  it("Android verifies exactly the shared paths on the web domain", () => {
    const filter = (appJson.expo.android.intentFilters as any[]).find((f) => f.autoVerify);
    const paths = filter.data.map((d: any) => {
      expect(d).toMatchObject({ scheme: "https", host });
      return d.path ?? `${d.pathPrefix}*`;
    });
    expect(paths.sort()).toEqual([...UNIVERSAL_LINK_PATHS].sort());
  });

  it.each([
    ["/dashboard", "Tabs"],
    ["/people", "People"],
    ["/report/tok_1", "Report"],
    ["/my-listing/PROP_1", "MyListing"],
  ])("%s opens a screen in the app", (path, screen) => {
    const state = getStateFromPath(path.slice(1), linkingConfig as any);
    const names = state?.routes.map((r) => r.name) ?? [];
    expect(names).toContain(screen);
  });
});
