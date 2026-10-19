/// RFC 4122 version-4 UUIDs built from random bytes.
///
///   let id = Uuid.fromBlob(await Random.blob());
///   // "3f2b8c1e-9a4d-4e7f-b1c2-0d9e8f7a6b5c"
///
/// Uses the first 16 bytes of `b`; missing bytes (a blob shorter than 16)
/// are treated as 0, so always pass `Random.blob()` (32 bytes) output.
/// Output is lowercase 8-4-4-4-12 hex with the version nibble set to 4 and
/// the variant bits set to 10xx.
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Char "mo:core/Char";

module {
  let HEX : [Char] = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'];

  public func fromBlob(b : Blob) : Text {
    let src = b.toArray();
    var out = "";
    var i = 0;
    while (i < 16) {
      var byte : Nat8 = if (i < src.size()) src[i] else 0;
      if (i == 6) byte := (byte & 0x0f) | 0x40;  // version 4
      if (i == 8) byte := (byte & 0x3f) | 0x80;  // variant 10xx
      if (i == 4 or i == 6 or i == 8 or i == 10) out #= "-";
      let n = byte.toNat();
      out #= HEX[n / 16].toText() # HEX[n % 16].toText();
      i += 1;
    };
    out
  };
};
