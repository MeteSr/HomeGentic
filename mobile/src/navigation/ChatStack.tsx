import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Property } from "../services/propertyService";
import ChatScreen            from "../screens/ChatScreen";
import PropertyListScreen    from "../screens/PropertyListScreen";
import PropertyDetailScreen  from "../screens/PropertyDetailScreen";
import LogJobScreen          from "../screens/LogJobScreen";
import QuoteRequestScreen    from "../screens/QuoteRequestScreen";
import MyQuotesScreen        from "../screens/MyQuotesScreen";
import SignJobScreen         from "../screens/SignJobScreen";
import type { SignableJob, SignRole } from "../services/signJobService";
import { colors, fonts } from "../theme";

export type ChatStackParamList = {
  Chat:           undefined;
  PropertyList:   undefined;
  PropertyDetail: { property: Property };
  LogJob:         { propertyId: string; propertyAddress: string };
  QuoteRequest:   { propertyId: string; propertyAddress: string };
  MyQuotes:       { propertyId: string; propertyAddress: string };
  SignJob:        { job: SignableJob; currentRole: SignRole };
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export default function ChatStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:       { backgroundColor: colors.paper },
        headerTintColor:   colors.ink,
        headerTitleStyle:  { fontFamily: fonts.mono, fontSize: 11 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PropertyList"
        component={PropertyListScreen}
        options={{ title: "MY PROPERTIES" }}
      />
      <Stack.Screen
        name="PropertyDetail"
        component={PropertyDetailScreen}
        options={({ route }) => ({
          title: route.params.property.address.split(",")[0].toUpperCase(),
        })}
      />
      <Stack.Screen
        name="LogJob"
        component={LogJobScreen}
        options={{ title: "LOG JOB" }}
      />
      <Stack.Screen
        name="QuoteRequest"
        component={QuoteRequestScreen}
        options={{ title: "REQUEST QUOTES" }}
      />
      <Stack.Screen
        name="MyQuotes"
        component={MyQuotesScreen}
        options={{ title: "QUOTE REQUESTS" }}
      />
      <Stack.Screen
        name="SignJob"
        component={SignJobScreen}
        options={{ title: "SIGN JOB" }}
      />
    </Stack.Navigator>
  );
}
