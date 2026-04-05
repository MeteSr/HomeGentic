import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const CSS = `
  .hfl * { margin: 0; padding: 0; box-sizing: border-box; }
  .hfl {
    --sage: #7AAF76; --sage-light: #E5F0E4; --sage-mid: #C4DCC2;
    --blush: #F0CDBA; --sky: #BAD5E8; --butter: #F5E9BB;
    --plum: #2E2540; --plum-mid: #6B5B7B;
    --white: #FDFCFA; --charcoal: #1E1928;
    background: var(--white); color: var(--charcoal);
    font-family: 'Plus Jakarta Sans', sans-serif; overflow-x: hidden;
  }

  /* NAV */
  .hfl-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 56px;
    background: rgba(253,252,250,0.92); backdrop-filter: blur(14px);
    border-bottom: 1px solid rgba(122,175,118,0.2);
  }
  .hfl-logo {
    font-family: 'Fraunces', serif; font-size: 24px; font-weight: 900;
    color: var(--plum); text-decoration: none; letter-spacing: -0.5px;
  }
  .hfl-logo span { color: var(--sage); }
  .hfl-nav ul { display: flex; gap: 32px; list-style: none; }
  .hfl-nav ul a {
    font-size: 14px; color: var(--plum-mid); text-decoration: none;
    font-weight: 500; transition: color .2s; cursor: pointer;
  }
  .hfl-nav ul a:hover { color: var(--plum); }
  .hfl-nav-pill {
    display: flex; align-items: center; gap: 6px;
    background: var(--plum); color: white; padding: 10px 22px;
    border-radius: 100px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: transform .2s, box-shadow .2s;
  }
  .hfl-nav-pill:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(46,37,64,0.3); }
  .hfl-hamburger {
    display: none; background: none; border: none; cursor: pointer; padding: 4px;
  }
  .hfl-hamburger span {
    display: block; width: 22px; height: 2px; background: var(--plum);
    margin: 5px 0; border-radius: 2px;
  }

  /* HERO */
  .hfl-hero {
    padding: 120px 56px 80px;
    display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 64px; align-items: center;
  }
  .hfl-eyebrow {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--butter); color: var(--plum); padding: 7px 18px;
    border-radius: 100px; font-size: 13px; font-weight: 600; margin-bottom: 28px;
    border: 1px solid rgba(46,37,64,0.1);
  }
  .hfl-dot {
    width: 8px; height: 8px; background: var(--sage); border-radius: 50%;
    animation: hfl-pulse 2s infinite;
  }
  @keyframes hfl-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.7} }

  .hfl h1 {
    font-family: 'Fraunces', serif; font-size: clamp(46px, 5vw, 70px);
    font-weight: 900; line-height: 1.04; letter-spacing: -1.5px; margin-bottom: 22px;
  }
  .hfl h1 em { font-style: italic; color: var(--sage); font-weight: 300; }
  .hfl-sub {
    font-size: 17px; line-height: 1.75; color: var(--plum-mid);
    max-width: 460px; margin-bottom: 36px;
  }
  .hfl-pills { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 40px; }
  .hfl-pill {
    background: var(--sage-light); color: var(--plum); padding: 8px 18px;
    border-radius: 100px; font-size: 13px; font-weight: 600;
    border: 1.5px solid var(--sage-mid); display: flex; align-items: center; gap: 6px;
  }
  .hfl-actions { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
  .hfl-btn-main {
    background: var(--plum); color: white; padding: 16px 36px; border-radius: 100px;
    font-size: 16px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    transition: transform .2s, box-shadow .2s;
  }
  .hfl-btn-main:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(46,37,64,0.3); }
  .hfl-btn-soft {
    background: white; color: var(--plum); padding: 16px 28px; border-radius: 100px;
    font-size: 16px; font-weight: 600; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    border: 2px solid var(--sage-mid); transition: border-color .2s, background .2s;
  }
  .hfl-btn-soft:hover { border-color: var(--sage); background: var(--sage-light); }

  /* HERO VISUAL */
  .hfl-hero-right { position: relative; display: flex; align-items: center; justify-content: center; }
  .hfl-blob-wrap {
    position: relative; width: 420px; height: 460px;
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
    position: relative; z-index: 2; background: white; border-radius: 22px; width: 320px;
    box-shadow: 0 24px 72px rgba(46,37,64,0.18); overflow: hidden;
    animation: hfl-float 5s ease-in-out infinite;
  }
  @keyframes hfl-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  .hfl-dc-header { background: var(--plum); padding: 18px 22px; }
  .hfl-dc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .hfl-dc-title { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 700; color: white; }
  .hfl-dc-ver {
    display: flex; align-items: center; gap: 5px;
    background: rgba(122,175,118,0.3); border: 1px solid rgba(122,175,118,0.5);
    border-radius: 100px; padding: 4px 10px; font-size: 10px; color: #A8DCA5; font-weight: 600; letter-spacing: 0.5px;
  }
  .hfl-dc-addr { font-size: 12px; color: rgba(255,255,255,0.6); }
  .hfl-dc-score-row { display: flex; align-items: center; gap: 14px; margin-top: 12px; }
  .hfl-dc-num { font-family: 'Fraunces', serif; font-size: 42px; font-weight: 900; color: var(--sage); line-height: 1; }
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
    border-radius: 10px; padding: 10px 12px;
    display: flex; align-items: center; gap: 10px;
  }
  .hfl-dc-ver-text { font-size: 11px; line-height: 1.4; color: var(--plum-mid); }
  .hfl-dc-ver-text strong { color: var(--plum); }

  .hfl-badge {
    position: absolute; z-index: 3; background: white; border-radius: 14px;
    box-shadow: 0 8px 28px rgba(46,37,64,0.14); padding: 10px 16px;
    display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--plum);
    white-space: nowrap;
  }
  .hfl-badge-1 { top: 6%; right: -16px; animation: hfl-float 4s ease-in-out infinite; }
  .hfl-badge-2 { bottom: 14%; left: -20px; animation: hfl-float 4s 1.5s ease-in-out infinite; }
  .hfl-badge-icon { font-size: 18px; }

  /* NUMBERS BAR */
  .hfl-numbers {
    background: var(--plum); display: grid; grid-template-columns: repeat(4, 1fr);
    padding: 40px 56px; gap: 20px;
  }
  .hfl-nbar { text-align: center; }
  .hfl-nbar-num { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 900; color: var(--sage); line-height: 1; }
  .hfl-nbar-lbl { font-size: 13px; color: rgba(253,252,250,0.6); margin-top: 6px; }

  /* LIFECYCLE */
  .hfl-lifecycle { padding: 100px 56px; }
  .hfl-kicker { font-size: 12px; font-weight: 700; color: var(--sage); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px; }
  .hfl h2 { font-family: 'Fraunces', serif; font-size: 50px; font-weight: 900; letter-spacing: -1px; line-height: 1.05; margin-bottom: 20px; }
  .hfl-sec-sub { font-size: 17px; color: var(--plum-mid); line-height: 1.7; max-width: 520px; margin-bottom: 60px; }
  .hfl-flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; position: relative; }
  .hfl-flow::before {
    content: ''; position: absolute; top: 52px; left: 10%; right: 10%; height: 2px;
    background: linear-gradient(90deg, var(--sage-mid), var(--sage)); z-index: 0;
  }
  .hfl-step { text-align: center; position: relative; z-index: 1; padding: 0 16px; }
  .hfl-step-icon {
    width: 104px; height: 104px; border-radius: 50%; margin: 0 auto 22px;
    display: flex; align-items: center; justify-content: center; font-size: 36px;
    border: 3px solid white; box-shadow: 0 8px 28px rgba(46,37,64,0.15); position: relative; z-index: 1;
  }
  .hfl-step:nth-child(1) .hfl-step-icon { background: var(--butter); }
  .hfl-step:nth-child(2) .hfl-step-icon { background: var(--blush); }
  .hfl-step:nth-child(3) .hfl-step-icon { background: var(--sky); }
  .hfl-step:nth-child(4) .hfl-step-icon { background: var(--sage-light); }
  .hfl-step h3 { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; margin-bottom: 10px; }
  .hfl-step p { font-size: 14px; color: var(--plum-mid); line-height: 1.65; }

  /* BENTO */
  .hfl-features { padding: 0 56px 100px; }
  .hfl-bento { display: grid; grid-template-columns: 1.5fr 1fr 1fr; grid-template-rows: auto auto; gap: 16px; }
  .hfl-bc { border-radius: 24px; padding: 40px; }
  .hfl-bc-hero { grid-row: span 2; background: var(--plum); color: white; display: flex; flex-direction: column; justify-content: space-between; }
  .hfl-bc-sage   { background: var(--sage-light); }
  .hfl-bc-blush  { background: var(--blush); }
  .hfl-bc-sky    { background: var(--sky); }
  .hfl-bc-butter { background: var(--butter); }
  .hfl-bc-icon { font-size: 40px; margin-bottom: 18px; }
  .hfl-bc h3 { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin-bottom: 10px; color: var(--plum); }
  .hfl-bc-hero h3 { font-size: 34px; color: white; }
  .hfl-bc p { font-size: 14px; line-height: 1.7; color: var(--plum-mid); }
  .hfl-bc-hero p { color: rgba(253,252,250,0.7); font-size: 16px; }
  .hfl-bc-list { list-style: none; margin-top: 28px; display: flex; flex-direction: column; gap: 11px; }
  .hfl-bc-list li { font-size: 14px; color: rgba(253,252,250,0.85); display: flex; align-items: center; gap: 10px; }
  .hfl-bc-list li::before { content: '✦'; color: var(--sage); font-size: 10px; flex-shrink: 0; }
  .hfl-bc-tag {
    margin-top: 32px; display: inline-flex; align-items: center; gap: 8px;
    background: rgba(122,175,118,0.2); border: 1px solid rgba(122,175,118,0.3);
    border-radius: 12px; padding: 10px 14px; font-size: 12px; color: rgba(253,252,250,0.8);
  }

  /* REPORT CTA */
  .hfl-report {
    margin: 0 56px 100px;
    background: linear-gradient(135deg, var(--plum), #4A3870);
    border-radius: 28px; padding: 72px 80px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center;
  }
  .hfl-rc-label { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--sage); margin-bottom: 18px; }
  .hfl-report h2 { font-size: 46px; color: white; margin-bottom: 18px; }
  .hfl-report h2 em { color: var(--sage); font-style: italic; font-weight: 300; }
  .hfl-report p { font-size: 16px; color: rgba(253,252,250,0.72); line-height: 1.7; margin-bottom: 36px; }
  .hfl-rc-actions { display: flex; gap: 14px; flex-wrap: wrap; }
  .hfl-rc-btn {
    background: var(--sage); color: var(--plum); padding: 16px 32px; border-radius: 100px;
    font-weight: 700; font-size: 15px; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: transform .2s, box-shadow .2s;
  }
  .hfl-rc-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0,0,0,0.3); }
  .hfl-rc-ghost {
    background: rgba(255,255,255,0.1); color: white; padding: 16px 24px; border-radius: 100px;
    font-weight: 600; font-size: 15px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: background .2s;
  }
  .hfl-rc-ghost:hover { background: rgba(255,255,255,0.18); }
  .hfl-report-mock { background: white; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
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

  /* TESTIMONIALS */
  .hfl-testimonials { padding: 0 56px 100px; }
  .hfl-testimonials h2 { text-align: center; margin-bottom: 48px; letter-spacing: -0.5px; }
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

  /* PERSONA CTA */
  .hfl-cta { padding: 0 56px 100px; }
  .hfl-cta-inner {
    background: var(--sage-light); border-radius: 28px; padding: 80px;
    text-align: center; border: 2px solid var(--sage-mid); position: relative; overflow: hidden;
  }
  .hfl-cta-blob1 { position: absolute; top: -60px; right: -60px; width: 300px; height: 300px; background: radial-gradient(circle, var(--blush), transparent 70%); pointer-events: none; }
  .hfl-cta-blob2 { position: absolute; bottom: -80px; left: -40px; width: 280px; height: 280px; background: radial-gradient(circle, var(--sky), transparent 70%); pointer-events: none; }
  .hfl-cta h2 { font-size: 52px; letter-spacing: -2px; margin-bottom: 14px; position: relative; }
  .hfl-cta-sub { font-size: 18px; color: var(--plum-mid); margin-bottom: 52px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.65; position: relative; }
  .hfl-personas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 760px; margin: 0 auto; position: relative; }
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

  /* YOUR DATA — 3.3.4 */
  .hfl-data {
    padding: 96px 56px; background: var(--plum);
    display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center;
  }
  .hfl-data-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(122,175,118,0.18); color: var(--sage);
    padding: 6px 16px; border-radius: 100px;
    font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    margin-bottom: 24px;
  }
  .hfl-data h2 {
    font-family: 'Fraunces', serif; font-size: 44px; font-weight: 900;
    color: white; line-height: 1.15; letter-spacing: -1px; margin-bottom: 20px;
  }
  .hfl-data h2 em { color: var(--sage); font-style: normal; }
  .hfl-data-lead {
    font-size: 17px; color: rgba(253,252,250,0.7); line-height: 1.7; margin-bottom: 36px;
  }
  .hfl-data-cards { display: flex; flex-direction: column; gap: 14px; }
  .hfl-data-card {
    background: rgba(253,252,250,0.06); border: 1px solid rgba(253,252,250,0.1);
    border-radius: 16px; padding: 22px 24px; display: flex; gap: 18px; align-items: flex-start;
    transition: background .2s, border-color .2s;
  }
  .hfl-data-card:hover { background: rgba(253,252,250,0.1); border-color: rgba(122,175,118,0.4); }
  .hfl-data-card-icon {
    font-size: 26px; flex-shrink: 0; margin-top: 2px;
  }
  .hfl-data-card-title {
    font-weight: 700; color: white; font-size: 15px; margin-bottom: 4px;
  }
  .hfl-data-card-body {
    font-size: 13px; color: rgba(253,252,250,0.6); line-height: 1.6;
  }
  .hfl-data-note {
    margin-top: 28px; font-size: 12px; color: rgba(253,252,250,0.35);
    display: flex; align-items: center; gap: 8px;
  }
  .hfl-data-note::before { content: ""; display: block; width: 20px; height: 1px; background: rgba(253,252,250,0.2); }
  @media (max-width: 860px) {
    .hfl-data { grid-template-columns: 1fr; padding: 64px 24px; gap: 48px; }
    .hfl-data h2 { font-size: 34px; }
  }

  /* FOOTER */
  .hfl-footer {
    background: var(--plum); color: rgba(253,252,250,0.65); padding: 36px 56px;
    display: flex; align-items: center; justify-content: space-between; font-size: 13px;
  }
  .hfl-footer-logo { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900; color: white; }
  .hfl-footer-logo span { color: var(--sage); }
  .hfl-footer-links { display: flex; gap: 24px; }
  .hfl-footer-links a { color: rgba(253,252,250,0.5); text-decoration: none; font-size: 13px; transition: color .2s; cursor: pointer; }
  .hfl-footer-links a:hover { color: rgba(253,252,250,0.85); }

  /* ENTRANCE ANIMATIONS */
  @keyframes hfl-fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  .hfl-eyebrow  { animation: hfl-fadeUp .5s ease both; }
  .hfl h1       { animation: hfl-fadeUp .5s .1s ease both; }
  .hfl-sub      { animation: hfl-fadeUp .5s .2s ease both; }
  .hfl-pills    { animation: hfl-fadeUp .5s .25s ease both; }
  .hfl-actions  { animation: hfl-fadeUp .5s .3s ease both; }

  /* ── MOBILE ────────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .hfl-nav { padding: 16px 24px; }
    .hfl-nav ul { display: none; }
    .hfl-hamburger { display: block; }

    .hfl-hero { grid-template-columns: 1fr; padding: 96px 24px 48px; gap: 0; }
    .hfl-hero-right { display: none; }
    .hfl h1 { font-size: clamp(36px, 9vw, 52px); }
    .hfl-sub { font-size: 15px; max-width: 100%; }

    .hfl-numbers { grid-template-columns: 1fr 1fr; padding: 28px 24px; }
    .hfl-nbar-num { font-size: 30px; }

    .hfl-lifecycle { padding: 64px 24px; }
    .hfl h2 { font-size: 34px; }
    .hfl-sec-sub { font-size: 15px; max-width: 100%; margin-bottom: 40px; }
    .hfl-flow { grid-template-columns: 1fr 1fr; gap: 36px; }
    .hfl-flow::before { display: none; }
    .hfl-step-icon { width: 80px; height: 80px; font-size: 28px; }

    .hfl-features { padding: 0 24px 64px; }
    .hfl-bento { grid-template-columns: 1fr; }
    .hfl-bc-hero { grid-row: span 1; }
    .hfl-bc { padding: 28px; }
    .hfl-bc-hero h3 { font-size: 26px; }

    .hfl-report { margin: 0 24px 64px; padding: 40px 28px; grid-template-columns: 1fr; gap: 36px; }
    .hfl-report h2 { font-size: 32px; }
    .hfl-report > div:last-child { display: none; }

    .hfl-testimonials { padding: 0 24px 64px; }
    .hfl-testimonials h2 { font-size: 32px; }
    .hfl-test-grid { grid-template-columns: 1fr; }

    .hfl-cta { padding: 0 24px 64px; }
    .hfl-cta-inner { padding: 48px 24px; }
    .hfl-cta h2 { font-size: 34px; letter-spacing: -1px; }
    .hfl-cta-sub { font-size: 15px; }
    .hfl-personas { grid-template-columns: 1fr; max-width: 100%; }

    .hfl-footer { flex-direction: column; gap: 20px; text-align: center; padding: 28px 24px; }
    .hfl-footer-links { flex-wrap: wrap; justify-content: center; }
  }

  /* ── NARROW PHONE (≤480px) ───────────────────────────────────────────── */
  @media (max-width: 480px) {
    .hfl h1 { font-size: clamp(32px, 10vw, 42px); letter-spacing: -1px; }
    .hfl-eyebrow { font-size: 11px; padding: 6px 14px; }

    /* Stack CTA buttons full-width */
    .hfl-actions { flex-direction: column; align-items: stretch; }
    .hfl-btn-main, .hfl-btn-soft { width: 100%; text-align: center; padding: 15px 20px; }

    /* Single-column lifecycle steps */
    .hfl-flow { grid-template-columns: 1fr; gap: 28px; }
    .hfl-step { display: flex; align-items: flex-start; gap: 20px; text-align: left; }
    .hfl-step-icon { width: 60px; height: 60px; font-size: 24px; flex-shrink: 0; margin: 0; }

    /* Numbers bar: 2×2 → tighter */
    .hfl-numbers { padding: 24px 16px; gap: 12px; }
    .hfl-nbar-num { font-size: 26px; }
    .hfl-nbar-lbl { font-size: 11px; }

    /* Reduce section padding */
    .hfl-lifecycle { padding: 48px 16px; }
    .hfl-features  { padding: 0 16px 48px; }
    .hfl-testimonials { padding: 0 16px 48px; }
    .hfl-cta { padding: 0 16px 48px; }
    .hfl-cta-inner { padding: 36px 16px; }
    .hfl-cta h2 { font-size: 28px; }
    .hfl-report { margin: 0 16px 48px; padding: 32px 20px; }
    .hfl h2 { font-size: 28px; }
  }

  @media (min-width: 901px) and (max-width: 1100px) {
    .hfl-nav { padding: 16px 32px; }
    .hfl-hero { padding: 120px 32px 64px; gap: 40px; }
    .hfl-blob-wrap { width: 340px; height: 380px; }
    .hfl-dash-card { width: 280px; }
    .hfl-lifecycle, .hfl-testimonials { padding-left: 32px; padding-right: 32px; }
    .hfl-features { padding-left: 32px; padding-right: 32px; }
    .hfl-report { margin-left: 32px; margin-right: 32px; padding: 56px 48px; }
    .hfl-cta { padding-left: 32px; padding-right: 32px; }
    .hfl-numbers { padding: 32px; }
    .hfl-footer { padding: 28px 32px; }
  }
`;

