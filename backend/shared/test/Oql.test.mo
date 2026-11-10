// Unit tests for shared/Oql.mo. Run with scripts/ci/test-motoko-units.sh.
import Oql "../Oql";
import Array "mo:core/Array";
import Text "mo:core/Text";

let entity : Oql.Entity = {
  name = "jobs";
  primaryKey = "id";
  description = "Test jobs";
  fields = [
    { name = "id";          typeName = #text;  nullable = false; description = "Id" },
    { name = "kind";        typeName = #text;  nullable = false; description = "Kind" },
    { name = "amountCents"; typeName = #int;   nullable = false; description = "Cost" },
    { name = "done";        typeName = #bool;  nullable = false; description = "Done" },
    { name = "rating";      typeName = #float; nullable = true;  description = "Rating" },
    { name = "note";        typeName = #text;  nullable = true;  description = "Note" },
  ];
};
let entities = [entity];

func row(id : Text, kind : Text, amount : Int, done : Bool, rating : ?Float, note : ?Text) : Oql.Row {
  [
    #text(id), #text(kind), #int(amount), #bool(done),
    switch (rating) { case (?r) #float(r); case null #null_ },
    switch (note) { case (?n) #text(n); case null #null_ },
  ]
};

let rows : [Oql.Row] = [
  row("j1", "HVAC",     50_000, true,  ?4.5, ?"Replaced Filter"),
  row("j2", "Roofing", 900_000, true,  null, null),
  row("j3", "HVAC",     20_000, false, ?3.0, ?"tune-up"),
  row("j4", "Plumbing", 15_000, true,  ?5.0, null),
  row("j5", "HVAC",     30_000, true,  null, ?"filter swap"),
];

func q(t : Text) : Oql.Query {
  switch (Oql.parse(t, entities)) {
    case (#ok(x)) x;
    case (#err(_)) { assert false; loop {} };
  }
};
func run(t : Text) : Oql.Result = Oql.run(q(t), rows.values());
func bad(t : Text) : Bool {
  switch (Oql.parse(t, entities)) { case (#err(_)) true; case (#ok(_)) false }
};
func ids(r : Oql.Result) : [Text] {
  r.rows.map(func cells {
    var out = "";
    for (c in cells.values()) if (c.name == "id") switch (c.value) { case (#text(t)) out := t; case _ {} };
    out
  })
};
func cell(cells : [Oql.Cell], name : Text) : ?Oql.CellValue {
  for (c in cells.values()) if (c.name == name) return ?c.value;
  null
};

// schema: entities, primary key and every field with its type and role
do {
  let s = Oql.schemaJson(entities);
  assert s.contains(#text "\"entities\":[");
  assert s.contains(#text "\"name\":\"jobs\"");
  assert s.contains(#text "\"primaryKey\":\"id\"");
  assert s.contains(#text "{\"name\":\"amountCents\",\"typeName\":\"int\",\"role\":\"payload\",\"nullable\":false,\"description\":\"Cost\"}");
  assert s.contains(#text "\"typeName\":\"float\",\"role\":\"payload\",\"nullable\":true");
};

// start is required and must name an entity; unknown keys and fields are refused
do {
  assert bad("{}");
  assert bad("not json");
  assert bad("{\"start\":\"people\"}");
  assert bad("{\"start\":\"jobs\",\"select\":[\"nope\"]}");
  assert bad("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"nope\",\"value\":1}}}");
  assert bad("{\"start\":\"jobs\",\"select\":[\"kind.name\"]}");   // no edges here
  assert bad("{\"start\":\"jobs\",\"bogus\":1}");
  assert Oql.start(q("{\"start\":\"jobs\"}")) == "jobs";
};

// no filters: every row, every field, in input order
do {
  let r = run("{\"start\":\"jobs\"}");
  assert not r.hasMore;
  assert ids(r) == ["j1", "j2", "j3", "j4", "j5"];
  assert r.rows[0].size() == 6;
  assert cell(r.rows[1], "rating") == ?#null_;
};

// relations, with a type check against the field
do {
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"kind\",\"value\":\"HVAC\"}}}")) == ["j1", "j3", "j5"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"gt\":{\"field\":\"amountCents\",\"value\":30000}}}")) == ["j1", "j2"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"le\":{\"field\":\"amountCents\",\"value\":20000}}}")) == ["j3", "j4"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"done\",\"value\":false}}}")) == ["j3"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"ge\":{\"field\":\"rating\",\"value\":4}}}")) == ["j1", "j4"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"in\":{\"field\":\"kind\",\"value\":[\"Roofing\",\"Plumbing\"]}}}")) == ["j2", "j4"];
  assert bad("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"amountCents\",\"value\":\"lots\"}}}");
  assert bad("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"kind\",\"value\":3}}}");
  assert bad("{\"start\":\"jobs\",\"where\":{\"in\":{\"field\":\"kind\",\"value\":\"HVAC\"}}}");
  assert bad("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"kind\",\"value\":\"a\"},\"ne\":{\"field\":\"kind\",\"value\":\"b\"}}}");
};

// null fails every relation except ne
do {
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"lt\":{\"field\":\"rating\",\"value\":100}}}")) == ["j1", "j3", "j4"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"ne\":{\"field\":\"rating\",\"value\":4.5}}}")) == ["j2", "j3", "j4", "j5"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"note\",\"value\":null}}}")) == [];
};

// text matching; icontains ignores case
do {
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"contains\":{\"field\":\"note\",\"value\":\"filter\"}}}")) == ["j5"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"icontains\":{\"field\":\"note\",\"value\":\"FILTER\"}}}")) == ["j1", "j5"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"startsWith\":{\"field\":\"kind\",\"value\":\"Ro\"}}}")) == ["j2"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"endsWith\":{\"field\":\"kind\",\"value\":\"ing\"}}}")) == ["j2", "j4"];
  assert bad("{\"start\":\"jobs\",\"where\":{\"contains\":{\"field\":\"amountCents\",\"value\":\"1\"}}}");
};

// and / or / not
do {
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"and\":[{\"eq\":{\"field\":\"kind\",\"value\":\"HVAC\"}},{\"eq\":{\"field\":\"done\",\"value\":true}}]}}")) == ["j1", "j5"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"or\":[{\"eq\":{\"field\":\"kind\",\"value\":\"Roofing\"}},{\"lt\":{\"field\":\"amountCents\",\"value\":16000}}]}}")) == ["j2", "j4"];
  assert ids(run("{\"start\":\"jobs\",\"where\":{\"not\":{\"eq\":{\"field\":\"kind\",\"value\":\"HVAC\"}}}}")) == ["j2", "j4"];
};

