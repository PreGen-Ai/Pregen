const FOOTER_LINKS = [
  { label: "About",       href: "#" },
  { label: "Courses",     href: "#" },
  { label: "Instructors", href: "#" },
  { label: "Pricing",     href: "#" },
  { label: "Blog",        href: "#" },
  { label: "Privacy",     href: "#" },
];

export default function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer__inner">
        <span className="lp-footer__logo">PreGen</span>
        <span className="lp-footer__copy">© 2026 PreGen. All rights reserved.</span>
        <nav className="lp-footer__links" aria-label="Footer navigation">
          {FOOTER_LINKS.map((l) => (
            <a key={l.label} href={l.href} className="lp-footer__link">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