export default function LandingPage() {
  const navigate = useNavigate();

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
          <a href="/" className="hfl-logo">HomeGen<span>tic</span></a>
          <ul>
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>For Homeowners</a></li>
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>Service Network</a></li>
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-report"); }}>HomeGentic Report</a></li>
            <li><a onClick={(e) => { e.preventDefault(); scrollTo("hfl-sell"); }}>Sell Smarter</a></li>
            <li><a onClick={(e) => { e.preventDefault(); navigate("/pricing"); }}>Buy</a></li>
          </ul>
          <button className="hfl-nav-pill" onClick={() => navigate("/login")}>🏡 Start Free</button>
          <button className="hfl-hamburger" aria-label="Menu">
            <span /><span /><span />
          </button>
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="hfl-hero">
          <div>
            <div className="hfl-eyebrow">
              <span className="hfl-dot" />
              Verified Records · AI-Powered · Built on ICP
            </div>
            <h1>Own It.<br /><em>Prove It.</em><br />Sell It.</h1>
            <p className="hfl-sub">
              HomeGentic tracks every repair, reminds you before things break, and builds
              the complete maintenance record your home deserves — so when it's time to sell,
              you're ready to command a premium or make agents compete for your listing.
            </p>
            <div className="hfl-pills">
              <div className="hfl-pill">🔧 Property Management</div>
              <div className="hfl-pill">👷 Verified Contractors</div>
              <div className="hfl-pill">📋 Verified Home Report</div>
              <div className="hfl-pill">🏆 Agent Marketplace</div>
            </div>
            <div className="hfl-actions">
              <button className="hfl-btn-main" onClick={() => navigate("/login")}>Get Started Free →</button>
              <button className="hfl-btn-soft" onClick={() => navigate("/login")}>See a HomeGentic Report</button>
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

        {/* ── Numbers bar ─────────────────────────────────────────────────── */}
        <div className="hfl-numbers">
          {[
            { num: "40+",    label: "Data points in your score" },
            { num: "Avg 47", label: "Records per HomeGentic Report" },
            { num: "3×",     label: "More offers when score is shared" },
            { num: "Free",   label: "To start — no credit card needed" },
          ].map((n) => (
            <div key={n.label} className="hfl-nbar">
              <div className="hfl-nbar-num">{n.num}</div>
              <div className="hfl-nbar-lbl">{n.label}</div>
            </div>
          ))}
        </div>

        {/* ── Lifecycle ───────────────────────────────────────────────────── */}
        <section id="hfl-features" className="hfl-lifecycle">
          <div className="hfl-kicker">How It Works</div>
          <h2>Own It. Manage It.<br />Prove It. Sell It.</h2>
          <p className="hfl-sec-sub">HomeGentic works across the entire homeownership lifecycle — from move-in to sale day.</p>
          <div className="hfl-flow">
            {[
              { icon: "🏠", title: "Set Up Your Home", desc: "Add your property and import existing records. AI agents begin organizing your home's history automatically." },
              { icon: "🔧", title: "Manage & Maintain", desc: "Schedule services with verified providers. Every job is logged, receipted, and stored on your permanent record." },
              { icon: "📋", title: "Generate Your Report", desc: "Your HomeGentic Report is a tamper-proof property biography. Share it with buyers or attach it to any listing." },
              { icon: "🏆", title: "Sell With Confidence", desc: "List with the agent who wins your bid — or go FSBO with our full suite of seller tools. Your home, your terms." },
            ].map((s) => (
              <div key={s.title} className="hfl-step">
                <div className="hfl-step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features bento ──────────────────────────────────────────────── */}
        <section className="hfl-features">
          <div className="hfl-bento">
            <div className="hfl-bc hfl-bc-hero">
              <div>
                <div className="hfl-bc-icon">📋</div>
                <h3>The Verified Home Record</h3>
                <p>Every service, every repair, every renovation — documented, signed, and stored permanently. Your HomeGentic is the Carfax your home deserves.</p>
                <ul className="hfl-bc-list">
                  <li>Full ownership &amp; transaction history</li>
                  <li>Verified contractor records &amp; warranties</li>
                  <li>Permitted renovations on file</li>
                  <li>Recurring services under contract</li>
                  <li>AI agents continuously update your score</li>
                  <li>Share with buyers instantly, no middlemen</li>
                </ul>
              </div>
              <div className="hfl-bc-tag">
                <span>⬡</span>
                <span>Records stored on ICP — tamper-proof, always available</span>
              </div>
            </div>
            <div className="hfl-bc hfl-bc-sage">
              <div className="hfl-bc-icon">🤖</div>
              <h3>AI Property Agents</h3>
              <p>Autonomous AI agents monitor your home, flag upcoming maintenance, find verified service providers, and keep your HomeGentic score climbing.</p>
            </div>
            <div className="hfl-bc hfl-bc-blush">
              <div className="hfl-bc-icon">👷</div>
              <h3>Verified Service Network</h3>
              <p>Every contractor in our network is credentialed, reviewed, and bonded. Their work is automatically logged to your home's record.</p>
            </div>
            <div id="hfl-sell" className="hfl-bc hfl-bc-sky">
              <div className="hfl-bc-icon">⚖️</div>
              <h3>Make Agents Compete</h3>
              <p>Post your listing intent and let real estate agents submit competing proposals. See commissions, marketing plans, and estimated net proceeds — side by side.</p>
            </div>
            <div className="hfl-bc hfl-bc-butter">
              <div className="hfl-bc-icon">🏡</div>
              <h3>Sell It Yourself</h3>
              <p>Not ready for an agent? Our FSBO mode gives you pricing intelligence, a public listing page, showing management, and an offer inbox — everything you need to close on your own terms.</p>
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
          <h2>Homeowners Love HomeGentic</h2>
          <div className="hfl-test-grid">
            {[
              {
                quote: "We got $28k over asking. Our buyers said the HomeGentic Report was the reason they felt comfortable waiving the inspection contingency. It's a game changer.",
                name: "Sarah M.", role: "Seller · Austin, TX", avi: "hfl-avi-1", emoji: "👩",
              },
              {
                quote: "I posted my listing intent and got five agent proposals in 48 hours. Ended up saving $11k in commission compared to what I would have paid without negotiating.",
                name: "Marcus T.", role: "Seller · Denver, CO", avi: "hfl-avi-2", emoji: "👨",
              },
              {
                quote: "The AI agent reminded me my HVAC was overdue, booked a verified tech, and logged it to my HomeGentic automatically. When I sold six months later, it was right there in the report.",
                name: "Priya K.", role: "Homeowner · Seattle, WA", avi: "hfl-avi-3", emoji: "👩",
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
                  icon: "🏆", role: "Ready to Sell", title: "Make Agents Compete",
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

        {/* ── Your Data — 3.3.4 ──────────────────────────────────────────── */}
        <section id="hfl-data" className="hfl-data">
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
              {
                icon: "🏠",
                title: "Your home, your history",
                body: "Every repair, permit, and inspection you log is yours to keep — whether you stay with HomeGentic for one year or ten.",
              },
              {
                icon: "📥",
                title: "Download anytime",
                body: "Export your full record as a PDF or raw data file whenever you want. No hoops, no waiting, no fees.",
              },
              {
                icon: "🔗",
                title: "Survives us",
                body: "Even if HomeGentic ever closed tomorrow, your records would still be readable by anyone with the address. That's the promise.",
              },
              {
                icon: "🔐",
                title: "Private by default",
                body: "Only you decide who sees what. Sharing a HomeGentic Report with a buyer is your choice — nothing is public until you say so.",
              },
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
        </section>

        {/* ── FAQ (SEO.7 — static, crawlable) ─────────────────────────────── */}
        <section data-faq style={{ background: "var(--white)", padding: "80px 56px", maxWidth: "860px", margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "2rem", color: "var(--plum)", marginBottom: "2.5rem", textAlign: "center" }}>
            Frequently Asked Questions
          </h2>
          {[
            {
              q: "How do I prove my home maintenance history to buyers?",
              a: "HomeGentic creates a blockchain-backed record of every repair, inspection, and upgrade you complete. Share a verified report link with any buyer — no login required on their end.",
            },
            {
              q: "What are home maintenance records and why do they matter for sale?",
              a: "Home maintenance records are documented proof of repairs and system upkeep. Homes with verified maintenance history sell faster and command higher prices because buyers can confirm the property's condition.",
            },
            {
              q: "How does verified contractor work history work?",
              a: "When a contractor completes a job on HomeGentic, both the homeowner and contractor digitally sign the record. This dual-signature makes the entry tamper-proof and verifiable by third parties.",
            },
            {
              q: "Can I use HomeGentic to track DIY home repairs?",
              a: "Yes. Homeowners can log DIY jobs themselves. These are marked as self-verified and still appear in your maintenance timeline — giving you a complete picture of your home's history.",
            },
            {
              q: "How does HomeGentic help with home insurance claims?",
              a: "An up-to-date maintenance record demonstrates due diligence. HomeGentic's Insurance Defense report compiles your verified job history into a shareable document insurers can reference during claims.",
            },
            {
              q: "Is my maintenance data private?",
              a: "Your data lives on the Internet Computer blockchain under your control. You choose what to share and with whom. Reports are only accessible to people you give the link to.",
            },
          ].map(({ q, a }, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--sage-light)", padding: "1.25rem 0" }}>
              <p data-faq-question style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--plum)", margin: "0 0 0.5rem" }}>{q}</p>
              <p data-faq-answer style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: "0.9rem", color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>{a}</p>
            </div>
          ))}
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="hfl-footer">
          <div className="hfl-footer-logo">Home<span>Fax</span></div>
          <div className="hfl-footer-links">
            <a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>For Homeowners</a>
            <a onClick={(e) => { e.preventDefault(); scrollTo("hfl-features"); }}>Service Network</a>
            <a onClick={(e) => { e.preventDefault(); scrollTo("hfl-sell"); }}>Sell Smarter</a>
            <a onClick={(e) => { e.preventDefault(); scrollTo("hfl-data"); }}>Your Data</a>
            <a onClick={() => navigate("/pricing")}>Pricing</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <p>© 2026 HomeGentic Inc.</p>
        </footer>

      </div>
    </>
  );
}
