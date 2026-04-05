import { Link } from "react-router-dom";
import "../../styles/signup.css";

const Signup = () => {
  return (
    <div className="main-Container">
      <div className="frame-Container">
        <div className="left-sign">
          <h2 className="signup_title">Request Access</h2>

          <div
            style={{
              width: "90%",
              margin: "auto",
              display: "grid",
              gap: 18,
              color: "#fff",
            }}
          >
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              Public signup is disabled. All accounts are created by a Super
              Admin or your school administrator for this LMS.
            </p>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 16,
                padding: 18,
                background: "rgba(255,255,255,0.05)",
                lineHeight: 1.6,
              }}
            >
              Use the email and password shared with you by your administrator.
              If you need an account, contact your tenant admin or request a
              demo for a new school setup.
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/login">
                <button className="left_btn" type="button">
                  Go to Login
                </button>
              </Link>

              <Link to="/contact">
                <button className="right_btn custom_reg" type="button">
                  Contact Us
                </button>
              </Link>
            </div>
          </div>
        </div>

        <div className="right-sign">
          <h1>Already have an account?</h1>
          <p style={{ color: "#fff", opacity: 0.85, lineHeight: 1.6 }}>
            Sign in with the credentials your school administrator created for
            you.
          </p>
          <Link to="/login">
            <button className="right_btn custom_reg" type="button">
              Login
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
