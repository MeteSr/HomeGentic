// Unit tests for shared/Uuid.mo. Run with scripts/ci/test-motoko-units.sh.
import Uuid  "../Uuid";
import Nat   "mo:core/Nat";
import Text  "mo:core/Text";
import Array "mo:core/Array";
import Nat8  "mo:core/Nat8";

func isHex(c : Char) : Bool = (c >= '0' and c <= '9') or (c >= 'a' and c <= 'f');

func wellFormed(u : Text) : Bool {
  let cs = u.toArray();
  if (cs.size() != 36) return false;
  for (i in cs.keys()) {
    let dash = i == 8 or i == 13 or i == 18 or i == 23;
    if (dash) { if (cs[i] != '-') return false }
    else if (not isHex(cs[i])) return false;
  };
  cs[14] == '4' and (cs[19] == '8' or cs[19] == '9' or cs[19] == 'a' or cs[19] == 'b')
};

// all-zero bytes: only version/variant bits set
do {
  let u = Uuid.fromBlob(Array.repeat<Nat8>(0, 32).toBlob());
  assert u == "00000000-0000-4000-8000-000000000000";
  assert wellFormed(u);
};

// all-0xff bytes: version/variant bits cleared to the right values
do {
  let u = Uuid.fromBlob(Array.repeat<Nat8>(0xff, 32).toBlob());
  assert u == "ffffffff-ffff-4fff-bfff-ffffffffffff";
  assert wellFormed(u);
};

// sequential bytes: layout and only the first 16 bytes are used
do {
  let bytes = Array.tabulate(32, func i = Nat.toNat8(i * 7 % 256));
  let u = Uuid.fromBlob(bytes.toBlob());
  assert u == "00070e15-1c23-4a31-b83f-464d545b6269";
  assert wellFormed(u);
  // bytes beyond 16 don't matter
  let bytes2 = Array.tabulate<Nat8>(32, func i = if (i < 16) Nat.toNat8(i * 7 % 256) else 0xaa);
  assert Uuid.fromBlob(bytes2.toBlob()) == u;
};

// short blob is zero-padded, never traps
do {
  let u = Uuid.fromBlob(([0x12, 0x34] : [Nat8]).toBlob());
  assert u == "12340000-0000-4000-8000-000000000000";
  assert wellFormed(Uuid.fromBlob(([] : [Nat8]).toBlob()));
};
