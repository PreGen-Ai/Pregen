import { useState } from "react";
import {
  Bot, Route, ClipboardCheck, BarChart3,
  BookOpenCheck, Calculator, Brain,
  BookOpen, Video, Trophy,
} from "lucide-react";

const LEARNER_CARDS = [
  {
    icon: <Bot size={20} strokeWidth={2} />,
    iconBg: "#dcfce7",
    iconColor: "#16a34a",
    title: "AI Tutor + 24/7 Support",
    desc: "Your personal AI tutor explains concepts, answers questions, and makes learning feel like talking to a friend.",
  },
  {
    icon: <Route size={20} strokeWidth={2} />,
    iconBg: "#f3e8ff",
    iconColor: "#9333ea",
    title: "Personalized Learning Paths",
    desc: "It analyzes your insights, strengths, and weaknesses to create the perfect curriculum—tailored just for your learning.",
  },
  {
    icon: <ClipboardCheck size={20} strokeWidth={2} />,
    iconBg: "#dbeafe",
    iconColor: "#2563eb",
    title: "AI Quizzes & Smart Feedback",
    desc: "Adapted to you—that are hard yet fair, as you improve. Get detailed practice with real-time AI-generated feedback.",
  },
  {
    icon: <BarChart3 size={20} strokeWidth={2} />,
    iconBg: "#ccfbf1",
    iconColor: "#0d9488",
    title: "Progress Insights & Analytics",
    desc: "Visual dashboards track your learning goals and help identify areas for improvement.",
  },
];

const INSTRUCTOR_CARDS = [
  {
    icon: <BookOpen size={20} strokeWidth={2} />,
    iconBg: "#fef9c3",
    iconColor: "#ca8a04",
    title: "AI Course Generator",
    desc: "Build a full course in minutes—modules, quizzes, and media suggestions auto-generated from your topic.",
  },
  {
    icon: <Video size={20} strokeWidth={2} />,
    iconBg: "#fee2e2",
    iconColor: "#dc2626",
    title: "Video Vault Writer",
    desc: "Turn your lessons into structured video notes and summaries students can reference anytime.",
  },
  {
    icon: <ClipboardCheck size={20} strokeWidth={2} />,
    iconBg: "#dbeafe",
    iconColor: "#2563eb",
    title: "Smart Quiz Builder",
    desc: "Auto-generate adaptive assessments from your course content with one click.",
  },
  {
    icon: <Trophy size={20} strokeWidth={2} />,
    iconBg: "#ffedd5",
    iconColor: "#ea580c",
    title: "Certificate Builder",
    desc: "Award students branded completion certificates automatically when they finish your course.",
  },
];

const DASHBOARD_ROWS = [
  {
    icon: <BookOpenCheck size={16} strokeWidth={2} />,
    iconBg: "#dcfce7",
    iconColor: "#16a34a",
    name: "Calculus › Chapter 1 › Integrate",
    badge: "Complete",
    badgeBg: "#dcfce7",
    badgeColor: "#15803d",
    progress: 92,
    progressColor: "#22c55e",
    dashed: false,
  },
  {
    icon: <Calculator size={16} strokeWidth={2} />,
    iconBg: "#ffedd5",
    iconColor: "#ea580c",
    name: "= Python Basics Science",
    badge: "In Progress",
    badgeBg: "#ffedd5",
    badgeColor: "#c2410c",
    progress: 55,
    progressColor: "#f97316",
    dashed: false,
  },
  {
    icon: <Brain size={16} strokeWidth={2} />,
    iconBg: "#f3e8ff",
    iconColor: "#9333ea",
    name: "Biology › Manage Cell Diseases",
    badge: "Not Started",
    badgeBg: "#f3e8ff",
    badgeColor: "#7c3aed",
    progress: 0,
    progressColor: "#a855f7",
    dashed: true,
  },
];

export default function AudienceSection() {
  const [tab, setTab] = useState<"learners" | "instructors">("learners");
  const cards = tab === "learners" ? LEARNER_CARDS : INSTRUCTOR_CARDS;

  return (
    <section className="lp-audience">
      <div className="lp-container">
        {/* Header */}
        <div className="lp-audience__header">
          <span className="lp-eyebrow">BUILT WITH BOTH IN MIND</span>
          <h2 className="lp-audience__title">
            One platform, two powerful experiences
          </h2>
          <div className="lp-audience__tabs">
            <button
              className={`lp-audience__tab${tab === "learners" ? " lp-audience__tab--active" : ""}`}
              onClick={() => setTab("learners")}
            >
              For Learners
            </button>
            <button
              className={`lp-audience__tab${tab === "instructors" ? " lp-audience__tab--active" : ""}`}
              onClick={() => setTab("instructors")}
            >
              For Instructors
            </button>
          </div>
        </div>

        {/* Body: cards + dashboard */}
        <div className="lp-audience__body">
          {/* Feature cards */}
          <div className="lp-audience__cards">
            {cards.map((c) => (
              <div key={c.title} className="lp-aud-card">
                <div
                  className="lp-aud-card__icon"
                  style={{ background: c.iconBg, color: c.iconColor }}
                >
                  {c.icon}
                </div>
                <p className="lp-aud-card__title">{c.title}</p>
                <p className="lp-aud-card__desc">{c.desc}</p>
              </div>
            ))}
          </div>

          {/* Dashboard preview */}
          <div className="lp-dashboard">
            <div className="lp-dashboard__header">
              <span className="lp-dashboard__title">Your Learning Dashboard</span>
              <div className="lp-dashboard__dots">
                <div className="lp-dashboard__dot" />
                <div className="lp-dashboard__dot" />
                <div className="lp-dashboard__dot" />
              </div>
            </div>

            {DASHBOARD_ROWS.map((row) => (
              <div
                key={row.name}
                className="lp-db-row"
                style={row.dashed ? { borderStyle: "dashed" } : {}}
              >
                <div
                  className="lp-db-row__icon-wrap"
                  style={{ background: row.iconBg, color: row.iconColor }}
                >
                  {row.icon}
                </div>
                <div className="lp-db-row__info">
                  <div className="lp-db-row__name">{row.name}</div>
                  {!row.dashed && (
                    <div className="lp-db-progress">
                      <div
                        className="lp-db-progress__bar"
                        style={{ width: `${row.progress}%`, background: row.progressColor }}
                      />
                    </div>
                  )}
                </div>
                <span
                  className="lp-db-row__badge"
                  style={{ background: row.badgeBg, color: row.badgeColor }}
                >
                  {row.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
