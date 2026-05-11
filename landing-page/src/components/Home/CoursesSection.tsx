import { Calculator, Code2, Microscope, Landmark, Globe2, Palette, Star, Users } from "lucide-react";

const COURSES = [
  {
    topBg: "linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)",
    icon: <Calculator size={40} strokeWidth={1.8} color="#fff" />,
    category: "Mathematics",
    students: "400",
    title: "Integral Calculus to Real Analysis",
    desc: "Master derivatives, integrals, and applications with real-world problem sets and AI-guided guidance.",
    teacher: "Ana Torres",
    teacherInitial: "A",
    teacherBg: "#7c3aed",
    rating: "4.2",
  },
  {
    topBg: "linear-gradient(135deg,#16a34a 0%,#15803d 100%)",
    icon: <Code2 size={40} strokeWidth={1.8} color="#fff" />,
    category: "Programming",
    students: "1.2k+",
    title: "Python Programming: Zero to Hero",
    desc: "From variables to web apps, build practical coding skills with AI-supported exercises and live challenges.",
    teacher: "Eric Collins",
    teacherInitial: "E",
    teacherBg: "#16a34a",
    rating: "4.4",
  },
  {
    topBg: "linear-gradient(135deg,#0d9488 0%,#0f766e 100%)",
    icon: <Microscope size={40} strokeWidth={1.8} color="#fff" />,
    category: "Biology",
    students: "800",
    title: "Molecular Biology & Genetics",
    desc: "Discover the secrets of life at the molecular level with interactive labs, AI quizzes, and visual cellular processes.",
    teacher: "Dr. Sarah Chen",
    teacherInitial: "S",
    teacherBg: "#0d9488",
    rating: "4.8",
  },
  {
    topBg: "linear-gradient(135deg,#b45309 0%,#92400e 100%)",
    icon: <Landmark size={40} strokeWidth={1.8} color="#fff" />,
    category: "History",
    students: "55",
    title: "World History: Ancient to Modern",
    desc: "Navigate history with AI narrations, story-based quizzes, and decision-based learning experiences.",
    teacher: "James Wolf",
    teacherInitial: "J",
    teacherBg: "#b45309",
    rating: "4.5",
  },
  {
    topBg: "linear-gradient(135deg,#ea580c 0%,#c2410c 100%)",
    icon: <Globe2 size={40} strokeWidth={1.8} color="#fff" />,
    category: "Languages",
    students: "1",
    title: "Spanish for Communication",
    desc: "Learn to speak confidently using an AI-powered conversation partner with grammar guides and cultural context.",
    teacher: "Ana Torres",
    teacherInitial: "A",
    teacherBg: "#ea580c",
    rating: "4.3",
  },
  {
    topBg: "linear-gradient(135deg,#db2777 0%,#be185d 100%)",
    icon: <Palette size={40} strokeWidth={1.8} color="#fff" />,
    category: "Design",
    students: "320",
    title: "Digital Art Illustration",
    desc: "Create stunning digital artwork with AI visual feedback, style guides, and interactive drawing tutorials.",
    teacher: "Tom Lee",
    teacherInitial: "T",
    teacherBg: "#db2777",
    rating: "4.6",
  },
];

export default function CoursesSection() {
  return (
    <section className="lp-courses">
      <div className="lp-container">
        <div className="lp-courses__header">
          <div className="lp-courses__header-left">
            <span className="lp-eyebrow">FEATURED COURSES</span>
            <h2 className="lp-courses__heading lp-section-title">
              Explore AI-enhanced courses
            </h2>
          </div>
          <a href="https://preprod-pregen.netlify.app/" className="lp-courses__view-all">
            View all courses →
          </a>
        </div>

        <div className="lp-courses__grid">
          {COURSES.map((c) => (
            <div key={c.title} className="lp-course-card">
              {/* Coloured top */}
              <div
                className="lp-course-card__top"
                style={{ background: c.topBg }}
              >
                <div className="lp-course-card__top-meta">
                  <span className="lp-course-card__ai-pill">AI Tutor</span>
                  <span className="lp-course-card__students">
                    <Users size={10} strokeWidth={2.5} />
                    {c.students}
                  </span>
                </div>
                {c.icon}
              </div>

              {/* Body */}
              <div className="lp-course-card__body">
                <p className="lp-course-card__category">{c.category}</p>
                <h3 className="lp-course-card__title">{c.title}</h3>
                <p className="lp-course-card__desc">{c.desc}</p>

                <div className="lp-course-card__footer">
                  <div className="lp-course-card__teacher">
                    <div
                      className="lp-course-card__t-av"
                      style={{ background: c.teacherBg }}
                    >
                      {c.teacherInitial}
                    </div>
                    <span className="lp-course-card__t-name">{c.teacher}</span>
                  </div>
                  <div className="lp-course-card__rating">
                    <Star
                      size={13}
                      strokeWidth={0}
                      fill="#f59e0b"
                      className="lp-course-card__star"
                    />
                    {c.rating}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
