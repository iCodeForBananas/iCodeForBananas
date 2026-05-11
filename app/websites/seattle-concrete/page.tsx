"use client";

import React, { useState } from "react";
import {
  Truck,
  Building2,
  Home,
  Layers,
  Wrench,
  HardHat,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
  Shield,
  Clock,
  Award,
  Users,
  ChevronRight,
  Star,
} from "lucide-react";

// ── Brand tokens (isolated from the app's banana-yellow theme) ─────────────
const B = {
  dark: "#111827",
  charcoal: "#1f2937",
  mid: "#374151",
  muted: "#6b7280",
  light: "#f3f4f6",
  white: "#ffffff",
  accent: "#ea580c",   // construction orange
  accentHover: "#c2410c",
  accentLight: "#fff7ed",
  slate: "#0f172a",
  border: "#e5e7eb",
};

const SERVICES = [
  {
    icon: Layers,
    title: "Custom Form Work",
    desc: "Architectural and structural forms for walls, columns, footings, and complex pours. Our in-house crew handles even the most demanding geometries.",
  },
  {
    icon: Truck,
    title: "Concrete Delivery Coordination",
    desc: "We manage scheduling with all major ready-mix suppliers in the Puget Sound region, so your pour starts on time and runs smoothly.",
  },
  {
    icon: Building2,
    title: "Commercial Foundation Work",
    desc: "Deep footings, grade beams, stem walls, and slabs-on-grade for commercial and light industrial projects throughout King and Snohomish counties.",
  },
  {
    icon: HardHat,
    title: "Commercial Flatwork",
    desc: "Parking lots, warehouse floors, loading docks, and sidewalks — finished to spec and built to handle Pacific Northwest conditions.",
  },
  {
    icon: Home,
    title: "Residential Concrete",
    desc: "Driveways, patios, walkways, retaining walls, and garage slabs. Decorative finishes available: exposed aggregate, broom, and stamped.",
  },
  {
    icon: Wrench,
    title: "Site Preparation",
    desc: "Sub-base grading, form layout, rebar placement, and curing — everything that happens before and after the truck rolls in.",
  },
];

const REASONS = [
  "25+ years serving the greater Seattle area",
  "Licensed, bonded & fully insured (WA Lic #CASCACF921BQ)",
  "In-house form-setting crew — no subcontractors",
  "Relationships with every major ready-mix supplier in the region",
  "We show up on time, every time",
  "Competitive bids returned within 48 hours",
  "All work backed by a 2-year workmanship warranty",
  "OSHA-10 certified crew members on every site",
];

const STATS = [
  { value: "25+", label: "Years in Business" },
  { value: "1,400+", label: "Projects Completed" },
  { value: "350+", label: "Satisfied Clients" },
  { value: "48hr", label: "Bid Turnaround" },
];

const AREAS = [
  "Seattle", "Bellevue", "Redmond", "Kirkland", "Bothell",
  "Kenmore", "Shoreline", "Renton", "Tukwila", "Burien",
  "Kent", "Auburn", "Federal Way", "Issaquah", "Sammamish",
  "Mercer Island", "Newcastle", "Lynnwood", "Everett", "Edmonds",
  "Tacoma", "Puyallup", "Bremerton (ferry zones)",
];

