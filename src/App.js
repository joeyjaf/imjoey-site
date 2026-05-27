import React, { useEffect, useState } from "react";
import "./App.css";

function useTypewriter(text, { speedMs = 14 } = {}) {
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    if (charIndex >= text.length) return;
    const t = setTimeout(() => setCharIndex((c) => c + 1), speedMs);
    return () => clearTimeout(t);
  }, [charIndex, text, speedMs]);

  return { typed: text.slice(0, charIndex), done: charIndex >= text.length };
}

function Cursor() {
  return <span className="cursor" aria-hidden="true">&nbsp;</span>;
}

function VideoRail({ title, videos }) {
  return (
    <section className="section">
      <div className="sectionHeader">
        <h2 className="sectionTitle">{title}</h2>
      </div>

      {videos.length === 0 ? (
        <div className="emptyRail">
          <div className="emptyRailInner">
            <div className="emptyRailTitle">Coming soon</div>
            <div className="emptyRailHint">No videos added yet.</div>
          </div>
        </div>
      ) : (
        <div className="rail" role="region" aria-label={`${title} carousel`}>
          {videos.map((v) => (
            <div key={v.id} className="videoCard">
              <video className="video" src={v.url} controls preload="metadata" />
              <div className="videoMeta">
                <div className="videoName" title={v.name}>{v.name}</div>
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
    `I work at Fragile, a company that powers hardware subscription programs for some of the world's leading technology brands. ` +
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

  const { typed, done: greetingDone } = useTypewriter(greeting, { speedMs: 14 });

  // MUST exist in /public
  const videos = [
    { id: "v1", name: "Video 1", url: "/video1.mp4" },
    { id: "v2", name: "Video 2", url: "/video2.mp4" },
  ];

  const testimonials = []; // add later

  return (
    <div className="page">
      <div className="frame" role="main" aria-label="Joey personal site">
        <div className="topRow">
          <div className={"photoSlot" + (greetingDone ? " photoSlot--show" : "")}>
            <div className="photoCard">
              <div className="photoHeader"></div>
              <div className="photoPreview">
                <img className="photoImg" src="/joey.png" alt="Joey headshot" />
              </div>
            </div>
          </div>
          <div className="terminalText" aria-label="Typed introduction">
            <pre className="pre">
              {typed}
              {!greetingDone && <Cursor />}
            </pre>
            {greetingDone && (
              <div className="fadeIn">
                <p className="bodyText">{description}</p>
                <p className="bodyText bodyText--header">{bgHeader}</p>
                <pre className="pre bodyText">{bgBody}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="rails rails--show">
          <VideoRail title="Video Content" videos={videos} />
        </div>

        <div className="rails rails--show">
          <VideoRail title="Client Testimonials" videos={testimonials} />
        </div>

        <div className="footerHint">
          <span className="muted">Tip:</span> This page is intentionally "terminal-like" with a bordered frame and typed reveal.
        </div>
      </div>
    </div>
  );
}
