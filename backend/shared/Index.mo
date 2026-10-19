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

  public func empty() : Index = Map.empty();

  public func add(ix : Index, key : Text, id : Text) {
    switch (ix.get(key)) {
      case (?ids) { ids.add(id) };
      case null {
        let ids = Set.empty<Text>();
        ids.add(id);
        ix.add(key, ids);
      };
    };
  };

  public func remove(ix : Index, key : Text, id : Text) {
    switch (ix.get(key)) {
      case (?ids) {
        ids.remove(id);
        if (ids.isEmpty()) { ix.remove(key) };
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
    switch (ix.get(key)) {
      case (?ids) { ids.values() };
      case null   { Iter.empty<Text>() };
    }
  };

  public func count(ix : Index, key : Text) : Nat {
    switch (ix.get(key)) {
      case (?ids) { ids.size() };
      case null   { 0 };
    }
  };

  /// The records filed under `key`, looked up in the primary map.
  public func records<R>(ix : Index, key : Text, primary : Map.Map<Text, R>) : Iter.Iter<R> {
    ids(ix, key).filterMap(func(id) { primary.get(id) })
  };

  /// An index together with the function that gives a record's key in it
  /// (null leaves the record out).
  public type Keyed<R> = (Index, R -> ?Text);

  /// Fills each index from `primary` and returns them; use it to initialise
  /// a canister's transient index list.
  public func indexed<R>(primary : Map.Map<Text, R>, ixs : [Keyed<R>]) : [Keyed<R>] {
    for ((id, r) in primary.entries()) { file(ixs, id, r) };
    ixs
  };

  /// Stores `r` under `id` in `primary` and keeps every index in step,
  /// re-filing the record if an indexed field changed.
  /// Indexes whose key didn't change are left untouched, so it is safe to
  /// put records while iterating an index over a key they keep.
  public func put<R>(primary : Map.Map<Text, R>, ixs : [Keyed<R>], id : Text, r : R) {
    let old = primary.get(id);
    primary.add(id, r);
    for ((ix, keyOf) in ixs.values()) {
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
    switch (primary.get(id)) {
      case (?old) { unfile(ixs, id, old); primary.remove(id) };
      case null   {};
    };
  };

  func file<R>(ixs : [Keyed<R>], id : Text, r : R) {
    for ((ix, keyOf) in ixs.values()) {
      switch (keyOf(r)) { case (?k) { add(ix, k, id) }; case null {} };
    };
  };

  func unfile<R>(ixs : [Keyed<R>], id : Text, r : R) {
    for ((ix, keyOf) in ixs.values()) {
      switch (keyOf(r)) { case (?k) { remove(ix, k, id) }; case null {} };
    };
  };

  /// Builds an index over `primary`; `keyOf` returns the key to file each record
  /// under, or null to leave it out.
  public func build<R>(primary : Map.Map<Text, R>, keyOf : R -> ?Text) : Index {
    let ix = empty();
    for ((id, r) in primary.entries()) {
      switch (keyOf(r)) { case (?k) { add(ix, k, id) }; case null {} };
    };
    ix
  };
};
