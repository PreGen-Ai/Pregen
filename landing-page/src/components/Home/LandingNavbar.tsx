import { useEffect, useState } from "react";
import { Navbar, Nav, Container, Button, Offcanvas } from "react-bootstrap";
import "../styles/navbar.css";

type Props = {
  onRequestDemo: () => void;
};

export default function LandingNavbar({ onRequestDemo }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const go = (id: string) => {
    scrollToId(id);
    setExpanded(false); // close menu after click (mobile)
  };

  const openDemo = () => {
    setExpanded(false); // close menu before opening modal
    onRequestDemo();
  };

  return (
    <Navbar
      expand="lg"
      variant="dark"
      fixed="top"
      expanded={expanded}
      onToggle={(v) => setExpanded(!!v)}
      className={`navbar-custom ${scrolled ? "navbar-scrolled" : ""}`}
    >
      <Container>
        <Navbar.Brand
          className="fw-bold"
          style={{ cursor: "pointer" }}
          onClick={() => go("hero-section")}
        >
          PreGen
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="landing-offcanvas" />

        <Navbar.Offcanvas
          id="landing-offcanvas"
          aria-labelledby="landing-offcanvas-label"
          placement="end"
          className="landing-offcanvas"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title id="landing-offcanvas-label">
              PreGen
            </Offcanvas.Title>
          </Offcanvas.Header>

          <Offcanvas.Body>
            <Nav className="align-items-lg-center">
              <Nav.Link onClick={() => go("hero-section")}>Home</Nav.Link>
              <Nav.Link onClick={() => go("storytelling")}>Story</Nav.Link>
              <Nav.Link onClick={() => go("about")}>About</Nav.Link>
              <Nav.Link onClick={() => go("cta")}>Get Started</Nav.Link>

              <Button
                variant="outline-light"
                className="ms-lg-3 mt-3 mt-lg-0 landing-demo-btn"
                onClick={openDemo}
              >
                Request a Demo
              </Button>
            </Nav>
          </Offcanvas.Body>
        </Navbar.Offcanvas>
      </Container>
    </Navbar>
  );
}
