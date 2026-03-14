import { Container, Row, Col } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBrain,
  faShieldAlt,
  faLightbulb,
  faChartLine,
} from "@fortawesome/free-solid-svg-icons";
import "../styles/Home.css";

import about320 from "../../assets/about-320.webp";
import about640 from "../../assets/about-640.webp";
import about1024 from "../../assets/about-1024.webp";

const WhoWeAre = () => {
  const features = [
    {
      icon: faBrain,
      title: "AI-Powered Learning",
      description:
        "Our platform leverages Google Gemini AI to evaluate assignments, provide instant feedback, and guide students toward mastery.",
    },
    {
      icon: faShieldAlt,
      title: "Secure & Private",
      description:
        "Student data is protected through end-to-end encryption and strict access controls, ensuring privacy and compliance with education standards.",
    },
    {
      icon: faLightbulb,
      title: "Personalized Guidance",
      description:
        "Each learner receives tailored recommendations and adaptive learning paths that evolve with their progress.",
    },
    {
      icon: faChartLine,
      title: "Actionable Analytics",
      description:
        "Teachers and administrators gain insight into performance trends, strengths, and improvement areas through real-time dashboards.",
    },
  ];

  return (
    <Container>
      <Row className="justify-content-center mb-5">
        <Col lg={8} className="text-center">
          <h2 className="mission_title">Who We Are</h2>
          <p className="lead mb-0">
            Innovators in AI-driven education and digital learning
            transformation
          </p>
        </Col>
      </Row>

      <Row className="align-items-center mb-5">
        <Col lg={6} className="mb-4 mb-lg-0">
          <div className="about-image-container">
            <img
              className="img-fluid rounded"
              src={about640}
              srcSet={`${about320} 320w, ${about640} 640w, ${about1024} 1024w`}
              sizes="(max-width: 991px) 90vw, 50vw"
              width="1024"
              height="683"
              loading="lazy"
              decoding="async"
              alt="About AI-Assisted E-Learning Platform"
            />
          </div>
        </Col>

        <Col lg={6}>
          <div className="about-content">
            <p className="mission_description">
              We are a passionate team of educators, engineers, and AI
              researchers united by one mission — to make learning more
              intelligent, inclusive, and effective. Our platform combines
              cutting-edge AI with modern web technologies to bring personalized
              education to every learner.
            </p>
            <p className="mission_description">
              By integrating Google Gemini’s advanced language understanding
              with our MERN-based infrastructure, we empower teachers to grade
              faster, students to learn smarter, and parents to stay connected
              to progress — all within a secure and seamless experience.
            </p>
          </div>
        </Col>
      </Row>

      <Row className="mt-5">
        <Col lg={12}>
          <h3 className="text-center mb-4">
            Why Choose Our AI-Assisted E-Learning Platform
          </h3>
        </Col>

        {features.map((feature, index) => (
          <Col lg={3} md={6} className="mb-4" key={index}>
            <div className="feature-box text-center">
              <div className="feature-icon">
                <FontAwesomeIcon icon={feature.icon} />
              </div>
              <h4 className="feature-title">{feature.title}</h4>
              <p className="feature-description">{feature.description}</p>
            </div>
          </Col>
        ))}
      </Row>

      <Row className="stats-row text-center mt-5">
        <Col md={3} sm={6} className="mb-4">
          <div className="stat-item">
            <h2 className="stat-number">98%</h2>
            <p className="stat-label">AI Feedback Accuracy</p>
          </div>
        </Col>
        <Col md={3} sm={6} className="mb-4">
          <div className="stat-item">
            <h2 className="stat-number">90%</h2>
            <p className="stat-label">Student Engagement Rate</p>
          </div>
        </Col>
        <Col md={3} sm={6} className="mb-4">
          <div className="stat-item">
            <h2 className="stat-number">85%</h2>
            <p className="stat-label">Teacher Time Saved</p>
          </div>
        </Col>
        <Col md={3} sm={6} className="mb-4">
          <div className="stat-item">
            <h2 className="stat-number">100%</h2>
            <p className="stat-label">Data Security Compliance</p>
          </div>
        </Col>
      </Row>
    </Container>
  );
};

export default WhoWeAre;
