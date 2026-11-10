/// OQL: the query convention ICP MCP reads (service-discoverability skill,
/// Layer 4; dfinity/imcp2 `oql-primer.md`). A canister exposes
///
///   schema  : ()     -> (text)   query            // JSON catalogue of entities
///   execute : (text) -> (Result) (composite) query // one JSON query -> paged rows
///
/// so an AI assistant can answer open-ended questions ("what did I spend on
/// HVAC since 2023?") with one call that filters and adds up inside the
/// canister, instead of a method per question or every record in its context.
///
/// This module is the canister-independent part: parsing and checking a query
/// against an entity's fields, and running it over rows the canister has
/// already scoped to what the caller may see. It never decides access.
///
/// Query object (only `start` is required):
///   {"start":"<entity>", "where":<pred>, "groupBy":["f"],
///    "aggregate":[{"fn":"count|sum|avg|min|max","field":"f","as":"out"}],
///    "orderBy":[{"field":"f","dir":"asc|desc"}], "offset":N, "limit":N, "select":["f"]}
/// Predicates have exactly one operator key:
///   {"eq|ne|lt|le|gt|ge":{"field":"f","value":v}}  {"in":{"field":"f","value":[v,...]}}
///   {"contains|startsWith|endsWith|icontains":{"field":"f","value":"t"}}
///   {"and":[p,...]}  {"or":[p,...]}  {"not":p}
/// A null field fails every relation except ne. Entities here have no edges,
/// so dotted paths are refused.
import Array "mo:core/Array";
import Char "mo:core/Char";
import Float "mo:core/Float";
import Int "mo:core/Int";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Order "mo:core/Order";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Json "Json";

