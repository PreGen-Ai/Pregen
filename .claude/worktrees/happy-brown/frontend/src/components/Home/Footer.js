import { Container, Row, Col, Form, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFacebookF,
  faTwitter,
  faLinkedinIn,
  faInstagram,
} from "@fortawesome/free-brands-svg-icons";
import Logo128 from "../../assets/logo-320.webp";
import Logo64 from "../../assets/logo-640.webp";
import Logo256 from "../../assets/logo-1024.webp";

import "../styles/footer.css";

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <Container>
        <Row className="footer-content">
          {/* Brand & About */}
          <Col lg={4} md={6} className="mb-4 mb-md-0">
            <div className="footer-brand">
              <img
                src={Logo128}
                srcSet={`${Logo64} 100w, ${Logo128} 150w, ${Logo256} 256w`}
                sizes="(max-width: 576px) 100px, 256px"
                width={128}
                height={128}
                loading="lazy"
                decoding="async"
                alt="AI-Assisted E-Learning Platform"
                className="footer-logo"
              />

              <p className="mt-3">
                Revolutionize learning with our AI-powered education platform.
                Built on the MERN stack and integrated with Google Gemini AI, it
                delivers instant grading, personalized feedback, and adaptive
                learning paths — helping students, teachers, and parents achieve
                smarter education outcomes.
              </p>
            </div>
            <div className="social-links">
              <a
                href="https://www.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="social-icon"
              >
                <FontAwesomeIcon icon={faFacebookF} />
              </a>
              <a
                href="https://www.twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="social-icon"
              >
                <FontAwesomeIcon icon={faTwitter} />
              </a>
              <a
                href="https://www.linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="social-icon"
              >
                <FontAwesomeIcon icon={faLinkedinIn} />
              </a>
              <a
                href="https://www.instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="social-icon"
              >
                <FontAwesomeIcon icon={faInstagram} />
              </a>
            </div>
          </Col>

          {/* Company Links */}
          <Col lg={2} md={6} sm={6} className="mb-4 mb-md-0">
            <h5 className="footer-heading">Platform</h5>
            <ul className="footer-links">
              <li>
                <Link to="/about">About Us</Link>
              </li>
              <li>
                <Link to="/features">Features</Link>
              </li>
              <li>
                <Link to="/contact">Contact</Link>
              </li>
              <li>
                <a href="#">Careers</a>
              </li>
            </ul>
          </Col>

          {/* Resources */}
          <Col lg={2} md={6} sm={6} className="mb-4 mb-md-0">
            <h5 className="footer-heading">Resources</h5>
            <ul className="footer-links">
              <li>
                <a href="#">Documentation</a>
              </li>
              <li>
                <a href="#">Help Center</a>
              </li>
              <li>
                <a href="#">Privacy Policy</a>
              </li>
              <li>
                <a href="#">Terms of Use</a>
              </li>
            </ul>
          </Col>

          {/* Newsletter */}
          <Col lg={4} md={6} className="mb-4 mb-md-0">
            <h5 className="footer-heading">Stay Updated</h5>
            <p>
              Get the latest updates on AI in education, platform improvements,
              and new learning tools straight to your inbox.
            </p>
            <Form className="newsletter-form">
              <div className="d-flex">
                <Form.Control
                  type="email"
                  placeholder="Your email address"
                  className="newsletter-input"
                />
                <Button type="submit" className="newsletter-button">
                  Subscribe
                </Button>
              </div>
            </Form>
          </Col>
        </Row>

        <hr className="footer-divider" />

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <p className="copyright">
            &copy; {currentYear} AI-Assisted E-Learning Platform. All rights
            reserved.
          </p>
          <div className="footer-bottom-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Use</a>
            <a href="#">Cookies</a>
          </div>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
