import { create } from "zustand";
import { Property } from "@/services/property";

interface PropertyState {
  properties: Property[];
  selectedProperty: Property | null;
  isLoading: boolean;
  setProperties: (props: Property[]) => void;
  setSelectedProperty: (prop: Property | null) => void;
  addProperty: (prop: Property) => void;
  setLoading: (v: boolean) => void;
}

export const usePropertyStore = create<PropertyState>((set) => ({
  properties: [],
  selectedProperty: null,
  isLoading: false,
  setProperties: (properties) => set({ properties }),
  setSelectedProperty: (selectedProperty) => set({ selectedProperty }),
  addProperty: (prop) => set((s) => ({ properties: [...s.properties, prop] })),
  setLoading: (isLoading) => set({ isLoading }),
}));
