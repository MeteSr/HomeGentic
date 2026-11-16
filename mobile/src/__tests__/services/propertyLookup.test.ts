/**
 * @jest-environment node
 *
 * The phone's add-home form asks the voice Worker for address suggestions
 * (Google Places) and the home's public record (ATTOM), as the web wizard does.
 * Both are nice-to-haves: any failure leaves the form as plain fields.
 */
const mockToken = jest.fn(async () => "hgs_1");
jest.mock("../../services/agentSession", () => ({ getAgentSessionToken: () => mockToken() }));

import {
  lookupPropertyDetails,
  placeAddress,
  resetAddressLookup,
  suggestAddresses,
} from "../../services/propertyLookupService";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
  resetAddressLookup();
});

describe("suggestAddresses", () => {
  it("asks the Worker once 3 characters are typed, with the session token", async () => {
    expect(await suggestAddresses("12", "s1")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      json(200, { suggestions: [{ placeId: "pl1", main: "12 Elm St", secondary: "Raleigh, NC, USA" }] }),
    );
    expect(await suggestAddresses("12 Elm", "s1")).toEqual([
      { placeId: "pl1", main: "12 Elm St", secondary: "Raleigh, NC, USA" },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/address\/suggest$/);
    expect(JSON.parse(init.body)).toEqual({ input: "12 Elm", sessionToken: "s1" });
    expect(init.headers).toMatchObject({ "x-agent-session": "hgs_1" });
  });

  it("stops asking when suggestions aren't set up, and returns [] on any failure", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { error: "not_configured" }));
    expect(await suggestAddresses("12 Elm", "s1")).toEqual([]);
    expect(await suggestAddresses("12 Elm S", "s1")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetAddressLookup();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await suggestAddresses("12 Elm", "s1")).toEqual([]);
  });
});

describe("placeAddress", () => {
  it("returns the street, city, state and ZIP of the picked suggestion", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { address: "12 Elm St", city: "Raleigh", state: "NC", zipCode: "27601" }),
    );
    expect(await placeAddress("pl1", "s1")).toEqual({
      address: "12 Elm St",
      city: "Raleigh",
      state: "NC",
      zipCode: "27601",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ placeId: "pl1", sessionToken: "s1" });
  });

  it("is null when the Worker can't say", async () => {
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect(await placeAddress("pl1", "s1")).toBeNull();
  });
});

describe("lookupPropertyDetails", () => {
  const parts = { address: "12 Elm St", city: "Raleigh", state: "NC", zipCode: "27601" };

  it("reads the year built, size and type from the public record", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        property: [
          { building: { summary: { yearbuilt: 1994 }, size: { universalsize: 1850 } }, summary: { proptype: "SFR" } },
        ],
      }),
    );
    expect(await lookupPropertyDetails(parts)).toEqual({
      yearBuilt: 1994,
      squareFeet: 1850,
      propertyType: "SingleFamily",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/property\/details$/);
    expect(JSON.parse(init.body)).toEqual({ address: "12 Elm St", city: "Raleigh", state: "NC", zip: "27601" });
  });

  it("leaves out what the record doesn't have", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { property: [{ summary: { proptype: "MOBILE" } }] }));
    expect(await lookupPropertyDetails(parts)).toEqual({ yearBuilt: null, squareFeet: null, propertyType: null });
  });

  it("is null when there's no record, the check is refused, or the call fails", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { property: [] }));
    expect(await lookupPropertyDetails(parts)).toBeNull();
    fetchMock.mockResolvedValueOnce(json(403, { error: "human_verification_required" }));
    expect(await lookupPropertyDetails(parts)).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await lookupPropertyDetails(parts)).toBeNull();
  });
});
