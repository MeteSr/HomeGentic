import type { LinkingOptions } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

/**
 * Deep-link paths → screens. Routes emitted in push notification payloads
 * (agents/notifications/events.ts) must resolve here or in
 * services/deepLinks.ts: jobs/<id>, quotes/<id>, leads, leads/<id>,
 * my-listing/<propertyId>, review/<contractor>/<jobId>. jobs/ and leads/ land
 * on small router screens (screens/LinkScreens.tsx) because where they go
 * depends on the role and on the item.
 */
export const linkingConfig: LinkingOptions<RootStackParamList>["config"] = {
  initialRouteName: "Tabs",
  screens: {
    Tabs: {
      screens: {
        Home:     "dashboard",
        Property: "property",
        Upkeep:   "upkeep",
        Account:  "account",
        Sign:     "sign",
        Earnings: "earnings",
        CAccount: "contractor/account",
      },
    },
    JobLink:   "jobs/:jobId?",
    LeadLink:  "leads/:leadId?",
    MyQuotes:  "quotes/:requestId",
    MyListing: "my-listing/:propertyId",
    Report:    "report/:token?",
    People:    "people",
    Upgrade:   "plan",
  },
};
