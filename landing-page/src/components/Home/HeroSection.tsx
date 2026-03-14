import { Container, Row, Col, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import "../styles/Home.css";

import Hero256 from "../../assets/hero-256.webp";
import Hero512 from "../../assets/hero-512.webp";
import Hero768 from "../../assets/hero-768.webp";
import Hero1024 from "../../assets/hero-1024.webp";

type Props = {
  onRequestDemo: () => void;
};

export default function HeroSection({ onRequestDemo }: Props) {
  return (
    <div className="hero-wrap">
      <Container className="hero-section">
        <Row className="align-items-center gy-5">
          <Col lg={5} className="order-lg-2">
            <div className="hero-image-container">
              <img
                src={Hero512}
                srcSet={`${Hero256} 256w, ${Hero512} 512w, ${Hero768} 768w, ${Hero1024} 1024w`}
                sizes="(max-width: 991px) 92vw, 50vw"
                width={1024}
                height={1024}
                decoding="async"
                fetchPriority="high"
                alt="AI-Assisted E-Learning Platform"
              />
            </div>
          </Col>

          <Col lg={6} className="order-lg-1 mb-4 mb-lg-0">
            <div className="hero-content">
              <h1 className="hero_title">
                Smarter Learning with{" "}
                <span className="highlight">AI Assistance</span>
              </h1>

              <p className="hero_description">
                Experience a new era of education powered by Google Gemini AI.
                Our platform provides instant grading, personalized feedback,
                and adaptive learning paths to help students learn faster,
                teachers save time, and parents stay informed.
              </p>

              <div className="hero-buttons d-grid gap-2 d-sm-flex flex-sm-wrap">
                <Link to="/signup" className="btn btn-primary btn-lg hero-btn">
                  Get Started
                </Link>

                <Button
                  variant="outline-light"
                  size="lg"
                  className="hero-btn-alt"
                  onClick={onRequestDemo}
                >
                  Request a Demo
                </Button>

                <Link
                  to="/features"
                  className="btn btn-outline-light btn-lg hero-btn-alt"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
