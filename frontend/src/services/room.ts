import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const ROOM_CANISTER_ID = (process.env as any).CANISTER_ID_PROPERTY || "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Fixture {
  id:             string;
  brand:          string;
  model:          string;
  serialNumber:   string;
  installedDate:  string;   // YYYY-MM-DD or ""
  warrantyExpiry: string;   // YYYY-MM-DD or ""
  notes:          string;
}

export interface Room {
  id:          string;
  propertyId:  string;
  owner:       string;
  name:        string;
  floorName:   string;   // floor/level label e.g. "First Floor", "Basement", "1", "B2"
  floorType:   string;
  paintColor:  string;
  paintBrand:  string;
  paintCode:   string;
  notes:       string;
  fixtures:    Fixture[];
  createdAt:   bigint;
  updatedAt:   bigint;
}

export interface CreateRoomArgs {
  propertyId: string;
  name:       string;
  floorName:  string;
  floorType:  string;
  paintColor: string;
  paintBrand: string;
  paintCode:  string;
  notes:      string;
}

export interface UpdateRoomArgs {
  name:       string;
  floorName:  string;
  floorType:  string;
  paintColor: string;
  paintBrand: string;
  paintCode:  string;
  notes:      string;
}

export interface AddFixtureArgs {
  brand:          string;
  model:          string;
  serialNumber:   string;
  installedDate:  string;
  warrantyExpiry: string;
  notes:          string;
}

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
  const Fixture = IDL.Record({
    id:             IDL.Text,
    brand:          IDL.Text,
    model:          IDL.Text,
    serialNumber:   IDL.Text,
    installedDate:  IDL.Text,
    warrantyExpiry: IDL.Text,
    notes:          IDL.Text,
  });

  const RoomRecord = IDL.Record({
    id:          IDL.Text,
    propertyId:  IDL.Text,
    owner:       IDL.Principal,
    name:        IDL.Text,
    floorName:   IDL.Text,
    floorType:   IDL.Text,
    paintColor:  IDL.Text,
    paintBrand:  IDL.Text,
    paintCode:   IDL.Text,
    notes:       IDL.Text,
    fixtures:    IDL.Vec(Fixture),
    createdAt:   IDL.Int,
    updatedAt:   IDL.Int,
  });

  const CreateRoomArgs = IDL.Record({
    propertyId: IDL.Text,
    name:       IDL.Text,
    floorName:  IDL.Text,
    floorType:  IDL.Text,
    paintColor: IDL.Text,
    paintBrand: IDL.Text,
    paintCode:  IDL.Text,
    notes:      IDL.Text,
  });

  const UpdateRoomArgs = IDL.Record({
    name:       IDL.Text,
    floorName:  IDL.Text,
    floorType:  IDL.Text,
    paintColor: IDL.Text,
    paintBrand: IDL.Text,
    paintCode:  IDL.Text,
    notes:      IDL.Text,
  });

  const AddFixtureArgs = IDL.Record({
    brand:          IDL.Text,
    model:          IDL.Text,
    serialNumber:   IDL.Text,
    installedDate:  IDL.Text,
    warrantyExpiry: IDL.Text,
    notes:          IDL.Text,
  });

  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
    Paused:        IDL.Null,
    LimitReached:  IDL.Null,
    DuplicateAddress: IDL.Null,
    AddressConflict:  IDL.Int,
  });

  const RoomMetrics = IDL.Record({
    totalRooms:    IDL.Nat,
    totalFixtures: IDL.Nat,
  });

  const RoomResult    = IDL.Variant({ ok: RoomRecord, err: Error });
  const UnitResult    = IDL.Variant({ ok: IDL.Null,   err: Error });

  return IDL.Service({
    createRoom:         IDL.Func([CreateRoomArgs], [RoomResult], []),
    getRoom:            IDL.Func([IDL.Text], [RoomResult], ["query"]),
    getRoomsByProperty: IDL.Func([IDL.Text], [IDL.Vec(RoomRecord)], ["query"]),
    updateRoom:         IDL.Func([IDL.Text, UpdateRoomArgs], [RoomResult], []),
    deleteRoom:         IDL.Func([IDL.Text], [UnitResult], []),
    addFixture:         IDL.Func([IDL.Text, AddFixtureArgs], [RoomResult], []),
    updateFixture:      IDL.Func([IDL.Text, IDL.Text, AddFixtureArgs], [RoomResult], []),
    removeFixture:      IDL.Func([IDL.Text, IDL.Text], [RoomResult], []),
    getRoomMetrics:     IDL.Func([], [RoomMetrics], ["query"]),
  });
};

// ─── Mock state (populated at runtime via createRoom; seed.sh populates on real deployments) ──

// ─── Actor helpers ────────────────────────────────────────────────────────────

function mapRoom(r: any): Room {
  return {
    id:          r.id,
    propertyId:  r.propertyId,
    owner:       r.owner.toString(),
    name:        r.name,
    floorName:   r.floorName ?? "",
    floorType:   r.floorType,
    paintColor:  r.paintColor,
    paintBrand:  r.paintBrand,
    paintCode:   r.paintCode,
    notes:       r.notes,
    fixtures:    (r.fixtures as any[]).map((f) => ({
      id:             f.id,
      brand:          f.brand,
      model:          f.model,
      serialNumber:   f.serialNumber,
      installedDate:  f.installedDate,
      warrantyExpiry: f.warrantyExpiry,
      notes:          f.notes,
    })),
    createdAt: BigInt(r.createdAt),
    updatedAt: BigInt(r.updatedAt),
  };
}

async function getActor() {
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: ROOM_CANISTER_ID });
}

function unwrap<T>(result: any): T {
  if ("ok" in result) return result.ok;
  const errKey = Object.keys(result.err)[0];
  const errVal = result.err[errKey];
  throw new Error(errVal ?? errKey);
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createRoomService() {
  let mockRooms: Room[] = [];
  let mockFixtureCounter = 0;

  return {
  async getRoomsByProperty(propertyId: string): Promise<Room[]> {
    const actor = await getActor();
    const result = await (actor as any).getRoomsByProperty(propertyId);
    return (result as any[]).map(mapRoom);
  },

  async createRoom(args: CreateRoomArgs): Promise<Room> {
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).createRoom(args)));
  },

  async updateRoom(id: string, args: UpdateRoomArgs): Promise<Room> {
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).updateRoom(id, args)));
  },

  async deleteRoom(id: string): Promise<void> {
    const actor = await getActor();
    unwrap(await (actor as any).deleteRoom(id));
  },

  async addFixture(roomId: string, args: AddFixtureArgs): Promise<Room> {
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).addFixture(roomId, args)));
  },

  async updateFixture(roomId: string, fixtureId: string, args: AddFixtureArgs): Promise<Room> {
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).updateFixture(roomId, fixtureId, args)));
  },

  /** Reset in-memory mock state — for use in tests only. */
  reset() {
    mockRooms = [];
    mockFixtureCounter = 0;
  },

  async removeFixture(roomId: string, fixtureId: string): Promise<Room> {
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).removeFixture(roomId, fixtureId)));
  },
  };
}

export const roomService = createRoomService();
