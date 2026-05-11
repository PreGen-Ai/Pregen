import { Bot, SendHorizontal, FileText, Sparkles } from "lucide-react";

export default function LiveDemoSection() {
  return (
    <section className="lp-demo">
      <div className="lp-container">
        <div className="lp-demo__grid">
          {/* Left — text */}
          <div>
            <div className="lp-demo__eyebrow-pill">
              <Bot size={14} strokeWidth={2.5} />
              <span>AI Tutor</span>
            </div>

            <h2 className="lp-demo__title">
              Your AI learning companion—on demand
            </h2>

            <p className="lp-demo__desc">
              Ask any question across any subject and get instant, accurate
              explanations tailored to your level. No more waiting for office
              hours or searching through textbooks.
            </p>

            <ul className="lp-demo__bullets">
              {[
                "Ask any subject-specific question",
                "Get step-by-step explanations",
                "Practice and quiz yourself in real-time",
                "Upload PDFs and ask questions about them",
              ].map((item) => (
                <li key={item} className="lp-demo__bullet">
                  <Sparkles size={15} strokeWidth={2.5} className="lp-demo__bullet-icon" />
                  {item}
                </li>
              ))}
            </ul>

            <a href="https://preprod-pregen.netlify.app/" className="lp-btn lp-btn--orange">
              Try it free — no account needed
            </a>
          </div>

          {/* Right — chat preview */}
          <div className="lp-chat">
            {/* Header */}
            <div className="lp-chat__header">
              <div className="lp-chat__avatar">
                <Bot size={18} strokeWidth={2} color="#fff" />
              </div>
              <div className="lp-chat__hdr-info">
                <div className="lp-chat__hdr-name">Pregen Tutor</div>
                <div className="lp-chat__hdr-online">
                  <div className="lp-chat__hdr-dot" /> Online
                </div>
              </div>
              <div className="lp-chat__hdr-menu">
                <div className="lp-chat__hdr-dot2" />
                <div className="lp-chat__hdr-dot2" />
                <div className="lp-chat__hdr-dot2" />
              </div>
            </div>

            {/* Messages */}
            <div className="lp-chat__body">
              <div className="lp-chat__messages">
                {/* AI greeting */}
                <div className="lp-msg lp-msg--ai">
                  <div
                    className="lp-msg__av"
                    style={{ background: "#2f6fed", color: "#fff" }}
                  >
                    <Bot size={14} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="lp-msg__bubble">
                      Hi! I'm your AI tutor. What would you like to learn
                      today? I can suggested you a new course!
                    </div>
                    <div className="lp-msg__suggestion">
                      <Sparkles size={11} strokeWidth={2.5} />
                      Suggested: A new course → Inorganic Chemistry
                    </div>
                  </div>
                </div>

                {/* User message */}
                <div className="lp-msg lp-msg--user">
                  <div
                    className="lp-msg__av"
                    style={{ background: "#6b7280", color: "#fff" }}
                  >
                    U
                  </div>
                  <div className="lp-msg__bubble">
                    Can you explain how photosynthesis works?
                  </div>
                </div>

                {/* AI response */}
                <div className="lp-msg lp-msg--ai">
                  <div
                    className="lp-msg__av"
                    style={{ background: "#2f6fed", color: "#fff" }}
                  >
                    <Bot size={14} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="lp-msg__bubble">
                      Great choice! Photosynthesis is a fascinating process
                      where plants convert light into energy. The simplified
                      reaction is:
                      <div className="lp-msg__formula">
                        6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Input bar */}
            <div className="lp-chat__footer">
              <button className="lp-chat__action-btn" aria-label="Upload file">
                <FileText size={14} strokeWidth={2} />
              </button>
              <input
                className="lp-chat__input"
                placeholder="Ask any question..."
                readOnly
                aria-label="Chat input (demo)"
              />
              <button className="lp-chat__action-btn" aria-label="Sparkles">
                <Sparkles size={13} strokeWidth={2.5} />
              </button>
              <button className="lp-chat__send" aria-label="Send">
                <SendHorizontal size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
