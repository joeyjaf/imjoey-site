import React, { useEffect, useMemo, useState, useRef } from "react";
import "./App.css";

const CAN_HOVER =
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─────────────────────────────────────────────
   HOOKS
───────────────────────────────────────────── */
function useDecodeText(text, { startDelay = 700, stepMs = 58, lookahead = 3 } = {}) {
  const [out, setOut] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (REDUCED_MOTION) {
      setOut(text);
      setDone(true);
      return;
    }
    const GLYPHS = "<>/\\|=+*#%?!10{}[]$&";
    let p = 0;
    let interval;
    const t = setTimeout(() => {
      interval = setInterval(() => {
        p++;
        if (p >= text.length) {
          setOut(text);
          setDone(true);
          clearInterval(interval);
          return;
        }
        const scrambleLen = Math.min(lookahead, text.length - p);
        let scramble = "";
        for (let i = 0; i < scrambleLen; i++) {
          scramble += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        setOut(text.slice(0, p) + scramble);
      }, stepMs);
    }, startDelay);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [text, startDelay, stepMs, lookahead]);

  return { typed: out, done };
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
   INTERACTION PRIMITIVES
───────────────────────────────────────────── */
function TiltCard({
  children, className = "", max = 6, as: Tag = "div",
  onMouseMove: extMove, onMouseLeave: extLeave, ...rest
}) {
  const ref = useRef(null);

  const onMove = (e) => {
    if (CAN_HOVER) {
      const el = ref.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--rx", `${((0.5 - py) * max).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${((px - 0.5) * max).toFixed(2)}deg`);
        el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      }
    }
    extMove?.(e);
  };

  const onLeave = (e) => {
    const el = ref.current;
    if (el) {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    }
    extLeave?.(e);
  };

  return (
    <Tag
      ref={ref}
      className={`tilt ${className}`}
      {...rest}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
    </Tag>
  );
}

function Magnetic({ children, className = "", strength = 0.22 }) {
  const ref = useRef(null);

  const onMove = (e) => {
    if (!CAN_HOVER || REDUCED_MOTION) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
  };

  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "";
  };

  return (
    <div ref={ref} className={`magnetic ${className}`} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  );
}

function CursorGlow() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    if (!CAN_HOVER || REDUCED_MOTION) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let hot = false;
    let rafId = 0;

    const onMove = (e) => {
      mx = e.clientX;
      my = e.clientY;
      const t = e.target;
      hot = !!(t.closest && t.closest("a, button, [role='button'], .tilt, .orbit-node"));
    };

    const frame = () => {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      ring.style.transform = `translate(${rx}px, ${ry}px) scale(${hot ? 1.9 : 1})`;
      ring.style.opacity = hot ? "0.9" : "0.5";
      rafId = requestAnimationFrame(frame);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    rafId = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (!CAN_HOVER || REDUCED_MOTION) return null;
  return (
    <>
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
    </>
  );
}

