import AiRobot from "../../../assets/ai-2.webp";
import EyeIcon from "../../../assets/eye.svg";
import EyeOffIcon from "../../../assets/eye-off.svg";
import "../../styles/login.css";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useLogin } from "../../../hooks/useLogin";
import { useAuthContext } from "../../../context/AuthContext";

const Login = ({ onLoginSuccess }) => {
  const {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    errorMessage,
    successMessage,
    isLoading,
    handleLogin,
  } = useLogin();

  const { isAuthenticated, user, loading: authLoading } = useAuthContext();
  const navigate = useNavigate();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (authLoading || hasRedirected.current) return;
    if (isAuthenticated && user) {
      hasRedirected.current = true;
      navigate("/dashboard", { replace: true });
      if (onLoginSuccess) onLoginSuccess();
    }
  }, [isAuthenticated, user, authLoading, navigate, onLoginSuccess]);

  const handleSubmit = async (e) => {
    await handleLogin(e);
    if (onLoginSuccess && !errorMessage) onLoginSuccess();
  };

  return (
    <div className="login-page">
      <div className="login-frame">
        {/* Left: Form */}
        <div className="login-left">
          <div className="login-form-wrap">
            <h1 className="login-title">
              Sign in to <span className="login-title-brand">PreGen</span>
            </h1>
            <p className="login-subtitle">
              Experience smarter education with Google Gemini AI—personalized
              learning, instant grading, and real-time feedback for students,
              teachers, and parents.
            </p>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              {/* Email */}
              <div className="login-field-box">
                <label className="login-field-label" htmlFor="login-email">
                  Email address
                </label>
                <input
                  id="login-email"
                  className="login-field-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="login-field-box">
                <label className="login-field-label" htmlFor="login-password">
                  Password
                </label>
                <div className="login-field-pw">
                  <input
                    id="login-password"
                    className="login-field-input pw-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    <img
                      src={showPassword ? EyeOffIcon : EyeIcon}
                      alt=""
                      className="pw-eye"
                    />
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              <div className="login-forgot-row">
                <span className="login-forgot">Forgot password?</span>
              </div>

              {/* Error / success messages */}
              {errorMessage && (
                <div className="login-msg error" role="alert">
                  {errorMessage}
                </div>
              )}
              {successMessage && (
                <div className="login-msg success" role="status">
                  {successMessage}
                </div>
              )}

              {/* Submit */}
              <button
                className="login-submit"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="login-signup-line">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="login-signup-link">
                Sign up
              </Link>
            </p>
          </div>
        </div>

        {/* Right: Robot image */}
        <div className="login-right" aria-hidden="true">
          <img
            className="login-robot"
            src={AiRobot}
            alt=""
            loading="eager"
            decoding="async"
          />
        </div>
      </div>
    </div>
  );
};

export default Login;
