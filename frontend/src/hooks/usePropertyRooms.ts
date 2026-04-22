import { useState, useEffect } from "react";
import { roomService, type Room as RoomRecord } from "@/services/room";

export interface PropertyRooms {
  rooms: RoomRecord[];
  setRooms: React.Dispatch<React.SetStateAction<RoomRecord[]>>;
}

export function usePropertyRooms(propertyId: string | undefined): PropertyRooms {
  const [rooms, setRooms] = useState<RoomRecord[]>([]);

  useEffect(() => {
    if (!propertyId) return;
    roomService.getRoomsByProperty(propertyId).then(setRooms).catch((e) => console.error("[usePropertyRooms] load failed:", e));
  }, [propertyId]);

  return { rooms, setRooms };
}
