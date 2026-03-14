import { Link } from "react-router-dom";
import "../../styles/signup.css"; // Shared CSS
import { useSignup } from "../../../hooks/useSignup";

const Signup = () => {
  const {
    username,
    setUsername,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    gender,
    setGender,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    errorMessage,
    successMessage,
    isLoading,
    handleSignup,
  } = useSignup();

  return (
    <div className="main-Container">
      <div className="frame-Container">
        <div className="left-sign">
          <h2 className="signup_title">
            Sign Up 
          </h2>

          <form
            style={{ width: "90%", margin: "auto", gap: "20px" }}
            onSubmit={handleSignup}
          >
            {/* Username */}
            <div className="field">
              <div className="field-wrapper">
                <label htmlFor="username">Username</label>
                <input
                  placeholder="Enter your username"
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={30} // Max length per model is 30
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="field">
              <div className="field-wrapper">
                <label htmlFor="email">Email</label>
                <input
                  placeholder="Enter your email"
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={100} // Slightly more lenient
                  required
                />
              </div>
            </div>

            {/* First Name */}
            <div className="field">
              <div className="field-wrapper">
                <label htmlFor="firstName">First Name</label>
                <input
                  placeholder="Enter your first name"
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
            </div>

            {/* Last Name */}
            <div className="field">
              <div className="field-wrapper">
                <label htmlFor="lastName">Last Name</label>
                <input
                  placeholder="Enter your last name"
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="field password-container">
              <div className="field-wrapper">
                <label htmlFor="password">Password</label>
                <input
                  placeholder="Enter your password"
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <i
                    className={showPassword ? "fas fa-eye-slash" : "fas fa-eye"}
                  />
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="field password-container">
              <div className="field-wrapper">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  placeholder="Confirm your password"
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <i
                    className={
                      showConfirmPassword ? "fas fa-eye-slash" : "fas fa-eye"
                    }
                  />
                </button>
              </div>
            </div>

            {/* Gender */}
            <fieldset className="field_gender" required>
              <legend>Gender</legend>
              <div className="gender-container">
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === "male"}
                    onChange={(e) => setGender(e.target.value)}
                    required
                  />
                  Male
                </label>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === "female"}
                    onChange={(e) => setGender(e.target.value)}
                    required
                  />
                  Female
                </label>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="other"
                    checked={gender === "other"}
                    onChange={(e) => setGender(e.target.value)}
                    required
                  />
                  Other
                </label>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="prefer-not-to-say"
                    checked={gender === "prefer-not-to-say"}
                    onChange={(e) => setGender(e.target.value)}
                    required
                  />
                  Prefer not to say
                </label>
              </div>
            </fieldset>

            {/* Error / Success messages */}
            {errorMessage && <div className="error">{errorMessage}</div>}
            {successMessage && <div className="success">{successMessage}</div>}

            {/* Submit */}
            <button className="left_btn" type="submit" disabled={isLoading}>
              {isLoading ? "Signing up..." : "Signup"}
            </button>
          </form>
        </div>

        {/* Right Section */}
        <div className="right-sign">
          <h1>Already have an account?</h1>
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
