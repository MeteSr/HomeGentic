/// The HomeGentic Score — the one formula, used by the market canister for
/// certificates, the FSBO index and competitive analysis. Mirrors
/// packages/shared/src/score.ts, which the web and mobile apps use, so the
/// number a homeowner sees is the number a buyer or lender sees. The test
/// vectors in backend/shared/test/Score.test.mo and
/// frontend/src/__tests__/services/sharedScore.test.ts are the same; change
/// both together.
///
///   score = (maintenance × 40 + modernization × 35 + verification × 25) / 100
///
/// Each dimension is 0–100:
///   • Maintenance coverage: key systems with a job on record, weighted
///     (HVAC 25, Roofing 25, Plumbing 15, Electrical 15, Windows 10, any
///     other trade 10). A system earns its weight once, from its best job:
///     verified 100 %, DIY 80 %, anything else 50 %.
///   • System modernization: remaining life of each major system, weighted.
///     A system's age counts from its most recent major job (at least
///     replacementMinCents for that system), else from the year built.
///   • Verification depth: the share of jobs that are verified.
///
/// Pure functions; holds no state.

import Int "mo:core/Int";

module {
  public type Job = {
    serviceType   : Text;
    completedYear : Nat;
    amountCents   : Nat;
    isDiy         : Bool;
    isVerified    : Bool;
  };

  public type Breakdown = {
    maintenance   : Nat;
    modernization : Nat;
    verification  : Nat;
    total         : Nat;
  };

  /// Maintenance-coverage weight per key system; "other" is any other trade.
  public let MAINTENANCE_SYSTEMS : [(Text, Nat)] = [
    ("HVAC", 25), ("Roofing", 25), ("Plumbing", 15), ("Electrical", 15), ("Windows", 10), ("other", 10),
  ];

  /// (system, lifespan years, modernization weight)
  public let SYSTEM_LIFESPANS : [(Text, Nat, Nat)] = [
    ("HVAC", 18, 25), ("Roofing", 25, 25), ("Plumbing", 50, 15),
    ("Electrical", 35, 15), ("Windows", 22, 10), ("Flooring", 25, 10),
  ];

  /// The smallest job that counts as replacing a system for modernization.
  public func replacementMinCents(sys : Text) : Nat {
    switch (sys) {
      case "HVAC" 300_000;
      case "Roofing" 500_000;
      case "Plumbing" 250_000;
      case "Electrical" 200_000;
      case "Windows" 250_000;
      case "Flooring" 200_000;
      case _ 0;
    }
  };

  func isNamedSystem(t : Text) : Bool {
    t == "HVAC" or t == "Roofing" or t == "Plumbing" or t == "Electrical" or t == "Windows"
  };

  func jobFactor(j : Job) : Nat {
    if (j.isVerified) 10 else if (j.isDiy) 8 else 5
  };

  public func maintenance(jobs : [Job]) : Nat {
    var total = 0;
    for ((sys, weight) in MAINTENANCE_SYSTEMS.values()) {
      var best = 0;
      for (j in jobs.values()) {
        let matches = if (sys == "other") not isNamedSystem(j.serviceType) else j.serviceType == sys;
        if (matches) {
          let f = jobFactor(j);
          if (f > best) best := f;
        };
      };
      total += weight * best / 10;
    };
    total
  };

  public func modernization(jobs : [Job], yearBuilt : Nat, currentYear : Nat) : Nat {
    var weightedSum = 0;
    var totalWeight = 0;
    for ((sys, lifespan, weight) in SYSTEM_LIFESPANS.values()) {
      totalWeight += weight;
      let min = replacementMinCents(sys);
      var lastYear = yearBuilt;
      for (j in jobs.values()) {
        if (j.serviceType == sys and j.amountCents >= min and j.completedYear > lastYear) {
          lastYear := j.completedYear;
        };
      };
      let ageInt : Int = (currentYear : Int) - (lastYear : Int);
      let age : Nat = if (ageInt > 0) Int.abs(ageInt) else 0;
      let fraction : Nat = if (age >= lifespan) 0 else (lifespan - age) * 100 / lifespan;
      weightedSum += weight * fraction;
    };
    if (totalWeight == 0) 0 else weightedSum / totalWeight
  };

  public func verification(jobs : [Job]) : Nat {
    if (jobs.size() == 0) return 0;
    var verified = 0;
    for (j in jobs.values()) { if (j.isVerified) verified += 1 };
    verified * 100 / jobs.size()
  };

  public func combine(m : Nat, mod : Nat, v : Nat) : Nat {
    (m * 40 + mod * 35 + v * 25) / 100
  };

  public func breakdown(jobs : [Job], yearBuilt : Nat, currentYear : Nat) : Breakdown {
    let m = maintenance(jobs);
    let mod = modernization(jobs, yearBuilt, currentYear);
    let v = verification(jobs);
    { maintenance = m; modernization = mod; verification = v; total = combine(m, mod, v) }
  };

  /// The calendar year (UTC) of a nanosecond timestamp, leap years included.
  public func yearOf(nowNs : Int) : Nat {
    var days : Int = nowNs / 86_400_000_000_000;
    var year : Nat = 1970;
    loop {
      let len : Int = if ((year % 4 == 0 and year % 100 != 0) or year % 400 == 0) 366 else 365;
      if (days < len) return year;
      days -= len;
      year += 1;
    }
  };
};
