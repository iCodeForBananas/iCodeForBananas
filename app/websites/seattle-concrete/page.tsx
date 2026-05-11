"use client";

import React, { useState } from "react";
import {
  Truck, Building2, Home, Layers, Wrench, HardHat,
  MapPin, Phone, Mail, CheckCircle, Shield, Clock,
  Award, Users, ChevronRight, Star, BadgeCheck, Hammer,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const B = {
  // Backgrounds — warm near-blacks and concrete grays
  bg:       "#0e0d0c",
  bgCard:   "#181714",
  bgRaised: "#221f1c",
  bgWarm:   "#f6f3ee",   // warm concrete gray for light sections
  bgWarmDark: "#ece8e1",

  // Orange accent — reserved for CTAs and key data points only
  accent:      "#e85d0c",
  accentHover: "#bf4a09",
  accentGlow:  "rgba(232,93,12,0.18)",
  accentDim:   "rgba(232,93,12,0.10)",

  // Text on dark backgrounds
  textWhite: "#f3f0eb",
  textMuted: "#857f78",
  textFaint: "#524d48",

  // Text on light backgrounds
  textDark:  "#1a1714",
  textMid:   "#433f3a",
  textLite:  "#706a62",

  // Borders
  borderDark:  "rgba(255,255,255,0.07)",
  borderMid:   "rgba(255,255,255,0.12)",
  borderLight: "#ddd8cf",

  // Typography
  headFont: "'Barlow Condensed', 'Arial Narrow', 'Impact', sans-serif",
  bodyFont: "'Segoe UI', system-ui, -apple-system, sans-serif",

  white: "#ffffff",
};

// ── Grain texture SVG (data-URL) ──────────────────────────────────────────────
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E")`;

// ── Data ──────────────────────────────────────────────────────────────────────
const SERVICES = [
  { icon: HardHat,   title: "Asphalt Repair & Patching",      desc: "Hot mix patching, pothole repair, crack sealing, and preventive maintenance. Stop damage before it spreads." },
  { icon: Layers,    title: "Asphalt Overlays & Resurfacing",  desc: "Full surface overlays, resurfacing, and new asphalt installation. Driveways, parking lots, access roads." },
  { icon: Home,      title: "Concrete Flatwork",               desc: "Sidewalks, walkways, driveways, and slabs. Properly formed and properly placed." },
  { icon: Building2, title: "Curb & Gutter",                   desc: "New curb and gutter installation and replacement for residential and commercial properties." },
  { icon: Truck,     title: "Bulk Material Hauling",           desc: "Gravel, aggregate, soil, fill, asphalt, and debris. CDL-operated trucks, DOT-compliant." },
  { icon: Wrench,    title: "Site Prep & Excavation",          desc: "Grading, excavation, and subgrade preparation for asphalt and concrete work." },
];

const PORTFOLIO = [
  { img: "https://picsum.photos/seed/ccf-feature/900/560", caption: "Fife Industrial Park",      sub: "Asphalt Overlay · 2024", featured: true },
  { img: "https://picsum.photos/seed/ccf-2/600/380",       caption: "Tacoma Apartment Complex",  sub: "Asphalt Resurfacing · 2023" },
  { img: "https://picsum.photos/seed/ccf-3/600/380",       caption: "Auburn Retail Strip",        sub: "Curb, Gutter & Flatwork · 2022" },
  { img: "https://picsum.photos/seed/ccf-4/600/380",       caption: "Federal Way Commercial",     sub: "Driveway & Site Prep · 2021" },
  { img: "https://picsum.photos/seed/ccf-5/600/380",       caption: "Puyallup Subdivision",       sub: "Concrete Flatwork · 2020" },
];

const TEAM = [
  {
    photo: "https://i.pravatar.cc/160?img=47",
    name:  "Lisa Hargrove",
    title: "Owner & Founder",
    bio:   "Started Cascade after years running crews for larger contractors who didn't respect the work or the client. Runs every estimate personally. Woman-owned, locally rooted, bilingual.",
  },
  {
    photo: "https://i.pravatar.cc/160?img=26",
    name:  "Marco Delgado",
    title: "Field Supervisor",
    bio:   "10 years operating equipment and managing asphalt and concrete crews across Pierce and King counties. Fluent in English and Spanish — coordinates seamlessly across mixed crews.",
  },
  {
    photo: "https://i.pravatar.cc/160?img=67",
    name:  "Dave Kowalski",
    title: "Lead Equipment Operator",
    bio:   "CDL and DOT-certified. Runs the dump trucks and heavy equipment. If it hauls, grades, or excavates, Dave's on it.",
  },
];

const PROJECTS = [
  { year: "2024", name: "Fife Industrial Park — Parking Lot Overlay",      loc: "Fife, WA",          scope: "Full asphalt overlay, 22,000 sq ft, drainage repairs and line striping" },
  { year: "2023", name: "Tacoma Apartment Complex Resurfacing",             loc: "Tacoma, WA",        scope: "Asphalt resurfacing and hot-mix patching across a 3-building residential complex" },
  { year: "2023", name: "Pierce County Road Maintenance Contract",          loc: "Pierce County, WA", scope: "Ongoing hot-mix patching and pothole repair for county right-of-way maintenance" },
  { year: "2022", name: "Auburn Retail Strip — Curb & Flatwork",            loc: "Auburn, WA",        scope: "Curb and gutter replacement, ADA-compliant sidewalk installation, concrete slab work" },
  { year: "2022", name: "Base Aggregate Hauling — WSDOT Road Project",     loc: "King County, WA",   scope: "Bulk gravel and crushed base delivery for state highway improvement project" },
  { year: "2021", name: "Federal Way Commercial Driveway & Approach",       loc: "Federal Way, WA",   scope: "New asphalt driveway, concrete apron, and site grading for commercial property" },
  { year: "2020", name: "Puyallup Subdivision — Concrete Flatwork",         loc: "Puyallup, WA",      scope: "Driveways, walkways, and site prep concrete for 14-home residential development" },
];

const CERTS = [
  { icon: BadgeCheck, name: "WA Licensed Contractor",        detail: "License #CASCACF921BQ · Active" },
  { icon: BadgeCheck, name: "OR Licensed Contractor",        detail: "Oregon CCB License · Active" },
  { icon: Truck,      name: "CDL-Operated Equipment",        detail: "Commercial Driver's License · DOT compliant" },
  { icon: Shield,     name: "DOT Compliant Operations",      detail: "Federal & state transportation standards" },
  { icon: Award,      name: "Woman Minority-Owned Business", detail: "WMBE certified" },
  { icon: Users,      name: "Bilingual Crew",                detail: "English & Spanish · Se habla español" },
];

const STATS = [
  { value: "10+",   label: "Years in the Field",  sub: "Hands-on since day one" },
  { value: "WA·OR", label: "States Served",       sub: "Washington and Oregon" },
  { value: "200+",  label: "Projects Completed",  sub: "Asphalt, concrete & hauling" },
  { value: "48hr",  label: "Bid Turnaround",      sub: "Residential & commercial" },
];

const AREAS = [
  "Tacoma", "Lakewood", "Puyallup", "Federal Way", "Auburn",
  "Kent", "Renton", "Tukwila", "SeaTac", "Burien",
  "Fife", "Milton", "Sumner", "Bonney Lake", "Gig Harbor",
  "DuPont", "Olympia", "Covington", "Seattle", "Bellevue",
  "Portland, OR", "Vancouver, WA", "Salem, OR",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      color: B.accent, marginBottom: 10 }}>
      {children}
    </p>
  );
}

