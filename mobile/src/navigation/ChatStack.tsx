import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Property } from "../services/propertyService";
import ChatScreen          from "../screens/ChatScreen";
import PropertyListScreen  from "../screens/PropertyListScreen";
import PropertyDetailScreen from "../screens/PropertyDetailScreen";
import { colors, fonts } from "../theme";

export type ChatStackParamList = {
  Chat:           undefined;
  PropertyList:   undefined;
  PropertyDetail: { property: Property };
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
    </Stack.Navigator>
  );
}
