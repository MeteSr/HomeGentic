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
    "- `getOwnershipHistory(propertyId)` (query): past owner transfers.\n" #
    "- `getInsurancePolicy(propertyId)` (query): the home insurance policy details the household saved (carrier, policy number, renewal date as YYYY-MM-DD, Coverage A and hurricane deductible), or null. HomeGentic doesn't check them with the insurer.\n" #
    "- `getInsuranceClaims(propertyId)` (query): the household's records of insurance claims on the home, newest date of loss first, each with its dated log (`log`: date, note). These are the household's own notes; HomeGentic doesn't file or track anything with the insurer.\n" #
    "- `getPulseInsurance(owner)` (query): only for HomeGentic's notification relay, which emails the renewal reminder. Any other caller gets `#NotAuthorized`.\n\n" #
    "## Changing\n" #
    "- `registerProperty(args)`: adds a home. `state` is a 2-letter code, `zipCode` 5 digits or ZIP+4, `squareFeet` 1 to 100,000. Free accounts can register 1 property and Pro accounts 20. Registering an address you already own returns that home unchanged and creates nothing. If another user has verified that address, the call is refused with `#DuplicateAddress`. If another user has claimed it without verifying, `#AddressConflict` gives the end of a 7-day window for resolving it.\n" #
    "- `submitVerification(propertyId, method, documentHash, nameOnDoc)`: asks HomeGentic to verify ownership from a document the user uploaded in the web app. It moves the property to `#PendingReview`. A HomeGentic administrator approves it.\n" #
    "- `createRoom`, `updateRoom`, `deleteRoom`, `addFixture`, `updateFixture`, `removeFixture`: edit rooms and fixtures. `deleteRoom` and `removeFixture` can't be undone.\n" #
    "- `setInsurancePolicy(propertyId, policy)`: saves the home's insurance policy details, or clears them with null. Needs write access to the home (owner, co-owner or manager). `carrier` is required (up to 100 characters), `policyNumber` up to 60, `renewalDate` a real date written YYYY-MM-DD. `coverageACents` and a dollar hurricane deductible are in cents; a percent hurricane deductible is a whole percent of Coverage A, 1 to 25. This only records what the policy says: it doesn't contact the insurer or change the policy. The details are removed when the home is transferred to a new owner.\n" #
    "- `createInsuranceClaim(propertyId, input)` / `updateInsuranceClaim(claimId, input)`: start or edit a claim record: `title` (required, up to 100 characters), `dateOfLoss` (YYYY-MM-DD), `cause`, `description`, `claimNumber`, `adjusterName`, `adjusterContact`, `status` (`#Open` or `#Closed`). Needs write access to the home; at most 50 claims per home. This doesn't file a claim or contact the insurer.\n" #
    "- `addInsuranceClaimLog(claimId, date, note)`: adds a dated line to the claim's log (a call, a visit, a letter). Entries can't be edited or removed one by one.\n" #
    "- `deleteInsuranceClaim(claimId)`: deletes a claim record and its log. It can't be undone. Claim records are also removed when the home is transferred.\n" #
    "- `inviteManager(...)` creates an invite link that gives another person access to the property. `removeManager` and `updateManagerRole` change that access.\n" #
    "- Ownership transfers (`initiateTransfer`, `claimTransfer`, `cancelTransfer`) hand the home and its record to a new owner. A transfer can't be reversed once claimed.\n\n" #
    Shared.common()
  };
};
