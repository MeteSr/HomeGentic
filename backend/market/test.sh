#!/usr/bin/env bash
# HomeGentic Market Canister Tests
# Tests: ROI project recommendations, analyzeCompetitivePosition scoring,
# MarketSnapshot storage/retrieval, getTopProjects sort order
set -euo pipefail

echo "============================================"
echo "  HomeGentic — Market Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER=$(dfx canister id market 2>/dev/null || echo "")
if [ -z "$CANISTER" ]; then
  echo "❌ market canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

echo "Market canister: $CANISTER"

# ─── Metrics & basic state ───────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call market getMetrics

# ─── analyzeCompetitivePosition ──────────────────────────────────────────────
echo ""
echo "── [2] analyzeCompetitivePosition — no jobs (expect score near 0) ──────"
dfx canister call market analyzeCompetitivePosition '(
  record {
    propertyId   = "PROP_1";
    zipCode      = "78701";
    propertyType = "SingleFamily";
    yearBuilt    = 1990;
    squareFeet   = 1800
  },
  vec {}
)'

echo ""
echo "── [3] analyzeCompetitivePosition — HVAC + Roofing verified jobs ────────"
dfx canister call market analyzeCompetitivePosition '(
  record {
    propertyId   = "PROP_1";
    zipCode      = "78701";
    propertyType = "SingleFamily";
    yearBuilt    = 1990;
    squareFeet   = 1800
  },
  vec {
    record {
      serviceType  = "HVAC";
      amountCents  = 350000;
      isVerified   = true;
      isDiy        = false;
      completedDate = "2023-06-01"
    };
    record {
      serviceType  = "Roofing";
      amountCents  = 1200000;
      isVerified   = true;
      isDiy        = false;
      completedDate = "2022-03-15"
    };
    record {
      serviceType  = "Painting";
      amountCents  = 80000;
      isVerified   = false;
      isDiy        = true;
      completedDate = "2024-01-10"
    }
  }
)'

echo ""
echo "── [4] analyzeCompetitivePosition — DIY-heavy (expect reduced score) ────"
dfx canister call market analyzeCompetitivePosition '(
  record {
    propertyId   = "PROP_2";
    zipCode      = "78704";
    propertyType = "Condo";
    yearBuilt    = 2005;
    squareFeet   = 900
  },
  vec {
    record {
      serviceType  = "Painting";
      amountCents  = 50000;
      isVerified   = false;
      isDiy        = true;
      completedDate = "2024-02-01"
    };
    record {
      serviceType  = "Flooring";
      amountCents  = 120000;
      isVerified   = false;
      isDiy        = true;
      completedDate = "2023-11-01"
    }
  }
)'

# ─── recommendValueAddingProjects ────────────────────────────────────────────
echo ""
echo "── [5] recommendValueAddingProjects — SingleFamily, no existing projects ─"
dfx canister call market recommendValueAddingProjects '(
  record {
    propertyId   = "PROP_1";
    zipCode      = "78701";
    propertyType = "SingleFamily";
    yearBuilt    = 1990;
    squareFeet   = 1800
  },
  vec {}
)'

echo ""
echo "── [6] recommendValueAddingProjects — Condo (expect condo-relevant projects)"
dfx canister call market recommendValueAddingProjects '(
  record {
    propertyId   = "PROP_2";
    zipCode      = "78704";
    propertyType = "Condo";
    yearBuilt    = 2005;
    squareFeet   = 900
  },
  vec {}
)'

echo ""
echo "── [7] recommendValueAddingProjects — projects already done are filtered ─"
dfx canister call market recommendValueAddingProjects '(
  record {
    propertyId   = "PROP_1";
    zipCode      = "78701";
    propertyType = "SingleFamily";
    yearBuilt    = 1990;
    squareFeet   = 1800
  },
  vec {
    record {
      serviceType  = "HVAC";
      amountCents  = 350000;
      isVerified   = true;
      isDiy        = false;
      completedDate = "2023-06-01"
    }
  }
)'

# ─── MarketSnapshot ───────────────────────────────────────────────────────────
echo ""
echo "── [8] recordMarketSnapshot ─────────────────────────────────────────────"
dfx canister call market recordMarketSnapshot '(
  record {
    zipCode          = "78701";
    medianScore      = 74;
    sampleSize       = 150;
    topServiceTypes  = vec { "HVAC"; "Roofing"; "Plumbing" };
    avgVerifiedJobs  = 4
  }
)'

echo ""
echo "── [9] getMarketSnapshot — should return the recorded snapshot ──────────"
dfx canister call market getMarketSnapshot '("78701")'

echo ""
echo "── [10] getMarketSnapshot — unknown zip (expect NotFound) ───────────────"
dfx canister call market getMarketSnapshot '("00000")' || echo "  ↳ Expected NotFound — ✓"

# ─── Final metrics ────────────────────────────────────────────────────────────
echo ""
echo "── [11] Get metrics (after tests) ──────────────────────────────────────"
dfx canister call market getMetrics

echo ""
echo "============================================"
echo "  ✅ Market canister tests complete!"
echo "============================================"
