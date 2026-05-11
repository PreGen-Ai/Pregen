import { Sparkles, Users, ClipboardCheck, Bot } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="lp-hero">
      {/* Glow layers */}
      <div className="lp-hero__glow-orange" aria-hidden="true" />
      <div className="lp-hero__glow-blue"   aria-hidden="true" />

      <div className="lp-container lp-hero__content">
        {/* Badge */}
        <div className="lp-hero__badge">
          <Sparkles size={14} strokeWidth={2.5} />
          AI-Powered Learning Platform
        </div>

        {/* Headline */}
        <h1 className="lp-hero__title">
          Smarter learning with<br />
          <span className="blue">AI</span><br />
          <span className="blue underline-wave">assisstance</span><br />
          <span className="dim">by your side</span>
        </h1>

        {/* Subtitle */}
        <p className="lp-hero__subtitle">
          Learn smarter with an AI&#8209;powered LMS that adapts to you,
          generates smart assessments, and simplifies learning from A&nbsp;to&nbsp;Z.
        </p>

        {/* CTAs */}
        <div className="lp-hero__ctas">
          <a href="https://preprod-pregen.netlify.app/" className="lp-btn lp-btn--primary">
            Start Learning Free&nbsp;→
          </a>
          <a href="#features" className="lp-btn lp-btn--secondary-dark">
            Explore features
          </a>
        </div>

        {/* Stats */}
        <div className="lp-hero__stats">
          <div className="lp-hero__stat">
            <Users size={20} strokeWidth={2} className="lp-hero__stat-icon" />
            <div>
              <span className="lp-hero__stat-value">650k+</span>
              <span className="lp-hero__stat-label">Active students</span>
            </div>
          </div>
          <div className="lp-hero__stat">
            <ClipboardCheck size={20} strokeWidth={2} className="lp-hero__stat-icon" />
            <div>
              <span className="lp-hero__stat-value">1,200</span>
              <span className="lp-hero__stat-label">Smart quizzes</span>
            </div>
          </div>
          <div className="lp-hero__stat">
            <Bot size={20} strokeWidth={2} className="lp-hero__stat-icon" />
            <div>
              <span className="lp-hero__stat-value">24/7</span>
              <span className="lp-hero__stat-label">AI tutor support</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
