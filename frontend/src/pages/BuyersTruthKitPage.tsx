import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ShieldCheck, AlertTriangle, ChevronRight, ChevronLeft,
  Printer, Share2, ArrowRight, Check, ExternalLink, Info,
  Home, Zap, Flame, Droplets, Wind, Square, Layers,
} from "lucide-react";

/* ─── Types (mirrors server types) ────────────────────────────────────────── */
type SystemStatus = "replaced" | "original" | "unknown";

interface SystemClaim {
  status: SystemStatus;
  year?: number;
  brand?: string;
  material?: string;
  extraNotes?: string;
}

interface Claims {
  roof:          SystemClaim;
  hvacPrimary:   SystemClaim;
  hvacSecondary: SystemClaim & { present: boolean | "unknown" };
  waterHeater:   SystemClaim & { kind?: "tank" | "tankless" | "unknown" };
  electrical:    SystemClaim;
  plumbing:      SystemClaim;
  windows:       SystemClaim;
  foundation:    SystemClaim;
}

interface KitSystem {
  name:              string;
  claimed:           string;
  credibilityScore:  number;
  credibilityLabel:  "Verified" | "Plausible" | "Questionable" | "High Risk" | "Unknown";
  finding:           string;
  estimatedAge:      string;
  remainingLifespan: string;
  replacementCost:   string;
  financialRisk:     "low" | "medium" | "high";
  questions:         string[];
  documents:         string[];
  inspectorChecks:   string[];
  permitNote:        string;
}

interface RedFlag {
  severity:    "critical" | "major" | "minor";
  title:       string;
  description: string;
  action:      string;
}

interface EraRisk { item: string; description: string; likelihood: "common" | "possible" | "rare" }

interface KitAnalysis {
  overallRisk:       "low" | "medium" | "high";
  overallSummary:    string;
  systems:           KitSystem[];
  redFlags:          RedFlag[];
  eraRisks:          EraRisk[];
  generalQuestions:  string[];
  generalDocuments:  string[];
}

interface PermitResult {
  searched: boolean; found: boolean; count: number;
  records: { description: string; date?: string; status?: string }[];
  portalUrl: string; portalName: string; instructions: string; note: string;
}

interface KitResponse {
  property: { address: string; yearBuilt: number; geocoded: boolean; city?: string; state?: string };
  permits:  PermitResult;
  kit:      KitAnalysis;
}

