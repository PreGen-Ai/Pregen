import { Container } from "react-bootstrap";
import HeroSection from "./HeroSection";
import StorytellingSection from "./StorytellingSection";
import CallToActionSection from "./CallToActionSection";
import "../styles/Home.css";
import WhoWeAre from "./WhoWeAre";

const Home = () => {
  return (
    <div className="home-page">
      <section id="hero-section" className="section">
        <Container fluid className="px-0">
          <HeroSection />
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

      <section id="cta" className="section">
        <Container>
          <CallToActionSection />
        </Container>
      </section>
    </div>
  );
};

export default Home;
