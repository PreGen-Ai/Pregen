import { BrainCircuit, Route, ClipboardCheck, WandSparkles, SearchCheck, MessageCircleQuestion } from "lucide-react";

const FEATURES = [
  {
    icon: <BrainCircuit size={24} strokeWidth={2} />,
    iconBg: "rgba(47,111,237,0.12)",
    iconColor: "#2f6fed",
    title: "Adaptive AI Tutor",
    desc: "Adjusts explanations, content, and difficulty based on how you learn—getting better every session.",
    tag: "Core AI",
  },
  {
    icon: <Route size={24} strokeWidth={2} />,
    iconBg: "rgba(168,85,247,0.12)",
    iconColor: "#a855f7",
    title: "Smart Learning Paths",
    desc: "Builds a personalized curriculum from your goals, current level, and learning pace.",
    tag: "Personalization",
  },
  {
    icon: <ClipboardCheck size={24} strokeWidth={2} />,
    iconBg: "rgba(34,197,94,0.12)",
    iconColor: "#22c55e",
    title: "Auto-Grading & Feedback",
    desc: "Instant, detailed feedback on quizzes and assignments—no waiting, no guessing.",
    tag: "Assessment",
  },
  {
    icon: <WandSparkles size={24} strokeWidth={2} />,
    iconBg: "rgba(249,115,22,0.12)",
    iconColor: "#f97316",
    title: "AI Course Generator",
    desc: "Turn any topic into a full structured course with modules, quizzes, and media in minutes.",
    tag: "Content",
  },
  {
    icon: <SearchCheck size={24} strokeWidth={2} />,
    iconBg: "rgba(20,184,166,0.12)",
    iconColor: "#14b8a6",
    title: "Knowledge Gap Detection",
    desc: "Identifies exactly where you're struggling and surfaces targeted practice before it becomes a problem.",
    tag: "Analytics",
  },
  {
    icon: <MessageCircleQuestion size={24} strokeWidth={2} />,
    iconBg: "rgba(239,68,68,0.12)",
    iconColor: "#ef4444",
    title: "AI Teaching Assistant",
    desc: "Answers student questions, moderates discussions, and surfaces insights for instructors in real time.",
    tag: "Instructor",
  },
];

export default function AIFeaturesSection() {
  return (
    <section id="features" className="lp-features">
      <div className="lp-container">
        <div className="lp-features__header">
          <span className="lp-eyebrow">POWERED BY AI</span>
          <h2 className="lp-features__title lp-section-title">
            Intelligence built into every corner of learning
          </h2>
        </div>

        <div className="lp-features__grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feat-card">
              <div
                className="lp-feat-card__icon"
                style={{ background: f.iconBg, color: f.iconColor }}
              >
                {f.icon}
              </div>
              <h3 className="lp-feat-card__title">{f.title}</h3>
              <p className="lp-feat-card__desc">{f.desc}</p>
              <a href="https://preprod-pregen.netlify.app/" className="lp-feat-card__link">
                Learn More →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