function CountUp({ value, duration = 1600 }) {
  const [ref, inView] = useInView(0.5);
  const parts = useMemo(() => {
    const m = String(value).match(/^([^\d]*)([\d.]+)(.*)$/);
    if (!m) return null;
    return { prefix: m[1], num: parseFloat(m[2]), decimals: m[2].includes(".") ? 1 : 0, suffix: m[3] };
  }, [value]);
  const [disp, setDisp] = useState(() =>
    parts && !REDUCED_MOTION ? `${parts.prefix}0${parts.suffix}` : value
  );

  useEffect(() => {
    if (!inView || !parts || REDUCED_MOTION) return;
    let rafId = 0;
    const t0 = performance.now();
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = parts.num * eased;
      setDisp(`${parts.prefix}${cur.toFixed(parts.decimals)}${parts.suffix}`);
      if (p < 1) rafId = requestAnimationFrame(frame);
      else setDisp(value);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [inView, parts, value, duration]);

  return <span ref={ref}>{disp}</span>;
}

/* ─────────────────────────────────────────────
   CONTENT PRIMITIVES
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

/* ── ABOUT: scroll-driven word reveal ── */
const ABOUT_SEGMENTS = [
  { t: "I work at " },
  { t: "Fragile,", a: true },
  { t: " a company that powers hardware subscription programs for some of the world's leading technology brands. As " },
  { t: "Head of Risk,", a: true },
  { t: " I oversee our entire risk and recovery function, leading strategy across underwriting, delinquency management, and loss mitigation. I design and implement data-driven systems that optimize account performance, streamline recovery operations, and proactively reduce exposure across our portfolio. My focus is on building scalable processes that protect unit economics while preserving customer relationships and long-term brand value." },
];

function AboutReveal() {
  const words = useMemo(() => {
    const out = [];
    for (const seg of ABOUT_SEGMENTS) {
      for (const w of seg.t.split(/\s+/)) {
        if (w) out.push({ t: w, a: !!seg.a });
      }
    }
    return out;
  }, []);

  const ref = useRef(null);
  const [lit, setLit] = useState(REDUCED_MOTION ? words.length : 0);

  useEffect(() => {
    if (REDUCED_MOTION) return;
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.86 - r.top) / (r.height + vh * 0.30)));
      setLit(Math.round(p * words.length));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [words.length]);

  return (
    <p ref={ref} className="about-text" aria-label={ABOUT_SEGMENTS.map(s => s.t).join("")}>
      {words.map((w, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`aw${i < lit ? " aw--on" : ""}${w.a ? " aw--accent" : ""}`}
        >
          {w.t}{" "}
        </span>
      ))}
    </p>
  );
}

