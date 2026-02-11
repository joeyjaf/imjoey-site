import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function useTypewriter(steps, { speedMs = 18, pauseMs = 500 } = {}) {
  // steps: [{ id, text }]
  const [stepIndex, setStepIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);

  const current = steps[stepIndex] || null;

  useEffect(() => {
    if (!current) {
      setIsDone(true);
      return;
    }

    const isStepDone = charIndex >= current.text.length;

    let t;
    if (!isStepDone) {
      t = setTimeout(() => setCharIndex((c) => c + 1), speedMs);
    } else {
      t = setTimeout(() => {
        setStepIndex((i) => i + 1);
        setCharIndex(0);
      }, pauseMs);
    }

    return () => clearTimeout(t);
  }, [current, charIndex, speedMs, pauseMs]);

  const typedById = useMemo(() => {
    const map = {};
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (i < stepIndex) map[s.id] = s.text;
      else if (i === stepIndex) map[s.id] = s.text.slice(0, clamp(charIndex, 0, s.text.length));
      else map[s.id] = "";
    }
    return map;
  }, [steps, stepIndex, charIndex]);

  const cursorId = current?.id ?? null;

  return { typedById, cursorId, isDone, stepIndex };
}

function Cursor({ visible }) {
  return (
    <span className={"cursor" + (visible ? " cursor--on" : "")} aria-hidden="true">
      &nbsp;
    </span>
  );
}

