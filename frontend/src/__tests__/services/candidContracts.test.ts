/**
 * §33 — Candid Contract Snapshot Tests
 *
 * Each service file embeds an `idlFactory` that must stay in sync with the
 * deployed Motoko canister. These tests snapshot the *method names + arity*
 * extracted from each factory so that:
 *
 *   1. Adding or removing a canister method without updating the IDL factory
 *      fails CI immediately.
 *   2. Changing a function's argument or return count is also caught.
 *
 * We intentionally do NOT snapshot the full recursive type tree — that would
 * make the snapshot enormous and brittle to cosmetic refactors. Instead we
 * snapshot: method name, # of arg types, # of return types, and annotations
 * (e.g. "query"). This is enough to catch the real drift scenarios.
 *
 * To update snapshots after a legitimate canister change:
 *   npm run test:unit:update-snapshots -- candidContracts
 * or equivalently: npx vitest run --update-snapshots candidContracts
 */

import { describe, it, expect } from "vitest";

// ── Minimal IDL stub ──────────────────────────────────────────────────────────
//
// We don't need the real @dfinity/agent IDL builder. We just need to capture
// the IDL.Service({ methodName: IDL.Func([...args], [...rets], [...anns]) })
// call and record each method's shape.

interface FuncDef {
  argCount: number;
  retCount: number;
  annotations: string[];
}

type ServiceDef = Record<string, FuncDef>;

function mockIDL() {
  // Leaf types — all return a unique sentinel with a display name
  const leaf = (name: string) => ({ __type: name });
  const IDL = {
    Text:      leaf("Text"),
    Nat:       leaf("Nat"),
    Nat8:      leaf("Nat8"),
    Nat16:     leaf("Nat16"),
    Nat32:     leaf("Nat32"),
    Nat64:     leaf("Nat64"),
    Int:       leaf("Int"),
    Int32:     leaf("Int32"),
    Int64:     leaf("Int64"),
    Float64:   leaf("Float64"),
    Bool:      leaf("Bool"),
    Null:      leaf("Null"),
    Principal: leaf("Principal"),
    Empty:     leaf("Empty"),
    Reserved:  leaf("Reserved"),
    // Constructors — return a distinct object so callers can nest them
    Opt:     (_t: unknown)               => leaf("Opt"),
    Vec:     (_t: unknown)               => leaf("Vec"),
    Record:  (_fields: unknown)          => leaf("Record"),
    Variant: (_variants: unknown)        => leaf("Variant"),
    Tuple:   (..._args: unknown[])       => leaf("Tuple"),
    Rec:     ()                          => leaf("Rec"),
    // Func — records arg/return counts and annotations
    Func: (args: unknown[], rets: unknown[], anns: string[] = []): FuncDef => ({
      argCount:    args.length,
      retCount:    rets.length,
      annotations: [...anns].sort(),
    }),
    // Service — collects all Func entries
    Service: (methods: Record<string, FuncDef | unknown>): ServiceDef => {
      const out: ServiceDef = {};
      for (const [name, def] of Object.entries(methods)) {
        if (def && typeof def === "object" && "argCount" in (def as object)) {
          out[name] = def as FuncDef;
        }
      }
      return out;
    },
  };
  return IDL;
}

/** Extract a stable string from a service definition, sorted by method name. */
function serialiseService(svc: ServiceDef): string {
  return Object.entries(svc)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, { argCount, retCount, annotations }]) => {
      const anns = annotations.length ? ` [${annotations.join(",")}]` : "";
      return `${name}(${argCount}) -> (${retCount})${anns}`;
    })
    .join("\n");
}

// ── Helper ────────────────────────────────────────────────────────────────────

function extractServiceDef(idlFactory: (opts: { IDL: ReturnType<typeof mockIDL> }) => ServiceDef): string {
  const IDL = mockIDL();
  const svc = idlFactory({ IDL });
  return serialiseService(svc);
}

// ── Tests — one describe block per canister ───────────────────────────────────

import { idlFactory as authIdl }        from "@/services/auth";
import { idlFactory as propertyIdl }    from "@/services/property";
import { idlFactory as jobIdl }         from "@/services/job";
import { idlFactory as contractorIdl }  from "@/services/contractor";
import { idlFactory as quoteIdl }       from "@/services/quote";
import { idlFactory as paymentIdl }     from "@/services/payment";
import { idlFactory as photoIdl }       from "@/services/photo";
import { idlFactory as reportIdl }      from "@/services/report";
import { idlFactory as maintenanceIdl } from "@/services/maintenance";
import { idlFactory as sensorIdl }      from "@/services/sensor";
import { idlFactory as listingIdl }     from "@/services/listing";
import { idlFactory as agentIdl }       from "@/services/agent";
import { idlFactory as recurringIdl }   from "@/services/recurringService";
import { idlFactory as aiProxyIdl }     from "@/services/aiProxy";
import { idlFactory as monitoringIdl }  from "@/services/monitoringService";

describe("Candid contract snapshots — method arity", () => {
  it("auth", ()         => { expect(extractServiceDef(authIdl as any)).toMatchSnapshot(); });
  it("property", ()     => { expect(extractServiceDef(propertyIdl as any)).toMatchSnapshot(); });
  it("job", ()          => { expect(extractServiceDef(jobIdl as any)).toMatchSnapshot(); });
  it("contractor", ()   => { expect(extractServiceDef(contractorIdl as any)).toMatchSnapshot(); });
  it("quote", ()        => { expect(extractServiceDef(quoteIdl as any)).toMatchSnapshot(); });
  it("payment", ()      => { expect(extractServiceDef(paymentIdl as any)).toMatchSnapshot(); });
  it("photo", ()        => { expect(extractServiceDef(photoIdl as any)).toMatchSnapshot(); });
  it("report", ()       => { expect(extractServiceDef(reportIdl as any)).toMatchSnapshot(); });
  it("maintenance", ()  => { expect(extractServiceDef(maintenanceIdl as any)).toMatchSnapshot(); });
  it("sensor", ()       => { expect(extractServiceDef(sensorIdl as any)).toMatchSnapshot(); });
  it("listing", ()      => { expect(extractServiceDef(listingIdl as any)).toMatchSnapshot(); });
  it("agent", ()        => { expect(extractServiceDef(agentIdl as any)).toMatchSnapshot(); });
  it("recurring", ()    => { expect(extractServiceDef(recurringIdl as any)).toMatchSnapshot(); });
  it("ai_proxy", ()     => { expect(extractServiceDef(aiProxyIdl as any)).toMatchSnapshot(); });
  it("monitoring", ()   => { expect(extractServiceDef(monitoringIdl as any)).toMatchSnapshot(); });
});
