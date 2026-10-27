/**
 * @jest-environment node
 */
// uploadJobPhoto used to send 32 random bytes as the "hash". It must be the
// SHA-256 of the photo bytes, like the web app, so de-duplication and signed
// records mean something.
const mockUpload = jest.fn(async () => ({ ok: {} }));
jest.mock("@icp-sdk/core/agent", () => {
  const actual = jest.requireActual("@icp-sdk/core/agent");
  return { ...actual, Actor: { ...actual.Actor, createActor: jest.fn(() => ({ uploadPhoto: mockUpload })) } };
});
jest.mock("../../services/icpAgent", () => ({ getIcpAgent: jest.fn(() => ({})) }));

import { uploadJobPhoto } from "../../services/jobService";

describe("uploadJobPhoto", () => {
  it("sends the SHA-256 of the decoded bytes", async () => {
    // "abc" — SHA-256 test vector from FIPS 180-2
    await uploadJobPhoto("job-1", "prop-1", Buffer.from("abc").toString("base64"));
    const args = mockUpload.mock.calls[0] as unknown as any[];
    expect(args[4]).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(Array.from(args[5] as Uint8Array)).toEqual([97, 98, 99]);
  });

  it("gives the same photo the same hash every time", async () => {
    const b64 = Buffer.from("same photo").toString("base64");
    await uploadJobPhoto("job-1", "prop-1", b64);
    await uploadJobPhoto("job-2", "prop-1", `data:image/jpeg;base64,${b64}`);
    const calls = mockUpload.mock.calls as unknown as any[][];
    expect(calls.at(-1)![4]).toBe(calls.at(-2)![4]);
  });
});
