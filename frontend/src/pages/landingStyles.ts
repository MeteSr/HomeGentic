export const CSS = `
  .hfl * { margin: 0; padding: 0; box-sizing: border-box; }
  .hfl {
    --sage: #7AAF76; --sage-light: #E5F0E4; --sage-mid: #C4DCC2; --sage-dark: #4F8A4B;
    --blush: #F0CDBA; --sky: #BAD5E8; --butter: #F5E9BB;
    --plum: #2E2540; --plum-mid: #6B5B7B; --plum-light: #3D3254;
    --white: #FFFFFF; --off-white: #F9F8F6; --charcoal: #1A1426;
    --rule: rgba(46,37,64,0.09);
    background: var(--white); color: var(--plum);
    font-family: 'Plus Jakarta Sans', sans-serif; overflow-x: hidden;
  }

  /* ── NAV ──────────────────────────────────────────────────────────────── */
  .hfl-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 56px; height: 64px;
    background: rgba(255,255,255,0.95); backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--rule);
  }
  .hfl-logo {
    font-family: 'Fraunces', serif; font-size: 21px; font-weight: 900;
    color: var(--plum); text-decoration: none; letter-spacing: -0.3px; flex-shrink: 0;
  }
  .hfl-logo span { color: var(--sage); font-style: italic; font-weight: 300; }
  .hfl-nav-links {
    display: flex; gap: 32px; list-style: none;
    position: absolute; left: 50%; transform: translateX(-50%);
  }
  .hfl-nav-links a {
    font-size: 14px; color: var(--plum-mid); text-decoration: none;
    font-weight: 500; cursor: pointer; transition: color .15s;
  }
  .hfl-nav-links a:hover { color: var(--plum); }
  .hfl-nav-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .hfl-nav-signin {
    font-size: 14px; font-weight: 600; color: var(--plum-mid);
    background: none; border: none; cursor: pointer; padding: 8px 16px;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: color .15s;
  }
  .hfl-nav-signin:hover { color: var(--plum); }
  .hfl-nav-pill {
    background: var(--plum); color: white; padding: 9px 22px;
    border-radius: 100px; font-size: 14px; font-weight: 700;
    border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: background .2s, transform .15s;
  }
  .hfl-nav-pill:hover { background: var(--charcoal); transform: translateY(-1px); }
  .hfl-hamburger {
    display: none; background: none; border: none; cursor: pointer; padding: 4px;
  }
  .hfl-hamburger span {
    display: block; width: 22px; height: 2px; background: var(--plum);
    margin: 5px 0; border-radius: 2px; transition: transform .2s, opacity .2s;
  }

  /* ── HERO ─────────────────────────────────────────────────────────────── */
  .hfl-hero {
    min-height: 100vh; padding: 64px 56px 0;
    display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
    align-items: center; background: var(--white); position: relative; overflow: hidden;
  }
  .hfl-hero::before {
    content: ''; position: absolute; top: 0; right: 0; width: 55%; height: 100%;
    background: radial-gradient(ellipse at 70% 30%, #f5ede6 0%, #eef4e8 40%, transparent 70%);
    opacity: 0.6; pointer-events: none;
  }
  .hfl-hero-left { position: relative; z-index: 1; padding-bottom: 80px; }
  .hfl-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    color: var(--sage-dark); margin-bottom: 28px;
    animation: hfl-fadeUp .5s ease both;
  }
  .hfl-eyebrow-dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--sage);
    animation: hfl-pulse 2.5s infinite;
  }
  @keyframes hfl-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.5)} }
  .hfl h1 {
    font-family: 'Fraunces', serif;
    font-size: clamp(56px, 6.5vw, 90px);
    font-weight: 900; line-height: 1.0; letter-spacing: -3px; margin-bottom: 26px;
    color: var(--plum); animation: hfl-fadeUp .5s .08s ease both;
  }
  .hfl h1 em { font-style: italic; color: var(--sage); font-weight: 300; }
  .hfl-sub {
    font-size: 17px; line-height: 1.8; color: var(--plum-mid);
    max-width: 460px; margin-bottom: 42px;
    animation: hfl-fadeUp .5s .16s ease both;
  }
  .hfl-actions {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 48px;
    animation: hfl-fadeUp .5s .24s ease both;
  }
  .hfl-btn-main {
    background: var(--plum); color: white; padding: 16px 36px; border-radius: 100px;
    font-size: 15px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: background .2s, transform .15s;
  }
  .hfl-btn-main:hover { background: var(--charcoal); transform: translateY(-2px); }
  .hfl-btn-soft {
    background: transparent; color: var(--plum); padding: 16px 28px; border-radius: 100px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    border: 1.5px solid rgba(46,37,64,0.25); transition: border-color .2s, background .2s;
  }
  .hfl-btn-soft:hover { border-color: var(--plum); background: rgba(46,37,64,0.04); }
  .hfl-hero-badges {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    animation: hfl-fadeUp .5s .32s ease both;
  }
  .hfl-hero-badge {
    display: flex; align-items: center; gap: 6px;
    background: var(--white); border: 1px solid var(--rule); border-radius: 100px;
    padding: 6px 14px; font-size: 12px; font-weight: 600; color: var(--plum);
    box-shadow: 0 1px 6px rgba(46,37,64,0.06);
  }
  .hfl-hero-badge span { font-size: 12px; }

  /* Hero right — house + card */
  .hfl-hero-right {
    position: relative; z-index: 1;
    display: flex; align-items: center; justify-content: center;
    padding: 100px 0 60px; animation: hfl-fadeUp .6s .12s ease both;
  }
  .hfl-hero-visual { position: relative; width: 420px; height: 460px; }

  /* ── CSS HOUSE ── */
  .hfl-house { position: absolute; bottom: 60px; left: 50%; transform: translateX(-55%); }
  .hfl-house svg { filter: drop-shadow(0 30px 50px rgba(46,37,64,0.22)); }

  /* Dashboard card */
  .hfl-hero-card {
    position: absolute; top: 30px; right: -10px;
    background: white; border-radius: 18px; width: 200px;
    box-shadow: 0 20px 60px rgba(46,37,64,0.18); overflow: hidden;
    animation: hfl-float 5s ease-in-out infinite;
  }
  @keyframes hfl-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  .hfl-hc-hdr { background: var(--plum); padding: 14px 16px; }
  .hfl-hc-title { font-family: 'Fraunces', serif; font-size: 13px; font-weight: 700; color: white; margin-bottom: 2px; }
  .hfl-hc-addr { font-size: 10px; color: rgba(255,255,255,0.5); }
  .hfl-hc-score { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .hfl-hc-num { font-family: 'Fraunces', serif; font-size: 36px; font-weight: 900; color: var(--sage); line-height: 1; }
  .hfl-hc-bar-wrap { flex: 1; height: 5px; background: rgba(255,255,255,0.12); border-radius: 100px; overflow: hidden; }
  .hfl-hc-bar { height: 100%; width: 91%; background: linear-gradient(90deg, var(--sage), #A8E8A0); border-radius: 100px; }
  .hfl-hc-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 7px; }
  .hfl-hc-item { display: flex; align-items: center; justify-content: space-between; font-size: 11px; }
  .hfl-hc-lbl { color: var(--plum); font-weight: 500; display: flex; align-items: center; gap: 6px; }
  .hfl-hc-pass { font-weight: 700; color: var(--sage); font-size: 10px; }
  .hfl-hc-due { font-weight: 700; color: #D4843A; font-size: 10px; }

  /* Floating badge chips */
  .hfl-float-chip {
    position: absolute; background: white; border-radius: 12px;
    box-shadow: 0 6px 20px rgba(46,37,64,0.14); padding: 9px 14px;
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 700; color: var(--plum); white-space: nowrap;
    animation: hfl-float 4s ease-in-out infinite;
  }
  .hfl-float-chip-1 { bottom: 80px; right: 20px; animation-delay: .8s; }
  .hfl-float-chip-2 { bottom: 160px; left: -10px; animation-delay: 0s; }
  .hfl-float-chip-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sage); flex-shrink: 0; }

  /* ── HOW IT WORKS ─────────────────────────────────────────────────────── */
  .hfl-how { padding: 110px 56px 100px; background: var(--white); }
  .hfl-how-header { text-align: center; max-width: 560px; margin: 0 auto 70px; }
  .hfl-kicker {
    font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase;
    color: var(--sage-dark); margin-bottom: 18px; display: block;
  }
  .hfl h2 {
    font-family: 'Fraunces', serif; font-size: clamp(36px, 4.5vw, 58px);
    font-weight: 900; letter-spacing: -1.5px; line-height: 1.04; margin-bottom: 16px;
    color: var(--plum);
  }
  .hfl h2 em { font-style: italic; font-weight: 300; color: var(--sage); }
  .hfl-sec-sub { font-size: 17px; color: var(--plum-mid); line-height: 1.7; }
  .hfl-how-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; max-width: 960px; margin: 0 auto; }
  .hfl-how-card {
    border-radius: 20px; overflow: hidden;
    border: 1px solid var(--rule);
    background: var(--white);
    box-shadow: 0 2px 16px rgba(46,37,64,0.05);
    transition: box-shadow .2s, transform .2s;
  }
  .hfl-how-card:hover { box-shadow: 0 8px 40px rgba(46,37,64,0.1); transform: translateY(-2px); }
  .hfl-how-card-top {
    height: 180px; display: flex; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .hfl-how-card:nth-child(1) .hfl-how-card-top { background: #EFF7EE; }
  .hfl-how-card:nth-child(2) .hfl-how-card-top { background: #EAF2F8; }
  .hfl-how-card:nth-child(3) .hfl-how-card-top { background: #F5EDE6; }
  .hfl-how-card:nth-child(4) .hfl-how-card-top { background: #EFF7EE; }
  .hfl-how-card-icon { font-size: 60px; opacity: 0.8; }
  .hfl-how-card-body { padding: 22px 26px 28px; }
  .hfl-how-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%; background: var(--plum);
    font-size: 11px; font-weight: 800; color: white; margin-bottom: 12px;
    letter-spacing: 0;
  }
  .hfl-how-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700;
    color: var(--plum); margin-bottom: 8px; line-height: 1.2;
  }
  .hfl-how-desc { font-size: 14px; color: var(--plum-mid); line-height: 1.65; }
  .hfl-how-title a { color: var(--sage-dark); text-decoration: none; }

  /* ── STATS STRIP ──────────────────────────────────────────────────────── */
  .hfl-stats {
    background: var(--plum);
    display: grid; grid-template-columns: repeat(4, 1fr);
  }
  .hfl-stat {
    padding: 52px 40px; text-align: center;
    border-right: 1px solid rgba(255,255,255,0.07);
  }
  .hfl-stat:last-child { border-right: none; }
  .hfl-stat-num {
    font-family: 'Fraunces', serif; font-size: clamp(40px, 5vw, 64px);
    font-weight: 900; color: var(--sage); line-height: 1; margin-bottom: 10px;
    letter-spacing: -2px;
  }
  .hfl-stat-lbl {
    font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    color: rgba(255,255,255,0.45);
  }

  /* ── KEY FEATURES ─────────────────────────────────────────────────────── */
  .hfl-features { padding: 100px 56px; background: var(--white); }
  .hfl-features-header { max-width: 480px; margin-bottom: 40px; }
  .hfl-showcase-inner {
    background: var(--plum);
    border-radius: 24px;
    display: flex; overflow: hidden; min-height: 580px;
    border: 1px solid rgba(122,175,118,0.12);
  }
  .hfl-sc-nav {
    width: 240px; flex-shrink: 0;
    background: rgba(255,255,255,0.03);
    border-right: 1px solid rgba(255,255,255,0.07);
    padding: 32px 16px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .hfl-sc-nav-label {
    font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase;
    color: rgba(255,255,255,0.2); padding: 0 12px; margin-bottom: 14px;
  }
  .hfl-sc-tab {
    width: 100%; background: none; border: none; cursor: pointer; text-align: left;
    padding: 11px 14px; border-radius: 10px;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: background .15s;
  }
  .hfl-sc-tab:hover:not(.hfl-sc-tab-active) { background: rgba(255,255,255,0.05); }
  .hfl-sc-tab-active { background: rgba(255,255,255,0.09); }
  .hfl-sc-tab-row { display: flex; align-items: center; gap: 10px; }
  .hfl-sc-tab-icon { font-size: 16px; flex-shrink: 0; }
  .hfl-sc-tab-title { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.4); line-height: 1.3; }
  .hfl-sc-tab-active .hfl-sc-tab-title { color: white; }
  .hfl-sc-progress-track { height: 2px; background: rgba(255,255,255,0.07); border-radius: 100px; overflow: hidden; margin-top: 9px; }
  .hfl-sc-progress-bar { height: 100%; background: var(--sage); border-radius: 100px; animation: hfl-sc-fill 8s linear forwards; }
  @keyframes hfl-sc-fill { from{width:0} to{width:100%} }
  .hfl-sc-content {
    flex: 1; min-width: 0; padding: 48px 52px;
    display: grid; grid-template-columns: 1fr 300px; gap: 44px; align-items: start;
  }
  .hfl-sc-kicker { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--sage); margin-bottom: 14px; }
  .hfl-sc-heading {
    font-family: 'Fraunces', serif; font-size: clamp(26px, 2.8vw, 36px);
    font-weight: 900; color: white; line-height: 1.1; letter-spacing: -0.5px; margin-bottom: 14px;
  }
  .hfl-sc-heading em { color: var(--sage); font-style: italic; font-weight: 300; }
  .hfl-sc-desc { font-size: 14px; color: rgba(255,255,255,0.55); line-height: 1.75; margin-bottom: 22px; }
  .hfl-sc-bullets { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px; }
  .hfl-sc-bullets li { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.5; }
  .hfl-sc-check {
    width: 18px; height: 18px; border-radius: 50%;
    background: rgba(122,175,118,0.2); border: 1px solid rgba(122,175,118,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; color: var(--sage); flex-shrink: 0; margin-top: 2px; font-weight: 700;
  }
  .hfl-sc-cta {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--sage); color: var(--plum);
    padding: 11px 22px; border-radius: 100px;
    font-size: 13px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    transition: background .2s, transform .15s;
  }
  .hfl-sc-cta:hover { background: var(--sage-mid); transform: translateY(-1px); }
  .hfl-sc-slide { animation: hfl-sc-in .3s ease both; }
  @keyframes hfl-sc-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  .hfl-sc-visual { border-radius: 14px; overflow: hidden; box-shadow: 0 16px 50px rgba(0,0,0,0.3); }

  /* Record panel (reused) */
  .hfl-rec-hdr { background: var(--plum-light); padding: 18px 22px; }
  .hfl-rec-hdr-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .hfl-rec-title { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 700; color: white; }
  .hfl-rec-verified { background: rgba(122,175,118,0.25); border: 1px solid rgba(122,175,118,0.5); border-radius: 100px; padding: 3px 9px; font-size: 10px; color: #A8DCA5; font-weight: 700; }
  .hfl-rec-addr { font-size: 11px; color: rgba(255,255,255,0.45); }
  .hfl-rec-score-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  .hfl-rec-score-num { font-family: 'Fraunces', serif; font-size: 42px; font-weight: 900; color: var(--sage); line-height: 1; }
  .hfl-rec-score-right { flex: 1; }
  .hfl-rec-score-lbl { font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .hfl-rec-bar-wrap { height: 5px; background: rgba(255,255,255,0.12); border-radius: 100px; overflow: hidden; }
  .hfl-rec-bar { height: 100%; width: 91%; background: linear-gradient(90deg, var(--sage), #A8E8A0); border-radius: 100px; }
  .hfl-rec-body { padding: 16px 22px; background: var(--plum); }
  .hfl-rec-section-lbl { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 10px; }
  .hfl-rec-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
  .hfl-rec-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 8px; font-size: 11px; }
  .hfl-rec-item-l { display: flex; align-items: center; gap: 7px; color: rgba(255,255,255,0.8); font-weight: 500; }
  .hfl-rec-pass { font-size: 10px; font-weight: 700; color: var(--sage); }
  .hfl-rec-due { font-size: 10px; font-weight: 700; color: #D4843A; }
  .hfl-rec-footer { padding: 11px 22px; background: rgba(122,175,118,0.1); border-top: 1px solid rgba(122,175,118,0.15); font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 600; display: flex; align-items: center; gap: 7px; }
  /* AI panel */
  .hfl-ai-panel-hdr { background: rgba(255,255,255,0.06); padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .hfl-ai-panel-hdr-l { display: flex; align-items: center; gap: 8px; }
  .hfl-ai-panel-name { font-size: 13px; font-weight: 700; color: white; }
  .hfl-ai-panel-live { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--sage); font-weight: 700; }
  .hfl-ai-panel-dot { width: 5px; height: 5px; background: var(--sage); border-radius: 50%; animation: hfl-pulse 2s infinite; }
  .hfl-ai-panel-body { padding: 18px; display: flex; flex-direction: column; gap: 12px; background: var(--plum); }
  .hfl-ai-notice { background: rgba(245,233,187,0.08); border: 1px solid rgba(245,233,187,0.18); border-radius: 12px; padding: 14px; }
  .hfl-ai-notice-tag { font-size: 9px; font-weight: 700; color: #F5E9BB; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
  .hfl-ai-notice p { font-size: 12px; color: rgba(253,252,250,0.8); line-height: 1.55; margin-bottom: 10px; }
  .hfl-ai-notice-btn { background: var(--sage); color: var(--plum); font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 100px; border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', sans-serif; }
  .hfl-ai-user-msg { display: flex; align-items: flex-start; gap: 8px; }
  .hfl-ai-user-icon { width: 26px; height: 26px; background: rgba(255,255,255,0.08); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; margin-top: 2px; }
  .hfl-ai-user-msg p { font-size: 12px; color: rgba(255,255,255,0.5); font-style: italic; line-height: 1.5; }
  .hfl-ai-reply { background: rgba(122,175,118,0.12); border-radius: 12px; padding: 12px 14px; }
  .hfl-ai-reply-tag { font-size: 9px; font-weight: 700; color: var(--sage); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
  .hfl-ai-reply p { font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.55; }
  .hfl-ai-panel-footer { padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.07); background: var(--plum); display: flex; align-items: center; gap: 10px; }
  .hfl-ai-mic { width: 34px; height: 34px; background: var(--sage); border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 0 6px rgba(122,175,118,0.15); }
  .hfl-ai-mic-hint { font-size: 11px; color: rgba(255,255,255,0.3); }
  /* Compete panel */
  .hfl-compete-hdr { background: var(--plum-light); padding: 18px 22px; }
  .hfl-compete-title { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 700; color: white; margin-bottom: 3px; }
  .hfl-compete-sub { font-size: 11px; color: rgba(255,255,255,0.4); }
  .hfl-compete-body { padding: 16px 22px; display: flex; flex-direction: column; gap: 10px; background: var(--plum); }
  .hfl-compete-agent { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
  .hfl-compete-agent-featured { background: rgba(122,175,118,0.1); border: 1px solid rgba(122,175,118,0.25); }
  .hfl-compete-avi { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .hfl-compete-info { flex: 1; }
  .hfl-compete-name { font-size: 12px; font-weight: 700; color: white; margin-bottom: 2px; }
  .hfl-compete-detail { font-size: 10px; color: rgba(255,255,255,0.45); line-height: 1.4; }
  .hfl-compete-comm { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 900; color: white; flex-shrink: 0; }
  .hfl-compete-best { display: inline-flex; align-items: center; gap: 3px; margin-top: 3px; background: var(--sage); color: var(--plum); font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 100px; }
  .hfl-compete-footer { padding: 11px 22px; background: rgba(122,175,118,0.08); border-top: 1px solid rgba(122,175,118,0.12); font-size: 10px; color: rgba(255,255,255,0.4); font-weight: 600; display: flex; align-items: center; gap: 7px; }
  /* Contractor panel */
  .hfl-sc-contr-hdr { background: var(--plum-light); padding: 16px 22px; }
  .hfl-sc-contr-cards { padding: 14px 22px; background: var(--plum); display: flex; flex-direction: column; gap: 8px; }
  .hfl-sc-contr-card { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; font-size: 11px; }
  .hfl-sc-contr-name { font-weight: 700; color: white; font-size: 12px; margin-bottom: 1px; }
  .hfl-sc-contr-jobs { color: rgba(255,255,255,0.4); }
  .hfl-sc-contr-vbadge { font-size: 9px; font-weight: 700; color: var(--sage); }
  .hfl-sc-quote-box { background: rgba(245,233,187,0.07); border: 1px solid rgba(245,233,187,0.15); border-radius: 10px; padding: 12px 14px; margin: 0 22px 14px; }
  .hfl-sc-quote-label { font-size: 9px; font-weight: 700; color: #F5E9BB; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
  .hfl-sc-quote-title { font-size: 12px; font-weight: 600; color: white; margin-bottom: 4px; }
  .hfl-sc-quote-sub { font-size: 10px; color: rgba(255,255,255,0.4); margin-bottom: 8px; }
  .hfl-sc-quote-bids { display: flex; gap: 5px; }
  .hfl-sc-quote-bid { font-size: 10px; font-weight: 700; color: white; background: rgba(255,255,255,0.08); border-radius: 100px; padding: 3px 9px; }
  .hfl-sc-quote-bid-best { color: var(--sage); background: rgba(122,175,118,0.15); }

  /* ── SPLIT SECTION ────────────────────────────────────────────────────── */
  .hfl-split { display: grid; grid-template-columns: 1fr 1fr; }
  .hfl-split-left {
    background: var(--plum); padding: 100px 72px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .hfl-split-right {
    background: var(--sage-light); padding: 100px 72px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .hfl-split-kicker-l { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--sage); margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .hfl-split-kicker-r { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--sage-dark); margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .hfl-split-left h2 { color: white; margin-bottom: 18px; font-size: clamp(32px, 3.5vw, 50px); }
  .hfl-split-left h2 em { color: var(--sage); }
  .hfl-split-right h2 { color: var(--plum); margin-bottom: 28px; font-size: clamp(32px, 3.5vw, 50px); }
  .hfl-split-right h2 em { color: var(--sage-dark); }
  .hfl-split-bullets { list-style: none; display: flex; flex-direction: column; gap: 12px; margin-bottom: 36px; }
  .hfl-split-bullets li { display: flex; align-items: center; gap: 12px; font-size: 15px; color: rgba(255,255,255,0.8); font-weight: 500; }
  .hfl-split-bullets li span { width: 22px; height: 22px; border-radius: 50%; background: rgba(122,175,118,0.2); border: 1px solid rgba(122,175,118,0.4); display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--sage); flex-shrink: 0; font-weight: 700; }
  .hfl-split-btn-l {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--sage); color: var(--plum); padding: 14px 28px;
    border-radius: 100px; font-size: 14px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: background .2s; width: fit-content;
  }
  .hfl-split-btn-l:hover { background: var(--sage-mid); }
  .hfl-contr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .hfl-contr-card {
    background: white; border-radius: 16px; padding: 22px 18px; text-align: center;
    border: 1px solid rgba(46,37,64,0.08); box-shadow: 0 2px 12px rgba(46,37,64,0.06);
    transition: box-shadow .2s, transform .2s;
  }
  .hfl-contr-card:hover { box-shadow: 0 8px 24px rgba(46,37,64,0.1); transform: translateY(-2px); }
  .hfl-contr-emoji { font-size: 28px; margin-bottom: 10px; }
  .hfl-contr-name { font-size: 13px; font-weight: 700; color: var(--plum); margin-bottom: 4px; }
  .hfl-contr-stars { color: #F4B942; font-size: 12px; margin-bottom: 3px; }
  .hfl-contr-jobs { font-size: 11px; color: var(--plum-mid); margin-bottom: 8px; }
  .hfl-contr-badge {
    display: inline-block; font-size: 10px; font-weight: 700; color: var(--sage-dark);
    background: var(--sage-light); border-radius: 100px; padding: 3px 10px;
  }
  .hfl-contr-browse {
    margin-top: 22px; font-size: 14px; font-weight: 700; color: var(--plum);
    display: flex; align-items: center; gap: 6px; cursor: pointer;
    background: none; border: none; font-family: 'Plus Jakarta Sans', sans-serif;
    transition: gap .15s;
  }
  .hfl-contr-browse:hover { gap: 10px; }

  /* ── AI SECTION ───────────────────────────────────────────────────────── */
  .hfl-ai-section {
    background: var(--plum); padding: 110px 56px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center;
  }
  .hfl-ai-visual {
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .hfl-ai-chat-wrap { position: relative; width: 320px; }
  .hfl-ai-bubble {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 18px; padding: 16px 20px; backdrop-filter: blur(8px);
    position: relative;
  }
  .hfl-ai-bubble + .hfl-ai-bubble { margin-top: 12px; }
  .hfl-ai-bubble-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .hfl-ai-bubble-icon {
    width: 32px; height: 32px; border-radius: 50%; background: var(--sage);
    display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;
  }
  .hfl-ai-bubble-title { font-size: 12px; font-weight: 700; color: white; }
  .hfl-ai-bubble-tag { font-size: 10px; color: var(--sage); }
  .hfl-ai-bubble-text { font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6; }
  .hfl-ai-user-bubble {
    background: rgba(122,175,118,0.12); border: 1px solid rgba(122,175,118,0.2);
    border-radius: 18px; padding: 14px 18px; margin-top: 12px;
    font-size: 13px; color: rgba(255,255,255,0.6); font-style: italic; line-height: 1.55;
    display: flex; align-items: flex-start; gap: 10px;
  }
  .hfl-ai-mic-icon { width: 28px; height: 28px; background: var(--sage); border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; }
  .hfl-ai-pulse-ring {
    position: absolute; inset: -20px; border-radius: 50%;
    border: 1px solid rgba(122,175,118,0.12); animation: hfl-ripple 3s ease-in-out infinite;
  }
  .hfl-ai-pulse-ring-2 { animation-delay: 1s; inset: -40px; border-color: rgba(122,175,118,0.07); }
  @keyframes hfl-ripple { 0%{opacity:1;transform:scale(0.95)} 100%{opacity:0;transform:scale(1.05)} }
  .hfl-ai-text .hfl-kicker { color: var(--sage); margin-bottom: 18px; }
  .hfl-ai-text h2 { color: white; margin-bottom: 22px; }
  .hfl-ai-text h2 em { color: var(--sage); }
  .hfl-ai-bullets { list-style: none; display: flex; flex-direction: column; gap: 11px; margin-bottom: 36px; }
  .hfl-ai-bullets li { display: flex; align-items: center; gap: 12px; font-size: 15px; color: rgba(255,255,255,0.75); font-weight: 500; }
  .hfl-ai-bullets li span { width: 20px; height: 20px; border-radius: 50%; background: rgba(122,175,118,0.2); border: 1px solid rgba(122,175,118,0.4); display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--sage); flex-shrink: 0; font-weight: 700; }
  .hfl-ai-btns { display: flex; gap: 12px; align-items: center; }
  .hfl-ai-btn-live {
    display: flex; align-items: center; gap: 7px;
    border: 1.5px solid rgba(255,255,255,0.25); color: white; background: none;
    padding: 11px 22px; border-radius: 100px; font-size: 13px; font-weight: 600;
    font-family: 'Plus Jakarta Sans', sans-serif; cursor: pointer; transition: border-color .2s;
  }
  .hfl-ai-btn-live:hover { border-color: rgba(255,255,255,0.5); }
  .hfl-ai-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sage); animation: hfl-pulse 2s infinite; }
  .hfl-ai-btn-try {
    background: var(--sage); color: var(--plum); padding: 11px 24px; border-radius: 100px;
    font-size: 13px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: background .2s;
  }
  .hfl-ai-btn-try:hover { background: var(--sage-mid); }

  /* ── TESTIMONIALS ─────────────────────────────────────────────────────── */
  .hfl-testimonials { padding: 110px 56px; background: var(--white); }
  .hfl-testimonials-header { text-align: center; margin-bottom: 60px; }
  .hfl-testimonials-header h2 { margin-bottom: 12px; }
  .hfl-testimonials-header p { font-size: 16px; color: var(--plum-mid); line-height: 1.7; }
  .hfl-test-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .hfl-test-card {
    background: var(--white); border: 1px solid rgba(46,37,64,0.1); border-radius: 20px;
    padding: 32px 28px; transition: box-shadow .2s, transform .2s;
    box-shadow: 0 2px 12px rgba(46,37,64,0.04);
  }
  .hfl-test-card:hover { box-shadow: 0 12px 40px rgba(46,37,64,0.1); transform: translateY(-3px); }
  .hfl-test-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .hfl-test-avi {
    width: 44px; height: 44px; border-radius: 50%; background: var(--plum);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 900; color: white; flex-shrink: 0;
  }
  .hfl-test-stars { color: #F4B942; font-size: 15px; letter-spacing: 1px; }
  .hfl-test-headline {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 900;
    color: var(--plum); margin-bottom: 14px; line-height: 1.2;
  }
  .hfl-test-quote { font-size: 14px; color: var(--plum-mid); line-height: 1.7; font-style: italic; margin-bottom: 20px; }
  .hfl-test-author-name { font-size: 13px; font-weight: 700; color: var(--plum); }
  .hfl-test-author-role { font-size: 11px; color: var(--plum-mid); margin-top: 2px; }

  /* ── FINAL CTA ────────────────────────────────────────────────────────── */
  .hfl-final-cta {
    background: var(--plum); padding: 110px 56px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center;
  }
  .hfl-cta-kicker { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: var(--sage); margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .hfl-final-cta h2 { color: white; margin-bottom: 22px; font-size: clamp(34px, 4vw, 52px); }
  .hfl-final-cta h2 em { color: var(--sage); }
  .hfl-final-cta p { font-size: 16px; color: rgba(255,255,255,0.6); line-height: 1.75; margin-bottom: 40px; max-width: 420px; }
  .hfl-cta-btns { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 32px; }
  .hfl-cta-btn-main {
    background: var(--sage); color: var(--plum); padding: 15px 32px; border-radius: 100px;
    font-size: 15px; font-weight: 700; border: none; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif; transition: background .2s, transform .15s;
  }
  .hfl-cta-btn-main:hover { background: var(--sage-mid); transform: translateY(-1px); }
  .hfl-cta-btn-ghost {
    background: transparent; color: white; padding: 15px 28px; border-radius: 100px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    font-family: 'Plus Jakarta Sans', sans-serif;
    border: 1.5px solid rgba(255,255,255,0.25); transition: border-color .2s;
  }
  .hfl-cta-btn-ghost:hover { border-color: rgba(255,255,255,0.5); }
  .hfl-cta-trust { display: flex; gap: 20px; flex-wrap: wrap; }
  .hfl-cta-trust-item { display: flex; align-items: center; gap: 7px; font-size: 12px; color: rgba(255,255,255,0.45); font-weight: 500; }

  /* Orbit diagram */
  .hfl-orbit-wrap { position: relative; display: flex; align-items: center; justify-content: center; height: 380px; }
  .hfl-orbit-center {
    position: absolute; width: 100px; height: 100px; border-radius: 50%;
    background: var(--sage-light); border: 3px solid var(--sage);
    display: flex; align-items: center; justify-content: center; z-index: 2;
    flex-direction: column;
  }
  .hfl-orbit-score { font-family: 'Fraunces', serif; font-size: 30px; font-weight: 900; color: var(--plum); line-height: 1; }
  .hfl-orbit-score-lbl { font-size: 8px; font-weight: 700; color: var(--plum-mid); letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .hfl-orbit-ring {
    position: absolute; border-radius: 50%;
    border: 1px dashed rgba(122,175,118,0.25);
  }
  .hfl-orbit-ring-1 { width: 200px; height: 200px; }
  .hfl-orbit-ring-2 { width: 320px; height: 320px; border-color: rgba(122,175,118,0.12); }
  .hfl-orbit-node {
    position: absolute; display: flex; flex-direction: column; align-items: center; gap: 5px;
  }
  .hfl-orbit-node-circle {
    width: 52px; height: 52px; border-radius: 50%;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
    display: flex; align-items: center; justify-content: center; font-size: 18px;
    transition: background .2s;
  }
  .hfl-orbit-node-circle:hover { background: rgba(122,175,118,0.15); }
  .hfl-orbit-node-lbl { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.35); }

  /* ── FOOTER ───────────────────────────────────────────────────────────── */
  .hfl-footer { background: var(--charcoal); padding: 64px 56px 32px; }
  .hfl-footer-top { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 52px; }
  .hfl-footer-logo { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 900; color: white; margin-bottom: 14px; display: block; text-decoration: none; }
  .hfl-footer-logo span { color: var(--sage); font-style: italic; font-weight: 300; }
  .hfl-footer-tagline { font-size: 14px; color: rgba(255,255,255,0.4); line-height: 1.65; max-width: 220px; margin-bottom: 24px; }
  .hfl-footer-social { display: flex; gap: 10px; }
  .hfl-footer-social a { color: rgba(255,255,255,0.35); width: 36px; height: 36px; background: rgba(255,255,255,0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: color .2s, background .2s; }
  .hfl-footer-social a:hover { color: var(--sage); background: rgba(122,175,118,0.12); }
  .hfl-footer-col-title { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 20px; }
  .hfl-footer-col-links { list-style: none; display: flex; flex-direction: column; gap: 12px; }
  .hfl-footer-col-links a { font-size: 14px; color: rgba(255,255,255,0.55); text-decoration: none; transition: color .2s; cursor: pointer; }
  .hfl-footer-col-links a:hover { color: rgba(255,255,255,0.9); }
  .hfl-footer-bottom { border-top: 1px solid rgba(255,255,255,0.07); padding-top: 24px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: rgba(255,255,255,0.3); }
  .hfl-footer-bottom-links { display: flex; gap: 24px; }
  .hfl-footer-bottom-links a { color: rgba(255,255,255,0.3); text-decoration: none; transition: color .2s; }
  .hfl-footer-bottom-links a:hover { color: rgba(255,255,255,0.6); }

  /* ── ANIMATIONS ───────────────────────────────────────────────────────── */
  @keyframes hfl-fadeUp { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }

  /* ── MOBILE ───────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .hfl-nav { padding: 0 24px; }
    .hfl-nav-links { display: none; position: fixed; top: 64px; left: 0; right: 0; transform: none; flex-direction: column; gap: 0; background: var(--white); border-top: 1px solid var(--rule); padding: 8px 24px 24px; z-index: 99; }
    .hfl-nav-links.hfl-menu-open { display: flex; }
    .hfl-nav-links.hfl-menu-open li a { display: block; padding: 14px 0; border-bottom: 1px solid var(--rule); }
    .hfl-nav-links.hfl-menu-open li:last-child a { border-bottom: none; }
    .hfl-nav-signin { display: none; }
    .hfl-hamburger { display: block; }
    .hfl-hamburger.hfl-menu-open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .hfl-hamburger.hfl-menu-open span:nth-child(2) { opacity: 0; }
    .hfl-hamburger.hfl-menu-open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

    .hfl-hero { grid-template-columns: 1fr; min-height: auto; padding: 90px 24px 64px; }
    .hfl-hero-right { display: none; }
    .hfl h1 { font-size: clamp(44px, 12vw, 64px); letter-spacing: -2px; }
    .hfl-sub { font-size: 16px; max-width: 100%; }

    .hfl-how { padding: 72px 24px; }
    .hfl-how-grid { grid-template-columns: 1fr; max-width: 420px; }

    .hfl-stats { grid-template-columns: 1fr 1fr; }
    .hfl-stat { padding: 36px 24px; }
    .hfl-stat:nth-child(2) { border-right: none; }

    .hfl-features { padding: 72px 24px; }
    .hfl-showcase-inner { flex-direction: column; border-radius: 20px; min-height: auto; }
    .hfl-sc-nav { width: 100%; flex-direction: row; gap: 4px; overflow-x: auto; padding: 14px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .hfl-sc-nav-label { display: none; }
    .hfl-sc-tab { padding: 9px 12px; white-space: nowrap; flex-shrink: 0; width: auto; }
    .hfl-sc-progress-track { display: none; }
    .hfl-sc-content { grid-template-columns: 1fr; padding: 28px 24px; gap: 24px; }
    .hfl-sc-visual { display: none; }

    .hfl-split { grid-template-columns: 1fr; }
    .hfl-split-left, .hfl-split-right { padding: 64px 28px; }

    .hfl-ai-section { grid-template-columns: 1fr; padding: 72px 24px; gap: 48px; }
    .hfl-ai-visual { display: none; }

    .hfl-testimonials { padding: 72px 24px; }
    .hfl-test-grid { grid-template-columns: 1fr; }

    .hfl-final-cta { grid-template-columns: 1fr; padding: 72px 24px; gap: 48px; }
    .hfl-orbit-wrap { display: none; }

    .hfl-footer { padding: 48px 24px 28px; }
    .hfl-footer-top { grid-template-columns: 1fr 1fr; gap: 32px; }
    .hfl-footer-bottom { flex-direction: column; gap: 16px; text-align: center; }
    .hfl-footer-bottom-links { flex-wrap: wrap; justify-content: center; }
  }

  @media (max-width: 480px) {
    .hfl h1 { font-size: clamp(36px, 11vw, 50px); letter-spacing: -1.5px; }
    .hfl-actions { flex-direction: column; align-items: stretch; }
    .hfl-btn-main, .hfl-btn-soft { text-align: center; }
    .hfl-stats { grid-template-columns: 1fr; }
    .hfl-stat { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .hfl-stat:last-child { border-bottom: none; }
    .hfl h2 { font-size: clamp(28px, 9vw, 40px); letter-spacing: -1px; }
    .hfl-footer-top { grid-template-columns: 1fr; }
    .hfl-split-left, .hfl-split-right { padding: 52px 24px; }
    .hfl-contr-grid { grid-template-columns: 1fr; }
  }

  @media (min-width: 901px) and (max-width: 1200px) {
    .hfl-nav { padding: 0 32px; }
    .hfl-hero { padding: 64px 32px 0; gap: 24px; }
    .hfl-hero-visual { width: 340px; height: 380px; }
    .hfl-how { padding: 80px 32px; }
    .hfl-features { padding: 80px 32px; }
    .hfl-split-left, .hfl-split-right { padding: 80px 48px; }
    .hfl-ai-section { padding: 80px 32px; gap: 48px; }
    .hfl-testimonials { padding: 80px 32px; }
    .hfl-final-cta { padding: 80px 32px; gap: 48px; }
    .hfl-footer { padding: 52px 32px 28px; }
  }
`;
