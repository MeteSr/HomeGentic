/// getApiDoc() text for the contractor canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic contractor canister\n\n" #
    "Contractor profiles, trust scores, reviews and portfolios. Homeowners use it to find and review contractors. Contractors use it to manage their own profile.\n\n" #
    "## Reading\n" #
    "- `getBySpecialty(serviceType)` and `getByZip(zipCode)` (query): find contractors. `getPage(from, limit)` (query): page through all of them.\n" #
    "- `getContractor(principal)` (query), `getReviewsForContractor(principal)` (query), `getPortfolio(principal)` (query), `getCredentials(principal)` (query) and `getLicenseCheck(principal)` (query): details for one contractor. The trust score combines verified jobs, reviews and license checks.\n" #
    "- `getContractorEmail(principal)` (composite query): returns the email only to a homeowner who has worked with or received a bid from that contractor. Otherwise it returns `#NotAuthorized`.\n" #
    "- `getMyProfile()` (query): the caller's own profile if they are a contractor.\n\n" #
    "## Changing\n" #
    "- `submitReview(contractor, rating, comment, jobId)`: posts a 1-to-5 review of a contractor for a job. Reviews are visible to everyone and can't be edited afterwards. Only the homeowner of that job can review a contractor who worked on it, one review per job, and up to 10 reviews a day.\n" #
    "- `register(args)`, `updateProfile(args)`, `setPortfolio(entries)`, `setProfilePrivacy(p)`, `updateNotificationPrefs(args)`: for contractors managing their own profile.\n\n" #
    Shared.common()
  };
};
