/**
 * ICP skills audit M-2: the Worker, notification relay and IoT gateway act
 * for whichever principal auth.resolveAgentSession returns, so they must
 * resolve tokens with a replicated (update) call, not a single-replica query.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IDL } from "@icp-sdk/core/candid";
import { sessionLookupIdl } from "@homegentic/shared/sessionLookup";

const root = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("agent-session lookup is replicated", () => {
  it("declares resolveAgentSession without the query annotation", () => {
    const service = sessionLookupIdl({ IDL }) as IDL.ServiceClass;
    const [, fn] = service._fields.find(([name]) => name === "resolveAgentSession")!;
    expect(fn.annotations).toEqual([]);
  });

  it("declares resolveServiceSession(token, audience) without the query annotation", () => {
    const service = sessionLookupIdl({ IDL }) as IDL.ServiceClass;
    const [, fn] = service._fields.find(([name]) => name === "resolveServiceSession")!;
    expect(fn.annotations).toEqual([]);
    expect(fn.argTypes.map((t) => t.display())).toEqual(["text", "variant {notifications; iotGateway}"]);
  });

  it.each(["agents/voice/authCanister.ts", "agents/notifications/icp.ts", "agents/iot-gateway/icp.ts"])(
    "%s resolves sessions through sessionLookupIdl",
    (file) => {
      const src = read(file);
      expect(src).toMatch(/Actor\.createActor\(sessionLookupIdl,/);
    },
  );
});

// X-7 follow-up: each relay checks tokens issued for it, never the Worker's.
describe("each service resolves only its own tokens", () => {
  it.each([
    ["agents/notifications/icp.ts", "notifications"],
    ["agents/iot-gateway/icp.ts", "iotGateway"],
  ])("%s asks auth.resolveServiceSession for the %s audience", (file, audience) => {
    const src = read(file);
    expect(src).toMatch(new RegExp(`\\.resolveServiceSession\\(token, \\{ ${audience}: null \\}\\)`));
    expect(src).not.toMatch(/\.resolveAgentSession\(/);
  });
});
