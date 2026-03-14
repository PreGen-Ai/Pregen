import { useNavigate } from "react-router-dom";
import "../styles/Home.css";
import { Container, Row, Col, Button } from "react-bootstrap";

const CallToActionSection = () => {
  const navigate = useNavigate();

  const handleGetStartedClick = () => {
    navigate("/signup");
  };

  return (
    <div className="cta-section">
      <Container>
        <Row className="justify-content-center">
          <Col lg={8} md={10} className="text-center">
            <h2 className="cta-title">
              Empower Learning with AI-Assisted Education
            </h2>
            <p className="cta-description">
              Experience the next generation of digital learning with our
              AI-powered E-Learning Platform. Get instant AI grading,
              personalized feedback, and adaptive learning recommendations — all
              designed to help students grow smarter, faster.
            </p>
            <Button className="cta-btn" onClick={handleGetStartedClick}>
              Get Started for Free
            </Button>
            <p className="mt-3 text-light opacity-75">
              Join students, teachers, and parents using AI to make learning
              more effective. No setup required — start your smart classroom
              today.
            </p>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default CallToActionSection;
