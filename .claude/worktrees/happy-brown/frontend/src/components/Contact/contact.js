import { useMemo, useState } from "react";
import emailjs from "emailjs-com";
import { useForm } from "react-hook-form";
import "../styles/contact.css";

const Contact = () => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    defaultValues: {
      name: "",
      email: "",
      country: "",
      phone: "",
      role: "",
      topic: "",
      message: "",
      terms: false,
    },
  });

  const [messageStatus, setMessageStatus] = useState("");

  const selectedCountry = watch("country");

  const phoneValidationPatterns = useMemo(
    () => ({
      US: /^[2-9]\d{2}[2-9](?!11)\d{6}$/, // US
      EG: /^(00201|201|01)[0-9]{9}$/, // Egypt
      UK: /^(07\d{9}|(\+44\d{10}))$/, // UK
      FR: /^(\+33|0)[1-9](\d{8})$/, // France
      DE: /^(\+49|0)[1-9](\d{7,9})$/, // Germany
      IN: /^[6789]\d{9}$/, // India
    }),
    []
  );

  const onSubmit = async (data) => {
    setMessageStatus("");

    // Optional: add consistent email subject fields for your EmailJS template
    const payload = {
      ...data,
      platform: "AI-Assisted E-Learning Platform",
      source: "Contact Page",
    };

    try {
      const response = await emailjs.send(
        "service_h21foc9", // EmailJS Service ID
        "template_t64w4wp", // EmailJS Template ID
        payload,
        "PV9slaOWlMSALkZ3v" // EmailJS Public Key
      );

      if (response.status === 200) {
        setMessageStatus(
          "Message sent successfully! ✅ We’ll get back to you soon."
        );
        reset();
      } else {
        setMessageStatus("Failed to send message. Please try again later. ❌");
      }
    } catch (error) {
      console.error("Email Error:", error);
      setMessageStatus(
        "Error sending message. Please check your details and try again."
      );
    }
  };

  return (
    <section id="contact" className="contact-container">
      <div className="frame-container">
        {/* Header / Intro */}
        <div className="contact-header">
          <h2>Contact Us</h2>
          <p className="sub--title">
            Have a question about <strong>AI-Assisted E-Learning</strong>? Reach
            out and we’ll help you get started — whether you’re a student,
            teacher, parent, or school admin.
          </p>

          {/* Quick highlights */}
          <div className="contact-highlights">
            <div className="highlight-card">
              <h6>AI-Powered Support</h6>
              <p>
                Questions about Gemini grading, feedback, and learning paths.
              </p>
            </div>
            <div className="highlight-card">
              <h6>Schools & Partnerships</h6>
              <p>Onboarding, pilots, and institution-wide deployment.</p>
            </div>
            <div className="highlight-card">
              <h6>Privacy & Security</h6>
              <p>Data protection, access control, and compliance.</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          className="contact-form-container"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="container">
            {/* Name */}
            <label className="contact-label">
              <span>Name</span>
              <input
                type="text"
                className="contact-input"
                placeholder="Your full name"
                {...register("name", {
                  required: "Name is required",
                  pattern: {
                    value: /^[A-Za-z\s]+$/,
                    message: "Only letters are allowed",
                  },
                })}
              />
              {errors.name && (
                <p className="error-message">{errors.name.message}</p>
              )}
            </label>

            {/* Email */}
            <label className="contact-label">
              <span>Email</span>
              <input
                type="email"
                className="contact-input"
                placeholder="you@example.com"
                {...register("email", {
                  required: "Email is required",
                  pattern: {
                    value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
                    message: "Invalid email format",
                  },
                })}
              />
              {errors.email && (
                <p className="error-message">{errors.email.message}</p>
              )}
            </label>

            {/* Country */}
            <label className="contact-label">
              <span>Country</span>
              <select
                className="contact-input"
                {...register("country", {
                  required: "Please select a country",
                })}
              >
                <option value="">Select Your Country...</option>
                <option value="US">🇺🇸 United States</option>
                <option value="EG">🇪🇬 Egypt</option>
                <option value="UK">🇬🇧 United Kingdom</option>
                <option value="FR">🇫🇷 France</option>
                <option value="DE">🇩🇪 Germany</option>
                <option value="IN">🇮🇳 India</option>
              </select>
              {errors.country && (
                <p className="error-message">{errors.country.message}</p>
              )}
            </label>

            {/* Phone */}
            <label className="contact-label">
              <span>Phone Number</span>
              <input
                type="tel"
                className="contact-input"
                placeholder="Include country format if needed"
                {...register("phone", {
                  required: "Phone number is required",
                  pattern: {
                    value: selectedCountry
                      ? phoneValidationPatterns[selectedCountry]
                      : /^[0-9]{10,15}$/,
                    message: "Invalid phone number format for selected country",
                  },
                })}
              />
              {errors.phone && (
                <p className="error-message">{errors.phone.message}</p>
              )}
            </label>
          </div>

          {/* Role */}
          <label className="contact-label">
            <span>I am a...</span>
            <select
              className="contact-input"
              {...register("role", { required: "Please select your role" })}
            >
              <option value="">Select One...</option>
              <option value="Student">Student</option>
              <option value="Teacher">Teacher / Instructor</option>
              <option value="Parent">Parent</option>
              <option value="School Admin">School Admin</option>
              <option value="Partner">Partner / Organization</option>
              <option value="Other">Other</option>
            </select>
            {errors.role && (
              <p className="error-message">{errors.role.message}</p>
            )}
          </label>

          {/* Topic (project-aligned) */}
          <label className="contact-label">
            <span>Topic</span>
            <select
              className="contact-input"
              {...register("topic", { required: "Please select a topic" })}
            >
              <option value="">Select One...</option>
              <option value="AI Grading & Feedback">
                AI Grading & Feedback
              </option>
              <option value="Adaptive Learning Paths">
                Adaptive Learning Paths
              </option>
              <option value="Teacher Tools & Dashboards">
                Teacher Tools & Dashboards
              </option>
              <option value="Parent Progress Tracking">
                Parent Progress Tracking
              </option>
              <option value="Security & Privacy">Security & Privacy</option>
              <option value="School Partnership / Pilot">
                School Partnership / Pilot
              </option>
              <option value="Technical Support">Technical Support</option>
              <option value="Other">Other</option>
            </select>
            {errors.topic && (
              <p className="error-message">{errors.topic.message}</p>
            )}
          </label>

          {/* Message */}
          <label className="contact-label">
            <span>Message</span>
            <textarea
              className="contact-input"
              placeholder="Tell us what you need: goals, classroom size, features, or any issue you’re facing..."
              {...register("message", {
                required: "Message cannot be empty",
                minLength: {
                  value: 10,
                  message: "Message must be at least 10 characters",
                },
                maxLength: {
                  value: 700,
                  message: "Message cannot exceed 700 characters",
                },
              })}
              rows="6"
            />
            {errors.message && (
              <p className="error-message">{errors.message.message}</p>
            )}
          </label>

          {/* Terms */}
          <label className="checkbox-label">
            <input
              type="checkbox"
              {...register("terms", { required: "You must accept the terms" })}
            />
            <span>
              I accept the terms and understand my information will be used to
              respond to my request.
            </span>
          </label>
          {errors.terms && (
            <p className="error-message">{errors.terms.message}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary contact-form-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send Message"}
          </button>

          {/* Status */}
          {messageStatus && <p className="message-status">{messageStatus}</p>}
        </form>
      </div>
    </section>
  );
};

export default Contact;
