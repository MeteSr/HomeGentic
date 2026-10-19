// Unit tests for shared/Admin.mo. Run with scripts/ci/test-motoko-units.sh.
// canSetNonce isn't covered: Principal.isController needs a canister context.
import Admin     "../Admin";
import Principal "mo:core/Principal";

let a = Principal.fromText("aaaaa-aa");
let b = Principal.fromText("2vxsx-fae");

// allow-lists: add is idempotent, remove drops every copy
do {
  assert not Admin.contains([], a);
  let l = Admin.add(Admin.add([], a), a);
  assert l.size() == 1 and Admin.contains(l, a);
  let l2 = Admin.add(l, b);
  assert l2.size() == 2;
  assert Admin.remove(l2, a) == [b];
  assert Admin.remove([a, a], a) == [];
};

// pause: untimed holds, timed lapses at the expiry
do {
  assert not Admin.pausedNow(false, null, 0);
  assert not Admin.pausedNow(false, ?100, 0);
  assert Admin.pausedNow(true, null, 1_000_000);
  assert Admin.pausedNow(true, ?100, 99);
  assert not Admin.pausedNow(true, ?100, 100);
  assert Admin.pauseExpiry(null, 5) == null;
  assert Admin.pauseExpiry(?2, 5) == ?2_000_000_005;
};

// bootstrap: nonce before the first admin, existing admin after
do {
  assert not Admin.nonceMatches(null, "");
  assert not Admin.nonceMatches(?"n", "m");
  assert Admin.nonceMatches(?"n", "n");
  assert Admin.authorizeAdd(false, false, ?"n", "n") == #bootstrap;
  assert Admin.authorizeAdd(false, true,  ?"n", "x") == #denied;   // being on the list doesn't skip the nonce
  assert Admin.authorizeAdd(false, false, null, "")  == #denied;
  assert Admin.authorizeAdd(true,  true,  null, "")  == #admin;
  assert Admin.authorizeAdd(true,  false, ?"n", "n") == #denied;   // a leftover nonce is useless once bootstrapped
};
