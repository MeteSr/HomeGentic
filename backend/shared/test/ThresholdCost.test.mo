// Unit tests for shared/ThresholdCost.mo budgets. Run with scripts/ci/test-motoko-units.sh.
import ThresholdCost "../ThresholdCost";

let DAY : Int = 86_400_000_000_000;

// counts up to the daily max, then refuses until the next UTC day
do {
  let b = ThresholdCost.newBudget();
  assert ThresholdCost.take(b, 5, 2);
  assert ThresholdCost.take(b, 6, 2);
  assert not ThresholdCost.take(b, 7, 2);
  assert not ThresholdCost.take(b, DAY - 1, 2);
  assert ThresholdCost.take(b, DAY, 2);       // new day
  assert b.used == 1;
};

// the cycles floor keeps one more fee after the call
do {
  assert ThresholdCost.affordable(60, 30);
  assert not ThresholdCost.affordable(59, 30);
};