// select, orderBy, offset, limit and hasMore
do {
  let r = run("{\"start\":\"jobs\",\"select\":[\"id\",\"amountCents\"],\"orderBy\":[{\"field\":\"amountCents\",\"dir\":\"desc\"}],\"limit\":2}");
  assert ids(r) == ["j2", "j1"];
  assert r.hasMore;
  assert r.rows[0].size() == 2;
  assert r.rows[0][0].name == "id" and r.rows[0][1].name == "amountCents";
  let r2 = run("{\"start\":\"jobs\",\"orderBy\":[{\"field\":\"amountCents\",\"dir\":\"desc\"}],\"offset\":2,\"limit\":2}");
  assert ids(r2) == ["j5", "j3"];
  assert r2.hasMore;
  let r3 = run("{\"start\":\"jobs\",\"orderBy\":[{\"field\":\"amountCents\"}],\"offset\":4}");
  assert ids(r3) == ["j2"];
  assert not r3.hasMore;
  // ties keep input order; a second key breaks them
  assert ids(run("{\"start\":\"jobs\",\"orderBy\":[{\"field\":\"kind\"}]}")) == ["j1", "j3", "j5", "j4", "j2"];
  assert ids(run("{\"start\":\"jobs\",\"orderBy\":[{\"field\":\"kind\"},{\"field\":\"amountCents\",\"dir\":\"asc\"}]}")) == ["j3", "j5", "j1", "j4", "j2"];
  // nulls sort last either way
  assert ids(run("{\"start\":\"jobs\",\"orderBy\":[{\"field\":\"rating\",\"dir\":\"desc\"}]}")) == ["j4", "j1", "j3", "j2", "j5"];
  assert bad("{\"start\":\"jobs\",\"orderBy\":[{\"field\":\"kind\",\"dir\":\"up\"}]}");
  assert bad("{\"start\":\"jobs\",\"limit\":-1}");
};

func rowsN(n : Nat) : [Oql.Row] {
  var out : [Oql.Row] = [];
  var i = 0;
  while (i < n) { out := out.concat([row("x", "HVAC", 1, true, null, null)]); i += 1 };
  out
};

// limit defaults to 50 and is capped at 200
do {
  let many = Oql.run(q("{\"start\":\"jobs\",\"limit\":500}"), rowsN(250).values());
  assert many.rows.size() == 200 and many.hasMore;
  let dflt = Oql.run(q("{\"start\":\"jobs\"}"), rowsN(60).values());
  assert dflt.rows.size() == 50 and dflt.hasMore;
};

