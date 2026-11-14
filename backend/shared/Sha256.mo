/// SHA-256 (FIPS 180-4). mo:core has no hash functions and the build can't
/// fetch a mops package for one, so this is a small self-contained version.
/// Used to store bearer tokens hashed (auth's agent sessions); it is not on a
/// hot path, so clarity wins over speed.
import Blob "mo:core/Blob";
import Char "mo:core/Char";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Nat32 "mo:core/Nat32";
import Nat64 "mo:core/Nat64";
import Text "mo:core/Text";
import VarArray "mo:core/VarArray";

module {
  let K : [Nat32] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  func n32(b : Nat8) : Nat32 { b.toNat().toNat32() };
  func byteOf(x : Nat32) : Nat8 { (x & 0xff).toNat().toNat8() };

  /// The 32-byte SHA-256 digest of `data`.
  public func digest(data : Blob) : Blob {
    let msg = data.toArray();
    let len = msg.size();
    // Message + 0x80 + zero padding + 64-bit length, rounded up to 64 bytes.
    let total = ((len + 8) / 64 + 1) * 64;
    let buf = VarArray.repeat<Nat8>(0, total);
    var i = 0;
    while (i < len) { buf[i] := msg[i]; i += 1 };
    buf[len] := 0x80;
    let bitLen : Nat64 = len.toNat64() *% 8;
    var shift : Nat64 = 56;
    let lenAt = ((len + 8) / 64) * 64 + 56; // the last 8 bytes of buf
    var j = 0;
    while (j < 8) {
      buf[lenAt + j] := ((bitLen >> shift) & 0xff).toNat().toNat8();
      shift -%= 8;
      j += 1;
    };

    var h0 : Nat32 = 0x6a09e667;
    var h1 : Nat32 = 0xbb67ae85;
    var h2 : Nat32 = 0x3c6ef372;
    var h3 : Nat32 = 0xa54ff53a;
    var h4 : Nat32 = 0x510e527f;
    var h5 : Nat32 = 0x9b05688c;
    var h6 : Nat32 = 0x1f83d9ab;
    var h7 : Nat32 = 0x5be0cd19;

    let w = VarArray.repeat<Nat32>(0, 64);
    var off = 0;
    while (off < total) {
      var t = 0;
      while (t < 16) {
        let b = off + t * 4;
        w[t] := (n32(buf[b]) << 24) | (n32(buf[b + 1]) << 16) | (n32(buf[b + 2]) << 8) | n32(buf[b + 3]);
        t += 1;
      };
      // w[u + 16] from w[u], w[u + 1], w[u + 9], w[u + 14].
      var u = 0;
      while (u < 48) {
        let x = w[u + 1];
        let y = w[u + 14];
        let s0 = (x <>> 7) ^ (x <>> 18) ^ (x >> 3);
        let s1 = (y <>> 17) ^ (y <>> 19) ^ (y >> 10);
        w[u + 16] := w[u] +% s0 +% w[u + 9] +% s1;
        u += 1;
      };

      var a = h0;
      var b = h1;
      var c = h2;
      var d = h3;
      var e = h4;
      var f = h5;
      var g = h6;
      var h = h7;
      t := 0;
      while (t < 64) {
        let bigS1 = (e <>> 6) ^ (e <>> 11) ^ (e <>> 25);
        let ch = (e & f) ^ ((^e) & g);
        let temp1 = h +% bigS1 +% ch +% K[t] +% w[t];
        let bigS0 = (a <>> 2) ^ (a <>> 13) ^ (a <>> 22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = bigS0 +% maj;
        h := g;
        g := f;
        f := e;
        e := d +% temp1;
        d := c;
        c := b;
        b := a;
        a := temp1 +% temp2;
        t += 1;
      };
      h0 := h0 +% a;
      h1 := h1 +% b;
      h2 := h2 +% c;
      h3 := h3 +% d;
      h4 := h4 +% e;
      h5 := h5 +% f;
      h6 := h6 +% g;
      h7 := h7 +% h;
      off += 64;
    };

    let out = VarArray.repeat<Nat8>(0, 32);
    var k = 0;
    for (word in [h0, h1, h2, h3, h4, h5, h6, h7].values()) {
      out[k] := byteOf(word >> 24);
      out[k + 1] := byteOf(word >> 16);
      out[k + 2] := byteOf(word >> 8);
      out[k + 3] := byteOf(word);
      k += 4;
    };
    out.toBlob()
  };

  /// Lowercase hex of the SHA-256 of `t`'s UTF-8 bytes.
  public func hexOfText(t : Text) : Text { hexOfBlob(t.encodeUtf8()) };

  /// Lowercase hex of the SHA-256 of `data`.
  public func hexOfBlob(data : Blob) : Text {
    let hex = "0123456789abcdef".toArray();
    var s = "";
    for (byte in digest(data).toArray().values()) {
      let n = byte.toNat();
      s := s # hex[n / 16].toText() # hex[n % 16].toText();
    };
    s
  };
};
