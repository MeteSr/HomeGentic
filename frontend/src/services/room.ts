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

// ─── Mock data (used when canister is not deployed) ───────────────────────────

const MOCK_ROOMS: Room[] = [
  {
    id:          "ROOM_1",
    propertyId:  "1",
    owner:       "mock-principal",
    name:        "Kitchen",
    floorName:   "First Floor",
    floorType:   "Tile",
    paintColor:  "Agreeable Gray",
    paintBrand:  "Sherwin-Williams",
    paintCode:   "SW 7029",
    notes:       "Remodeled 2022. Grout resealed annually.",
    fixtures: [
      {
        id:             "FIX_1",
        brand:          "KitchenAid",
        model:          "KFIS29PBMS",
        serialNumber:   "SN-KA-2022-001",
        installedDate:  "2022-03-15",
        warrantyExpiry: "2027-03-15",
        notes:          "French door refrigerator",
      },
    ],
    createdAt: BigInt(Date.now()) * BigInt(1_000_000),
    updatedAt: BigInt(Date.now()) * BigInt(1_000_000),
  },
  {
    id:          "ROOM_2",
    propertyId:  "1",
    owner:       "mock-principal",
    name:        "Master Bedroom",
    floorName:   "Second Floor",
    floorType:   "Hardwood",
    paintColor:  "Alabaster",
    paintBrand:  "Sherwin-Williams",
    paintCode:   "SW 7008",
    notes:       "",
    fixtures:    [],
    createdAt: BigInt(Date.now()) * BigInt(1_000_000),
    updatedAt: BigInt(Date.now()) * BigInt(1_000_000),
  },
];

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
  let mockRooms = MOCK_ROOMS.map((r) => ({ ...r, fixtures: [...r.fixtures] }));
  let mockFixtureCounter = 100; // start above seed fixture IDs

  return {
  async getRoomsByProperty(propertyId: string): Promise<Room[]> {
    if (!ROOM_CANISTER_ID) {
      return mockRooms.filter((r) => r.propertyId === propertyId);
    }
    const actor = await getActor();
    const result = await (actor as any).getRoomsByProperty(propertyId);
    return (result as any[]).map(mapRoom);
  },

  async createRoom(args: CreateRoomArgs): Promise<Room> {
    if (!ROOM_CANISTER_ID) {
      const room: Room = {
        ...args,
        id:        `ROOM_${mockRooms.length + 1}`,
        owner:     "mock-principal",
        fixtures:  [],
        createdAt: BigInt(Date.now()) * BigInt(1_000_000),
        updatedAt: BigInt(Date.now()) * BigInt(1_000_000),
      };
      mockRooms.push(room);
      return room;
    }
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).createRoom(args)));
  },

  async updateRoom(id: string, args: UpdateRoomArgs): Promise<Room> {
    if (!ROOM_CANISTER_ID) {
      mockRooms = mockRooms.map((r) =>
        r.id !== id ? r : { ...r, ...args, updatedAt: BigInt(Date.now()) * BigInt(1_000_000) }
      );
      return mockRooms.find((r) => r.id === id)!;
    }
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).updateRoom(id, args)));
  },

  async deleteRoom(id: string): Promise<void> {
    if (!ROOM_CANISTER_ID) {
      mockRooms = mockRooms.filter((r) => r.id !== id);
      return;
    }
    const actor = await getActor();
    unwrap(await (actor as any).deleteRoom(id));
  },

  async addFixture(roomId: string, args: AddFixtureArgs): Promise<Room> {
    if (!ROOM_CANISTER_ID) {
      const fixture: Fixture = {
        id: `FIX_${++mockFixtureCounter}`,
        ...args,
      };
      mockRooms = mockRooms.map((r) =>
        r.id !== roomId ? r : { ...r, fixtures: [...r.fixtures, fixture] }
      );
      return mockRooms.find((r) => r.id === roomId)!;
    }
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).addFixture(roomId, args)));
  },

  async updateFixture(roomId: string, fixtureId: string, args: AddFixtureArgs): Promise<Room> {
    if (!ROOM_CANISTER_ID) {
      mockRooms = mockRooms.map((r) =>
        r.id !== roomId ? r : {
          ...r,
          fixtures: r.fixtures.map((f) => f.id !== fixtureId ? f : { ...f, ...args }),
        }
      );
      return mockRooms.find((r) => r.id === roomId)!;
    }
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).updateFixture(roomId, fixtureId, args)));
  },

  /** Reset in-memory mock state — for use in tests only. */
  reset() {
    mockRooms = MOCK_ROOMS.map((r) => ({ ...r, fixtures: [...r.fixtures] }));
    mockFixtureCounter = 100;
  },

  async removeFixture(roomId: string, fixtureId: string): Promise<Room> {
    if (!ROOM_CANISTER_ID) {
      mockRooms = mockRooms.map((r) =>
        r.id !== roomId ? r : { ...r, fixtures: r.fixtures.filter((f) => f.id !== fixtureId) }
      );
      return mockRooms.find((r) => r.id === roomId)!;
    }
    const actor = await getActor();
    return mapRoom(unwrap(await (actor as any).removeFixture(roomId, fixtureId)));
  },
  };
}

export const roomService = createRoomService();