// aggregates: count, sum, avg, min, max, with and without groupBy
do {
  let all = run("{\"start\":\"jobs\",\"aggregate\":[{\"fn\":\"count\",\"as\":\"n\"},{\"fn\":\"sum\",\"field\":\"amountCents\",\"as\":\"total\"}]}");
  assert all.rows.size() == 1;
  assert cell(all.rows[0], "n") == ?#int(5);
  assert cell(all.rows[0], "total") == ?#int(1_015_000);

  let g = run("{\"start\":\"jobs\",\"groupBy\":[\"kind\"],\"aggregate\":[{\"fn\":\"sum\",\"field\":\"amountCents\",\"as\":\"total\"},{\"fn\":\"count\",\"as\":\"n\"},{\"fn\":\"avg\",\"field\":\"rating\",\"as\":\"avgRating\"},{\"fn\":\"max\",\"field\":\"amountCents\",\"as\":\"biggest\"},{\"fn\":\"min\",\"field\":\"note\",\"as\":\"firstNote\"}],\"orderBy\":[{\"field\":\"total\",\"dir\":\"desc\"}]}");
  assert g.rows.size() == 3;
  assert cell(g.rows[0], "kind") == ?#text("Roofing");
  assert cell(g.rows[0], "avgRating") == ?#null_;          // all nulls
  assert cell(g.rows[0], "firstNote") == ?#null_;
  assert cell(g.rows[1], "kind") == ?#text("HVAC");
  assert cell(g.rows[1], "total") == ?#int(100_000);
  assert cell(g.rows[1], "n") == ?#int(3);
  assert cell(g.rows[1], "avgRating") == ?#float(3.75);     // nulls skipped
  assert cell(g.rows[1], "biggest") == ?#int(50_000);
  assert cell(g.rows[1], "firstNote") == ?#text("Replaced Filter");
  assert g.rows[1].size() == 6;

  // groupBy alone lists the distinct values
  let kinds = run("{\"start\":\"jobs\",\"groupBy\":[\"kind\"],\"orderBy\":[{\"field\":\"kind\"}]}");
  assert kinds.rows.size() == 3 and kinds.rows[0].size() == 1;
  assert cell(kinds.rows[0], "kind") == ?#text("HVAC");

  // where applies before grouping
  let done = run("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"done\",\"value\":true}},\"aggregate\":[{\"fn\":\"count\",\"as\":\"n\"}]}");
  assert cell(done.rows[0], "n") == ?#int(4);

  // a count over no rows is 0, a sum over none is null
  let none = run("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"kind\",\"value\":\"Pool\"}},\"aggregate\":[{\"fn\":\"count\",\"as\":\"n\"},{\"fn\":\"sum\",\"field\":\"amountCents\",\"as\":\"t\"}]}");
  assert cell(none.rows[0], "n") == ?#int(0);
  assert cell(none.rows[0], "t") == ?#null_;

  // alias defaults to fn_field; sums need a number field; bad fn refused
  let d = run("{\"start\":\"jobs\",\"aggregate\":[{\"fn\":\"sum\",\"field\":\"amountCents\"}]}");
  assert cell(d.rows[0], "sum_amountCents") == ?#int(1_015_000);
  assert bad("{\"start\":\"jobs\",\"aggregate\":[{\"fn\":\"sum\",\"field\":\"kind\"}]}");
  assert bad("{\"start\":\"jobs\",\"aggregate\":[{\"fn\":\"median\",\"field\":\"amountCents\"}]}");
  assert bad("{\"start\":\"jobs\",\"aggregate\":[{\"fn\":\"sum\"}]}");
  // orderBy after grouping names an output column
  assert bad("{\"start\":\"jobs\",\"groupBy\":[\"kind\"],\"orderBy\":[{\"field\":\"amountCents\"}]}");
};

// hostile input is refused before any row is read
do {
  var big = "{\"start\":\"jobs\",\"where\":{\"or\":[";
  var i = 0;
  while (i < 100) { big #= (if (i > 0) "," else "") # "{\"eq\":{\"field\":\"kind\",\"value\":\"x\"}}"; i += 1 };
  big #= "]}}";
  assert bad(big);                                   // over 64 predicate nodes
  var long = "{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"kind\",\"value\":\"";
  i := 0;
  while (i < 5000) { long #= "a"; i += 1 };
  long #= "\"}}}";
  assert bad(long);                                  // over 4,096 characters
};

// hints: text values a query pins a field to, at the top level or under a top-level and
do {
  assert Oql.textHints(q("{\"start\":\"jobs\",\"where\":{\"eq\":{\"field\":\"kind\",\"value\":\"HVAC\"}}}"), "kind") == ["HVAC"];
  assert Oql.textHints(q("{\"start\":\"jobs\",\"where\":{\"in\":{\"field\":\"kind\",\"value\":[\"A\",\"B\"]}}}"), "kind") == ["A", "B"];
  assert Oql.textHints(q("{\"start\":\"jobs\",\"where\":{\"and\":[{\"eq\":{\"field\":\"done\",\"value\":true}},{\"eq\":{\"field\":\"kind\",\"value\":\"C\"}}]}}"), "kind") == ["C"];
  assert Oql.textHints(q("{\"start\":\"jobs\",\"where\":{\"or\":[{\"eq\":{\"field\":\"kind\",\"value\":\"C\"}}]}}"), "kind") == [];
  assert Oql.textHints(q("{\"start\":\"jobs\"}"), "kind") == [];
};

// timestamps as UTC calendar dates and years
do {
  assert Oql.isoDate(0) == "1970-01-01";
  assert Oql.isoDate(1_719_835_200_000_000_000) == "2024-07-01";   // 2024-07-01T12:00Z
  assert Oql.isoDate(951_782_400_000_000_000) == "2000-02-29";     // leap day in a century leap year
  assert Oql.isoDate(1_735_689_599_000_000_000) == "2024-12-31";   // last second of a leap year
  assert Oql.isoDate(-86_400_000_000_000) == "1969-12-31";
  assert Oql.yearOfNs(1_719_835_200_000_000_000) == 2024;
};
