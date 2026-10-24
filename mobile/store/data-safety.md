# HomeGentic — Google Play Data Safety Declaration

Keep this in step with the Privacy Policy (`frontend/src/pages/PrivacyPolicyPage.tsx`, "Who We Share Data With").

## Does your app collect or share any of the required user data types?

**Yes.** The app stores the user's account details and home records on HomeGentic's servers (canisters on the Internet Computer) and sends some of them to service providers to run features.

## Is all of the user data collected by your app encrypted in transit?

**Yes** (TLS for every request).

## Do you provide a way for users to request that their data is deleted?

**Yes.** Account → Delete account opens Settings → Privacy on homegentic.app, where the user deletes their account and data. Users can also email privacy@homegentic.app. Deletion URL for the Play listing: `https://homegentic.app/settings?tab=privacy`.

---

## Data collected

All items are **linked to the user's account**, used for **App functionality** only (plus Account management where noted), and never used for advertising or tracking.

| Play category → type | Collected | Shared | Required? | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info → Email address | Yes | No | Required | App functionality, Account management | Account email; used for notifications and receipts (delivered via Resend). |
| Personal info → Phone number | Yes | No | Optional | App functionality | Only if the user turns on text alerts (delivered via Twilio). |
| Personal info → Address | Yes | Yes | Required for property features | App functionality | Property addresses. Sent to ATTOM, RentCast, OpenPermit and city/county permit portals for property and permit records. A property's street address is visible to other users while it is being claimed. |
| Personal info → User IDs | Yes | No | Required | Account management | Internet Identity principal (pseudonymous). |
| Photos and videos → Photos | Yes | Yes | Optional | App functionality | Job and property photos the user uploads. Sent to Anthropic when the user asks the app to read one. |
| Files and docs → Files and docs | Yes | Yes | Optional | App functionality | Scanned documents and bills. Sent to Anthropic to extract their contents. |
| App activity → Other user-generated content | Yes | Yes | Optional | App functionality | Job records, notes and questions to the assistant. Assistant questions (with property context) go to Anthropic. Quote requests go to the contractors the user asks for quotes. |
| Device or other IDs → Device or other IDs | Yes | No | Optional | App functionality | Push-notification token, registered against the account (via Expo, APNs/FCM). Removed when the user turns notifications off. |

"Shared" is marked Yes wherever data leaves HomeGentic for a third party, even when that party only processes it for us, to stay on the safe side of Play's definition.

## Data not collected

- Precise or approximate location
- Web browsing or search history
- Financial info (payments happen on the web, with Stripe, not in the app)
- Health and fitness, contacts, calendar, SMS or call logs, audio
- Crash logs or diagnostics sent to third parties

## Is data sold to third parties?

**No.** HomeGentic data is never sold to third parties.

---

## Notes for reviewers

- Sign-in uses Internet Identity (passkeys). An email address is required to create an account; a phone number is optional.
- All subscription and upgrade flows open `https://homegentic.app/pricing` in the device browser. No payment information is collected inside the app.
- The app uses `expo-secure-store` (iOS Keychain / Android Keystore) for session delegation storage. This data never leaves the device.