/* ─── Defaults ───────────────────────────────────────────────────────────── */
const DEFAULT_CLAIM: SystemClaim = { status: "unknown" };
const DEFAULT_CLAIMS: Claims = {
  roof:          { ...DEFAULT_CLAIM },
  hvacPrimary:   { ...DEFAULT_CLAIM },
  hvacSecondary: { ...DEFAULT_CLAIM, present: "unknown" },
  waterHeater:   { ...DEFAULT_CLAIM, kind: "unknown" },
  electrical:    { ...DEFAULT_CLAIM },
  plumbing:      { ...DEFAULT_CLAIM },
  windows:       { ...DEFAULT_CLAIM },
  foundation:    { ...DEFAULT_CLAIM },
};

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const CSS = `
  .btk * { margin: 0; padding: 0; box-sizing: border-box; }
  .btk {
    --plum: #2E2540; --plum-mid: #6B5B7B; --plum-light: #3D3254;
    --sage: #7AAF76; --sage-light: #E5F0E4; --sage-mid: #C4DCC2;
    --butter: #F5E9BB; --blush: #F0CDBA;
    --white: #FDFCFA; --charcoal: #1E1928; --rule: rgba(46,37,64,0.1);
    --amber: #D4843A; --red: #C94C2E;
    --amber-light: #FDF0E2; --red-light: #FDECEA;
    background: var(--white); color: var(--charcoal);
    font-family: 'Plus Jakarta Sans', sans-serif; min-height: 100vh;
  }

  /* ── NAV ── */
  .btk-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 56px; height: 70px;
    background: rgba(253,252,250,0.96); backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--rule);
  }
  .btk-logo { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900; color: var(--plum); text-decoration: none; letter-spacing: -0.5px; }
  .btk-logo span { color: var(--sage); font-style: italic; font-weight: 300; }
  .btk-nav-back { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: var(--plum-mid); text-decoration: none; padding: 8px 14px; border-radius: 8px; transition: color .15s, background .15s; }
  .btk-nav-back:hover { color: var(--plum); background: rgba(46,37,64,0.05); }
  .btk-nav-cta { background: var(--plum); color: white; padding: 10px 22px; border-radius: 100px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; font-family: inherit; transition: transform .2s; text-decoration: none; display: flex; align-items: center; gap: 6px; }
  .btk-nav-cta:hover { transform: translateY(-1px); }

  /* ── HERO ── */
  .btk-hero { padding: 110px 56px 64px; max-width: 800px; margin: 0 auto; text-align: center; }
  .btk-eyebrow { display: inline-flex; align-items: center; gap: 8px; background: var(--butter); color: var(--plum); padding: 6px 16px; border-radius: 100px; font-size: 13px; font-weight: 600; margin-bottom: 24px; border: 1px solid rgba(46,37,64,0.1); }
  .btk h1 { font-family: 'Fraunces', serif; font-size: clamp(38px,5vw,62px); font-weight: 900; line-height: 1.05; letter-spacing: -2px; margin-bottom: 18px; }
  .btk h1 em { font-style: italic; color: var(--sage); font-weight: 300; }
  .btk-hero-sub { font-size: 17px; line-height: 1.75; color: var(--plum-mid); margin-bottom: 36px; }
  .btk-hero-bullets { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; margin-bottom: 40px; }
  .btk-hero-bullet { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--plum-mid); font-weight: 500; }
  .btk-hero-bullet-dot { width: 18px; height: 18px; background: var(--sage-light); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--sage); flex-shrink: 0; }
  .btk-start-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--plum); color: white; padding: 16px 36px; border-radius: 100px; font-size: 16px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; transition: transform .2s, box-shadow .2s; }
  .btk-start-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(46,37,64,0.22); }

  /* ── STEP WRAPPER ── */
  .btk-step-wrap { max-width: 720px; margin: 0 auto; padding: 80px 24px 60px; }
  .btk-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 40px; }
  .btk-prog-dot { width: 10px; height: 10px; border-radius: 50%; transition: all .2s; flex-shrink: 0; }
  .btk-prog-dot-done   { background: var(--sage); }
  .btk-prog-dot-active { background: var(--plum); transform: scale(1.3); }
  .btk-prog-dot-idle   { background: var(--rule); }
  .btk-prog-line { flex: 1; height: 1px; background: var(--rule); }
  .btk-step-label { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--sage); margin-bottom: 10px; }
  .btk h2 { font-family: 'Fraunces', serif; font-size: clamp(24px,3vw,36px); font-weight: 900; letter-spacing: -0.8px; color: var(--charcoal); margin-bottom: 8px; line-height: 1.15; }
  .btk-step-sub { font-size: 15px; color: var(--plum-mid); margin-bottom: 32px; line-height: 1.65; }

  /* ── FORM ELEMENTS ── */
  .btk-field { margin-bottom: 20px; }
  .btk-label { display: block; font-size: 13px; font-weight: 600; color: var(--plum); margin-bottom: 6px; }
  .btk-label-sub { font-size: 11px; font-weight: 400; color: var(--plum-mid); margin-left: 6px; }
  .btk-input { width: 100%; padding: 12px 16px; border: 1.5px solid var(--rule); border-radius: 10px; font-size: 15px; font-family: inherit; color: var(--charcoal); background: white; transition: border-color .15s; outline: none; }
  .btk-input:focus { border-color: var(--plum); }
  .btk-input::placeholder { color: rgba(46,37,64,0.3); }
  .btk-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .btk-select { width: 100%; padding: 11px 16px; border: 1.5px solid var(--rule); border-radius: 10px; font-size: 15px; font-family: inherit; color: var(--charcoal); background: white; cursor: pointer; outline: none; }
  .btk-select:focus { border-color: var(--plum); }

  /* ── SYSTEM CARDS ── */
  .btk-system-grid { display: flex; flex-direction: column; gap: 14px; }
  .btk-sys-card { border: 1.5px solid var(--rule); border-radius: 14px; overflow: hidden; transition: border-color .15s; }
  .btk-sys-card:focus-within { border-color: var(--plum-mid); }
  .btk-sys-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: rgba(46,37,64,0.02); border-bottom: 1px solid var(--rule); cursor: pointer; }
  .btk-sys-icon { width: 34px; height: 34px; background: var(--sage-light); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--sage); flex-shrink: 0; }
  .btk-sys-name { font-size: 14px; font-weight: 700; color: var(--plum); flex: 1; }
  .btk-sys-status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 100px; }
  .btk-sys-status-replaced { background: var(--sage-light); color: var(--sage); }
  .btk-sys-status-original { background: var(--amber-light); color: var(--amber); }
  .btk-sys-status-unknown  { background: var(--rule); color: var(--plum-mid); }
  .btk-sys-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
  .btk-status-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .btk-status-btn { padding: 7px 16px; border-radius: 100px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--rule); background: white; font-family: inherit; color: var(--plum-mid); transition: all .15s; }
  .btk-status-btn:hover { border-color: var(--plum-mid); color: var(--plum); }
  .btk-status-btn-active-replaced { background: var(--sage); color: white; border-color: var(--sage); }
  .btk-status-btn-active-original { background: var(--amber); color: white; border-color: var(--amber); }
  .btk-status-btn-active-unknown  { background: var(--plum); color: white; border-color: var(--plum); }
  .btk-inline-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .btk-inline-label { font-size: 12px; font-weight: 600; color: var(--plum-mid); margin-bottom: 5px; }
  .btk-inline-input { width: 100%; padding: 9px 12px; border: 1.5px solid var(--rule); border-radius: 8px; font-size: 13px; font-family: inherit; color: var(--charcoal); background: white; outline: none; }
  .btk-inline-input:focus { border-color: var(--plum); }
  .btk-inline-select { width: 100%; padding: 8px 12px; border: 1.5px solid var(--rule); border-radius: 8px; font-size: 13px; font-family: inherit; color: var(--charcoal); background: white; cursor: pointer; outline: none; }

  /* ── NAV BUTTONS ── */
  .btk-step-nav { display: flex; align-items: center; gap: 12px; margin-top: 36px; }
  .btk-btn-back { display: flex; align-items: center; gap: 6px; padding: 11px 22px; border-radius: 100px; font-size: 14px; font-weight: 600; background: white; border: 2px solid var(--rule); color: var(--plum-mid); cursor: pointer; font-family: inherit; transition: all .15s; }
  .btk-btn-back:hover { border-color: var(--plum-mid); color: var(--plum); }
  .btk-btn-next { display: flex; align-items: center; gap: 6px; padding: 12px 28px; border-radius: 100px; font-size: 14px; font-weight: 700; background: var(--plum); color: white; border: none; cursor: pointer; font-family: inherit; transition: transform .2s, box-shadow .2s; }
  .btk-btn-next:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(46,37,64,0.22); }
  .btk-btn-next:disabled { opacity: 0.45; cursor: not-allowed; transform: none; box-shadow: none; }

  /* ── LOADING ── */
  .btk-loading { max-width: 480px; margin: 0 auto; padding: 100px 24px; text-align: center; }
  .btk-loading-spinner { width: 48px; height: 48px; border: 3px solid var(--rule); border-top-color: var(--plum); border-radius: 50%; animation: btk-spin 0.8s linear infinite; margin: 0 auto 28px; }
  @keyframes btk-spin { to { transform: rotate(360deg); } }
  .btk-loading-step { font-size: 14px; color: var(--plum-mid); margin-top: 12px; min-height: 20px; transition: opacity .3s; }
  .btk-loading-steps { display: flex; flex-direction: column; gap: 8px; margin-top: 24px; text-align: left; max-width: 300px; margin-left: auto; margin-right: auto; }
  .btk-loading-item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .btk-loading-item-done  { color: var(--sage); }
  .btk-loading-item-active { color: var(--plum); font-weight: 600; }
  .btk-loading-item-idle  { color: var(--plum-mid); opacity: 0.5; }

  /* ── RESULTS ── */
  .btk-results { max-width: 900px; margin: 0 auto; padding: 80px 24px 80px; }
  .btk-results-header { margin-bottom: 40px; }
  .btk-results-address { font-size: 13px; font-weight: 600; color: var(--plum-mid); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
  .btk-results-title { font-family: 'Fraunces', serif; font-size: clamp(26px,3.5vw,40px); font-weight: 900; color: var(--charcoal); letter-spacing: -1px; margin-bottom: 12px; line-height: 1.1; }
  .btk-risk-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 20px; border-radius: 100px; font-size: 14px; font-weight: 700; margin-bottom: 16px; }
  .btk-risk-low    { background: var(--sage-light); color: var(--sage); }
  .btk-risk-medium { background: var(--amber-light); color: var(--amber); }
  .btk-risk-high   { background: var(--red-light); color: var(--red); }
  .btk-results-summary { font-size: 16px; line-height: 1.75; color: var(--plum-mid); margin-bottom: 24px; max-width: 680px; }
  .btk-results-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 48px; }
  .btk-action-btn { display: flex; align-items: center; gap: 7px; padding: 10px 20px; border-radius: 100px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid var(--rule); background: white; font-family: inherit; color: var(--plum); transition: all .15s; }
  .btk-action-btn:hover { background: var(--rule); }

  /* Section headings */
  .btk-section { margin-bottom: 48px; }
  .btk-section-title { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900; color: var(--charcoal); letter-spacing: -0.5px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid var(--rule); display: flex; align-items: center; gap: 10px; }

  /* Red flags */
  .btk-flags { display: flex; flex-direction: column; gap: 10px; }
  .btk-flag { border-radius: 12px; padding: 16px 18px; display: flex; gap: 14px; }
  .btk-flag-critical { background: var(--red-light);   border: 1px solid rgba(201,76,46,0.25); }
  .btk-flag-major    { background: var(--amber-light); border: 1px solid rgba(212,132,58,0.25); }
  .btk-flag-minor    { background: rgba(46,37,64,0.04); border: 1px solid var(--rule); }
  .btk-flag-icon { flex-shrink: 0; margin-top: 1px; }
  .btk-flag-title { font-size: 14px; font-weight: 700; color: var(--charcoal); margin-bottom: 4px; }
  .btk-flag-desc  { font-size: 13px; color: var(--plum-mid); line-height: 1.55; margin-bottom: 4px; }
  .btk-flag-action { font-size: 12px; font-weight: 600; color: var(--plum); }

  /* System cards */
  .btk-systems-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .btk-sys-result { border: 1.5px solid var(--rule); border-radius: 14px; overflow: hidden; }
  .btk-sys-result-header { padding: 14px 16px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--rule); }
  .btk-sys-result-icon { width: 30px; height: 30px; background: var(--sage-light); border-radius: 7px; display: flex; align-items: center; justify-content: center; color: var(--sage); flex-shrink: 0; }
  .btk-sys-result-name { font-size: 13px; font-weight: 700; color: var(--plum); flex: 1; }
  .btk-cred-badge { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; }
  .btk-cred-Verified    { background: var(--sage-light); color: var(--sage); }
  .btk-cred-Plausible   { background: #EBF5E9; color: #5A9955; }
  .btk-cred-Questionable{ background: var(--amber-light); color: var(--amber); }
  .btk-cred-High\ Risk  { background: var(--red-light); color: var(--red); }
  .btk-cred-Unknown     { background: var(--rule); color: var(--plum-mid); }
  .btk-score-bar-wrap { height: 4px; background: var(--rule); margin: 10px 16px 0; border-radius: 100px; overflow: hidden; }
  .btk-score-bar { height: 100%; border-radius: 100px; transition: width .6s ease; }
  .btk-sys-result-body { padding: 12px 16px 14px; }
  .btk-sys-finding { font-size: 12px; color: var(--plum-mid); line-height: 1.55; margin-bottom: 10px; }
  .btk-sys-meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .btk-meta-chip { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 100px; background: rgba(46,37,64,0.05); color: var(--plum); }
  .btk-meta-chip-risk-high   { background: var(--red-light); color: var(--red); }
  .btk-meta-chip-risk-medium { background: var(--amber-light); color: var(--amber); }
  .btk-meta-chip-risk-low    { background: var(--sage-light); color: var(--sage); }
  .btk-sys-expand-btn { width: 100%; text-align: left; background: none; border: none; cursor: pointer; font-size: 12px; color: var(--plum-mid); font-family: inherit; font-weight: 600; display: flex; align-items: center; gap: 4px; padding: 0; margin-top: 4px; transition: color .15s; }
  .btk-sys-expand-btn:hover { color: var(--plum); }
  .btk-sys-detail { margin-top: 12px; border-top: 1px solid var(--rule); padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
  .btk-detail-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--plum-mid); margin-bottom: 5px; }
  .btk-detail-list { display: flex; flex-direction: column; gap: 5px; }
  .btk-detail-item { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; color: var(--plum-mid); line-height: 1.5; }
  .btk-detail-bullet { flex-shrink: 0; width: 14px; height: 14px; border-radius: 50%; background: var(--sage-light); color: var(--sage); display: flex; align-items: center; justify-content: center; margin-top: 1px; font-size: 8px; font-weight: 700; }
  .btk-permit-note { font-size: 11px; background: rgba(46,37,64,0.04); border-radius: 7px; padding: 8px 10px; color: var(--plum-mid); margin-top: 6px; }

  /* Era risks */
  .btk-era-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .btk-era-card { border: 1px solid var(--rule); border-radius: 10px; padding: 12px 14px; }
  .btk-era-likelihood { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
  .btk-era-common   { color: var(--red); }
  .btk-era-possible { color: var(--amber); }
  .btk-era-rare     { color: var(--plum-mid); }
  .btk-era-item   { font-size: 13px; font-weight: 700; color: var(--plum); margin-bottom: 4px; }
  .btk-era-desc   { font-size: 12px; color: var(--plum-mid); line-height: 1.5; }

  /* Q&A lists */
  .btk-qa-list { display: flex; flex-direction: column; gap: 8px; }
  .btk-qa-item { display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px; background: rgba(46,37,64,0.03); border-radius: 9px; font-size: 13px; color: var(--plum); line-height: 1.55; }
  .btk-qa-num { flex-shrink: 0; width: 22px; height: 22px; background: var(--plum); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-top: 1px; }

  /* Permit box */
  .btk-permit-box { border: 1.5px solid var(--rule); border-radius: 12px; overflow: hidden; }
  .btk-permit-header { padding: 14px 18px; background: rgba(46,37,64,0.03); border-bottom: 1px solid var(--rule); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .btk-permit-title { font-size: 14px; font-weight: 700; color: var(--plum); }
  .btk-permit-body { padding: 16px 18px; }
  .btk-permit-note-text { font-size: 13px; color: var(--plum-mid); margin-bottom: 14px; line-height: 1.6; }
  .btk-permit-records { display: flex; flex-direction: column; gap: 7px; }
  .btk-permit-record { display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; background: var(--sage-light); border-radius: 8px; font-size: 12px; }
  .btk-permit-record-desc { font-weight: 600; color: var(--plum); }
  .btk-permit-record-meta { color: var(--plum-mid); margin-top: 2px; }
  .btk-permit-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--plum); text-decoration: none; padding: 9px 16px; border: 1.5px solid var(--rule); border-radius: 8px; transition: all .15s; }
  .btk-permit-link:hover { background: rgba(46,37,64,0.05); border-color: var(--plum-mid); }

  /* CTA band */
  .btk-cta-band { background: var(--plum); padding: 56px 40px; text-align: center; margin-top: 64px; border-radius: 20px; }
  .btk-cta-band h3 { font-family: 'Fraunces', serif; font-size: clamp(22px,3vw,34px); font-weight: 900; color: white; letter-spacing: -0.8px; margin-bottom: 12px; }
  .btk-cta-band h3 em { font-style: italic; color: var(--sage); font-weight: 300; }
  .btk-cta-band p { font-size: 15px; color: rgba(255,255,255,0.65); margin-bottom: 28px; }
  .btk-cta-pill { display: inline-flex; align-items: center; gap: 7px; background: var(--sage); color: white; padding: 14px 30px; border-radius: 100px; font-size: 15px; font-weight: 700; border: none; cursor: pointer; font-family: inherit; text-decoration: none; transition: transform .2s, box-shadow .2s; }
  .btk-cta-pill:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(122,175,118,0.35); }

  /* ── PRINT ── */
  @media print {
    .btk-nav, .btk-hero, .btk-results-actions, .btk-cta-band, .btk-sys-expand-btn { display: none !important; }
    .btk-results { padding: 20px; }
    .btk-sys-detail { display: flex !important; }
    .btk-systems-grid { grid-template-columns: 1fr 1fr; }
    body { background: white !important; }
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 740px) {
    .btk-nav { padding: 0 20px; }
    .btk-hero { padding: 90px 20px 48px; }
    .btk-row { grid-template-columns: 1fr; }
    .btk-systems-grid { grid-template-columns: 1fr; }
    .btk-inline-row { grid-template-columns: 1fr; }
    .btk-step-wrap { padding: 70px 16px 48px; }
  }
`;

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const SYSTEM_ICONS: Record<string, React.ReactNode> = {
  "Roof":            <Layers size={15} />,
  "HVAC (Primary)":  <Wind size={15} />,
  "HVAC (Secondary)": <Wind size={15} />,
  "Water Heater":    <Flame size={15} />,
  "Electrical Panel": <Zap size={15} />,
  "Plumbing":        <Droplets size={15} />,
  "Windows":         <Square size={15} />,
  "Foundation":      <Home size={15} />,
};

