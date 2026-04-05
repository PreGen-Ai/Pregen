// Login.jsx (updated to use PreGen title/subtitle + your hero images)
import Logo320 from "../../../assets/logo-320.webp";
import Logo640 from "../../../assets/logo-640.webp";
import Logo1024 from "../../../assets/logo-1024.webp";

import Hero256 from "../../../assets/hero-256.webp";
import Hero512 from "../../../assets/hero-512.webp";
import Hero768 from "../../../assets/hero-768.webp";
import Hero1024 from "../../../assets/hero-1024.webp";

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
      {/* Top Nav */}
      <header className="login-topbar">
        <div className="brand">
          <img
            className="brand-logo"
            src={Logo320}
            srcSet={`${Logo320} 320w, ${Logo640} 640w, ${Logo1024} 1024w`}
            sizes="(max-width: 768px) 120px, 160px"
            alt="PreGen"
            loading="eager"
          />
          <span className="brand-text">PreGen</span>
        </div>

        <nav className="login-nav" aria-label="Primary">
          <Link className="nav-link active" to="/">
            Home
          </Link>
          <Link className="nav-link" to="/about">
            About us
          </Link>
          <Link className="nav-link" to="/blog">
            Blog
          </Link>
          <Link className="nav-link" to="/pricing">
            Pricing
          </Link>
        </nav>
      </header>

      {/* Main Split Layout */}
      <main className="login-hero">
        {/* Left: Headline + Form */}
        <section className="hero-left">
          <h1 className="hero-title">
            Welcome back to PreGen — Learn faster. Teach smarter.
          </h1>

          <p className="hero-subtitle">
            Your AI classroom assistant for generating quizzes and assignments
            in minutes, with instant grading and clear explanations—then export
            polished PDF reports in one click, without the busywork.
          </p>

          <form className="login-form" onSubmit={handleSubmit}>
            {/* Email */}
            <input
              className="login-input"
              type="email"
              placeholder=""
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              aria-label="Email"
              autoComplete="email"
            />

            {/* Password */}
            <input
              className="login-input"
              type="password"
              placeholder=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              aria-label="Password"
              autoComplete="current-password"
            />

            {/* Checkbox row */}
            <div className="login-row">
              <label className="remember" aria-label="Remember me">
                <input type="checkbox" />
                <span />
              </label>
            </div>

            {/* Messages */}
            {errorMessage && (
              <div className="login-msg error">{errorMessage}</div>
            )}
            {successMessage && (
              <div className="login-msg success">{successMessage}</div>
            )}

            {/* Buttons */}
            <div className="login-actions">
              <button
                className="btn primary"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? "Logging in..." : "Login"}
              </button>

              <Link to="/signup" className="btn-link">
                <button
                  className="btn secondary"
                  type="button"
                  disabled={isLoading}
                >
                  Request Access
                </button>
              </Link>
            </div>
          </form>
        </section>

        {/* Right: Hero Image */}
        <section className="hero-right" aria-hidden="true">
          <div className="illustration-wrap">
            <img
              className="illustration"
              src={Hero512}
              srcSet={`${Hero256} 256w, ${Hero512} 512w, ${Hero768} 768w, ${Hero1024} 1024w`}
              sizes="(max-width: 980px) 90vw, 520px"
              alt=""
              loading="eager"
              decoding="async"
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default Login;
