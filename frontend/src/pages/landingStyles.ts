export const CSS = `
/* ── Reset / Variables ──────────────────────────────────────────────────── */
.hfl { --lp-navy:#0F172A; --lp-text:#1E293B; --lp-muted:#64748B;
  --lp-rule:#E2E8F0; --lp-light:#FCEFC3; --lp-green:#00CEC8;
  --lp-blue:#EB4203; --lp-white:#FFFFFF;
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
  color:var(--lp-text); background:var(--lp-white);
}

/* ── Nav ────────────────────────────────────────────────────────────────── */
.hfl-nav {
  position:sticky; top:0; z-index:100;
  background:var(--lp-white); border-bottom:1px solid var(--lp-rule);
  display:flex; align-items:center; justify-content:space-between;
  padding:0 2rem; height:60px;
}
.hfl-logo {
  font-size:1.1rem; font-weight:800; color:var(--lp-navy);
  text-decoration:none; display:flex; align-items:center; gap:7px;
  flex-shrink:0;
}
.hfl-logo-text { color:var(--lp-navy); }
.hfl-logo-text span { color:var(--lp-green); }
.hfl-nav-links {
  display:flex; align-items:center; list-style:none;
  margin:0; padding:0;
}
.hfl-nav-links li a {
  font-size:0.82rem; font-weight:500; color:var(--lp-text);
  text-decoration:none; padding:0.5rem 0.75rem; cursor:pointer;
  white-space:nowrap; transition:color 0.15s;
}
.hfl-nav-links li a:hover { color:var(--lp-blue); }
.hfl-nav-actions {
  display:flex; align-items:center; gap:0.5rem; flex-shrink:0;
}
.hfl-nav-signin {
  font-size:0.82rem; font-weight:500; color:var(--lp-text);
  background:none; border:none; padding:0.4rem 0.75rem; cursor:pointer;
}
.hfl-nav-signin:hover { color:var(--lp-blue); }
.hfl-nav-pill {
  font-size:0.82rem; font-weight:600; color:white;
  background:var(--lp-blue); border:none;
  padding:0.45rem 1.1rem; border-radius:6px; cursor:pointer;
  transition:opacity 0.15s;
}
.hfl-nav-pill:hover { opacity:0.9; }
.hfl-hamburger {
  display:none; flex-direction:column; gap:4px; background:none;
  border:none; cursor:pointer; padding:6px;
}
.hfl-hamburger span {
  display:block; width:20px; height:2px;
  background:var(--lp-text); border-radius:2px;
}

/* ── Hero ───────────────────────────────────────────────────────────────── */
.hfl-hero {
  display:grid; grid-template-columns:2fr 3fr;
  align-items:center; gap:3rem;
  padding:4rem 2rem 3rem; max-width:1160px; margin:0 auto;
}
.hfl-hero-badge {
  display:inline-flex; align-items:center; gap:6px;
  font-size:0.65rem; font-weight:700; letter-spacing:0.08em;
  text-transform:uppercase; color:#00858F;
  background:#E0FAFA; border:1px solid #A0EDED;
  padding:4px 12px; border-radius:100px; margin-bottom:1.25rem;
}
.hfl-hero h1 {
  font-size:clamp(2rem,3.5vw,2.75rem); font-weight:800; line-height:1.15;
  color:var(--lp-navy); margin:0 0 1rem;
}
.hfl-hero h1 .green { color:var(--lp-blue); display:block; }
.hfl-hero p {
  font-size:0.95rem; color:var(--lp-muted); line-height:1.7;
  margin:0 0 1.75rem;
}
.hfl-actions {
  display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;
}
.hfl-btn-main {
  font-size:0.9rem; font-weight:600; color:white;
  background:var(--lp-green); border:none;
  padding:0.65rem 1.5rem; border-radius:8px; cursor:pointer;
  transition:opacity 0.15s;
}
.hfl-btn-main:hover { opacity:0.9; }
.hfl-btn-soft {
  font-size:0.9rem; font-weight:500; color:var(--lp-text);
  background:none; border:1.5px solid var(--lp-rule);
  padding:0.62rem 1.25rem; border-radius:8px; cursor:pointer;
  display:flex; align-items:center; gap:6px;
  transition:border-color 0.15s;
}
.hfl-btn-soft:hover { border-color:#94A3B8; }

/* ── Trust Badges ───────────────────────────────────────────────────────── */
.hfl-trust {
  background:var(--lp-white); border-top:1px solid var(--lp-rule);
  border-bottom:1px solid var(--lp-rule);
}
.hfl-trust-inner {
  display:grid; grid-template-columns:repeat(4,1fr);
  max-width:1160px; margin:0 auto;
}
.hfl-trust-item {
  display:flex; align-items:flex-start; gap:0.75rem;
  padding:1.25rem 1.5rem; border-right:1px solid var(--lp-rule);
}
.hfl-trust-item:last-child { border-right:none; }
.hfl-trust-icon {
  width:38px; height:38px; border-radius:8px;
  display:flex; align-items:center; justify-content:center;
  font-size:1.1rem; flex-shrink:0;
}
.hfl-trust-text-title {
  font-size:0.82rem; font-weight:700; color:var(--lp-navy); margin-bottom:2px;
}
.hfl-trust-text-sub {
  font-size:0.73rem; color:var(--lp-muted); line-height:1.5;
}

/* ── Roles ──────────────────────────────────────────────────────────────── */
.hfl-roles { padding:4rem 2rem; background:var(--lp-white); }
.hfl-section-header { text-align:center; margin-bottom:2.5rem; }
.hfl-section-header h2 {
  font-size:clamp(1.4rem,2.5vw,1.75rem); font-weight:700;
  color:var(--lp-navy); margin:0;
}
.hfl-roles-grid {
  display:grid; grid-template-columns:repeat(3,1fr);
  gap:1.25rem; max-width:960px; margin:0 auto;
}
.hfl-role-card {
  border:1px solid var(--lp-rule); border-radius:10px; padding:1.5rem;
}
.hfl-role-icon {
  width:44px; height:44px; border-radius:10px;
  display:flex; align-items:center; justify-content:center;
  font-size:1.3rem; margin-bottom:0.875rem;
}
.hfl-role-title {
  font-size:0.95rem; font-weight:700; color:var(--lp-navy); margin-bottom:0.4rem;
}
.hfl-role-desc {
  font-size:0.8rem; color:var(--lp-muted); line-height:1.6; margin-bottom:0.875rem;
}
.hfl-role-link {
  font-size:0.8rem; font-weight:600; color:var(--lp-blue);
  text-decoration:none; cursor:pointer; background:none; border:none; padding:0;
}
.hfl-role-link:hover { text-decoration:underline; }

/* ── Features Grid ──────────────────────────────────────────────────────── */
.hfl-features {
  padding:4rem 2rem; background:var(--lp-light);
  border-top:1px solid var(--lp-rule);
}
.hfl-features-grid {
  display:grid; grid-template-columns:repeat(4,1fr);
  gap:1rem; max-width:1160px; margin:0 auto;
}
.hfl-feat-card {
  background:var(--lp-white); border:1px solid var(--lp-rule);
  border-radius:10px; padding:1.25rem;
  display:flex; align-items:flex-start; gap:0.875rem;
}
.hfl-feat-icon {
  width:38px; height:38px; border-radius:8px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:1.1rem;
}
.hfl-feat-body { }
.hfl-feat-title {
  font-size:0.85rem; font-weight:700; color:var(--lp-navy); margin-bottom:0.3rem;
}
.hfl-feat-desc { font-size:0.75rem; color:var(--lp-muted); line-height:1.55; }

/* ── Trust Strip ────────────────────────────────────────────────────────── */
.hfl-strip {
  background:var(--lp-white);
  border-top:1px solid var(--lp-rule); border-bottom:1px solid var(--lp-rule);
}
.hfl-strip-inner {
  display:grid; grid-template-columns:repeat(3,1fr);
  max-width:960px; margin:0 auto;
}
.hfl-strip-col {
  display:flex; align-items:flex-start; gap:0.875rem;
  padding:1.5rem 2rem; border-right:1px solid var(--lp-rule);
}
.hfl-strip-col:last-child { border-right:none; }
.hfl-strip-logo {
  width:44px; height:44px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
}
.hfl-strip-title {
  font-size:0.85rem; font-weight:700; color:var(--lp-navy); margin-bottom:0.25rem;
}
.hfl-strip-desc {
  font-size:0.75rem; color:var(--lp-muted); line-height:1.55; margin-bottom:0.3rem;
}
.hfl-strip-link {
  font-size:0.75rem; font-weight:600; color:var(--lp-blue);
  background:none; border:none; padding:0; cursor:pointer;
}
.hfl-strip-link:hover { text-decoration:underline; }
.hfl-strip-code {
  display:inline-block; font-size:0.7rem; font-weight:700; letter-spacing:0.05em;
  color:var(--lp-green); background:#E0FAFA; border:1px solid #A0EDED;
  padding:2px 8px; border-radius:4px;
}

/* ── Integrations ───────────────────────────────────────────────────────── */
.hfl-integrations {
  padding:2.5rem 2rem; background:var(--lp-white);
  border-bottom:1px solid var(--lp-rule);
}
.hfl-integrations h3 {
  text-align:center; font-size:0.78rem; font-weight:600;
  color:var(--lp-muted); text-transform:uppercase; letter-spacing:0.08em;
  margin:0 0 1.5rem;
}
.hfl-integ-logos {
  display:flex; align-items:center; justify-content:center;
  gap:2.5rem; flex-wrap:wrap; max-width:900px; margin:0 auto;
}
.hfl-integ-logo {
  font-size:0.82rem; font-weight:700; color:#64748B; white-space:nowrap;
}

/* ── Pricing ────────────────────────────────────────────────────────────── */
.hfl-pricing { padding:5rem 2rem; background:var(--lp-white); }
.hfl-pricing-header { text-align:center; margin-bottom:2.5rem; }
.hfl-pricing-header h2 {
  font-size:clamp(1.4rem,2.5vw,1.75rem); font-weight:700;
  color:var(--lp-navy); margin:0 0 0.5rem;
}
.hfl-pricing-header p { font-size:0.875rem; color:var(--lp-muted); margin:0; }
.hfl-pricing-grid {
  display:grid; grid-template-columns:repeat(5,1fr);
  gap:1rem; max-width:1160px; margin:0 auto 1.5rem;
}
.hfl-plan-card {
  border:1.5px solid var(--lp-rule); border-radius:10px;
  padding:1.5rem 1.25rem; position:relative;
}
.hfl-plan-card.hfl-plan-featured {
  border-color:var(--lp-blue); box-shadow:0 0 0 3px rgba(235,66,3,0.1);
}
.hfl-plan-badge {
  position:absolute; top:-12px; left:50%; transform:translateX(-50%);
  font-size:0.62rem; font-weight:700; letter-spacing:0.06em;
  text-transform:uppercase; color:white; background:var(--lp-blue);
  padding:3px 10px; border-radius:100px; white-space:nowrap;
}
.hfl-plan-tier {
  font-size:0.85rem; font-weight:700; color:var(--lp-blue);
  margin-bottom:0.2rem;
}
.hfl-plan-sub { font-size:0.72rem; color:var(--lp-muted); margin-bottom:0.875rem; }
.hfl-plan-price {
  font-size:2rem; font-weight:800; color:var(--lp-navy);
  margin-bottom:0.875rem; line-height:1;
}
.hfl-plan-price span { font-size:0.9rem; font-weight:500; color:var(--lp-muted); }
.hfl-plan-features {
  list-style:none; padding:0; margin:0 0 1.25rem;
  display:flex; flex-direction:column; gap:0.4rem;
}
.hfl-plan-features li {
  font-size:0.75rem; color:var(--lp-text);
  display:flex; align-items:flex-start; gap:6px;
}
.hfl-plan-feat-check { color:var(--lp-green); font-weight:700; flex-shrink:0; }
.hfl-plan-cta {
  width:100%; font-size:0.82rem; font-weight:600;
  padding:0.6rem; border-radius:6px; cursor:pointer;
  border:1.5px solid var(--lp-rule); background:var(--lp-white); color:var(--lp-navy);
  transition:opacity 0.15s;
}
.hfl-plan-cta-green {
  background:var(--lp-green); border-color:var(--lp-green); color:white;
}
.hfl-plan-cta-green:hover { opacity:0.9; }
.hfl-plan-cta-blue {
  background:var(--lp-blue); border-color:var(--lp-blue); color:white;
}
.hfl-plan-cta-blue:hover { opacity:0.9; }
.hfl-pricing-guarantee {
  text-align:center; font-size:0.8rem; color:var(--lp-muted);
  display:flex; align-items:center; justify-content:center; gap:0.75rem;
}
.hfl-pricing-guarantee-sep { color:var(--lp-rule); }

/* ── Dashboard Mockup ───────────────────────────────────────────────────── */
.hfl-dm {
  background:white; border:1px solid #E2E8F0; border-radius:12px;
  overflow:hidden; width:100%;
  box-shadow:0 20px 60px rgba(0,0,0,0.14),0 4px 16px rgba(0,0,0,0.07);
  font-family:'Inter','Segoe UI',system-ui,sans-serif;
}
.hfl-dm-topbar {
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 14px; border-bottom:1px solid #F1F5F9; background:white;
}
.hfl-dm-topbar-logo {
  display:flex; align-items:center; gap:5px;
  font-size:12px; font-weight:800; color:#0F172A;
}
.hfl-dm-topbar-logo .green { color:#15803D; }
.hfl-dm-topbar-icons { display:flex; gap:8px; color:#94A3B8; font-size:14px; }
.hfl-dm-body { display:flex; }
.hfl-dm-sidebar {
  width:118px; flex-shrink:0; background:#F8FAFC;
  border-right:1px solid #F1F5F9; padding:8px 0;
}
.hfl-dm-nav {
  padding:5px 10px; font-size:9.5px; color:#64748B;
  display:flex; align-items:center; gap:5px;
  overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
}
.hfl-dm-nav-active {
  background:#E0FAFA; color:#00CEC8; font-weight:600;
  border-right:2px solid #00CEC8;
}
.hfl-dm-main { flex:1; padding:10px 12px; overflow:hidden; min-width:0; }
.hfl-dm-welcome { font-size:12px; font-weight:700; color:#0F172A; margin-bottom:8px; }
.hfl-dm-cards-row { display:flex; gap:8px; margin-bottom:8px; }
.hfl-dm-score-card,.hfl-dm-maint-card {
  flex:1; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:7px; padding:8px; min-width:0;
}
.hfl-dm-card-label { font-size:8.5px; color:#64748B; font-weight:600; margin-bottom:6px; }
.hfl-dm-score-wrap { display:flex; align-items:center; gap:8px; }
.hfl-dm-score-ring {
  width:42px; height:42px; border-radius:50%; flex-shrink:0;
  background:conic-gradient(#00CEC8 0% 82%,#E2E8F0 82% 100%);
  display:flex; align-items:center; justify-content:center; position:relative;
}
.hfl-dm-score-ring::before {
  content:""; position:absolute; inset:7px; border-radius:50%; background:#F8FAFC;
}
.hfl-dm-score-val { position:relative; z-index:1; font-size:13px; font-weight:800; color:#0F172A; }
.hfl-dm-score-delta { font-size:8px; color:#00CEC8; font-weight:600; }
.hfl-dm-score-sub { font-size:7px; color:#64748B; }
.hfl-dm-maint-nums { display:flex; gap:14px; padding-top:2px; }
.hfl-dm-maint-num { font-size:20px; font-weight:800; color:#0F172A; line-height:1; }
.hfl-dm-maint-lbl { font-size:7.5px; color:#64748B; margin-top:2px; }
.hfl-dm-stats-row { display:flex; gap:6px; margin-bottom:8px; }
.hfl-dm-stat {
  flex:1; background:#F8FAFC; border:1px solid #E2E8F0;
  border-radius:6px; padding:5px 6px; text-align:center; min-width:0;
}
.hfl-dm-stat-label { font-size:7px; color:#64748B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hfl-dm-stat-val { font-size:15px; font-weight:800; color:#0F172A; line-height:1.1; }
.hfl-dm-stat-link { font-size:7.5px; color:#EB4203; font-weight:600; }
.hfl-dm-activity-label {
  font-size:7.5px; font-weight:700; color:#64748B;
  text-transform:uppercase; letter-spacing:0.07em; margin-bottom:5px;
}
.hfl-dm-act-item {
  display:flex; align-items:flex-start; gap:6px;
  padding:4px 0; border-top:1px solid #F1F5F9;
}
.hfl-dm-act-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; margin-top:3px; }
.hfl-dm-act-dot-green  { background:#00CEC8; }
.hfl-dm-act-dot-blue   { background:#EB4203; }
.hfl-dm-act-dot-orange { background:#FF9C5F; }
.hfl-dm-act-body { flex:1; min-width:0; }
.hfl-dm-act-title { font-size:8.5px; font-weight:600; color:#1E293B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hfl-dm-act-sub   { font-size:7px; color:#64748B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hfl-dm-act-date  { font-size:7.5px; color:#64748B; flex-shrink:0; white-space:nowrap; }

/* ── Footer ─────────────────────────────────────────────────────────────── */
.hfl-footer { background:var(--lp-navy); padding:1.5rem 2rem; }
.hfl-footer-inner {
  display:flex; align-items:center; justify-content:space-between;
  gap:2rem; max-width:1160px; margin:0 auto;
}
.hfl-footer-left { display:flex; align-items:flex-start; gap:0.875rem; flex:1; min-width:0; }
.hfl-footer-icp-logo {
  font-size:2rem; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  width:44px; height:44px;
}
.hfl-footer-icp-title { font-size:0.85rem; font-weight:700; color:white; margin-bottom:3px; }
.hfl-footer-icp-sub   { font-size:0.72rem; color:rgba(255,255,255,0.5); line-height:1.5; }
.hfl-footer-quorum-center { text-align:center; flex-shrink:0; }
.hfl-footer-quorum-center-title { font-size:0.82rem; color:rgba(255,255,255,0.8); margin-bottom:3px; }
.hfl-footer-quorum-center-code  { font-size:0.78rem; color:rgba(255,255,255,0.5); }
.hfl-footer-quorum-code {
  font-size:0.75rem; font-weight:700; letter-spacing:0.05em;
  color:#00CEC8; background:rgba(0,206,200,0.12);
  border:1px solid rgba(0,206,200,0.3);
  padding:1px 7px; border-radius:4px;
}
.hfl-footer-btn {
  font-size:0.8rem; font-weight:600; color:white;
  background:none; border:1.5px solid rgba(255,255,255,0.3);
  padding:0.5rem 1.1rem; border-radius:6px; cursor:pointer;
  white-space:nowrap; transition:border-color 0.15s; flex-shrink:0;
}
.hfl-footer-btn:hover { border-color:rgba(255,255,255,0.6); }

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media(max-width:1024px){
  .hfl-pricing-grid { grid-template-columns:repeat(3,1fr); }
  .hfl-features-grid { grid-template-columns:repeat(2,1fr); }
}
@media(max-width:768px){
  .hfl-nav-links { display:none; }
  .hfl-hamburger { display:flex; }
  .hfl-hero { grid-template-columns:1fr; }
  .hfl-dm { display:none; }
  .hfl-trust-inner { grid-template-columns:repeat(2,1fr); }
  .hfl-trust-item:nth-child(2) { border-right:none; }
  .hfl-trust-item:nth-child(3) { border-top:1px solid var(--lp-rule); }
  .hfl-trust-item:nth-child(4) { border-top:1px solid var(--lp-rule); border-right:none; }
  .hfl-roles-grid { grid-template-columns:1fr; }
  .hfl-features-grid { grid-template-columns:repeat(2,1fr); }
  .hfl-strip-inner { grid-template-columns:1fr; }
  .hfl-strip-col { border-right:none; border-bottom:1px solid var(--lp-rule); }
  .hfl-strip-col:last-child { border-bottom:none; }
  .hfl-pricing-grid { grid-template-columns:1fr 1fr; }
  .hfl-footer-inner { flex-direction:column; align-items:flex-start; }
  .hfl-footer-quorum-center { text-align:left; }
}
@media(max-width:480px){
  .hfl-hero { padding:2.5rem 1rem 2rem; }
  .hfl-pricing-grid { grid-template-columns:1fr; }
  .hfl-trust-inner { grid-template-columns:1fr; }
  .hfl-trust-item { border-right:none; border-bottom:1px solid var(--lp-rule); }
  .hfl-trust-item:last-child { border-bottom:none; }
  .hfl-features-grid { grid-template-columns:1fr; }
  .hfl-nav { padding:0 1rem; }
  .hfl-integrations { padding:2rem 1rem; }
}
`;