const INPUT_SYSTEM_ICONS: Record<string, React.ReactNode> = {
  roof:          <Layers size={16} />,
  hvacPrimary:   <Wind size={16} />,
  hvacSecondary: <Wind size={16} />,
  waterHeater:   <Flame size={16} />,
  electrical:    <Zap size={16} />,
  plumbing:      <Droplets size={16} />,
  windows:       <Square size={16} />,
  foundation:    <Home size={16} />,
};

const SYSTEM_LABELS: Record<string, string> = {
  roof: "Roof", hvacPrimary: "HVAC (Primary)", hvacSecondary: "HVAC (Secondary / Upstairs)",
  waterHeater: "Water Heater", electrical: "Electrical Panel",
  plumbing: "Plumbing", windows: "Windows", foundation: "Foundation",
};

function scoreColor(score: number) {
  if (score >= 75) return "#7AAF76";
  if (score >= 50) return "#D4843A";
  return "#C94C2E";
}

function encodeState(address: string, yearBuilt: number, claims: Claims): string {
  return btoa(JSON.stringify({ address, yearBuilt, claims }));
}

function decodeState(s: string): { address: string; yearBuilt: number; claims: Claims } | null {
  try { return JSON.parse(atob(s)); } catch { return null; }
}

const VOICE_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

