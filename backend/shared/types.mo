module {
  public type Result<T, E> = { #ok: T; #err: E };

  public type UserRole = {
    #Homeowner;
    #Contractor;
    #Realtor;
  };

  public type SubscriptionTier = {
    #Free;
    #Pro;
    #Premium;
    #ContractorPro;
  };

  public type VerificationLevel = {
    #Unverified;
    #Basic;
    #Premium;
  };

  public type CommonError = {
    #NotFound;
    #NotAuthorized;
    #AlreadyExists;
    #Paused;
    #InvalidInput: Text;
    #QuotaExceeded;
  };
}
