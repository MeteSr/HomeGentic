/// Error cases every canister spells the same way.
///
/// Each canister keeps its own `Error` variant (with its domain cases, such as
/// `#DuplicateAddress` or `#Expired`) and includes these tags with exactly
/// these names and payloads, so clients can treat them alike:
///
///   #NotAuthorized       the caller may not do this (not signed in, not the
///                        owner, not an admin). Don't retry.
///   #NotFound            the thing asked for doesn't exist. Don't retry.
///   #InvalidInput : Text the caller sent something the canister won't accept;
///                        the text says what, for a person. Don't retry as is.
///   #Paused              an admin paused writes on this canister. Retry later
///                        (minutes to hours).
///   #RateLimited         this caller made too many calls in the current
///                        one-minute window. Retry after a minute.
///   #Unavailable : Text  a temporary failure on our side: a canister this one
///                        depends on isn't wired or didn't answer. The text
///                        says what, for a person. Retry later.
///
/// A daily or per-property cap the user has reached ("limit reached for
/// today") is `#InvalidInput` with a message, not `#RateLimited`: waiting a
/// minute doesn't help.
///
/// Errors are return values, never stored, so adding a tag here changes a
/// canister's Candid interface but not its stable types. A canister that calls
/// another declares the callee's result type; when a callee gains a tag, the
/// caller's declaration must gain it too (`scripts/ci/check-canister-calls.sh`
/// fails until it does).

module {
  /// The cases above that every canister's `Error` includes. A canister's own
  /// `Error` is a supertype of this, so a `Common` value can be returned as it.
  public type Common = {
    #NotAuthorized;
    #NotFound;
    #InvalidInput : Text;
    #Paused;
    #RateLimited;
    #Unavailable : Text;
  };
};
