import { useState } from "react";
import { Container } from "react-bootstrap";

import LandingNavbar from "./LandingNavbar";
import DemoRequestModal from "./DemoRequestModal";
import Footer from "./Footer";

import HeroSection from "./HeroSection";
import StorytellingSection from "./StorytellingSection";
import WhoWeAre from "./WhoWeAre";
import CallToActionSection from "./CallToActionSection";

import "../styles/Home.css";

export default function Home() {
  const [showDemo, setShowDemo] = useState(false);

  const openDemo = () => setShowDemo(true);
  const closeDemo = () => setShowDemo(false);

  return (
    <div className="home-page">
      <LandingNavbar onRequestDemo={openDemo} />
      <DemoRequestModal show={showDemo} onHide={closeDemo} />

      <main className="home-main">
        <section id="hero-section" className="section section--hero">
          <Container fluid className="px-0">
            <HeroSection onRequestDemo={openDemo} />
          </Container>
        </section>

        <section id="storytelling" className="section">
          <Container>
            <StorytellingSection />
          </Container>
        </section>

        <section id="about" className="section bg-light">
          <Container>
            <WhoWeAre />
          </Container>
        </section>

        <section id="cta" className="section section--cta">
          <Container fluid className="px-0">
            <CallToActionSection />
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  );
}
