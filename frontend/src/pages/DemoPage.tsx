import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
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

/* ─── Design Tokens ──────────────────────────────────────────────────────── */
const C = {
  blue:   "#2B34FF",
  yellow: "#FFD23F",
  coral:  "#FF5C39",
  ink:    "#0B0D1A",
  paper:  "#FCFCFD",
  muted:  "#6B7080",
  border: "#EDEEF2",
  white:  "#FFFFFF",
  blueFg: "#F3F4FF",
};
const F = {
  display: "'Bricolage Grotesque', 'Inter', sans-serif",
  body:    "'Hanken Grotesk', 'Inter', sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

/* ─── Shared style helpers ───────────────────────────────────────────────── */
const cardStyle: React.CSSProperties = {
  background: C.white, borderRadius: 20,
  boxShadow: "0 24px 60px rgba(11,13,26,0.13), 0 4px 16px rgba(11,13,26,0.06)",
  overflow: "hidden", position: "relative",
};
const cardHeaderStyle: React.CSSProperties = {
  background: C.ink, padding: "18px 22px",
  display: "flex", alignItems: "center", justifyContent: "space-between",
};
const cardTitleStyle: React.CSSProperties = {
  fontFamily: F.display, fontSize: 14, fontWeight: 700, color: C.white,
};
const cardSubStyle: React.CSSProperties = { fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 };
const cardBodyStyle: React.CSSProperties = { padding: "18px 22px" };
const listItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", background: C.blueFg, borderRadius: 10,
};
const listItemLStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500, color: C.ink,
};
const statStyle: React.CSSProperties = {
  flex: 1, background: C.blueFg, borderRadius: 10, padding: "12px 14px", textAlign: "center",
};
const statValStyle: React.CSSProperties = {
  fontFamily: F.display, fontSize: 24, fontWeight: 900, color: C.ink, lineHeight: 1,
};
const statLblStyle: React.CSSProperties = {
  fontSize: 10, color: C.muted, fontWeight: 600, marginTop: 4,
  textTransform: "uppercase", letterSpacing: "0.5px",
};
const bidCardStyle: React.CSSProperties = {
  border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8,
};
const avatarStyle: React.CSSProperties = {
  width: 48, height: 48, background: C.ink, borderRadius: 12,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: F.display, fontSize: 18, fontWeight: 900, color: C.white,
};
const notifGreen: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  padding: "12px 16px", borderRadius: 12, marginBottom: 8,
  background: C.blueFg,
};
const notifAmber: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  padding: "12px 16px", borderRadius: 12, marginBottom: 8,
  background: "#FFF8E6",
};

function chipStyle(v: "blue"|"amber"|"red"|"muted"): React.CSSProperties {
  const m = {
    blue:  { background: C.blueFg, color: C.blue },
    amber: { background: "#FFF8E6", color: "#FFB340" },
    red:   { background: "#FFECEA", color: C.coral },
    muted: { background: C.border, color: C.muted },
  };
  return { display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px",
    borderRadius:100, fontSize:11, fontWeight:600, fontFamily:F.mono, ...m[v] };
}

function aiActionStyle(v: "default"|"primary"|"cta"): React.CSSProperties {
  const m = {
    default: { background: "rgba(11,13,26,0.04)", border:`1px solid ${C.border}`, color: C.ink },
    primary: { background: C.blueFg, border:`1px solid rgba(43,52,255,0.25)`, color: C.blue },
    cta:     { background: C.blue, color: C.white, border:"none", justifyContent:"center" as const, fontSize:13 },
  };
  return {
    display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
    borderRadius:10, fontSize:12, fontWeight:600, cursor:"default", fontFamily:F.body, ...m[v],
  };
}

/* ─── Mock UI Components ─────────────────────────────────────────────────── */

function ScoreCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>124 Maple Street</div>
          <div style={cardSubStyle}>Homeowner Dashboard</div>
        </div>
        <div style={{ background:"rgba(43,52,255,0.22)", border:"1px solid rgba(43,52,255,0.4)", borderRadius:100, padding:"4px 12px", fontSize:11, fontWeight:700, color:"#B8BCFF" }}>
          Excellent
        </div>
      </div>
      <div style={{ ...cardBodyStyle, background: C.ink }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
          <div style={{ fontFamily:F.display, fontSize:52, fontWeight:900, color:C.blue, lineHeight:1 }}>91</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:1 }}>HomeGentic Score</div>
            <div style={{ height:6, background:"rgba(255,255,255,0.15)", borderRadius:100, marginTop:6, overflow:"hidden" }}>
              <div style={{ width:"91%", height:"100%", borderRadius:100, background:`linear-gradient(90deg, ${C.blue}, #8B91FF)` }} />
            </div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {[
            { label:"Maintenance", pct:94, color:C.blue },
            { label:"Systems",     pct:88, color:C.blue },
            { label:"Structure",   pct:96, color:C.blue },
            { label:"Docs",        pct:82, color:"#FFB340" },
          ].map((r) => (
            <div key={r.label} style={{ display:"flex", alignItems:"center", gap:10, fontSize:12 }}>
              <span style={{ color:"rgba(255,255,255,0.65)", width:80, flexShrink:0 }}>{r.label}</span>
              <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.12)", borderRadius:100, overflow:"hidden" }}>
                <div style={{ width:`${r.pct}%`, height:"100%", borderRadius:100, background:r.color }} />
              </div>
              <span style={{ color:C.white, fontWeight:600, width:28, textAlign:"right", flexShrink:0 }}>{r.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MaintenanceCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Predictive Maintenance</div>
          <div style={cardSubStyle}>4 upcoming tasks</div>
        </div>
        <span style={chipStyle("amber")}>2 urgent</span>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { icon:"🔥", label:"HVAC Filter Replacement", status:"Due in 3 days",  badge: chipStyle("red") },
            { icon:"💧", label:"Water Heater Flush",      status:"Due this month", badge: chipStyle("amber") },
            { icon:"🪟", label:"Gutter Cleaning",         status:"Oct 2025",       badge: chipStyle("amber") },
            { icon:"⚡", label:"Smoke Detector Test",     status:"Completed",      badge: chipStyle("blue") },
          ].map((item) => (
            <div key={item.label} style={listItemStyle}>
              <div style={listItemLStyle}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                {item.label}
              </div>
              <span style={item.badge}>{item.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JobHistoryCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Job History</div>
          <div style={cardSubStyle}>Verified records on-chain</div>
        </div>
        <span style={chipStyle("blue")}>12 verified</span>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          {[
            { dotBg:C.blueFg, dotColor:C.blue, icon:"✓", title:"Roof Replacement — GAF Timberline", meta:"Demetrius & Sons Roofing · Apr 2025 · $14,200" },
            { dotBg:C.blueFg, dotColor:C.blue, icon:"✓", title:"HVAC Full Replacement (Carrier 2-ton)", meta:"AirPro HVAC · Jan 2025 · $8,400" },
            { dotBg:"#FFF8E6", dotColor:"#FFB340", icon:"↑", title:"Kitchen Remodel — Phase 1", meta:"Self / DIY · Nov 2024 · $3,100" },
            { dotBg:C.border, dotColor:C.muted, icon:"○", title:"Plumbing — Water Heater Install", meta:"Riverdale Plumbing · Aug 2024 · $1,850" },
          ].map((item, idx, arr) => (
            <div key={item.title} style={{ display:"flex", gap:12, paddingBottom:14, position:"relative" }}>
              {idx < arr.length - 1 && (
                <div style={{ position:"absolute", left:12, top:26, bottom:0, width:1, background:C.border }} />
              )}
              <div style={{ flexShrink:0, width:25, height:25, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, marginTop:2, background:item.dotBg, color:item.dotColor }}>
                {item.icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>{item.title}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{item.meta}</div>
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
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Quote Request: Deck Refinishing</div>
          <div style={cardSubStyle}>3 bids received · Closing in 4 days</div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        {[
          { name:"ProDeck Solutions",  stars:"★★★★★", price:"$2,400", tags:["Insured","5-yr warranty"], highlight:true },
          { name:"Greenfield Outdoor", stars:"★★★★☆", price:"$2,890", tags:["Insured"],                 highlight:false },
          { name:"QuickCoat LLC",      stars:"★★★☆☆", price:"$1,950", tags:["2-yr warranty"],           highlight:false },
        ].map((bid) => (
          <div key={bid.name} style={{ ...bidCardStyle, ...(bid.highlight ? { borderColor:C.blue, background:C.blueFg } : {}) }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{bid.name}</div>
                <div style={{ color:"#F5C518", fontSize:13, letterSpacing:1 }}>{bid.stars}</div>
              </div>
              <div style={{ fontFamily:F.display, fontSize:18, fontWeight:900, color:C.blue }}>{bid.price}</div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {bid.tags.map((t) => <span key={t} style={chipStyle("blue")}>{t}</span>)}
              {bid.highlight && <span style={chipStyle("amber")}>Best value</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>HomeGentic Verified Report</div>
          <div style={cardSubStyle}>124 Maple Street · Generated Apr 2025</div>
        </div>
        <ShieldCheck size={22} color={C.blue} />
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          <div style={statStyle}><div style={statValStyle}>91</div><div style={statLblStyle}>Score</div></div>
          <div style={statStyle}><div style={statValStyle}>12</div><div style={statLblStyle}>Jobs</div></div>
          <div style={statStyle}><div style={statValStyle}>$41k</div><div style={statLblStyle}>Invested</div></div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {["Identity verified","Contractor licenses checked","Permit records matched","Photo documentation"].map((r) => (
            <div key={r} style={listItemStyle}>
              <div style={listItemLStyle}>{r}</div>
              <span style={{ fontSize:11, fontWeight:700, color:C.blue }}>✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContractorLeadsCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Quote Requests Near You</div>
          <div style={cardSubStyle}>Plano, TX · 15-mi radius</div>
        </div>
        <span style={chipStyle("amber")}>7 new</span>
      </div>
      <div style={cardBodyStyle}>
        {[
          { title:"Roof Inspection",  area:"Allen, TX",    budget:"$300–600",  urgent:true  },
          { title:"HVAC Tune-Up",     area:"McKinney, TX", budget:"$150–300",  urgent:false },
          { title:"Deck Refinishing", area:"Frisco, TX",   budget:"$2k–4k",    urgent:false },
        ].map((lead) => (
          <div key={lead.title} style={bidCardStyle}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{lead.title}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{lead.area}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{lead.budget}</div>
                {lead.urgent && <span style={{ ...chipStyle("red"), marginTop:4 }}>Urgent</span>}
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
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Submit Bid: Roof Inspection</div>
          <div style={cardSubStyle}>124 Maple St · Posted 2h ago</div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { label:"Service type",    value:"Roof Inspection + Report" },
            { label:"Property size",   value:"2,200 sq ft · 2-story" },
            { label:"Homeowner score", value:"91 / 100 — Excellent payer" },
          ].map((r) => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ color:C.muted }}>{r.label}</span>
              <span style={{ fontWeight:600, color:C.ink }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:16, padding:"14px 16px", background:C.blueFg, borderRadius:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Your Bid</div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontFamily:F.display, fontSize:28, fontWeight:900, color:C.blue }}>$450</span>
            <span style={chipStyle("blue")}>Ready to submit</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractorProfileCard() {
  return (
    <div style={cardStyle}>
      <div style={{ ...cardHeaderStyle, background:C.white, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={avatarStyle}>DS</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:C.ink }}>Demetrius &amp; Sons Roofing</div>
            <div style={{ color:"#F5C518", fontSize:13, letterSpacing:1 }}>★★★★★</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>4.9 · 127 reviews</div>
          </div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          <div style={statStyle}><div style={statValStyle}>127</div><div style={statLblStyle}>Reviews</div></div>
          <div style={statStyle}><div style={statValStyle}>4.9</div><div style={statLblStyle}>Rating</div></div>
          <div style={statStyle}><div style={statValStyle}>$2.1M</div><div style={statLblStyle}>Completed</div></div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {["License verified","Insurance on file","Background checked","Dual-sign jobs"].map((r) => (
            <div key={r} style={listItemStyle}>
              <div style={listItemLStyle}>{r}</div>
              <span style={{ fontSize:11, fontWeight:700, color:C.blue }}>✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContractorRecurringCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Recurring Contracts</div>
          <div style={cardSubStyle}>Active service agreements</div>
        </div>
        <span style={chipStyle("blue")}>8 active</span>
      </div>
      <div style={cardBodyStyle}>
        {[
          { icon:"❄️", name:"HVAC Bi-annual Tune-Up",  clients:3, revenue:"$1,350/yr" },
          { icon:"🐛", name:"Pest Control Quarterly",   clients:4, revenue:"$2,400/yr" },
          { icon:"🌿", name:"Landscaping Monthly",      clients:1, revenue:"$1,800/yr" },
        ].map((c) => (
          <div key={c.name} style={bidCardStyle}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={listItemLStyle}><span>{c.icon}</span>{c.name}</div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.blue }}>{c.revenue}</div>
                <div style={{ fontSize:11, color:C.muted }}>{c.clients} clients</div>
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
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Listing: 124 Maple Street</div>
          <div style={cardSubStyle}>$485,000 · Plano, TX</div>
        </div>
        <span style={chipStyle("blue")}>Score: 91</span>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ background:C.blueFg, border:`1px solid rgba(43,52,255,0.18)`, borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <ShieldCheck size={24} color={C.blue} />
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>HomeGentic Verified</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>12 jobs · $41k invested · All records verified</div>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { label:"Days on market",     value:"3 days" },
            { label:"Showings this week", value:"11" },
            { label:"Offers received",    value:"3" },
            { label:"Est. premium vs avg",value:"+$18,400" },
          ].map((r) => (
            <div key={r.label} style={listItemStyle}>
              <div style={listItemLStyle}>{r.label}</div>
              <span style={{ fontSize:12, fontWeight:700, color:C.ink }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentMarketplaceCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Agent Marketplace</div>
          <div style={cardSubStyle}>Plano, TX · 28 agents</div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        {[
          { initials:"SR", name:"Sarah R.", sales:"142 HomeGentic sales", rating:"4.9 ★", highlight:true },
          { initials:"JM", name:"James M.", sales:"98 HomeGentic sales",  rating:"4.8 ★", highlight:false },
          { initials:"TP", name:"Tanya P.", sales:"76 HomeGentic sales",  rating:"4.7 ★", highlight:false },
        ].map((agent) => (
          <div key={agent.name} style={{ ...bidCardStyle, ...(agent.highlight ? { borderColor:C.blue, background:C.blueFg } : {}) }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={listItemLStyle}>
                <div style={{ ...avatarStyle, width:36, height:36, fontSize:13 }}>{agent.initials}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{agent.name}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{agent.sales}</div>
                </div>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:C.blue }}>{agent.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketIntelCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>ROI-Ranked Renovations</div>
          <div style={cardSubStyle}>2024 Remodeling Cost vs Value</div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", flexDirection:"column" }}>
          {[
            { label:"Minor Kitchen Remodel", roi:96, cost:"$26k" },
            { label:"Fiber Cement Siding",   roi:88, cost:"$19k" },
            { label:"Garage Door Replace",   roi:94, cost:"$4.5k" },
            { label:"Window Replacement",    roi:68, cost:"$22k" },
          ].map((r) => (
            <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontSize:13, fontWeight:500, color:C.ink, display:"flex", alignItems:"center", gap:8 }}>
                <TrendingUp size={14} color={C.blue} />
                {r.label}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:80, height:5, background:C.border, borderRadius:100, overflow:"hidden" }}>
                  <div style={{ width:`${r.roi}%`, height:"100%", background:C.blue, borderRadius:100 }} />
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>{r.roi}%</span>
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
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>FSBO Opportunities</div>
          <div style={cardSubStyle}>Unrepresented sellers near you</div>
        </div>
        <span style={chipStyle("amber")}>5 new</span>
      </div>
      <div style={cardBodyStyle}>
        {[
          { addr:"412 Oak Lane",     score:87, price:"$512k", days:"Listed 2d ago" },
          { addr:"88 Birchwood Dr",  score:74, price:"$398k", days:"Listed 5d ago" },
          { addr:"270 Lakeview Ct",  score:91, price:"$625k", days:"Listed today" },
        ].map((listing) => (
          <div key={listing.addr} style={bidCardStyle}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{listing.addr}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{listing.days}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:14, fontWeight:900, fontFamily:F.display, color:C.ink }}>{listing.price}</div>
                <span style={{ ...chipStyle("blue"), marginTop:4 }}>Score {listing.score}</span>
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
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Delegated Access</div>
          <div style={cardSubStyle}>124 Maple St · Owner: Patricia H.</div>
        </div>
        <span style={chipStyle("blue")}>Manager</span>
      </div>
      <div style={cardBodyStyle}>
        <div style={notifGreen}>
          <div style={{ flexShrink:0, marginTop:1 }}><ShieldCheck size={16} color={C.blue} /></div>
          <div style={{ fontSize:12, lineHeight:1.5, color:C.ink }}>
            You have Manager access for this property. Your actions are logged and the owner is notified.
            <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>Access granted Apr 10, 2025</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:12 }}>
          {["Log maintenance jobs","Upload photos","Request quotes","No extra subscription"].map((r) => (
            <div key={r} style={listItemStyle}>
              <div style={listItemLStyle}>{r}</div>
              <span style={{ fontSize:11, fontWeight:700, color:C.blue }}>✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManagerJobCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Log Job — On Behalf of Owner</div>
          <div style={cardSubStyle}>124 Maple St · Patricia H.</div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {[
            { label:"Service type", value:"Plumbing — Leak Repair" },
            { label:"Contractor",   value:"Riverdale Plumbing" },
            { label:"Cost",         value:"$340" },
            { label:"Signed by",    value:"You + Contractor" },
          ].map((r) => (
            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ color:C.muted }}>{r.label}</span>
              <span style={{ fontWeight:600, color:C.ink }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:16, ...notifAmber }}>
          <div style={{ flexShrink:0, marginTop:1 }}><Bell size={14} color="#FFB340" /></div>
          <div style={{ fontSize:12, lineHeight:1.5, color:C.ink }}>
            Owner Patricia will be notified of this job log.
          </div>
        </div>
      </div>
    </div>
  );
}

function ManagerPhotoCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Photo Documentation</div>
          <div style={cardSubStyle}>Framing phase · 8 photos uploaded</div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, marginBottom:14 }}>
          {["🏗️","🔩","🪵","🧱","📐","🔧"].map((e, i) => (
            <div key={i} style={{ aspectRatio:"1", background:C.blueFg, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>
              {e}
            </div>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {["SHA-256 hash verified","Timestamp on-chain","Phase: Framing"].map((r) => (
            <div key={r} style={listItemStyle}>
              <div style={listItemLStyle}>{r}</div>
              <span style={{ fontSize:11, fontWeight:700, color:C.blue }}>✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManagerActivityCard() {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <div style={cardTitleStyle}>Owner Activity Feed</div>
          <div style={cardSubStyle}>Patricia sees all manager actions</div>
        </div>
      </div>
      <div style={cardBodyStyle}>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            { icon:<Wrench size={14} color={C.blue} />,         bg:notifGreen, msg:"Alex logged a job: Plumbing — Leak Repair ($340)",           time:"2h ago" },
            { icon:<Camera size={14} color={C.blue} />,         bg:notifGreen, msg:"Alex uploaded 8 framing photos for your property.",           time:"3h ago" },
            { icon:<ClipboardList size={14} color="#FFB340" />, bg:notifAmber, msg:"Alex requested a quote for Deck Refinishing.",                 time:"Yesterday" },
          ].map((n, i) => (
            <div key={i} style={n.bg}>
              <div style={{ flexShrink:0, marginTop:1 }}>{n.icon}</div>
              <div style={{ fontSize:12, lineHeight:1.5, color:C.ink }}>
                {n.msg}
                <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── AI Chat Card Components ────────────────────────────────────────────── */

function AIChatCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background:C.white, borderRadius:20, overflow:"hidden", boxShadow:"0 24px 60px rgba(11,13,26,0.10), 0 4px 16px rgba(11,13,26,0.05)" }}>
      <div style={{ padding:"16px 22px", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${C.border}`, background:"rgba(11,13,26,0.03)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", background:C.blueFg, border:`1px solid rgba(43,52,255,0.25)`, borderRadius:100, fontSize:11, fontWeight:700, color:C.blue, letterSpacing:"0.5px" }}>
          <Sparkles size={11} /> AI-Powered
        </div>
        <span style={{ fontSize:13, fontWeight:600, color:C.muted, marginLeft:"auto" }}>HomeGentic Assistant</span>
      </div>
      <div style={{ padding:"18px 20px", display:"flex", flexDirection:"column", gap:10 }}>{children}</div>
    </div>
  );
}

function AIBubble({ type, children }: { type:"user"|"ai"; children: React.ReactNode }) {
  const isUser = type === "user";
  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:6, fontFamily:F.mono, ...(isUser ? { color:C.muted, textAlign:"right" as const } : { color:C.blue }) }}>
        {isUser ? "You" : "HomeGentic AI"}
      </div>
      <div style={{ maxWidth:"88%", padding:"11px 15px", borderRadius:14, fontSize:13, lineHeight:1.55, ...(isUser ? { background:C.blue, color:"rgba(255,255,255,0.9)", alignSelf:"flex-end", borderBottomRightRadius:4, marginLeft:"auto" } : { background:C.blueFg, color:C.ink, borderBottomLeftRadius:4 }) }}>
        {children}
      </div>
    </div>
  );
}

function AIHomeownerCard() {
  return (
    <AIChatCard>
      <AIBubble type="user">"My AC is making a loud rattling noise and barely cooling the house. It's a 2018 Carrier unit."</AIBubble>
      <AIBubble type="ai">
        I found your HVAC record — a <strong>2018 Carrier 2-ton</strong>, now 7 years old and <strong>14 months since last service</strong> (overdue). Rattling + weak cooling typically means a loose fan blade or low refrigerant. Here's what I recommend:
      </AIBubble>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        <div style={aiActionStyle("default")}><span>📋</span> Log Job: HVAC Inspection &amp; Repair</div>
        <div style={aiActionStyle("primary")}><span>💬</span> Request Quotes — 3 vetted HVAC contractors nearby</div>
        <div style={aiActionStyle("cta")}>Start Hiring Process <ArrowRight size={13} style={{ marginLeft:6 }} /></div>
      </div>
    </AIChatCard>
  );
}

function AIAddRoomCard() {
  return (
    <AIChatCard>
      <AIBubble type="user">"Add a master bathroom to my property — tile floors, Alabaster white paint by Sherwin-Williams."</AIBubble>
      <AIBubble type="ai">
        Done — <strong>Master Bathroom</strong> has been added to <strong>412 Maple Drive</strong>. I've recorded <strong>tile floors</strong> and <strong>Alabaster White (SW 7008)</strong> by Sherwin-Williams. You can add fixtures like your vanity, toilet, or shower from the property page.
      </AIBubble>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        <div style={aiActionStyle("default")}><span>🚿</span> Add fixtures to Master Bathroom</div>
        <div style={aiActionStyle("primary")}><span>🏠</span> Add another room</div>
        <div style={aiActionStyle("cta")}>View Property Rooms <ArrowRight size={13} style={{ marginLeft:6 }} /></div>
      </div>
    </AIChatCard>
  );
}

function AIContractorCard() {
  return (
    <AIChatCard>
      <AIBubble type="ai">
        I analyzed this week's quote requests in your area. Based on your trade profile <strong>(HVAC · Plano, TX)</strong>, here are your 3 best-match leads — ranked by your historical win rate:
      </AIBubble>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {[
          { label:"HVAC Tune-Up · McKinney, TX", match:"94% match", icon:"❄️" },
          { label:"AC Repair · Frisco, TX",       match:"89% match", icon:"🔧" },
          { label:"HVAC Replacement · Allen, TX", match:"81% match", icon:"⚡" },
        ].map((l) => (
          <div key={l.label} style={{ ...aiActionStyle("default"), justifyContent:"space-between" }}>
            <span style={{ display:"flex", alignItems:"center", gap:8 }}><span>{l.icon}</span>{l.label}</span>
            <span style={{ color:C.blue, fontWeight:700, fontSize:11 }}>{l.match}</span>
          </div>
        ))}
        <div style={aiActionStyle("cta")}>View Leads &amp; Submit Bids <ArrowRight size={13} style={{ marginLeft:6 }} /></div>
      </div>
      <div style={{ maxWidth:"88%", padding:"11px 15px", borderRadius:14, fontSize:12, lineHeight:1.55, background:C.blueFg, color:C.ink, borderBottomLeftRadius:4 }}>
        Your bid win rate on HVAC repairs is <strong>71%</strong>. Suggested price range: <strong>$380–$520</strong>.
      </div>
    </AIChatCard>
  );
}

function AIRealtorCard() {
  return (
    <AIChatCard>
      <AIBubble type="user">"I have a new listing at 412 Oak Lane. HomeGentic Score is 74."</AIBubble>
      <AIBubble type="ai">
        I analyzed 412 Oak Lane against current comps. A score of <strong>74 is below the 82 neighborhood average</strong>. Three targeted improvements could add an estimated <strong>$22,400 to the sale price</strong>:
      </AIBubble>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        <div style={aiActionStyle("default")}><span>🚪</span> Garage door replacement — <strong style={{ color:C.blue }}>94% ROI</strong> · ~$4,500</div>
        <div style={aiActionStyle("default")}><span>🏚️</span> Fiber cement siding — <strong style={{ color:C.blue }}>88% ROI</strong> · ~$19,000</div>
        <div style={aiActionStyle("default")}><span>🪟</span> Window caulking &amp; seal — quick win, low cost</div>
        <div style={aiActionStyle("cta")}>Create Seller Improvement Plan <ArrowRight size={13} style={{ marginLeft:6 }} /></div>
      </div>
    </AIChatCard>
  );
}

function AIManagerCard() {
  return (
    <AIChatCard>
      <AIBubble type="user">"Mom's HVAC hasn't been serviced since we moved her in — that was over a year ago."</AIBubble>
      <AIBubble type="ai">
        I checked Patricia's maintenance records. The HVAC is <strong>7 years old</strong> and overdue by <strong>2 months</strong>. I've drafted a service request under her Pro-tier account — no cost to you:
      </AIBubble>
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        <div style={aiActionStyle("primary")}><span>✓</span> Job drafted: HVAC Bi-annual Tune-Up</div>
        <div style={aiActionStyle("primary")}><span>✓</span> 3 contractors pre-qualified in Patricia's area</div>
        <div style={aiActionStyle("primary")}><span>✓</span> Patricia will be notified before anything is hired</div>
        <div style={aiActionStyle("cta")}>Submit for Owner Approval <ArrowRight size={13} style={{ marginLeft:6 }} /></div>
      </div>
    </AIChatCard>
  );
}

/* ─── Slide Definitions ──────────────────────────────────────────────────── */

const HOMEOWNER_SLIDES: Slide[] = [
  { icon:<Sparkles size={26} />, title:"Describe Any Issue — AI Handles the Rest",   subtitle:"AI-Powered Home Assistant",   mockup:<AIHomeownerCard /> },
  { icon:<Home size={26} />,     title:"Add Rooms by Just Asking",                   subtitle:"AI Room & Fixture Tracking",  mockup:<AIAddRoomCard /> },
  { icon:<TrendingUp size={26}/>,title:"Your Home Has a Credit Score — Know It",     subtitle:"The HomeGentic Score",        mockup:<ScoreCard /> },
  { icon:<CalendarDays size={26}/>,title:"Never Miss a Maintenance Deadline Again",  subtitle:"Predictive Maintenance Engine",mockup:<MaintenanceCard /> },
  { icon:<ClipboardList size={26}/>,title:"Every Job. Verified. On-Chain.",          subtitle:"Immutable Job History",       mockup:<JobHistoryCard /> },
  { icon:<MessageSquare size={26}/>,title:"Get Competing Bids from Vetted Contractors",subtitle:"Quote Marketplace",        mockup:<QuoteCard /> },
  { icon:<FileText size={26} />, title:"Prove Your Home's Value at Closing",         subtitle:"Verified Property Report",    mockup:<ReportCard /> },
];

const CONTRACTOR_SLIDES: Slide[] = [
  { icon:<Zap size={26} />,      title:"Qualified Leads, Delivered to You",          subtitle:"Local Quote Requests",        mockup:<ContractorLeadsCard /> },
  { icon:<Sparkles size={26} />, title:"AI Finds Your Best Leads — Before You Even Look", subtitle:"AI Lead Matching",      mockup:<AIContractorCard /> },
  { icon:<ClipboardList size={26}/>,title:"Submit Bids in Under 60 Seconds",         subtitle:"Fast Bid Submission",        mockup:<ContractorBidCard /> },
  { icon:<Star size={26} />,     title:"Build a Trust Score That Wins More Work",    subtitle:"Verified Contractor Profile", mockup:<ContractorProfileCard /> },
  { icon:<CalendarDays size={26}/>,title:"Lock In Predictable Recurring Revenue",    subtitle:"Service Contract Engine",    mockup:<ContractorRecurringCard /> },
];

const REALTOR_SLIDES: Slide[] = [
  { icon:<ShieldCheck size={26}/>,title:"List Properties with a Verified Score Badge",subtitle:"HomeGentic on Listings",     mockup:<RealtorScoreCard /> },
  { icon:<Sparkles size={26} />, title:"AI Turns a Low Score Into a Higher Sale Price",subtitle:"AI Listing Advisor",       mockup:<AIRealtorCard /> },
  { icon:<Users size={26} />,    title:"Get Found by Sellers Who Need an Agent",     subtitle:"Agent Marketplace",          mockup:<AgentMarketplaceCard /> },
  { icon:<BarChart3 size={26} />,title:"Back Your Price with Data, Not Guesses",     subtitle:"ROI Market Intelligence",    mockup:<MarketIntelCard /> },
  { icon:<Building2 size={26} />,title:"Connect with FSBO Sellers Before They Sign", subtitle:"FSBO Lead Matching",        mockup:<FsboCard /> },
];

const MANAGER_SLIDES: Slide[] = [
  { icon:<ShieldCheck size={26}/>,title:"Manage a Parent's Home — No Extra Cost",    subtitle:"Delegated Access",           mockup:<ManagerInviteCard /> },
  { icon:<Sparkles size={26} />, title:"AI Schedules Maintenance — You Just Approve",subtitle:"AI Maintenance Concierge",  mockup:<AIManagerCard /> },
  { icon:<Wrench size={26} />,   title:"Log Jobs and Services on the Owner's Behalf",subtitle:"Manager Job Logging",       mockup:<ManagerJobCard /> },
  { icon:<Camera size={26} />,   title:"Document Every Phase with Tamper-Proof Photos",subtitle:"On-Chain Photo Records",  mockup:<ManagerPhotoCard /> },
  { icon:<Bell size={26} />,     title:"Owners Stay Informed — Every Action Notified",subtitle:"Real-Time Activity Feed",  mockup:<ManagerActivityCard /> },
];

const SLIDES_MAP: Record<Persona, Slide[]> = {
  homeowners:          HOMEOWNER_SLIDES,
  contractors:         CONTRACTOR_SLIDES,
  realtors:            REALTOR_SLIDES,
  "property-managers": MANAGER_SLIDES,
};

const PERSONA_META: Record<Persona, { label: string; icon: React.ReactNode; kicker: string; heading: React.ReactNode; desc: string }> = {
  homeowners: {
    label: "Homeowners", icon: <Home size={16} />, kicker: "For Homeowners",
    heading: <>Your home has a brain.<br /><em>Finally use it.</em></> as any,
    desc: "Tell our AI about any issue — it reads your home's full history, diagnoses the problem, logs the job, collects competing bids, and can start the hiring process without you filling out a single form.",
  },
  contractors: {
    label: "Contractors", icon: <Wrench size={16} />, kicker: "For Contractors",
    heading: <>Win more jobs.<br /><em>AI works the leads.</em></> as any,
    desc: "Our AI ranks incoming quote requests by your personal win rate, suggests competitive pricing, and surfaces only the leads most likely to convert — so you spend time working, not prospecting.",
  },
  realtors: {
    label: "Realtors", icon: <Building2 size={16} />, kicker: "For Realtors",
    heading: <>Close higher.<br /><em>AI does the prep work.</em></> as any,
    desc: "AI benchmarks every listing against neighborhood comps, generates a prioritized improvement plan with real ROI numbers, and helps you turn a mediocre score into a stronger selling position before day one.",
  },
  "property-managers": {
    label: "Property Managers", icon: <Users size={16} />, kicker: "For Property Managers",
    heading: <>Care for any home.<br /><em>AI handles the details.</em></> as any,
    desc: "Our AI monitors the property's maintenance schedule, drafts service requests, and finds pre-qualified contractors — you just review and approve. The owner stays in control of every decision.",
  },
};

const BULLET_MAP: Record<Persona, string[][]> = {
  homeowners: [
    ["Speak or type any issue in plain language","AI reads your home's full history before responding","Diagnoses the problem, drafts the job, finds contractors — in one conversation"],
    ["Score updates after every verified job","Track maintenance ROI over time","See how you compare to neighbors"],
    ["AI-powered seasonal task calendar","System lifespan estimates with alerts","Urgent tasks flagged automatically"],
    ["Dual-signature contractor verification","Photo evidence attached to every job","Immutable records nobody can edit"],
    ["Post a request in under 2 minutes","Contractors compete — you choose","Review bids, ratings, and warranties"],
    ["Share a secure link with any buyer","Score, jobs, and photos in one report","Increases buyer confidence at closing"],
  ],
  contractors: [
    ["Filtered by your trade and ZIP code","Homeowner score shows payment reliability","No cold calling — inbound only"],
    ["AI ranks leads by your personal win rate","Suggested price ranges based on similar jobs you've won","Spend less time prospecting, more time working"],
    ["Pre-filled job details from homeowner","Set your price and send","Dual-sign to add to your portfolio"],
    ["License and insurance verification badge","Reviews tied to verified jobs only","Score grows with every completed job"],
    ["HVAC, pest, landscaping and more","Auto-reminders for scheduled visits","Predictable ARR on top of project work"],
  ],
  realtors: [
    ["Score badge visible on every listing","Buyers trust verified history over seller claims","Shorter inspection negotiations"],
    ["AI benchmarks every listing against neighborhood comps","Prioritized improvement list with real ROI numbers","Turn a mediocre score into a stronger selling position before day one"],
    ["Ranked by HomeGentic transaction count","Profile synced to the homeowner portal","Direct leads from sellers in your area"],
    ["2024 Remodeling Magazine cost vs value data","Recommend renovations with real ROI","Help sellers prioritize before listing"],
    ["Be notified when FSBO listings go live","Score-ranked so you approach the right ones","Show buyers what they're actually getting"],
  ],
  "property-managers": [
    ["Owner sends an invite link — you claim access","Choose Viewer or Manager role","Works for parents, rental units, or estates"],
    ["AI monitors the property's maintenance schedule on your behalf","Drafts service requests and finds contractors — you just review","Owner stays in control; you do the work without the paperwork"],
    ["All jobs logged under the owner's property","Contractor verification still required","Owner's Pro/Premium tier applies — free for you"],
    ["SHA-256 hashed and timestamped","Tagged by construction phase","Accessible to owner at any time"],
    ["Every action generates a notification","Owner can revoke access instantly","Full audit log always available"],
  ],
};

const VALID_PERSONAS: Persona[] = ["homeowners", "contractors", "realtors", "property-managers"];

/* ─── Page Component ─────────────────────────────────────────────────────── */
export default function DemoPage() {
  const { persona: rawPersona } = useParams<{ persona?: string }>();
  const persona: Persona = (VALID_PERSONAS.includes(rawPersona as Persona) ? rawPersona : "homeowners") as Persona;

  const [step, setStep]       = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => { setStep(0); setAnimKey((k) => k + 1); }, [persona]);

  const slides  = SLIDES_MAP[persona];
  const meta    = PERSONA_META[persona];
  const bullets = BULLET_MAP[persona][step] ?? [];
  const slide   = slides[step];
  const isLast  = step === slides.length - 1;

  const pricingHref = (persona === "contractors" || persona === "realtors")
    ? `/for-pros#${persona === "contractors" ? "contractor-plans" : "realtor-plans"}`
    : "/pricing";

  function goTo(s: number) { setStep(s); setAnimKey((k) => k + 1); }

  return (
    <div style={{ background: C.paper, color: C.ink, fontFamily: F.body, minHeight: "100vh" }}>
      <Helmet>
        <title>See HomeGentic in Action — Interactive Demo</title>
        <meta name="description" content="Explore HomeGentic features for homeowners, contractors, realtors, and property managers." />
      </Helmet>

      {/* Keyframe animation via a minimal style tag */}
      <style>{`
        @keyframes dm-slideIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dm-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4);opacity:0.7} }
        .dm-slide-anim { animation: dm-slideIn .35s ease both; }
        @media (max-width: 860px) { .dm-slide-grid { grid-template-columns: 1fr !important; } .dm-nav-inner { padding: 0 24px !important; } .dm-hero-section { padding: 90px 24px 0 !important; } .dm-cta-ghost { display: none !important; } }
        @media (max-width: 560px) { .dm-step-pill { padding: 7px 14px !important; font-size: 12px !important; } }
      `}</style>

      {/* Nav */}
      <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 56px", height:70, background:"rgba(252,252,253,0.96)", backdropFilter:"blur(16px)", borderBottom:`1px solid ${C.border}` }} className="dm-nav-inner">
        <Link to="/" style={{ fontFamily:F.display, fontSize:22, fontWeight:800, color:C.ink, textDecoration:"none", letterSpacing:"-0.5px" }}>
          Home<span style={{ color:C.yellow }}>Gentic</span>
        </Link>
        <Link to="/" style={{ display:"flex", alignItems:"center", gap:6, fontSize:14, fontWeight:500, color:C.muted, textDecoration:"none", padding:"8px 14px", borderRadius:8 }}>
          <ChevronLeft size={15} /> Back to HomeGentic
        </Link>
        <Link to={pricingHref} style={{ background:C.blue, color:C.white, padding:"10px 22px", borderRadius:100, fontSize:14, fontWeight:600, border:"none", cursor:"pointer", fontFamily:F.body, textDecoration:"none", display:"flex", alignItems:"center", gap:6, boxShadow:"0 4px 18px rgba(43,52,255,0.28)" }}>
          Get Started <ArrowRight size={15} />
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop:110, paddingBottom:0, textAlign:"center", maxWidth:760, margin:"0 auto", padding:"110px 56px 0" }} className="dm-hero-section">
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:C.blueFg, color:C.blue, padding:"6px 16px", borderRadius:100, fontSize:13, fontWeight:600, marginBottom:24, border:`1px solid rgba(43,52,255,0.15)`, fontFamily:F.mono }}>
          <div style={{ width:7, height:7, background:C.blue, borderRadius:"50%", animation:"dm-pulse 2s infinite" }} />
          Interactive Demo
        </div>
        <h1 style={{ fontFamily:F.display, fontSize:"clamp(38px, 5vw, 62px)", fontWeight:800, lineHeight:1.05, letterSpacing:"-2px", marginBottom:18, color:C.ink }}>
          See Home<span style={{ color:C.yellow }}>Gentic</span><br />
          <em style={{ fontStyle:"italic", color:C.blue, fontWeight:800 }}>in action.</em>
        </h1>
      </section>

      {/* Persona Tabs */}
      <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap", padding:"32px 24px 48px" }}>
        {VALID_PERSONAS.map((p) => {
          const m = PERSONA_META[p];
          const isActive = p === persona;
          return (
            <Link
              key={p}
              to={`/demo/${p}`}
              style={{
                display:"flex", alignItems:"center", gap:8, padding:"12px 22px", borderRadius:100,
                fontSize:14, fontWeight:600, cursor:"pointer", textDecoration:"none", transition:"all .2s",
                fontFamily:F.body,
                ...(isActive
                  ? { background:C.blue, color:C.white, border:`2px solid ${C.blue}` }
                  : { background:C.white, color:C.muted, border:`2px solid ${C.border}` }),
              }}
            >
              {m.icon} {m.label}
            </Link>
          );
        })}
      </div>

      {/* Slide Area */}
      <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 24px 80px" }}>
        {/* Step pills */}
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:40, flexWrap:"wrap" }}>
          {slides.map((s, i) => {
            const isDone   = i < step;
            const isActive = i === step;
            return (
              <button
                key={i}
                className="dm-step-pill"
                onClick={() => goTo(i)}
                style={{
                  display:"flex", alignItems:"center", gap:8, padding:"8px 18px",
                  borderRadius:100, fontSize:13, fontWeight:600, cursor:"pointer",
                  border:"none", fontFamily:F.body, transition:"all .2s",
                  ...(isActive ? { background:C.blue, color:C.white }
                    : isDone ? { background:C.blueFg, color:C.blue }
                    : { background:C.border, color:C.muted }),
                }}
              >
                {isDone && <span style={{ width:6, height:6, borderRadius:"50%", background:"currentColor", flexShrink:0, display:"inline-block" }} />}
                {i + 1}. {s.subtitle}
              </button>
            );
          })}
        </div>

        {/* Main slide */}
        <div key={animKey} className="dm-slide-anim dm-slide-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:48, alignItems:"center" }}>
          {/* Left: copy */}
          <div>
            <div style={{ fontFamily:F.display, fontSize:64, fontWeight:800, color:`rgba(11,13,26,0.05)`, lineHeight:1, marginBottom:-12 }}>
              0{step + 1}
            </div>
            <div style={{ width:52, height:52, background:C.blueFg, borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", color:C.blue, marginBottom:18 }}>
              {slide.icon}
            </div>
            <h3 style={{ fontFamily:F.display, fontSize:"clamp(22px, 2.5vw, 32px)", fontWeight:800, letterSpacing:"-0.7px", color:C.ink, marginBottom:14, lineHeight:1.15 }}>
              {slide.title}
            </h3>
            <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:10 }}>
              {bullets.map((b) => (
                <div key={b} style={{ display:"flex", alignItems:"flex-start", gap:10, fontSize:14, color:C.muted }}>
                  <div style={{ flexShrink:0, width:20, height:20, background:C.blueFg, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", color:C.blue, marginTop:1 }}>
                    <Check size={11} />
                  </div>
                  {b}
                </div>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:32, flexWrap:"wrap" }}>
              {step > 0 && (
                <button
                  onClick={() => goTo(step - 1)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"11px 22px", borderRadius:100, fontSize:14, fontWeight:600, background:C.white, border:`2px solid ${C.border}`, color:C.muted, cursor:"pointer", fontFamily:F.body }}
                >
                  <ChevronLeft size={15} /> Previous
                </button>
              )}
              {!isLast ? (
                <button
                  onClick={() => goTo(step + 1)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"12px 26px", borderRadius:100, fontSize:14, fontWeight:700, background:C.blue, border:"none", color:C.white, cursor:"pointer", fontFamily:F.body, boxShadow:"0 4px 18px rgba(43,52,255,0.28)" }}
                >
                  Next: {slides[step + 1].subtitle} <ChevronRight size={15} />
                </button>
              ) : (
                <Link
                  to={pricingHref}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"12px 26px", borderRadius:100, fontSize:14, fontWeight:700, background:C.yellow, color:C.ink, textDecoration:"none", fontFamily:F.body, boxShadow:"0 4px 18px rgba(255,210,63,0.35)" }}
                >
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
      <div style={{ background:C.ink, padding:"72px 56px", textAlign:"center", marginTop:48 }}>
        <div style={{ fontFamily:F.mono, fontSize:"0.65rem", letterSpacing:"0.12em", textTransform:"uppercase", color:C.yellow, marginBottom:16 }}>
          Start Today
        </div>
        <h2 style={{ fontFamily:F.display, fontSize:"clamp(28px, 4vw, 48px)", fontWeight:800, color:C.white, letterSpacing:"-1.5px", marginBottom:16, lineHeight:1.1 }}>
          Ready to own your<br />
          <em style={{ fontStyle:"italic", color:C.yellow }}>home's story?</em>
        </h2>
        <p style={{ fontSize:17, color:"rgba(255,255,255,0.65)", marginBottom:36 }}>
          Plans start at $10/mo. See pricing for the tier that fits your needs.
        </p>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, flexWrap:"wrap" }}>
          <Link to={pricingHref} style={{ display:"inline-flex", alignItems:"center", gap:8, background:C.blue, color:C.white, padding:"17px 38px", borderRadius:100, fontSize:16, fontWeight:700, border:"none", cursor:"pointer", fontFamily:F.body, textDecoration:"none", boxShadow:"0 4px 18px rgba(43,52,255,0.35)" }}>
            <Play size={16} /> Get Started
          </Link>
          <Link to={pricingHref} className="dm-cta-ghost" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"transparent", color:C.white, padding:"17px 30px", borderRadius:100, fontSize:16, fontWeight:600, border:"2px solid rgba(255,255,255,0.25)", cursor:"pointer", fontFamily:F.body, textDecoration:"none" }}>
            View Pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
