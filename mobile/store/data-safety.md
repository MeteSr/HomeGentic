# HomeGentic — Google Play Data Safety Declaration

## Does your app collect or share any of the required user data types?

**Yes** — the app collects a device identifier (push token) for notification delivery.

---

## Data collected

### Device or other IDs
| Field | Value |
|---|---|
| Data type | Device or other IDs → Device ID (push notification token) |
| Collected | Yes |
| Shared | No |
| Required or optional | Optional (user may decline notification permission) |
| Purpose | App functionality — delivering push notifications to the authenticated user's device |
| Encrypted in transit | Yes |
| User can request deletion | Yes — via Settings → Notifications → Disable, which unregisters the token from our relay server |

---

## Data not collected

HomeGentic does **not** collect or share any of the following:

- Real name, email address, or phone number
- Precise or approximate location
- Web browsing history or search history
- Financial information (all subscription upgrades occur on the web, not in-app)
- Health or fitness data
- Messages, photos, or audio files beyond what the user explicitly uploads to their own property record
- Contacts or calendar data
- Device files or app activity
- App interactions or crash logs sent to third parties

---

## Is data sold to third parties?

**No.** HomeGentic data is never sold to third parties.

---

## Notes for reviewers

- User identity is based on an ICP (Internet Computer) principal — a cryptographic pseudonym. No email or phone number is required.
- All subscription and upgrade flows redirect to `https://homegentic.app/pricing` in the device browser. No payment information is collected inside the app.
- The app uses `expo-secure-store` (iOS Keychain / Android Keystore) for session delegation storage. This data never leaves the device.
