/**
 * HomeFax Room Canister
 *
 * Room-by-room digital twin for a property.
 * Each room tracks floor type, paint details, free-form notes,
 * and a fixture/appliance inventory with warranty data.
 *
 * Design intent:
 *   - Rooms are owned by the Principal who created them.
 *   - Fixtures are stored inline per room (small, bounded lists).
 *   - propertyId is a Text key matching the property canister's Nat IDs.
 *   - All text fields are size-capped to prevent abuse.
 */

import Array     "mo:core/Array";
import Map       "mo:core/Map";
import Iter      "mo:core/Iter";
import Nat       "mo:core/Nat";
import Option    "mo:core/Option";
import Principal "mo:core/Principal";
import Result    "mo:core/Result";
import Text      "mo:core/Text";
import Time      "mo:core/Time";

persistent actor Room {

  // ─── Types ──────────────────────────────────────────────────────────────────

  /// A single appliance or fixture installed in a room.
  public type Fixture = {
    id:             Text;     // "FIX_n"
    brand:          Text;
    model:          Text;
    serialNumber:   Text;
    installedDate:  Text;     // YYYY-MM-DD or ""
    warrantyExpiry: Text;     // YYYY-MM-DD or ""
    notes:          Text;
  };

  /// A room within a property.
  public type RoomRecord = {
    id:          Text;     // "ROOM_n"
    propertyId:  Text;
    owner:       Principal;
    name:        Text;
    floorType:   Text;
    paintColor:  Text;
    paintBrand:  Text;
    paintCode:   Text;
    notes:       Text;
    fixtures:    [Fixture];
    createdAt:   Time.Time;
    updatedAt:   Time.Time;
  };

  public type CreateRoomArgs = {
    propertyId: Text;
    name:       Text;
    floorType:  Text;
    paintColor: Text;
    paintBrand: Text;
    paintCode:  Text;
    notes:      Text;
  };

  public type UpdateRoomArgs = {
    name:       Text;
    floorType:  Text;
    paintColor: Text;
    paintBrand: Text;
    paintCode:  Text;
    notes:      Text;
  };

  public type AddFixtureArgs = {
    brand:          Text;
    model:          Text;
    serialNumber:   Text;
    installedDate:  Text;
    warrantyExpiry: Text;
    notes:          Text;
  };

  public type Error = {
    #NotFound;
    #Unauthorized;
    #InvalidInput : Text;
    #Paused;
  };

  public type Metrics = {
    totalRooms:    Nat;
    totalFixtures: Nat;
    isPaused:      Bool;
  };

  // ─── Stable State ────────────────────────────────────────────────────────────

  private var roomCounter    : Nat         = 0;
  private var fixtureCounter : Nat         = 0;
  private var isPaused       : Bool        = false;
  private var pauseExpiryNs  : ?Int        = null;
  private var admins         : [Principal] = [];
  private var adminInitialized : Bool      = false;
  private var roomEntries    : [(Text, RoomRecord)] = [];

  // ─── Transient State ─────────────────────────────────────────────────────────

  private transient var rooms = Map.fromIter<Text, RoomRecord>(
    roomEntries.vals(), Text.compare
  );

  // ─── Upgrade Hooks ───────────────────────────────────────────────────────────

  system func preupgrade() {
    roomEntries := Iter.toArray(Map.entries(rooms));
  };

  system func postupgrade() {
    roomEntries := [];
  };

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private func isAdmin(caller: Principal) : Bool {
    Option.isSome(Array.find<Principal>(admins, func(a) { a == caller }))
  };

  private func requireActive() : Result.Result<(), Error> {
    if (not isPaused) return #ok(());
    switch (pauseExpiryNs) {
      case (?expiry) { if (Time.now() >= expiry) return #ok(()) };
      case null {};
    };
    #err(#Paused)
  };

  private func nextRoomId() : Text {
    roomCounter += 1;
    "ROOM_" # Nat.toText(roomCounter)
  };

  private func nextFixtureId() : Text {
    fixtureCounter += 1;
    "FIX_" # Nat.toText(fixtureCounter)
  };

  // ─── Admin Controls ───────────────────────────────────────────────────────────

  public shared(msg) func addAdmin(newAdmin: Principal) : async Result.Result<(), Error> {
    if (adminInitialized and not isAdmin(msg.caller)) return #err(#Unauthorized);
    admins := Array.append(admins, [newAdmin]);
    adminInitialized := true;
    #ok(())
  };

  public shared(msg) func pause(durationSeconds: ?Nat) : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := true;
    pauseExpiryNs := switch (durationSeconds) {
      case null    { null };
      case (?secs) { ?(Time.now() + secs * 1_000_000_000) };
    };
    #ok(())
  };

  public shared(msg) func unpause() : async Result.Result<(), Error> {
    if (not isAdmin(msg.caller)) return #err(#Unauthorized);
    isPaused := false;
    pauseExpiryNs := null;
    #ok(())
  };

  // ─── Room CRUD ────────────────────────────────────────────────────────────────

  /// Create a new room for a property. Caller becomes the owner.
  public shared(msg) func createRoom(args: CreateRoomArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    if (Text.size(args.propertyId) == 0)  return #err(#InvalidInput("propertyId cannot be empty"));
    if (Text.size(args.name)       == 0)  return #err(#InvalidInput("name cannot be empty"));
    if (Text.size(args.name)       > 100) return #err(#InvalidInput("name exceeds 100 characters"));
    if (Text.size(args.floorType)  > 100) return #err(#InvalidInput("floorType exceeds 100 characters"));
    if (Text.size(args.paintColor) > 100) return #err(#InvalidInput("paintColor exceeds 100 characters"));
    if (Text.size(args.paintBrand) > 100) return #err(#InvalidInput("paintBrand exceeds 100 characters"));
    if (Text.size(args.paintCode)  > 50)  return #err(#InvalidInput("paintCode exceeds 50 characters"));
    if (Text.size(args.notes)      > 2000) return #err(#InvalidInput("notes exceed 2000 characters"));

    let now = Time.now();
    let room : RoomRecord = {
      id         = nextRoomId();
      propertyId = args.propertyId;
      owner      = msg.caller;
      name       = args.name;
      floorType  = args.floorType;
      paintColor = args.paintColor;
      paintBrand = args.paintBrand;
      paintCode  = args.paintCode;
      notes      = args.notes;
      fixtures   = [];
      createdAt  = now;
      updatedAt  = now;
    };

    Map.add(rooms, Text.compare, room.id, room);
    #ok(room)
  };

  /// Fetch a single room by ID.
  public query func getRoom(id: Text) : async Result.Result<RoomRecord, Error> {
    switch (Map.get(rooms, Text.compare, id)) {
      case null  { #err(#NotFound) };
      case (?r)  { #ok(r) };
    }
  };

  /// Fetch all rooms for a property.
  public query func getRoomsByProperty(propertyId: Text) : async [RoomRecord] {
    Iter.toArray(
      Iter.filter(Map.values(rooms), func(r: RoomRecord) : Bool { r.propertyId == propertyId })
    )
  };

  /// Update room metadata. Only the owner may update.
  public shared(msg) func updateRoom(id: Text, args: UpdateRoomArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, id)) {
      case null { #err(#NotFound) };
      case (?existing) {
        if (existing.owner != msg.caller) return #err(#Unauthorized);
        if (Text.size(args.name)       == 0)   return #err(#InvalidInput("name cannot be empty"));
        if (Text.size(args.name)       > 100)  return #err(#InvalidInput("name exceeds 100 characters"));
        if (Text.size(args.floorType)  > 100)  return #err(#InvalidInput("floorType exceeds 100 characters"));
        if (Text.size(args.paintColor) > 100)  return #err(#InvalidInput("paintColor exceeds 100 characters"));
        if (Text.size(args.paintBrand) > 100)  return #err(#InvalidInput("paintBrand exceeds 100 characters"));
        if (Text.size(args.paintCode)  > 50)   return #err(#InvalidInput("paintCode exceeds 50 characters"));
        if (Text.size(args.notes)      > 2000) return #err(#InvalidInput("notes exceed 2000 characters"));

        let updated : RoomRecord = {
          id         = existing.id;
          propertyId = existing.propertyId;
          owner      = existing.owner;
          name       = args.name;
          floorType  = args.floorType;
          paintColor = args.paintColor;
          paintBrand = args.paintBrand;
          paintCode  = args.paintCode;
          notes      = args.notes;
          fixtures   = existing.fixtures;
          createdAt  = existing.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, id, updated);
        #ok(updated)
      };
    }
  };

  /// Delete a room and all its fixtures. Only the owner may delete.
  public shared(msg) func deleteRoom(id: Text) : async Result.Result<(), Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, id)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#Unauthorized);
        Map.remove(rooms, Text.compare, id);
        #ok(())
      };
    }
  };

  // ─── Fixture CRUD ─────────────────────────────────────────────────────────────

  /// Add a fixture to a room. Only the room owner may add fixtures.
  public shared(msg) func addFixture(roomId: Text, args: AddFixtureArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#Unauthorized);
        if (Text.size(args.brand)          > 100)  return #err(#InvalidInput("brand exceeds 100 characters"));
        if (Text.size(args.model)          > 100)  return #err(#InvalidInput("model exceeds 100 characters"));
        if (Text.size(args.serialNumber)   > 100)  return #err(#InvalidInput("serialNumber exceeds 100 characters"));
        if (Text.size(args.installedDate)  > 20)   return #err(#InvalidInput("installedDate exceeds 20 characters"));
        if (Text.size(args.warrantyExpiry) > 20)   return #err(#InvalidInput("warrantyExpiry exceeds 20 characters"));
        if (Text.size(args.notes)          > 1000) return #err(#InvalidInput("notes exceed 1000 characters"));

        let fixture : Fixture = {
          id             = nextFixtureId();
          brand          = args.brand;
          model          = args.model;
          serialNumber   = args.serialNumber;
          installedDate  = args.installedDate;
          warrantyExpiry = args.warrantyExpiry;
          notes          = args.notes;
        };

        let updated : RoomRecord = {
          id         = room.id;
          propertyId = room.propertyId;
          owner      = room.owner;
          name       = room.name;
          floorType  = room.floorType;
          paintColor = room.paintColor;
          paintBrand = room.paintBrand;
          paintCode  = room.paintCode;
          notes      = room.notes;
          fixtures   = Array.append(room.fixtures, [fixture]);
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, roomId, updated);
        #ok(updated)
      };
    }
  };

  /// Update an existing fixture within a room.
  public shared(msg) func updateFixture(roomId: Text, fixtureId: Text, args: AddFixtureArgs) : async Result.Result<RoomRecord, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#Unauthorized);
        if (Text.size(args.brand)          > 100)  return #err(#InvalidInput("brand exceeds 100 characters"));
        if (Text.size(args.model)          > 100)  return #err(#InvalidInput("model exceeds 100 characters"));
        if (Text.size(args.serialNumber)   > 100)  return #err(#InvalidInput("serialNumber exceeds 100 characters"));
        if (Text.size(args.installedDate)  > 20)   return #err(#InvalidInput("installedDate exceeds 20 characters"));
        if (Text.size(args.warrantyExpiry) > 20)   return #err(#InvalidInput("warrantyExpiry exceeds 20 characters"));
        if (Text.size(args.notes)          > 1000) return #err(#InvalidInput("notes exceed 1000 characters"));

        let found = Array.find<Fixture>(room.fixtures, func(f) { f.id == fixtureId });
        switch (found) {
          case null { return #err(#NotFound) };
          case _    {};
        };

        let updatedFixtures = Array.map<Fixture, Fixture>(room.fixtures, func(f) {
          if (f.id != fixtureId) { f } else {
            {
              id             = f.id;
              brand          = args.brand;
              model          = args.model;
              serialNumber   = args.serialNumber;
              installedDate  = args.installedDate;
              warrantyExpiry = args.warrantyExpiry;
              notes          = args.notes;
            }
          }
        });

        let updated : RoomRecord = {
          id         = room.id;
          propertyId = room.propertyId;
          owner      = room.owner;
          name       = room.name;
          floorType  = room.floorType;
          paintColor = room.paintColor;
          paintBrand = room.paintBrand;
          paintCode  = room.paintCode;
          notes      = room.notes;
          fixtures   = updatedFixtures;
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, roomId, updated);
        #ok(updated)
      };
    }
  };

  /// Remove a fixture from a room.
  public shared(msg) func removeFixture(roomId: Text, fixtureId: Text) : async Result.Result<RoomRecord, Error> {
    switch (requireActive()) { case (#err(e)) return #err(e); case _ {} };

    switch (Map.get(rooms, Text.compare, roomId)) {
      case null    { #err(#NotFound) };
      case (?room) {
        if (room.owner != msg.caller) return #err(#Unauthorized);
        let updated : RoomRecord = {
          id         = room.id;
          propertyId = room.propertyId;
          owner      = room.owner;
          name       = room.name;
          floorType  = room.floorType;
          paintColor = room.paintColor;
          paintBrand = room.paintBrand;
          paintCode  = room.paintCode;
          notes      = room.notes;
          fixtures   = Array.filter<Fixture>(room.fixtures, func(f) { f.id != fixtureId });
          createdAt  = room.createdAt;
          updatedAt  = Time.now();
        };
        Map.add(rooms, Text.compare, roomId, updated);
        #ok(updated)
      };
    }
  };

  // ─── Metrics ─────────────────────────────────────────────────────────────────

  public query func getMetrics() : async Metrics {
    var totalFixtures = 0;
    for (r in Map.values(rooms)) {
      totalFixtures += r.fixtures.size();
    };
    {
      totalRooms    = Map.size(rooms);
      totalFixtures;
      isPaused;
    }
  };
}
