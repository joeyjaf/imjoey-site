import React, { useEffect, useState, useRef } from "react";
import "./App.css";

function useTypewriter(text, { speedMs = 88, startDelay = 800 } = {}) {
  const [charIndex, setCharIndex] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(t);
  }, [startDelay]);

  useEffect(() => {
    if (!started || charIndex >= text.length) return;
    const t = setTimeout(() => setCharIndex((c) => c + 1), speedMs);
    return () => clearTimeout(t);
  }, [charIndex, text, speedMs, started]);

  return { typed: text.slice(0, charIndex), done: charIndex >= text.length };
}

function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, inView];
}

function GlowCursor({ done }) {
  return (
    <span
      className={`glow-cursor${done ? " glow-cursor--done" : ""}`}
      aria-hidden="true"
    />
  );
}

function SkillLogo({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <span className="skill-logo-fallback">{name.slice(0, 1)}</span>;
  }
  return (
    <img
      src={src}
      alt={name}
      className="skill-logo-img"
      onError={() => setFailed(true)}
    />
  );
}

function SkillCard({ name, src, icon, delay = 0 }) {
  const [ref, inView] = useInView(0.1);
  return (
    <div
      ref={ref}
      className={`skill-card${inView ? " skill-card--show" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="skill-logo-wrap">
        {icon ?? <SkillLogo src={src} name={name} />}
      </div>
      <div className="skill-name">{name}</div>
    </div>
  );
}

function StatCard({ value, label, delay = 0 }) {
  const [ref, inView] = useInView(0.1);
  return (
    <div
      ref={ref}
      className={`stat-card${inView ? " stat-card--show" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function RoleCard({ number, title, subtitle, meta, bullets, delay = 0 }) {
  const [ref, inView] = useInView(0.08);
  return (
    <div
      ref={ref}
      className={`role-card${inView ? " role-card--show" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="role-number">{number}</div>
      <div className="role-content">
        <h3 className="role-title">{title}</h3>
        {subtitle && <p className="role-subtitle">{subtitle}</p>}
        {meta && <p className="role-meta">{meta}</p>}
        <ul className="role-bullets">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  const heroName = "Joey Fraser.";
  const { typed, done: nameDone } = useTypewriter(heroName, { speedMs: 90, startDelay: 700 });
  const [descRef, descInView] = useInView(0.08);

  const MerchantSuccessIcon = (
    <svg className="skill-logo-img" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 11H7a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2z"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
      <circle cx="12" cy="15.5" r="1" fill="rgba(255,255,255,0.85)" stroke="none"/>
    </svg>
  );

  const skills = [
    { name: "Claude",           src: "https://cdn.simpleicons.org/anthropic/ffffff" },
    { name: "ChatGPT",          src: "/icons/chatgpt.svg" },
    { name: "App Scripts",      src: "https://cdn.simpleicons.org/googleappsscript/ffffff" },
    { name: "Sigma",            src: "/icons/sigma.svg" },
    { name: "Figma",            src: "https://cdn.simpleicons.org/figma/ffffff" },
    { name: "Postmark",         src: "/icons/postmark.svg" },
    { name: "Retool",           src: "https://cdn.simpleicons.org/retool/ffffff" },
    { name: "Slack",            src: "/icons/slack.svg" },
    { name: "Intercom",         src: "https://cdn.simpleicons.org/intercom/ffffff" },
    { name: "Zendesk",          src: "https://cdn.simpleicons.org/zendesk/ffffff" },
    { name: "Kustomer",         src: "/icons/kustomer.svg" },
    { name: "Gorgias",          src: "/icons/gorgias.svg" },
    { name: "Merchant Success", icon: MerchantSuccessIcon },
  ];

  const videos = [
    { id: "v1", name: "Video 1", url: "/video1.mp4" },
    { id: "v2", name: "Video 2", url: "/video2.mp4" },
  ];

  const roles = [
    {
      number: "01",
      title: "Fragile",
      subtitle: "Head of Risk",
      meta: "San Francisco, CA · Mar 2023–Present",
      bullets: [
        "Joined as employee #5 and scaled the company from $4K to $2M+ MRR — operating across merchant partnerships, customer success, risk & recovery, logistics, and underwriting as the org grew past 50 employees",
        "Built Fragile's underwriting system from scratch using institution-defined key vectors; framework was independently validated via data and fully adopted company-wide as core risk infrastructure",
        "Led customer support and payment recovery for Fragile's portfolio of merchant partners — managing overdue subscriptions, payment commitments, return coordination, and escalation prevention through SMS, email, and phone",
        "Personally recovered over $1.5M in assets through direct risk operations; collaborated with legal counsel and a private investigator on high-stakes cases",
        "Designed and A/B tested risk strategies and operational initiatives; hired 20+ employees and currently manage a direct team of 11 across risk, recovery, and operations",
      ],
    },
    {
      number: "02",
      title: "Project WiFi",
      subtitle: "Co-Owner & CFO",
      meta: "May 2020–Mar 2023",
      bullets: [
        "Opened, managed, and scaled 200+ profitable ecommerce stores for clients",
        "Generated $10M+ in net profit since inception",
        "Over $1M sourced from personal network — zero additional ad spend",
        "Oversaw 100+ domestic and international employees",
        "Six figures of receivables and expenditures managed monthly",
        "High-touch client support across Discord, phone, and in-person",
      ],
    },
    {
      number: "03",
      title: "Real Estate Investor",
      subtitle: "Owner & Operator",
      meta: "Waco, TX · Oct 2022–Present",
      bullets: [
        "Own and operate 24 residential units across Waco, TX",
      ],
    },
    {
      number: "04",
      title: "Credit Scaling Specialist",
      subtitle: "Network-Based Advisory",
      meta: "Los Angeles, CA · Aug 2019–May 2020",
      bullets: [
        "Help friends and family scale and leverage credit for business",
        "28+ clients — $1,100,000+ in credit lines gained",
        "$42,000+ in sign-up bonuses earned across client base",
        "130+ card approvals facilitated — 10+ businesses launched",
      ],
    },
  ];

  return (
    <div className="site">
      <div className="bg-orb bg-orb--1" aria-hidden="true" />
      <div className="bg-orb bg-orb--2" aria-hidden="true" />
      <div className="bg-orb bg-orb--3" aria-hidden="true" />

      {/* HERO */}
      <section className="hero">
        <div className="hero-inner">
          <p className="hero-eyebrow">Hi, I'm</p>
          <h1 className="hero-name">
            <span className="hero-name-text">{typed}</span>
            <GlowCursor done={nameDone} />
          </h1>
          <div className={`hero-below${nameDone ? " hero-below--show" : ""}`}>
            <p className="hero-tagline">Head of Risk · Fragile</p>
            <div className="hero-photo-wrap">
              <img src="/joey.png" alt="Joey Fraser" className="hero-photo" />
            </div>
          </div>
        </div>
        <div className="scroll-hint" aria-hidden="true">
          <div className="scroll-line" />
          <span className="scroll-label">scroll</span>
        </div>
      </section>

      {/* ABOUT */}
      <section className="section">
        <div className="section-inner">
          <p className="section-tag">About</p>
          <p
            ref={descRef}
            className={`about-text${descInView ? " about-text--show" : ""}`}
          >
            I work at <span className="accent">Fragile</span>, a company that
            powers hardware subscription programs for some of the world's leading
            technology brands. As <span className="accent">Head of Risk</span>, I
            oversee our entire risk and recovery function, leading strategy across
            underwriting, delinquency management, and loss mitigation. I design
            and implement data-driven systems that optimize account performance,
            streamline recovery operations, and proactively reduce exposure across
            our portfolio. My focus is on building scalable processes that protect
            unit economics while preserving customer relationships and long-term
            brand value.
          </p>
          <div className="stats-grid">
            <StatCard value="$10M+" label="Net profit generated" delay={0} />
            <StatCard value="200+" label="Ecommerce stores scaled" delay={90} />
            <StatCard value="24" label="Real estate units owned" delay={180} />
            <StatCard value="$1.1M+" label="Credit lines secured" delay={270} />
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section className="section">
        <div className="section-inner">
          <p className="section-tag">Skills</p>
          <div className="skills-grid">
            {skills.map((s, i) => (
              <SkillCard key={s.name} {...s} delay={i * 50} />
            ))}
          </div>
        </div>
      </section>

      {/* PROFESSIONAL BACKGROUND */}
      <section className="section">
        <div className="section-inner">
          <p className="section-tag">Professional Background</p>
          <div className="roles-list">
            {roles.map((role, i) => (
              <RoleCard key={role.number} {...role} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* VIDEO CONTENT */}
      <section className="section">
        <div className="section-inner">
          <p className="section-tag">Video Content</p>
          <div className="video-rail">
            {videos.map((v) => (
              <div key={v.id} className="video-card">
                <video
                  className="video-player"
                  src={v.url}
                  controls
                  preload="metadata"
                />
                <div className="video-meta">
                  <span className="video-name">{v.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <span className="footer-name">Joey Fraser</span>
          <span className="footer-rule" aria-hidden="true" />
          <span className="footer-url">imjoey.me</span>
        </div>
      </footer>
    </div>
  );
}
