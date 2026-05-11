export default function FinalCTASection() {
  return (
    <section className="lp-cta">
      {/* Orange glow */}
      <div className="lp-cta__glow" aria-hidden="true" />

      <div className="lp-container lp-cta__content">
        <h2 className="lp-cta__title">
          Start your learning<br />journey today
        </h2>
        <p className="lp-cta__subtitle">
          Whether you're a student or an instructor, PreGen gives you the
          AI&#8209;powered tools to learn smarter and teach better.
        </p>
        <div className="lp-cta__btns">
          <a
            href="https://preprod-pregen.netlify.app/"
            className="lp-btn lp-btn--primary"
          >
            Create free account
          </a>
          <a
            href="https://preprod-pregen.netlify.app/"
            className="lp-btn lp-btn--secondary-dark"
          >
            Sign in now
          </a>
        </div>
      </div>
    </section>
  );
}
