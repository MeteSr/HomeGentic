// Generated from ../declarations/icp_ledger.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Account = {
  owner: Principal;
  subaccount: [] | [Uint8Array | number[]];
};

export type ApproveArgs = {
  fee: [] | [bigint];
  memo: [] | [Uint8Array | number[]];
  from_subaccount: [] | [Uint8Array | number[]];
  created_at_time: [] | [bigint];
  amount: bigint;
  expected_allowance: [] | [bigint];
  expires_at: [] | [bigint];
  spender: Account;
};

export type ApproveError =
  | {
      GenericError: {
        message: string;
        error_code: bigint;
      };
    }
  | { TemporarilyUnavailable: null }
  | {
      Duplicate: {
        duplicate_of: bigint;
      };
    }
  | {
      BadFee: {
        expected_fee: bigint;
      };
    }
  | {
      AllowanceChanged: {
        current_allowance: bigint;
      };
    }
  | {
      CreatedInFuture: {
        ledger_time: bigint;
      };
    }
  | { TooOld: null }
  | {
      Expired: {
        ledger_time: bigint;
      };
    }
  | {
      InsufficientFunds: {
        balance: bigint;
      };
    };

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  icrc1_balance_of: ActorMethod<[Account], bigint>;
  icrc2_approve: ActorMethod<[ApproveArgs], { Ok: bigint } | { Err: ApproveError }>;
}