function VideoRail({ title, videos, onAdd, onRemove }) {
  const inputRef = useRef(null);

  return (
    <section className="section">
      <div className="sectionHeader">
        <h2 className="sectionTitle">{title}</h2>
        <div className="railActions">
          <button
            className="btn"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            Upload videos
          </button>
          <input
            ref={inputRef}
            className="hiddenInput"
            type="file"
            accept="video/*"
            multiple
            onChange={(e) => onAdd(e.target.files)}
          />
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="emptyRail">
          <div className="emptyRailInner">
            <div className="emptyRailTitle">No videos yet</div>
            <div className="emptyRailHint">Upload videos to populate this carousel.</div>
          </div>
        </div>
      ) : (
        <div className="rail" role="region" aria-label={`${title} carousel`}>
          {videos.map((v) => (
            <div key={v.id} className="videoCard">
              <video className="video" src={v.url} controls preload="metadata" />
              <div className="videoMeta">
                <div className="videoName" title={v.name}>{v.name}</div>
                <button className="btn btn--ghost" type="button" onClick={() => onRemove(v.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const greeting = `Hi, I'm Joey.`;
  const description =
    `I work at Fragile, a company that powers hardware subscription programs for some of the world’s leading technology brands. ` +
    `As Head of Risk, I oversee our entire risk and recovery function, leading strategy across underwriting, delinquency management, and loss mitigation. ` +
    `I design and implement data-driven systems that optimize account performance, streamline recovery operations, and proactively reduce exposure across our portfolio. ` +
    `My focus is on building scalable processes that protect unit economics while preserving customer relationships and long-term brand value.`;

  const bgHeader = `Professional Background`;
  const bgBody =
    `1) Project WiFi\n` +
    `Co-Owner and CFO of Project WiFi\n` +
    `• Opened, managed, and scaled over 200 profitable ecommerce stores on behalf of our clients\n` +
    `• Conducted sales calls and presentations resulting in over $1,000,000 in net profit as a start-up, with $600,000+ from my personal network with no additional advertising\n` +
    `• Oversaw and developed 100+ employees domestically and overseas\n` +
    `• Generated over $10,000,000 in net profit since inception\n` +
    `• Conducted ongoing high-level support with high-ticket clients via Discord, text, phone, and in person\n` +
    `• Managed and accounted for six figures of receivables and expenditures monthly\n\n` +
    `2) Real Estate Investor\n` +
    `• Own and operate 24 units in Waco, TX\n\n` +
    `3) Credit Scaling Specialist\n` +
    `On a network basis, I help friends and family scale and leverage their credit for business\n` +
    `• Understand bank limits and underwriting processes to maximize outcomes\n` +
    `• Client Count: 28+\n` +
    `• Credit Lines Gained: $1,100,000+\n` +
    `• Sign Up Bonuses Earned: $42,000+\n` +
    `• # of Card Approvals: 130+\n` +
    `• Businesses Launched: 10+`;

  // Steps are typed in order; we show photo upload after "greeting" finishes but before "description" starts.
  const steps = useMemo(
    () => [
      { id: "greeting", text: greeting },
      { id: "desc", text: "\n\n" + description },
      { id: "bgHeader", text: "\n\n" + bgHeader },
      { id: "bgBody", text: "\n\n" + bgBody },
      { id: "videoHeader", text: "\n\nVideo Content:" },
      { id: "testimonialHeader", text: "\n\nClient testimonials:" },
    ],
    []
  );

  const { typedById, cursorId, stepIndex } = useTypewriter(steps, {
    speedMs: 14,     // typing speed
    pauseMs: 420,    // pause between blocks
  });

  const greetingDone = stepIndex >= 1; // after greeting step completes
  const descriptionStarted = stepIndex >= 1; // desc starts at index 1
  const showPhoto = greetingDone && !descriptionStarted ? true : greetingDone; // visible once greeting is done

  const [photoUrl, setPhotoUrl] = useState(null);
  const photoInputRef = useRef(null);

  useEffect(() => {
    return () => {
      // cleanup blob urls
      if (photoUrl?.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const onPickPhoto = (file) => {
    if (!file) return;
    if (photoUrl?.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
  };

  const [videos, setVideos] = useState([]);
  const [testimonials, setTestimonials] = useState([]);

  const addVideoFiles = (files, setter) => {
    if (!files || files.length === 0) return;
    const next = [];
    for (const f of Array.from(files)) {
      const url = URL.createObjectURL(f);
      next.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: f.name,
        url,
      });
    }
    setter((prev) => [...prev, ...next]);
  };

  const removeVideo = (id, list, setter) => {
    setter((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target?.url?.startsWith("blob:")) URL.revokeObjectURL(target.url);
      return prev.filter((x) => x.id !== id);
    });
  };

  const allText =
    (typedById.greeting || "") +
    (typedById.desc || "") +
    (typedById.bgHeader || "") +
    (typedById.bgBody || "") +
    (typedById.videoHeader || "") +
    (typedById.testimonialHeader || "");

  // Determine where cursor should appear:
  // It belongs at the end of the currently-typing step's text.
  const cursorVisible = true;

  return (
    <div className="page">
      <div className="frame" role="main" aria-label="Joey personal site">
        <div className="topRow">
          <div className="terminalText" aria-label="Typed introduction">
            <pre className="pre">
              {allText}
              <Cursor visible={cursorVisible} />
            </pre>
          </div>

          <div className={"photoSlot" + (showPhoto ? " photoSlot--show" : "")}>
            <div className="photoCard">
              <div className="photoHeader">
                <div className="photoTitle">Photo</div>
              </div>
              <div className="photoPreview">
                <img className="photoImg" src="/joey.jpg" alt="Joey headshot" />
            </div>
            </div>
          </div>
        </div>

        {/* Carousels appear once their headers have been typed */}
        <div className={"rails" + (typedById.videoHeader ? " rails--show" : "")}>
          <VideoRail
            title="Video Content"
            videos={videos}
            onAdd={(files) => addVideoFiles(files, setVideos)}
            onRemove={(id) => removeVideo(id, videos, setVideos)}
          />
        </div>

        <div className={"rails" + (typedById.testimonialHeader ? " rails--show" : "")}>
          <VideoRail
            title="Client Testimonials"
            videos={testimonials}
            onAdd={(files) => addVideoFiles(files, setTestimonials)}
            onRemove={(id) => removeVideo(id, testimonials, setTestimonials)}
          />
        </div>

        <div className="footerHint">
          <span className="muted">Tip:</span> This page is intentionally “terminal-like” with a bordered frame and typed reveal.
        </div>
      </div>
    </div>
  );
}
