import React, { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const CSS = `
  .hfl * { margin: 0; padding: 0; box-sizing: border-box; }
  .hfl {
    --sage: #7AAF76; --sage-light: #E5F0E4; --sage-mid: #C4DCC2;
    --blush: #F0CDBA; --sky: #BAD5E8; --butter: #F5E9BB;
    --plum: #2E2540; --plum-mid: #6B5B7B; --plum-light: #3D3254;
    --white: #FDFCFA; --charcoal: #1E1928; --rule: rgba(46,37,64,0.1);
    background: var(--white); color: var(--charcoal);
    font-family: 'Plus Jakarta Sans', sans-serif; overflow-x: hidden;
  }

  /* ── NAV ──────────────────────────────────────────────────────────────── */
  .hfl-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 56px; height: 70px;
    background: rgba(253,252,250,0.96); backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--rule);
  }
  .hfl-logo {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900;
    color: var(--plum); text-decoration: none; letter-spacing: -0.5px; flex-shrink: 0;
  }
  .hfl-logo span { color: var(--sage); }
  .hfl-nav-links {
    display: flex; gap: 4px; list-style: none;
    position: absolute; left: 50%; transform: translateX(-50%);
  }
  .hfl-nav-links a {
    font-size: 14px; color: var(--plum-mid); text-decoration: none;
    font-weight: 500; cursor: pointer; padding: 7px 13px; border-radius: 8px;
    transition: background .15s, color .15s;
  }
  .hfl-nav-links a:hover { color: var(--plum); background: rgba(46,37,64,0.05); }
  .hfl-nav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .hfl-nav-signin {
    font-size: 14px; font-weight: 600; color: var(--plum-mid);
    background: none; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; padding: 8px 14px;
    transition: color .15s; border-radius: 8px;
  }
  .hfl-nav-signin:hover { color: var(--plum); background: rgba(46,37,64,0.05); }
  .hfl-nav-pill {
    display: flex; align-items: center; gap: 6px;
    background: var(--plum); color: white; padding: 10px 22px;
    border-radius: 100px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: transform .2s, box-shadow .2s;
  }
  .hfl-nav-pill:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(46,37,64,0.25); }
  .hfl-hamburger {
    display: none; background: none; border: none; cursor: pointer; padding: 4px;
  }
  .hfl-hamburger span {
    display: block; width: 22px; height: 2px; background: var(--plum);
    margin: 5px 0; border-radius: 2px; transition: transform .2s, opacity .2s;
  }

  /* ── HERO ─────────────────────────────────────────────────────────────── */
  .hfl-hero {
    min-height: 100vh; padding: 70px 56px 0;
    display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
    align-items: center; position: relative; overflow: hidden;
  }
  .hfl-hero::before {
    content: ''; position: absolute; top: -10%; right: -8%; width: 54%; height: 110%;
    pointer-events: none; z-index: 0;
    background: radial-gradient(ellipse at 65% 35%, var(--butter) 0%, var(--blush) 28%, var(--sky) 55%, transparent 70%);
    opacity: 0.4;
  }
  .hfl-hero-left { position: relative; z-index: 1; padding-bottom: 56px; }
  .hfl-eyebrow {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--butter); color: var(--plum); padding: 7px 18px;
    border-radius: 100px; font-size: 13px; font-weight: 600; margin-bottom: 28px;
    border: 1px solid rgba(46,37,64,0.1);
    animation: hfl-fadeUp .5s ease both;
  }
  .hfl-dot {
    width: 8px; height: 8px; background: var(--sage); border-radius: 50%;
    animation: hfl-pulse 2s infinite;
  }
  @keyframes hfl-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.7} }
  .hfl h1 {
    font-family: 'Fraunces', serif;
    font-size: clamp(52px, 6vw, 84px);
    font-weight: 900; line-height: 1.01; letter-spacing: -2.5px; margin-bottom: 24px;
    animation: hfl-fadeUp .5s .1s ease both;
  }
  .hfl h1 em { font-style: italic; color: var(--sage); font-weight: 300; }
  .hfl-sub {
    font-size: 18px; line-height: 1.75; color: var(--plum-mid);
    max-width: 480px; margin-bottom: 40px;
    animation: hfl-fadeUp .5s .2s ease both;
  }
  .hfl-actions {
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 44px;
    animation: hfl-fadeUp .5s .3s ease both;
  }
  .hfl-btn-main {
    background: var(--plum); color: white; padding: 17px 38px; border-radius: 100px;
    font-size: 16px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    transition: transform .2s, box-shadow .2s;
  }
  .hfl-btn-main:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(46,37,64,0.28); }
  .hfl-btn-soft {
    background: transparent; color: var(--plum); padding: 17px 30px; border-radius: 100px;
    font-size: 16px; font-weight: 600; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    border: 2px solid var(--sage-mid); transition: border-color .2s, background .2s;
  }
  .hfl-btn-soft:hover { border-color: var(--sage); background: var(--sage-light); }
  .hfl-hero-trust {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    animation: hfl-fadeUp .5s .4s ease both;
  }
  .hfl-hero-trust-lbl { font-size: 13px; color: var(--plum-mid); font-weight: 500; }
  .hfl-hero-city {
    display: flex; align-items: center; gap: 5px;
    background: white; border: 1px solid var(--rule); border-radius: 100px;
    padding: 5px 14px; font-size: 12px; font-weight: 700; color: var(--plum);
    box-shadow: 0 2px 8px rgba(46,37,64,0.06);
  }

  /* HERO VISUAL */
  .hfl-hero-right {
    position: relative; z-index: 1; display: flex; align-items: center;
    justify-content: center; padding: 100px 0 60px;
  }
  .hfl-blob-wrap {
    position: relative; width: 440px; height: 500px;
    display: flex; align-items: center; justify-content: center;
    animation: hfl-fadeUp .7s .15s ease both;
  }
  .hfl-blob-bg {
    position: absolute; inset: 0;
    background: radial-gradient(circle at 35% 45%, var(--blush) 0%, var(--butter) 40%, var(--sky) 80%);
    border-radius: 58% 42% 52% 48% / 46% 54% 46% 54%;
    animation: hfl-morph 9s ease-in-out infinite;
  }
  @keyframes hfl-morph {
    0%,100%{border-radius:58% 42% 52% 48%/46% 54% 46% 54%}
    33%{border-radius:40% 60% 60% 40%/60% 38% 62% 40%}
    66%{border-radius:52% 48% 42% 58%/48% 58% 42% 52%}
  }
  .hfl-dash-card {
    position: relative; z-index: 2; background: white; border-radius: 22px; width: 340px;
    box-shadow: 0 32px 80px rgba(46,37,64,0.2); overflow: hidden;
    animation: hfl-float 5s ease-in-out infinite;
  }
  @keyframes hfl-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
  .hfl-dc-header { background: var(--plum); padding: 20px 24px; }
  .hfl-dc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .hfl-dc-title { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 700; color: white; }
  .hfl-dc-ver {
    display: flex; align-items: center; gap: 5px;
    background: rgba(122,175,118,0.3); border: 1px solid rgba(122,175,118,0.5);
    border-radius: 100px; padding: 4px 10px; font-size: 10px; color: #A8DCA5; font-weight: 600; letter-spacing: 0.5px;
  }
  .hfl-dc-addr { font-size: 12px; color: rgba(255,255,255,0.6); }
  .hfl-dc-score-row { display: flex; align-items: center; gap: 14px; margin-top: 12px; }
  .hfl-dc-num { font-family: 'Fraunces', serif; font-size: 44px; font-weight: 900; color: var(--sage); line-height: 1; }
  .hfl-dc-score-lbl { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
  .hfl-dc-bar-wrap { flex: 1; height: 6px; background: rgba(255,255,255,0.15); border-radius: 100px; overflow: hidden; }
  .hfl-dc-bar { height: 100%; width: 91%; background: linear-gradient(90deg, var(--sage), #A8E8A0); border-radius: 100px; }
  .hfl-dc-body { padding: 18px 22px; }
  .hfl-dc-sec-lbl { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--plum-mid); margin-bottom: 12px; }
  .hfl-dc-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .hfl-dc-item { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: var(--sage-light); border-radius: 10px; font-size: 12px; }
  .hfl-dc-item-l { display: flex; align-items: center; gap: 8px; color: var(--plum); font-weight: 500; }
  .hfl-status-done { font-size: 11px; font-weight: 600; color: var(--sage); }
  .hfl-status-due  { font-size: 11px; font-weight: 600; color: #D4843A; }
  .hfl-status-ok   { font-size: 11px; font-weight: 600; color: var(--plum-mid); }
  .hfl-dc-ver-row {
    background: var(--sage-light); border: 1px solid var(--sage-mid);
    border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 10px;
  }
  .hfl-dc-ver-text { font-size: 11px; line-height: 1.4; color: var(--plum-mid); }
  .hfl-dc-ver-text strong { color: var(--plum); }
  .hfl-badge {
    position: absolute; z-index: 3; background: white; border-radius: 14px;
    box-shadow: 0 8px 28px rgba(46,37,64,0.14); padding: 11px 16px;
    display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--plum);
    white-space: nowrap;
  }
  .hfl-badge-1 { top: 8%; right: -20px; animation: hfl-float 4s ease-in-out infinite; }
  .hfl-badge-2 { bottom: 12%; left: -24px; animation: hfl-float 4s 1.5s ease-in-out infinite; }
  .hfl-badge-icon { font-size: 18px; }

  /* ── TRUST STRIP ──────────────────────────────────────────────────────── */
  .hfl-trust-strip {
    padding: 20px 56px; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
    display: flex; align-items: center; gap: 28px;
    background: rgba(122,175,118,0.04);
  }
  .hfl-trust-label {
    font-size: 11px; font-weight: 700; color: var(--plum-mid); letter-spacing: 1.5px;
    text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
  }
  .hfl-trust-divider { width: 1px; height: 20px; background: var(--rule); flex-shrink: 0; }
  .hfl-trust-cities { display: flex; flex: 1; }
  .hfl-trust-city {
    font-size: 13px; font-weight: 600; color: var(--plum); padding: 0 18px;
    border-right: 1px solid var(--rule); white-space: nowrap;
  }
  .hfl-trust-city:first-child { padding-left: 0; }
  .hfl-trust-city:last-child { border-right: none; }
  .hfl-trust-rating {
    margin-left: auto; display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 700; color: var(--plum); flex-shrink: 0;
  }
  .hfl-trust-stars { color: #F4B942; letter-spacing: 1px; }

  /* ── METRICS ──────────────────────────────────────────────────────────── */
  .hfl-metrics {
    padding: 72px 56px;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px;
    background: var(--plum);
  }
  .hfl-metric-card {
    background: rgba(253,252,250,0.06); border: 1px solid rgba(253,252,250,0.1);
    border-radius: 20px; padding: 32px 28px;
    transition: background .2s, border-color .2s;
  }
  .hfl-metric-card:hover { background: rgba(253,252,250,0.1); border-color: rgba(122,175,118,0.35); }
  .hfl-metric-icon { font-size: 28px; margin-bottom: 20px; }
  .hfl-metric-num {
    font-family: 'Fraunces', serif; font-size: 50px; font-weight: 900;
    color: var(--sage); line-height: 1; margin-bottom: 10px; letter-spacing: -1.5px;
  }
  .hfl-metric-title { font-size: 15px; font-weight: 700; color: white; margin-bottom: 4px; }
  .hfl-metric-sub { font-size: 13px; color: rgba(253,252,250,0.5); line-height: 1.5; }

  /* ── HOW IT WORKS ─────────────────────────────────────────────────────── */
  .hfl-how { padding: 100px 56px; }
  .hfl-section-header { max-width: 600px; margin-bottom: 72px; }
  .hfl-kicker {
    font-size: 12px; font-weight: 700; color: var(--sage);
    letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px;
  }
  .hfl h2 {
    font-family: 'Fraunces', serif; font-size: clamp(36px, 4.5vw, 56px);
    font-weight: 900; letter-spacing: -1.5px; line-height: 1.04; margin-bottom: 18px;
    color: var(--plum);
  }
  .hfl h2 em { font-style: italic; font-weight: 300; color: var(--sage); }
  .hfl-sec-sub { font-size: 17px; color: var(--plum-mid); line-height: 1.7; }
  .hfl-flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; position: relative; }
  .hfl-flow::before {
    content: ''; position: absolute; top: 54px; left: 12.5%; right: 12.5%; height: 2px;
    background: linear-gradient(90deg, var(--sage-mid), var(--sage)); z-index: 0;
  }
  .hfl-step { text-align: center; position: relative; z-index: 1; padding: 0 20px; }
  .hfl-step-num {
    position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
    font-size: 10px; font-weight: 800; letter-spacing: 1px; color: white;
    background: var(--sage); border-radius: 100px; padding: 2px 8px; z-index: 2;
  }
  .hfl-step-icon {
    width: 108px; height: 108px; border-radius: 50%; margin: 0 auto 24px;
    display: flex; align-items: center; justify-content: center; font-size: 38px;
    border: 3px solid white; box-shadow: 0 10px 32px rgba(46,37,64,0.12);
    position: relative; z-index: 1;
  }
  .hfl-step:nth-child(1) .hfl-step-icon { background: var(--butter); }
  .hfl-step:nth-child(2) .hfl-step-icon { background: var(--blush); }
  .hfl-step:nth-child(3) .hfl-step-icon { background: var(--sky); }
  .hfl-step:nth-child(4) .hfl-step-icon { background: var(--sage-light); }
  .hfl-step h3 {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700;
    margin-bottom: 10px; color: var(--plum);
  }
  .hfl-step p { font-size: 14px; color: var(--plum-mid); line-height: 1.65; }

  /* ── FEATURE SECTIONS ─────────────────────────────────────────────────── */
  .hfl-feat {
    padding: 100px 56px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 72px; align-items: center;
  }
  .hfl-feat-2 { background: var(--plum); }
  .hfl-feat-2 .hfl-feat-text { order: 2; }
  .hfl-feat-2 .hfl-feat-visual { order: 1; }
  .hfl-feat-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--butter); color: var(--plum); padding: 6px 16px;
    border-radius: 100px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;
    margin-bottom: 24px; border: 1px solid rgba(46,37,64,0.1);
  }
  .hfl-feat-2 .hfl-feat-eyebrow {
    background: rgba(122,175,118,0.2); color: var(--sage); border-color: rgba(122,175,118,0.3);
  }
  .hfl-feat-text h2 { color: var(--plum); margin-bottom: 20px; }
  .hfl-feat-2 .hfl-feat-text h2 { color: white; }
  .hfl-feat-lead {
    font-size: 17px; color: var(--plum-mid); line-height: 1.75; margin-bottom: 32px;
  }
  .hfl-feat-2 .hfl-feat-lead { color: rgba(253,252,250,0.65); }
  .hfl-feat-checklist {
    list-style: none; display: flex; flex-direction: column; gap: 12px; margin-bottom: 38px;
  }
  .hfl-feat-checklist li {
    display: flex; align-items: flex-start; gap: 12px;
    font-size: 15px; color: var(--plum); line-height: 1.5;
  }
  .hfl-feat-2 .hfl-feat-checklist li { color: rgba(253,252,250,0.85); }
  .hfl-feat-check {
    width: 22px; height: 22px; background: var(--sage-light); border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: var(--sage); flex-shrink: 0; margin-top: 1px; font-weight: 700;
  }
  .hfl-feat-2 .hfl-feat-check { background: rgba(122,175,118,0.25); }
  .hfl-feat-cta {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 15px; font-weight: 700; color: var(--plum);
    border: 2px solid var(--plum); border-radius: 100px; padding: 14px 28px;
    cursor: pointer; background: transparent; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: background .2s, color .2s;
  }
  .hfl-feat-cta:hover { background: var(--plum); color: white; }
  .hfl-feat-2 .hfl-feat-cta { border-color: var(--sage); color: var(--sage); }
  .hfl-feat-2 .hfl-feat-cta:hover { background: var(--sage); color: var(--plum); }

  /* Feature visual panels */
  .hfl-feat-panel {
    background: white; border-radius: 24px; overflow: hidden;
    box-shadow: 0 32px 80px rgba(46,37,64,0.14);
  }
  .hfl-feat-2 .hfl-feat-panel {
    background: rgba(253,252,250,0.06); border: 1px solid rgba(253,252,250,0.12);
    box-shadow: none;
  }
  /* Record panel */
  .hfl-rec-hdr { background: var(--plum); padding: 22px 26px; }
  .hfl-rec-hdr-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .hfl-rec-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 700; color: white; }
  .hfl-rec-verified { display: flex; align-items: center; gap: 5px; background: rgba(122,175,118,0.3); border: 1px solid rgba(122,175,118,0.5); border-radius: 100px; padding: 3px 10px; font-size: 10px; color: #A8DCA5; font-weight: 700; }
  .hfl-rec-addr { font-size: 12px; color: rgba(255,255,255,0.55); }
  .hfl-rec-score-row { display: flex; align-items: center; gap: 14px; margin-top: 14px; }
  .hfl-rec-score-num { font-family: 'Fraunces', serif; font-size: 48px; font-weight: 900; color: var(--sage); line-height: 1; }
  .hfl-rec-score-right { flex: 1; }
  .hfl-rec-score-lbl { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .hfl-rec-bar-wrap { height: 6px; background: rgba(255,255,255,0.15); border-radius: 100px; overflow: hidden; }
  .hfl-rec-bar { height: 100%; width: 91%; background: linear-gradient(90deg, var(--sage), #A8E8A0); border-radius: 100px; }
  .hfl-rec-body { padding: 20px 26px; }
  .hfl-rec-section-lbl { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--plum-mid); margin-bottom: 12px; }
  .hfl-rec-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .hfl-rec-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--sage-light); border-radius: 10px; font-size: 12px; }
  .hfl-rec-item-l { display: flex; align-items: center; gap: 8px; color: var(--plum); font-weight: 600; }
  .hfl-rec-pass { font-size: 11px; font-weight: 700; color: var(--sage); }
  .hfl-rec-due { font-size: 11px; font-weight: 700; color: #D4843A; }
  .hfl-rec-footer { padding: 14px 26px; background: var(--sage-light); border-top: 1px solid var(--sage-mid); font-size: 11px; color: var(--plum-mid); font-weight: 600; display: flex; align-items: center; gap: 8px; }
  /* AI panel */
  .hfl-ai-panel-hdr {
    background: rgba(253,252,250,0.1); padding: 16px 22px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid rgba(253,252,250,0.08);
  }
  .hfl-ai-panel-hdr-l { display: flex; align-items: center; gap: 10px; }
  .hfl-ai-panel-name { font-size: 14px; font-weight: 700; color: white; }
  .hfl-ai-panel-live { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--sage); font-weight: 600; }
  .hfl-ai-panel-dot { width: 6px; height: 6px; background: var(--sage); border-radius: 50%; animation: hfl-pulse 2s infinite; }
  .hfl-ai-panel-body { padding: 22px; display: flex; flex-direction: column; gap: 16px; }
  .hfl-ai-notice {
    background: rgba(245,233,187,0.12); border: 1px solid rgba(245,233,187,0.25);
    border-radius: 14px; padding: 16px;
  }
  .hfl-ai-notice-tag { font-size: 10px; font-weight: 700; color: #F5E9BB; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .hfl-ai-notice p { font-size: 13px; color: rgba(253,252,250,0.85); line-height: 1.6; margin-bottom: 12px; }
  .hfl-ai-notice-btn { background: var(--sage); color: var(--plum); font-size: 12px; font-weight: 700; padding: 7px 16px; border-radius: 100px; border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
  .hfl-ai-user-msg { display: flex; align-items: flex-start; gap: 10px; }
  .hfl-ai-user-icon { width: 30px; height: 30px; background: rgba(253,252,250,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; margin-top: 2px; }
  .hfl-ai-user-msg p { font-size: 13px; color: rgba(253,252,250,0.55); line-height: 1.55; font-style: italic; }
  .hfl-ai-reply { background: rgba(122,175,118,0.15); border-radius: 14px; padding: 14px 16px; }
  .hfl-ai-reply-tag { font-size: 10px; font-weight: 700; color: var(--sage); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
  .hfl-ai-reply p { font-size: 13px; color: rgba(253,252,250,0.85); line-height: 1.6; }
  .hfl-ai-panel-footer {
    padding: 14px 22px; border-top: 1px solid rgba(253,252,250,0.08);
    display: flex; align-items: center; gap: 12px;
  }
  .hfl-ai-mic { width: 40px; height: 40px; background: var(--sage); border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 0 0 8px rgba(122,175,118,0.15); }
  .hfl-ai-mic-hint { font-size: 12px; color: rgba(253,252,250,0.4); }
  /* Agent compete panel */
  .hfl-compete-hdr { background: var(--plum); padding: 22px 26px; }
  .hfl-compete-title { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 700; color: white; margin-bottom: 4px; }
  .hfl-compete-sub { font-size: 12px; color: rgba(255,255,255,0.5); }
  .hfl-compete-body { padding: 20px 26px; display: flex; flex-direction: column; gap: 12px; }
  .hfl-compete-agent {
    background: var(--sage-light); border-radius: 14px; padding: 14px 16px;
    display: flex; align-items: center; gap: 14px;
  }
  .hfl-compete-agent-featured {
    background: var(--butter); border: 2px solid rgba(46,37,64,0.12);
  }
  .hfl-compete-avi { width: 40px; height: 40px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .hfl-compete-info { flex: 1; }
  .hfl-compete-name { font-size: 13px; font-weight: 700; color: var(--plum); margin-bottom: 2px; }
  .hfl-compete-detail { font-size: 11px; color: var(--plum-mid); line-height: 1.4; }
  .hfl-compete-comm { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900; color: var(--plum); flex-shrink: 0; }
  .hfl-compete-best {
    display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;
    background: var(--sage); color: var(--plum); font-size: 10px; font-weight: 700;
    padding: 3px 8px; border-radius: 100px;
  }
  .hfl-compete-footer { padding: 14px 26px; background: var(--sage-light); border-top: 1px solid var(--sage-mid); font-size: 11px; color: var(--plum-mid); font-weight: 600; display: flex; align-items: center; gap: 8px; }

  /* ── REPORT CTA ───────────────────────────────────────────────────────── */
  .hfl-report {
    margin: 0 56px 100px;
    background: linear-gradient(135deg, var(--blush), var(--butter));
    border-radius: 28px; padding: 72px 80px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center;
  }
  .hfl-rc-label { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--plum); margin-bottom: 18px; }
  .hfl-report h2 { color: var(--plum); margin-bottom: 18px; }
  .hfl-report h2 em { color: var(--plum-mid); font-style: italic; font-weight: 300; }
  .hfl-report p { font-size: 16px; color: rgba(46,37,64,0.7); line-height: 1.7; margin-bottom: 36px; }
  .hfl-rc-actions { display: flex; gap: 14px; flex-wrap: wrap; }
  .hfl-rc-btn {
    background: var(--plum); color: white; padding: 16px 32px; border-radius: 100px;
    font-weight: 700; font-size: 15px; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: transform .2s, box-shadow .2s;
  }
  .hfl-rc-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(46,37,64,0.3); }
  .hfl-rc-ghost {
    background: rgba(46,37,64,0.08); color: var(--plum); padding: 16px 24px; border-radius: 100px;
    font-weight: 600; font-size: 15px; border: 1px solid rgba(46,37,64,0.2); cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: background .2s;
  }
  .hfl-rc-ghost:hover { background: rgba(46,37,64,0.14); }
  .hfl-report-mock { background: white; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 60px rgba(46,37,64,0.18); }
  .hfl-mock-top { background: var(--plum); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; }
  .hfl-mock-addr { font-family: 'Fraunces', serif; font-size: 15px; color: white; font-weight: 700; }
  .hfl-mock-badge { background: var(--sage); color: var(--plum); font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 100px; letter-spacing: 1px; }
  .hfl-mock-score { background: var(--sage-light); padding: 14px 20px; display: flex; align-items: center; gap: 14px; }
  .hfl-mock-num { font-family: 'Fraunces', serif; font-size: 38px; font-weight: 900; color: var(--sage); line-height: 1; }
  .hfl-mock-score-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--plum-mid); margin-bottom: 6px; }
  .hfl-mock-bar { height: 8px; background: var(--sage-mid); border-radius: 100px; overflow: hidden; }
  .hfl-mock-bar-fill { height: 100%; width: 91%; background: linear-gradient(90deg, var(--sage), #A8E8A0); border-radius: 100px; }
  .hfl-mock-rows { padding: 8px 20px 16px; }
  .hfl-mock-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #F0EDE8; font-size: 12px; }
  .hfl-mock-row:last-child { border-bottom: none; }
  .hfl-mock-row-lbl { color: var(--plum-mid); display: flex; align-items: center; gap: 6px; }
  .hfl-mock-pass { font-weight: 700; color: var(--sage); }
  .hfl-mock-flag { font-weight: 700; color: #D4843A; }
  .hfl-mock-info { font-weight: 700; color: var(--plum-mid); }
  .hfl-mock-footer { padding: 10px 20px 14px; display: flex; align-items: center; gap: 8px; background: var(--sage-light); border-top: 1px solid var(--sage-mid); font-size: 11px; color: var(--plum-mid); font-weight: 600; }

  /* ── TESTIMONIALS ─────────────────────────────────────────────────────── */
  .hfl-testimonials { padding: 0 56px 100px; }
  .hfl-testimonials-header { text-align: center; margin-bottom: 48px; }
  .hfl-testimonials-header h2 { margin-bottom: 12px; }
  .hfl-testimonials-header p { font-size: 17px; color: var(--plum-mid); }
  .hfl-featured-quote {
    background: var(--plum); border-radius: 24px; padding: 52px 60px;
    margin-bottom: 22px; position: relative; overflow: hidden;
  }
  .hfl-featured-quote::before {
    content: '"'; position: absolute; top: -32px; left: 36px;
    font-family: 'Fraunces', serif; font-size: 200px; font-weight: 900;
    color: rgba(122,175,118,0.12); line-height: 1; pointer-events: none;
  }
  .hfl-featured-quote-text {
    font-family: 'Fraunces', serif; font-size: clamp(20px, 2.5vw, 28px);
    font-weight: 600; color: white; line-height: 1.5; margin-bottom: 32px;
    max-width: 720px; position: relative;
  }
  .hfl-featured-quote-text em { color: var(--sage); font-style: italic; }
  .hfl-featured-author { display: flex; align-items: center; gap: 16px; }
  .hfl-featured-avi {
    width: 52px; height: 52px; border-radius: 50%; background: var(--blush);
    display: flex; align-items: center; justify-content: center; font-size: 26px;
    border: 2px solid rgba(122,175,118,0.4); flex-shrink: 0;
  }
  .hfl-featured-name { font-size: 15px; font-weight: 700; color: white; margin-bottom: 3px; }
  .hfl-featured-role { font-size: 13px; color: rgba(253,252,250,0.55); }
  .hfl-featured-result { margin-left: auto; text-align: right; flex-shrink: 0; }
  .hfl-featured-result-num {
    font-family: 'Fraunces', serif; font-size: 38px; font-weight: 900;
    color: var(--sage); line-height: 1; margin-bottom: 4px;
  }
  .hfl-featured-result-lbl { font-size: 12px; color: rgba(253,252,250,0.5); }
  .hfl-test-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .hfl-test-card {
    background: white; border-radius: 20px; padding: 30px;
    border: 1.5px solid rgba(122,175,118,0.2); transition: border-color .2s, box-shadow .2s;
  }
  .hfl-test-card:hover { border-color: var(--sage); box-shadow: 0 8px 32px rgba(122,175,118,0.15); }
  .hfl-stars { color: #F4B942; font-size: 16px; margin-bottom: 14px; }
  .hfl-test-card blockquote { font-size: 14px; line-height: 1.75; color: var(--plum-mid); margin-bottom: 20px; font-style: italic; }
  .hfl-test-author { display: flex; align-items: center; gap: 12px; }
  .hfl-avi { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .hfl-avi-1 { background: var(--blush); }
  .hfl-avi-2 { background: var(--sky); }
  .hfl-avi-3 { background: var(--butter); }
  .hfl-test-name { font-weight: 700; font-size: 13px; color: var(--plum); }
  .hfl-test-role { font-size: 11px; color: var(--plum-mid); }

  /* ── PERSONA CTA ──────────────────────────────────────────────────────── */
  .hfl-cta { padding: 0 56px 100px; }
  .hfl-cta-inner {
    background: var(--sage-light); border-radius: 28px; padding: 80px;
    text-align: center; border: 2px solid var(--sage-mid); position: relative; overflow: hidden;
  }
  .hfl-cta-blob1 { position: absolute; top: -60px; right: -60px; width: 300px; height: 300px; background: radial-gradient(circle, var(--blush), transparent 70%); pointer-events: none; }
  .hfl-cta-blob2 { position: absolute; bottom: -80px; left: -40px; width: 280px; height: 280px; background: radial-gradient(circle, var(--sky), transparent 70%); pointer-events: none; }
  .hfl-cta h2 { letter-spacing: -2px; margin-bottom: 14px; position: relative; }
  .hfl-cta-sub { font-size: 18px; color: var(--plum-mid); margin-bottom: 52px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.65; position: relative; }
  .hfl-personas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; max-width: 1020px; margin: 0 auto; position: relative; }
  .hfl-persona {
    background: white; border-radius: 20px; padding: 32px 24px;
    border: 2px solid transparent; transition: border-color .2s, box-shadow .2s, transform .2s;
    text-align: left; cursor: pointer;
  }
  .hfl-persona:hover { border-color: var(--sage); box-shadow: 0 12px 36px rgba(46,37,64,0.12); transform: translateY(-4px); }
  .hfl-persona-icon { font-size: 36px; margin-bottom: 16px; }
  .hfl-persona-role { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--sage); margin-bottom: 8px; }
  .hfl-persona-title { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: var(--plum); margin-bottom: 10px; }
  .hfl-persona-desc { font-size: 13px; color: var(--plum-mid); line-height: 1.6; margin-bottom: 22px; }
  .hfl-persona-cta { font-size: 14px; font-weight: 700; color: var(--plum); display: flex; align-items: center; gap: 6px; }
  .hfl-persona-arrow { transition: transform .2s; display: inline-block; }
  .hfl-persona:hover .hfl-persona-arrow { transform: translateX(4px); }

  /* ── DATA SECTION ─────────────────────────────────────────────────────── */
  .hfl-data { padding: 0 56px 100px; }
  .hfl-data-inner {
    background: var(--plum); border-radius: 8px 40px 40px 40px;
    border: 1px solid rgba(122,175,118,0.15);
    padding: 72px 80px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center;
  }
  .hfl-data-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(122,175,118,0.18); color: var(--sage);
    padding: 6px 16px; border-radius: 100px;
    font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    margin-bottom: 24px;
  }
  .hfl-data h2 { color: white; letter-spacing: -1px; margin-bottom: 20px; }
  .hfl-data h2 em { color: var(--sage); }
  .hfl-data-lead { font-size: 17px; color: rgba(253,252,250,0.7); line-height: 1.7; margin-bottom: 36px; }
  .hfl-data-cards { display: flex; flex-direction: column; gap: 14px; }
  .hfl-data-card {
    background: rgba(253,252,250,0.06); border: 1px solid rgba(253,252,250,0.1);
    border-radius: 16px; padding: 22px 24px; display: flex; gap: 18px; align-items: flex-start;
    transition: background .2s, border-color .2s;
  }
  .hfl-data-card:hover { background: rgba(253,252,250,0.1); border-color: rgba(122,175,118,0.4); }
  .hfl-data-card-icon { font-size: 26px; flex-shrink: 0; margin-top: 2px; }
  .hfl-data-card-title { font-weight: 700; color: white; font-size: 15px; margin-bottom: 4px; }
  .hfl-data-card-body { font-size: 13px; color: rgba(253,252,250,0.6); line-height: 1.6; }
  .hfl-data-note {
    margin-top: 28px; font-size: 12px; color: rgba(253,252,250,0.35);
    display: flex; align-items: center; gap: 8px;
  }
  .hfl-data-note::before { content: ""; display: block; width: 20px; height: 1px; background: rgba(253,252,250,0.2); }

  /* ── FREE TOOLS ───────────────────────────────────────────────────────── */
  .hfl-tools { padding: 0 56px 100px; }
  .hfl-tools-inner {
    background: var(--sage-light); border-radius: 28px; padding: 64px 72px;
    border: 2px solid var(--sage-mid); position: relative; overflow: hidden;
  }
  .hfl-tools-header { text-align: center; margin-bottom: 48px; }
  .hfl-tools-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--sage-mid); color: var(--plum); padding: 5px 16px;
    border-radius: 100px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
    margin-bottom: 16px;
  }
  .hfl-tools h2 { font-size: clamp(28px, 4vw, 42px); color: var(--plum); }
  .hfl-tools-sub { font-size: 16px; color: var(--plum-mid); margin-top: 12px; line-height: 1.7; }
  .hfl-tools-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .hfl-tool-card {
    background: white; border-radius: 20px; padding: 28px 24px;
    display: flex; flex-direction: column; gap: 12px;
    border: 1.5px solid var(--sage-mid); cursor: pointer;
    transition: transform .2s, box-shadow .2s; text-decoration: none; color: inherit;
  }
  .hfl-tool-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(46,37,64,0.1); }
  .hfl-tool-icon { font-size: 28px; }
  .hfl-tool-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sage); margin-bottom: 2px; }
  .hfl-tool-title { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 700; color: var(--plum); line-height: 1.2; }
  .hfl-tool-desc { font-size: 13px; color: var(--plum-mid); line-height: 1.65; flex: 1; }
  .hfl-tool-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--plum); margin-top: 4px; }

  /* ── FEATURE SHOWCASE ────────────────────────────────────────────────── */
  .hfl-showcase { padding: 0 56px 100px; }
  .hfl-showcase-header { max-width: 540px; margin-bottom: 40px; }
  .hfl-showcase-inner {
    background: var(--plum);
    border-radius: 8px 40px 40px 40px;
    display: flex; overflow: hidden; min-height: 560px;
    border: 1px solid rgba(122,175,118,0.15);
  }
  /* Left nav */
  .hfl-sc-nav {
    width: 248px; flex-shrink: 0;
    background: rgba(253,252,250,0.04);
    border-right: 1px solid rgba(253,252,250,0.08);
    padding: 28px 16px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .hfl-sc-nav-label {
    font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    color: rgba(253,252,250,0.25); padding: 0 12px; margin-bottom: 12px;
  }
  .hfl-sc-tab {
    width: 100%; background: none; border: none; cursor: pointer; text-align: left;
    padding: 12px 14px; border-radius: 10px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    transition: background .15s;
  }
  .hfl-sc-tab:hover:not(.hfl-sc-tab-active) { background: rgba(253,252,250,0.06); }
  .hfl-sc-tab-active { background: rgba(253,252,250,0.1); }
  .hfl-sc-tab-row { display: flex; align-items: center; gap: 10px; }
  .hfl-sc-tab-icon { font-size: 16px; flex-shrink: 0; }
  .hfl-sc-tab-title {
    font-size: 13px; font-weight: 600; color: rgba(253,252,250,0.45); line-height: 1.3;
  }
  .hfl-sc-tab-active .hfl-sc-tab-title { color: white; }
  .hfl-sc-progress-track {
    height: 2px; background: rgba(253,252,250,0.08); border-radius: 100px;
    overflow: hidden; margin-top: 10px;
  }
  .hfl-sc-progress-bar {
    height: 100%; background: var(--sage); border-radius: 100px;
    animation: hfl-sc-fill 5s linear forwards;
  }
  @keyframes hfl-sc-fill { from { width: 0 } to { width: 100% } }
  /* Content panel */
  .hfl-sc-content {
    flex: 1; min-width: 0; padding: 48px 52px;
    display: grid; grid-template-columns: 1fr 320px; gap: 44px; align-items: start;
    position: relative; overflow: hidden;
  }
  .hfl-sc-content::before {
    content: ''; position: absolute; top: -30%; right: -5%; width: 380px; height: 380px;
    background: radial-gradient(circle, rgba(122,175,118,0.1), transparent 65%);
    pointer-events: none;
  }
  .hfl-sc-kicker {
    font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    color: var(--sage); margin-bottom: 14px;
  }
  .hfl-sc-heading {
    font-family: 'Fraunces', serif; font-size: clamp(26px, 2.8vw, 36px);
    font-weight: 900; color: white; line-height: 1.1;
    letter-spacing: -0.5px; margin-bottom: 14px;
  }
  .hfl-sc-heading em { color: var(--sage); font-style: italic; font-weight: 300; }
  .hfl-sc-desc {
    font-size: 15px; color: rgba(253,252,250,0.62); line-height: 1.75; margin-bottom: 24px;
  }
  .hfl-sc-bullets {
    list-style: none; display: flex; flex-direction: column; gap: 9px; margin-bottom: 28px;
  }
  .hfl-sc-bullets li {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 13px; color: rgba(253,252,250,0.78); line-height: 1.5;
  }
  .hfl-sc-bullet-dot {
    width: 18px; height: 18px; background: rgba(122,175,118,0.22); border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; color: var(--sage); flex-shrink: 0; margin-top: 2px; font-weight: 700;
  }
  .hfl-sc-cta {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--sage); color: var(--plum);
    padding: 11px 22px; border-radius: 100px;
    font-size: 13px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    transition: transform .2s, box-shadow .2s;
  }
  .hfl-sc-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(122,175,118,0.3); }
  /* Slide-in animation */
  .hfl-sc-slide { animation: hfl-sc-in .35s ease both; }
  @keyframes hfl-sc-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  /* Visual column */
  .hfl-sc-visual {
    border-radius: 16px; overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.35); flex-shrink: 0;
  }
  /* Mobile showcase */
  @media (max-width: 900px) {
    .hfl-showcase { padding: 0 24px 64px; }
    .hfl-showcase-inner { flex-direction: column; border-radius: 8px 20px 20px 20px; min-height: auto; }
    .hfl-sc-nav { width: 100%; flex-direction: row; gap: 6px; overflow-x: auto; padding: 16px; border-right: none; border-bottom: 1px solid rgba(253,252,250,0.08); }
    .hfl-sc-nav-label { display: none; }
    .hfl-sc-tab { padding: 10px 14px; white-space: nowrap; flex-shrink: 0; width: auto; }
    .hfl-sc-progress-track { display: none; }
    .hfl-sc-content { grid-template-columns: 1fr; padding: 28px 24px; gap: 28px; }
    .hfl-sc-visual { display: none; }
  }

  /* ── FOOTER ───────────────────────────────────────────────────────────── */
  .hfl-footer { background: var(--charcoal); padding: 64px 56px 32px; }
  .hfl-footer-top {
    display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 52px;
  }
  .hfl-footer-logo { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 900; color: white; margin-bottom: 14px; display: block; text-decoration: none; }
  .hfl-footer-logo span { color: var(--sage); }
  .hfl-footer-tagline { font-size: 14px; color: rgba(253,252,250,0.45); line-height: 1.65; max-width: 220px; margin-bottom: 24px; }
  .hfl-footer-social { display: flex; gap: 10px; }
  .hfl-footer-social a {
    color: rgba(253,252,250,0.4); transition: color .2s; display: flex; align-items: center;
    width: 36px; height: 36px; background: rgba(253,252,250,0.06); border-radius: 50%;
    justify-content: center; transition: color .2s, background .2s;
  }
  .hfl-footer-social a:hover { color: var(--sage); background: rgba(122,175,118,0.15); }
  .hfl-footer-col-title {
    font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    color: rgba(253,252,250,0.35); margin-bottom: 20px;
  }
  .hfl-footer-col-links { list-style: none; display: flex; flex-direction: column; gap: 12px; }
  .hfl-footer-col-links a {
    font-size: 14px; color: rgba(253,252,250,0.6); text-decoration: none;
    transition: color .2s; cursor: pointer;
  }
  .hfl-footer-col-links a:hover { color: rgba(253,252,250,0.95); }
  .hfl-footer-bottom {
    border-top: 1px solid rgba(253,252,250,0.08); padding-top: 24px;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 13px; color: rgba(253,252,250,0.35);
  }
  .hfl-footer-bottom-links { display: flex; gap: 24px; }
  .hfl-footer-bottom-links a { color: rgba(253,252,250,0.35); text-decoration: none; transition: color .2s; }
  .hfl-footer-bottom-links a:hover { color: rgba(253,252,250,0.65); }

  /* ── ENTRANCE ANIMATIONS ──────────────────────────────────────────────── */
  @keyframes hfl-fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }

  /* ── MOBILE ───────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .hfl-nav { padding: 0 24px; }
    .hfl-nav-links {
      display: none; position: fixed; top: 70px; left: 0; right: 0;
      transform: none; flex-direction: column; gap: 0;
      background: var(--white); border-top: 1px solid var(--rule);
      padding: 8px 24px 24px; z-index: 99;
    }
    .hfl-nav-links.hfl-menu-open { display: flex; }
    .hfl-nav-links.hfl-menu-open li { width: 100%; }
    .hfl-nav-links.hfl-menu-open li a {
      display: block; padding: 14px 0; font-size: 15px; border-radius: 0;
      border-bottom: 1px solid var(--rule);
    }
    .hfl-nav-links.hfl-menu-open li:last-child a { border-bottom: none; }
    .hfl-nav-signin { display: none; }
    .hfl-hamburger { display: block; }
    .hfl-hamburger.hfl-menu-open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .hfl-hamburger.hfl-menu-open span:nth-child(2) { opacity: 0; }
    .hfl-hamburger.hfl-menu-open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

    .hfl-hero { grid-template-columns: 1fr; min-height: auto; padding: 90px 24px 48px; }
    .hfl-hero-right { display: none; }
    .hfl h1 { font-size: clamp(38px, 10vw, 54px); letter-spacing: -1.5px; }
    .hfl-sub { font-size: 16px; max-width: 100%; }
    .hfl-hero-trust { display: none; }

    .hfl-trust-strip { padding: 16px 24px; gap: 16px; }
    .hfl-trust-city { padding: 0 12px; font-size: 12px; }
    .hfl-trust-rating { display: none; }

    .hfl-metrics { grid-template-columns: 1fr 1fr; padding: 44px 24px; gap: 16px; }
    .hfl-metric-num { font-size: 38px; }

    .hfl-how { padding: 64px 24px; }
    .hfl-section-header { margin-bottom: 48px; }
    .hfl-flow { grid-template-columns: 1fr 1fr; gap: 36px; }
    .hfl-flow::before { display: none; }
    .hfl-step-icon { width: 80px; height: 80px; font-size: 28px; }

    .hfl-feat { grid-template-columns: 1fr; padding: 64px 24px; gap: 40px; }
    .hfl-feat-2 .hfl-feat-text { order: 0; }
    .hfl-feat-2 .hfl-feat-visual { order: 0; }

    .hfl-report { margin: 0 24px 64px; padding: 40px 28px; grid-template-columns: 1fr; gap: 36px; }
    .hfl-report h2 { font-size: 32px; }
    .hfl-report > div:last-child { display: none; }

    .hfl-testimonials { padding: 0 24px 64px; }
    .hfl-featured-quote { padding: 36px 28px; }
    .hfl-featured-result { display: none; }
    .hfl-test-grid { grid-template-columns: 1fr; }

    .hfl-cta { padding: 0 24px 64px; }
    .hfl-cta-inner { padding: 48px 24px; }
    .hfl-cta h2 { font-size: 34px; letter-spacing: -1px; }
    .hfl-cta-sub { font-size: 15px; }
    .hfl-personas { grid-template-columns: 1fr 1fr; max-width: 100%; }
    .hfl-personas > *:last-child:nth-child(odd) { grid-column: span 2; max-width: 340px; margin: 0 auto; }

    .hfl-data { padding: 0 24px 64px; }
    .hfl-data-inner { grid-template-columns: 1fr; padding: 40px 28px; gap: 48px; border-radius: 8px 20px 20px 20px; }
    .hfl-data h2 { font-size: 34px; }

    .hfl-tools { padding: 0 24px 64px; }
    .hfl-tools-inner { padding: 40px 28px; border-radius: 20px; }
    .hfl-tools-grid { grid-template-columns: 1fr 1fr; }

    .hfl-footer { padding: 48px 24px 28px; }
    .hfl-footer-top { grid-template-columns: 1fr 1fr; gap: 32px; }
    .hfl-footer-bottom { flex-direction: column; gap: 16px; text-align: center; }
    .hfl-footer-bottom-links { flex-wrap: wrap; justify-content: center; gap: 16px; }
  }

  @media (max-width: 480px) {
    .hfl h1 { font-size: clamp(32px, 10vw, 44px); letter-spacing: -1px; }
    .hfl-actions { flex-direction: column; align-items: stretch; }
    .hfl-btn-main, .hfl-btn-soft { text-align: center; padding: 15px 20px; }
    .hfl-trust-strip { display: none; }
    .hfl-metrics { grid-template-columns: 1fr; padding: 36px 16px; }
    .hfl-flow { grid-template-columns: 1fr; gap: 28px; }
    .hfl-step { display: flex; align-items: flex-start; gap: 20px; text-align: left; }
    .hfl-step-icon { width: 60px; height: 60px; font-size: 24px; flex-shrink: 0; margin: 0; }
    .hfl h2 { font-size: 28px; }
    .hfl-tools-grid { grid-template-columns: 1fr; }
    .hfl-footer-top { grid-template-columns: 1fr; }
    .hfl-report { margin: 0 16px 48px; padding: 32px 20px; }
  }

  @media (min-width: 901px) and (max-width: 1100px) {
    .hfl-nav { padding: 0 32px; }
    .hfl-hero { padding: 70px 32px 0; gap: 32px; }
    .hfl-blob-wrap { width: 360px; height: 420px; }
    .hfl-dash-card { width: 290px; }
    .hfl-trust-strip { padding: 18px 32px; }
    .hfl-metrics { padding: 56px 32px; }
    .hfl-how { padding: 80px 32px; }
    .hfl-feat { padding: 72px 32px; gap: 48px; }
    .hfl-report { margin-left: 32px; margin-right: 32px; padding: 56px 48px; }
    .hfl-testimonials, .hfl-cta { padding-left: 32px; padding-right: 32px; }
    .hfl-tools { padding: 0 32px 80px; }
    .hfl-tools-inner { padding: 52px 48px; }
    .hfl-data { padding: 0 32px 80px; }
    .hfl-data-inner { padding: 56px 48px; }
    .hfl-footer { padding: 52px 32px 28px; }
  }
`;

export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeFeature, setActiveFeature] = React.useState(0);
  const [showcasePaused, setShowcasePaused] = React.useState(false);

  const FEATURES = [
    {
      icon: "📋", kicker: "The Verified Record",
      heading: <>The Carfax<br /><em>your home deserves</em></>,
      desc: "Every service, repair, and renovation — documented, signed, and stored permanently on the Internet Computer blockchain. No middlemen, no expiry.",
      bullets: ["Full ownership & transaction history", "Verified contractor records & warranties", "Permitted renovations on file", "AI agents continuously update your score"],
      cta: "Build my record",
    },
    {
      icon: "🎤", kicker: "AI Home Intelligence",
      heading: <>Your home has a voice.<br /><em>So do you.</em></>,
      desc: "Ask your home anything — and it reaches out first when something needs attention. Voice-powered, home-aware, always on.",
      bullets: ["Voice queries across your full maintenance history", "Proactive alerts before costly failures occur", "Utility bill anomaly & spike detection", "IoT sensor events trigger auto-scheduling"],
      cta: "Try the AI",
    },
    {
      icon: "⚖️", kicker: "Sell Smarter",
      heading: <>Make agents compete<br /><em>for your listing</em></>,
      desc: "Post your listing intent and let verified agents submit competing proposals. Compare commissions and net proceeds side by side — or go FSBO.",
      bullets: ["Competing agent proposals within 48 hours", "Compare commissions & estimated net proceeds", "FSBO mode with showing management & offer inbox", "Sealed-bid offer management"],
      cta: "List your home",
    },
    {
      icon: "👷", kicker: "Service Network",
      heading: <>Verified contractors,<br /><em>auto-logged work</em></>,
      desc: "Every contractor in our network is credentialed, reviewed, and bonded. Their completed work is automatically logged to your home's permanent record.",
      bullets: ["Credentialed & background-checked providers", "Work auto-signed and logged to your record", "Verified receipts & warranties on file", "Rate-limited reviews — real feedback only"],
      cta: "Browse the network",
    },
  ];

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!document.getElementById("hf-landing-fonts")) {
      const link = document.createElement("link");
      link.id = "hf-landing-fonts";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;0,9..144,900;1,9..144,300;1,9..144,600;1,9..144,900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
    return () => {
      document.getElementById("hf-landing-fonts")?.remove();
    };
  }, []);

  useEffect(() => {
    if (showcasePaused) return;
    const t = setInterval(() => setActiveFeature((p) => (p + 1) % FEATURES.length), 5000);
    return () => clearInterval(t);
  }, [showcasePaused, FEATURES.length]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <Helmet>
        <title>HomeGentic — Verified Home Maintenance Records</title>
        <meta name="description" content="HomeGentic gives homeowners a verified, blockchain-backed record of every repair, upgrade, and inspection — boosting home value and buyer confidence." />
        <meta property="og:title" content="HomeGentic — Verified Home Maintenance Records" />
        <meta property="og:description" content="Prove your home's history. Verified maintenance records for homeowners, contractors, and buyers." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://homegentic.app/" />
        <meta property="og:image" content="https://homegentic.app/og-default.png" />
        <link rel="canonical" href="https://homegentic.app/" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "HomeGentic",
          "url": "https://homegentic.app/",
          "description": "Verified home maintenance records on the blockchain.",
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://homegentic.app/check?address={search_term_string}",
            "query-input": "required name=search_term_string"
          }
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            { "@type": "Question", "name": "How do I prove my home maintenance history to buyers?", "acceptedAnswer": { "@type": "Answer", "text": "HomeGentic creates a blockchain-backed record of every repair, inspection, and upgrade you complete." } },
            { "@type": "Question", "name": "What are home maintenance records and why do they matter for sale?", "acceptedAnswer": { "@type": "Answer", "text": "Home maintenance records are documented proof of repairs and system upkeep. Homes with verified maintenance history sell faster." } },
            { "@type": "Question", "name": "How does verified contractor work history work?", "acceptedAnswer": { "@type": "Answer", "text": "Both homeowner and contractor digitally sign the record, making it tamper-proof and verifiable by third parties." } },
            { "@type": "Question", "name": "Can I use HomeGentic to track DIY home repairs?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Homeowners can log DIY jobs themselves, marked as self-verified in the maintenance timeline." } },
            { "@type": "Question", "name": "How does HomeGentic help with home insurance claims?", "acceptedAnswer": { "@type": "Answer", "text": "HomeGentic's Insurance Defense report compiles your verified job history into a shareable document insurers can reference during claims." } },
            { "@type": "Question", "name": "Is my maintenance data private?", "acceptedAnswer": { "@type": "Answer", "text": "Your data lives on the Internet Computer blockchain under your control. You choose what to share and with whom." } },
          ]
        })}</script>
      </Helmet>
      <style>{CSS}</style>
      <div className="hfl">

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav className="hfl-nav">
          <a href="/" className="hfl-logo">Home<span>Gentic</span></a>
          <ul className={`hfl-nav-links${menuOpen ? " hfl-menu-open" : ""}`}>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-features"); }}>For Homeowners</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-features"); }}>Service Network</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-report"); }}>Report</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-sell"); }}>Sell Smarter</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); scrollTo("hfl-tools"); }}>Free Tools</a></li>
            <li><a onClick={(e) => { e.preventDefault(); setMenuOpen(false); navigate("/pricing"); }}>Pricing</a></li>
          </ul>
          <div className="hfl-nav-actions">
            <button className="hfl-nav-signin" onClick={() => navigate("/login")}>Sign in</button>
            <button className="hfl-nav-pill" onClick={() => navigate("/login")}>Start Free →</button>
            <button
              className={`hfl-hamburger${menuOpen ? " hfl-menu-open" : ""}`}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span /><span /><span />
            </button>
          </div>
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="hfl-hero">
          <div className="hfl-hero-left">
            <h1>Own It.<br /><em>Prove It.</em><br />Sell It.</h1>
            <p className="hfl-sub">
              HomeGentic tracks every repair, reminds you before things break, and builds
              the complete maintenance record your home deserves — so when it's time to sell,
              you're ready to command a premium.
            </p>
            <div className="hfl-actions">
              <button className="hfl-btn-main" onClick={() => navigate("/login")}>Get Started Free →</button>
              <button className="hfl-btn-soft" onClick={() => navigate("/login")}>See a HomeGentic Report</button>
            </div>
            <div className="hfl-hero-trust">
              <span className="hfl-hero-trust-lbl">Trusted by homeowners in</span>
              {["Austin, TX", "Denver, CO", "Seattle, WA", "Tampa, FL"].map((c) => (
                <span key={c} className="hfl-hero-city">📍 {c}</span>
              ))}
            </div>
          </div>

          <div className="hfl-hero-right">
            <div className="hfl-blob-wrap">
              <div className="hfl-blob-bg" />
              <div className="hfl-dash-card">
                <div className="hfl-dc-header">
                  <div className="hfl-dc-top">
                    <span className="hfl-dc-title">My Home Dashboard</span>
                    <span className="hfl-dc-ver">✓ Verified</span>
                  </div>
                  <div className="hfl-dc-addr">327 Keech Street, Daytona Beach FL</div>
                  <div className="hfl-dc-score-row">
                    <div>
                      <div className="hfl-dc-score-lbl">HomeGentic Score</div>
                      <div className="hfl-dc-num">91</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="hfl-dc-bar-wrap"><div className="hfl-dc-bar" /></div>
                    </div>
                  </div>
                </div>
                <div className="hfl-dc-body">
                  <div className="hfl-dc-sec-lbl">Maintenance &amp; Services</div>
                  <div className="hfl-dc-items">
                    <div className="hfl-dc-item">
                      <span className="hfl-dc-item-l"><span>❄️</span> HVAC Service</span>
                      <span className="hfl-status-done">✓ Logged</span>
                    </div>
                    <div className="hfl-dc-item">
                      <span className="hfl-dc-item-l"><span>🔌</span> Electrical Panel</span>
                      <span className="hfl-status-ok">✓ Verified</span>
                    </div>
                    <div className="hfl-dc-item">
                      <span className="hfl-dc-item-l"><span>🌿</span> Landscaping</span>
                      <span className="hfl-status-due">Due Nov 10</span>
                    </div>
                  </div>
                  <div className="hfl-dc-ver-row">
                    <span style={{ fontSize: 18 }}>📋</span>
                    <span className="hfl-dc-ver-text">
                      <strong>HomeGentic Report Ready</strong> — 14 records verified, share in one click
                    </span>
                  </div>
                </div>
              </div>
              <div className="hfl-badge hfl-badge-1">
                <span className="hfl-badge-icon">🏆</span> Score: 91 · Top 8%
              </div>
              <div className="hfl-badge hfl-badge-2">
                <span className="hfl-badge-icon">⚡</span> 3 agents competing
              </div>
            </div>
          </div>
        </section>


        {/* ── Metrics ─────────────────────────────────────────────────────── */}
        <div className="hfl-metrics">
          {[
            { icon: "📊", num: "40+",    title: "Data points",         sub: "in your property score" },
            { icon: "📋", num: "Avg 47", title: "Verified records",    sub: "per HomeGentic Report" },
            { icon: "🏆", num: "3×",     title: "More offers",         sub: "when score is shared with buyers" },
            { icon: "🚀", num: "Free",   title: "To start",            sub: "no credit card needed" },
          ].map((m) => (
            <div key={m.title} className="hfl-metric-card">
              <div className="hfl-metric-icon">{m.icon}</div>
              <div className="hfl-metric-num">{m.num}</div>
              <div className="hfl-metric-title">{m.title}</div>
              <div className="hfl-metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* ── How It Works ────────────────────────────────────────────────── */}
        <section id="hfl-features" className="hfl-how">
          <div className="hfl-section-header">
            <div className="hfl-kicker">How It Works</div>
            <h2>Own It. Manage It.<br /><em>Prove It. Sell It.</em></h2>
            <p className="hfl-sec-sub">HomeGentic works across the entire homeownership lifecycle — from move-in to sale day.</p>
          </div>
          <div className="hfl-flow">
            {[
              { icon: "🏠", num: "01", title: "Set Up Your Home", desc: "Add your property and import existing records. AI agents begin organizing your home's history automatically." },
              { icon: "🔧", num: "02", title: "Manage & Maintain", desc: "Schedule services with verified providers. Every job is logged, receipted, and stored on your permanent record." },
              { icon: "📋", num: "03", title: "Generate Your Report", desc: "Your HomeGentic Report is a tamper-proof property biography. Share it with buyers or attach it to any listing." },
              { icon: "🏆", num: "04", title: "Sell With Confidence", desc: "List with the agent who wins your bid — or go FSBO with our full suite of seller tools. Your home, your terms." },
            ].map((s) => (
              <div key={s.title} className="hfl-step">
                <div className="hfl-step-num">{s.num}</div>
                <div className="hfl-step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature Showcase ────────────────────────────────────────────── */}
        <section id="hfl-sell" className="hfl-showcase">
          <div className="hfl-showcase-header">
            <div className="hfl-kicker">✦ Everything You Need</div>
            <h2>Built for the entire<br /><em>homeownership journey</em></h2>
          </div>
          <div
            className="hfl-showcase-inner"
            onMouseEnter={() => setShowcasePaused(true)}
            onMouseLeave={() => setShowcasePaused(false)}
          >
            {/* Tab nav */}
            <div className="hfl-sc-nav">
              <div className="hfl-sc-nav-label">Features</div>
              {FEATURES.map((f, i) => (
                <button
                  key={i}
                  className={`hfl-sc-tab${activeFeature === i ? " hfl-sc-tab-active" : ""}`}
                  onClick={() => setActiveFeature(i)}
                >
                  <div className="hfl-sc-tab-row">
                    <span className="hfl-sc-tab-icon">{f.icon}</span>
                    <span className="hfl-sc-tab-title">{f.kicker}</span>
                  </div>
                  {activeFeature === i && (
                    <div className="hfl-sc-progress-track">
                      <div className="hfl-sc-progress-bar" key={`${i}-${showcasePaused}`} style={{ animationPlayState: showcasePaused ? "paused" : "running" }} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="hfl-sc-content">
              <div className="hfl-sc-slide" key={activeFeature}>
                <div className="hfl-sc-kicker">{FEATURES[activeFeature].kicker}</div>
                <div className="hfl-sc-heading">{FEATURES[activeFeature].heading}</div>
                <p className="hfl-sc-desc">{FEATURES[activeFeature].desc}</p>
                <ul className="hfl-sc-bullets">
                  {FEATURES[activeFeature].bullets.map((b) => (
                    <li key={b}><span className="hfl-sc-bullet-dot">✓</span>{b}</li>
                  ))}
                </ul>
                <button className="hfl-sc-cta" onClick={() => navigate("/login")}>
                  {FEATURES[activeFeature].cta} →
                </button>
              </div>

              {/* Visual panel */}
              <div className="hfl-sc-visual" key={`v-${activeFeature}`}>
                {activeFeature === 0 && (
                  <div className="hfl-rec-hdr" style={{ borderRadius: 0 }}>
                    <div className="hfl-rec-hdr-top">
                      <span className="hfl-rec-title">HomeGentic Record</span>
                      <span className="hfl-rec-verified">✓ Verified</span>
                    </div>
                    <div className="hfl-rec-addr">327 Keech Street, Daytona Beach FL</div>
                    <div className="hfl-rec-score-row">
                      <div className="hfl-rec-score-num">91</div>
                      <div className="hfl-rec-score-right">
                        <div className="hfl-rec-score-lbl">HomeGentic Score</div>
                        <div className="hfl-rec-bar-wrap"><div className="hfl-rec-bar" /></div>
                      </div>
                    </div>
                  </div>
                )}
                {activeFeature === 0 && (
                  <div className="hfl-rec-body">
                    <div className="hfl-rec-section-lbl">Verified History</div>
                    <div className="hfl-rec-items">
                      {[
                        { icon: "🔨", label: "Roof Replacement", val: "2022 · Signed ✓", cls: "hfl-rec-pass" },
                        { icon: "❄️", label: "HVAC Full Service", val: "Aug 2024 · Verified ✓", cls: "hfl-rec-pass" },
                        { icon: "🔌", label: "Electrical Panel",  val: "Permitted 2021 ✓", cls: "hfl-rec-pass" },
                        { icon: "🚰", label: "Water Heater",      val: "Lifespan: 2 yrs", cls: "hfl-rec-due" },
                      ].map((r) => (
                        <div key={r.label} className="hfl-rec-item">
                          <span className="hfl-rec-item-l"><span>{r.icon}</span>{r.label}</span>
                          <span className={r.cls}>{r.val}</span>
                        </div>
                      ))}
                    </div>
                    <div className="hfl-rec-footer" style={{ margin: "16px -26px -20px", padding: "14px 26px" }}>
                      📋 <span>47 records verified · Link ready</span>
                    </div>
                  </div>
                )}

                {activeFeature === 1 && (<>
                  <div className="hfl-ai-panel-hdr">
                    <div className="hfl-ai-panel-hdr-l">
                      <span style={{ fontSize: 16 }}>🏠</span>
                      <span className="hfl-ai-panel-name">HomeGentic AI</span>
                    </div>
                    <div className="hfl-ai-panel-live"><div className="hfl-ai-panel-dot" />Live</div>
                  </div>
                  <div className="hfl-ai-panel-body">
                    <div className="hfl-ai-notice">
                      <div className="hfl-ai-notice-tag"><span>⚡</span> HomeGentic noticed</div>
                      <p>Your water heater (2013) is past average lifespan. Want a verified quote before winter?</p>
                      <button className="hfl-ai-notice-btn">Yes, get me quotes →</button>
                    </div>
                    <div className="hfl-ai-user-msg">
                      <div className="hfl-ai-user-icon">🎤</div>
                      <p>"What's my biggest maintenance risk this winter?"</p>
                    </div>
                    <div className="hfl-ai-reply">
                      <div className="hfl-ai-reply-tag">HomeGentic AI</div>
                      <p>Your roof was last inspected in 2021 and your furnace filter is 3 months overdue. I'd prioritize both. Want me to schedule?</p>
                    </div>
                  </div>
                  <div className="hfl-ai-panel-footer">
                    <div className="hfl-ai-mic">🎤</div>
                    <span className="hfl-ai-mic-hint">Tap to ask anything…</span>
                  </div>
                </>)}

                {activeFeature === 2 && (<>
                  <div className="hfl-compete-hdr">
                    <div className="hfl-compete-title">Agent Proposals</div>
                    <div className="hfl-compete-sub">327 Keech Street · 5 received</div>
                  </div>
                  <div className="hfl-compete-body">
                    {[
                      { avi: "👩", name: "Lisa Chen · Keller Williams", detail: "2.4% · Est. net $487k · 18 days", comm: "2.4%", best: true },
                      { avi: "👨", name: "Marcus Rivera · RE/MAX",      detail: "2.8% · Est. net $481k · 22 days", comm: "2.8%", best: false },
                      { avi: "👩", name: "Priya Nair · Compass",        detail: "3.0% · Est. net $479k · 25 days", comm: "3.0%", best: false },
                    ].map((a, i) => (
                      <div key={i} className={`hfl-compete-agent${a.best ? " hfl-compete-agent-featured" : ""}`}>
                        <div className="hfl-compete-avi">{a.avi}</div>
                        <div className="hfl-compete-info">
                          <div className="hfl-compete-name">{a.name}</div>
                          <div className="hfl-compete-detail">{a.detail}</div>
                          {a.best && <span className="hfl-compete-best">✦ Best offer</span>}
                        </div>
                        <div className="hfl-compete-comm">{a.comm}</div>
                      </div>
                    ))}
                  </div>
                  <div className="hfl-compete-footer">⚖️ <span>All verified HomeGentic partners</span></div>
                </>)}

                {activeFeature === 3 && (<>
                  <div style={{ background: "var(--plum)", padding: "18px 22px", borderBottom: "1px solid rgba(253,252,250,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: "white" }}>Service Network</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#A8DCA5", background: "rgba(122,175,118,0.25)", border: "1px solid rgba(122,175,118,0.4)", borderRadius: 100, padding: "3px 9px" }}>247 providers nearby</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Daytona Beach, FL · All trades</div>
                  </div>
                  <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
                    {[
                      { emoji: "🔧", name: "Mike's HVAC Pro",      rating: "4.9★", jobs: "32 jobs on HomeGentic", verified: true },
                      { emoji: "🔌", name: "Coastal Electric",      rating: "4.8★", jobs: "18 jobs on HomeGentic", verified: true },
                      { emoji: "🔨", name: "Sunrise Roofing Co.",   rating: "5.0★", jobs: "41 jobs on HomeGentic", verified: true },
                    ].map((c) => (
                      <div key={c.name} style={{ background: "var(--sage-light)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                        <span style={{ fontSize: 20 }}>{c.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: "var(--plum)", marginBottom: 2 }}>{c.name}</div>
                          <div style={{ color: "var(--plum-mid)" }}>{c.jobs}</div>
                        </div>
                        <div style={{ textAlign: "right" as const }}>
                          <div style={{ fontWeight: 700, color: "var(--plum)" }}>{c.rating}</div>
                          {c.verified && <div style={{ fontSize: 10, color: "var(--sage)", fontWeight: 700 }}>✓ Verified</div>}
                        </div>
                      </div>
                    ))}
                    {/* Contractor bid snippet */}
                    <div style={{ background: "var(--butter)", border: "1px solid rgba(46,37,64,0.1)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--plum)", letterSpacing: "1.5px", textTransform: "uppercase" as const, marginBottom: 6 }}>⚡ Open Quote Request</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--plum)", marginBottom: 4 }}>Roof inspection + repair estimate</div>
                      <div style={{ fontSize: 11, color: "var(--plum-mid)", marginBottom: 8 }}>3 contractors have submitted bids · Closes in 48 hrs</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--plum)", background: "rgba(46,37,64,0.08)", borderRadius: 100, padding: "3px 10px" }}>$420</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--plum)", background: "rgba(46,37,64,0.08)", borderRadius: 100, padding: "3px 10px" }}>$395</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--sage)", background: "rgba(122,175,118,0.2)", borderRadius: 100, padding: "3px 10px" }}>$380 ✦ lowest</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--plum-mid)", fontWeight: 600, padding: "4px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                      👷 <span>Work auto-logged to your HomeGentic Record</span>
                    </div>
                  </div>
                </>)}

              </div>
            </div>
          </div>
        </section>

        {/* ── Report CTA ──────────────────────────────────────────────────── */}
        <section id="hfl-report" className="hfl-report">
          <div>
            <div className="hfl-rc-label">The HomeGentic Report</div>
            <h2>Your Home's Verified<br /><em>Biography</em></h2>
            <p>
              When it's time to sell, your HomeGentic Report is a tamper-proof document showing
              every owner, every service, every improvement. Buyers love it. Agents share it.
              Homes with it sell first.
            </p>
            <div className="hfl-rc-actions">
              <button className="hfl-rc-btn" onClick={() => navigate("/login")}>Generate My HomeGentic →</button>
              <button className="hfl-rc-ghost" onClick={() => window.open("/sample-report", "_blank", "noopener,noreferrer")}>View Sample Report</button>
            </div>
          </div>
          <div>
            <div className="hfl-report-mock">
              <div className="hfl-mock-top">
                <span className="hfl-mock-addr">327 Keech Street, Daytona Beach FL</span>
                <span className="hfl-mock-badge">HomeGentic ✓</span>
              </div>
              <div className="hfl-mock-score">
                <div className="hfl-mock-num">91</div>
                <div style={{ flex: 1 }}>
                  <div className="hfl-mock-score-lbl">HomeGentic Property Score</div>
                  <div className="hfl-mock-bar"><div className="hfl-mock-bar-fill" /></div>
                </div>
              </div>
              <div className="hfl-mock-rows">
                {[
                  { label: "📋 Title & Ownership",     val: "Clear ✓",            cls: "hfl-mock-pass" },
                  { label: "🔨 Permits & Renovations", val: "12 Logged ✓",        cls: "hfl-mock-pass" },
                  { label: "🔧 Service History",        val: "47 Records ✓",       cls: "hfl-mock-pass" },
                  { label: "🌿 Recurring Services",     val: "4 Under Contract ✓", cls: "hfl-mock-pass" },
                  { label: "⚖️ Liens & Encumbrances",  val: "None ✓",             cls: "hfl-mock-pass" },
                ].map((r) => (
                  <div key={r.label} className="hfl-mock-row">
                    <span className="hfl-mock-row-lbl">{r.label}</span>
                    <span className={r.cls}>{r.val}</span>
                  </div>
                ))}
              </div>
              <div className="hfl-mock-footer">📋 <span>All records independently verified · Shareable link generated</span></div>
            </div>
          </div>
        </section>

        {/* ── Testimonials ────────────────────────────────────────────────── */}
        <section className="hfl-testimonials">
          <div className="hfl-testimonials-header">
            <div className="hfl-kicker">★ Homeowner Stories</div>
            <h2>Homeowners Love HomeGentic</h2>
            <p>Real results from real people who took control of their home's story.</p>
          </div>

          <div className="hfl-featured-quote">
            <p className="hfl-featured-quote-text">
              "We got <em>$28k over asking</em>. Our buyers said the HomeGentic Report was
              the reason they felt comfortable waiving the inspection contingency. It's a game changer."
            </p>
            <div className="hfl-featured-author">
              <div className="hfl-featured-avi">👩</div>
              <div>
                <div className="hfl-featured-name">Sarah M.</div>
                <div className="hfl-featured-role">Seller · Austin, TX</div>
              </div>
              <div className="hfl-featured-result">
                <div className="hfl-featured-result-num">+$28k</div>
                <div className="hfl-featured-result-lbl">over asking price</div>
              </div>
            </div>
          </div>

          <div className="hfl-test-grid">
            {[
              {
                quote: "I posted my listing intent and got five agent proposals in 48 hours. Ended up saving $11k in commission compared to what I would have paid without negotiating.",
                name: "Marcus T.", role: "Seller · Denver, CO", avi: "hfl-avi-2", emoji: "👨",
              },
              {
                quote: "The AI agent reminded me my HVAC was overdue, booked a verified tech, and logged it to my HomeGentic automatically. When I sold six months later, it was right there in the report.",
                name: "Priya K.", role: "Homeowner · Seattle, WA", avi: "hfl-avi-3", emoji: "👩",
              },
              {
                quote: "Our inspector said our HomeGentic Score was the highest he'd seen. Buyers skipped the inspection entirely. Closed in 11 days.",
                name: "James L.", role: "Seller · Tampa, FL", avi: "hfl-avi-1", emoji: "👨",
              },
            ].map((t) => (
              <div key={t.name} className="hfl-test-card">
                <div className="hfl-stars">★★★★★</div>
                <blockquote>"{t.quote}"</blockquote>
                <div className="hfl-test-author">
                  <div className={`hfl-avi ${t.avi}`}>{t.emoji}</div>
                  <div>
                    <div className="hfl-test-name">{t.name}</div>
                    <div className="hfl-test-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Persona CTA ─────────────────────────────────────────────────── */}
        <section className="hfl-cta">
          <div className="hfl-cta-inner">
            <div className="hfl-cta-blob1" />
            <div className="hfl-cta-blob2" />
            <h2>How do you want to start?</h2>
            <p className="hfl-cta-sub">HomeGentic works for every stage of homeownership. Pick what fits you now.</p>
            <div className="hfl-personas">
              {[
                {
                  icon: "🏠", role: "Homeowner", title: "Build My HomeGentic",
                  desc: "Log services, track maintenance, grow your property score, and be ready to sell on your terms.",
                  cta: "Get started free",
                },
                {
                  icon: "👷", role: "Contractor", title: "Join the Network",
                  desc: "Get verified, receive job requests, and have your work permanently credited on homeowner records.",
                  cta: "Apply to join",
                },
                {
                  icon: "🏡", role: "Real Estate Agent", title: "Win More Listings",
                  desc: "Submit proposals on active listing intents, showcase your track record, and earn verified reviews directly on HomeGentic.",
                  cta: "Join as an agent",
                },
                {
                  icon: "🏆", role: "Ready to Sell", title: "Make Agents Compete for Your Listing",
                  desc: "Post your listing intent, collect competing agent proposals, or go FSBO with our full seller toolkit.",
                  cta: "Start selling smarter",
                },
              ].map((p) => (
                <div key={p.role} className="hfl-persona" onClick={() => navigate("/login")}>
                  <div className="hfl-persona-icon">{p.icon}</div>
                  <div className="hfl-persona-role">{p.role}</div>
                  <div className="hfl-persona-title">{p.title}</div>
                  <div className="hfl-persona-desc">{p.desc}</div>
                  <div className="hfl-persona-cta">
                    {p.cta} <span className="hfl-persona-arrow">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Your Data ───────────────────────────────────────────────────── */}
        <section id="hfl-data" className="hfl-data">
          <div className="hfl-data-inner">
            <div>
              <div className="hfl-data-eyebrow">🔒 Your Data</div>
              <h2>Your records.<br /><em>Forever yours.</em></h2>
              <p className="hfl-data-lead">
                Most apps keep your data on their servers. If they shut down, your records disappear.
                HomeGentic is different — every record you log lives on a public blockchain that no one
                controls, including us. You own it completely.
              </p>
              <p className="hfl-data-note">
                No lock-in. No middleman. No expiry date.
              </p>
            </div>
            <div className="hfl-data-cards">
              {[
                { icon: "🏠", title: "Your home, your history", body: "Every repair, permit, and inspection you log is yours to keep — whether you stay with HomeGentic for one year or ten." },
                { icon: "📥", title: "Download anytime",        body: "Export your full record as a PDF or raw data file whenever you want. No hoops, no waiting, no fees." },
                { icon: "🔗", title: "Survives us",             body: "Even if HomeGentic ever closed tomorrow, your records would still be readable by anyone with the address. That's the promise." },
                { icon: "🔐", title: "Private by default",      body: "Only you decide who sees what. Sharing a HomeGentic Report with a buyer is your choice — nothing is public until you say so." },
              ].map((card) => (
                <div key={card.title} className="hfl-data-card">
                  <div className="hfl-data-card-icon">{card.icon}</div>
                  <div>
                    <div className="hfl-data-card-title">{card.title}</div>
                    <div className="hfl-data-card-body">{card.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Free Tools ──────────────────────────────────────────────────── */}
        <section id="hfl-tools" className="hfl-tools">
          <div className="hfl-tools-inner">
            <div className="hfl-cta-blob1" />
            <div className="hfl-cta-blob2" />
          <div className="hfl-tools-header">
            <div className="hfl-tools-eyebrow">✦ No account needed</div>
            <h2>Free tools for buyers &amp; homeowners</h2>
            <p className="hfl-tools-sub">Try these before you sign up — no login, no credit card.</p>
          </div>
          <div className="hfl-tools-grid">
            {[
              {
                icon: "🔍", label: "Buyer tool", title: "HomeGentic Report Lookup",
                desc: "Enter any address to see if the owner has a verified HomeGentic maintenance report ready to share.",
                cta: "Check an address →", href: "/check",
              },
              {
                icon: "📅", label: "Planning tool", title: "Instant System Forecast",
                desc: "Enter your home's year built and get a 10-year cost forecast for HVAC, roof, plumbing, electrical, and more.",
                cta: "Get my forecast →", href: "/instant-forecast",
              },
              {
                icon: "💰", label: "Pricing tool", title: "Contractor Price Lookup",
                desc: "See what homeowners in your area actually pay for roofing, HVAC, plumbing, flooring, and other common jobs.",
                cta: "Look up prices →", href: "/prices",
              },
              {
                icon: "⚙️", label: "Estimator", title: "Home Systems Estimator",
                desc: "Get lifespan estimates and replacement cost ranges for every major system in your home based on install year.",
                cta: "Estimate my systems →", href: "/home-systems",
              },
            ].map((tool) => (
              <a key={tool.href} href={tool.href} className="hfl-tool-card">
                <div className="hfl-tool-icon">{tool.icon}</div>
                <div>
                  <div className="hfl-tool-label">{tool.label}</div>
                  <div className="hfl-tool-title">{tool.title}</div>
                </div>
                <p className="hfl-tool-desc">{tool.desc}</p>
                <span className="hfl-tool-cta">{tool.cta}</span>
              </a>
            ))}
          </div>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <section data-faq style={{ background: "var(--white)", padding: "80px 56px", maxWidth: "860px", margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "2rem", color: "var(--plum)", marginBottom: "2.5rem", textAlign: "center" }}>
            Frequently Asked Questions
          </h2>
          {[
            { q: "How do I prove my home maintenance history to buyers?",       a: "HomeGentic creates a blockchain-backed record of every repair, inspection, and upgrade you complete. Share a verified report link with any buyer — no login required on their end." },
            { q: "What are home maintenance records and why do they matter for sale?", a: "Home maintenance records are documented proof of repairs and system upkeep. Homes with verified maintenance history sell faster and command higher prices because buyers can confirm the property's condition." },
            { q: "How does verified contractor work history work?",             a: "When a contractor completes a job on HomeGentic, both the homeowner and contractor digitally sign the record. This dual-signature makes the entry tamper-proof and verifiable by third parties." },
            { q: "Can I use HomeGentic to track DIY home repairs?",             a: "Yes. Homeowners can log DIY jobs themselves. These are marked as self-verified and still appear in your maintenance timeline — giving you a complete picture of your home's history." },
            { q: "How does HomeGentic help with home insurance claims?",        a: "An up-to-date maintenance record demonstrates due diligence. HomeGentic's Insurance Defense report compiles your verified job history into a shareable document insurers can reference during claims." },
            { q: "Is my maintenance data private?",                             a: "Your data lives on the Internet Computer blockchain under your control. You choose what to share and with whom. Reports are only accessible to people you give the link to." },
          ].map(({ q, a }, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--sage-light)", padding: "1.25rem 0" }}>
              <p data-faq-question style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--plum)", margin: "0 0 0.5rem" }}>{q}</p>
              <p data-faq-answer style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: "0.9rem", color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>{a}</p>
            </div>
          ))}
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="hfl-footer">
          <div className="hfl-footer-top">
            <div>
              <span className="hfl-footer-logo">Home<span>Gentic</span></span>
              <p className="hfl-footer-tagline">
                The verified maintenance record that makes your home worth more and easier to sell.
              </p>
              <div className="hfl-footer-social">
                <a href="#" aria-label="HomeGentic on X" rel="noopener noreferrer">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <div className="hfl-footer-col-title">Product</div>
              <ul className="hfl-footer-col-links">
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>For Homeowners</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>Service Network</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-report"); }}>HomeGentic Report</a></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-sell"); }}>Sell Smarter</a></li>
                <li><a onClick={() => navigate("/pricing")}>Pricing</a></li>
              </ul>
            </div>
            <div>
              <div className="hfl-footer-col-title">Free Tools</div>
              <ul className="hfl-footer-col-links">
                <li><a href="/check">Report Lookup</a></li>
                <li><a href="/instant-forecast">System Forecast</a></li>
                <li><a href="/prices">Price Lookup</a></li>
                <li><a href="/home-systems">Systems Estimator</a></li>
                <li><a href="/neighborhood/00000">Neighborhood Report</a></li>
              </ul>
            </div>
            <div>
              <div className="hfl-footer-col-title">Company</div>
              <ul className="hfl-footer-col-links">
                <li><Link to="/privacy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/support">Support</Link></li>
                <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-data"); }}>Your Data</a></li>
              </ul>
            </div>
          </div>
          <div className="hfl-footer-bottom">
            <span>© 2026 HomeGentic Inc. — Built on the Internet Computer</span>
            <div className="hfl-footer-bottom-links">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/support">Support</Link>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
