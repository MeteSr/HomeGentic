/// getApiDoc() text for the property canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic property canister\n\n" #
    "Holds the homes a user has registered, who may act on each one, and the rooms and fixtures inside it. Most other canisters take a `propertyId` from here.\n\n" #
    "## Reading\n" #
    "- `getMyProperties()` (query): the caller's own properties. Start here to get `propertyId`s.\n" #
    "- `getMyManagedProperties()` (query): properties the caller manages for someone else, with their role.\n" #
    "- `getProperty(id)` (query): one property, if the caller owns or manages it.\n" #
    "- `getRoomsByProperty(propertyId)` / `getRoom(id)` (query): rooms and the fixtures in them (appliances, model numbers, install dates).\n" #
    "- `getOwnershipHistory(propertyId)` (query): past owner transfers.\n\n" #
    "## Changing\n" #
    "- `registerProperty(args)`: adds a home. `state` is a 2-letter code, `zipCode` 5 digits or ZIP+4, `squareFeet` 1 to 100,000. Free accounts can register 1 property and Pro accounts 20. Registering an address you already own returns that home unchanged and creates nothing. If another user has verified that address, the call is refused with `#DuplicateAddress`. If another user has claimed it without verifying, `#AddressConflict` gives the end of a 7-day window for resolving it.\n" #
    "- `submitVerification(propertyId, method, documentHash, nameOnDoc)`: asks HomeGentic to verify ownership from a document the user uploaded in the web app. It moves the property to `#PendingReview`. A HomeGentic administrator approves it.\n" #
    "- `createRoom`, `updateRoom`, `deleteRoom`, `addFixture`, `updateFixture`, `removeFixture`: edit rooms and fixtures. `deleteRoom` and `removeFixture` can't be undone.\n" #
    "- `inviteManager(...)` creates an invite link that gives another person access to the property. `removeManager` and `updateManagerRole` change that access.\n" #
    "- Ownership transfers (`initiateTransfer`, `claimTransfer`, `cancelTransfer`) hand the home and its record to a new owner. A transfer can't be reversed once claimed.\n\n" #
    Shared.common()
  };
};
