import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Home, Wrench, Building2, Users, ChevronRight, ChevronLeft,
  ShieldCheck, TrendingUp, CalendarDays, Star, FileText,
  Bell, ClipboardList, Camera, ArrowRight, Play, Check,
  BarChart3, Zap, MessageSquare, AlertTriangle, Sparkles,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Persona = "homeowners" | "contractors" | "realtors" | "property-managers";

interface Slide {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  mockup: React.ReactNode;
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const CSS = `
  .dm * { margin: 0; padding: 0; box-sizing: border-box; }
  .dm {
    --sage: #7AAF76; --sage-light: #E5F0E4; --sage-mid: #C4DCC2;
    --blush: #F0CDBA; --sky: #BAD5E8; --butter: #F5E9BB;
    --plum: #2E2540; --plum-mid: #6B5B7B; --plum-light: #3D3254;
    --white: #FDFCFA; --charcoal: #1E1928; --rule: rgba(46,37,64,0.1);
    --amber: #D4843A; --red: #C94C2E;
    background: var(--white); color: var(--charcoal);
    font-family: 'Plus Jakarta Sans', sans-serif; min-height: 100vh;
  }

  /* ── NAV ─────────────────────────────────────────────────────────────── */
  .dm-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 56px; height: 70px;
    background: rgba(253,252,250,0.96); backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--rule);
  }
  .dm-logo {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900;
    color: var(--plum); text-decoration: none; letter-spacing: -0.5px;
  }
  .dm-logo span { color: var(--sage); font-style: italic; font-weight: 300; }
  .dm-nav-back {
    display: flex; align-items: center; gap: 6px;
    font-size: 14px; font-weight: 500; color: var(--plum-mid);
    text-decoration: none; padding: 8px 14px; border-radius: 8px;
    transition: color .15s, background .15s;
  }
  .dm-nav-back:hover { color: var(--plum); background: rgba(46,37,64,0.05); }
  .dm-nav-cta {
    background: var(--plum); color: white; padding: 10px 22px;
    border-radius: 100px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: transform .2s, box-shadow .2s; text-decoration: none;
    display: flex; align-items: center; gap: 6px;
  }
  .dm-nav-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(46,37,64,0.25); }

  /* ── HERO ────────────────────────────────────────────────────────────── */
  .dm-hero {
    padding: 110px 56px 0;
    text-align: center; max-width: 760px; margin: 0 auto;
  }
  .dm-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--butter); color: var(--plum); padding: 6px 16px;
    border-radius: 100px; font-size: 13px; font-weight: 600; margin-bottom: 24px;
    border: 1px solid rgba(46,37,64,0.1);
  }
  .dm-eyebrow-dot {
    width: 7px; height: 7px; background: var(--sage); border-radius: 50%;
    animation: dm-pulse 2s infinite;
  }
  @keyframes dm-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4);opacity:0.7} }
  .dm h1 {
    font-family: 'Fraunces', serif; font-size: clamp(38px, 5vw, 62px);
    font-weight: 900; line-height: 1.05; letter-spacing: -2px; margin-bottom: 18px;
  }
  .dm h1 em { font-style: italic; color: var(--sage); font-weight: 300; }
  .dm-hero-sub {
    font-size: 18px; line-height: 1.7; color: var(--plum-mid); margin-bottom: 48px;
  }

  /* ── PERSONA TABS ────────────────────────────────────────────────────── */
  .dm-tabs {
    display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;
    padding: 0 24px 48px;
  }
  .dm-tab {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 22px; border-radius: 100px; font-size: 14px; font-weight: 600;
    cursor: pointer; border: 2px solid transparent; transition: all .2s;
    font-family: 'Plus Jakarta Sans', sans-serif; text-decoration: none;
  }
  .dm-tab-icon { font-size: 16px; }
  .dm-tab-inactive {
    background: white; color: var(--plum-mid); border-color: var(--rule);
  }
  .dm-tab-inactive:hover { border-color: var(--plum-mid); color: var(--plum); }
  .dm-tab-active { background: var(--plum); color: white; border-color: var(--plum); }

  /* ── SLIDE AREA ──────────────────────────────────────────────────────── */
  .dm-slide-wrap {
    max-width: 1100px; margin: 0 auto; padding: 0 24px 80px;
  }
  .dm-persona-header {
    text-align: center; margin-bottom: 48px;
  }
  .dm-persona-kicker {
    font-size: 12px; font-weight: 700; letter-spacing: 2.5px;
    text-transform: uppercase; color: var(--sage); margin-bottom: 12px;
  }
  .dm h2 {
    font-family: 'Fraunces', serif; font-size: clamp(28px, 3.5vw, 42px);
    font-weight: 900; letter-spacing: -1px; color: var(--charcoal); line-height: 1.1;
  }
  .dm-persona-desc {
    font-size: 17px; color: var(--plum-mid); margin-top: 12px; line-height: 1.65;
  }

  /* Steps nav */
  .dm-steps {
    display: flex; justify-content: center; gap: 6px; margin-bottom: 40px; flex-wrap: wrap;
  }
  .dm-step {
    display: flex; align-items: center; gap: 8px; padding: 8px 18px;
    border-radius: 100px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all .2s; border: none;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  .dm-step-inactive { background: var(--rule); color: var(--plum-mid); }
  .dm-step-inactive:hover { background: rgba(46,37,64,0.12); color: var(--plum); }
  .dm-step-active { background: var(--plum); color: white; }
  .dm-step-done { background: var(--sage-light); color: var(--sage); }
  .dm-step-dot {
    width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex-shrink: 0;
  }

  /* Main slide */
  .dm-slide {
    display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center;
    animation: dm-slideIn .35s ease both;
  }
  @keyframes dm-slideIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  .dm-slide-left {}
  .dm-slide-num {
    font-family: 'Fraunces', serif; font-size: 64px; font-weight: 900;
    color: rgba(46,37,64,0.06); line-height: 1; margin-bottom: -12px;
  }
  .dm-slide-icon {
    width: 52px; height: 52px; background: var(--sage-light); border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    color: var(--sage); margin-bottom: 18px;
  }
  .dm-slide h3 {
    font-family: 'Fraunces', serif; font-size: clamp(22px, 2.5vw, 32px);
    font-weight: 900; letter-spacing: -0.7px; color: var(--charcoal); margin-bottom: 14px;
    line-height: 1.15;
  }
  .dm-slide-copy { font-size: 16px; line-height: 1.75; color: var(--plum-mid); }
  .dm-slide-bullets { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }
  .dm-bullet {
    display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--plum-mid);
  }
  .dm-bullet-check {
    flex-shrink: 0; width: 20px; height: 20px; background: var(--sage-light);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    color: var(--sage); margin-top: 1px;
  }

  /* Slide nav buttons */
  .dm-slide-nav {
    display: flex; align-items: center; gap: 12px; margin-top: 32px; flex-wrap: wrap;
  }
  .dm-btn-prev {
    display: flex; align-items: center; gap: 6px;
    padding: 11px 22px; border-radius: 100px; font-size: 14px; font-weight: 600;
    background: white; border: 2px solid var(--rule); color: var(--plum-mid);
    cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; transition: all .15s;
  }
  .dm-btn-prev:hover { border-color: var(--plum-mid); color: var(--plum); }
  .dm-btn-next {
    display: flex; align-items: center; gap: 6px;
    padding: 12px 26px; border-radius: 100px; font-size: 14px; font-weight: 700;
    background: var(--plum); border: none; color: white;
    cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; transition: all .2s;
  }
  .dm-btn-next:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(46,37,64,0.22); }
  .dm-btn-cta {
    display: flex; align-items: center; gap: 6px;
    padding: 12px 26px; border-radius: 100px; font-size: 14px; font-weight: 700;
    background: var(--sage); border: none; color: white;
    cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; transition: all .2s;
    text-decoration: none;
  }
  .dm-btn-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(122,175,118,0.35); }

  /* ── MOCK UI CARDS ───────────────────────────────────────────────────── */
  .dm-card {
    background: white; border-radius: 20px;
    box-shadow: 0 24px 60px rgba(46,37,64,0.14), 0 4px 16px rgba(46,37,64,0.06);
    overflow: hidden; position: relative;
  }
  .dm-card-header {
    background: var(--plum); padding: 18px 22px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .dm-card-title {
    font-family: 'Fraunces', serif; font-size: 14px; font-weight: 700; color: white;
  }
  .dm-card-sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px; }
  .dm-card-body { padding: 18px 22px; }
  .dm-score-hero {
    display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
  }
  .dm-score-num {
    font-family: 'Fraunces', serif; font-size: 52px; font-weight: 900;
    color: var(--sage); line-height: 1;
  }
  .dm-score-meta { flex: 1; }
  .dm-score-label { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; }
  .dm-score-bar-wrap { height: 6px; background: rgba(255,255,255,0.15); border-radius: 100px; margin-top: 6px; overflow: hidden; }
  .dm-score-bar { height: 100%; border-radius: 100px; background: linear-gradient(90deg, var(--sage), #A8E8A0); transition: width .8s ease; }
  .dm-score-grade {
    background: rgba(122,175,118,0.25); border: 1px solid rgba(122,175,118,0.5);
    border-radius: 100px; padding: 4px 12px; font-size: 11px; font-weight: 700;
    color: #A8DCA5;
  }
  .dm-breakdown { display: flex; flex-direction: column; gap: 7px; }
  .dm-bk-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
  .dm-bk-label { color: rgba(255,255,255,0.65); width: 80px; flex-shrink: 0; }
  .dm-bk-bar-wrap { flex: 1; height: 4px; background: rgba(255,255,255,0.12); border-radius: 100px; overflow: hidden; }
  .dm-bk-bar { height: 100%; border-radius: 100px; }
  .dm-bk-val { color: white; font-weight: 600; width: 28px; text-align: right; flex-shrink: 0; }

  .dm-list { display: flex; flex-direction: column; gap: 8px; }
  .dm-list-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; background: var(--sage-light); border-radius: 10px;
  }
  .dm-list-item-l { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 500; color: var(--plum); }
  .dm-list-icon { font-size: 16px; }
  .dm-badge-green { font-size: 11px; font-weight: 700; color: var(--sage); }
  .dm-badge-amber { font-size: 11px; font-weight: 700; color: var(--amber); }
  .dm-badge-red   { font-size: 11px; font-weight: 700; color: var(--red); }

  .dm-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;
  }
  .dm-chip-green { background: var(--sage-light); color: var(--sage); }
  .dm-chip-amber { background: #FDF0E2; color: var(--amber); }
  .dm-chip-red   { background: #FDECEA; color: var(--red); }
  .dm-chip-blue  { background: #EBF4FB; color: #3A82B5; }
  .dm-chip-purple{ background: rgba(46,37,64,0.07); color: var(--plum); }

  .dm-timeline { display: flex; flex-direction: column; gap: 0; }
  .dm-tl-item { display: flex; gap: 12px; padding-bottom: 14px; position: relative; }
  .dm-tl-item:not(:last-child)::before {
    content: ''; position: absolute; left: 12px; top: 26px; bottom: 0;
    width: 1px; background: var(--rule);
  }
  .dm-tl-dot {
    flex-shrink: 0; width: 25px; height: 25px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 11px; margin-top: 2px;
  }
  .dm-tl-dot-green { background: var(--sage-light); color: var(--sage); }
  .dm-tl-dot-amber { background: #FDF0E2; color: var(--amber); }
  .dm-tl-dot-gray  { background: var(--rule); color: var(--plum-mid); }
  .dm-tl-body { flex: 1; }
  .dm-tl-title { font-size: 13px; font-weight: 600; color: var(--plum); }
  .dm-tl-meta  { font-size: 11px; color: var(--plum-mid); margin-top: 2px; }

  .dm-stat-row { display: flex; gap: 10px; margin-bottom: 14px; }
  .dm-stat {
    flex: 1; background: var(--sage-light); border-radius: 10px; padding: 12px 14px;
    text-align: center;
  }
  .dm-stat-val {
    font-family: 'Fraunces', serif; font-size: 24px; font-weight: 900; color: var(--plum); line-height: 1;
  }
  .dm-stat-lbl { font-size: 10px; color: var(--plum-mid); font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

  .dm-profile-header {
    display: flex; align-items: center; gap: 14px; margin-bottom: 16px;
  }
  .dm-avatar {
    width: 48px; height: 48px; background: var(--plum); border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 900; color: white;
  }
  .dm-profile-name { font-size: 15px; font-weight: 700; color: var(--plum); }
  .dm-profile-sub  { font-size: 12px; color: var(--plum-mid); margin-top: 2px; }
  .dm-stars { color: #F5C518; font-size: 13px; letter-spacing: 1px; }

  .dm-bid-card {
    border: 1px solid var(--rule); border-radius: 12px; padding: 14px 16px;
    margin-bottom: 8px;
  }
  .dm-bid-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .dm-bid-name { font-size: 13px; font-weight: 700; color: var(--plum); }
  .dm-bid-price { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 900; color: var(--sage); }
  .dm-bid-meta { display: flex; gap: 8px; flex-wrap: wrap; }

  .dm-notif {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 12px 16px; border-radius: 12px; margin-bottom: 8px;
  }
  .dm-notif-green { background: var(--sage-light); }
  .dm-notif-amber { background: #FDF0E2; }
  .dm-notif-icon { flex-shrink: 0; margin-top: 1px; }
  .dm-notif-body { font-size: 12px; line-height: 1.5; color: var(--plum); }
  .dm-notif-time { font-size: 10px; color: var(--plum-mid); margin-top: 3px; }

  .dm-progress-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid var(--rule);
  }
  .dm-progress-item:last-child { border-bottom: none; }
  .dm-progress-l { font-size: 13px; font-weight: 500; color: var(--plum); display: flex; align-items: center; gap: 8px; }
  .dm-progress-bar-row { display: flex; align-items: center; gap: 8px; }
  .dm-progress-bar-bg { width: 80px; height: 5px; background: var(--rule); border-radius: 100px; overflow: hidden; }
  .dm-progress-bar-fill { height: 100%; background: var(--sage); border-radius: 100px; }
  .dm-progress-pct { font-size: 11px; font-weight: 700; color: var(--plum-mid); }

  /* ── CTA BAND ────────────────────────────────────────────────────────── */
  .dm-cta-band {
    background: var(--plum); padding: 72px 56px; text-align: center; margin-top: 48px;
  }
  .dm-cta-band h2 {
    font-family: 'Fraunces', serif; font-size: clamp(28px, 4vw, 48px);
    font-weight: 900; color: white; letter-spacing: -1.5px; margin-bottom: 16px;
  }
  .dm-cta-band h2 em { font-style: italic; color: var(--sage); font-weight: 300; }
  .dm-cta-band p { font-size: 17px; color: rgba(255,255,255,0.65); margin-bottom: 36px; }
  .dm-cta-pill {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--sage); color: white; padding: 17px 38px;
    border-radius: 100px; font-size: 16px; font-weight: 700; border: none;
    cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: transform .2s, box-shadow .2s; text-decoration: none;
  }
  .dm-cta-pill:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(122,175,118,0.35); }
  .dm-cta-ghost {
    display: inline-flex; align-items: center; gap: 8px; margin-left: 14px;
    background: transparent; color: white; padding: 17px 30px;
    border-radius: 100px; font-size: 16px; font-weight: 600;
    border: 2px solid rgba(255,255,255,0.25); cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: all .2s;
    text-decoration: none;
  }
  .dm-cta-ghost:hover { border-color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.06); }

  /* ── AI BANNER ───────────────────────────────────────────────────────── */
  .dm-ai-banner {
    max-width: 820px; margin: 0 auto 40px; padding: 0 24px;
    display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
    text-align: center;
  }
  .dm-ai-pill {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--charcoal); color: white; padding: 10px 20px; border-radius: 100px;
    font-size: 13px; font-weight: 600; letter-spacing: 0.2px;
  }
  .dm-ai-pill-spark { color: var(--sage); flex-shrink: 0; }
  .dm-ai-pill-text { color: rgba(255,255,255,0.85); }
  .dm-ai-pill strong { color: white; }

  /* ── AI CHAT CARD ─────────────────────────────────────────────────────── */
  .dm-ai-card {
    background: var(--charcoal); border-radius: 20px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(30,25,40,0.35), 0 4px 16px rgba(30,25,40,0.2);
  }
  .dm-ai-card-header {
    padding: 16px 22px; display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.03);
  }
  .dm-ai-spark-badge {
    display: flex; align-items: center; gap: 6px; padding: 5px 12px;
    background: rgba(122,175,118,0.18); border: 1px solid rgba(122,175,118,0.35);
    border-radius: 100px; font-size: 11px; font-weight: 700; color: #A8DCA5; letter-spacing: 0.5px;
  }
  .dm-ai-card-title {
    font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.7); margin-left: auto;
  }
  .dm-ai-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
  .dm-bubble {
    max-width: 88%; padding: 11px 15px; border-radius: 14px;
    font-size: 13px; line-height: 1.55;
  }
  .dm-bubble-user {
    background: var(--plum-light); color: rgba(255,255,255,0.9);
    align-self: flex-end; border-bottom-right-radius: 4px;
  }
  .dm-bubble-ai {
    background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.88);
    align-self: flex-start; border-bottom-left-radius: 4px;
  }
  .dm-bubble-ai strong { color: white; }
  .dm-bubble-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    margin-bottom: 6px;
  }
  .dm-bubble-label-ai   { color: var(--sage); }
  .dm-bubble-label-user { color: rgba(255,255,255,0.4); text-align: right; }
  .dm-ai-actions { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
  .dm-ai-action {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-radius: 10px; font-size: 12px; font-weight: 600; cursor: default;
  }
  .dm-ai-action-default {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.8);
  }
  .dm-ai-action-primary {
    background: rgba(122,175,118,0.18); border: 1px solid rgba(122,175,118,0.45);
    color: #A8DCA5;
  }
  .dm-ai-action-cta {
    background: var(--sage); color: white; border: none;
    justify-content: center; font-size: 13px;
  }
  .dm-ai-action-icon { flex-shrink: 0; opacity: 0.9; }

  /* ── RESPONSIVE ──────────────────────────────────────────────────────── */
  @media (max-width: 860px) {
    .dm-nav { padding: 0 24px; }
    .dm-hero { padding: 90px 24px 0; }
    .dm-slide { grid-template-columns: 1fr; gap: 32px; }
    .dm-slide-left { order: 1; }
    .dm-slide .dm-card, .dm-slide .dm-ai-card { order: 0; }
    .dm-cta-band { padding: 48px 24px; }
    .dm-cta-ghost { display: none; }
    .dm-slide-wrap { padding: 0 16px 60px; }
  }
  @media (max-width: 560px) {
    .dm-steps { gap: 4px; }
    .dm-step { padding: 7px 14px; font-size: 12px; }
  }
`;

/* ─── Mock UI Components ────────────────────────────────────────────────── */

function ScoreCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">124 Maple Street</div>
          <div className="dm-card-sub">Homeowner Dashboard</div>
        </div>
        <div className="dm-score-grade">Excellent</div>
      </div>
      <div className="dm-card-body" style={{ background: "#2E2540" }}>
        <div className="dm-score-hero">
          <div className="dm-score-num">91</div>
          <div className="dm-score-meta">
            <div className="dm-score-label">HomeGentic Score</div>
            <div className="dm-score-bar-wrap"><div className="dm-score-bar" style={{ width: "91%" }} /></div>
          </div>
        </div>
        <div className="dm-breakdown">
          {[
            { label: "Maintenance", pct: 94, color: "#7AAF76" },
            { label: "Systems",     pct: 88, color: "#7AAF76" },
            { label: "Structure",   pct: 96, color: "#7AAF76" },
            { label: "Docs",        pct: 82, color: "#D4843A" },
          ].map((r) => (
            <div key={r.label} className="dm-bk-row">
              <span className="dm-bk-label">{r.label}</span>
              <div className="dm-bk-bar-wrap">
                <div className="dm-bk-bar" style={{ width: `${r.pct}%`, background: r.color }} />
              </div>
              <span className="dm-bk-val">{r.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MaintenanceCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Predictive Maintenance</div>
          <div className="dm-card-sub">4 upcoming tasks</div>
        </div>
        <span className="dm-chip dm-chip-amber">2 urgent</span>
      </div>
      <div className="dm-card-body">
        <div className="dm-list">
          {[
            { icon: "🔥", label: "HVAC Filter Replacement", status: "Due in 3 days", cls: "dm-badge-red" },
            { icon: "💧", label: "Water Heater Flush",      status: "Due this month", cls: "dm-badge-amber" },
            { icon: "🪟", label: "Gutter Cleaning",         status: "Oct 2025", cls: "dm-badge-amber" },
            { icon: "⚡", label: "Smoke Detector Test",     status: "Completed", cls: "dm-badge-green" },
          ].map((item) => (
            <div key={item.label} className="dm-list-item">
              <div className="dm-list-item-l">
                <span className="dm-list-icon">{item.icon}</span>
                {item.label}
              </div>
              <span className={item.cls}>{item.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JobHistoryCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Job History</div>
          <div className="dm-card-sub">Verified records on-chain</div>
        </div>
        <span className="dm-chip dm-chip-green">12 verified</span>
      </div>
      <div className="dm-card-body">
        <div className="dm-timeline">
          {[
            { dot: "dm-tl-dot-green", icon: "✓", title: "Roof Replacement — GAF Timberline", meta: "Demetrius & Sons Roofing · Apr 2025 · $14,200", },
            { dot: "dm-tl-dot-green", icon: "✓", title: "HVAC Full Replacement (Carrier 2-ton)", meta: "AirPro HVAC · Jan 2025 · $8,400", },
            { dot: "dm-tl-dot-amber", icon: "↑", title: "Kitchen Remodel — Phase 1", meta: "Self / DIY · Nov 2024 · $3,100", },
            { dot: "dm-tl-dot-gray",  icon: "○", title: "Plumbing — Water Heater Install", meta: "Riverdale Plumbing · Aug 2024 · $1,850", },
          ].map((item) => (
            <div key={item.title} className="dm-tl-item">
              <div className={`dm-tl-dot ${item.dot}`}>{item.icon}</div>
              <div className="dm-tl-body">
                <div className="dm-tl-title">{item.title}</div>
                <div className="dm-tl-meta">{item.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuoteCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Quote Request: Deck Refinishing</div>
          <div className="dm-card-sub">3 bids received · Closing in 4 days</div>
        </div>
      </div>
      <div className="dm-card-body">
        {[
          { name: "ProDeck Solutions", stars: "★★★★★", price: "$2,400", tags: ["Insured", "5-yr warranty"], highlight: true },
          { name: "Greenfield Outdoor", stars: "★★★★☆", price: "$2,890", tags: ["Insured"], highlight: false },
          { name: "QuickCoat LLC",      stars: "★★★☆☆", price: "$1,950", tags: ["2-yr warranty"], highlight: false },
        ].map((bid) => (
          <div key={bid.name} className="dm-bid-card" style={bid.highlight ? { borderColor: "#7AAF76", background: "#F5FAF5" } : {}}>
            <div className="dm-bid-header">
              <div>
                <div className="dm-bid-name">{bid.name}</div>
                <div className="dm-stars">{bid.stars}</div>
              </div>
              <div className="dm-bid-price">{bid.price}</div>
            </div>
            <div className="dm-bid-meta">
              {bid.tags.map((t) => <span key={t} className="dm-chip dm-chip-green">{t}</span>)}
              {bid.highlight && <span className="dm-chip dm-chip-amber">Best value</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">HomeGentic Verified Report</div>
          <div className="dm-card-sub">124 Maple Street · Generated Apr 2025</div>
        </div>
        <ShieldCheck size={22} color="#7AAF76" />
      </div>
      <div className="dm-card-body">
        <div className="dm-stat-row">
          <div className="dm-stat"><div className="dm-stat-val">91</div><div className="dm-stat-lbl">Score</div></div>
          <div className="dm-stat"><div className="dm-stat-val">12</div><div className="dm-stat-lbl">Jobs</div></div>
          <div className="dm-stat"><div className="dm-stat-val">$41k</div><div className="dm-stat-lbl">Invested</div></div>
        </div>
        <div className="dm-list">
          {[
            { label: "Identity verified",       ok: true },
            { label: "Contractor licenses checked", ok: true },
            { label: "Permit records matched",  ok: true },
            { label: "Photo documentation",     ok: true },
          ].map((r) => (
            <div key={r.label} className="dm-list-item">
              <div className="dm-list-item-l">{r.label}</div>
              <span className="dm-badge-green">✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContractorLeadsCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Quote Requests Near You</div>
          <div className="dm-card-sub">Plano, TX · 15-mi radius</div>
        </div>
        <span className="dm-chip dm-chip-amber">7 new</span>
      </div>
      <div className="dm-card-body">
        {[
          { title: "Roof Inspection", area: "Allen, TX", budget: "$300–600",   urgent: true  },
          { title: "HVAC Tune-Up",    area: "McKinney, TX", budget: "$150–300", urgent: false },
          { title: "Deck Refinishing", area: "Frisco, TX", budget: "$2k–4k",   urgent: false },
        ].map((lead) => (
          <div key={lead.title} className="dm-bid-card">
            <div className="dm-bid-header">
              <div>
                <div className="dm-bid-name">{lead.title}</div>
                <div style={{ fontSize: 11, color: "var(--plum-mid)", marginTop: 2 }}>{lead.area}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--plum)" }}>{lead.budget}</div>
                {lead.urgent && <span className="dm-chip dm-chip-red" style={{ marginTop: 4 }}>Urgent</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractorBidCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Submit Bid: Roof Inspection</div>
          <div className="dm-card-sub">124 Maple St · Posted 2h ago</div>
        </div>
      </div>
      <div className="dm-card-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Service type",   value: "Roof Inspection + Report" },
            { label: "Property size",  value: "2,200 sq ft · 2-story" },
            { label: "Homeowner score", value: "91 / 100 — Excellent payer" },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
              <span style={{ color: "var(--plum-mid)" }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: "var(--plum)" }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--sage-light)", borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--plum-mid)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Your Bid</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 900, color: "var(--sage)" }}>$450</span>
            <span className="dm-chip dm-chip-green">Ready to submit</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractorProfileCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header" style={{ background: "white", borderBottom: "1px solid var(--rule)" }}>
        <div className="dm-profile-header" style={{ marginBottom: 0 }}>
          <div className="dm-avatar">DS</div>
          <div>
            <div className="dm-profile-name">Demetrius & Sons Roofing</div>
            <div className="dm-stars">★★★★★</div>
            <div className="dm-profile-sub">4.9 · 127 reviews</div>
          </div>
        </div>
      </div>
      <div className="dm-card-body">
        <div className="dm-stat-row">
          <div className="dm-stat"><div className="dm-stat-val">127</div><div className="dm-stat-lbl">Reviews</div></div>
          <div className="dm-stat"><div className="dm-stat-val">4.9</div><div className="dm-stat-lbl">Rating</div></div>
          <div className="dm-stat"><div className="dm-stat-val">$2.1M</div><div className="dm-stat-lbl">Completed</div></div>
        </div>
        <div className="dm-list">
          {[
            { label: "License verified",    ok: true },
            { label: "Insurance on file",   ok: true },
            { label: "Background checked",  ok: true },
            { label: "Dual-sign jobs",       ok: true },
          ].map((r) => (
            <div key={r.label} className="dm-list-item">
              <div className="dm-list-item-l">{r.label}</div>
              <span className="dm-badge-green">✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContractorRecurringCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Recurring Contracts</div>
          <div className="dm-card-sub">Active service agreements</div>
        </div>
        <span className="dm-chip dm-chip-green">8 active</span>
      </div>
      <div className="dm-card-body">
        {[
          { icon: "❄️", name: "HVAC Bi-annual Tune-Up",   clients: 3, revenue: "$1,350/yr" },
          { icon: "🐛", name: "Pest Control Quarterly",    clients: 4, revenue: "$2,400/yr" },
          { icon: "🌿", name: "Landscaping Monthly",       clients: 1, revenue: "$1,800/yr" },
        ].map((c) => (
          <div key={c.name} className="dm-bid-card">
            <div className="dm-bid-header">
              <div className="dm-list-item-l"><span>{c.icon}</span>{c.name}</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sage)" }}>{c.revenue}</div>
                <div style={{ fontSize: 11, color: "var(--plum-mid)" }}>{c.clients} clients</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RealtorScoreCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Listing: 124 Maple Street</div>
          <div className="dm-card-sub">$485,000 · Plano, TX</div>
        </div>
        <span className="dm-chip dm-chip-green">Score: 91</span>
      </div>
      <div className="dm-card-body">
        <div style={{ background: "var(--sage-light)", border: "1px solid var(--sage-mid)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ShieldCheck size={24} color="#7AAF76" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--plum)" }}>HomeGentic Verified</div>
              <div style={{ fontSize: 12, color: "var(--plum-mid)", marginTop: 2 }}>12 jobs · $41k invested · All records verified</div>
            </div>
          </div>
        </div>
        <div className="dm-list">
          {[
            { label: "Days on market",        value: "3 days" },
            { label: "Showings this week",     value: "11" },
            { label: "Offers received",        value: "3" },
            { label: "Est. premium vs avg",    value: "+$18,400" },
          ].map((r) => (
            <div key={r.label} className="dm-list-item">
              <div className="dm-list-item-l">{r.label}</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--plum)" }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentMarketplaceCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Agent Marketplace</div>
          <div className="dm-card-sub">Plano, TX · 28 agents</div>
        </div>
      </div>
      <div className="dm-card-body">
        {[
          { initials: "SR", name: "Sarah R.", sales: "142 HomeGentic sales", rating: "4.9 ★", highlight: true },
          { initials: "JM", name: "James M.", sales: "98 HomeGentic sales",  rating: "4.8 ★", highlight: false },
          { initials: "TP", name: "Tanya P.", sales: "76 HomeGentic sales",  rating: "4.7 ★", highlight: false },
        ].map((agent) => (
          <div key={agent.name} className="dm-bid-card" style={agent.highlight ? { borderColor: "#7AAF76", background: "#F5FAF5" } : {}}>
            <div className="dm-bid-header">
              <div className="dm-list-item-l">
                <div className="dm-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{agent.initials}</div>
                <div>
                  <div className="dm-bid-name">{agent.name}</div>
                  <div style={{ fontSize: 11, color: "var(--plum-mid)" }}>{agent.sales}</div>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--sage)" }}>{agent.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketIntelCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">ROI-Ranked Renovations</div>
          <div className="dm-card-sub">2024 Remodeling Cost vs Value</div>
        </div>
      </div>
      <div className="dm-card-body">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[
            { label: "Minor Kitchen Remodel", roi: 96, cost: "$26k" },
            { label: "Fiber Cement Siding",   roi: 88, cost: "$19k" },
            { label: "Garage Door Replace",   roi: 94, cost: "$4.5k" },
            { label: "Window Replacement",    roi: 68, cost: "$22k" },
          ].map((r) => (
            <div key={r.label} className="dm-progress-item">
              <div className="dm-progress-l">
                <TrendingUp size={14} color="#7AAF76" />
                {r.label}
              </div>
              <div className="dm-progress-bar-row">
                <div className="dm-progress-bar-bg">
                  <div className="dm-progress-bar-fill" style={{ width: `${r.roi}%` }} />
                </div>
                <span className="dm-progress-pct">{r.roi}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FsboCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">FSBO Opportunities</div>
          <div className="dm-card-sub">Unrepresented sellers near you</div>
        </div>
        <span className="dm-chip dm-chip-amber">5 new</span>
      </div>
      <div className="dm-card-body">
        {[
          { addr: "412 Oak Lane", score: 87, price: "$512k", days: "Listed 2d ago" },
          { addr: "88 Birchwood Dr", score: 74, price: "$398k", days: "Listed 5d ago" },
          { addr: "270 Lakeview Ct", score: 91, price: "$625k", days: "Listed today" },
        ].map((listing) => (
          <div key={listing.addr} className="dm-bid-card">
            <div className="dm-bid-header">
              <div>
                <div className="dm-bid-name">{listing.addr}</div>
                <div style={{ fontSize: 11, color: "var(--plum-mid)", marginTop: 2 }}>{listing.days}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "'Fraunces', serif", color: "var(--plum)" }}>{listing.price}</div>
                <span className="dm-chip dm-chip-green" style={{ marginTop: 4 }}>Score {listing.score}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagerInviteCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Delegated Access</div>
          <div className="dm-card-sub">124 Maple St · Owner: Patricia H.</div>
        </div>
        <span className="dm-chip dm-chip-blue">Manager</span>
      </div>
      <div className="dm-card-body">
        <div className="dm-notif dm-notif-green">
          <div className="dm-notif-icon"><ShieldCheck size={16} color="#7AAF76" /></div>
          <div className="dm-notif-body">
            You have Manager access for this property. Your actions are logged and the owner is notified.
            <div className="dm-notif-time">Access granted Apr 10, 2025</div>
          </div>
        </div>
        <div className="dm-list" style={{ marginTop: 12 }}>
          {[
            { label: "Log maintenance jobs",  ok: true },
            { label: "Upload photos",          ok: true },
            { label: "Request quotes",         ok: true },
            { label: "No extra subscription", ok: true },
          ].map((r) => (
            <div key={r.label} className="dm-list-item">
              <div className="dm-list-item-l">{r.label}</div>
              <span className="dm-badge-green">✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManagerJobCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Log Job — On Behalf of Owner</div>
          <div className="dm-card-sub">124 Maple St · Patricia H.</div>
        </div>
      </div>
      <div className="dm-card-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Service type",    value: "Plumbing — Leak Repair" },
            { label: "Contractor",       value: "Riverdale Plumbing" },
            { label: "Cost",            value: "$340" },
            { label: "Signed by",       value: "You + Contractor" },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
              <span style={{ color: "var(--plum-mid)" }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: "var(--plum)" }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }} className="dm-notif dm-notif-amber">
          <div className="dm-notif-icon"><Bell size={14} color="#D4843A" /></div>
          <div className="dm-notif-body">
            Owner Patricia will be notified of this job log.
          </div>
        </div>
      </div>
    </div>
  );
}

function ManagerPhotoCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Photo Documentation</div>
          <div className="dm-card-sub">Framing phase · 8 photos uploaded</div>
        </div>
      </div>
      <div className="dm-card-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
          {["🏗️","🔩","🪵","🧱","📐","🔧"].map((e, i) => (
            <div key={i} style={{ aspectRatio: "1", background: "var(--sage-light)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              {e}
            </div>
          ))}
        </div>
        <div className="dm-list">
          {[
            { label: "SHA-256 hash verified", ok: true },
            { label: "Timestamp on-chain",    ok: true },
            { label: "Phase: Framing",        ok: true },
          ].map((r) => (
            <div key={r.label} className="dm-list-item">
              <div className="dm-list-item-l">{r.label}</div>
              <span className="dm-badge-green">✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManagerActivityCard() {
  return (
    <div className="dm-card">
      <div className="dm-card-header">
        <div>
          <div className="dm-card-title">Owner Activity Feed</div>
          <div className="dm-card-sub">Patricia sees all manager actions</div>
        </div>
      </div>
      <div className="dm-card-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { icon: <Wrench size={14} color="#7AAF76" />, cls: "dm-notif-green", msg: "Alex logged a job: Plumbing — Leak Repair ($340)", time: "2h ago" },
            { icon: <Camera size={14} color="#7AAF76" />, cls: "dm-notif-green", msg: "Alex uploaded 8 framing photos for your property.", time: "3h ago" },
            { icon: <ClipboardList size={14} color="#D4843A" />, cls: "dm-notif-amber", msg: "Alex requested a quote for Deck Refinishing.", time: "Yesterday" },
          ].map((n, i) => (
            <div key={i} className={`dm-notif ${n.cls}`}>
              <div className="dm-notif-icon">{n.icon}</div>
              <div className="dm-notif-body">
                {n.msg}
                <div className="dm-notif-time">{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── AI Chat Card Components ───────────────────────────────────────────── */

function AIChatCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="dm-ai-card">
      <div className="dm-ai-card-header">
        <div className="dm-ai-spark-badge">
          <Sparkles size={11} /> AI-Powered
        </div>
        <span className="dm-ai-card-title">HomeGentic Assistant</span>
      </div>
      <div className="dm-ai-body">{children}</div>
    </div>
  );
}

function AIHomeownerCard() {
  return (
    <AIChatCard>
      <div>
        <div className="dm-bubble-label dm-bubble-label-user">You</div>
        <div className="dm-bubble dm-bubble-user" style={{ marginLeft: "auto" }}>
          "My AC is making a loud rattling noise and barely cooling the house. It's a 2018 Carrier unit."
        </div>
      </div>
      <div>
        <div className="dm-bubble-label dm-bubble-label-ai">HomeGentic AI</div>
        <div className="dm-bubble dm-bubble-ai">
          I found your HVAC record — a <strong>2018 Carrier 2-ton</strong>, now 7 years old and <strong>14 months since last service</strong> (overdue). Rattling + weak cooling typically means a loose fan blade or low refrigerant. Here's what I recommend:
        </div>
      </div>
      <div className="dm-ai-actions">
        <div className="dm-ai-action dm-ai-action-default">
          <span className="dm-ai-action-icon">📋</span> Log Job: HVAC Inspection &amp; Repair
        </div>
        <div className="dm-ai-action dm-ai-action-primary">
          <span className="dm-ai-action-icon">💬</span> Request Quotes — 3 vetted HVAC contractors nearby
        </div>
        <div className="dm-ai-action dm-ai-action-cta">
          Start Hiring Process <ArrowRight size={13} style={{ marginLeft: 6 }} />
        </div>
      </div>
    </AIChatCard>
  );
}

function AIContractorCard() {
  return (
    <AIChatCard>
      <div>
        <div className="dm-bubble-label dm-bubble-label-ai">HomeGentic AI</div>
        <div className="dm-bubble dm-bubble-ai">
          I analyzed this week's quote requests in your area. Based on your trade profile <strong>(HVAC · Plano, TX)</strong>, here are your 3 best-match leads — ranked by your historical win rate:
        </div>
      </div>
      <div className="dm-ai-actions" style={{ gap: 6 }}>
        {[
          { label: "HVAC Tune-Up · McKinney, TX", match: "94% match", icon: "❄️" },
          { label: "AC Repair · Frisco, TX",       match: "89% match", icon: "🔧" },
          { label: "HVAC Replacement · Allen, TX", match: "81% match", icon: "⚡" },
        ].map((l) => (
          <div key={l.label} className="dm-ai-action dm-ai-action-default" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{l.icon}</span>{l.label}
            </span>
            <span style={{ color: "#A8DCA5", fontWeight: 700, fontSize: 11 }}>{l.match}</span>
          </div>
        ))}
        <div className="dm-ai-action dm-ai-action-cta">
          View Leads &amp; Submit Bids <ArrowRight size={13} style={{ marginLeft: 6 }} />
        </div>
      </div>
      <div className="dm-bubble dm-bubble-ai" style={{ fontSize: 12 }}>
        Your bid win rate on HVAC repairs is <strong>71%</strong>. Suggested price range: <strong>$380–$520</strong>.
      </div>
    </AIChatCard>
  );
}

function AIRealtorCard() {
  return (
    <AIChatCard>
      <div>
        <div className="dm-bubble-label dm-bubble-label-user">You</div>
        <div className="dm-bubble dm-bubble-user" style={{ marginLeft: "auto" }}>
          "I have a new listing at 412 Oak Lane. HomeGentic Score is 74."
        </div>
      </div>
      <div>
        <div className="dm-bubble-label dm-bubble-label-ai">HomeGentic AI</div>
        <div className="dm-bubble dm-bubble-ai">
          I analyzed 412 Oak Lane against current comps. A score of <strong>74 is below the 82 neighborhood average</strong>. Three targeted improvements could add an estimated <strong>$22,400 to the sale price</strong>:
        </div>
      </div>
      <div className="dm-ai-actions">
        <div className="dm-ai-action dm-ai-action-default">
          <span>🚪</span> Garage door replacement — <strong style={{ color: "#A8DCA5" }}>94% ROI</strong> · ~$4,500
        </div>
        <div className="dm-ai-action dm-ai-action-default">
          <span>🏚️</span> Fiber cement siding — <strong style={{ color: "#A8DCA5" }}>88% ROI</strong> · ~$19,000
        </div>
        <div className="dm-ai-action dm-ai-action-default">
          <span>🪟</span> Window caulking &amp; seal — quick win, low cost
        </div>
        <div className="dm-ai-action dm-ai-action-cta">
          Create Seller Improvement Plan <ArrowRight size={13} style={{ marginLeft: 6 }} />
        </div>
      </div>
    </AIChatCard>
  );
}

function AIManagerCard() {
  return (
    <AIChatCard>
      <div>
        <div className="dm-bubble-label dm-bubble-label-user">You</div>
        <div className="dm-bubble dm-bubble-user" style={{ marginLeft: "auto" }}>
          "Mom's HVAC hasn't been serviced since we moved her in — that was over a year ago."
        </div>
      </div>
      <div>
        <div className="dm-bubble-label dm-bubble-label-ai">HomeGentic AI</div>
        <div className="dm-bubble dm-bubble-ai">
          I checked Patricia's maintenance records. The HVAC is <strong>7 years old</strong> and overdue by <strong>2 months</strong>. I've drafted a service request under her Pro-tier account — no cost to you:
        </div>
      </div>
      <div className="dm-ai-actions">
        <div className="dm-ai-action dm-ai-action-primary">
          <span className="dm-ai-action-icon">✓</span> Job drafted: HVAC Bi-annual Tune-Up
        </div>
        <div className="dm-ai-action dm-ai-action-primary">
          <span className="dm-ai-action-icon">✓</span> 3 contractors pre-qualified in Patricia's area
        </div>
        <div className="dm-ai-action dm-ai-action-primary">
          <span className="dm-ai-action-icon">✓</span> Patricia will be notified before anything is hired
        </div>
        <div className="dm-ai-action dm-ai-action-cta">
          Submit for Owner Approval <ArrowRight size={13} style={{ marginLeft: 6 }} />
        </div>
      </div>
    </AIChatCard>
  );
}

/* ─── Slide Definitions ─────────────────────────────────────────────────── */

const HOMEOWNER_SLIDES: Slide[] = [
  {
    icon: <Sparkles size={26} />,
    title: "Describe Any Issue — AI Handles the Rest",
    subtitle: "AI-Powered Home Assistant",
    mockup: <AIHomeownerCard />,
  },
  {
    icon: <TrendingUp size={26} />,
    title: "Your Home Has a Credit Score — Know It",
    subtitle: "The HomeGentic Score",
    mockup: <ScoreCard />,
  },
  {
    icon: <CalendarDays size={26} />,
    title: "Never Miss a Maintenance Deadline Again",
    subtitle: "Predictive Maintenance Engine",
    mockup: <MaintenanceCard />,
  },
  {
    icon: <ClipboardList size={26} />,
    title: "Every Job. Verified. On-Chain.",
    subtitle: "Immutable Job History",
    mockup: <JobHistoryCard />,
  },
  {
    icon: <MessageSquare size={26} />,
    title: "Get Competing Bids from Vetted Contractors",
    subtitle: "Quote Marketplace",
    mockup: <QuoteCard />,
  },
  {
    icon: <FileText size={26} />,
    title: "Prove Your Home's Value at Closing",
    subtitle: "Verified Property Report",
    mockup: <ReportCard />,
  },
];

const CONTRACTOR_SLIDES: Slide[] = [
  {
    icon: <Zap size={26} />,
    title: "Qualified Leads, Delivered to You",
    subtitle: "Local Quote Requests",
    mockup: <ContractorLeadsCard />,
  },
  {
    icon: <Sparkles size={26} />,
    title: "AI Finds Your Best Leads — Before You Even Look",
    subtitle: "AI Lead Matching",
    mockup: <AIContractorCard />,
  },
  {
    icon: <ClipboardList size={26} />,
    title: "Submit Bids in Under 60 Seconds",
    subtitle: "Fast Bid Submission",
    mockup: <ContractorBidCard />,
  },
  {
    icon: <Star size={26} />,
    title: "Build a Trust Score That Wins More Work",
    subtitle: "Verified Contractor Profile",
    mockup: <ContractorProfileCard />,
  },
  {
    icon: <CalendarDays size={26} />,
    title: "Lock In Predictable Recurring Revenue",
    subtitle: "Service Contract Engine",
    mockup: <ContractorRecurringCard />,
  },
];

const REALTOR_SLIDES: Slide[] = [
  {
    icon: <ShieldCheck size={26} />,
    title: "List Properties with a Verified Score Badge",
    subtitle: "HomeGentic on Listings",
    mockup: <RealtorScoreCard />,
  },
  {
    icon: <Sparkles size={26} />,
    title: "AI Turns a Low Score Into a Higher Sale Price",
    subtitle: "AI Listing Advisor",
    mockup: <AIRealtorCard />,
  },
  {
    icon: <Users size={26} />,
    title: "Get Found by Sellers Who Need an Agent",
    subtitle: "Agent Marketplace",
    mockup: <AgentMarketplaceCard />,
  },
  {
    icon: <BarChart3 size={26} />,
    title: "Back Your Price with Data, Not Guesses",
    subtitle: "ROI Market Intelligence",
    mockup: <MarketIntelCard />,
  },
  {
    icon: <Building2 size={26} />,
    title: "Connect with FSBO Sellers Before They Sign",
    subtitle: "FSBO Lead Matching",
    mockup: <FsboCard />,
  },
];

const MANAGER_SLIDES: Slide[] = [
  {
    icon: <ShieldCheck size={26} />,
    title: "Manage a Parent's Home — No Extra Cost",
    subtitle: "Delegated Access",
    mockup: <ManagerInviteCard />,
  },
  {
    icon: <Sparkles size={26} />,
    title: "AI Schedules Maintenance — You Just Approve",
    subtitle: "AI Maintenance Concierge",
    mockup: <AIManagerCard />,
  },
  {
    icon: <Wrench size={26} />,
    title: "Log Jobs and Services on the Owner's Behalf",
    subtitle: "Manager Job Logging",
    mockup: <ManagerJobCard />,
  },
  {
    icon: <Camera size={26} />,
    title: "Document Every Phase with Tamper-Proof Photos",
    subtitle: "On-Chain Photo Records",
    mockup: <ManagerPhotoCard />,
  },
  {
    icon: <Bell size={26} />,
    title: "Owners Stay Informed — Every Action Notified",
    subtitle: "Real-Time Activity Feed",
    mockup: <ManagerActivityCard />,
  },
];

const SLIDES_MAP: Record<Persona, Slide[]> = {
  homeowners:          HOMEOWNER_SLIDES,
  contractors:         CONTRACTOR_SLIDES,
  realtors:            REALTOR_SLIDES,
  "property-managers": MANAGER_SLIDES,
};

const PERSONA_META: Record<Persona, { label: string; icon: React.ReactNode; kicker: string; heading: string; desc: string }> = {
  homeowners: {
    label: "Homeowners",
    icon: <Home size={16} />,
    kicker: "For Homeowners",
    heading: <>Your home has a brain.<br /><em>Finally use it.</em></> as any,
    desc: "Tell our AI about any issue — it reads your home's full history, diagnoses the problem, logs the job, collects competing bids, and can start the hiring process without you filling out a single form.",
  },
  contractors: {
    label: "Contractors",
    icon: <Wrench size={16} />,
    kicker: "For Contractors",
    heading: <>Win more jobs.<br /><em>AI works the leads.</em></> as any,
    desc: "Our AI ranks incoming quote requests by your personal win rate, suggests competitive pricing, and surfaces only the leads most likely to convert — so you spend time working, not prospecting.",
  },
  realtors: {
    label: "Realtors",
    icon: <Building2 size={16} />,
    kicker: "For Realtors",
    heading: <>Close higher.<br /><em>AI does the prep work.</em></> as any,
    desc: "AI benchmarks every listing against neighborhood comps, generates a prioritized improvement plan with real ROI numbers, and helps you turn a mediocre score into a stronger selling position before day one.",
  },
  "property-managers": {
    label: "Property Managers",
    icon: <Users size={16} />,
    kicker: "For Property Managers",
    heading: <>Care for any home.<br /><em>AI handles the details.</em></> as any,
    desc: "Our AI monitors the property's maintenance schedule, drafts service requests, and finds pre-qualified contractors — you just review and approve. The owner stays in control of every decision.",
  },
};

const BULLET_MAP: Record<Persona, string[][]> = {
  homeowners: [
    // 0 — AI slide
    ["Speak or type any issue in plain language", "AI reads your home's full history before responding", "Diagnoses the problem, drafts the job, finds contractors — in one conversation"],
    // 1 — Score
    ["Score updates after every verified job", "Track maintenance ROI over time", "See how you compare to neighbors"],
    // 2 — Maintenance
    ["AI-powered seasonal task calendar", "System lifespan estimates with alerts", "Urgent tasks flagged automatically"],
    // 3 — Job History
    ["Dual-signature contractor verification", "Photo evidence attached to every job", "Immutable records nobody can edit"],
    // 4 — Quotes
    ["Post a request in under 2 minutes", "Contractors compete — you choose", "Review bids, ratings, and warranties"],
    // 5 — Report
    ["Share a secure link with any buyer", "Score, jobs, and photos in one report", "Increases buyer confidence at closing"],
  ],
  contractors: [
    // 0 — Leads
    ["Filtered by your trade and ZIP code", "Homeowner score shows payment reliability", "No cold calling — inbound only"],
    // 1 — AI slide
    ["AI ranks leads by your personal win rate", "Suggested price ranges based on similar jobs you've won", "Spend less time prospecting, more time working"],
    // 2 — Bid submission
    ["Pre-filled job details from homeowner", "Set your price and send", "Dual-sign to add to your portfolio"],
    // 3 — Profile
    ["License and insurance verification badge", "Reviews tied to verified jobs only", "Score grows with every completed job"],
    // 4 — Recurring
    ["HVAC, pest, landscaping and more", "Auto-reminders for scheduled visits", "Predictable ARR on top of project work"],
  ],
  realtors: [
    // 0 — Score on listings
    ["Score badge visible on every listing", "Buyers trust verified history over seller claims", "Shorter inspection negotiations"],
    // 1 — AI slide
    ["AI benchmarks every listing against neighborhood comps", "Prioritized improvement list with real ROI numbers", "Turn a mediocre score into a stronger selling position before day one"],
    // 2 — Agent marketplace
    ["Ranked by HomeGentic transaction count", "Profile synced to the homeowner portal", "Direct leads from sellers in your area"],
    // 3 — Market intel
    ["2024 Remodeling Magazine cost vs value data", "Recommend renovations with real ROI", "Help sellers prioritize before listing"],
    // 4 — FSBO
    ["Be notified when FSBO listings go live", "Score-ranked so you approach the right ones", "Show buyers what they're actually getting"],
  ],
  "property-managers": [
    // 0 — Delegated access
    ["Owner sends an invite link — you claim access", "Choose Viewer or Manager role", "Works for parents, rental units, or estates"],
    // 1 — AI slide
    ["AI monitors the property's maintenance schedule on your behalf", "Drafts service requests and finds contractors — you just review", "Owner stays in control; you do the work without the paperwork"],
    // 2 — Job logging
    ["All jobs logged under the owner's property", "Contractor verification still required", "Owner's Pro/Premium tier applies — free for you"],
    // 3 — Photos
    ["SHA-256 hashed and timestamped", "Tagged by construction phase", "Accessible to owner at any time"],
    // 4 — Activity feed
    ["Every action generates a notification", "Owner can revoke access instantly", "Full audit log always available"],
  ],
};

const VALID_PERSONAS: Persona[] = ["homeowners", "contractors", "realtors", "property-managers"];

/* ─── Page Component ────────────────────────────────────────────────────── */
export default function DemoPage() {
  const navigate  = useNavigate();
  const { persona: rawPersona } = useParams<{ persona?: string }>();
  const persona: Persona = (VALID_PERSONAS.includes(rawPersona as Persona) ? rawPersona : "homeowners") as Persona;

  const [step, setStep]         = useState(0);
  const [animKey, setAnimKey]   = useState(0);

  // Reset step when persona changes
  useEffect(() => { setStep(0); setAnimKey((k) => k + 1); }, [persona]);

  const slides  = SLIDES_MAP[persona];
  const meta    = PERSONA_META[persona];
  const bullets = BULLET_MAP[persona][step] ?? [];
  const slide   = slides[step];
  const isLast  = step === slides.length - 1;

  function goTo(s: number) {
    setStep(s);
    setAnimKey((k) => k + 1);
  }

  return (
    <div className="dm">
      <Helmet>
        <title>See HomeGentic in Action — Interactive Demo</title>
        <meta name="description" content="Explore HomeGentic features for homeowners, contractors, realtors, and property managers." />
      </Helmet>

      <style>{CSS}</style>

      {/* Nav */}
      <nav className="dm-nav">
        <Link to="/" className="dm-logo">Home<span>Gentic</span></Link>
        <Link to="/" className="dm-nav-back">
          <ChevronLeft size={16} /> Back to Home
        </Link>
        <Link to="/login" className="dm-nav-cta">
          Get Started <ArrowRight size={15} />
        </Link>
      </nav>

      {/* Hero */}
      <section className="dm-hero">
        <div className="dm-eyebrow">
          <div className="dm-eyebrow-dot" />
          Interactive Demo
        </div>
        <h1>See HomeGentic<br /><em>in action.</em></h1>
        <p className="dm-hero-sub">
          Describe a problem in plain language. Our AI diagnoses it, drafts the job, collects quotes, and can start the hiring process — without you filling out a single form.
        </p>
      </section>

      {/* AI Banner */}
      <div className="dm-ai-banner">
        <div className="dm-ai-pill">
          <Sparkles size={14} style={{ color: "var(--sage)", flexShrink: 0 }} />
          <span className="dm-ai-pill-text">
            <strong>Powered by AI</strong> — every tab below shows how our AI assistant works for your role
          </span>
        </div>
      </div>

      {/* Persona Tabs */}
      <div className="dm-tabs">
        {VALID_PERSONAS.map((p) => {
          const m = PERSONA_META[p];
          return (
            <Link
              key={p}
              to={`/demo/${p}`}
              className={`dm-tab ${p === persona ? "dm-tab-active" : "dm-tab-inactive"}`}
            >
              <span className="dm-tab-icon">{m.icon}</span>
              {m.label}
            </Link>
          );
        })}
      </div>

      {/* Slide Area */}
      <div className="dm-slide-wrap">
        {/* Persona header */}
        <div className="dm-persona-header">
          <div className="dm-persona-kicker">{meta.kicker}</div>
          <h2>{meta.heading}</h2>
          <p className="dm-persona-desc">{meta.desc}</p>
        </div>

        {/* Step pills */}
        <div className="dm-steps">
          {slides.map((s, i) => (
            <button
              key={i}
              className={`dm-step ${i === step ? "dm-step-active" : i < step ? "dm-step-done" : "dm-step-inactive"}`}
              onClick={() => goTo(i)}
            >
              {i < step && <span className="dm-step-dot" />}
              {i + 1}. {s.subtitle}
            </button>
          ))}
        </div>

        {/* Main slide */}
        <div className="dm-slide" key={animKey}>
          {/* Left: copy */}
          <div className="dm-slide-left">
            <div className="dm-slide-num">0{step + 1}</div>
            <div className="dm-slide-icon">{slide.icon}</div>
            <h3>{slide.title}</h3>
            <div className="dm-slide-bullets">
              {bullets.map((b) => (
                <div key={b} className="dm-bullet">
                  <div className="dm-bullet-check"><Check size={11} /></div>
                  {b}
                </div>
              ))}
            </div>
            <div className="dm-slide-nav">
              {step > 0 && (
                <button className="dm-btn-prev" onClick={() => goTo(step - 1)}>
                  <ChevronLeft size={15} /> Previous
                </button>
              )}
              {!isLast ? (
                <button className="dm-btn-next" onClick={() => goTo(step + 1)}>
                  Next: {slides[step + 1].subtitle} <ChevronRight size={15} />
                </button>
              ) : (
                <Link to="/login" className="dm-btn-cta">
                  Get Started <ArrowRight size={15} />
                </Link>
              )}
            </div>
          </div>

          {/* Right: mockup */}
          {slide.mockup}
        </div>
      </div>

      {/* CTA Band */}
      <div className="dm-cta-band">
        <h2>Ready to own your<br /><em>home's story?</em></h2>
        <p>Plans start at $10/mo. See pricing for the tier that fits your needs.</p>
        <Link to="/login" className="dm-cta-pill">
          <Play size={16} /> Get Started
        </Link>
        <Link to="/pricing" className="dm-cta-ghost">
          View Pricing
        </Link>
      </div>
    </div>
  );
}
