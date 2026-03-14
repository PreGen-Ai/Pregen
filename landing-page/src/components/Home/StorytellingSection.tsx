import { Row, Col } from "react-bootstrap";
import "../styles/Home.css";

import mission320 from "../../assets/mission-320.webp";
import mission640 from "../../assets/mission-640.webp";
import mission1024 from "../../assets/mission-1024.webp";

export default function StorytellingSection() {
  return (
    <>
      <Row className="justify-content-center mb-4 mb-md-5">
        <Col lg={8} className="text-center">
          <h2 className="storytelling-title">Our Mission</h2>
          <p className="lead mb-0">
            Transforming education through the power of artificial intelligence
          </p>
        </Col>
      </Row>

      <Row className="align-items-center g-4 g-lg-5">
        <Col lg={6} md={12} className="order-2 order-lg-1">
          <div className="storytelling-content">
            <p className="story-paragraph">
              We believe that every learner deserves personalized support,
              timely feedback, and guidance that helps them grow. That’s why we
              built an AI-assisted E-Learning Platform powered by Google Gemini
              — to make education more intelligent, inclusive, and adaptive.
            </p>

            <p className="story-paragraph">
              Our platform goes beyond traditional learning tools. It analyzes
              student performance, provides instant AI-driven grading, and
              generates constructive feedback to guide improvement. Teachers
              save time, students receive tailored recommendations, and parents
              stay informed — all in one connected ecosystem.
            </p>

            <p className="story-paragraph mb-0">
              This is more than technology; it’s a movement toward smarter, more
              empathetic education. We’re using AI to empower learners and
              educators everywhere — helping them focus on what truly matters:
              learning, growing, and achieving success together.
            </p>
          </div>
        </Col>

        <Col lg={6} md={12} className="order-1 order-lg-2">
          <div className="mission-image-container">
            <img
              className="img-fluid rounded mission-image"
              src={mission640}
              srcSet={`${mission320} 320w, ${mission640} 640w, ${mission1024} 1024w`}
              sizes="(max-width: 991px) 92vw, 50vw"
              width={1024}
              height={683}
              loading="lazy"
              decoding="async"
              alt="Empowering Education with AI"
            />
          </div>
        </Col>
      </Row>
    </>
  );
}
