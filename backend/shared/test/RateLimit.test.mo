// Unit tests for shared/RateLimit.mo. Run with scripts/ci/test-motoko-units.sh.
import RateLimit "../RateLimit";
import Map       "mo:core/Map";
import Nat       "mo:core/Nat";

let MIN = RateLimit.WINDOW_NS;

// counts up to the limit, then refuses until the window closes
do {
  let l : RateLimit.Limits = Map.empty();
  assert RateLimit.tryConsume(l, "a", 0, 3);
  assert RateLimit.tryConsume(l, "a", 1, 3);
  assert RateLimit.tryConsume(l, "a", 2, 3);
  assert not RateLimit.tryConsume(l, "a", 3, 3);
  assert not RateLimit.tryConsume(l, "a", MIN - 1, 3);
  assert RateLimit.tryConsume(l, "a", MIN, 3);       // new window
  assert RateLimit.tryConsume(l, "b", 3, 3);         // other callers unaffected
};

// a limit of 0 means unlimited
do {
  let l : RateLimit.Limits = Map.empty();
  var i = 0;
  while (i < 100) { assert RateLimit.tryConsume(l, "a", 0, 0); i += 1 };
};

// closed windows are swept as new callers arrive
do {
  let l : RateLimit.Limits = Map.empty();
  var i = 0;
  while (i < RateLimit.SWEEP_EVERY) { ignore RateLimit.tryConsume(l, i.toText(), 0, 30); i += 1 };
  assert l.size() == RateLimit.SWEEP_EVERY;
  ignore RateLimit.tryConsume(l, "late", MIN, 30);   // every earlier window has closed
  assert l.size() == 1;
};

// sweep keeps open windows
do {
  let l : RateLimit.Limits = Map.empty();
  ignore RateLimit.tryConsume(l, "old", 0, 30);
  ignore RateLimit.tryConsume(l, "new", MIN, 30);
  RateLimit.sweep(l, MIN);
  assert l.size() == 1;
  assert not RateLimit.tryConsume(l, "new", MIN, 1); // still counted
};
