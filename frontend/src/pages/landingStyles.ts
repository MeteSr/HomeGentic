export const CSS = `
/* ── Design Tokens ───────────────────────────────────────────────────────── */
.hfl {
  --teal:         #00CEC8;
  --teal-dark:    #00A09B;
  --teal-light:   #E0FAFA;
  --orange:       #EB4203;
  --orange-dark:  #C83A00;
  --orange-light: #FFF3EE;
  --cream:        #FCEFC3;
  --peach:        #FF9C5F;
  --navy:         #111827;
  --text:         #1E293B;
  --muted:        #64748B;
  --border:       rgba(0,0,0,0.07);
  --shadow-xs:    0 1px 3px rgba(0,0,0,0.04);
  --shadow-sm:    0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  --shadow-md:    0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04);
  --shadow-lg:    0 20px 60px rgba(0,0,0,0.10), 0 4px 20px rgba(0,0,0,0.06);
  --shadow-xl:    0 32px 80px rgba(0,0,0,0.14), 0 8px 32px rgba(0,0,0,0.08);
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 24px;
  font-family: 'Inter', -apple-system, 'SF Pro Display', system-ui, sans-serif;
  color: var(--text);
  background: #FFFFFF;
  -webkit-font-smoothing: antialiased;
}

/* ── Nav ────────────────────────────────────────────────────────────────── */
.hfl-nav {
  position: sticky; top: 0; z-index: 200;
  display: grid; grid-template-columns: auto 1fr auto;
  align-items: center; height: 64px; padding: 0 3rem;
  background: rgba(255,255,255,0.96);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 1px 0 rgba(0,0,0,0.03);
}
.hfl-logo {
  font-size: 1.1rem; font-weight: 800; color: var(--navy);
  text-decoration: none; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.hfl-logo-text { color: var(--navy); }
.hfl-logo-text span { color: var(--teal); }
.hfl-nav-links {
  display: flex; align-items: center; justify-content: center;
  list-style: none; margin: 0; padding: 0;
}
.hfl-nav-links li a {
  font-size: 0.84rem; font-weight: 500; color: #374151;
  text-decoration: none; padding: 0.5rem 0.75rem;
  border-radius: 6px; cursor: pointer; white-space: nowrap;
  transition: color 0.15s, background 0.15s; display: block;
}
.hfl-nav-links li a:hover { color: var(--navy); background: #F9FAFB; }
.hfl-nav-actions {
  display: flex; align-items: center; gap: 0.5rem;
  flex-shrink: 0; justify-self: end;
}
.hfl-nav-signin {
  font-size: 0.84rem; font-weight: 600; color: var(--orange);
  background: none; border: none; padding: 0.4rem 0.875rem;
  cursor: pointer; border-radius: 6px; transition: opacity 0.15s;
}
.hfl-nav-signin:hover { opacity: 0.75; }
.hfl-nav-pill {
  font-size: 0.84rem; font-weight: 600; color: white;
  background: var(--orange); border: none;
  padding: 0.5rem 1.25rem; border-radius: 100px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(235,66,3,0.28);
  transition: transform 0.15s, box-shadow 0.15s;
}
.hfl-nav-pill:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(235,66,3,0.4); }
.hfl-hamburger {
  display: none; flex-direction: column; gap: 4px;
  background: none; border: none; cursor: pointer; padding: 6px;
}
.hfl-hamburger span { display: block; width: 20px; height: 2px; background: var(--text); border-radius: 2px; }

/* ── Hero Wrap ──────────────────────────────────────────────────────────── */
.hfl-hero-wrap {
  position: relative; overflow: hidden;
  background: linear-gradient(
    160deg,
    rgba(224,250,250,0.3) 0%,
    rgba(255,255,255,1) 35%,
    rgba(252,239,195,0.25) 70%,
    rgba(255,156,95,0.1) 100%
  );
}
.hfl-hero-wrap::before {
  content: ""; position: absolute;
  top: -80px; right: -100px; width: 700px; height: 700px;
  border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(252,239,195,0.45) 0%, transparent 65%);
}

/* ── Hero ───────────────────────────────────────────────────────────────── */
.hfl-hero {
  display: grid; grid-template-columns: 1fr 1.15fr;
  align-items: center; gap: 4rem;
  padding: 5.5rem 3rem 5rem; max-width: 1200px; margin: 0 auto;
  position: relative; z-index: 1;
}
.hfl-hero-left { max-width: 520px; }
.hfl-hero-badge {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 0.64rem; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: #00858F;
  background: #E0FAFA; border: 1px solid #A0EDED;
  padding: 5px 13px; border-radius: 100px; margin-bottom: 1.5rem;
}
.hfl-hero-badge::before {
  content: ""; width: 5px; height: 5px;
  border-radius: 50%; background: var(--teal); flex-shrink: 0;
}
.hfl-hero h1 {
  font-size: clamp(2.5rem, 4vw, 3.375rem); font-weight: 800;
  line-height: 1.1; letter-spacing: -0.03em;
  color: var(--navy); margin: 0 0 1.25rem;
}
.hfl-hero-teal   { color: var(--teal);   }
.hfl-hero-orange { color: var(--orange); }
.hfl-hero p {
  font-size: 1rem; color: var(--muted); line-height: 1.75;
  margin: 0 0 2rem; max-width: 440px;
}
.hfl-actions {
  display: flex; align-items: center; gap: 0.875rem;
  flex-wrap: wrap; margin-bottom: 2.5rem;
}
.hfl-btn-main {
  font-size: 0.9375rem; font-weight: 600; color: white;
  background: var(--teal); border: none;
  padding: 0.75rem 1.75rem; border-radius: 100px; cursor: pointer;
  box-shadow: 0 2px 12px rgba(0,206,200,0.32);
  transition: transform 0.15s, box-shadow 0.15s;
}
.hfl-btn-main:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,206,200,0.44); }
.hfl-btn-soft {
  font-size: 0.9375rem; font-weight: 500; color: var(--text);
  background: white; border: 1.5px solid rgba(0,0,0,0.12);
  padding: 0.72rem 1.5rem; border-radius: 100px; cursor: pointer;
  display: flex; align-items: center; gap: 7px;
  box-shadow: var(--shadow-xs);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.hfl-btn-soft:hover { border-color: rgba(0,0,0,0.22); box-shadow: var(--shadow-sm); }

/* ── Trust Pills (inline in hero) ───────────────────────────────────────── */
.hfl-trust-pills {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 0.875rem 1.5rem;
}
.hfl-trust-pill { display: flex; align-items: flex-start; gap: 0.6rem; }
.hfl-trust-pill-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.hfl-trust-pill-label { font-size: 0.8rem; font-weight: 700; color: var(--navy); line-height: 1.2; }
.hfl-trust-pill-sub   { font-size: 0.71rem; color: var(--muted); line-height: 1.4; }

/* ── Hero Right ─────────────────────────────────────────────────────────── */
.hfl-hero-right {
  position: relative; display: flex;
  align-items: center; justify-content: center;
}
.hfl-hero-illustration {
  position: absolute; inset: -60px -80px;
  width: calc(100% + 160px); height: calc(100% + 120px);
  pointer-events: none; overflow: visible;
}
.hfl-dm-wrap { position: relative; z-index: 1; width: 100%; }

/* ── Dashboard Mockup ───────────────────────────────────────────────────── */
.hfl-dm {
  background: white; border-radius: var(--r-xl);
  overflow: hidden; width: 100%;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.03),
    0 4px 16px rgba(0,0,0,0.06),
    0 24px 64px rgba(0,0,0,0.12),
    0 48px 96px rgba(0,0,0,0.05);
  font-family: 'Inter', system-ui, sans-serif;
}
.hfl-dm-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 14px; border-bottom: 1px solid #F1F5F9; background: white;
}
.hfl-dm-topbar-logo {
  display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 800; color: #0F172A;
}
.hfl-dm-topbar-icons { display: flex; gap: 8px; }
.hfl-dm-body  { display: flex; }
.hfl-dm-sidebar {
  width: 118px; flex-shrink: 0; background: #F9FAFB;
  border-right: 1px solid #F1F5F9; padding: 7px 0;
}
.hfl-dm-nav {
  padding: 5px 10px; font-size: 9.5px; color: #94A3B8;
  display: flex; align-items: center; gap: 5px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  transition: background 0.1s;
}
.hfl-dm-nav-active {
  background: #FFF3EE; color: #EB4203; font-weight: 600;
  border-right: 2px solid #EB4203;
}
.hfl-dm-main { flex: 1; padding: 10px; overflow: hidden; min-width: 0; }
.hfl-dm-main-cols { display: flex; gap: 8px; }
.hfl-dm-main-left { flex: 1; min-width: 0; }
.hfl-dm-main-right { width: 108px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.hfl-dm-welcome { font-size: 11.5px; font-weight: 700; color: #0F172A; margin-bottom: 8px; }
.hfl-dm-cards-row { display: flex; gap: 6px; margin-bottom: 6px; }
.hfl-dm-score-card, .hfl-dm-maint-card {
  flex: 1; background: #F9FAFB; border: 1px solid #EAEAEA;
  border-radius: 7px; padding: 7px; min-width: 0;
}
.hfl-dm-card-label { font-size: 7.5px; color: #94A3B8; font-weight: 600; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.04em; }
.hfl-dm-score-wrap { display: flex; align-items: center; gap: 7px; }
.hfl-dm-score-ring {
  width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: conic-gradient(#00CEC8 0% 82%, #E8ECEF 82% 100%);
  display: flex; align-items: center; justify-content: center; position: relative;
}
.hfl-dm-score-ring::before {
  content: ""; position: absolute; inset: 7px; border-radius: 50%; background: #F9FAFB;
}
.hfl-dm-score-val { position: relative; z-index: 1; font-size: 12px; font-weight: 800; color: #0F172A; }
.hfl-dm-score-delta { font-size: 8px; color: #00CEC8; font-weight: 600; }
.hfl-dm-score-sub   { font-size: 7px; color: #94A3B8; }
.hfl-dm-maint-nums  { display: flex; gap: 12px; padding-top: 2px; }
.hfl-dm-maint-num   { font-size: 18px; font-weight: 800; color: #0F172A; line-height: 1; }
.hfl-dm-maint-lbl   { font-size: 7px; color: #94A3B8; margin-top: 2px; }
.hfl-dm-stats-row   { display: flex; gap: 5px; margin-bottom: 7px; }
.hfl-dm-stat {
  flex: 1; background: #F9FAFB; border: 1px solid #EAEAEA;
  border-radius: 6px; padding: 5px; text-align: center; min-width: 0;
}
.hfl-dm-stat-label { font-size: 6.5px; color: #94A3B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hfl-dm-stat-val   { font-size: 14px; font-weight: 800; color: #0F172A; line-height: 1.2; }
.hfl-dm-stat-link  { font-size: 7px; color: #64748B; font-weight: 600; }
.hfl-dm-activity-label {
  font-size: 7px; font-weight: 700; color: #94A3B8;
  text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;
}
.hfl-dm-act-item {
  display: flex; align-items: flex-start; gap: 5px;
  padding: 3px 0; border-top: 1px solid #F8F8F8;
}
.hfl-dm-act-dot        { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
.hfl-dm-act-dot-green  { background: #00CEC8; }
.hfl-dm-act-dot-blue   { background: #EB4203; }
.hfl-dm-act-dot-orange { background: #FF9C5F; }
.hfl-dm-act-body  { flex: 1; min-width: 0; }
.hfl-dm-act-title { font-size: 8px; font-weight: 600; color: #1E293B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hfl-dm-act-sub   { font-size: 6.5px; color: #94A3B8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hfl-dm-act-date  { font-size: 7px; color: #94A3B8; flex-shrink: 0; white-space: nowrap; }

/* Right panel of dashboard */
.hfl-dm-prop-card {
  background: white; border: 1px solid #EAEAEA; border-radius: 8px; overflow: hidden;
}
.hfl-dm-prop-info  { padding: 5px 6px; }
.hfl-dm-prop-addr  { font-size: 7.5px; font-weight: 700; color: #0F172A; line-height: 1.3; }
.hfl-dm-prop-city  { font-size: 6.5px; color: #94A3B8; }
.hfl-dm-member-card, .hfl-dm-next-maint {
  background: white; border: 1px solid #EAEAEA; border-radius: 8px; padding: 6px;
}
.hfl-dm-member-title, .hfl-dm-next-title { font-size: 7px; color: #94A3B8; font-weight: 600; margin-bottom: 3px; }
.hfl-dm-member-tier {
  font-size: 9px; font-weight: 700; color: #0F172A;
  display: flex; align-items: center; gap: 4px; margin-bottom: 2px;
}
.hfl-dm-member-verified {
  font-size: 6.5px; color: #00CEC8; font-weight: 700;
  background: #E0FAFA; padding: 1px 4px; border-radius: 3px;
}
.hfl-dm-member-detail, .hfl-dm-next-task { font-size: 6.5px; color: #94A3B8; margin-bottom: 4px; }
.hfl-dm-member-link, .hfl-dm-next-link { font-size: 7px; font-weight: 600; color: #EB4203; cursor: pointer; }
.hfl-dm-next-date  { font-size: 9px; font-weight: 700; color: #0F172A; margin-bottom: 1px; }

/* ── Role Cards ─────────────────────────────────────────────────────────── */
.hfl-roles {
  padding: 6rem 3rem; background: #FAFAFA;
  border-top: 1px solid rgba(0,0,0,0.05);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.hfl-section-header { text-align: center; margin-bottom: 3rem; }
.hfl-section-header h2 {
  font-size: clamp(1.5rem, 2.5vw, 2rem); font-weight: 700;
  color: var(--navy); margin: 0; letter-spacing: -0.02em;
}
.hfl-section-header p { font-size: 0.9375rem; color: var(--muted); margin: 0.75rem 0 0; }
.hfl-roles-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem; max-width: 1000px; margin: 0 auto;
}
.hfl-role-card {
  background: white; border: 1px solid rgba(0,0,0,0.07);
  border-radius: var(--r-lg); padding: 1.75rem;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s;
}
.hfl-role-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.hfl-role-icon {
  width: 48px; height: 48px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; margin-bottom: 1rem;
}
.hfl-role-title { font-size: 1rem; font-weight: 700; color: var(--navy); margin-bottom: 0.5rem; }
.hfl-role-desc  { font-size: 0.835rem; color: var(--muted); line-height: 1.65; margin-bottom: 1rem; }
.hfl-role-link  {
  font-size: 0.835rem; font-weight: 600; color: var(--teal);
  cursor: pointer; background: none; border: none; padding: 0;
  transition: color 0.15s;
}
.hfl-role-link:hover { color: var(--teal-dark); }

/* ── Features ───────────────────────────────────────────────────────────── */
.hfl-features {
  padding: 6rem 3rem; background: white;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.hfl-features-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 1.25rem; max-width: 1200px; margin: 0 auto;
}
.hfl-feat-card {
  background: #FAFAFA; border: 1px solid rgba(0,0,0,0.06);
  border-radius: var(--r-md); padding: 1.25rem;
  display: flex; align-items: flex-start; gap: 0.875rem;
  transition: box-shadow 0.2s, background 0.2s;
}
.hfl-feat-card:hover { box-shadow: var(--shadow-sm); background: white; }
.hfl-feat-icon {
  width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.hfl-feat-title { font-size: 0.85rem; font-weight: 700; color: var(--navy); margin-bottom: 0.3rem; }
.hfl-feat-desc  { font-size: 0.75rem; color: var(--muted); line-height: 1.6; }

/* ── Trust Strip ────────────────────────────────────────────────────────── */
.hfl-strip {
  background: #FAFAFA;
  border-top: 1px solid rgba(0,0,0,0.06); border-bottom: 1px solid rgba(0,0,0,0.06);
}
.hfl-strip-inner {
  display: grid; grid-template-columns: repeat(3, 1fr);
  max-width: 1000px; margin: 0 auto;
}
.hfl-strip-col {
  display: flex; align-items: flex-start; gap: 1rem;
  padding: 1.75rem 2rem; border-right: 1px solid rgba(0,0,0,0.06);
}
.hfl-strip-col:last-child { border-right: none; }
.hfl-strip-logo {
  width: 44px; height: 44px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.hfl-strip-title { font-size: 0.875rem; font-weight: 700; color: var(--navy); margin-bottom: 0.3rem; }
.hfl-strip-desc  { font-size: 0.78rem; color: var(--muted); line-height: 1.55; margin-bottom: 0.375rem; }
.hfl-strip-link  {
  font-size: 0.78rem; font-weight: 600; color: var(--teal);
  background: none; border: none; padding: 0; cursor: pointer;
}
.hfl-strip-link:hover { text-decoration: underline; }
.hfl-strip-code {
  display: inline-block; font-size: 0.71rem; font-weight: 700; letter-spacing: 0.05em;
  color: var(--teal); background: #E0FAFA; border: 1px solid #A0EDED;
  padding: 2px 8px; border-radius: 4px;
}

/* ── Integrations ───────────────────────────────────────────────────────── */
.hfl-integrations {
  padding: 3.5rem 2rem; background: white;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.hfl-integrations h3 {
  text-align: center; font-size: 0.75rem; font-weight: 600;
  color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.1em;
  margin: 0 0 2rem;
}
.hfl-integ-logos {
  display: flex; align-items: center; justify-content: center;
  gap: 3rem; flex-wrap: wrap; max-width: 900px; margin: 0 auto;
}
.hfl-integ-logo {
  font-size: 0.84rem; font-weight: 700; color: #B0B8C8;
  white-space: nowrap; letter-spacing: 0.02em;
  transition: color 0.15s;
}
.hfl-integ-logo:hover { color: #6B7280; }

/* ── Pricing ────────────────────────────────────────────────────────────── */
.hfl-pricing {
  padding: 7rem 3rem; background: #FAFAFA;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.hfl-pricing-header { text-align: center; margin-bottom: 3.5rem; }
.hfl-pricing-header h2 {
  font-size: clamp(1.5rem, 2.5vw, 2rem); font-weight: 700;
  color: var(--navy); margin: 0 0 0.625rem; letter-spacing: -0.02em;
}
.hfl-pricing-header p { font-size: 0.9375rem; color: var(--muted); margin: 0; }
.hfl-pricing-grid {
  display: grid; grid-template-columns: repeat(5, 1fr);
  gap: 1rem; max-width: 1200px; margin: 0 auto 2rem;
  align-items: start;
}
.hfl-plan-card {
  background: white; border: 1.5px solid rgba(0,0,0,0.07);
  border-radius: var(--r-lg); padding: 1.5rem 1.25rem;
  position: relative; box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s;
}
.hfl-plan-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.hfl-plan-card.hfl-plan-featured {
  border-color: var(--orange);
  box-shadow: 0 0 0 3px rgba(235,66,3,0.08), var(--shadow-md);
  margin-top: -8px;
}
.hfl-plan-card.hfl-plan-featured:hover { transform: translateY(-4px); }
.hfl-plan-badge {
  position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
  font-size: 0.61rem; font-weight: 700; letter-spacing: 0.07em;
  text-transform: uppercase; color: white; background: var(--orange);
  padding: 3px 12px; border-radius: 100px; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(235,66,3,0.3);
}
.hfl-plan-tier          { font-size: 0.875rem; font-weight: 700; margin-bottom: 0.25rem; }
.hfl-plan-tier-teal     { color: var(--teal);   }
.hfl-plan-tier-orange   { color: var(--orange); }
.hfl-plan-tier-peach    { color: var(--peach);  }
.hfl-plan-sub   { font-size: 0.72rem; color: var(--muted); margin-bottom: 1rem; line-height: 1.4; }
.hfl-plan-price {
  font-size: 2.25rem; font-weight: 800; color: var(--navy);
  margin-bottom: 1rem; line-height: 1; letter-spacing: -0.03em;
}
.hfl-plan-price span { font-size: 0.875rem; font-weight: 500; color: var(--muted); }
.hfl-plan-features {
  list-style: none; padding: 0; margin: 0 0 1.25rem;
  display: flex; flex-direction: column; gap: 0.45rem;
}
.hfl-plan-features li {
  font-size: 0.76rem; color: var(--text);
  display: flex; align-items: flex-start; gap: 6px;
}
.hfl-plan-feat-check         { font-weight: 700; flex-shrink: 0; }
.hfl-plan-feat-check-teal    { color: var(--teal);   }
.hfl-plan-feat-check-orange  { color: var(--orange); }
.hfl-plan-cta {
  width: 100%; font-size: 0.84rem; font-weight: 600;
  padding: 0.65rem; border-radius: 8px; cursor: pointer; border: none;
  transition: opacity 0.15s, transform 0.12s;
}
.hfl-plan-cta:hover { opacity: 0.9; transform: translateY(-1px); }
.hfl-plan-cta-teal   { background: var(--teal);   color: white; }
.hfl-plan-cta-orange { background: var(--orange); color: white; }
.hfl-plan-cta-peach  { background: var(--peach);  color: white; }
.hfl-pricing-guarantee {
  text-align: center; font-size: 0.8rem; color: var(--muted);
  display: flex; align-items: center; justify-content: center; gap: 0.875rem;
}
.hfl-pricing-guarantee-sep { color: #D1D5DB; }

/* ── Footer ─────────────────────────────────────────────────────────────── */
.hfl-footer { background: var(--navy); padding: 1.75rem 3rem; }
.hfl-footer-inner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 2rem; max-width: 1200px; margin: 0 auto;
}
.hfl-footer-left { display: flex; align-items: flex-start; gap: 1rem; flex: 1; min-width: 0; }
.hfl-footer-icp-logo { flex-shrink: 0; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
.hfl-footer-icp-title { font-size: 0.875rem; font-weight: 700; color: white; margin-bottom: 3px; }
.hfl-footer-icp-sub   { font-size: 0.75rem; color: rgba(255,255,255,0.45); line-height: 1.5; }
.hfl-footer-quorum-center { text-align: center; flex-shrink: 0; }
.hfl-footer-quorum-center-title { font-size: 0.84rem; color: rgba(255,255,255,0.7); margin-bottom: 4px; }
.hfl-footer-quorum-center-code  { font-size: 0.8rem; color: rgba(255,255,255,0.45); }
.hfl-footer-quorum-code {
  font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em;
  color: #00CEC8; background: rgba(0,206,200,0.12);
  border: 1px solid rgba(0,206,200,0.3); padding: 1px 8px; border-radius: 4px;
}
.hfl-footer-btn {
  font-size: 0.82rem; font-weight: 600; color: white; background: none;
  border: 1.5px solid rgba(255,255,255,0.25);
  padding: 0.5625rem 1.25rem; border-radius: 8px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0; transition: border-color 0.15s;
}
.hfl-footer-btn:hover { border-color: rgba(255,255,255,0.5); }

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .hfl-pricing-grid   { grid-template-columns: repeat(3, 1fr); }
  .hfl-features-grid  { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  .hfl-nav { padding: 0 1.5rem; grid-template-columns: auto auto; }
  .hfl-nav-links { display: none; }
  .hfl-hamburger { display: flex; }
  .hfl-hero { grid-template-columns: 1fr; padding: 3.5rem 1.5rem 4rem; gap: 0; }
  .hfl-hero-left { max-width: 100%; }
  .hfl-hero-right { display: none; }
  .hfl-trust-pills { grid-template-columns: 1fr 1fr; }
  .hfl-roles-grid { grid-template-columns: 1fr; max-width: 480px; }
  .hfl-strip-inner { grid-template-columns: 1fr; }
  .hfl-strip-col { border-right: none; border-bottom: 1px solid rgba(0,0,0,0.06); }
  .hfl-strip-col:last-child { border-bottom: none; }
  .hfl-pricing-grid { grid-template-columns: repeat(2, 1fr); }
  .hfl-footer-inner { flex-direction: column; align-items: flex-start; }
  .hfl-footer-quorum-center { text-align: left; }
  .hfl-roles { padding: 4rem 1.5rem; }
  .hfl-features { padding: 4rem 1.5rem; }
  .hfl-pricing { padding: 4rem 1.5rem; }
}
@media (max-width: 580px) {
  .hfl-hero { padding: 2.5rem 1.25rem 3rem; }
  .hfl-pricing-grid { grid-template-columns: 1fr; }
  .hfl-features-grid { grid-template-columns: 1fr; }
  .hfl-trust-pills { grid-template-columns: 1fr; }
  .hfl-plan-card.hfl-plan-featured { margin-top: 0; }
}
`;
