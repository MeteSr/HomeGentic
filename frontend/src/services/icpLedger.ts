import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/icp_ledger";
import type { _SERVICE as IcpLedgerCanister } from "@homegentic/shared/types/icp_ledger";
export { idlFactory };

const ICP_LEDGER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai";


const getActor = lazyActor<IcpLedgerCanister>(idlFactory, ICP_LEDGER_ID);

export const icpLedgerService = {
  /**
   * Approve the payment canister to spend amountE8s on behalf of the caller.
   * Sets a short expiry (10 minutes) to limit exposure if subscribe fails.
   * Triggers an Internet Identity popup for user confirmation.
   */
  async approve(spenderCanisterId: string, amountE8s: bigint): Promise<void> {
    const { Principal } = await import("@icp-sdk/core/principal");
    const a = await getActor();
    const expiresAtNs = BigInt(Date.now()) * BigInt(1_000_000) + BigInt(10 * 60 * 1_000_000_000);
    const result = await a.icrc2_approve({
      from_subaccount:    [],
      spender:            { owner: Principal.fromText(spenderCanisterId), subaccount: [] },
      amount:             amountE8s,
      expected_allowance: [],
      expires_at:         [expiresAtNs],
      fee:                [BigInt(10_000)],
      memo:               [],
      created_at_time:    [],
    });
    if ("Err" in result) {
      if ("InsufficientFunds" in result.Err) {
        throw new Error(`Insufficient ICP balance (have ${result.Err.InsufficientFunds.balance} e8s)`);
      }
      throw new Error(`Approve failed: ${Object.keys(result.Err)[0]}`);
    }
  },

  /** Returns the caller's ICP balance in e8s. */
  async getBalance(principalText: string): Promise<bigint> {
    const { Principal } = await import("@icp-sdk/core/principal");
    const a = await getActor();
    return a.icrc1_balance_of({ owner: Principal.fromText(principalText), subaccount: [] });
  },

  reset() { getActor.reset(); },
};
