export const CSS = `
/* ── Reset / Variables ──────────────────────────────────────────────────── */
.hfl { --lp-navy:#0F172A; --lp-text:#1E293B; --lp-muted:#64748B;
  --lp-rule:#E2E8F0; --lp-light:#F8FAFC; --lp-green:#16A34A;
  --lp-blue:#2563EB; --lp-white:#FFFFFF;
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
  text-decoration:none; display:flex; align-items:center; gap:6px;
  flex-shrink:0;
}
.hfl-logo span { color:var(--lp-green); }
.hfl-nav-links {
  display:flex; align-items:center; gap:0; list-style:none;
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
  padding:0.45rem 1rem; border-radius:6px; cursor:pointer;
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
  transition:transform 0.2s, opacity 0.2s;
}

/* ── Hero ───────────────────────────────────────────────────────────────── */
.hfl-hero {
  display:grid; grid-template-columns:1fr 1fr;
  align-items:center; gap:3rem;
  padding:4rem 2rem 3rem; max-width:1160px; margin:0 auto;
}
.hfl-hero-badge {
  display:inline-flex; align-items:center; gap:6px;
  font-size:0.65rem; font-weight:700; letter-spacing:0.1em;
  text-transform:uppercase; color:#1E40AF;
  background:#EFF6FF; border:1px solid #BFDBFE;
  padding:4px 12px; border-radius:100px; margin-bottom:1.25rem;
}
.hfl-hero h1 {
  font-size:clamp(2rem,4vw,2.75rem); font-weight:800; line-height:1.15;
  color:var(--lp-navy); margin:0 0 1rem;
}
.hfl-hero h1 .green { color:var(--lp-green); }
.hfl-hero p {
  font-size:1rem; color:var(--lp-muted); line-height:1.7;
  max-width:480px; margin:0 0 1.75rem;
}
.hfl-actions {
  display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;
}
.hfl-btn-main {
  font-size:0.9rem; font-weight:600; color:white;
  background:var(--lp-blue); border:none;
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
.hfl-hero-img-wrap {
  border-radius:12px; overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,0.12);
}
.hfl-hero-img { display:block; width:100%; height:auto; }

/* ── Trust Badges ───────────────────────────────────────────────────────── */
.hfl-trust {
  background:var(--lp-light); border-top:1px solid var(--lp-rule);
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
  width:36px; height:36px; border-radius:8px;
  display:flex; align-items:center; justify-content:center;
  font-size:1.1rem; flex-shrink:0;
}
.hfl-trust-text-title {
  font-size:0.82rem; font-weight:700; color:var(--lp-navy); margin-bottom:2px;
}
.hfl-trust-text-sub {
  font-size:0.74rem; color:var(--lp-muted); line-height:1.5;
}

/* ── Roles ──────────────────────────────────────────────────────────────── */
.hfl-roles { padding:4rem 2rem; background:var(--lp-white); }
.hfl-section-header { text-align:center; margin-bottom:2.5rem; }
.hfl-section-header h2 {
  font-size:clamp(1.4rem,3vw,1.85rem); font-weight:700;
  color:var(--lp-navy); margin:0;
}
.hfl-roles-grid {
  display:grid; grid-template-columns:repeat(3,1fr);
  gap:1.5rem; max-width:960px; margin:0 auto;
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
  font-size:0.95rem; font-weight:700; color:var(--lp-navy); margin-bottom:0.5rem;
}
.hfl-role-desc {
  font-size:0.82rem; color:var(--lp-muted); line-height:1.6; margin-bottom:0.875rem;
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
}
.hfl-feat-icon {
  width:38px; height:38px; border-radius:8px;
  display:flex; align-items:center; justify-content:center;
  font-size:1.1rem; margin-bottom:0.75rem;
}
.hfl-feat-title {
  font-size:0.85rem; font-weight:700; color:var(--lp-navy); margin-bottom:0.35rem;
}
.hfl-feat-desc { font-size:0.75rem; color:var(--lp-muted); line-height:1.55; }

/* ── Trust Strip ────────────────────────────────────────────────────────── */
.hfl-strip {
  background:var(--lp-light);
  border-top:1px solid var(--lp-rule); border-bottom:1px solid var(--lp-rule);
  padding:0;
}
.hfl-strip-inner {
  display:grid; grid-template-columns:repeat(3,1fr);
  max-width:960px; margin:0 auto;
}
.hfl-strip-col {
  display:flex; align-items:flex-start; gap:0.875rem;
  padding:1.5rem; border-right:1px solid var(--lp-rule);
}
.hfl-strip-col:last-child { border-right:none; }
.hfl-strip-logo {
  width:40px; height:40px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center; font-size:1.4rem;
}
.hfl-strip-title {
  font-size:0.82rem; font-weight:700; color:var(--lp-navy); margin-bottom:0.3rem;
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
  color:var(--lp-green); background:#F0FDF4; border:1px solid #BBF7D0;
  padding:2px 8px; border-radius:4px; margin-top:3px;
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
  font-size:0.82rem; font-weight:700; color:#94A3B8; white-space:nowrap;
}

/* ── Pricing ────────────────────────────────────────────────────────────── */
.hfl-pricing { padding:5rem 2rem; background:var(--lp-white); }
.hfl-pricing-header { text-align:center; margin-bottom:3rem; }
.hfl-pricing-header h2 {
  font-size:clamp(1.4rem,3vw,1.85rem); font-weight:700;
  color:var(--lp-navy); margin:0 0 0.5rem;
}
.hfl-pricing-header p { font-size:0.9rem; color:var(--lp-muted); margin:0; }
.hfl-pricing-grid {
  display:grid; grid-template-columns:repeat(5,1fr);
  gap:1rem; max-width:1160px; margin:0 auto 1.25rem;
}
.hfl-plan-card {
  border:1.5px solid var(--lp-rule); border-radius:10px;
  padding:1.5rem 1.25rem; position:relative;
}
.hfl-plan-card.hfl-plan-featured {
  border-color:var(--lp-blue); box-shadow:0 0 0 3px rgba(37,99,235,0.1);
}
.hfl-plan-badge {
  position:absolute; top:-12px; left:50%; transform:translateX(-50%);
  font-size:0.62rem; font-weight:700; letter-spacing:0.06em;
  text-transform:uppercase; color:white; background:var(--lp-blue);
  padding:3px 10px; border-radius:100px; white-space:nowrap;
}
.hfl-plan-tier {
  font-size:0.78rem; font-weight:700; color:var(--lp-blue);
  text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.25rem;
}
.hfl-plan-sub { font-size:0.72rem; color:var(--lp-muted); margin-bottom:0.875rem; }
.hfl-plan-price {
  font-size:1.75rem; font-weight:800; color:var(--lp-navy);
  margin-bottom:0.25rem; line-height:1;
}
.hfl-plan-price span { font-size:0.9rem; font-weight:500; color:var(--lp-muted); }
.hfl-plan-features {
  list-style:none; padding:0; margin:0.875rem 0 1.25rem;
  display:flex; flex-direction:column; gap:0.4rem;
}
.hfl-plan-features li {
  font-size:0.75rem; color:var(--lp-text);
  display:flex; align-items:flex-start; gap:5px;
}
.hfl-plan-features li::before {
  content:"✓"; color:var(--lp-green); font-weight:700; flex-shrink:0;
}
.hfl-plan-cta {
  width:100%; font-size:0.8rem; font-weight:600;
  padding:0.55rem; border-radius:6px; cursor:pointer;
  border:1.5px solid var(--lp-rule); background:var(--lp-white); color:var(--lp-navy);
  transition:background 0.15s;
}
.hfl-plan-featured .hfl-plan-cta {
  background:var(--lp-blue); border-color:var(--lp-blue); color:white;
}
.hfl-plan-cta:hover { background:var(--lp-light); }
.hfl-plan-featured .hfl-plan-cta:hover { opacity:0.9; background:var(--lp-blue); }
.hfl-pricing-guarantee {
  text-align:center; font-size:0.8rem; color:var(--lp-muted);
  display:flex; align-items:center; justify-content:center; gap:0.4rem;
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
.hfl-footer { background:var(--lp-navy); padding:2rem; }
.hfl-footer-inner {
  display:flex; align-items:center; justify-content:space-between;
  gap:2rem; max-width:1160px; margin:0 auto; flex-wrap:wrap;
}
.hfl-footer-left { display:flex; align-items:flex-start; gap:1rem; }
.hfl-footer-icp-logo {
  font-size:1.75rem; color:white; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  width:40px; height:40px;
}
.hfl-footer-icp-title {
  font-size:0.82rem; font-weight:700; color:white; margin-bottom:2px;
}
.hfl-footer-icp-sub {
  font-size:0.72rem; color:rgba(255,255,255,0.5); line-height:1.5; margin-bottom:6px;
}
.hfl-footer-quorum { font-size:0.72rem; color:rgba(255,255,255,0.55); }
.hfl-footer-quorum-code {
  font-size:0.7rem; font-weight:700; letter-spacing:0.05em;
  color:#4ADE80; background:rgba(74,222,128,0.12);
  border:1px solid rgba(74,222,128,0.3);
  padding:1px 7px; border-radius:4px; margin-left:4px;
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
  .hfl-hero-img-wrap { display:none; }
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