/* ── stat card with sparkline ── */
function StatCard({ value, label, spark, delay = 0 }) {
  const [ref, inView] = useInView(0.1);
  return (
    <div
      ref={ref}
      className={`stat-slot${inView ? " stat-slot--show" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <TiltCard className="stat-card" max={7}>
        <div className="stat-value"><CountUp value={value} /></div>
        <div className="stat-label">{label}</div>
        <svg className="stat-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`sg-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7c3aed" stopOpacity="0.1" />
              <stop offset="1" stopColor="#c084fc" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <polyline
            points={spark}
            fill="none"
            stroke={`url(#sg-${label.replace(/\W/g, "")})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={inView ? "stat-spark-line stat-spark-line--draw" : "stat-spark-line"}
          />
        </svg>
        <span className="stat-corner" aria-hidden="true" />
      </TiltCard>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SKILLS — filter console + disc grid
───────────────────────────────────────────── */
function SkillNode({ s, dim, hot }) {
  return (
    <div
      className={`orbit-node${dim ? " orbit-node--dim" : ""}${hot ? " orbit-node--hot" : ""}`}
      style={{ "--node-accent": s.color }}
    >
      <span className="orbit-node-disc">
        <span className="orbit-node-icon">
          {s.icon ?? <SkillLogo src={s.src} name={s.name} />}
        </span>
      </span>
      <span className="orbit-node-label">{s.name}</span>
    </div>
  );
}

function SkillsConsole({ categories }) {
  const [active, setActive] = useState("all");
  const [ref, inView] = useInView(0.05);

  const flat = useMemo(
    () => categories.flatMap((c) => c.items.map((it) => ({ ...it, cat: c.key, color: c.color }))),
    [categories]
  );
  const total = flat.length;
  const activeCat = categories.find((c) => c.key === active);
  const shown = active === "all" ? total : activeCat.items.length;
  const isDim = (s) => active !== "all" && s.cat !== active;
  const isHot = (s) => active !== "all" && s.cat === active;

  return (
    <div ref={ref} className={`orbit-wrap${inView ? " orbit-wrap--show" : ""}`}>
      <div className="orbit-console">
        <div className="orbit-filters" aria-label="Filter skills by category">
          <button
            type="button"
            className={`orbit-filter${active === "all" ? " orbit-filter--active" : ""}`}
            aria-pressed={active === "all"}
            onClick={() => setActive("all")}
            style={{ "--f-accent": "#a855f7" }}
          >
            <span className="orbit-filter-dot" aria-hidden="true" />
            All systems
            <span className="orbit-filter-count">{String(total).padStart(2, "0")}</span>
          </button>
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`orbit-filter${active === c.key ? " orbit-filter--active" : ""}`}
              aria-pressed={active === c.key}
              onClick={() => setActive(active === c.key ? "all" : c.key)}
              style={{ "--f-accent": c.color }}
            >
              <span className="orbit-filter-dot" aria-hidden="true" />
              {c.label}
              <span className="orbit-filter-count">{String(c.items.length).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <div className="orbit-readout" aria-hidden="true">
          <span className="orbit-readout-prompt">$</span>
          {" scan --module=\""}
          {active === "all" ? "all" : activeCat.label.toLowerCase()}
          {"\" → "}
          <span className="orbit-readout-result">{String(shown).padStart(2, "0")}/{total} online</span>
        </div>
      </div>

      <div className="skills-deck">
        {flat.map((s) => (
          <SkillNode key={s.name} s={s} dim={isDim(s)} hot={isHot(s)} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   WORK — drawing timeline
───────────────────────────────────────────── */
function RoleCard({ number, title, subtitle, meta, bullets, delay = 0 }) {
  const [ref, inView] = useInView(0.08);
  return (
    <div
      ref={ref}
      className={`role-slot${inView ? " role-slot--show" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="role-rail" aria-hidden="true">
        <span className="role-rail-dot" />
      </div>
      <TiltCard className="role-card" max={0}>
        <span className="role-beam" aria-hidden="true" />
        <div className="role-number" aria-hidden="true">{number}</div>
        <div className="role-content">
          <div className="role-head">
            <h2 className="role-title">{title}</h2>
            {subtitle && <span className="role-subtitle">{subtitle}</span>}
          </div>
          {meta && <p className="role-meta">{meta}</p>}
          <ul className="role-bullets">
            {bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      </TiltCard>
    </div>
  );
}

function WorkTimeline({ roles }) {
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (REDUCED_MOTION) {
      el.style.setProperty("--draw", "1");
      return;
    }
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = el.getBoundingClientRect();
      const probe = window.innerHeight * 0.72;
      const p = Math.min(1, Math.max(0, (probe - r.top) / r.height));
      el.style.setProperty("--draw", p.toFixed(4));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={listRef} className="roles-list">
      <div className="roles-track" aria-hidden="true">
        <div className="roles-beam-fill" />
        <div className="roles-beam-comet" />
      </div>
      {roles.map((role, i) => (
        <RoleCard key={role.number} {...role} delay={i * 100} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   VIDEOS
───────────────────────────────────────────── */
function VideoCard({ url, thumb }) {
  const [playing, setPlaying] = useState(false);
  return (
    <TiltCard
      max={4}
      className={`video-card${playing ? " video-card--playing" : ""}`}
      onClick={() => !playing && setPlaying(true)}
      role={playing ? undefined : "button"}
      tabIndex={playing ? undefined : 0}
      aria-label={playing ? undefined : "Play video"}
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
    </TiltCard>
  );
}

/* ─────────────────────────────────────────────
   HUD NAV
───────────────────────────────────────────── */
const SECTIONS = [
  { id: "top",      label: "Home" },
  { id: "about",    label: "About" },
  { id: "skills",   label: "Skills" },
  { id: "work",     label: "Work" },
  { id: "videos",   label: "Videos" },
  { id: "connect",  label: "Connect" },
];

function Hud() {
  const now = useLiveClock();
  const progress = useScrollProgress();
  const active = useActiveSection(SECTIONS.map((s) => s.id));

  const time = now.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  return (
    <>
      <div className="hud" role="navigation" aria-label="Primary">
        <a href="#top" className="hud-brand">
          <span className="hud-avatar">
            <picture>
              <source srcSet="/joey.webp" type="image/webp" />
              <img src="/joey.png" alt="" width="512" height="512" />
            </picture>
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
   SECTION HEAD
───────────────────────────────────────────── */
function SectionHead({ num, tag }) {
  return (
    <div className="section-head">
      <span className="section-ghost" aria-hidden="true">{num.replace("/", "")}</span>
      <span className="section-num">{num}</span>
      <span className="section-tag">{tag}</span>
      <span className="section-line" aria-hidden="true" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   APP
───────────────────────────────────────────── */
const TICKER_TERMS = [
  "Risk operations", "Underwriting", "Collections & recovery",
  "Hardware subscriptions", "Subscription economy", "Consumer credit",
  "Real estate investing", "E-commerce operations",
];

export default function App() {
  const heroName = "joey fraser.";
  const { typed, done: nameDone } = useDecodeText(heroName, { startDelay: 650, stepMs: 60 });
  const [copied, setCopied] = useState(false);

  /* aurora ribbons — full-page canvas, scroll-velocity-reactive */
  const ribbonCanvasRef = useRef(null);
  useEffect(() => {
    const canvas = ribbonCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let W = 0, H = 0, rafId = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const RIBBONS = [
      { band: 0.16, hue: 262, amp1: 22, amp2: 30, f1: 1.6, f2: 3.3, sp1: 0.20, sp2: -0.31, drift: 0.05, alpha: 0.05 },
      { band: 0.50, hue: 274, amp1: 28, amp2: 36, f1: 1.2, f2: 2.7, sp1: -0.16, sp2: 0.26, drift: -0.04, alpha: 0.045 },
      { band: 0.84, hue: 288, amp1: 24, amp2: 42, f1: 1.9, f2: 2.2, sp1: 0.14, sp2: -0.22, drift: 0.06, alpha: 0.055 },
    ];
    const STRANDS = 3;
    const POINTS = 64;

    let energy = 0;
    let scrollPhase = 0;
    let timePhase = 0;
    let lastY = window.scrollY;
    let lastFrame = performance.now();

    const onScroll = () => {
      if (REDUCED_MOTION) return;
      const curY = window.scrollY;
      const delta = curY - lastY;
      scrollPhase += delta * 0.004;
      energy = Math.min(1, energy + Math.abs(delta) * 0.012);
      lastY = curY;
    };

    const frame = (now) => {
      const dt = Math.min(0.06, (now - lastFrame) / 1000);
      lastFrame = now;
      if (!REDUCED_MOTION) timePhase += dt;
      energy = Math.max(0, energy - dt * 1.3);

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      for (const r of RIBBONS) {
        const baseY = H * r.band + Math.sin(timePhase * r.drift * 4) * 24;
        const surge = 1 + energy * 1.8;
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0,    `hsla(${r.hue}, 85%, 66%, 0)`);
        grad.addColorStop(0.25, `hsla(${r.hue}, 85%, 66%, ${(r.alpha * (1 + energy)).toFixed(3)})`);
        grad.addColorStop(0.55, `hsla(${r.hue + 12}, 90%, 72%, ${(r.alpha * 1.6 * (1 + energy)).toFixed(3)})`);
        grad.addColorStop(0.8,  `hsla(${r.hue}, 85%, 66%, ${(r.alpha * (1 + energy)).toFixed(3)})`);
        grad.addColorStop(1,    `hsla(${r.hue}, 85%, 66%, 0)`);
        ctx.strokeStyle = grad;

        for (let s = 0; s < STRANDS; s++) {
          const strandPhase = s * 0.9;
          const strandOff = (s - 1) * 13;
          ctx.lineWidth = s === 1 ? 1.6 : 1;
          ctx.beginPath();
          for (let i = 0; i <= POINTS; i++) {
            const t = i / POINTS;
            const x = t * W;
            const y =
              baseY + strandOff +
              Math.sin(t * r.f1 * Math.PI * 2 + timePhase * r.sp1 * 6 + scrollPhase + strandPhase) * r.amp1 * surge +
              Math.sin(t * r.f2 * Math.PI * 2 - timePhase * r.sp2 * 6 - scrollPhase * 0.7 + strandPhase) * r.amp2 * 0.5 * surge;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";

      rafId = requestAnimationFrame(frame);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    rafId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* 3D starfield + shooting stars behind hero */
  const particleCanvasRef = useRef(null);
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const FOV = 1.6;
    let stars = [];
    let shots = [];
    let nextShot = 2.4;
    let mouse = { x: 0, y: 0, px: 0, py: 0, inside: false };
    let rotY = 0;
    let rafId = 0;
    let W = 0, H = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(150, Math.floor((W * H) / 11000));
      stars = Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: (Math.random() - 0.5) * 2,
        tw: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 0.8,
        hue: 262 + Math.random() * 28,
        ox: 0, oy: 0,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.px = (mouse.x / W - 0.5) * 2;
      mouse.py = (mouse.y / H - 0.5) * 2;
      mouse.inside = true;
    };
    const onLeave = () => { mouse.inside = false; };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    let lastFrame = performance.now();
    const projected = [];

    const frame = (now) => {
      const dt = Math.min(0.06, (now - lastFrame) / 1000);
      lastFrame = now;
      if (!REDUCED_MOTION) rotY += dt * 0.05;

      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const radius = Math.min(W, H) * 0.78;
      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const parX = mouse.inside ? mouse.px : 0;
      const parY = mouse.inside ? mouse.py : 0;

      projected.length = 0;
      for (const s of stars) {
        s.tw += dt * s.sp;
        const x3 = s.x * cosR - s.z * sinR;
        const z3 = s.x * sinR + s.z * cosR;
        const scale = FOV / (FOV + z3);
        let sx = cx + x3 * radius * scale + parX * 26 * scale;
        let sy = cy + s.y * radius * 0.6 * scale + parY * 20 * scale;

        if (mouse.inside && !REDUCED_MOTION) {
          const dx = sx - mouse.x;
          const dy = sy - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 130 * 130 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / 130) * 30;
            s.ox += ((dx / d) * push - s.ox) * 0.08;
            s.oy += ((dy / d) * push - s.oy) * 0.08;
          } else {
            s.ox *= 0.92; s.oy *= 0.92;
          }
        } else {
          s.ox *= 0.92; s.oy *= 0.92;
        }
        sx += s.ox;
        sy += s.oy;

        const twinkle = 0.6 + 0.4 * Math.sin(s.tw);
        const alpha = (0.18 + 0.55 * ((scale - 0.55) / 0.9)) * twinkle;
        const size = Math.max(0.4, 1.7 * scale);
        projected.push({ sx, sy, scale, alpha, size, hue: s.hue });
      }

      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        for (let j = i + 1; j < projected.length; j++) {
          const b = projected[j];
          const dx = a.sx - b.sx;
          const dy = a.sy - b.sy;
          const d2 = dx * dx + dy * dy;
          if (d2 < 110 * 110) {
            const depth = Math.min(a.scale, b.scale);
            const alpha = (1 - Math.sqrt(d2) / 110) * 0.16 * depth;
            ctx.strokeStyle = `hsla(270, 80%, 70%, ${alpha.toFixed(3)})`;
            ctx.lineWidth = depth;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      for (const p of projected) {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 76%, ${Math.max(0, p.alpha).toFixed(3)})`;
        ctx.fill();
        if (p.scale > 1.15) {
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, p.size * 3.4, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${(p.alpha * 0.10).toFixed(3)})`;
          ctx.fill();
        }
      }

      if (mouse.inside) {
        for (const p of projected) {
          const dx = p.sx - mouse.x;
          const dy = p.sy - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 170 * 170) {
            const alpha = (1 - Math.sqrt(d2) / 170) * 0.45 * p.scale;
            ctx.strokeStyle = `hsla(280, 90%, 78%, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.sx, p.sy);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      /* shooting stars */
      if (!REDUCED_MOTION) {
        nextShot -= dt;
        if (nextShot <= 0) {
          nextShot = 2.2 + Math.random() * 3.4;
          const fromLeft = Math.random() > 0.5;
          shots.push({
            x: fromLeft ? -40 : W + 40,
            y: Math.random() * H * 0.55,
            vx: (fromLeft ? 1 : -1) * (520 + Math.random() * 380),
            vy: 130 + Math.random() * 140,
            life: 1,
          });
        }
        for (let i = shots.length - 1; i >= 0; i--) {
          const sh = shots[i];
          sh.x += sh.vx * dt;
          sh.y += sh.vy * dt;
          sh.life -= dt * 0.7;
          if (sh.life <= 0 || sh.x < -120 || sh.x > W + 120 || sh.y > H + 60) {
            shots.splice(i, 1);
            continue;
          }
          const tail = 90;
          const nx = sh.vx / Math.hypot(sh.vx, sh.vy);
          const ny = sh.vy / Math.hypot(sh.vx, sh.vy);
          const g = ctx.createLinearGradient(sh.x, sh.y, sh.x - nx * tail, sh.y - ny * tail);
          g.addColorStop(0, `hsla(280, 95%, 82%, ${(0.8 * sh.life).toFixed(3)})`);
          g.addColorStop(1, "hsla(280, 95%, 82%, 0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(sh.x, sh.y);
          ctx.lineTo(sh.x - nx * tail, sh.y - ny * tail);
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

  /* hero parallax vars — photo + floating data panels drift on cursor */
  const heroRef = useRef(null);
  useEffect(() => {
    if (!CAN_HOVER || REDUCED_MOTION) return;
    const el = heroRef.current;
    if (!el) return;
    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      el.style.setProperty("--hpx", nx.toFixed(3));
      el.style.setProperty("--hpy", ny.toFixed(3));
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const copyEmail = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText("connect@imjoey.me").then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }).catch(() => {});
    }
  };

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
      key: "ai",
      color: "#c084fc",
      label: "AI & Automation",
      items: [
        { name: "Claude",      src: "https://cdn.simpleicons.org/anthropic/ffffff" },
        { name: "ChatGPT",     src: "/icons/chatgpt.svg" },
        { name: "Apps Script", src: "https://cdn.simpleicons.org/googleappsscript/ffffff" },
        { name: "MCP Servers", icon: McpIcon },
      ],
    },
    {
      key: "build",
      color: "#8b5cf6",
      label: "Build & Deploy",
      items: [
        { name: "GitHub",          src: "https://cdn.simpleicons.org/github/ffffff" },
        { name: "Vercel",          src: "https://cdn.simpleicons.org/vercel/ffffff" },
        { name: "Web Development", icon: WebDevIcon },
      ],
    },
    {
      key: "data",
      color: "#818cf8",
      label: "Data & Design",
      items: [
        { name: "Sigma", src: "/icons/sigma.svg" },
        { name: "Figma", src: "https://cdn.simpleicons.org/figma/ffffff" },
        { name: "Retool", src: "https://cdn.simpleicons.org/retool/ffffff" },
      ],
    },
    {
      key: "growth",
      color: "#e879f9",
      label: "Growth",
      items: [
        { name: "SEO", icon: SeoIcon },
      ],
    },
    {
      key: "ops",
      color: "#a78bfa",
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
      <CursorGlow />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-aurora" aria-hidden="true" />
      <div className="bg-orb bg-orb--1" aria-hidden="true" />
      <div className="bg-orb bg-orb--2" aria-hidden="true" />
      <div className="bg-orb bg-orb--3" aria-hidden="true" />
      <div className="bg-noise" aria-hidden="true" />
      <canvas ref={ribbonCanvasRef} className="bg-ribbons" aria-hidden="true" />

      <Hud />

      {/* HERO */}
      <section id="top" className="hero" ref={heroRef}>
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
            <span className="hero-name-text" data-text={typed}>{typed}</span>
            <GlowCursor done={nameDone} />
          </h1>

          <div className={`hero-below${nameDone ? " hero-below--show" : ""}`}>
            <div className="hero-tags">
              <span className="hero-tag">Head of Risk · Fragile</span>
              <span className="hero-tag hero-tag--ghost">Real Estate · Waco, TX</span>
              <span className="hero-tag hero-tag--ghost">Builder</span>
            </div>
            <div className="hero-photo-wrap">
              <span className="hero-photo-halo" aria-hidden="true" />
              <picture>
                <source srcSet="/joey.webp" type="image/webp" />
                <img
                  src="/joey.png"
                  alt="Joey Fraser"
                  className="hero-photo"
                  width="512"
                  height="512"
                  fetchPriority="high"
                />
              </picture>
              <span className="hero-photo-ring" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="hero-ticker" aria-hidden="true">
          <div className="hero-ticker-track">
            {[0, 1].map((copy) => (
              <div className="hero-ticker-group" key={copy}>
                {TICKER_TERMS.map((t) => (
                  <span className="hero-ticker-item" key={`${copy}-${t}`}>
                    {t}
                    <span className="hero-ticker-sep">✦</span>
                  </span>
                ))}
              </div>
            ))}
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
          <SectionHead num="/01" tag="About" />
          <AboutReveal />
          <div className="stats-grid">
            <StatCard value="$10M+" label="Net profit generated"
              spark="0,24 14,20 28,21 42,14 56,16 70,9 84,10 100,3" delay={0} />
            <StatCard value="200+" label="Ecommerce stores scaled"
              spark="0,25 14,22 28,18 42,19 56,12 70,13 84,7 100,4" delay={90} />
            <StatCard value="24" label="Real estate units owned"
              spark="0,26 14,24 28,24 42,18 56,17 70,11 84,11 100,5" delay={180} />
            <StatCard value="$1.1M+" label="Credit lines secured"
              spark="0,23 14,24 28,17 42,18 56,10 70,12 84,6 100,2" delay={270} />
          </div>
        </div>
      </section>

      {/* SKILLS */}
      <section id="skills" className="section">
        <div className="section-inner">
          <SectionHead num="/02" tag="Skills" />
          <SkillsConsole categories={skillCategories} />
        </div>
      </section>

      {/* WORK */}
      <section id="work" className="section">
        <div className="section-inner">
          <SectionHead num="/03" tag="Professional Background" />
          <WorkTimeline roles={roles} />
        </div>
      </section>

      {/* VIDEOS */}
      <section id="videos" className="section">
        <div className="section-inner">
          <SectionHead num="/04" tag="Video Content" />
          <div className="video-rail">
            {videos.map((v) => (
              <VideoCard key={v.id} url={v.url} thumb={v.thumb} />
            ))}
          </div>
        </div>
      </section>

      {/* CONNECT */}
      <section id="connect" className="section section--connect">
        <div className="section-inner">
          <SectionHead num="/05" tag="Connect" />
          <h2 className="connect-headline">
            Open a <span className="connect-headline-accent">channel</span><span className="connect-headline-dot">.</span>
          </h2>
          <div className="connect-grid">
            <Magnetic>
              <TiltCard as="a" className="connect-card" max={8} href="https://www.linkedin.com/in/josephfraser/"
                 target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                <svg className="connect-logo" viewBox="0 0 24 24" fill="rgba(255,255,255,0.88)" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                <span className="connect-label">LinkedIn</span>
                <span className="connect-handle">/in/josephfraser</span>
              </TiltCard>
            </Magnetic>
            <Magnetic>
              <TiltCard as="a" className="connect-card" max={8} href="mailto:connect@imjoey.me" aria-label="Email connect@imjoey.me">
                <img src="https://cdn.simpleicons.org/gmail/ffffff" alt="" className="connect-logo" />
                <span className="connect-label">Email</span>
                <span className="connect-handle">connect@imjoey.me</span>
              </TiltCard>
            </Magnetic>
            <Magnetic>
              <TiltCard as="a" className="connect-card" max={8} href="https://github.com/joeyjaf"
                 target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                <img src="https://cdn.simpleicons.org/github/ffffff" alt="" className="connect-logo" />
                <span className="connect-label">GitHub</span>
                <span className="connect-handle">@joeyjaf</span>
              </TiltCard>
            </Magnetic>
          </div>
          <div className="connect-copy">
            <span className="connect-copy-prompt" aria-hidden="true">$</span>
            <span className="connect-copy-cmd" aria-hidden="true">cp</span>
            <span className="connect-copy-mail">connect@imjoey.me</span>
            <button type="button" className="connect-copy-btn" onClick={copyEmail}>
              {copied ? "copied ✓" : "copy"}
            </button>
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
