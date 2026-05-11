import { Star } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "The AI tutor helped me revise IGCSE Chemistry at night before my mock exam. It explained the same idea in simple steps until I finally understood it.",
    name: "Malak Hassan",
    role: "IGCSE Student, Cairo",
    initial: "M",
    avatarBg: "#2f6fed",
  },
  {
    quote:
      "As a private Math instructor, PreGen helped me create quizzes, homework, and revision plans much faster. It saves me hours every week.",
    name: "Ahmed Nabil",
    role: "Private Math Instructor, Giza",
    initial: "A",
    avatarBg: "#16a34a",
  },
  {
    quote:
      "My son used to get lost between school notes and private lessons. The personalized learning path showed him exactly what to revise before his American Diploma exams.",
    name: "Dina Mostafa",
    role: "Parent, New Cairo",
    initial: "D",
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
