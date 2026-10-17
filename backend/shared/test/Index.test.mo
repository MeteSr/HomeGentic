// Unit tests for shared/Index.mo. Run with scripts/ci/test-motoko-units.sh.
import Index "../Index";
import Iter  "mo:core/Iter";
import Map   "mo:core/Map";
import Text  "mo:core/Text";
import Debug "mo:core/Debug";
import Nat   "mo:core/Nat";

type Rec = { owner : Text; job : ?Text };

func ids(ix : Index.Index, key : Text) : [Text] = Iter.toArray(Index.ids(ix, key));

// add / remove / count; empty sets disappear
do {
  let ix = Index.empty();
  Index.add(ix, "p1", "b");
  Index.add(ix, "p1", "a");
  Index.add(ix, "p1", "a");                       // duplicate is a no-op
  assert ids(ix, "p1") == ["a", "b"];             // ascending id order
  assert Index.count(ix, "p1") == 2;
  assert Index.count(ix, "nope") == 0;
  assert ids(ix, "nope") == [];
  Index.remove(ix, "p1", "a");
  Index.remove(ix, "p1", "missing");              // unknown id is a no-op
  Index.remove(ix, "other", "b");                 // unknown key is a no-op
  assert ids(ix, "p1") == ["b"];
  Index.remove(ix, "p1", "b");
  assert Map.size(ix) == 0;                       // empty key is dropped
};

// move re-files only when the key changes
do {
  let ix = Index.empty();
  Index.add(ix, "old", "x");
  Index.move(ix, "old", "old", "x");
  assert ids(ix, "old") == ["x"];
  Index.move(ix, "old", "new", "x");
  assert ids(ix, "old") == [] and ids(ix, "new") == ["x"];
};

// ids sort as Text, so "EVT_10" comes before "EVT_9"
do {
  let ix = Index.empty();
  for (id in ["EVT_9", "EVT_10", "EVT_1"].vals()) { Index.add(ix, "k", id) };
  assert ids(ix, "k") == ["EVT_1", "EVT_10", "EVT_9"];
};

// put / delete keep several indexes in step with the primary map
do {
  let primary = Map.empty<Text, Rec>();
  let byOwner = Index.empty();
  let byJob   = Index.empty();
  let ixs = Index.indexed<Rec>(primary, [
    (byOwner, func(r) { ?r.owner }),
    (byJob,   func(r) { r.job }),                 // null leaves the record out
  ]);

  Index.put(primary, ixs, "r1", { owner = "alice"; job = ?"j1" });
  Index.put(primary, ixs, "r2", { owner = "alice"; job = null });
  Index.put(primary, ixs, "r3", { owner = "bob";   job = ?"j1" });
  assert ids(byOwner, "alice") == ["r1", "r2"];
  assert ids(byJob, "j1") == ["r1", "r3"];
  assert Index.count(byJob, "j1") == 2;

  // records() resolves ids through the primary map
  let owners = Iter.toArray(Iter.map<Rec, Text>(Index.records(byJob, "j1", primary), func(r) { r.owner }));
  assert owners == ["alice", "bob"];

  // changing an indexed field moves the record; others stay put
  Index.put(primary, ixs, "r1", { owner = "bob"; job = ?"j1" });
  assert ids(byOwner, "alice") == ["r2"];
  assert ids(byOwner, "bob") == ["r1", "r3"];
  assert ids(byJob, "j1") == ["r1", "r3"];

  // a key becoming null removes it from that index
  Index.put(primary, ixs, "r3", { owner = "bob"; job = null });
  assert ids(byJob, "j1") == ["r1"];

  // delete removes it from the primary map and every index
  Index.delete(primary, ixs, "r1");
  Index.delete(primary, ixs, "missing");
  assert Map.get(primary, Text.compare, "r1") == null;
  assert ids(byOwner, "bob") == ["r3"];
  assert ids(byJob, "j1") == [];

  // a fresh index list over the same map rebuilds the same contents
  let rebuilt = Index.empty();
  ignore Index.indexed<Rec>(primary, [(rebuilt, func(r) { ?r.owner })]);
  assert ids(rebuilt, "alice") == ["r2"] and ids(rebuilt, "bob") == ["r3"];

  // build() gives the same result as indexed()
  let built = Index.build<Rec>(primary, func(r) { ?r.owner });
  assert ids(built, "alice") == ids(rebuilt, "alice");
};

// put is safe while iterating the index for a key the record keeps
do {
  let primary = Map.empty<Text, Rec>();
  let byJob = Index.empty();
  let ixs = Index.indexed<Rec>(primary, [(byJob, func(r) { r.job })]);
  for (i in Nat.range(0, 50)) {
    Index.put(primary, ixs, "q" # debug_show i, { owner = "a"; job = ?"j" });
  };
  for (id in Index.ids(byJob, "j")) {
    Index.put(primary, ixs, id, { owner = "b"; job = ?"j" });
  };
  assert Index.count(byJob, "j") == 50;
};

Debug.print("Index tests passed");
