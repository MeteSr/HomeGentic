import React from "react";
import { Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAppData } from "../../context/AppData";
import { Card, Kicker, PageHeader, Pill } from "../../components/ui";
import { type } from "../../theme";

export function NoProperty() {
  const app = useAppData();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <>
      <PageHeader kicker="WELCOME" title="Add your home" />
      <Card style={{ padding: 20 }}>
        <Kicker>{app.propertiesError ? "COULDN'T LOAD" : "NO PROPERTY YET"}</Kicker>
        <Text style={[type.body, { fontSize: 13.5, lineHeight: 21, marginTop: 10 }]}>
          {app.propertiesError
            ? "We couldn't reach your properties. Check your connection and try again."
            : "Add your home's address and a few details to start its record: jobs, upkeep and its score live here."}
        </Text>
        <Pill
          label={app.propertiesError ? "Try again" : "Add a property"}
          style={{ marginTop: 16 }}
          onPress={() => (app.propertiesError ? app.refreshProperties() : navigation.navigate("AddProperty"))}
        />
      </Card>
    </>
  );
}