module {
  // ─── Public types ──────────────────────────────────────────────────────────

  public type FieldType = { #text; #int; #float; #bool };
  public type Field = { name : Text; typeName : FieldType; nullable : Bool; description : Text };
  public type Entity = { name : Text; primaryKey : Text; description : Text; fields : [Field] };

  public type CellValue = { #text : Text; #int : Int; #float : Float; #bool : Bool; #null_ };
  public type Cell = { name : Text; value : CellValue };
  public type Result = { hasMore : Bool; rows : [[Cell]] };

  /// One record, its values in the entity's field order.
  public type Row = [CellValue];

  // ─── Limits ────────────────────────────────────────────────────────────────

  public let MAX_QUERY_CHARS : Nat = 4_096;
  public let MAX_PREDICATE_NODES : Nat = 64;
  public let DEFAULT_LIMIT : Nat = 50;
  public let MAX_LIMIT : Nat = 200;
  public let MAX_OFFSET : Nat = 100_000;
  let MAX_LIST : Nat = 20; // select / groupBy / aggregate / orderBy entries

  // ─── Parsed query ──────────────────────────────────────────────────────────

  type Rel = { #eq; #ne; #lt; #le; #gt; #ge };
  type Match = { #contains; #startsWith; #endsWith; #icontains };
  type Pred = {
    #rel : (Rel, Nat, CellValue);
    #inList : (Nat, [CellValue]);
    #textMatch : (Match, Nat, Text);
    #all : [Pred];
    #any : [Pred];
    #neg : Pred;
  };
  type AggFn = { #count; #sum; #avg; #min; #max };
  type Agg = { fn : AggFn; field : ?Nat; alias : Text };

  public type Query = {
    entity : Entity;
    filter : ?Pred;
    groupBy : [Nat];
    aggs : [Agg];
    orderBy : [(Text, Bool)]; // (column, descending)
    offset : Nat;
    limit : Nat;
    select : [Text];
  };

  public func start(q : Query) : Text = q.entity.name;

  // ─── Schema ────────────────────────────────────────────────────────────────

  public func typeText(t : FieldType) : Text {
    switch t { case (#text) "text"; case (#int) "int"; case (#float) "float"; case (#bool) "bool" }
  };

  public func jsonString(t : Text) : Text {
    var out = "\"";
    for (c in t.chars()) {
      let n = c.toNat32();
      out #= (
        if (c == '\"') "\\\""
        else if (c == '\\') "\\\\"
        else if (c == '\n') "\\n"
        else if (c == '\r') "\\r"
        else if (c == '\t') "\\t"
        else if (n < 0x20) "\\u00" # (if (n < 0x10) "0" else "1") # hexDigit(n % 16)
        else c.toText()
      );
    };
    out # "\""
  };
  func hexDigit(n : Nat32) : Text {
    let digits = "0123456789abcdef".toArray();
    digits[n.toNat()].toText()
  };

  /// The JSON catalogue `schema()` returns.
  public func schemaJson(entities : [Entity]) : Text {
    let es = entities.map(
      func e {
        let fs = e.fields.map(
          func f {
            "{\"name\":" # jsonString(f.name) # ",\"typeName\":\"" # typeText(f.typeName) #
            "\",\"role\":\"payload\",\"nullable\":" # (if (f.nullable) "true" else "false") #
            ",\"description\":" # jsonString(f.description) # "}"
          }
        );
        "{\"name\":" # jsonString(e.name) # ",\"primaryKey\":" # jsonString(e.primaryKey) #
        ",\"description\":" # jsonString(e.description) # ",\"fields\":[" # fs.values().join(",") # "]}"
      }
    );
    "{\"entities\":[" # es.values().join(",") # "]}"
  };

  // ─── Parsing ───────────────────────────────────────────────────────────────

  func fieldIndex(e : Entity, name : Text) : Result.Result<Nat, Text> {
    for (i in e.fields.keys()) if (e.fields[i].name == name) return #ok(i);
    if (name.contains(#char '.')) #err("\"" # name # "\": " # e.name # " has no edges, so dotted paths aren't supported")
    else #err("unknown field \"" # name # "\" on " # e.name)
  };

  /// A JSON value as a value of the field's type; numbers convert between int
  /// and float fields, and null fits any field.
  func coerce(f : Field, v : Json.Value) : Result.Result<CellValue, Text> {
    switch (f.typeName, v) {
      case (_, #null_) #ok(#null_);
      case (#text, #text(t)) #ok(#text(t));
      case (#bool, #bool(b)) #ok(#bool(b));
      case (#int, #int(n)) #ok(#int(n));
      case (#int, #float(x)) #ok(#float(x));
      case (#float, #int(n)) #ok(#float(n.toFloat()));
      case (#float, #float(x)) #ok(#float(x));
      case _ #err("value for \"" # f.name # "\" must be " # typeText(f.typeName));
    }
  };

  func textOf(v : ?Json.Value, what : Text) : Result.Result<Text, Text> {
    switch v { case (?#text(t)) #ok(t); case _ #err(what # " must be a string") }
  };

  func onlyKeys(v : Json.Value, allowed : [Text], what : Text) : Result.Result<[(Text, Json.Value)], Text> {
    switch v {
      case (#obj(kvs)) {
        for ((k, _) in kvs.values()) {
          if (allowed.find(func a = a == k) == null) return #err("unknown key \"" # k # "\" in " # what);
        };
        #ok(kvs)
      };
      case _ #err(what # " must be an object");
    }
  };

  func parsePred(e : Entity, v : Json.Value, count : [var Nat]) : Result.Result<Pred, Text> {
    count[0] += 1;
    if (count[0] > MAX_PREDICATE_NODES) return #err("where has more than " # MAX_PREDICATE_NODES.toText() # " conditions");
    let kvs = switch v {
      case (#obj(kvs)) kvs;
      case _ return #err("each condition must be an object");
    };
    if (kvs.size() != 1) return #err("each condition needs exactly one operator");
    let (op, arg) = kvs[0];
    switch op {
      case ("and" or "or") {
        let items = switch arg { case (#arr(a)) a; case _ return #err(op # " takes a list of conditions") };
        let out = List.empty<Pred>();
        for (item in items.values()) {
          switch (parsePred(e, item, count)) { case (#ok(p)) out.add(p); case (#err(m)) return #err(m) };
        };
        #ok(if (op == "and") #all(out.toArray()) else #any(out.toArray()))
      };
      case "not" {
        switch (parsePred(e, arg, count)) { case (#ok(p)) #ok(#neg(p)); case (#err(m)) #err(m) }
      };
      case _ {
        let body = switch (onlyKeys(arg, ["field", "value"], op)) { case (#ok(b)) b; case (#err(m)) return #err(m) };
        let fname = switch (textOf(Json.field(#obj(body), "field"), op # ".field")) { case (#ok(t)) t; case (#err(m)) return #err(m) };
        let idx = switch (fieldIndex(e, fname)) { case (#ok(i)) i; case (#err(m)) return #err(m) };
        let f = e.fields[idx];
        let value = switch (Json.field(#obj(body), "value")) { case (?x) x; case null return #err(op # " needs a value") };
        let rel : ?Rel = switch op {
          case "eq" ?#eq; case "ne" ?#ne; case "lt" ?#lt; case "le" ?#le; case "gt" ?#gt; case "ge" ?#ge;
          case _ null;
        };
        switch rel {
          case (?r) {
            return switch (coerce(f, value)) { case (#ok(c)) #ok(#rel(r, idx, c)); case (#err(m)) #err(m) };
          };
          case null {};
        };
        if (op == "in") {
          let items = switch value { case (#arr(a)) a; case _ return #err("in takes a list of values") };
          let out = List.empty<CellValue>();
          for (item in items.values()) {
            switch (coerce(f, item)) { case (#ok(c)) out.add(c); case (#err(m)) return #err(m) };
          };
          return #ok(#inList(idx, out.toArray()));
        };
        let m : Match = switch op {
          case "contains" #contains; case "startsWith" #startsWith; case "endsWith" #endsWith; case "icontains" #icontains;
          case _ return #err("unknown operator \"" # op # "\"");
        };
        if (f.typeName != #text) return #err(op # " works on text fields only, not \"" # fname # "\"");
        switch value { case (#text(t)) #ok(#textMatch(m, idx, t)); case _ #err(op # " needs a string value") }
      };
    }
  };

  func nameList(v : ?Json.Value, what : Text) : Result.Result<[Text], Text> {
    switch v {
      case null #ok([]);
      case (?#arr(items)) {
        if (items.size() > MAX_LIST) return #err(what # " has more than " # MAX_LIST.toText() # " entries");
        let out = List.empty<Text>();
        for (item in items.values()) {
          switch item { case (#text(t)) out.add(t); case _ return #err(what # " must list field names") };
        };
        #ok(out.toArray())
      };
      case _ #err(what # " must be a list");
    }
  };

  func natOf(v : ?Json.Value, what : Text, dflt : Nat) : Result.Result<Nat, Text> {
    switch v {
      case null #ok(dflt);
      case (?#int(n)) if (n >= 0) #ok(n.toNat()) else #err(what # " can't be negative");
      case _ #err(what # " must be a whole number");
    }
  };

  /// Parses and checks one query against the entities. Every name and value
  /// type is checked here, so `run` can't fail.
  public func parse(text : Text, entities : [Entity]) : Result.Result<Query, Text> {
    if (text.size() > MAX_QUERY_CHARS) return #err("the query is longer than " # MAX_QUERY_CHARS.toText() # " characters");
    let v = switch (Json.parse(text)) { case (?v) v; case null return #err("the query isn't valid JSON") };
    switch (onlyKeys(v, ["start", "where", "groupBy", "aggregate", "orderBy", "offset", "limit", "select"], "the query")) {
      case (#err(m)) return #err(m);
      case (#ok(_)) {};
    };
    let startName = switch (textOf(Json.field(v, "start"), "start")) { case (#ok(t)) t; case (#err(m)) return #err(m) };
    let entity = switch (entities.find(func(e : Entity) : Bool = e.name == startName)) {
      case (?e) e;
      case null {
        let names = entities.map(func(e : Entity) : Text = e.name).values().join(", ");
        return #err("unknown entity \"" # startName # "\" (this canister has: " # names # ")");
      };
    };

    let filter = switch (Json.field(v, "where")) {
      case null null;
      case (?w) switch (parsePred(entity, w, [var 0])) { case (#ok(p)) ?p; case (#err(m)) return #err(m) };
    };

    let groupNames = switch (nameList(Json.field(v, "groupBy"), "groupBy")) { case (#ok(l)) l; case (#err(m)) return #err(m) };
    let groupBy = List.empty<Nat>();
    for (g in groupNames.values()) {
      switch (fieldIndex(entity, g)) { case (#ok(i)) groupBy.add(i); case (#err(m)) return #err(m) };
    };

    let aggs = List.empty<Agg>();
    switch (Json.field(v, "aggregate")) {
      case null {};
      case (?#arr(items)) {
        if (items.size() > MAX_LIST) return #err("aggregate has more than " # MAX_LIST.toText() # " entries");
        for (item in items.values()) {
          let body = switch (onlyKeys(item, ["fn", "field", "as"], "aggregate")) { case (#ok(b)) #obj(b); case (#err(m)) return #err(m) };
          let fnName = switch (textOf(Json.field(body, "fn"), "aggregate.fn")) { case (#ok(t)) t; case (#err(m)) return #err(m) };
          let fn : AggFn = switch fnName {
            case "count" #count; case "sum" #sum; case "avg" #avg; case "min" #min; case "max" #max;
            case _ return #err("unknown aggregate \"" # fnName # "\" (use count, sum, avg, min or max)");
          };
          let field : ?Nat = switch (Json.field(body, "field")) {
            case null { if (fn != #count) return #err(fnName # " needs a field"); null };
            case (?#text(fname)) switch (fieldIndex(entity, fname)) { case (#ok(i)) ?i; case (#err(m)) return #err(m) };
            case _ return #err("aggregate.field must be a string");
          };
          switch (fn, field) {
            case ((#sum or #avg), ?i) {
              let t = entity.fields[i].typeName;
              if (t != #int and t != #float) return #err(fnName # " needs a number field, not \"" # entity.fields[i].name # "\"");
            };
            case _ {};
          };
          let alias = switch (Json.field(body, "as")) {
            case null switch field { case (?i) fnName # "_" # entity.fields[i].name; case null fnName };
            case (?#text(a)) a;
            case _ return #err("aggregate.as must be a string");
          };
          aggs.add({ fn; field; alias });
        };
      };
      case _ return #err("aggregate must be a list");
    };

    let grouped = groupBy.size() > 0 or aggs.size() > 0;
    // the columns a grouped query returns, which select and orderBy may name
    let outCols : [Text] =
      if grouped groupNames.concat(aggs.toArray().map(func(a : Agg) : Text = a.alias))
      else entity.fields.map(func(f : Field) : Text = f.name);
    for (i in outCols.keys()) {
      for (j in Nat.range(0, i)) if (outCols[i] == outCols[j]) return #err("column \"" # outCols[i] # "\" appears twice");
    };
    func checkCol(c : Text) : ?Text {
      if (outCols.find(func(o : Text) : Bool = o == c) != null) return null;
      if (grouped) ?("\"" # c # "\" isn't a column of the grouped result (" # outCols.values().join(", ") # ")")
      else switch (fieldIndex(entity, c)) { case (#err(m)) ?m; case (#ok(_)) null };
    };

    let orderBy = List.empty<(Text, Bool)>();
    switch (Json.field(v, "orderBy")) {
      case null {};
      case (?#arr(items)) {
        if (items.size() > MAX_LIST) return #err("orderBy has more than " # MAX_LIST.toText() # " entries");
        for (item in items.values()) {
          let body = switch (onlyKeys(item, ["field", "dir"], "orderBy")) { case (#ok(b)) #obj(b); case (#err(m)) return #err(m) };
          let col = switch (textOf(Json.field(body, "field"), "orderBy.field")) { case (#ok(t)) t; case (#err(m)) return #err(m) };
          switch (checkCol(col)) { case (?m) return #err(m); case null {} };
          let desc = switch (Json.field(body, "dir")) {
            case null false;
            case (?#text("asc")) false;
            case (?#text("desc")) true;
            case _ return #err("orderBy.dir must be \"asc\" or \"desc\"");
          };
          orderBy.add((col, desc));
        };
      };
      case _ return #err("orderBy must be a list");
    };

    let select = switch (nameList(Json.field(v, "select"), "select")) { case (#ok(l)) l; case (#err(m)) return #err(m) };
    for (c in select.values()) switch (checkCol(c)) { case (?m) return #err(m); case null {} };

    let offset = switch (natOf(Json.field(v, "offset"), "offset", 0)) { case (#ok(n)) n; case (#err(m)) return #err(m) };
    if (offset > MAX_OFFSET) return #err("offset is at most " # MAX_OFFSET.toText());
    let limit = switch (natOf(Json.field(v, "limit"), "limit", DEFAULT_LIMIT)) { case (#ok(n)) Nat.min(n, MAX_LIMIT); case (#err(m)) return #err(m) };

    #ok({
      entity;
      filter;
      groupBy = groupBy.toArray();
      aggs = aggs.toArray();
      orderBy = orderBy.toArray();
      offset;
      limit;
      select;
    })
  };

  /// The text values a query pins `fieldName` to with eq or in, at the top
  /// level or directly under a top-level and. Lets a canister work out which
  /// records to load (and check access to) before running the query.
  public func textHints(q : Query, fieldName : Text) : [Text] {
    let idx = switch (fieldIndex(q.entity, fieldName)) { case (#ok(i)) i; case (#err(_)) return [] };
    let out = List.empty<Text>();
    func take(p : Pred) {
      switch p {
        case (#rel(#eq, i, #text(t))) if (i == idx) out.add(t);
        case (#inList(i, vs)) if (i == idx) for (v in vs.values()) switch v { case (#text(t)) out.add(t); case _ {} };
        case _ {};
      };
    };
    switch (q.filter) {
      case (?#all(ps)) for (p in ps.values()) take(p);
      case (?p) take(p);
      case null {};
    };
    out.toArray()
  };


  // ─── Dates ─────────────────────────────────────────────────────────────────

  /// (year, month, day) in UTC of a nanosecond timestamp (Hinnant's
  /// civil_from_days, valid for any day count).
  func civil(ns : Int) : (Int, Nat, Nat) {
    let dayNs : Int = 86_400_000_000_000;
    let days = if (ns >= 0) ns / dayNs else (ns - dayNs + 1) / dayNs; // floor
    let z = days + 719_468;
    let era = (if (z >= 0) z else z - 146_096) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    let y = yoe + era * 400 + (if (m <= 2) 1 else 0);
    (y, Int.abs(m), Int.abs(d))
  };

  func pad2(n : Nat) : Text = if (n < 10) "0" # n.toText() else n.toText();

  /// A nanosecond timestamp as a `YYYY-MM-DD` date (UTC), which sorts and
  /// compares correctly as text.
  public func isoDate(ns : Int) : Text {
    let (y, m, d) = civil(ns);
    var padded = Int.abs(y).toText();
    while (padded.size() < 4) padded := "0" # padded;
    (if (y < 0) "-" else "") # padded # "-" # pad2(m) # "-" # pad2(d)
  };

  /// The UTC calendar year of a nanosecond timestamp.
  public func yearOfNs(ns : Int) : Int = civil(ns).0;

  // ─── Running ───────────────────────────────────────────────────────────────

  /// Orders two non-null values of the same field; numbers compare across int
  /// and float. Null when either side is null.
  func cmp(a : CellValue, b : CellValue) : ?Order.Order {
    switch (a, b) {
      case (#null_, _) null;
      case (_, #null_) null;
      case (#text(x), #text(y)) ?Text.compare(x, y);
      case (#int(x), #int(y)) ?Int.compare(x, y);
      case (#int(x), #float(y)) ?Float.compare(x.toFloat(), y);
      case (#float(x), #int(y)) ?Float.compare(x, y.toFloat());
      case (#float(x), #float(y)) ?Float.compare(x, y);
      case (#bool(x), #bool(y)) ?(if (x == y) #equal else if (not x) #less else #greater);
      case _ null;
    }
  };

  func holds(p : Pred, row : Row) : Bool {
    switch p {
      case (#rel(r, i, v)) {
        switch (cmp(row[i], v)) {
          case null r == #ne;
          case (?o) switch r {
            case (#eq) o == #equal;
            case (#ne) o != #equal;
            case (#lt) o == #less;
            case (#le) o != #greater;
            case (#gt) o == #greater;
            case (#ge) o != #less;
          };
        }
      };
      case (#inList(i, vs)) vs.any(func(v : CellValue) : Bool = cmp(row[i], v) == ?#equal);
      case (#textMatch(m, i, t)) {
        switch (row[i]) {
          case (#text(s)) switch m {
            case (#contains) s.contains(#text t);
            case (#startsWith) s.startsWith(#text t);
            case (#endsWith) s.endsWith(#text t);
            case (#icontains) s.toLower().contains(#text(t.toLower()));
          };
          case _ false;
        }
      };
      case (#all(ps)) ps.all(func(x : Pred) : Bool = holds(x, row));
      case (#any(ps)) ps.any(func(x : Pred) : Bool = holds(x, row));
      case (#neg(x)) not holds(x, row);
    }
  };

  /// Sorts by the given (column index, descending) keys; nulls go last either
  /// way and ties keep their input order.
  func sortRows(rows : [Row], keys : [(Nat, Bool)]) : [Row] {
    if (keys.size() == 0) return rows;
    let indexed = Array.tabulate(rows.size(), func(i : Nat) : ((Nat, Row)) = (i, rows[i]));
    let sorted = indexed.sort(
      func(a : (Nat, Row), b : (Nat, Row)) : Order.Order {
        for ((col, desc) in keys.values()) {
          let (x, y) = (a.1[col], b.1[col]);
          switch (x, y) {
            case (#null_, #null_) {};
            case (#null_, _) return #greater;
            case (_, #null_) return #less;
            case _ switch (cmp(x, y)) {
              case (?#less) return if desc #greater else #less;
              case (?#greater) return if desc #less else #greater;
              case _ {};
            };
          };
        };
        Nat.compare(a.0, b.0)
      }
    );
    sorted.map(func(p : (Nat, Row)) : Row = p.1)
  };

  func indexOf(cols : [Text], c : Text) : Nat {
    for (i in cols.keys()) if (cols[i] == c) return i;
    0 // unreachable: parse checked every column name
  };

  func page(q : Query, cols : [Text], rows : [Row]) : Result {
    let sorted = sortRows(rows, q.orderBy.map(func(o : (Text, Bool)) : ((Nat, Bool)) = (indexOf(cols, o.0), o.1)));
    let picked = if (q.select.size() == 0) Array.tabulate(cols.size(), func(i : Nat) : Nat = i) else q.select.map(func(c : Text) : Nat = indexOf(cols, c));
    let from = Nat.min(q.offset, sorted.size());
    let to = Nat.min(from + q.limit, sorted.size());
    let out = List.empty<[Cell]>();
    for (r in Nat.range(from, to)) {
      out.add(picked.map(func(i : Nat) : Cell = { name = cols[i]; value = sorted[r][i] }));
    };
    { hasMore = to < sorted.size(); rows = out.toArray() }
  };

  type Acc = { var n : Nat; var sumI : Int; var sumF : Float; var seen : Nat; var best : CellValue };

  func groupKey(row : Row, cols : [Nat]) : Text {
    var k = "";
    for (c in cols.values()) {
      k #= (
        switch (row[c]) {
          case (#text(t)) "t" # t;
          case (#int(n)) "i" # n.toText();
          case (#float(x)) "f" # x.toText();
          case (#bool(b)) if b "b1" else "b0";
          case (#null_) "n";
        }
      ) # "\u{0}";
    };
    k
  };

  /// Runs a parsed query over rows the caller may see.
  public func run(q : Query, rows : Iter.Iter<Row>) : Result {
    let cols = q.entity.fields.map(func(f : Field) : Text = f.name);
    let grouped = q.groupBy.size() > 0 or q.aggs.size() > 0;
    let pass = func(r : Row) : Bool = switch (q.filter) { case null true; case (?p) holds(p, r) };

    if (not grouped) {
      let kept = List.empty<Row>();
      // without a sort, stop once we know whether there's a next page
      let enough = q.offset + q.limit + 1;
      label scan for (r in rows) {
        if (pass(r)) {
          kept.add(r);
          if (q.orderBy.size() == 0 and kept.size() >= enough) break scan;
        };
      };
      return page(q, cols, kept.toArray());
    };

    let keyOrder = List.empty<(Text, Row, [Acc])>();
    let slots = Map.empty<Text, Nat>();
    func newAccs() : [Acc] = Array.tabulate(q.aggs.size(), func(_ : Nat) : Acc = { var n = 0; var sumI = 0; var sumF = 0.0; var seen = 0; var best = #null_ });
    if (q.groupBy.size() == 0) keyOrder.add(("", [], newAccs()));
    for (r in rows) {
      if (pass(r)) {
        let key = groupKey(r, q.groupBy);
        let slot = switch (slots.get(key)) {
          case (?s) s;
          case null {
            if (q.groupBy.size() == 0) 0 else {
              keyOrder.add((key, r, newAccs()));
              let s : Nat = keyOrder.size() - 1;
              slots.add(key, s);
              s
            }
          };
        };
        let (_, _, accs) = keyOrder.at(slot);
        for (j in q.aggs.keys()) {
          let a = q.aggs[j];
          let acc = accs[j];
          switch (a.field) {
            case null acc.n += 1;
            case (?f) {
              let v = r[f];
              if (v != #null_) {
                acc.n += 1;
                acc.seen += 1;
                switch v { case (#int(x)) { acc.sumI += x; acc.sumF += x.toFloat() }; case (#float(x)) acc.sumF += x; case _ {} };
                let better = switch (acc.best, a.fn) {
                  case (#null_, _) true;
                  case (b, #min) cmp(v, b) == ?#less;
                  case (b, #max) cmp(v, b) == ?#greater;
                  case _ false;
                };
                if better acc.best := v;
              };
            };
          };
        };
      };
    };

    let outCols = q.groupBy.map(func(i : Nat) : Text = cols[i]).concat(q.aggs.map(func(a : Agg) : Text = a.alias));
    let out = List.empty<Row>();
    for ((_, first, accs) in keyOrder.values()) {
      let keyVals = q.groupBy.map(func(i : Nat) : CellValue = first[i]);
      let aggVals = Array.tabulate(
        q.aggs.size(),
        func(j : Nat) : CellValue {
          let a = q.aggs[j];
          let acc = accs[j];
          let isInt = switch (a.field) { case (?f) q.entity.fields[f].typeName == #int; case null true };
          switch (a.fn) {
            case (#count) #int(acc.n);
            case (#sum) if (acc.seen == 0) #null_ else if isInt #int(acc.sumI) else #float(acc.sumF);
            case (#avg) if (acc.seen == 0) #null_ else #float(acc.sumF / acc.seen.toFloat());
            case (#min or #max) acc.best;
          }
        },
      );
      out.add(keyVals.concat(aggVals));
    };
    page(q, outCols, out.toArray())
  };
};
