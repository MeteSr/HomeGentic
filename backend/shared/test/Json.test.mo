// Unit tests for shared/Json.mo. Run with scripts/ci/test-motoko-units.sh.
import Json "../Json";

func p(t : Text) : ?Json.Value = Json.parse(t);

// scalars
do {
  assert p("null") == ?#null_;
  assert p("true") == ?#bool(true);
  assert p(" false ") == ?#bool(false);
  assert p("0") == ?#int(0);
  assert p("-42") == ?#int(-42);
  assert p("12500") == ?#int(12500);
  assert p("1.5") == ?#float(1.5);
  assert p("-0.25") == ?#float(-0.25);
  assert p("2e3") == ?#float(2000.0);
  assert p("\"hi\"") == ?#text("hi");
  assert p("\"\"") == ?#text("");
};

// string escapes, including \u (BMP and a surrogate pair)
do {
  assert p("\"a\\\"b\\\\c\\/d\"") == ?#text("a\"b\\c/d");
  assert p("\"line\\nnext\\ttab\"") == ?#text("line\nnext\ttab");
  assert p("\"caf\\u00e9\"") == ?#text("café");
  assert p("\"\\ud83d\\ude00\"") == ?#text("😀");
  assert p("\"plain é\"") == ?#text("plain é");
};

// arrays and objects keep order
do {
  assert p("[]") == ?#arr([]);
  assert p("[1, \"a\", true, null]") == ?#arr([#int(1), #text("a"), #bool(true), #null_]);
  assert p("{}") == ?#obj([]);
  assert p("{\"start\":\"jobs\",\"limit\":10}") == ?#obj([("start", #text("jobs")), ("limit", #int(10))]);
  assert p(" { \"a\" : [ { \"b\" : 1 } ] } ") == ?#obj([("a", #arr([#obj([("b", #int(1))])]))]);
};

// invalid input is null, never a trap
do {
  assert p("") == null;
  assert p("{") == null;
  assert p("[1,]") == null;
  assert p("{\"a\":1,}") == null;
  assert p("{\"a\" 1}") == null;
  assert p("{a:1}") == null;
  assert p("tru") == null;
  assert p("\"unterminated") == null;
  assert p("\"bad \\q escape\"") == null;
  assert p("1 2") == null;
  assert p("01") == null;
  assert p("-") == null;
  assert p("1.") == null;
  assert p("\"\\u12\"") == null;
};

// nesting is capped so a hostile query can't recurse without bound
do {
  var deep = "";
  var i = 0;
  while (i < 40) { deep #= "["; i += 1 };
  i := 0;
  while (i < 40) { deep #= "]"; i += 1 };
  assert p(deep) == null;
  assert p("[[[[[[[[1]]]]]]]]") != null;
};

// field lookup helper
do {
  let o = #obj([("a", #int(1)), ("b", #text("x"))]);
  assert Json.field(o, "a") == ?#int(1);
  assert Json.field(o, "c") == null;
  assert Json.field(#int(1), "a") == null;
};
