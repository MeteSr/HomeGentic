/**
 * Unit tests — usePropertyRooms
 *
 * PR.1  rooms is empty when propertyId is undefined
 * PR.2  Loads rooms from roomService on mount
 * PR.3  setRooms exposes a state setter (direct use by parent)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Room } from "@/services/room";

const mockGetRoomsByProperty = vi.fn();

vi.mock("@/services/room", () => ({
  roomService: {
    getRoomsByProperty: (...a: any[]) => mockGetRoomsByProperty(...a),
  },
}));

import { usePropertyRooms } from "@/hooks/usePropertyRooms";

const ROOM: Room = {
  id: "r1", propertyId: "p1", owner: "owner-1", name: "Kitchen",
  floorName: "First Floor", floorType: "Main", paintColor: "", paintBrand: "",
  paintCode: "", notes: "", fixtures: [], createdAt: BigInt(0), updatedAt: BigInt(0),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRoomsByProperty.mockResolvedValue([ROOM]);
});

// ── PR.1 ─────────────────────────────────────────────────────────────────────

describe("PR.1 — rooms is empty when propertyId is undefined", () => {
  it("never calls the service and returns empty list", () => {
    const { result } = renderHook(() => usePropertyRooms(undefined));
    expect(result.current.rooms).toHaveLength(0);
    expect(mockGetRoomsByProperty).not.toHaveBeenCalled();
  });
});

// ── PR.2 ─────────────────────────────────────────────────────────────────────

describe("PR.2 — loads rooms from roomService on mount", () => {
  it("populates rooms array", async () => {
    const { result } = renderHook(() => usePropertyRooms("p1"));
    await waitFor(() => {
      expect(result.current.rooms).toHaveLength(1);
    });
    expect(result.current.rooms[0].name).toBe("Kitchen");
    expect(mockGetRoomsByProperty).toHaveBeenCalledWith("p1");
  });
});

// ── PR.3 ─────────────────────────────────────────────────────────────────────

describe("PR.3 — setRooms is a callable state setter", () => {
  it("updates the rooms list when called directly", async () => {
    const { result } = renderHook(() => usePropertyRooms("p1"));
    await waitFor(() => { expect(result.current.rooms).toHaveLength(1); });

    const newRoom: Room = {
      id: "r2", propertyId: "p1", owner: "owner-1", name: "Bathroom",
      floorName: "First Floor", floorType: "Main", paintColor: "", paintBrand: "",
      paintCode: "", notes: "", fixtures: [], createdAt: BigInt(0), updatedAt: BigInt(0),
    };
    act(() => { result.current.setRooms([newRoom]); });
    expect(result.current.rooms).toHaveLength(1);
    expect(result.current.rooms[0].name).toBe("Bathroom");
  });
});
