import {
  BookOpenCheck, ClipboardCheck, Video, BarChart3,
  Trophy, MessageCircle, Languages, LayoutDashboard,
} from "lucide-react";

const TOOLS = [
  {
    icon: <BookOpenCheck size={22} strokeWidth={2} />,
    iconBg: "#dbeafe",
    iconColor: "#2563eb",
    title: "AI Practice Planner",
    desc: "Suggests which concepts to study based on your learning data and upcoming assessments.",
  },
  {
    icon: <ClipboardCheck size={22} strokeWidth={2} />,
    iconBg: "#dcfce7",
    iconColor: "#16a34a",
    title: "Quiz Generator",
    desc: "Creates adaptive quizzes from your course content instantly—no manual work needed.",
  },
  {
    icon: <Video size={22} strokeWidth={2} />,
    iconBg: "#fee2e2",
    iconColor: "#dc2626",
    title: "Video Vault Writer",
    desc: "Transforms your lessons into structured video notes students can reference anytime.",
  },
  {
    icon: <BarChart3 size={22} strokeWidth={2} />,
    iconBg: "#ffedd5",
    iconColor: "#ea580c",
    title: "Engagement Analytics",
    desc: "Track student participation and performance metrics in real-time with visual dashboards.",
  },
  {
    icon: <Trophy size={22} strokeWidth={2} />,
    iconBg: "#fef9c3",
    iconColor: "#ca8a04",
    title: "Certificate Builder",
    desc: "Award students auto-generated, branded completion certificates when they finish your course.",
  },
  {
    icon: <MessageCircle size={22} strokeWidth={2} />,
    iconBg: "#f3e8ff",
    iconColor: "#9333ea",
    title: "AI Discussion Moderator",
    desc: "Surfaces key insights and answers recurring questions directly from your course content.",
  },
  {
    icon: <Languages size={22} strokeWidth={2} />,
    iconBg: "#ccfbf1",
    iconColor: "#0d9488",
    title: "Auto Translation",
    desc: "Instantly translates your courses and content for global learners in 40+ languages.",
  },
  {
    icon: <LayoutDashboard size={22} strokeWidth={2} />,
    iconBg: "#ede9fe",
    iconColor: "#7c3aed",
    title: "Functional Dashboard",
    desc: "Real-time view of all your students, course progress, and overall platform performance.",
  },
];

export default function ToolsSection() {
  return (
    <section className="lp-tools">
      <div className="lp-container">
        <div className="lp-tools__header">
          <span className="lp-eyebrow">BETTER EVERYDAY</span>
          <h2 className="lp-tools__title lp-section-title">
            Everything you need to teach better
          </h2>
        </div>

        <div className="lp-tools__grid">
          {TOOLS.map((t) => (
            <div key={t.title} className="lp-tool-card">
              <div
                className="lp-tool-card__icon"
                style={{ background: t.iconBg, color: t.iconColor }}
              >
                {t.icon}
              </div>
              <h3 className="lp-tool-card__title">{t.title}</h3>
              <p className="lp-tool-card__desc">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
