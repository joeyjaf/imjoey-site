import React, { useEffect, useState, useRef } from "react";
import "./App.css";

/* ─────────────────────────────────────────────
   HOOKS
───────────────────────────────────────────── */
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

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const denom = (h.scrollHeight - h.clientHeight) || 1;
      setPct(Math.min(1, Math.max(0, h.scrollTop / denom)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return pct;
}

function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const onScroll = () => {
      const probe = window.innerHeight * 0.34;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - probe <= 0) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ids]);
  return active;
}

/* ─────────────────────────────────────────────
   PRIMITIVES
───────────────────────────────────────────── */
function GlowCursor({ done }) {
  return (
    <span className={`glow-cursor${done ? " glow-cursor--done" : ""}`} aria-hidden="true" />
  );
}

function SkillLogo({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <span className="skill-logo-fallback">{name.slice(0, 1)}</span>;
  }
  return (
    <img src={src} alt={name} className="skill-logo-img" onError={() => setFailed(true)} />
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
      <div className="skill-logo-wrap">{icon ?? <SkillLogo src={src} name={name} />}</div>
      <div className="skill-name">{name}</div>
    </div>
  );
}

function SkillCategory({ label, items, baseDelay = 0 }) {
  const [ref, inView] = useInView(0.05);
  return (
    <div
      ref={ref}
      className={`skill-category${inView ? " skill-category--show" : ""}`}
    >
      <div className="skill-category-head">
        <span className="skill-category-tick" aria-hidden="true" />
        <span className="skill-category-label">{label}</span>
        <span className="skill-category-count">{String(items.length).padStart(2, "0")}</span>
      </div>
      <div className="skills-grid">
        {items.map((s, i) => (
          <SkillCard key={s.name} {...s} delay={baseDelay + i * 40} />
        ))}
      </div>
    </div>
  );
}