function SectionHead({ label, heading, sub, light }: { label: string; heading: React.ReactNode; sub?: string; light?: boolean }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 56 }}>
      <Label>{label}</Label>
      <h2 style={{ fontFamily: B.headFont, fontSize: "clamp(2rem, 4vw, 2.8rem)", fontWeight: 700,
        letterSpacing: "0.01em", color: light ? B.textDark : B.textWhite, lineHeight: 1.1, margin: 0 }}>
        {heading}
      </h2>
      {sub && <p style={{ color: light ? B.textLite : B.textMuted, maxWidth: 520, margin: "14px auto 0",
        lineHeight: 1.7, fontSize: "0.9375rem" }}>{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SeattleConcretePage() {
  const [hovSvc, setHovSvc] = useState<number | null>(null);

  return (
    <main className="flex-1 overflow-y-auto"
      style={{ background: B.bg, color: B.textWhite, fontFamily: B.bodyFont, scrollBehavior: "smooth" }}>

      {/* Google Font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&display=swap');`}</style>

      {/* ── ANNOUNCEMENT BAR ──────────────────────────────────────────────── */}
      <div style={{ background: B.accent, padding: "9px 24px", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ color: B.white, fontSize: "0.875rem", fontWeight: 500 }}>
          🏗️ Free estimates · Asphalt, concrete & hauling · Washington & Oregon · 48-hour bid turnaround
        </span>
        <a href="/websites/seattle-concrete/estimate"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: B.white,
            color: B.accent, fontWeight: 700, fontSize: "0.8rem", padding: "5px 14px",
            borderRadius: 9999, textDecoration: "none", whiteSpace: "nowrap", transition: "opacity 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
          Get a Free Estimate <ChevronRight size={12} />
        </a>
      </div>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section style={{ background: B.bg, position: "relative", overflow: "hidden", borderBottom: `1px solid ${B.borderDark}` }}>
        {/* grain */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, pointerEvents: "none", zIndex: 0 }} />
        {/* subtle diagonal lines */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(255,255,255,0.012) 40px, rgba(255,255,255,0.012) 41px)" }} />

        <div style={{ maxWidth: 1140, margin: "0 auto", padding: "88px 32px 96px", position: "relative", zIndex: 1 }}>
          {/* Location badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${B.borderMid}`,
            borderRadius: 9999, padding: "4px 14px", marginBottom: 28 }}>
            <MapPin size={11} color={B.textMuted} />
            <span style={{ fontSize: 11, fontWeight: 600, color: B.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Pierce County, WA · Washington & Oregon
            </span>
          </div>

          <h1 style={{ fontFamily: B.headFont, fontSize: "clamp(3rem, 7vw, 5.5rem)", fontWeight: 800,
            color: B.textWhite, lineHeight: 0.95, letterSpacing: "0.01em", maxWidth: 780, marginBottom: 28 }}>
            REAL WORK. REAL LOADS.<br />
            <span style={{ color: B.accent }}>REAL RESULTS.</span>
          </h1>

          <p style={{ fontSize: "1.125rem", color: B.textMuted, maxWidth: 560, lineHeight: 1.75, marginBottom: 40 }}>
            Asphalt, concrete, and bulk material hauling across Washington and Oregon.
            Locally owned, DOT-compliant, bilingual crew. We show up and get it done.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
            <a href="/websites/seattle-concrete/estimate"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: B.accent,
                color: B.white, fontWeight: 700, fontSize: "0.9375rem", padding: "14px 30px",
                borderRadius: 6, textDecoration: "none", boxShadow: `0 4px 20px ${B.accentGlow}`,
                transition: "background 0.15s", fontFamily: B.headFont, letterSpacing: "0.04em", textTransform: "uppercase" }}
              onMouseEnter={e => e.currentTarget.style.background = B.accentHover}
              onMouseLeave={e => e.currentTarget.style.background = B.accent}>
              Get a Free Quote <ChevronRight size={16} />
            </a>
            <a href="tel:+12065478293"
              style={{ display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.06)", border: `1px solid ${B.borderMid}`,
                color: B.textWhite, fontWeight: 600, fontSize: "0.9375rem", padding: "14px 30px",
                borderRadius: 6, textDecoration: "none", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.10)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}>
              <Phone size={15} /> (206) 547-8293
            </a>
          </div>

          {/* Stars */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="#f59e0b" color="#f59e0b" />)}
            </div>
            <span style={{ fontSize: 13, color: B.textFaint }}>4.9 / 5 · 180+ Google reviews</span>
          </div>
        </div>
      </section>

      {/* ── BY THE NUMBERS ────────────────────────────────────────────────── */}
      <section style={{ background: B.bgCard, borderBottom: `1px solid ${B.borderDark}` }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 32px",
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ padding: "36px 16px", textAlign: "center",
              borderRight: i < 3 ? `1px solid ${B.borderDark}` : "none" }}>
              <div style={{ fontFamily: B.headFont, fontSize: "2.75rem", fontWeight: 800,
                color: B.accent, lineHeight: 1, letterSpacing: "0.01em" }}>{s.value}</div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: B.textWhite, marginTop: 6 }}>{s.label}</div>
              <div style={{ fontSize: "0.75rem", color: B.textMuted, marginTop: 3 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SERVICES ──────────────────────────────────────────────────────── */}
      <section style={{ background: B.bg, padding: "88px 32px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, pointerEvents: "none", opacity: 0.6 }} />
        <div style={{ maxWidth: 1140, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <SectionHead label="What We Do" heading="Asphalt, Concrete & Hauling"
            sub="Three services, one crew. We handle the work from subgrade to final surface." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 2 }}>
            {SERVICES.map((svc, i) => {
              const Icon = svc.icon;
              const hov = hovSvc === i;
              return (
                <div key={i} onMouseEnter={() => setHovSvc(i)} onMouseLeave={() => setHovSvc(null)}
                  style={{ background: hov ? B.bgRaised : B.bgCard,
                    padding: "32px 28px 36px", cursor: "default",
                    borderTop: `2px solid ${hov ? B.accent : "transparent"}`,
                    transition: "all 0.18s ease" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 8,
                    background: hov ? B.accent : "rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 20, transition: "background 0.18s" }}>
                    <Icon size={20} color={hov ? B.white : B.textMuted} />
                  </div>
                  <h3 style={{ fontFamily: B.headFont, fontSize: "1.2rem", fontWeight: 700,
                    color: B.textWhite, marginBottom: 10, letterSpacing: "0.02em" }}>{svc.title}</h3>
                  <p style={{ fontSize: "0.875rem", color: B.textMuted, lineHeight: 1.75, margin: 0 }}>{svc.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── OUR WORK / PORTFOLIO ──────────────────────────────────────────── */}
      <section style={{ background: B.bgCard, padding: "88px 32px" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <SectionHead label="Portfolio" heading="Our Work" sub="Recent work across the greater Seattle area." />

          {/* Top row: featured + 2 stacked */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 4, marginBottom: 4 }}>
            {/* Featured */}
            <div style={{ position: "relative", overflow: "hidden", borderRadius: "2px 0 0 2px" }}>
              <img src={PORTFOLIO[0].img} alt={PORTFOLIO[0].caption}
                style={{ width: "100%", height: 380, objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
                background: "linear-gradient(transparent, rgba(0,0,0,0.75))", padding: "32px 20px 18px" }}>
                <div style={{ display: "inline-block", background: B.accent, color: B.white,
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  padding: "3px 10px", borderRadius: 3, marginBottom: 6 }}>Featured</div>
                <div style={{ fontFamily: B.headFont, fontSize: "1.25rem", fontWeight: 700, color: B.white, letterSpacing: "0.02em" }}>
                  {PORTFOLIO[0].caption}</div>
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{PORTFOLIO[0].sub}</div>
              </div>
            </div>
            {/* Two stacked */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {PORTFOLIO.slice(1, 3).map((p, i) => (
                <div key={i} style={{ position: "relative", overflow: "hidden", flex: 1 }}>
                  <img src={p.img} alt={p.caption}
                    style={{ width: "100%", height: 188, objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
                    background: "linear-gradient(transparent, rgba(0,0,0,0.7))", padding: "20px 14px 12px" }}>
                    <div style={{ fontFamily: B.headFont, fontSize: "1rem", fontWeight: 700, color: B.white }}>{p.caption}</div>
                    <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{p.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom row: YouTube embed + 2 images */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 4 }}>
            {/* YouTube embed */}
            <div style={{ position: "relative", overflow: "hidden" }}>
              <iframe
                src="https://www.youtube.com/embed/8Ts5e9-5ZqI"
                title="Cascade Concrete — Commercial foundation pour, Bellevue WA 2023"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ width: "100%", height: 280, border: "none", display: "block" }}
              />
              <div style={{ background: B.bgRaised, padding: "10px 16px", borderTop: `1px solid ${B.borderDark}` }}>
                <div style={{ fontFamily: B.headFont, fontSize: "1rem", fontWeight: 700, color: B.textWhite, letterSpacing: "0.02em" }}>
                  Parking Lot Overlay — Pierce County</div>
                <div style={{ fontSize: "0.75rem", color: B.textMuted, marginTop: 2 }}>Time-lapse · Asphalt Overlay · 2024</div>
              </div>
            </div>
            {/* Two more images */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {PORTFOLIO.slice(3, 5).map((p, i) => (
                <div key={i} style={{ position: "relative", overflow: "hidden", flex: 1 }}>
                  <img src={p.img} alt={p.caption}
                    style={{ width: "100%", height: 148, objectFit: "cover", display: "block" }} />
                  <div style={{ background: B.bgRaised, padding: "8px 12px", borderTop: `1px solid ${B.borderDark}` }}>
                    <div style={{ fontFamily: B.headFont, fontSize: "0.9rem", fontWeight: 700, color: B.textWhite }}>{p.caption}</div>
                    <div style={{ fontSize: "0.7rem", color: B.textMuted, marginTop: 1 }}>{p.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── OUR TEAM ──────────────────────────────────────────────────────── */}
      <section style={{ background: B.bgWarm, padding: "88px 32px" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <SectionHead label="The People" heading="Meet the Crew" light
            sub="Woman-owned, locally operated, bilingual. The same people on every job." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
            {TEAM.map((member, i) => (
              <div key={i} style={{ background: B.white, borderRadius: 10,
                overflow: "hidden", border: `1px solid ${B.borderLight}`,
                boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
                <div style={{ height: 5, background: i === 0 ? B.accent : "#c8c0b4" }} />
                <div style={{ padding: "28px 24px 32px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
                    <img src={member.photo} alt={member.name}
                      style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
                        border: "2px solid #e8e3db" }} />
                    <div>
                      <div style={{ fontFamily: B.headFont, fontSize: "1.2rem", fontWeight: 700,
                        color: B.textDark, letterSpacing: "0.02em" }}>{member.name}</div>
                      <div style={{ fontSize: "0.8rem", color: B.accent, fontWeight: 600, marginTop: 2 }}>{member.title}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.875rem", color: B.textMid, lineHeight: 1.75, margin: 0 }}>{member.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NOTABLE PROJECTS ──────────────────────────────────────────────── */}
      <section style={{ background: B.bg, padding: "88px 32px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, pointerEvents: "none", opacity: 0.5 }} />
        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <SectionHead label="Track Record" heading="Notable Projects"
            sub="A sample of recent asphalt, concrete, and hauling work across the region." />
          <div style={{ position: "relative" }}>
            {/* Vertical line */}
            <div style={{ position: "absolute", left: 56, top: 0, bottom: 0, width: 1,
              background: B.borderDark, zIndex: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {PROJECTS.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 0, alignItems: "flex-start",
                  paddingBottom: i < PROJECTS.length - 1 ? 36 : 0 }}>
                  {/* Year column */}
                  <div style={{ width: 112, flexShrink: 0, paddingTop: 2, paddingRight: 24,
                    textAlign: "right", fontFamily: B.headFont, fontSize: "1.5rem",
                    fontWeight: 700, color: i === 0 ? B.accent : B.textFaint, lineHeight: 1 }}>
                    {p.year}
                  </div>
                  {/* Dot */}
                  <div style={{ width: 13, height: 13, borderRadius: "50%", flexShrink: 0, marginTop: 4,
                    background: i === 0 ? B.accent : B.bgRaised,
                    border: `2px solid ${i === 0 ? B.accent : B.borderMid}`,
                    position: "relative", zIndex: 1 }} />
                  {/* Content */}
                  <div style={{ flex: 1, paddingLeft: 20 }}>
                    <div style={{ fontFamily: B.headFont, fontSize: "1.1rem", fontWeight: 700,
                      color: B.textWhite, letterSpacing: "0.02em", lineHeight: 1.2 }}>{p.name}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
                      <MapPin size={12} color={B.textFaint} />
                      <span style={{ fontSize: "0.8rem", color: B.textFaint }}>{p.loc}</span>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: B.textMuted, lineHeight: 1.6, marginTop: 6, marginBottom: 0 }}>{p.scope}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CERTIFICATIONS ────────────────────────────────────────────────── */}
      <section style={{ background: B.bgCard, padding: "80px 32px", borderTop: `1px solid ${B.borderDark}` }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <SectionHead label="Credentials" heading="Licenses &amp; Certifications"
            sub="All current. All verified." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 2 }}>
            {CERTS.map((c, i) => {
              const Icon = c.icon;
              return (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "center",
                  background: B.bgRaised, padding: "18px 20px",
                  borderLeft: `3px solid ${B.borderDark}` }}>
                  <Icon size={20} color={B.accent} style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: B.textWhite }}>{c.name}</div>
                    <div style={{ fontSize: "0.78rem", color: B.textMuted, marginTop: 2 }}>{c.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COVERAGE AREA ─────────────────────────────────────────────────── */}
      <section style={{ background: B.bgWarm, padding: "80px 32px" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", display: "grid",
          gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "start" }}>
          <div>
            <Label>Service Area</Label>
            <h2 style={{ fontFamily: B.headFont, fontSize: "clamp(2rem, 3.5vw, 2.6rem)", fontWeight: 700,
              color: B.textDark, letterSpacing: "0.01em", lineHeight: 1.1, marginBottom: 16 }}>
              Serving Washington & Oregon
            </h2>
            <p style={{ color: B.textLite, lineHeight: 1.75, fontSize: "0.9375rem", marginBottom: 28 }}>
              Based in Pierce County and working throughout the Puget Sound, South King County, and into Oregon. Not sure if we cover your site? Call — we&rsquo;ll tell you straight.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: B.white,
              border: `1px solid ${B.borderLight}`, borderRadius: 8, padding: "14px 18px" }}>
              <MapPin size={18} color={B.accent} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "0.875rem", color: B.textMid, fontWeight: 500 }}>
                Pierce County, WA — centrally located for South Sound and beyond
              </span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {AREAS.map((area, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8,
                padding: "8px 0", borderBottom: `1px solid ${B.borderLight}` }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: B.accent, flexShrink: 0 }} />
                <span style={{ fontSize: "0.875rem", color: B.textMid }}>{area}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUOTE CTA ─────────────────────────────────────────────────────── */}
      <section id="quote" style={{ background: B.bg, padding: "88px 32px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, pointerEvents: "none" }} />
        {/* diagonal accent stripe */}
        <div style={{ position: "absolute", top: 0, right: 0, width: 420, height: "100%", pointerEvents: "none",
          background: "linear-gradient(135deg, transparent 50%, rgba(232,93,12,0.04) 50%)" }} />

        <div style={{ maxWidth: 1140, margin: "0 auto", position: "relative", zIndex: 1,
          display: "grid", gridTemplateColumns: "1fr 380px", gap: 56, alignItems: "center" }}>
          <div>
            <Label>Get Started</Label>
            <h2 style={{ fontFamily: B.headFont, fontSize: "clamp(2.2rem, 4vw, 3.2rem)", fontWeight: 800,
              color: B.textWhite, letterSpacing: "0.01em", lineHeight: 1.05, marginBottom: 16 }}>
              READY TO POUR?<br />LET&rsquo;S TALK.
            </h2>
            <p style={{ color: B.textMuted, fontSize: "1rem", lineHeight: 1.75, maxWidth: 480, marginBottom: 36 }}>
              Plans or a quick scope description. Bid back in 48 hours.
            </p>
            {[
              { icon: Phone, href: "tel:+12065478293",           label: "(206) 547-8293" },
              { icon: Mail,  href: "mailto:info@cascadeformwork.com", label: "info@cascadeformwork.com" },
            ].map(({ icon: Icon, href, label }) => (
              <a key={href} href={href} style={{ display: "flex", alignItems: "center", gap: 14,
                color: B.textWhite, textDecoration: "none", fontSize: "1rem", fontWeight: 500, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: B.accentDim,
                  border: `1px solid ${B.accentGlow}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={17} color={B.accent} />
                </div>
                {label}
              </a>
            ))}
          </div>

          {/* Estimate form */}
          <div style={{ background: "#1a1714", borderRadius: 12, padding: "36px 30px",
            border: `1px solid ${B.borderMid}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
            <h3 style={{ fontFamily: B.headFont, fontSize: "1.35rem", fontWeight: 700,
              color: B.textWhite, marginBottom: 6, letterSpacing: "0.03em" }}>Request a Free Estimate</h3>
            <p style={{ fontSize: "0.8rem", color: B.textMuted, marginBottom: 22 }}>Response within one business day.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["Full Name", "Phone Number", "Project Address"].map(ph => (
                <input key={ph} type="text" placeholder={ph}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 6, boxSizing: "border-box",
                    border: `1px solid ${B.borderDark}`, background: B.bgRaised, color: B.textWhite,
                    fontSize: "0.875rem", outline: "none", fontFamily: B.bodyFont }}
                  onFocus={e => e.currentTarget.style.borderColor = B.accent}
                  onBlur={e => e.currentTarget.style.borderColor = B.borderDark} />
              ))}
              <textarea placeholder="Describe your project (scope, timeline, requirements…)" rows={3}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 6, boxSizing: "border-box",
                  border: `1px solid ${B.borderDark}`, background: B.bgRaised, color: B.textWhite,
                  fontSize: "0.875rem", outline: "none", resize: "vertical",
                  fontFamily: B.bodyFont }}
                onFocus={e => e.currentTarget.style.borderColor = B.accent}
                onBlur={e => e.currentTarget.style.borderColor = B.borderDark} />
              <button
                style={{ background: B.accent, color: B.white, fontWeight: 700,
                  fontSize: "0.9375rem", padding: "13px 0", borderRadius: 6, border: "none",
                  cursor: "pointer", transition: "background 0.15s", width: "100%",
                  fontFamily: B.headFont, letterSpacing: "0.05em", textTransform: "uppercase" }}
                onMouseEnter={e => e.currentTarget.style.background = B.accentHover}
                onMouseLeave={e => e.currentTarget.style.background = B.accent}>
                Send Request
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ background: B.bgCard, borderTop: `1px solid ${B.borderDark}`, padding: "32px 32px" }}>
        <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex",
          justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontFamily: B.headFont, fontWeight: 700, fontSize: "1.1rem",
              color: B.textWhite, letterSpacing: "0.04em" }}>CASCADE CONCRETE &amp; FORMWORK, INC.</div>
            <div style={{ fontSize: "0.8rem", color: B.textMuted, marginTop: 4 }}>
              Pierce County, WA · Serving Washington & Oregon
            </div>
          </div>
          <div style={{ fontSize: "0.78rem", color: B.textFaint, textAlign: "right" }}>
            WA Lic #CASCACF921BQ &nbsp;·&nbsp; © {new Date().getFullYear()} All rights reserved<br />
            <span style={{ color: B.textFaint }}>$2M General Liability · Workers&rsquo; Comp Current</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
