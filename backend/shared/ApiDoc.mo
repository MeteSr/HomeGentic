/// Text shared by every canister's `getApiDoc()` (service-discoverability
/// skill, Layer 3). An AI assistant reads it through ICP MCP to learn what the
/// Candid types can't say. Under the ICP MCP App Operator Terms (section 6) it
/// must describe what each method really does, name every fee and every step
/// that can't be undone, and contain no instructions to the assistant. Keep
/// each canister's text in step with its methods.
module {
  /// The rules that hold for every HomeGentic canister.
  public func common() : Text {
    "## Rules for every HomeGentic canister\n\n" #
    "HomeGentic keeps a verified maintenance record for a home: properties, jobs, schedules, bills, contractors, quotes and shareable reports. Each canister serves one part of it.\n\n" #
    "- **Who you act as:** calls run as the signed-in user's Internet Identity principal for HomeGentic, the same principal they have in the web app, so they see only their own records. Anonymous callers can make query calls, but every update call from an anonymous principal is refused.\n" #
    "- **Reads that are update calls:** some reads (named `get...` but not marked `query` in the Candid) are update calls, because they check access with another canister. A read-only (Questions only) session can't make them. Where a canister has a batch `composite query` alternative, it is named below.\n" #
    "- **Money:** amounts are whole US cents in a `Nat` (`amount = 12500` is $125.00) unless a field name says otherwise.\n" #
    "- **Time:** `Time.Time` / `Int` timestamps are nanoseconds since the Unix epoch. Fields documented as dates are `YYYY-MM-DD` text.\n" #
    "- **Ids:** records are identified by `Text` ids returned when they are created. Pass them back exactly.\n" #
    "- **Errors:** results are `variant { ok; err }`. `#NotAuthorized` and `#NotFound` won't change on retry. `#InvalidInput` carries a message for the user (also used for daily and per-tier limits, which some canisters report as their own `#TierLimitReached`). `#RateLimited` means the caller made too many update calls this minute, so wait a minute. `#Paused` means an administrator paused writes. `#Unavailable` means a canister this one depends on didn't answer, so retry later.\n" #
    "- **Plan limits:** Free accounts have lower limits than Pro (for example 1 property and 3 open quote requests on Free, 20 properties and unlimited quote requests on Pro). A call over the limit returns an error explaining it. Subscriptions are managed in the web app, not through these canisters.\n" #
    "- **Admin methods:** methods for administrators, relays and other HomeGentic canisters (`pause`, `addAdmin`, `set...CanisterId`, `relay...`, `add...Relay`, `addTrustedCanister`, `addNotifier` and similar) return `#NotAuthorized` for ordinary users.\n" #
    "- **deleteMyData:** every canister has `deleteMyData()`. It permanently deletes all of the caller's data in that canister and cannot be undone. It is part of account deletion, which the user normally does from Settings in the web app.\n" #
    "- **Not here:** photos and documents, AI chat, payments, and sign-in live outside these canisters and can't be reached through them.\n\n"
  };
};
