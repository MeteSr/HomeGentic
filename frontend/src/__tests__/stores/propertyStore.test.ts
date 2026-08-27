/**
 * Unit tests for usePropertyStore (Zustand)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { usePropertyStore } from "@/store/propertyStore";
import type { Property } from "@/services/property";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1",
    owner: "owner-a",
    address: "123 Main St",
    city: "Nashville",
    state: "TN",
    zipCode: "37201",
    propertyType: "SingleFamily",
    yearBuilt: BigInt(1990),
    squareFeet: BigInt(2000),
    verificationLevel: "Unverified",
    tier: "Basic",
    createdAt: BigInt(0),
    updatedAt: BigInt(0),
    isActive: true,
    ...overrides,
  };
}

function getStore() {
  return usePropertyStore.getState();
}

function resetStore() {
  usePropertyStore.setState({
    properties: [],
    selectedProperty: null,
    isLoading: false,
  });
}

describe("usePropertyStore — initial state", () => {
  beforeEach(resetStore);

  it("starts with empty properties array", () => {
    expect(getStore().properties).toEqual([]);
  });

  it("starts with no selectedProperty", () => {
    expect(getStore().selectedProperty).toBeNull();
  });

  it("starts with isLoading false", () => {
    expect(getStore().isLoading).toBe(false);
  });
});

describe("usePropertyStore — setProperties", () => {
  beforeEach(resetStore);

  it("replaces the properties array", () => {
    const props = [makeProperty({ id: "a" }), makeProperty({ id: "b" })];
    getStore().setProperties(props);
    expect(getStore().properties).toHaveLength(2);
    expect(getStore().properties[0].id).toBe("a");
  });

  it("can set to empty array", () => {
    getStore().setProperties([makeProperty()]);
    getStore().setProperties([]);
    expect(getStore().properties).toHaveLength(0);
  });
});

describe("usePropertyStore — addProperty", () => {
  beforeEach(resetStore);

  it("appends a property to the list", () => {
    const p1 = makeProperty({ id: "p1" });
    getStore().addProperty(p1);
    expect(getStore().properties).toHaveLength(1);
    expect(getStore().properties[0].id).toBe("p1");
  });

  it("preserves existing properties when adding new ones", () => {
    const p1 = makeProperty({ id: "p1" });
    const p2 = makeProperty({ id: "p2" });
    getStore().addProperty(p1);
    getStore().addProperty(p2);
    expect(getStore().properties).toHaveLength(2);
  });
});

describe("usePropertyStore — setSelectedProperty", () => {
  beforeEach(resetStore);

  it("sets the selected property", () => {
    const prop = makeProperty({ id: "sel-1" });
    getStore().setSelectedProperty(prop);
    expect(getStore().selectedProperty?.id).toBe("sel-1");
  });

  it("can clear the selection with null", () => {
    getStore().setSelectedProperty(makeProperty());
    getStore().setSelectedProperty(null);
    expect(getStore().selectedProperty).toBeNull();
  });
});

describe("usePropertyStore — setLoading", () => {
  beforeEach(resetStore);

  it("sets isLoading to true", () => {
    getStore().setLoading(true);
    expect(getStore().isLoading).toBe(true);
  });

  it("sets isLoading back to false", () => {
    getStore().setLoading(true);
    getStore().setLoading(false);
    expect(getStore().isLoading).toBe(false);
  });
});
