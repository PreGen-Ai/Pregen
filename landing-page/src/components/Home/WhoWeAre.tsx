import { Row, Col } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
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

type Feature = {
  icon: IconDefinition;
  title: string;
  description: string;
};

export default function WhoWeAre() {
  const features: Feature[] = [
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
        "Teachers and administrators gain insight into performance trends through real-time dashboards.",
    },
  ];

  return (
    <>
      <Row className="justify-content-center mb-4 mb-md-5">
        <Col lg={8} className="text-center">
          <h2 className="mission_title">Who We Are</h2>
          <p className="lead mb-0">
            Innovators in AI-driven education and digital learning
            transformation
          </p>
        </Col>
      </Row>

      <Row className="align-items-center g-4 g-lg-5 mb-4 mb-md-5">
        <Col lg={6} className="order-1 order-lg-1">
          <div className="about-image-container">
            <img
              className="img-fluid mission-image"
              src={about640}
              srcSet={`${about320} 320w, ${about640} 640w, ${about1024} 1024w`}
              sizes="(max-width: 991px) 92vw, 50vw"
              width={1024}
              height={683}
              loading="lazy"
              decoding="async"
              alt="About AI-Assisted E-Learning Platform"
            />
          </div>
        </Col>

        <Col lg={6} className="order-2 order-lg-2">
          <div className="about-content">
            <p className="mission_description">
              We are a passionate team of educators, engineers, and AI
              researchers united by one mission — to make learning more
              intelligent, inclusive, and effective.
            </p>
            <p className="mission_description mb-0">
              By integrating Google Gemini with our MERN-based infrastructure,
              we empower teachers to grade faster, students to learn smarter,
              and parents to stay connected.
            </p>
          </div>
        </Col>
      </Row>

      <Row className="mt-4 mt-md-5">
        <Col xs={12}>
          <h3 className="text-center mb-3 mb-md-4">
            Why Choose Our AI-Assisted E-Learning Platform
          </h3>
        </Col>

        {features.map((feature, index) => (
          <Col lg={3} md={6} className="mb-3 mb-md-4" key={index}>
            <div className="feature-box text-center h-100">
              <div className="feature-icon">
                <FontAwesomeIcon icon={feature.icon} />
              </div>
              <h4 className="feature-title">{feature.title}</h4>
              <p className="feature-description">{feature.description}</p>
            </div>
          </Col>
        ))}
      </Row>

      <Row className="stats-row text-center mt-4 mt-md-5 g-3">
        <Col xs={12} sm={6} md={3}>
          <div className="stat-item h-100">
            <h2 className="stat-number">98%</h2>
            <p className="stat-label mb-0">AI Feedback Accuracy</p>
          </div>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <div className="stat-item h-100">
            <h2 className="stat-number">90%</h2>
            <p className="stat-label mb-0">Student Engagement Rate</p>
          </div>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <div className="stat-item h-100">
            <h2 className="stat-number">85%</h2>
            <p className="stat-label mb-0">Teacher Time Saved</p>
          </div>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <div className="stat-item h-100">
            <h2 className="stat-number">100%</h2>
            <p className="stat-label mb-0">Data Security Compliance</p>
          </div>
        </Col>
      </Row>
    </>
  );
}
