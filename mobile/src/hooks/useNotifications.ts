/**
 * 15.3.5 + 15.3.6 — Push permission prompt and notification routing.
 *
 * Call this hook from RootNavigator once the user is authenticated.
 * It requests push permissions (deferred, not on first launch), registers the
 * Expo push token with the relay, and routes notification taps to the correct
 * screen via Linking.
 */
import { useEffect, useRef } from "react";
import * as Notifications    from "expo-notifications";
import { Linking, Platform } from "react-native";
import { useAuthContext }     from "../auth/AuthContext";
import {
  buildTokenPayload,
  parseNotificationRoute,
  registerPushToken,
  unregisterPushToken,
} from "../services/notificationService";

// Show alerts + play sounds while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

export function useNotifications(): void {
  const { authState } = useAuthContext();
  const tokenRef      = useRef<string | null>(null);

  useEffect(() => {
    if (authState.status !== "authenticated") return;

    const principal = authState.principal;
    let cancelled   = false;

    async function setup(): Promise<void> {
      // 15.3.5 — Request permission (deferred: only after auth, not on cold launch)
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;

      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted" || cancelled) return;

      // Retrieve the Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync();
      if (cancelled) return;

      const expoPushToken = tokenData.data;
      tokenRef.current    = expoPushToken;

      const platform = Platform.OS === "ios" ? "ios" : "android";
      await registerPushToken(buildTokenPayload(principal, expoPushToken, platform));
    }

    setup().catch((err) =>
      console.error("[useNotifications] setup error:", err)
    );

    // 15.3.6 — Notification tap → deep-link routing
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data  = response.notification.request.content.data;
      const route = parseNotificationRoute(data);
      if (route) {
        Linking.openURL(`homefax://${route}`).catch((err) =>
          console.error("[useNotifications] deep-link failed:", err)
        );
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();

      // Unregister token on logout
      if (tokenRef.current) {
        unregisterPushToken(tokenRef.current).catch(() => undefined);
        tokenRef.current = null;
      }
    };
  }, [authState.status, authState.status === "authenticated" ? authState.principal : null]);
}
