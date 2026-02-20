const GradientText = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      background: "var(--seam-gradient)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    }}
  >
    {children}
  </span>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span
    className='inline-block text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4'
    style={{
      background: "color-mix(in oklab, var(--accent) 12%, transparent)",
      color: "var(--accent)",
      border: "1px solid color-mix(in oklab, var(--accent) 30%, transparent)",
    }}
  >
    {children}
  </span>
);

const ServiceCard = ({
  number,
  title,
  subtitle,
  description,
  tags,
}: {
  number: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
}) => (
  <div
    className='flex flex-col gap-4 p-8 rounded-3xl border transition-all hover:-translate-y-1'
    style={{
      background: "var(--bg-secondary)",
      borderColor: "var(--border-color)",
      boxShadow: "0 4px 24px color-mix(in oklab, var(--accent) 8%, transparent)",
    }}
  >
    <div className='flex items-start gap-4'>
      <span className='text-xs font-bold tracking-widest pt-1 shrink-0' style={{ color: "var(--accent)" }}>
        {number}
      </span>
      <div>
        <h3 className='text-xl font-bold text-[var(--text-primary)]'>{title}</h3>
        <p className='text-sm font-medium mt-0.5' style={{ color: "var(--accent)" }}>
          {subtitle}
        </p>
      </div>
    </div>
    <p className='text-[var(--text-secondary)] leading-relaxed text-sm'>{description}</p>
    <div className='flex flex-wrap gap-2 mt-auto pt-2'>
      {tags.map((tag) => (
        <span
          key={tag}
          className='text-xs px-3 py-1 rounded-full font-medium'
          style={{
            background: "color-mix(in oklab, var(--accent) 10%, transparent)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  </div>
);

export default function Home() {
  return (
    <main className='flex w-full flex-col' style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className='relative flex flex-col items-center justify-center min-h-screen px-6 text-center overflow-hidden'>
        {/* Soft ambient glow */}
        <div
          className='pointer-events-none absolute inset-0'
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%)",
          }}
        />

        <div className='relative z-10 max-w-3xl flex flex-col items-center gap-8'>
          {/* Credibility pill */}
          <div
            className='flex items-center gap-2 text-sm px-5 py-2 rounded-full border'
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              color: "var(--text-secondary)",
            }}
          >
            <span className='inline-block w-2 h-2 rounded-full animate-pulse' style={{ background: "var(--accent)" }} />
            Based in Seattle · 100% Free · Human-First
          </div>

          <h1 className='text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight text-[var(--text-primary)]'>
            Empowering Seattle&apos;s{" "}
            <span className='block'>
              <GradientText>Independent Spirit</GradientText>
            </span>
            with Human-Centric AI.
          </h1>

          <p className='text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl leading-relaxed'>
            I use AI to handle your <strong className='text-[var(--text-primary)]'>&ldquo;commodity work&rdquo;</strong>{" "}
            so you can focus on your{" "}
            <strong className='text-[var(--text-primary)]'>&ldquo;signature work.&rdquo;</strong> Fast, professional,
            and 100% free — built for Seattle&apos;s small businesses, independent creators, and bands.
          </p>

          {/* Stat callout */}
          <div
            className='flex items-center gap-3 px-6 py-3 rounded-2xl border text-sm text-left'
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
          >
            <span className='text-3xl font-bold' style={{ color: "var(--accent)" }}>
              75%
            </span>
            <span className='text-[var(--text-secondary)] max-w-xs'>
              of consumers judge a business&apos;s credibility by its website design. First impressions happen in
              milliseconds.
            </span>
          </div>

          <div className='flex flex-col sm:flex-row gap-4 mt-2'>
            <a
              href='#apply'
              className='px-8 py-4 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90'
              style={{ background: "var(--seam-gradient)" }}
            >
              Apply for a Free Service
            </a>
            <a
              href='#how-we-work'
              className='px-8 py-4 rounded-full font-semibold text-base border border-[var(--border-dark)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors'
            >
              The Way We Work
            </a>
          </div>
        </div>

        {/* Scroll cue */}
        <div className='absolute bottom-10 flex flex-col items-center gap-2 opacity-40'>
          <span className='text-xs tracking-widest uppercase text-[var(--text-secondary)]'>Scroll</span>
          <div className='w-px h-8 rounded-full' style={{ background: "var(--seam-gradient-vert)" }} />
        </div>
      </section>

      {/* ── THE PROBLEM ──────────────────────────────────────── */}
      <section className='px-6 py-24 md:py-32' style={{ background: "var(--bg-secondary)" }}>
        <div className='max-w-5xl mx-auto'>
          <SectionLabel>The Problem</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight mb-6'>
            Seattle&apos;s creators are caught in a <GradientText>perfect storm.</GradientText>
          </h2>

          <div className='grid md:grid-cols-2 gap-12 mt-12'>
            <div className='flex flex-col gap-6'>
              <div
                className='p-6 rounded-2xl border'
                style={{ borderColor: "var(--border-color)", background: "var(--bg-primary)" }}
              >
                <h3 className='font-bold text-lg mb-2 text-[var(--text-primary)]'>Economic Precarity</h3>
                <p className='text-[var(--text-secondary)] leading-relaxed text-sm'>
                  Rising costs and a competitive market squeeze solo founders and independent artists from every
                  direction. Professional digital infrastructure — the kind that drives real revenue — has always been
                  out of reach financially.
                </p>
              </div>
              <div
                className='p-6 rounded-2xl border'
                style={{ borderColor: "var(--border-color)", background: "var(--bg-primary)" }}
              >
                <h3 className='font-bold text-lg mb-2 text-[var(--text-primary)]'>Execution Overload</h3>
                <p className='text-[var(--text-secondary)] leading-relaxed text-sm'>
                  You&apos;re the founder, the marketer, the customer service rep, and the IT department — all at once.
                  Administrative bottlenecks steal the time you need to actually create, connect, and grow.
                </p>
              </div>
            </div>
            <div className='flex flex-col gap-6'>
              <div
                className='p-6 rounded-2xl border'
                style={{ borderColor: "var(--border-color)", background: "var(--bg-primary)" }}
              >
                <h3 className='font-bold text-lg mb-2 text-[var(--text-primary)]'>Digital Invisibility</h3>
                <p className='text-[var(--text-secondary)] leading-relaxed text-sm'>
                  Without a coherent online presence, even the most talented local businesses are invisible to the
                  people who would love them most. You lose to competitors who are louder, not better.
                </p>
              </div>
              <div
                className='p-6 rounded-2xl border'
                style={{ borderColor: "var(--border-color)", background: "var(--bg-primary)" }}
              >
                <h3 className='font-bold text-lg mb-2 text-[var(--text-primary)]'>
                  Fear of &ldquo;Robotic&rdquo; Technology
                </h3>
                <p className='text-[var(--text-secondary)] leading-relaxed text-sm'>
                  AI tools promise the world but deliver generic, soulless output that strips your brand of its
                  personality. The result is content that feels mass-produced — the opposite of why your customers chose
                  you.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE 4 SERVICES ─────────────────────────────────── */}
      <section id='how-we-work' className='px-6 py-24 md:py-32'>
        <div className='max-w-5xl mx-auto'>
          <SectionLabel>The Services</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight mb-4'>
            Four Services. <GradientText>Real Results.</GradientText>
          </h2>
          <p className='text-[var(--text-secondary)] text-lg max-w-2xl mb-14 leading-relaxed'>
            Each service is a focused, high-impact engagement. No bloated retainers, no waiting months for deliverables —
            just sharp execution on the things that move the needle.
          </p>

          <div className='grid md:grid-cols-2 gap-6'>
            <ServiceCard
              number='01'
              title='The Digital Front Door'
              subtitle='Unified presence across every channel'
              description="I'll build you a cohesive hub that connects your social profiles, streaming links, and sales channels into a single, credible home. Customers find you easily. Everything works together. Your brand finally tells one consistent story."
              tags={["Website", "Link-in-Bio", "Social Profiles", "Streaming", "SEO Basics"]}
            />
            <ServiceCard
              number='02'
              title='The Content Multiplier'
              subtitle='One video → 20+ platform-ready assets'
              description="Record one long-form video or podcast and I'll use AI to atomize it into short-form clips, captions, quote cards, and audiograms optimized for TikTok, Instagram Reels, and YouTube Shorts. End content fatigue without sacrificing authenticity."
              tags={["TikTok", "Reels", "Shorts", "Captions", "Repurposing"]}
            />
            <ServiceCard
              number='03'
              title='The Instant Shop'
              subtitle='From concept to checkout in hours'
              description="Need to validate a product, merch drop, or service offering? I'll launch a professional storefront fast — including product photography guidance, copy, and payment integration. No guesswork, no wasted months building something nobody wants."
              tags={["E-Commerce", "Product Pages", "Payments", "Merch", "Validation"]}
            />
            <ServiceCard
              number='04'
              title='The Security Guard'
              subtitle='Protect your identity and your work'
              description="I'll implement 'No-Training' flags across your digital properties to stop AI scrapers from harvesting your creative work. I'll also set up multi-factor authentication and educate you on voice-cloning scams targeting independent creators — because your likeness is your brand."
              tags={["No-AI-Training Flags", "MFA Setup", "Anti-Scraping", "Voice Scam Defense"]}
            />
          </div>
        </div>
      </section>

      {/* ── HUMAN-IN-THE-LOOP ────────────────────────────────── */}
      <section className='px-6 py-24 md:py-32' style={{ background: "var(--bg-secondary)" }}>
        <div className='max-w-4xl mx-auto text-center flex flex-col items-center gap-8'>
          <SectionLabel>The Promise</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight'>
            AI is the engine. <GradientText>Human judgment</GradientText> is the driver.
          </h2>
          <p className='text-[var(--text-secondary)] text-lg max-w-2xl leading-relaxed'>
            Every deliverable I produce starts with a conversation about <em>your</em> voice, your values, and your
            community. AI accelerates the execution — it never replaces the strategy or the soul.
          </p>

          <div className='grid sm:grid-cols-3 gap-6 w-full mt-4 text-left'>
            {[
              {
                icon: "◎",
                title: "No Generic Templates",
                body: "Your brand is unique. Everything is built from your story, not a library of recycled assets.",
              },
              {
                icon: "◈",
                title: "Custom Strategic Guidance",
                body: "You get a real human reviewing every output with your specific goals and audience in mind.",
              },
              {
                icon: "◉",
                title: "Transparent Process",
                body: "You'll see exactly which tools were used and why. No black boxes, no mystery deliverables.",
              },
            ].map(({ icon, title, body }) => (
              <div
                key={title}
                className='p-6 rounded-2xl border flex flex-col gap-3'
                style={{ borderColor: "var(--border-color)", background: "var(--bg-primary)" }}
              >
                <span className='text-2xl' style={{ color: "var(--accent)" }}>
                  {icon}
                </span>
                <h3 className='font-bold text-[var(--text-primary)]'>{title}</h3>
                <p className='text-sm text-[var(--text-secondary)] leading-relaxed'>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HYPER-LOCAL / WORLD CUP ──────────────────────────── */}
      <section className='px-6 py-24 md:py-32 relative overflow-hidden'>
        <div
          className='pointer-events-none absolute inset-0'
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 100%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 70%)",
          }}
        />
        <div className='relative z-10 max-w-4xl mx-auto flex flex-col md:flex-row gap-12 items-center'>
          <div className='flex-1'>
            <SectionLabel>Hyper-Local · Seattle</SectionLabel>
            <h2 className='text-4xl md:text-5xl font-bold leading-tight mb-6'>
              500,000+ visitors are coming to Seattle. <GradientText>Will they find you?</GradientText>
            </h2>
            <p className='text-[var(--text-secondary)] text-lg leading-relaxed mb-4'>
              The 2026 FIFA World Cup is bringing over half a million visitors to the Pacific Northwest. For
              Seattle&apos;s independent restaurants, venues, retailers, and artists, this is a generational opportunity
              — but only for those with a visible, trustworthy digital presence.
            </p>
            <p className='text-[var(--text-secondary)] text-lg leading-relaxed'>
              Don&apos;t let a competitor with a slicker website capture customers who were looking for exactly what you
              offer. Let&apos;s get you ready before the crowds arrive.
            </p>
          </div>
          <div
            className='shrink-0 w-full md:w-72 p-8 rounded-3xl border flex flex-col gap-4 text-center'
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          >
            <span className='text-6xl font-bold' style={{ color: "var(--accent)" }}>
              500k+
            </span>
            <p className='text-sm text-[var(--text-secondary)] leading-relaxed'>
              Expected visitors to the Seattle area during the 2026 FIFA World Cup — each one a potential customer for
              your business.
            </p>
            <div className='h-px w-full rounded-full' style={{ background: "var(--border-color)" }} />
            <p className='text-xs text-[var(--text-secondary)]'>
              Limited service slots available before the tournament. Apply early.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section
        id='apply'
        className='px-6 py-24 md:py-36 relative overflow-hidden'
        style={{ background: "var(--bg-secondary)" }}
      >
        <div
          className='pointer-events-none absolute inset-0'
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 50%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%)",
          }}
        />
        <div className='relative z-10 max-w-2xl mx-auto flex flex-col items-center text-center gap-8'>
          <SectionLabel>Let&apos;s Work Together</SectionLabel>
          <h2 className='text-4xl md:text-5xl font-bold leading-tight'>
            Ready to focus on your <GradientText>signature work?</GradientText>
          </h2>
          <p className='text-[var(--text-secondary)] text-lg leading-relaxed max-w-xl'>
            Slots are limited and always free. Fill out a short application and I&apos;ll reach out within 48 hours to
            schedule a strategy call — no sales pitch, no obligation.
          </p>
          <div className='flex flex-col sm:flex-row gap-4'>
            <a
              href='mailto:hello@icodeforbananas.com?subject=Free Service Application'
              className='px-10 py-4 rounded-full text-white font-semibold text-base transition-opacity hover:opacity-90'
              style={{ background: "var(--seam-gradient)" }}
            >
              Apply for a Free Service
            </a>
            <a
              href='mailto:hello@icodeforbananas.com?subject=Strategy Call Request'
              className='px-10 py-4 rounded-full font-semibold text-base border border-[var(--border-dark)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition-colors'
            >
              Let&apos;s Talk Strategy
            </a>
          </div>
          <p className='text-xs text-[var(--text-secondary)] mt-2'>
            Serving Seattle-area small businesses, independent creators, and bands. Always free. No catch.
          </p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer
        className='px-6 py-10 text-center text-xs text-[var(--text-secondary)] border-t'
        style={{ borderColor: "var(--border-color)" }}
      >
        <p>
          Built with care in Seattle · <span style={{ color: "var(--accent)" }}>iCodeForBananas</span> · All services
          are pro-bono. No data is sold. No tracking beyond basic analytics.
        </p>
      </footer>
    </main>
  );
}