async function fetchKit(address: string, yearBuilt: number, claims: Claims): Promise<KitResponse> {
  const res = await fetch(`${VOICE_URL}/api/buyers-truth-kit`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ address, yearBuilt, claims }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Analysis failed");
  }
  return res.json();
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function Progress({ step }: { step: number }) {
  const steps = ["Home Details", "Seller Claims", "Your Kit"];
  return (
    <div className="btk-progress">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`btk-prog-dot btk-prog-dot-${i < step ? "done" : i === step ? "active" : "idle"}`} title={s} />
          {i < steps.length - 1 && <div className="btk-prog-line" />}
        </React.Fragment>
      ))}
    </div>
  );
}

function StatusButtons({ value, onChange }: { value: SystemStatus; onChange: (v: SystemStatus) => void }) {
  return (
    <div className="btk-status-row">
      {(["replaced", "original", "unknown"] as SystemStatus[]).map((s) => (
        <button
          key={s}
          type="button"
          className={`btk-status-btn${value === s ? ` btk-status-btn-active-${s}` : ""}`}
          onClick={() => onChange(s)}
        >
          {s === "replaced" ? "Was Replaced" : s === "original" ? "Original to Home" : "Don't Know"}
        </button>
      ))}
    </div>
  );
}

function SystemCard({
  id, claim, onChange,
}: {
  id: keyof Claims;
  claim: SystemClaim & { present?: boolean | "unknown"; kind?: string };
  onChange: (id: keyof Claims, updated: Partial<SystemClaim & { present?: boolean | "unknown"; kind?: string }>) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="btk-sys-card">
      <div className="btk-sys-header" onClick={() => setOpen((o) => !o)}>
        <div className="btk-sys-icon">{INPUT_SYSTEM_ICONS[id]}</div>
        <div className="btk-sys-name">{SYSTEM_LABELS[id]}</div>
        <span className={`btk-sys-status-badge btk-sys-status-${claim.status}`}>
          {claim.status === "replaced" ? "Replaced" : claim.status === "original" ? "Original" : "Unknown"}
        </span>
        <ChevronRight size={15} style={{ color: "var(--plum-mid)", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
      </div>

      {open && (
        <div className="btk-sys-body">
          <StatusButtons value={claim.status} onChange={(v) => onChange(id, { status: v, year: undefined })} />

          {claim.status === "replaced" && (
            <div className="btk-inline-row">
              <div>
                <div className="btk-inline-label">Year replaced</div>
                <input
                  className="btk-inline-input" type="number" placeholder="e.g. 2019"
                  value={claim.year ?? ""} min={1950} max={new Date().getFullYear()}
                  onChange={(e) => onChange(id, { year: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div>
                <div className="btk-inline-label">Brand / contractor (optional)</div>
                <input
                  className="btk-inline-input" placeholder="e.g. Carrier, Owens Corning"
                  value={claim.brand ?? ""}
                  onChange={(e) => onChange(id, { brand: e.target.value || undefined })}
                />
              </div>
            </div>
          )}

          {/* Secondary HVAC presence toggle */}
          {id === "hvacSecondary" && (
            <div>
              <div className="btk-inline-label">Is there a second HVAC unit (e.g. for upstairs)?</div>
              <div className="btk-status-row">
                {([true, false, "unknown"] as const).map((v) => (
                  <button key={String(v)} type="button"
                    className={`btk-status-btn${claim.present === v ? " btk-status-btn-active-replaced" : ""}`}
                    onClick={() => onChange(id, { present: v })}
                  >
                    {v === true ? "Yes" : v === false ? "No" : "Not Sure"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Water heater type */}
          {id === "waterHeater" && (
            <div>
              <div className="btk-inline-label">Type</div>
              <select className="btk-inline-select" value={claim.kind ?? "unknown"}
                onChange={(e) => onChange(id, { kind: e.target.value as any })}>
                <option value="unknown">Unknown</option>
                <option value="tank">Tank (traditional)</option>
                <option value="tankless">Tankless / on-demand</option>
              </select>
            </div>
          )}

          {/* Electrical: brand hint */}
          {id === "electrical" && (
            <div>
              <div className="btk-inline-label">Panel brand (if visible on label)</div>
              <input className="btk-inline-input" placeholder="e.g. Square D, Federal Pacific, Zinsco"
                value={claim.brand ?? ""}
                onChange={(e) => onChange(id, { brand: e.target.value || undefined })}
              />
              {(claim.brand?.toLowerCase().includes("federal") || claim.brand?.toLowerCase().includes("zinsco")) && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>
                  ⚠️ This panel brand has known safety risks — flag for inspector.
                </div>
              )}
            </div>
          )}

          {/* Plumbing: material */}
          {id === "plumbing" && (
            <div>
              <div className="btk-inline-label">Pipe material (if known)</div>
              <select className="btk-inline-select" value={claim.material ?? "unknown"}
                onChange={(e) => onChange(id, { material: e.target.value || undefined })}>
                <option value="unknown">Unknown</option>
                <option value="copper">Copper</option>
                <option value="pex">PEX (flexible plastic)</option>
                <option value="pvc">PVC</option>
                <option value="galvanized">Galvanized Steel</option>
                <option value="polybutylene">Polybutylene (Quest / gray plastic)</option>
                <option value="cast iron">Cast Iron</option>
              </select>
              {claim.material === "polybutylene" && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>
                  ⚠️ Polybutylene was subject to a class-action settlement — high failure risk.
                </div>
              )}
              {claim.material === "galvanized" && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>
                  ⚠️ Galvanized steel corrodes from the inside — check water pressure and color.
                </div>
              )}
            </div>
          )}

          {/* Roof material */}
          {id === "roof" && (
            <div>
              <div className="btk-inline-label">Material (if known)</div>
              <select className="btk-inline-select" value={claim.material ?? "unknown"}
                onChange={(e) => onChange(id, { material: e.target.value || undefined })}>
                <option value="unknown">Unknown</option>
                <option value="asphalt">Asphalt shingle</option>
                <option value="metal">Metal</option>
                <option value="tile">Tile / clay</option>
                <option value="flat">Flat / TPO / EPDM</option>
              </select>
            </div>
          )}

          <div>
            <div className="btk-inline-label">Notes (anything else seller mentioned)</div>
            <input className="btk-inline-input" placeholder="e.g. 'replaced after hail storm', 'never had issues'"
              value={claim.extraNotes ?? ""}
              onChange={(e) => onChange(id, { extraNotes: e.target.value || undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CredibilityBar({ score, label }: { score: number; label: string }) {
  return (
    <>
      <span className={`btk-cred-badge btk-cred-${label.replace(" ", "\\ ")}`}>{label}</span>
      <div className="btk-score-bar-wrap">
        <div className="btk-score-bar" style={{ width: `${score}%`, background: scoreColor(score) }} />
      </div>
    </>
  );
}

function SystemResultCard({ sys }: { sys: KitSystem }) {
  const [expanded, setExpanded] = useState(false);
  const icon = SYSTEM_ICONS[sys.name] ?? <Home size={15} />;
  return (
    <div className="btk-sys-result">
      <div className="btk-sys-result-header">
        <div className="btk-sys-result-icon">{icon}</div>
        <div className="btk-sys-result-name">{sys.name}</div>
        <CredibilityBar score={sys.credibilityScore} label={sys.credibilityLabel} />
      </div>
      <div className="btk-sys-result-body">
        <p className="btk-sys-finding">{sys.finding}</p>
        <div className="btk-sys-meta-row">
          <span className="btk-meta-chip">Age: {sys.estimatedAge}</span>
          <span className="btk-meta-chip">Life left: {sys.remainingLifespan}</span>
          <span className={`btk-meta-chip btk-meta-chip-risk-${sys.financialRisk}`}>
            Replace: {sys.replacementCost}
          </span>
        </div>
        <button className="btk-sys-expand-btn" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "▲ Hide" : "▼ Show"} questions, documents & inspector checks
        </button>
        {expanded && (
          <div className="btk-sys-detail">
            {sys.questions.length > 0 && (
              <div>
                <div className="btk-detail-section-title">Questions to ask seller</div>
                <div className="btk-detail-list">
                  {sys.questions.map((q, i) => (
                    <div key={i} className="btk-detail-item">
                      <div className="btk-detail-bullet">{i + 1}</div>{q}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sys.documents.length > 0 && (
              <div>
                <div className="btk-detail-section-title">Documents to request</div>
                <div className="btk-detail-list">
                  {sys.documents.map((d, i) => (
                    <div key={i} className="btk-detail-item">
                      <div className="btk-detail-bullet">✓</div>{d}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sys.inspectorChecks.length > 0 && (
              <div>
                <div className="btk-detail-section-title">Tell your inspector</div>
                <div className="btk-detail-list">
                  {sys.inspectorChecks.map((c, i) => (
                    <div key={i} className="btk-detail-item">
                      <div className="btk-detail-bullet">→</div>{c}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sys.permitNote && (
              <div className="btk-permit-note">{sys.permitNote}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function BuyersTruthKitPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [screen, setScreen]   = useState<"landing" | 0 | 1 | "loading" | "results">("landing");
  const [address, setAddress]   = useState("");
  const [yearBuilt, setYearBuilt] = useState<number | "">("");
  const [claims, setClaims]     = useState<Claims>(DEFAULT_CLAIMS);
  const [loadStep, setLoadStep] = useState(0);
  const [kit, setKit]           = useState<KitResponse | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [expandedSystems, setExpandedSystems] = useState<Record<string, boolean>>({});
  const resultsRef = useRef<HTMLDivElement>(null);

  // Decode shared URL
  useEffect(() => {
    const encoded = searchParams.get("d");
    if (encoded) {
      const decoded = decodeState(encoded);
      if (decoded) {
        setAddress(decoded.address);
        setYearBuilt(decoded.yearBuilt);
        setClaims(decoded.claims);
        runAnalysis(decoded.address, decoded.yearBuilt, decoded.claims);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateClaim(id: keyof Claims, patch: Partial<SystemClaim & { present?: boolean | "unknown"; kind?: string }>) {
    setClaims((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function runAnalysis(addr: string, yr: number, cl: Claims) {
    setScreen("loading");
    setLoadStep(0);
    setError(null);

    const steps = [
      { label: "Locating property...",        delay: 800  },
      { label: "Querying permit records...",  delay: 2200 },
      { label: "Analyzing seller claims...",  delay: 3800 },
      { label: "Generating your kit...",      delay: 5200 },
    ];
    steps.forEach(({ delay }, i) => setTimeout(() => setLoadStep(i + 1), delay));

    try {
      const result = await fetchKit(addr, yr, cl);
      setKit(result);
      setScreen("results");
      // Update URL for sharing
      const encoded = encodeState(addr, yr, cl);
      setSearchParams({ d: encoded }, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
      setScreen(1);
    }
  }

  function handleGenerate() {
    if (!address.trim() || !yearBuilt) return;
    runAnalysis(address.trim(), Number(yearBuilt), claims);
  }

  function handleShare() {
    if (!address || !yearBuilt) return;
    const encoded = encodeState(address, Number(yearBuilt), claims);
    const url = `${window.location.origin}/truth-kit?d=${encoded}`;
    navigator.clipboard.writeText(url).then(() => alert("Link copied to clipboard!"));
  }

  function handlePrint() { window.print(); }

  const canProceedStep0 = address.trim().length > 5 && yearBuilt && Number(yearBuilt) > 1800;

  const LOAD_STEPS = [
    "Locating property...",
    "Querying permit records...",
    "Analyzing seller claims...",
    "Generating your kit...",
  ];

  return (
    <div className="btk">
      <Helmet>
        <title>Buyer's Truth Kit — Know What You're Actually Buying</title>
        <meta name="description" content="Enter any home address and seller claims. Get a personalized due-diligence kit: permit records, red flags, questions to ask, and documents to request." />
      </Helmet>
      <style>{CSS}</style>

      {/* Nav */}
      <nav className="btk-nav">
        <Link to="/" className="btk-logo">Home<span>Gentic</span></Link>
        <Link to="/" className="btk-nav-back"><ChevronLeft size={15} /> Back to Home</Link>
        <Link to="/login" className="btk-nav-cta">Get Started <ArrowRight size={14} /></Link>
      </nav>

      {/* ── Landing ─────────────────────────────────────────────────── */}
      {screen === "landing" && (
        <section className="btk-hero">
          <div className="btk-eyebrow">🔍 Free Tool — No Account Required</div>
          <h1>Know what you're<br /><em>actually buying.</em></h1>
          <p className="btk-hero-sub">
            Enter the address and what the seller is claiming about each major system.
            We'll check permit records, flag credibility gaps, and give you the exact
            questions to ask before you sign anything.
          </p>
          <div className="btk-hero-bullets">
            {[
              "Permit records checked",
              "Credibility score per system",
              "Red flags ranked by cost",
              "Questions & documents to request",
              "Inspector checklist included",
            ].map((b) => (
              <div key={b} className="btk-hero-bullet">
                <div className="btk-hero-bullet-dot"><Check size={10} /></div>
                {b}
              </div>
            ))}
          </div>
          <button className="btk-start-btn" onClick={() => setScreen(0)}>
            Build My Truth Kit <ChevronRight size={18} />
          </button>
        </section>
      )}

      {/* ── Step 0: Home Details ─────────────────────────────────── */}
      {screen === 0 && (
        <div className="btk-step-wrap">
          <Progress step={0} />
          <div className="btk-step-label">Step 1 of 2</div>
          <h2>Tell us about the home.</h2>
          <p className="btk-step-sub">
            We use the address to query permit records and tailor the analysis to local building departments.
          </p>

          {error && (
            <div style={{ background: "var(--red-light)", border: "1px solid rgba(201,76,46,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div className="btk-field">
            <label className="btk-label">Property address<span className="btk-label-sub">required</span></label>
            <input className="btk-input" placeholder="123 Main St, Plano, TX 75023"
              value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="btk-row">
            <div className="btk-field">
              <label className="btk-label">Year built<span className="btk-label-sub">required</span></label>
              <input className="btk-input" type="number" placeholder="e.g. 1987" min={1800} max={new Date().getFullYear()}
                value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value ? Number(e.target.value) : "")} />
            </div>
          </div>

          <div style={{ background: "rgba(46,37,64,0.04)", borderRadius: 10, padding: "13px 16px", fontSize: 13, color: "var(--plum-mid)", marginTop: 8 }}>
            <Info size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            Your address is used only to look up permit records. It is never stored or shared.
          </div>

          <div className="btk-step-nav">
            <button className="btk-btn-back" onClick={() => setScreen("landing")}>
              <ChevronLeft size={14} /> Back
            </button>
            <button className="btk-btn-next" disabled={!canProceedStep0} onClick={() => setScreen(1)}>
              Next: Seller Claims <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Seller Claims ─────────────────────────────────── */}
      {screen === 1 && (
        <div className="btk-step-wrap">
          <Progress step={1} />
          <div className="btk-step-label">Step 2 of 2</div>
          <h2>What has the seller claimed?</h2>
          <p className="btk-step-sub">
            Enter what you've been told about each system — or mark it as unknown. The more you fill in, the sharper the analysis.
          </p>

          {error && (
            <div style={{ background: "var(--red-light)", border: "1px solid rgba(201,76,46,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--red)", fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div className="btk-system-grid">
            {(Object.keys(SYSTEM_LABELS) as (keyof Claims)[]).map((id) => (
              <SystemCard key={id} id={id} claim={claims[id] as any} onChange={updateClaim} />
            ))}
          </div>

          <div className="btk-step-nav">
            <button className="btk-btn-back" onClick={() => setScreen(0)}>
              <ChevronLeft size={14} /> Back
            </button>
            <button className="btk-btn-next" onClick={handleGenerate}>
              Generate My Truth Kit <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────── */}
      {screen === "loading" && (
        <div className="btk-loading">
          <div className="btk-loading-spinner" />
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 900, color: "var(--charcoal)", marginBottom: 8 }}>
            Building your kit…
          </h2>
          <p style={{ fontSize: 14, color: "var(--plum-mid)" }}>This takes 15–30 seconds.</p>
          <div className="btk-loading-steps">
            {LOAD_STEPS.map((s, i) => (
              <div key={s} className={`btk-loading-item btk-loading-item-${i < loadStep ? "done" : i === loadStep ? "active" : "idle"}`}>
                <span>{i < loadStep ? "✓" : i === loadStep ? "→" : "○"}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────── */}
      {screen === "results" && kit && (
        <div className="btk-results" ref={resultsRef}>
          {/* Header */}
          <div className="btk-results-header">
            <div className="btk-results-address">{kit.property.address}</div>
            <h2 className="btk-results-title">Your Buyer's Truth Kit</h2>
            <div className={`btk-risk-badge btk-risk-${kit.kit.overallRisk}`}>
              {kit.kit.overallRisk === "high"   && <AlertTriangle size={15} />}
              {kit.kit.overallRisk === "medium" && <AlertTriangle size={15} />}
              {kit.kit.overallRisk === "low"    && <ShieldCheck size={15} />}
              Overall Risk: {kit.kit.overallRisk.charAt(0).toUpperCase() + kit.kit.overallRisk.slice(1)}
            </div>
            <p className="btk-results-summary">{kit.kit.overallSummary}</p>
            <div className="btk-results-actions">
              <button className="btk-action-btn" onClick={handlePrint}><Printer size={14} /> Print Kit</button>
              <button className="btk-action-btn" onClick={handleShare}><Share2 size={14} /> Copy Share Link</button>
              <button className="btk-action-btn" onClick={() => { setScreen(1); setKit(null); setSearchParams({}); }}>
                ← Edit Claims
              </button>
            </div>
          </div>

          {/* Red Flags */}
          {kit.kit.redFlags.length > 0 && (
            <div className="btk-section">
              <div className="btk-section-title">
                <AlertTriangle size={18} color="var(--red)" /> Red Flags ({kit.kit.redFlags.length})
              </div>
              <div className="btk-flags">
                {kit.kit.redFlags.map((f, i) => (
                  <div key={i} className={`btk-flag btk-flag-${f.severity}`}>
                    <div className="btk-flag-icon">
                      <AlertTriangle size={16} color={f.severity === "critical" ? "var(--red)" : f.severity === "major" ? "var(--amber)" : "var(--plum-mid)"} />
                    </div>
                    <div>
                      <div className="btk-flag-title">{f.title}</div>
                      <div className="btk-flag-desc">{f.description}</div>
                      <div className="btk-flag-action">→ {f.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* System-by-system */}
          {kit.kit.systems.length > 0 && (
            <div className="btk-section">
              <div className="btk-section-title">
                <ShieldCheck size={18} color="var(--sage)" /> System Credibility — {kit.property.yearBuilt} Home
              </div>
              <div className="btk-systems-grid">
                {kit.kit.systems.map((sys) => (
                  <SystemResultCard key={sys.name} sys={sys} />
                ))}
              </div>
            </div>
          )}

          {/* Era Risks */}
          {kit.kit.eraRisks.length > 0 && (
            <div className="btk-section">
              <div className="btk-section-title">
                <Info size={18} color="var(--amber)" /> Known Risks for {kit.property.yearBuilt} Homes
              </div>
              <div className="btk-era-grid">
                {kit.kit.eraRisks.map((r, i) => (
                  <div key={i} className="btk-era-card">
                    <div className={`btk-era-likelihood btk-era-${r.likelihood}`}>{r.likelihood}</div>
                    <div className="btk-era-item">{r.item}</div>
                    <div className="btk-era-desc">{r.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General Questions */}
          {kit.kit.generalQuestions.length > 0 && (
            <div className="btk-section">
              <div className="btk-section-title">Questions to Ask at Every Showing</div>
              <div className="btk-qa-list">
                {kit.kit.generalQuestions.map((q, i) => (
                  <div key={i} className="btk-qa-item">
                    <div className="btk-qa-num">{i + 1}</div>{q}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* General Documents */}
          {kit.kit.generalDocuments.length > 0 && (
            <div className="btk-section">
              <div className="btk-section-title">Documents to Request Before Closing</div>
              <div className="btk-qa-list">
                {kit.kit.generalDocuments.map((d, i) => (
                  <div key={i} className="btk-qa-item">
                    <div className="btk-qa-num"><Check size={10} /></div>{d}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Permit Lookup */}
          <div className="btk-section">
            <div className="btk-section-title">
              <ExternalLink size={18} color="var(--plum-mid)" /> Permit Records
            </div>
            <div className="btk-permit-box">
              <div className="btk-permit-header">
                <span className="btk-permit-title">{kit.permits.portalName}</span>
                {kit.permits.searched && kit.permits.found
                  ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--sage)", background: "var(--sage-light)", padding: "3px 10px", borderRadius: 100 }}>{kit.permits.count} records found</span>
                  : <span style={{ fontSize: 12, color: "var(--plum-mid)" }}>Manual search required</span>}
              </div>
              <div className="btk-permit-body">
                <p className="btk-permit-note-text">{kit.permits.note}<br /><span style={{ fontWeight: 600 }}>{kit.permits.instructions}</span></p>
                {kit.permits.records.length > 0 && (
                  <div className="btk-permit-records" style={{ marginBottom: 14 }}>
                    {kit.permits.records.map((r, i) => (
                      <div key={i} className="btk-permit-record">
                        <div>
                          <div className="btk-permit-record-desc">{r.description}</div>
                          {(r.date || r.status) && (
                            <div className="btk-permit-record-meta">{[r.date, r.status].filter(Boolean).join(" · ")}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <a href={kit.permits.portalUrl} target="_blank" rel="noopener noreferrer" className="btk-permit-link">
                  Open Permit Portal <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="btk-cta-band">
            <h3>Already made an offer?<br /><em>Document everything from day one.</em></h3>
            <p>HomeGentic tracks every job, repair, and contractor — so the next buyer gets a verified record, not a guess.</p>
            <Link to="/login" className="btk-cta-pill">Start Documenting <ArrowRight size={15} /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