export default function SeattleConcretePage() {
  const [hoveredService, setHoveredService] = useState<number | null>(null);

  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{ background: B.white, color: B.dark, fontFamily: "'Segoe UI', system-ui, sans-serif" }}
    >

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: `linear-gradient(135deg, ${B.slate} 0%, #1e293b 60%, #292524 100%)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Concrete texture overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px), " +
              "repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)",
            pointerEvents: "none",
          }}
        />
        {/* Orange accent bar */}
        <div style={{ height: 4, background: `linear-gradient(90deg, ${B.accent}, #f97316)` }} />

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px 88px" }}>
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(234,88,12,0.15)",
              border: "1px solid rgba(234,88,12,0.35)",
              borderRadius: 9999,
              padding: "4px 14px",
              marginBottom: 24,
            }}
          >
            <MapPin size={13} color={B.accent} />
            <span style={{ fontSize: 12, fontWeight: 600, color: B.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Seattle, WA — Est. 1998
            </span>
          </div>

          <h1
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              fontWeight: 800,
              color: B.white,
              lineHeight: 1.15,
              maxWidth: 720,
              marginBottom: 20,
            }}
          >
            Seattle&rsquo;s Premier
            <span style={{ color: B.accent }}> Concrete &amp; Formwork</span> Specialists
          </h1>

          <p
            style={{
              fontSize: "1.125rem",
              color: "#cbd5e1",
              maxWidth: 580,
              lineHeight: 1.7,
              marginBottom: 36,
            }}
          >
            Cascade Concrete &amp; Formwork, Inc. has been setting forms and pouring concrete across the greater
            Seattle area since 1998. From complex commercial foundations to residential driveways, we deliver
            quality work, on schedule.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a
              href="#quote"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: B.accent,
                color: B.white,
                fontWeight: 700,
                fontSize: "0.9375rem",
                padding: "14px 28px",
                borderRadius: 8,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(234,88,12,0.4)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = B.accentHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = B.accent)}
            >
              Get a Free Quote <ChevronRight size={16} />
            </a>
            <a
              href="tel:+12065478293"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: B.white,
                fontWeight: 600,
                fontSize: "0.9375rem",
                padding: "14px 28px",
                borderRadius: 8,
                textDecoration: "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            >
              <Phone size={15} /> (206) 547-8293
            </a>
          </div>

          {/* Stars */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 32 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={15} fill="#fbbf24" color="#fbbf24" />
              ))}
            </div>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>4.9 / 5 — 180+ Google reviews</span>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────────────────────── */}
      <section style={{ background: B.accent }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 32px",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
          }}
        >
          {STATS.map((s, i) => (
            <div
              key={i}
              style={{
                padding: "28px 16px",
                textAlign: "center",
                borderRight: i < 3 ? "1px solid rgba(255,255,255,0.2)" : "none",
              }}
            >
              <div style={{ fontSize: "2rem", fontWeight: 800, color: B.white, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.8)", marginTop: 4, fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SERVICES ──────────────────────────────────────────────────────── */}
      <section style={{ background: B.light, padding: "80px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: B.accent,
              }}
            >
              What We Do
            </span>
            <h2 style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", fontWeight: 800, color: B.dark, marginTop: 8 }}>
              Full-Service Concrete Contractor
            </h2>
            <p style={{ color: B.muted, maxWidth: 520, margin: "12px auto 0", lineHeight: 1.7 }}>
              From initial form-setting to final finish, we handle every phase of the concrete work on your project.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 24,
            }}
          >
            {SERVICES.map((svc, i) => {
              const Icon = svc.icon;
              const isHovered = hoveredService === i;
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredService(i)}
                  onMouseLeave={() => setHoveredService(null)}
                  style={{
                    background: B.white,
                    borderRadius: 12,
                    padding: "28px 28px 32px",
                    border: `1px solid ${isHovered ? B.accent : B.border}`,
                    boxShadow: isHovered ? "0 8px 24px rgba(234,88,12,0.12)" : "0 1px 4px rgba(0,0,0,0.06)",
                    transition: "all 0.18s ease",
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      background: isHovered ? B.accent : B.accentLight,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 18,
                      transition: "background 0.18s",
                    }}
                  >
                    <Icon size={22} color={isHovered ? B.white : B.accent} />
                  </div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: B.dark, marginBottom: 8 }}>
                    {svc.title}
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: B.muted, lineHeight: 1.7, margin: 0 }}>
                    {svc.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── WHY CHOOSE US ─────────────────────────────────────────────────── */}
      <section style={{ background: B.white, padding: "80px 32px" }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          {/* Left */}
          <div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: B.accent,
              }}
            >
              Why Cascade
            </span>
            <h2
              style={{
                fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
                fontWeight: 800,
                color: B.dark,
                marginTop: 8,
                marginBottom: 16,
                lineHeight: 1.25,
              }}
            >
              Built on Reputation.
              <br />Backed by Results.
            </h2>
            <p style={{ color: B.muted, lineHeight: 1.75, marginBottom: 32, fontSize: "0.9375rem" }}>
              We&rsquo;ve been a fixture in Seattle&rsquo;s construction industry for over two decades. General contractors
              keep calling us back because we communicate clearly, set tight forms, and finish clean.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {REASONS.map((r, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <CheckCircle size={17} color={B.accent} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.9rem", color: B.mid, lineHeight: 1.5 }}>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — credential cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                icon: Shield,
                title: "Licensed & Insured",
                body: "Washington State contractor license #CASCACF921BQ. $2M general liability, workers' comp current.",
              },
              {
                icon: Award,
                title: "Award-Winning Work",
                body: "AGC of Washington Excellence in Construction award recipient, 2019 & 2022.",
              },
              {
                icon: Users,
                title: "In-House Crew Only",
                body: "Every worker on your site is a Cascade employee — no labor brokers, no surprise subs.",
              },
              {
                icon: Clock,
                title: "On-Time Guarantee",
                body: "We coordinate with your GC's schedule. If we miss a start time without 24hr notice, the day is on us.",
              },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={i}
                  style={{
                    background: B.light,
                    borderRadius: 10,
                    padding: "20px 22px",
                    display: "flex",
                    gap: 16,
                    alignItems: "flex-start",
                    border: `1px solid ${B.border}`,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: B.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} color={B.white} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: B.dark, marginBottom: 4 }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: B.muted, lineHeight: 1.6 }}>{card.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COVERAGE AREA ─────────────────────────────────────────────────── */}
      <section style={{ background: B.light, padding: "72px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 56,
              alignItems: "start",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: B.accent,
                }}
              >
                Service Area
              </span>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
                  fontWeight: 800,
                  color: B.dark,
                  marginTop: 8,
                  marginBottom: 16,
                }}
              >
                Serving the Puget Sound Region
              </h2>
              <p style={{ color: B.muted, lineHeight: 1.75, marginBottom: 0, fontSize: "0.9375rem" }}>
                Our crews work throughout King, Snohomish, and Pierce counties. If you&rsquo;re not sure whether we
                cover your site, call us — we&rsquo;ll tell you straight.
              </p>
              <div
                style={{
                  marginTop: 28,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: B.white,
                  border: `1px solid ${B.border}`,
                  borderRadius: 10,
                  padding: "14px 18px",
                }}
              >
                <MapPin size={18} color={B.accent} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "0.875rem", color: B.mid, fontWeight: 500 }}>
                  Headquartered in Tukwila, WA — centrally located for rapid deployment across the metro
                </span>
              </div>
            </div>

            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {AREAS.map((area, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "7px 0",
                      borderBottom: i < AREAS.length - 2 ? `1px solid ${B.border}` : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: B.accent,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: "0.875rem", color: B.mid }}>{area}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUOTE CTA ─────────────────────────────────────────────────────── */}
      <section
        id="quote"
        style={{
          background: `linear-gradient(135deg, ${B.slate} 0%, #1e293b 100%)`,
          padding: "80px 32px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative accent */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(234,88,12,0.08)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(234,88,12,0.05)",
            pointerEvents: "none",
          }}
        />

        <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 48,
              alignItems: "center",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                  fontWeight: 800,
                  color: B.white,
                  marginBottom: 12,
                  lineHeight: 1.2,
                }}
              >
                Ready to Pour? Let&rsquo;s Talk.
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, maxWidth: 520, marginBottom: 28 }}>
                Send us your plans or describe the scope and we&rsquo;ll have a bid back to you within 48 hours.
                No project is too large or too small for a conversation.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <a
                  href="tel:+12065478293"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    color: B.white,
                    textDecoration: "none",
                    fontSize: "1rem",
                    fontWeight: 500,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "rgba(234,88,12,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Phone size={16} color={B.accent} />
                  </div>
                  (206) 547-8293
                </a>
                <a
                  href="mailto:info@cascadeformwork.com"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    color: B.white,
                    textDecoration: "none",
                    fontSize: "1rem",
                    fontWeight: 500,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "rgba(234,88,12,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Mail size={16} color={B.accent} />
                  </div>
                  info@cascadeformwork.com
                </a>
              </div>
            </div>

            {/* Contact card */}
            <div
              style={{
                background: B.white,
                borderRadius: 16,
                padding: "36px 32px",
                width: 340,
                boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                flexShrink: 0,
              }}
            >
              <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: B.dark, marginBottom: 6 }}>
                Request a Free Estimate
              </h3>
              <p style={{ fontSize: "0.8125rem", color: B.muted, marginBottom: 20 }}>
                We&rsquo;ll follow up within one business day.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {["Full Name", "Phone Number", "Project Address"].map((placeholder) => (
                  <input
                    key={placeholder}
                    type="text"
                    placeholder={placeholder}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: `1px solid ${B.border}`,
                      fontSize: "0.875rem",
                      color: B.dark,
                      background: B.white,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = B.accent)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = B.border)}
                  />
                ))}
                <textarea
                  placeholder="Describe your project (scope, timeline, special requirements…)"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: `1px solid ${B.border}`,
                    fontSize: "0.875rem",
                    color: B.dark,
                    background: B.white,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = B.accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = B.border)}
                />
                <button
                  style={{
                    background: B.accent,
                    color: B.white,
                    fontWeight: 700,
                    fontSize: "0.9375rem",
                    padding: "12px 0",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = B.accentHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = B.accent)}
                >
                  Send Request
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer
        style={{
          background: "#0f172a",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "36px 32px",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: B.white }}>
              Cascade Concrete &amp; Formwork, Inc.
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#475569", marginTop: 4 }}>
              Tukwila, WA · Serving the Greater Seattle Area since 1998
            </div>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "#475569" }}>
            WA Lic #CASCACF921BQ &nbsp;·&nbsp; © {new Date().getFullYear()} All rights reserved
          </div>
        </div>
      </footer>
    </main>
  );
}
