export default function LandingNavbar() {
  return (
    <nav className="lp-nav">
      <div className="lp-container lp-nav__inner">
        <a href="/" className="lp-nav__logo">PreGen</a>
        <div className="lp-nav__actions">
          <a
            href="https://preprod-pregen.netlify.app/"
            className="lp-btn lp-btn--secondary lp-btn--sm"
          >
            Log in
          </a>
          <a
            href="https://preprod-pregen.netlify.app/"
            className="lp-btn lp-btn--primary lp-btn--sm"
          >
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}
