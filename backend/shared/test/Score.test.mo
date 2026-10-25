// Unit tests for shared/Score.mo. Run with scripts/ci/test-motoko-units.sh.
// Same vectors as frontend/src/__tests__/services/sharedScore.test.ts: the
// web app and the canisters must give every home the same score.
import Score "../Score";
import Array "mo:core/Array";

func j(serviceType : Text, completedYear : Nat, amountCents : Nat, isDiy : Bool, isVerified : Bool) : Score.Job {
  { serviceType; completedYear; amountCents; isDiy; isVerified }
};

// no jobs: only the age of the house counts
assert Score.breakdown([], 2000, 2026) == { maintenance = 0; modernization = 10; verification = 0; total = 3 };

// 100 verified filter changes: HVAC covered once, and a $90 job isn't a replacement
let filters = Array.tabulate<Score.Job>(100, func _ = j("HVAC", 2025, 9_000, false, true));
assert Score.breakdown(filters, 2000, 2026) == { maintenance = 25; modernization = 10; verification = 100; total = 38 };

// one verified $14k roof outscores them
assert Score.breakdown([j("Roofing", 2025, 1_400_000, false, true)], 2000, 2026)
  == { maintenance = 25; modernization = 34; verification = 100; total = 46 };

// mixed: verified, DIY, unverified, and an "other" trade
assert Score.breakdown([
  j("HVAC", 2020, 800_000, false, true),
  j("Plumbing", 2023, 30_000, true, false),
  j("Electrical", 2022, 250_000, false, false),
  j("Painting", 2024, 150_000, false, true),
], 1995, 2026) == { maintenance = 54; modernization = 35; verification = 50; total = 46 };

// a well-kept newer home
assert Score.breakdown([
  j("HVAC", 2024, 900_000, false, true),
  j("Roofing", 2023, 1_600_000, false, true),
  j("Plumbing", 2022, 400_000, false, true),
  j("Electrical", 2024, 300_000, false, true),
  j("Windows", 2021, 1_200_000, false, true),
  j("Flooring", 2023, 600_000, false, true),
  j("Painting", 2024, 300_000, true, true),
], 2015, 2026) == { maintenance = 100; modernization = 88; verification = 100; total = 95 };

// best job per system wins, whatever the order
assert Score.maintenance([j("HVAC", 2020, 100, false, false), j("HVAC", 2021, 100, false, true)]) == 25;

// calendar year, leap years included
assert Score.yearOf(0) == 1970;
assert Score.yearOf(1_704_067_199_000_000_000) == 2023; // 2023-12-31T23:59:59Z
assert Score.yearOf(1_704_067_200_000_000_000) == 2024; // 2024-01-01T00:00:00Z
assert Score.yearOf(1_735_689_599_000_000_000) == 2024; // 2024-12-31T23:59:59Z
