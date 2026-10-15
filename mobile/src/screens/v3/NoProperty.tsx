import React from "react";
import { Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useAppData } from "../../context/AppData";
import { HOMEGENTIC_WEB_URL } from "../../services/reportService";
import { Card, Kicker, PageHeader, Pill } from "../../components/ui";
import { type } from "../../theme";

/** Adding a property needs address lookup and ownership checks, which live on the web. */
export function openAddProperty(): Promise<unknown> {
  return WebBrowser.openBrowserAsync(`${HOMEGENTIC_WEB_URL.replace(/\/$/, "")}/dashboard`);
}

export function NoProperty() {
  const app = useAppData();
  return (
    <>
      <PageHeader kicker="WELCOME" title="Add your home" />
      <Card style={{ padding: 20 }}>
        <Kicker>{app.propertiesError ? "COULDN'T LOAD" : "NO PROPERTY YET"}</Kicker>
        <Text style={[type.body, { fontSize: 13.5, lineHeight: 21, marginTop: 10 }]}>
          {app.propertiesError
            ? "We couldn't reach your properties. Check your connection and try again."
            : "Add your property on homegentic.app. It shows up here as soon as it's saved, with its score, jobs and upkeep."}
        </Text>
        <Pill
          label={app.propertiesError ? "Try again" : "Add a property"}
          icon={app.propertiesError ? undefined : "external"}
          style={{ marginTop: 16 }}
          onPress={() => (app.propertiesError ? app.refreshProperties() : openAddProperty().then(app.refreshProperties))}
        />
      </Card>
    </>
  );
}
