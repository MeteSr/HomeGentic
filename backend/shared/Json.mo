/// A small, strict JSON reader for the OQL query surface (shared/Oql.mo).
///
/// `parse` returns null for anything that isn't one well-formed JSON value; it
/// never traps. Integers without a fraction or exponent stay exact (`#int`);
/// other numbers become `#float`. Nesting is capped at `MAX_DEPTH` so a
/// hostile query can't recurse without bound. Object keys keep their order,
/// and a repeated key keeps every copy (callers look keys up with `field`,
/// which takes the first).
import Char "mo:core/Char";
import Float "mo:core/Float";
import Int "mo:core/Int";
import List "mo:core/List";
import Nat32 "mo:core/Nat32";
import Text "mo:core/Text";

module {
  public type Value = {
    #null_;
    #bool : Bool;
    #int : Int;
    #float : Float;
    #text : Text;
    #arr : [Value];
    #obj : [(Text, Value)];
  };

  public let MAX_DEPTH : Nat = 32;

  /// The first value stored under `key` when `v` is an object.
  public func field(v : Value, key : Text) : ?Value {
    switch (v) {
      case (#obj(kvs)) { for ((k, x) in kvs.values()) if (k == key) return ?x; null };
      case _ null;
    }
  };

  public func parse(t : Text) : ?Value {
    let cs = t.toArray();
    var i = 0;
    let n = cs.size();

    func peek() : ?Char = if (i < n) ?cs[i] else null;
    func skipWs() {
      label ws while (i < n) {
        let c = cs[i];
        if (c == ' ' or c == '\n' or c == '\r' or c == '\t') i += 1 else break ws;
      };
    };
    func lit(word : Text) : Bool {
      for (c in word.chars()) {
        if (i >= n or cs[i] != c) return false;
        i += 1;
      };
      true
    };
    func isDigit(c : Char) : Bool = c >= '0' and c <= '9';
    func digit(c : Char) : Nat = (c.toNat32() - '0'.toNat32()).toNat();
    func hex(c : Char) : ?Nat32 {
      if (c >= '0' and c <= '9') ?(c.toNat32() - '0'.toNat32())
      else if (c >= 'a' and c <= 'f') ?(c.toNat32() - 'a'.toNat32() + 10)
      else if (c >= 'A' and c <= 'F') ?(c.toNat32() - 'A'.toNat32() + 10)
      else null
    };
    func hex4() : ?Nat32 {
      if (i + 4 > n) return null;
      var v : Nat32 = 0;
      var k = 0;
      while (k < 4) {
        switch (hex(cs[i + k])) { case (?h) v := v * 16 + h; case null return null };
        k += 1;
      };
      i += 4;
      ?v
    };

    func str() : ?Text {
      // at the opening quote
      i += 1;
      var out = "";
      loop {
        if (i >= n) return null;
        let c = cs[i];
        i += 1;
        if (c == '\"') return ?out;
        if (c == '\\') {
          if (i >= n) return null;
          let e = cs[i];
          i += 1;
          switch (e) {
            case ('\"') out #= "\"";
            case ('\\') out #= "\\";
            case ('/') out #= "/";
            case ('b') out #= (8 : Nat32).toChar().toText();
            case ('f') out #= (12 : Nat32).toChar().toText();
            case ('n') out #= "\n";
            case ('r') out #= "\r";
            case ('t') out #= "\t";
            case ('u') {
              let hi = switch (hex4()) { case (?h) h; case null return null };
              var cp = hi;
              if (hi >= 0xD800 and hi <= 0xDBFF) {
                // a high surrogate must be followed by \u and a low one
                if (i + 2 > n or cs[i] != '\\' or cs[i + 1] != 'u') return null;
                i += 2;
                let lo = switch (hex4()) { case (?l) l; case null return null };
                if (lo < 0xDC00 or lo > 0xDFFF) return null;
                cp := 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
              } else if (hi >= 0xDC00 and hi <= 0xDFFF) return null;
              out #= (cp : Nat32).toChar().toText();
            };
            case _ return null;
          };
        } else if (c.toNat32() < 0x20) {
          return null;
        } else {
          out #= c.toText();
        };
      };
    };

    func num() : ?Value {
      var neg = false;
      if (peek() == ?'-') { neg := true; i += 1 };
      if (i >= n or not isDigit(cs[i])) return null;
      var whole : Nat = 0;
      if (cs[i] == '0') {
        i += 1;
        if (i < n and isDigit(cs[i])) return null; // no leading zeros
      } else {
        while (i < n and isDigit(cs[i])) { whole := whole * 10 + digit(cs[i]); i += 1 };
      };
      var isFloat = false;
      // mantissa digits (whole and fraction) as one exact integer, scaled at the end
      var mant : Nat = whole;
      var exp10 : Int = 0;
      if (i < n and cs[i] == '.') {
        i += 1;
        if (i >= n or not isDigit(cs[i])) return null;
        isFloat := true;
        while (i < n and isDigit(cs[i])) {
          mant := mant * 10 + digit(cs[i]);
          exp10 -= 1;
          i += 1;
        };
      };
      if (i < n and (cs[i] == 'e' or cs[i] == 'E')) {
        i += 1;
        isFloat := true;
        var expNeg = false;
        if (i < n and (cs[i] == '+' or cs[i] == '-')) { expNeg := cs[i] == '-'; i += 1 };
        if (i >= n or not isDigit(cs[i])) return null;
        var e : Nat = 0;
        while (i < n and isDigit(cs[i])) {
          if (e < 1000) e := e * 10 + digit(cs[i]);
          i += 1;
        };
        exp10 += (if expNeg (-(e : Int)) else e);
      };
      let m = mant.toFloat();
      let f : Float =
        if (exp10 >= 0) m * (10.0 ** exp10.toFloat())
        else m / (10.0 ** (-exp10).toFloat());
      if (isFloat) ?#float(if neg (-f) else f)
      else ?#int(if neg (-(whole : Int)) else whole)
    };

    func value(depth : Nat) : ?Value {
      if (depth > MAX_DEPTH) return null;
      skipWs();
      switch (peek()) {
        case null null;
        case (?'n') if (lit("null")) ?#null_ else null;
        case (?'t') if (lit("true")) ?#bool(true) else null;
        case (?'f') if (lit("false")) ?#bool(false) else null;
        case (?'\"') switch (str()) { case (?s) ?#text(s); case null null };
        case (?'[') {
          i += 1;
          let items = List.empty<Value>();
          skipWs();
          if (peek() == ?']') { i += 1; return ?#arr([]) };
          loop {
            switch (value(depth + 1)) { case (?v) items.add(v); case null return null };
            skipWs();
            switch (peek()) {
              case (?',') i += 1;
              case (?']') { i += 1; return ?#arr(items.toArray()) };
              case _ return null;
            };
          };
        };
        case (?'{') {
          i += 1;
          let kvs = List.empty<(Text, Value)>();
          skipWs();
          if (peek() == ?'}') { i += 1; return ?#obj([]) };
          loop {
            skipWs();
            if (peek() != ?'\"') return null;
            let k = switch (str()) { case (?s) s; case null return null };
            skipWs();
            if (peek() != ?':') return null;
            i += 1;
            switch (value(depth + 1)) { case (?v) kvs.add((k, v)); case null return null };
            skipWs();
            switch (peek()) {
              case (?',') i += 1;
              case (?'}') { i += 1; return ?#obj(kvs.toArray()) };
              case _ return null;
            };
          };
        };
        case (?c) if (c == '-' or isDigit(c)) num() else null;
      }
    };

    let v = value(1);
    skipWs();
    if (i != n) null else v
  };
};
