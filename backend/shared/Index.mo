/// Secondary index: key → set of record ids.
///
/// Canisters keep each entity in one `Map<Text, Record>` keyed by its id. An
/// `Index` answers "all records for this property / owner / job" without
/// scanning that map. Indexes are declared `transient` and rebuilt from the
/// primary map when the actor initialises (on install and on every upgrade),
/// so they never become stable state and can be added or changed freely.
///
/// Ids come back in ascending `Text` order, the same order a scan of the
/// primary map produced, so switching a scan to an index keeps result order.

import Iter "mo:core/Iter";
import Map  "mo:core/Map";
import Set  "mo:core/Set";
import Text "mo:core/Text";

module {
  public type Index = Map.Map<Text, Set.Set<Text>>;

  public func empty() : Index = Map.empty<Text, Set.Set<Text>>();

  public func add(ix : Index, key : Text, id : Text) {
    switch (Map.get(ix, Text.compare, key)) {
      case (?ids) { Set.add(ids, Text.compare, id) };
      case null {
        let ids = Set.empty<Text>();
        Set.add(ids, Text.compare, id);
        Map.add(ix, Text.compare, key, ids);
      };
    };
  };

  public func remove(ix : Index, key : Text, id : Text) {
    switch (Map.get(ix, Text.compare, key)) {
      case (?ids) {
        Set.remove(ids, Text.compare, id);
        if (Set.isEmpty(ids)) { Map.remove(ix, Text.compare, key) };
      };
      case null {};
    };
  };

  /// Re-file `id` when a record's indexed field changes from `oldKey` to `newKey`.
  public func move(ix : Index, oldKey : Text, newKey : Text, id : Text) {
    if (oldKey != newKey) {
      remove(ix, oldKey, id);
      add(ix, newKey, id);
    };
  };

  public func ids(ix : Index, key : Text) : Iter.Iter<Text> {
    switch (Map.get(ix, Text.compare, key)) {
      case (?ids) { Set.values(ids) };
      case null   { Iter.empty<Text>() };
    }
  };

  public func count(ix : Index, key : Text) : Nat {
    switch (Map.get(ix, Text.compare, key)) {
      case (?ids) { Set.size(ids) };
      case null   { 0 };
    }
  };

  /// The records filed under `key`, looked up in the primary map.
  public func records<R>(ix : Index, key : Text, primary : Map.Map<Text, R>) : Iter.Iter<R> {
    Iter.filterMap<Text, R>(ids(ix, key), func(id) { Map.get(primary, Text.compare, id) })
  };

  /// Builds an index over `primary`; `keyOf` returns the key to file each record
  /// under, or null to leave it out.
  public func build<R>(primary : Map.Map<Text, R>, keyOf : R -> ?Text) : Index {
    let ix = empty();
    for ((id, r) in Map.entries(primary)) {
      switch (keyOf(r)) { case (?k) { add(ix, k, id) }; case null {} };
    };
    ix
  };
};
