import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "The AI tutor actually explained calculus better than three textbooks I used in college. Every time I got stuck, it just... knew exactly what I needed to hear.",
    name: "Lisa McCartney",
    role: "Student, Data Science",
    initial: "L",
    avatarBg: "#2f6fed",
  },
  {
    quote:
      "I built my entire Python course in 3 days using the AI Course Generator. It created modules, quizzes, and even suggested visual breakdowns I hadn't thought of.",
    name: "Mark Reid",
    role: "Instructor",
    initial: "M",
    avatarBg: "#16a34a",
  },
  {
    quote:
      "The personalized learning path feature literally fixed my exam anxiety. Instead of guessing what to study, I had a clear roadmap every single time.",
    name: "Joy Chang",
    role: "Student, Pre-Med",
    initial: "J",
    avatarBg: "#9333ea",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="lp-testimonials">
      <div className="lp-container">
        <div className="lp-testimonials__header">
          <span className="lp-eyebrow lp-testimonials__eyebrow">LOVED BY THOUSANDS</span>
          <h2 className="lp-testimonials__title lp-section-title">
            Real stories, real results
          </h2>
        </div>

        <div className="lp-testimonials__grid">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="lp-testi-card">
              <div className="lp-testi-card__stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} strokeWidth={0} fill="#f59e0b" className="lp-testi-card__star" />
                ))}
              </div>
              <p className="lp-testi-card__quote">"{t.quote}"</p>
              <div className="lp-testi-card__author">
                <div
                  className="lp-testi-card__av"
                  style={{ background: t.avatarBg }}
                >
                  {t.initial}
                </div>
                <div>
                  <div className="lp-testi-card__name">{t.name}</div>
                  <div className="lp-testi-card__role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
