/// Test double for the ICP ledger's ICRC-2 transfer_from, installed at the
/// ledger's mainnet id (ryjl3-tyaaa-aaaaa-aaaba-cai) in PocketIC tests.
/// `setMode` picks the next answers: "ok", "insufficient_allowance",
/// "insufficient_funds" or "trap" (the call is rejected).
import Array "mo:core/Array";

persistent actor {
  type Account = { owner : Principal; subaccount : ?Blob };
  type TransferFromArgs = {
    spender_subaccount : ?Blob;
    from : Account;
    to : Account;
    amount : Nat;
    fee : ?Nat;
    memo : ?Blob;
    created_at_time : ?Nat64;
  };
  type TransferFromError = {
    #BadFee : { expected_fee : Nat };
    #BadBurn : { min_burn_amount : Nat };
    #InsufficientFunds : { balance : Nat };
    #InsufficientAllowance : { allowance : Nat };
    #TooOld;
    #CreatedInFuture : { ledger_time : Nat64 };
    #Duplicate : { duplicate_of : Nat };
    #TemporarilyUnavailable;
    #GenericError : { error_code : Nat; message : Text };
  };
  public type Call = { caller : Principal; from : Principal; to : Principal; amount : Nat; fee : ?Nat };

  var mode : Text = "ok";
  var calls : [Call] = [];

  public func setMode(m : Text) : async () { mode := m };
  public query func getCalls() : async [Call] { calls };

  public shared (msg) func icrc2_transfer_from(a : TransferFromArgs) : async { #Ok : Nat; #Err : TransferFromError } {
    let call : Call = { caller = msg.caller; from = a.from.owner; to = a.to.owner; amount = a.amount; fee = a.fee };
    // A trap rolls this call back, so a rejected transfer leaves no record.
    calls := calls.concat([call]);
    if (mode == "trap") { assert false };
    if (mode == "insufficient_allowance") return #Err(#InsufficientAllowance { allowance = 1 });
    if (mode == "insufficient_funds") return #Err(#InsufficientFunds { balance = 2 });
    #Ok(1)
  };
};