function VideoCard({ url, thumb }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div
      className={`video-card${playing ? " video-card--playing" : ""}`}
      onClick={() => !playing && setPlaying(true)}
      role={playing ? undefined : "button"}
      tabIndex={playing ? undefined : 0}
      onKeyDown={(e) => {
        if (!playing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setPlaying(true);
        }
      }}
    >
      {playing ? (
        <video className="video-player" src={url} controls autoPlay />
      ) : (
        <div className="video-poster">
          <div className="video-poster-icon">{thumb}</div>
          <div className="video-play-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
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
      <div className="role-rail" aria-hidden="true">
        <span className="role-rail-dot" />
        <span className="role-rail-line" />
      </div>
      <div className="role-number">{number}</div>
      <div className="role-content">
        <div className="role-head">
          <h3 className="role-title">{title}</h3>
          {subtitle && <span className="role-subtitle">{subtitle}</span>}
        </div>
        {meta && <p className="role-meta">{meta}</p>}
        <ul className="role-bullets">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </div>
    </div>
  );
}

function ProjectCard({ name, url, updated, shot, delay = 0 }) {
  const [ref, inView] = useInView(0.08);
  const [shotFailed, setShotFailed] = useState(false);
  const host = (() => {
    try { return new URL(url).host; } catch { return url.replace(/^https?:\/\//, ""); }
  })();
  const hasShot = !!shot && !shotFailed;
  return (
    <a
      ref={ref}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`project-card${inView ? " project-card--show" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
      aria-label={`Open ${name}`}
    >
      <div className="project-window-bar">
        <span className="project-window-dot project-window-dot--r" />
        <span className="project-window-dot project-window-dot--y" />
        <span className="project-window-dot project-window-dot--g" />
        <span className="project-url-pill">{host}</span>
        <span className="project-external" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7" />
            <path d="M8 7h9v9" />
          </svg>
        </span>
      </div>
      <div className="project-shot-wrap">
        {hasShot && (
          <img
            src={`${process.env.PUBLIC_URL || ""}${shot}`}
            alt={`${name} screenshot`}
            className="project-shot"
            loading="lazy"
            onError={() => setShotFailed(true)}
          />
        )}
        {!hasShot && (
          <div className="project-shot-fallback">
            <span className="project-shot-fallback-mark">{name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </div>
      <div className="project-meta">
        <div className="project-name">{name}</div>
        <div className="project-sub">
          <span className="project-status">
            <span className="project-status-dot" />
            Live
          </span>
          {updated && <span className="project-updated">deployed {updated} ago</span>}
        </div>
      </div>
    </a>
  );
}

/* ─────────────────────────────────────────────
   HUD NAV (sticky top bar + scroll progress + section dots)
───────────────────────────────────────────── */
const SECTIONS = [
  { id: "top",      label: "Home" },
  { id: "about",    label: "About" },
  { id: "skills",   label: "Skills" },
  { id: "work",     label: "Work" },
  { id: "projects", label: "Projects" },
  { id: "videos",   label: "Videos" },
  { id: "connect",  label: "Connect" },
];

function Hud() {
  const now = useLiveClock();
  const progress = useScrollProgress();
  const active = useActiveSection(SECTIONS.map((s) => s.id));

  // SF time — render in user's local but label as SF when in SF
  const time = now.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  return (
    <>
      <div className="hud" role="navigation" aria-label="Primary">
        <a href="#top" className="hud-brand">
          <span className="hud-avatar">
            <img src="/joey.png" alt="" />
          </span>
          <span className="hud-brand-text">
            <span className="hud-brand-name">Joey Fraser</span>
            <span className="hud-brand-role">Head of Risk · Fragile</span>
          </span>
        </a>

        <nav className="hud-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`hud-link${active === s.id ? " hud-link--active" : ""}`}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="hud-meta" aria-hidden="true">
          <span className="hud-status">
            <span className="hud-status-dot" />
            online
          </span>
          <span className="hud-sep" />
          <span className="hud-loc">SF</span>
          <span className="hud-time">{time}</span>
        </div>
      </div>
      <div className="hud-progress" aria-hidden="true">
        <div className="hud-progress-bar" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* right-side section dots — full nav for desktop */}
      <div className="rail-nav" aria-hidden="true">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`rail-dot${active === s.id ? " rail-dot--active" : ""}`}
          >
            <span className="rail-dot-label">{s.label}</span>
            <span className="rail-dot-mark" />
          </a>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   APP
───────────────────────────────────────────── */
export default function App() {
  const heroName = "joey fraser.";
  const { typed, done: nameDone } = useTypewriter(heroName, { speedMs: 80, startDelay: 700 });
  const [descRef, descInView] = useInView(0.08);

  const wavePathsRef = useRef([null, null, null, null]);

  /* live-fetched Vercel projects */
  const [projects, setProjects] = useState({ projects: [], fetchedAt: null });
  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL || ""}/projects.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((data) => setProjects(data))
      .catch(() => setProjects({ projects: [] }));
  }, []);

  /* background waves — same scroll-reactive math, kept as-is */
  useEffect(() => {
    const samples = 80;
    const startX = -200;
    const endX = 1640;
    const step = (endX - startX) / samples;

    const waveConfigs = [
      { baseAmp: 3, energyAmp: 14, freq: 0.0050, scrollSpeed:  0.010, timeSpeed: 0.40 },
      { baseAmp: 4, energyAmp: 20, freq: 0.0080, scrollSpeed: -0.014, timeSpeed: 0.55 },
      { baseAmp: 5, energyAmp: 24, freq: 0.0040, scrollSpeed:  0.018, timeSpeed: 0.35 },
      { baseAmp: 6, energyAmp: 30, freq: 0.0070, scrollSpeed: -0.012, timeSpeed: 0.48 },
    ];

    const buildPath = (phase, amp, freq) => {
      let d = "";
      for (let i = 0; i <= samples; i++) {
        const x = startX + i * step;
        const y = 100 + amp * Math.sin(freq * (x - startX) + phase);
        d += (i === 0 ? "M" : " L") + x.toFixed(1) + " " + y.toFixed(1);
      }
      return d;
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let energy = 0;
    let scrollPhase = 0;
    let timePhase = 0;
    let lastY = window.scrollY;
    let lastFrame = performance.now();
    let rafId = 0;

    const onScroll = () => {
      if (reduceMotion) return;
      const curY = window.scrollY;
      const delta = curY - lastY;
      scrollPhase += delta;
      energy = Math.min(1, energy + Math.abs(delta) * 0.012);
      lastY = curY;
    };

    const frame = (now) => {
      const dt = Math.min(0.06, (now - lastFrame) / 1000);
      lastFrame = now;
      timePhase += dt;
      energy = Math.max(0, energy - dt * 1.4);

      for (let i = 0; i < wavePathsRef.current.length; i++) {
        const p = wavePathsRef.current[i];
        if (!p) continue;
        const cfg = waveConfigs[i];
        const phase = scrollPhase * cfg.scrollSpeed + timePhase * cfg.timeSpeed;
        const amp = cfg.baseAmp + energy * cfg.energyAmp;
        p.setAttribute("d", buildPath(phase, amp, cfg.freq));
      }
      rafId = requestAnimationFrame(frame);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* particle constellation behind hero */
  const particleCanvasRef = useRef(null);
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let particles = [];
    let mouse = { x: -9999, y: -9999 };
    let rafId = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor((w * h) / 16000);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 1.4 + 0.4,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    const frame = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        if (!reduceMotion) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(196,132,252,0.55)";
        ctx.fill();
      }

      // link nearby particles
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            const alpha = (1 - Math.sqrt(d2) / 110) * 0.18;
            ctx.strokeStyle = `rgba(168,85,247,${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        // link to mouse
        const dx = a.x - mouse.x;
        const dy = a.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 160 * 160) {
          const alpha = (1 - Math.sqrt(d2) / 160) * 0.55;
          ctx.strokeStyle = `rgba(196,132,252,${alpha.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* ─── icons ─── */
  const MerchantSuccessIcon = (
    <svg className="skill-logo-img" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 11H7a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2z"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
      <circle cx="12" cy="15.5" r="1" fill="rgba(255,255,255,0.85)" stroke="none"/>
    </svg>
  );

  const McpIcon = (
    <svg className="skill-logo-img" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.88)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="1.6" fill="rgba(196,132,252,0.85)" stroke="none" />
      <circle cx="5" cy="18" r="1.6" fill="rgba(196,132,252,0.85)" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="rgba(196,132,252,0.85)" stroke="none" />
      <path d="M6.4 6.7 17.6 11.3" />
      <path d="M6.4 17.3 17.6 12.7" />
    </svg>
  );

  const WebDevIcon = (
    <svg className="skill-logo-img" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.88)" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 7 3 12 8 17" />
      <polyline points="16 7 21 12 16 17" />
      <line x1="14" y1="5" x2="10" y2="19" />
    </svg>
  );

  const SeoIcon = (
    <svg className="skill-logo-img" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.88)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10.5" cy="10.5" r="5.5" />
      <line x1="14.5" y1="14.5" x2="20" y2="20" />
      <polyline points="8 11.5 10 9.5 12 11 13.5 8.5" />
    </svg>
  );

  const WifiIcon = (
    <svg className="skill-logo-img" viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.85)" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <path d="M5 12.859a10 10 0 0 1 14 0" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <circle cx="12" cy="20" r="1" fill="rgba(255,255,255,0.85)" stroke="none" />
    </svg>
  );

  const MountainIcon = (
    <svg className="skill-logo-img" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="mountainWhiteBlack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(0,0,0,1)" />
        </linearGradient>
      </defs>
      <path d="M2 18 L6 5 L9 11 L12 3 L15 11 L18 5 L22 18 L12 22 Z" fill="url(#mountainWhiteBlack)" />
    </svg>
  );

  /* ─── categorized skills ─── */
  const skillCategories = [
    {
      label: "AI & Automation",
      items: [
        { name: "Claude",      src: "https://cdn.simpleicons.org/anthropic/ffffff" },
        { name: "ChatGPT",     src: "/icons/chatgpt.svg" },
        { name: "Apps Script", src: "https://cdn.simpleicons.org/googleappsscript/ffffff" },
        { name: "MCP Servers", icon: McpIcon },
      ],
    },
    {
      label: "Build & Deploy",
      items: [
        { name: "GitHub",          src: "https://cdn.simpleicons.org/github/ffffff" },
        { name: "Vercel",          src: "https://cdn.simpleicons.org/vercel/ffffff" },
        { name: "Web Development", icon: WebDevIcon },
      ],
    },
    {
      label: "Data & Design",
      items: [
        { name: "Sigma", src: "/icons/sigma.svg" },
        { name: "Figma", src: "https://cdn.simpleicons.org/figma/ffffff" },
        { name: "Retool", src: "https://cdn.simpleicons.org/retool/ffffff" },
      ],
    },
    {
      label: "Growth",
      items: [
        { name: "SEO", icon: SeoIcon },
      ],
    },
    {
      label: "Customer Ops",
      items: [
        { name: "Intercom",         src: "https://cdn.simpleicons.org/intercom/ffffff" },
        { name: "Zendesk",          src: "https://cdn.simpleicons.org/zendesk/ffffff" },
        { name: "Kustomer",         src: "/icons/kustomer.svg" },
        { name: "Gorgias",          src: "/icons/gorgias.svg" },
        { name: "Postmark",         src: "/icons/postmark.svg" },
        { name: "Slack",            src: "/icons/slack.svg" },
        { name: "Merchant Success", icon: MerchantSuccessIcon },
      ],
    },
  ];

  const videos = [
    { id: "v1", url: "/video1.mp4", thumb: WifiIcon },
    { id: "v2", url: "/video2.mp4", thumb: MountainIcon },
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
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-orb bg-orb--1" aria-hidden="true" />
      <div className="bg-orb bg-orb--2" aria-hidden="true" />
      <div className="bg-orb bg-orb--3" aria-hidden="true" />

      <div className="bg-waves" aria-hidden="true">
        {[1, 2, 3, 4].map((n, i) => (
          <div key={n} className={`wave-layer wave-layer--${n}`}>
            <svg viewBox="0 0 1440 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`wg${n}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={n % 2 ? "#7c3aed" : "#a855f7"} stopOpacity="0" />
                  <stop offset="50%" stopColor={n % 2 ? "#7c3aed" : "#a855f7"} stopOpacity="1" />
                  <stop offset="100%" stopColor={n % 2 ? "#7c3aed" : "#a855f7"} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path ref={(el) => { wavePathsRef.current[i] = el; }} d="" stroke={`url(#wg${n})`} />
            </svg>
          </div>
        ))}
      </div>

      <Hud />

      {/* HERO */}
      <section id="top" className="hero">
        <canvas ref={particleCanvasRef} className="hero-canvas" aria-hidden="true" />

        <div className="hero-inner">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            <span className="hero-badge-text">SYSTEM · ONLINE</span>
          </div>

          <div className="hero-terminal">
            <span className="hero-prompt">~/joey</span>
            <span className="hero-prompt-sep">$</span>
            <span className="hero-prompt-cmd">whoami</span>
          </div>

          <h1 className="hero-name">
            <span className="hero-name-text">{typed}</span>
            <GlowCursor done={nameDone} />
          </h1>

          <div className={`hero-below${nameDone ? " hero-below--show" : ""}`}>
            <div className="hero-tags">
              <span className="hero-tag">Head of Risk · Fragile</span>
              <span className="hero-tag hero-tag--ghost">Real Estate · Waco, TX</span>
              <span className="hero-tag hero-tag--ghost">Builder</span>
            </div>
            <div className="hero-photo-wrap">
              <img src="/joey.png" alt="Joey Fraser" className="hero-photo" />
              <span className="hero-photo-ring" aria-hidden="true" />
            </div>
          </div>
        </div>

        <a href="#about" className="scroll-hint" aria-label="Scroll to about">
          <span className="scroll-line" />
          <span className="scroll-label">scroll</span>
        </a>
      </section>

      {/* ABOUT */}
      <section id="about" className="section">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-num">/01</span>
            <span className="section-tag">About</span>
          </div>
          <p ref={descRef} className={`about-text${descInView ? " about-text--show" : ""}`}>
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
            <StatCard value="200+"  label="Ecommerce stores scaled" delay={90} />
            <StatCard value="24"    label="Real estate units owned" delay={180} />
            <StatCard value="$1.1M+" label="Credit lines secured" delay={270} />
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section id="skills" className="section">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-num">/02</span>
            <span className="section-tag">Skills</span>
          </div>
          <div className="skill-categories">
            {skillCategories.map((cat, i) => (
              <SkillCategory key={cat.label} {...cat} baseDelay={i * 60} />
            ))}
          </div>
        </div>
      </section>

      {/* WORK */}
      <section id="work" className="section">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-num">/03</span>
            <span className="section-tag">Professional Background</span>
          </div>
          <div className="roles-list">
            {roles.map((role, i) => (
              <RoleCard key={role.number} {...role} delay={i * 100} />
            ))}
          </div>
        </div>
      </section>

      {/* PROJECTS */}
      <section id="projects" className="section">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-num">/04</span>
            <span className="section-tag">Projects</span>
            <span className="section-sync" title="Auto-synced from Vercel at build time">
              <span className="section-sync-dot" />
              <span className="section-sync-text">
                synced from vercel
                {projects.fetchedAt && ` · ${new Date(projects.fetchedAt).toLocaleDateString()}`}
              </span>
            </span>
          </div>

          {projects.projects.length > 0 ? (
            <div className="project-grid">
              {projects.projects.map((p, i) => (
                <ProjectCard key={p.name} {...p} delay={i * 80} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-state-dot" />
              <span>No projects synced yet. Run <code>npm run build</code> or push to deploy.</span>
            </div>
          )}
        </div>
      </section>

      {/* VIDEOS */}
      <section id="videos" className="section">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-num">/05</span>
            <span className="section-tag">Video Content</span>
          </div>
          <div className="video-rail">
            {videos.map((v) => (
              <VideoCard key={v.id} url={v.url} thumb={v.thumb} />
            ))}
          </div>
        </div>
      </section>

      {/* CONNECT */}
      <section id="connect" className="section">
        <div className="section-inner">
          <div className="section-head">
            <span className="section-num">/06</span>
            <span className="section-tag">Connect</span>
          </div>
          <div className="connect-grid">
            <a className="connect-card" href="https://www.linkedin.com/in/josephfraser/"
               target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <svg className="connect-logo" viewBox="0 0 24 24" fill="rgba(255,255,255,0.88)" aria-hidden="true">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              <span className="connect-label">LinkedIn</span>
            </a>
            <a className="connect-card" href="mailto:connect@imjoey.me" aria-label="Email connect@imjoey.me">
              <img src="https://cdn.simpleicons.org/gmail/ffffff" alt="" className="connect-logo" />
              <span className="connect-label">Email</span>
            </a>
            <a className="connect-card" href="https://github.com/joeyjaf"
               target="_blank" rel="noopener noreferrer" aria-label="GitHub">
              <img src="https://cdn.simpleicons.org/github/ffffff" alt="" className="connect-logo" />
              <span className="connect-label">GitHub</span>
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <span className="footer-name">Joey Fraser</span>
          <span className="footer-rule" aria-hidden="true" />
          <span className="footer-url">imjoey.me</span>
          <span className="footer-rule" aria-hidden="true" />
          <a className="footer-url" href="/about">About</a>
          <span className="footer-rule" aria-hidden="true" />
          <a className="footer-url" href="/press">Press</a>
        </div>
      </footer>
    </div>
  );
}
