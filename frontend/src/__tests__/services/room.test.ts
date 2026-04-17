import { describe, it, expect, beforeEach } from "vitest";
import { roomService, type Room, type CreateRoomArgs } from "@/services/room";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// CANISTER_ID_ROOM is "" in the test environment, so the service always falls
// through to the in-memory mock. Tests cover that entire code path.

function makeCreateArgs(overrides: Partial<CreateRoomArgs> = {}): CreateRoomArgs {
  return {
    propertyId: "42",
    name:       "Living Room",
    floorName:  "",
    floorType:  "Hardwood",
    paintColor: "Agreeable Gray",
    paintBrand: "Sherwin-Williams",
    paintCode:  "SW 7029",
    notes:      "",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("roomService (mock path)", () => {
  beforeEach(() => {
    roomService.reset();
  });

  // ── getRoomsByProperty ───────────────────────────────────────────────────────

  describe("getRoomsByProperty", () => {
    it("returns rooms for a matching propertyId", async () => {
      const rooms = await roomService.getRoomsByProperty("1");
      expect(rooms.length).toBeGreaterThan(0);
      rooms.forEach((r) => expect(r.propertyId).toBe("1"));
    });

    it("returns an empty array for an unknown propertyId", async () => {
      const rooms = await roomService.getRoomsByProperty("9999");
      expect(rooms).toEqual([]);
    });

    it("returns all seed rooms for propertyId '1'", async () => {
      const rooms = await roomService.getRoomsByProperty("1");
      const names = rooms.map((r) => r.name);
      expect(names).toContain("Kitchen");
      expect(names).toContain("Master Bedroom");
    });
  });

  // ── createRoom ───────────────────────────────────────────────────────────────

  describe("createRoom", () => {
    it("returns a room with the supplied fields", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      expect(room.name).toBe("Living Room");
      expect(room.floorType).toBe("Hardwood");
      expect(room.paintColor).toBe("Agreeable Gray");
      expect(room.paintBrand).toBe("Sherwin-Williams");
      expect(room.paintCode).toBe("SW 7029");
      expect(room.propertyId).toBe("42");
    });

    it("assigns a unique id prefixed with ROOM_", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      expect(room.id).toMatch(/^ROOM_/);
    });

    it("sets owner to mock-principal", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      expect(room.owner).toBe("mock-principal");
    });

    it("initialises fixtures to an empty array", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      expect(room.fixtures).toEqual([]);
    });

    it("assigns createdAt and updatedAt as BigInts", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      expect(typeof room.createdAt).toBe("bigint");
      expect(typeof room.updatedAt).toBe("bigint");
    });

    it("preserves optional notes", async () => {
      const room = await roomService.createRoom(makeCreateArgs({ notes: "Vaulted ceiling" }));
      expect(room.notes).toBe("Vaulted ceiling");
    });

    it("new room is visible via getRoomsByProperty", async () => {
      await roomService.createRoom(makeCreateArgs({ propertyId: "42" }));
      const rooms = await roomService.getRoomsByProperty("42");
      expect(rooms.some((r) => r.name === "Living Room")).toBe(true);
    });

    it("creates multiple independent rooms", async () => {
      const a = await roomService.createRoom(makeCreateArgs({ name: "Den" }));
      const b = await roomService.createRoom(makeCreateArgs({ name: "Garage" }));
      expect(a.id).not.toBe(b.id);
    });
  });

  // ── updateRoom ───────────────────────────────────────────────────────────────

  describe("updateRoom", () => {
    it("updates room fields", async () => {
      const created = await roomService.createRoom(makeCreateArgs());
      const updated = await roomService.updateRoom(created.id, {
        name:       "Dining Room",
        floorName:  "",
        floorType:  "Tile",
        paintColor: "White Dove",
        paintBrand: "Benjamin Moore",
        paintCode:  "OC-17",
        notes:      "South-facing windows",
      });
      expect(updated.name).toBe("Dining Room");
      expect(updated.floorType).toBe("Tile");
      expect(updated.paintColor).toBe("White Dove");
      expect(updated.paintBrand).toBe("Benjamin Moore");
      expect(updated.paintCode).toBe("OC-17");
      expect(updated.notes).toBe("South-facing windows");
    });

    it("preserves id and propertyId after update", async () => {
      const created = await roomService.createRoom(makeCreateArgs({ propertyId: "5" }));
      const updated = await roomService.updateRoom(created.id, {
        name: "Updated Room", floorName: "", floorType: "", paintColor: "", paintBrand: "", paintCode: "", notes: "",
      });
      expect(updated.id).toBe(created.id);
      expect(updated.propertyId).toBe("5");
    });

    it("preserves existing fixtures after update", async () => {
      const created = await roomService.createRoom(makeCreateArgs());
      await roomService.addFixture(created.id, {
        brand: "Bosch", model: "500", serialNumber: "SN1", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const updated = await roomService.updateRoom(created.id, {
        name: "Updated", floorName: "", floorType: "", paintColor: "", paintBrand: "", paintCode: "", notes: "",
      });
      expect(updated.fixtures).toHaveLength(1);
    });

    it("update is reflected in subsequent getRoomsByProperty", async () => {
      const created = await roomService.createRoom(makeCreateArgs({ propertyId: "7" }));
      await roomService.updateRoom(created.id, {
        name: "Renovated Kitchen", floorName: "", floorType: "Marble",
        paintColor: "", paintBrand: "", paintCode: "", notes: "",
      });
      const rooms = await roomService.getRoomsByProperty("7");
      const found = rooms.find((r) => r.id === created.id);
      expect(found?.name).toBe("Renovated Kitchen");
    });
  });

  // ── deleteRoom ───────────────────────────────────────────────────────────────

  describe("deleteRoom", () => {
    it("removes the room from the store", async () => {
      const created = await roomService.createRoom(makeCreateArgs({ propertyId: "10" }));
      await roomService.deleteRoom(created.id);
      const rooms = await roomService.getRoomsByProperty("10");
      expect(rooms.find((r) => r.id === created.id)).toBeUndefined();
    });

    it("does not affect other rooms", async () => {
      const a = await roomService.createRoom(makeCreateArgs({ name: "Room A", propertyId: "11" }));
      const b = await roomService.createRoom(makeCreateArgs({ name: "Room B", propertyId: "11" }));
      await roomService.deleteRoom(a.id);
      const rooms = await roomService.getRoomsByProperty("11");
      expect(rooms.find((r) => r.id === b.id)).toBeDefined();
    });
  });

  // ── addFixture ───────────────────────────────────────────────────────────────

  describe("addFixture", () => {
    it("appends a fixture to the room", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const updated = await roomService.addFixture(room.id, {
        brand:          "LG",
        model:          "LRMVS3006S",
        serialNumber:   "LG-2023-001",
        installedDate:  "2023-05-10",
        warrantyExpiry: "2028-05-10",
        notes:          "Built-in french door fridge",
      });
      expect(updated.fixtures).toHaveLength(1);
      expect(updated.fixtures[0].brand).toBe("LG");
      expect(updated.fixtures[0].model).toBe("LRMVS3006S");
      expect(updated.fixtures[0].serialNumber).toBe("LG-2023-001");
      expect(updated.fixtures[0].installedDate).toBe("2023-05-10");
      expect(updated.fixtures[0].warrantyExpiry).toBe("2028-05-10");
      expect(updated.fixtures[0].notes).toBe("Built-in french door fridge");
    });

    it("assigns a unique fixture id prefixed with FIX_", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const updated = await roomService.addFixture(room.id, {
        brand: "GE", model: "Profile", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      expect(updated.fixtures[0].id).toMatch(/^FIX_/);
    });

    it("accumulates multiple fixtures", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      await roomService.addFixture(room.id, {
        brand: "Bosch", model: "SHPM88Z75N", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const after = await roomService.addFixture(room.id, {
        brand: "KitchenAid", model: "KFIS29PBMS", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      expect(after.fixtures).toHaveLength(2);
    });

    it("fixture with empty optional fields is valid", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const updated = await roomService.addFixture(room.id, {
        brand: "Generic", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      expect(updated.fixtures[0].model).toBe("");
      expect(updated.fixtures[0].warrantyExpiry).toBe("");
    });
  });

  // ── updateFixture ────────────────────────────────────────────────────────────

  describe("updateFixture", () => {
    it("updates the target fixture in place", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const withFixture = await roomService.addFixture(room.id, {
        brand: "Old Brand", model: "Old Model", serialNumber: "",
        installedDate: "", warrantyExpiry: "", notes: "",
      });
      const fixtureId = withFixture.fixtures[0].id;
      const updated = await roomService.updateFixture(room.id, fixtureId, {
        brand: "Miele", model: "W1", serialNumber: "MR-001",
        installedDate: "2024-01-15", warrantyExpiry: "2029-01-15", notes: "Washer",
      });
      expect(updated.fixtures[0].brand).toBe("Miele");
      expect(updated.fixtures[0].model).toBe("W1");
      expect(updated.fixtures[0].serialNumber).toBe("MR-001");
    });

    it("preserves fixture id after update", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const withFixture = await roomService.addFixture(room.id, {
        brand: "X", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const originalId = withFixture.fixtures[0].id;
      const updated = await roomService.updateFixture(room.id, originalId, {
        brand: "Y", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      expect(updated.fixtures[0].id).toBe(originalId);
    });

    it("does not affect other fixtures in the same room", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const after1 = await roomService.addFixture(room.id, {
        brand: "A", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const after2 = await roomService.addFixture(room.id, {
        brand: "B", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const firstId = after1.fixtures[0].id;
      const secondId = after2.fixtures[1].id;
      const updated = await roomService.updateFixture(room.id, firstId, {
        brand: "Updated A", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const second = updated.fixtures.find((f) => f.id === secondId);
      expect(second?.brand).toBe("B");
    });
  });

  // ── removeFixture ────────────────────────────────────────────────────────────

  describe("removeFixture", () => {
    it("removes the target fixture", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const withFixture = await roomService.addFixture(room.id, {
        brand: "Whirlpool", model: "WRX735SDHZ", serialNumber: "",
        installedDate: "", warrantyExpiry: "", notes: "",
      });
      const fixtureId = withFixture.fixtures[0].id;
      const after = await roomService.removeFixture(room.id, fixtureId);
      expect(after.fixtures).toHaveLength(0);
    });

    it("removes only the specified fixture, leaving others intact", async () => {
      const room = await roomService.createRoom(makeCreateArgs());
      const after1 = await roomService.addFixture(room.id, {
        brand: "Keep", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const after2 = await roomService.addFixture(room.id, {
        brand: "Remove", model: "", serialNumber: "", installedDate: "", warrantyExpiry: "", notes: "",
      });
      const keepId   = after1.fixtures[0].id;
      const removeId = after2.fixtures[1].id;
      const final = await roomService.removeFixture(room.id, removeId);
      expect(final.fixtures).toHaveLength(1);
      expect(final.fixtures[0].id).toBe(keepId);
    });
  });

  // ── reset isolation ──────────────────────────────────────────────────────────

  describe("reset", () => {
    it("restores seed rooms after mutations", async () => {
      // Delete all seed rooms
      const rooms = await roomService.getRoomsByProperty("1");
      for (const r of rooms) await roomService.deleteRoom(r.id);
      expect(await roomService.getRoomsByProperty("1")).toHaveLength(0);

      roomService.reset();

      const restored = await roomService.getRoomsByProperty("1");
      expect(restored.length).toBeGreaterThan(0);
    });

    it("seed rooms include a fixture in the Kitchen", async () => {
      const rooms = await roomService.getRoomsByProperty("1");
      const kitchen = rooms.find((r) => r.name === "Kitchen");
      expect(kitchen).toBeDefined();
      expect(kitchen!.fixtures.length).toBeGreaterThan(0);
    });
  });
});
