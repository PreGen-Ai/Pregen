import { Calculator, Microscope, BookOpen, FlaskConical, Zap, Star, Users } from "lucide-react";


const COURSES = [
  {
    topBg: "linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)",
    icon: <Calculator size={40} strokeWidth={1.8} color="#fff" />,
    category: "IGCSE",
    students: "420",
    title: "IGCSE Mathematics: Extended Revision",
    desc: "Master algebra, functions, geometry, and past-paper problem solving with AI-guided explanations.",
    teacher: "Mr. Karim Adel",
    teacherInitial: "K",
    teacherBg: "#7c3aed",
    rating: "4.9",
  },
  {
    topBg: "linear-gradient(135deg,#16a34a 0%,#15803d 100%)",
    icon: <Calculator size={40} strokeWidth={1.8} color="#fff" />,
    category: "American Diploma",
    students: "1.2k+",
    title: "SAT Math: From Basics to 700+",
    desc: "Build strong problem-solving skills for algebra, advanced math, data analysis, and test strategy.",
    teacher: "Ms. Nour El Din",
    teacherInitial: "N",
    teacherBg: "#16a34a",
    rating: "4.8",
  },
  {
    topBg: "linear-gradient(135deg,#0d9488 0%,#0f766e 100%)",
    icon: <Microscope size={40} strokeWidth={1.8} color="#fff" />,
    category: "IGCSE Biology",
    students: "800",
    title: "IGCSE Biology: Core & Extended",
    desc: "Understand cells, genetics, enzymes, ecology, and human biology with visual AI support.",
    teacher: "Dr. Sarah Maher",
    teacherInitial: "S",
    teacherBg: "#0d9488",
    rating: "4.8",
  },
  {
    topBg: "linear-gradient(135deg,#b45309 0%,#92400e 100%)",
    icon: <FlaskConical size={40} strokeWidth={1.8} color="#fff" />,
    category: "IB",
    students: "260",
    title: "IB Biology HL: Exam Mastery",
    desc: "Practice data-based questions, structured answers, and high-level concepts for IB Biology HL.",
    teacher: "Dr. Omar Khaled",
    teacherInitial: "O",
    teacherBg: "#b45309",
    rating: "4.9",
  },
  {
    topBg: "linear-gradient(135deg,#ea580c 0%,#c2410c 100%)",
    icon: <BookOpen size={40} strokeWidth={1.8} color="#fff" />,
    category: "American Diploma",
    students: "690",
    title: "ACT English & Reading Skills",
    desc: "Improve grammar, reading speed, evidence questions, and exam timing with adaptive practice.",
    teacher: "Ms. Farida Samir",
    teacherInitial: "F",
    teacherBg: "#ea580c",
    rating: "4.7",
  },
  {
    topBg: "linear-gradient(135deg,#db2777 0%,#be185d 100%)",
    icon: <Zap size={40} strokeWidth={1.8} color="#fff" />,
    category: "IGCSE Physics",
    students: "540",
    title: "IGCSE Physics: Forces, Waves & Electricity",
    desc: "Learn equations, diagrams, experiments, and past-paper techniques with step-by-step AI help.",
    teacher: "Eng. Youssef Hany",
    teacherInitial: "Y",
    teacherBg: "#db2777",
    rating: "4.8",
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
