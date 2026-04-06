import { useMemo, useState } from "react";
import { Modal, Form, Button, Row, Col, Alert } from "react-bootstrap";

const REDIRECT_URL = "https://preprod-pregen.netlify.app/";

/**
 * Optional: set REACT_APP_DEMO_WEBHOOK_URL in your .env
 * Example:
 * REACT_APP_DEMO_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/xxxx/yyyy
 */
const WEBHOOK_URL = process.env.REACT_APP_DEMO_WEBHOOK_URL;

function toFormUrlEncoded(obj) {
  return Object.keys(obj)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(obj[k] ?? ""))
    .join("&");
}

export default function DemoRequestModal({ show, onHide }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    role: "",
    useCase: "",
  });

  const isValid = useMemo(() => {
    return (
      form.fullName.trim().length >= 2 &&
      /^\S+@\S+\.\S+$/.test(form.email) &&
      form.company.trim().length >= 2
    );
  }, [form]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!isValid) {
      setError("Please provide your name, a valid email, and company name.");
      return;
    }

    setSubmitting(true);

    try {
      // Always store locally as a fallback proof we "gathered" the info
      const payload = {
        ...form,
        requestedAt: new Date().toISOString(),
        source: window.location.href,
      };
      localStorage.setItem("pregen_demo_request", JSON.stringify(payload));

      // If you provide a webhook URL, we will POST it there
      if (WEBHOOK_URL) {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error("Webhook request failed.");
        }
      } else {
        // No backend/webhook configured — still captured in localStorage
        // You can also replace this with a Netlify Form or your API endpoint later.
        console.log("Demo request captured (local):", payload);
      }

      // Redirect to preprod
      window.location.href = REDIRECT_URL;
    } catch (err) {
      setError(
        "We saved your request locally, but sending failed. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Request a Demo</Modal.Title>
      </Modal.Header>

      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Full name *</Form.Label>
                <Form.Control
                  name="fullName"
                  value={form.fullName}
                  onChange={onChange}
                  placeholder="e.g., Mohamed Boghdaddy"
                  autoComplete="name"
                  required
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Email *</Form.Label>
                <Form.Control
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={onChange}
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Phone</Form.Label>
                <Form.Control
                  name="phone"
                  value={form.phone}
                  onChange={onChange}
                  placeholder="+20..."
                  autoComplete="tel"
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Company *</Form.Label>
                <Form.Control
                  name="company"
                  value={form.company}
                  onChange={onChange}
                  placeholder="Company / University"
                  required
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Role</Form.Label>
                <Form.Control
                  name="role"
                  value={form.role}
                  onChange={onChange}
                  placeholder="Admin / Professor / Student / etc."
                />
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>What do you want to achieve?</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  name="useCase"
                  value={form.useCase}
                  onChange={onChange}
                  placeholder="Tell us your use case and what you want to see in the demo."
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={onHide}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!isValid || submitting}
          >
            {submitting ? "Sending..." : "Submit & Continue"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
