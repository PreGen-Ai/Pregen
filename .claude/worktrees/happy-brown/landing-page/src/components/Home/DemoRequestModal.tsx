import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Modal, Form, Button, Row, Col, Alert } from "react-bootstrap";

const REDIRECT_URL = "https://preprod-pregen.netlify.app/";
const WEBHOOK_URL = import.meta.env.VITE_DEMO_WEBHOOK_URL as string | undefined;

type DemoForm = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  useCase: string;
};

export type DemoRequestModalProps = {
  show: boolean;
  onHide: () => void;
};

export default function DemoRequestModal({
  show,
  onHide,
}: DemoRequestModalProps) {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const [form, setForm] = useState<DemoForm>({
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

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValid) {
      setError("Please provide your name, a valid email, and company name.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        ...form,
        requestedAt: new Date().toISOString(),
        source: window.location.href,
      };

      localStorage.setItem("pregen_demo_request", JSON.stringify(payload));

      if (WEBHOOK_URL) {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("Webhook request failed.");
      }

      window.location.href = REDIRECT_URL;
    } catch {
      setError(
        "We saved your request locally, but sending failed. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      scrollable
      fullscreen="sm-down"
      dialogClassName="demo-modal"
    >
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

        <Modal.Footer className="gap-2">
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
