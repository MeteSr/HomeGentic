/// getApiDoc() text for the job canister (see backend/shared/ApiDoc.mo).
import Shared "../shared/ApiDoc";

module {
  public func text() : Text {
    "# HomeGentic job canister\n\n" #
    "The maintenance record: each job is work done on a property (repairs, servicing, upgrades), by a contractor or by the homeowner (DIY).\n\n" #
    "## Reading\n" #
    "- `getJobsForProperties(propertyIds)` (composite query): all jobs for the given properties the caller may see. Works in read-only sessions.\n" #
    "- `getJobsForProperty(propertyId)`: the same for one property, but it is an update call.\n" #
    "- `getJob(jobId)` (query): one job.\n" #
    "- `getJobsPendingMySignature()` (query): jobs waiting for the caller to sign. `getPendingProposals()` (query): jobs a contractor proposed for the caller's homes.\n" #
    "- `getJobCostCategories(propertyIds)` (composite query): the owner's improvement-or-repair marks, as (jobId, #Improvement or #Repair) pairs, for the given properties the caller may see. Jobs the owner hasn't marked are left out.\n" #
    "- `getJobCloseouts(propertyIds)` (composite query): for each job with any, its permit status (`#Open`, `#Closed` or `#Expired`, as the household recorded it) and its close-out papers: a final lien waiver or a Notice of Commencement, each a document id in the home's document vault, with who filed it. A recorded status is the household's own note, not a check with the permit office, and a waiver on file doesn't show that the home is free of liens: only a title search does.\n\n" #
    "## Changing\n" #
    "- `createJob(propertyId, title, serviceType, description, contractorName, amount, completedDate, permitNumber, warrantyMonths, isDiy, sourceQuoteId)`: records a job. `amount` is in cents, at most 100,000,000 ($1,000,000). It must be above 0, with a `contractorName`, unless `isDiy` is true. `completedDate` is in nanoseconds and can't be in the future. For work with no service type of its own, use `Other` with the title set to one of Inspection, Appliance Repair, Garage Door, Septic, Well & Water Treatment, Chimney, Generator, Tree Service, Security & Alarm, Mold & Radon; the app and reports show that title as the kind of work.\n" #
    "- `updateJob(...)` and `updateJobStatus(jobId, status)`: edit a job that isn't verified yet. A verified job returns `#AlreadyVerified`.\n" #
    "- `verifyJob(jobId)`: signs the job as the caller. A contractor job is verified once both the homeowner and the linked contractor have signed. A DIY job needs only the homeowner. Once verified, a job is locked and can't be edited or unsigned. Verified jobs count toward the home's score and appear on reports.\n" #
    "- `linkContractor(jobId, contractor)` attaches a contractor's HomeGentic account to a job so they can sign it.\n" #
    "- `createInviteToken(...)` makes a link the homeowner sends to a contractor so they can sign.\n" #
    "- `setJobCostCategory(jobId, category)`: marks a job as `#Improvement` or `#Repair` in the owner's improvements record, or clears the mark with null. Needs write access to the home (owner, co-owner or manager). Works on verified jobs too, since the mark isn't part of what was signed. It is the owner's own note for their tax preparer, not a tax determination, and it can be changed at any time.\n" #
    "- `setPermitStatus(jobId, status)`: records a job's permit as `#Open`, `#Closed` or `#Expired`, or clears it with null. Needs write access to the home. Works on verified jobs.\n" #
    "- `addJobPaper(jobId, kind, photoId)`: files a vault document on a job as its `#FinalLienWaiver` or `#NoticeOfCommencement`; filing the same document again replaces it, and a job holds up to 10. Needs write access to the home, except that the contractor who signed the job may file its final lien waiver. A DIY job takes no lien waiver. `removeJobPaper(jobId, photoId)` takes it off the job again (the document stays in the vault).\n" #
    "- `approveJobProposal(jobId)` / `rejectJobProposal(jobId)` accept or decline a job a contractor proposed. Rejecting deletes the proposal.\n\n" #
    "## Calendar link\n" #
    "A private subscribe link the owner can add to a calendar app. It holds the dated events the app publishes: maintenance task dates, warranty end dates and recurring service visits. Anyone with the link can read those events, so treat it like a password. It costs nothing.\n" #
    "- `getMyCalendarFeed()` (query): the caller's link token, event count and last update, or null when the link is off.\n" #
    "- `enableMyCalendarFeed()`: turns the link on and returns its token (the same one if it's already on). The app turns the token into the link.\n" #
    "- `resetMyCalendarFeed()`: replaces the token. The old link stops working at once and can't be brought back; calendars subscribed to it stop updating.\n" #
    "- `disableMyCalendarFeed()`: turns the link off and deletes the published events. This can't be undone; turning it on again makes a new link.\n" #
    "- `publishMyCalendarEvents(version, events)`: replaces the events behind the caller's link, at most 100, each with an id, a YYYY-MM-DD date, a title, a description and an optional repeat rule. `#NotFound` when the link is off.\n" #
    "- `getCalendarFeed(token)` (query): the events behind a link, for the server that writes the calendar file. Null for an unknown token.\n\n" #
    Shared.common()
  };
};
