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

  /// An index together with the function that gives a record's key in it
  /// (null leaves the record out).
  public type Keyed<R> = (Index, R -> ?Text);

  /// Fills each index from `primary` and returns them; use it to initialise
  /// a canister's transient index list.
  public func indexed<R>(primary : Map.Map<Text, R>, ixs : [Keyed<R>]) : [Keyed<R>] {
    for ((id, r) in Map.entries(primary)) { file(ixs, id, r) };
    ixs
  };

  /// Stores `r` under `id` in `primary` and keeps every index in step,
  /// re-filing the record if an indexed field changed.
  /// Indexes whose key didn't change are left untouched, so it is safe to
  /// put records while iterating an index over a key they keep.
  public func put<R>(primary : Map.Map<Text, R>, ixs : [Keyed<R>], id : Text, r : R) {
    let old = Map.get(primary, Text.compare, id);
    Map.add(primary, Text.compare, id, r);
    for ((ix, keyOf) in ixs.vals()) {
      let newKey = keyOf(r);
      let oldKey = switch (old) { case (?o) { keyOf(o) }; case null { null } };
      if (oldKey != newKey) {
        switch (oldKey) { case (?k) { remove(ix, k, id) }; case null {} };
        switch (newKey) { case (?k) { add(ix, k, id) }; case null {} };
      };
    };
  };

  /// Removes `id` from `primary` and from every index.
  public func delete<R>(primary : Map.Map<Text, R>, ixs : [Keyed<R>], id : Text) {
    switch (Map.get(primary, Text.compare, id)) {
      case (?old) { unfile(ixs, id, old); Map.remove(primary, Text.compare, id) };
      case null   {};
    };
  };

  func file<R>(ixs : [Keyed<R>], id : Text, r : R) {
    for ((ix, keyOf) in ixs.vals()) {
      switch (keyOf(r)) { case (?k) { add(ix, k, id) }; case null {} };
    };
  };

  func unfile<R>(ixs : [Keyed<R>], id : Text, r : R) {
    for ((ix, keyOf) in ixs.vals()) {
      switch (keyOf(r)) { case (?k) { remove(ix, k, id) }; case null {} };
    };
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
