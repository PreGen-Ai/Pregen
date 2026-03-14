import { useState } from "react";
import { Container, Row, Col, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import "../styles/Home.css";

import Hero256 from "../../assets/hero-256.webp";
import Hero512 from "../../assets/hero-512.webp";
import Hero768 from "../../assets/hero-768.webp";
import Hero1024 from "../../assets/hero-1024.webp";

import DemoRequestModal from "./DemoRequestModal";

const HeroSection = () => {
  const [showDemo, setShowDemo] = useState(false);

  return (
    <>
      <Container className="hero-section">
        <Row className="align-items-center">
          {/* Hero Image */}
          <Col lg={5} className="order-lg-2">
            <div className="hero-image-container">
              <img
                src={Hero512}
                srcSet={`${Hero256} 256w, ${Hero512} 512w, ${Hero768} 768w, ${Hero1024} 1024w`}
                sizes="(max-width: 991px) 90vw, 50vw"
                width="1024"
                height="1024"
                decoding="async"
                fetchpriority="high"
                alt="AI-Assisted E-Learning Platform"
              />
            </div>
          </Col>

          {/* Hero Content */}
          <Col lg={6} className="order-lg-1 mb-5 mb-lg-0">
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

              <div className="hero-buttons">
                <Button
                  variant="primary"
                  as={Link}
                  to="/signup"
                  className="me-3 hero-btn"
                >
                  Get Started
                </Button>

                <Button
                  variant="outline-light"
                  className="me-3 hero-btn-alt"
                  onClick={() => setShowDemo(true)}
                >
                  Request a Demo
                </Button>

                <Link
                  to="/features"
                  className="btn btn-outline-light hero-btn-alt"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </Col>
        </Row>
      </Container>

      <DemoRequestModal show={showDemo} onHide={() => setShowDemo(false)} />
    </>
  );
};

export default HeroSection;
