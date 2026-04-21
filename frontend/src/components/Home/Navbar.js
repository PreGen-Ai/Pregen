import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Navbar,
  Nav,
  Container,
  Modal,
  Form,
  Row,
  Col,
  Button,
  Dropdown,
  Image,
} from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faSignOutAlt,
  faChalkboardTeacher,
  faShieldAlt,
  faGraduationCap,
} from "@fortawesome/free-solid-svg-icons";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { useLogout } from "../../hooks/useLogout";
import {
  ACTIVE_TENANT_EVENT,
  getActiveTenantContext,
} from "../../services/api/http";
import Login from "../LOGIN&REGISTRATION/Login/Login";

import Logo320 from "../../assets/logo-320.webp";
import Logo640 from "../../assets/logo-640.webp";
import Logo1024 from "../../assets/logo-1024.webp";

import "../styles/navbar.css";
import { motion } from "framer-motion";

const NavBar = () => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTenantContext, setActiveTenantContextState] = useState(() =>
    getActiveTenantContext(),
  );

  const navRef = useRef(null);

  const { user, isAuthenticated } = useAuthContext();
  const { logout } = useLogout();

  const navigate = useNavigate();
  const location = useLocation();

  const role = (user?.role || "student").toLowerCase();
  const displayName =
    user?.username || user?.name || user?.email?.split("@")?.[0] || "User";

  /* ============================ */
  /* UI Effects */
  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 50);
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setExpanded(false), [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (expanded && navRef.current && !navRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  useEffect(() => {
    document.body.style.overflow = expanded ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [expanded]);

  useEffect(() => {
    if (isAuthenticated) setShowLoginModal(false);
  }, [isAuthenticated]);

  useEffect(() => {
    const syncActiveTenant = () => {
      setActiveTenantContextState(getActiveTenantContext());
    };

    window.addEventListener("storage", syncActiveTenant);
    window.addEventListener(ACTIVE_TENANT_EVENT, syncActiveTenant);

    return () => {
      window.removeEventListener("storage", syncActiveTenant);
      window.removeEventListener(ACTIVE_TENANT_EVENT, syncActiveTenant);
    };
  }, []);

  /* ============================ */
  /* Helpers */
  const closeNav = useCallback(() => setExpanded(false), []);
  const toggleNav = useCallback(() => setExpanded((v) => !v), []);

  const handleLoginModalClose = useCallback(() => setShowLoginModal(false), []);

  const openLogin = useCallback(() => {
    closeNav();
    setShowLoginModal(true);
  }, [closeNav]);

  const requireAuth = useCallback(
    (nextPath) => {
      if (!isAuthenticated) {
        openLogin();
        return;
      }
      closeNav();
      navigate(nextPath);
    },
    [isAuthenticated, navigate, openLogin, closeNav],
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      closeNav();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, [logout, navigate, closeNav]);

  const handleSearchSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const q = searchTerm.trim();
      if (!q) return;

      requireAuth(`/SearchResults?query=${encodeURIComponent(q)}`);
      setSearchTerm("");
    },
    [searchTerm, requireAuth],
  );

  const { roleLabel, roleIcon } = useMemo(() => {
    if (role === "superadmin")
      return { roleLabel: "Super Admin", roleIcon: faShieldAlt };
    if (role === "admin") return { roleLabel: "Admin", roleIcon: faShieldAlt };
    if (role === "teacher")
      return { roleLabel: "Instructor", roleIcon: faChalkboardTeacher };
    if (role === "parent") return { roleLabel: "Parent", roleIcon: faUser };
    return { roleLabel: "Student", roleIcon: faGraduationCap };
  }, [role]);

  const avatarSrc =
    user?.profilePhoto ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`;

  const selectedSchoolLabel =
    activeTenantContext?.tenantName || activeTenantContext?.tenantId || "";

  return (
    <>
      <Navbar
        expand="lg"
        ref={navRef}
        expanded={expanded}
        className={`navbar-custom ${scrolled ? "navbar-scrolled" : ""}`}
        variant="dark"
      >
        <Container fluid>
          <Navbar.Brand
            as={Link}
            to="/login"
            className="navbar-logo d-flex align-items-center"
            onClick={closeNav}
          >
            <motion.img
              src={Logo640}
              srcSet={`${Logo320} 320w, ${Logo640} 640w, ${Logo1024} 1024w`}
              sizes="(max-width: 576px) 120px, (max-width: 992px) 160px, 180px"
              alt="AI E-Learning"
              width={70}
              height={50}
              loading="eager"
              decoding="async"
              className="me-2 rounded shadow-sm"
            />
            <span className="fw-bold text-light">AI E-Learning</span>
          </Navbar.Brand>

          <Navbar.Toggle
            aria-controls="basic-navbar-nav"
            onClick={toggleNav}
            className="navbar-toggler"
          />

          <Navbar.Collapse
            id="basic-navbar-nav"
            className="justify-content-end"
          >
            <Nav className="align-items-center">
              <Nav.Link
                as={Link}
                to="/contact"
                className={`nav-link ${location.pathname === "/contact" ? "active" : ""}`}
                onClick={closeNav}
              >
                Contact
              </Nav.Link>

              <Nav.Link
                as="button"
                type="button"
                className={`nav-link btn btn-link p-0 ${
                  location.pathname.startsWith("/courses") ? "active" : ""
                }`}
                onClick={() => requireAuth("/courses")}
              >
                Courses
              </Nav.Link>

              {isAuthenticated && (
                <Nav.Link
                  as={Link}
                  to="/dashboard"
                  className={`nav-link ${
                    location.pathname.startsWith("/dashboard") ? "active" : ""
                  }`}
                  onClick={closeNav}
                >
                  Dashboard
                </Nav.Link>
              )}

              <Form
                className="d-flex align-items-center mt-2 mt-lg-0 me-3"
                onSubmit={handleSearchSubmit}
                role="search"
              >
                <Row className="g-0 align-items-center">
                  <Col xs="auto">
                    <Form.Control
                      type="search"
                      placeholder="Search courses..."
                      aria-label="Search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="me-2"
                    />
                  </Col>
                  <Col xs="auto">
                    <Button type="submit" variant="outline-light" size="sm">
                      Go
                    </Button>
                  </Col>
                </Row>
              </Form>

              {isAuthenticated && user ? (
                <Dropdown align="end">
                  <Dropdown.Toggle
                    id="navbar-user-dropdown"
                    as="button"
                    type="button"
                    className="btn btn-link nav-link p-0 text-light d-flex align-items-center"
                    style={{ textDecoration: "none" }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.03 }}
                      className="d-flex align-items-center"
                    >
                      <Image
                        src={avatarSrc}
                        roundedCircle
                        width={35}
                        height={35}
                        className="me-2 border border-light"
                        alt="Profile"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="fw-semibold">{displayName}</span>
                    </motion.div>
                  </Dropdown.Toggle>

                  <Dropdown.Menu className="dropdown-menu-dark">
                    <Dropdown.Header className="text-center small text-secondary">
                      <FontAwesomeIcon icon={roleIcon} className="me-2" />
                      {roleLabel}
                    </Dropdown.Header>

                    {role === "superadmin" && selectedSchoolLabel ? (
                      <Dropdown.Header className="small text-secondary border-top border-secondary-subtle">
                        Selected School: {selectedSchoolLabel}
                      </Dropdown.Header>
                    ) : null}

                    <Dropdown.Item
                      as={Link}
                      to="/dashboard/settings"
                      onClick={closeNav}
                    >
                      Profile Settings
                    </Dropdown.Item>

                    {role === "student" && (
                      <Dropdown.Item
                        as={Link}
                        to="/dashboard/calendar"
                        onClick={closeNav}
                      >
                        Calendar & Dues
                      </Dropdown.Item>
                    )}

                    {(role === "student" ||
                      role === "teacher" ||
                      role === "parent") && (
                      <Dropdown.Item
                        as={Link}
                        to="/dashboard/leaderboard"
                        onClick={closeNav}
                      >
                        Leaderboard
                      </Dropdown.Item>
                    )}

                    {role === "teacher" && (
                      <>
                        <Dropdown.Item
                          as={Link}
                          to="/dashboard/teacher/assignments"
                          onClick={closeNav}
                        >
                          Manage Assignments
                        </Dropdown.Item>
                        <Dropdown.Item
                          as={Link}
                          to="/dashboard/teacher/quizzes"
                          onClick={closeNav}
                        >
                          Manage Quizzes
                        </Dropdown.Item>
                      </>
                    )}

                    {(role === "admin" || role === "superadmin") && (
                      <Dropdown.Item
                        as={Link}
                        to="/dashboard/admin/users"
                        onClick={closeNav}
                      >
                        {role === "superadmin"
                          ? "Platform User Directory"
                          : "School User Management"}
                      </Dropdown.Item>
                    )}

                    {role === "superadmin" && (
                      <>
                        <Dropdown.Item
                          as={Link}
                          to="/dashboard/superadmin/analytics"
                          onClick={closeNav}
                        >
                          Platform Analytics
                        </Dropdown.Item>
                        <Dropdown.Item
                          as={Link}
                          to="/dashboard/superadmin/tenants"
                          onClick={closeNav}
                        >
                          Schools
                        </Dropdown.Item>
                        <Dropdown.Item
                          as={Link}
                          to="/dashboard/superadmin/ai-controls"
                          onClick={closeNav}
                        >
                          Platform AI Controls
                        </Dropdown.Item>
                        <Dropdown.Item
                          as={Link}
                          to="/dashboard/superadmin/ai-cost"
                          onClick={closeNav}
                        >
                          AI Usage & Cost
                        </Dropdown.Item>
                        <Dropdown.Item
                          as={Link}
                          to="/dashboard/superadmin/audit"
                          onClick={closeNav}
                        >
                          Audit Logs
                        </Dropdown.Item>
                        {selectedSchoolLabel ? (
                          <Dropdown.Item
                            as={Link}
                            to="/dashboard/admin/users"
                            onClick={closeNav}
                          >
                            Selected School Tools
                          </Dropdown.Item>
                        ) : null}
                      </>
                    )}

                    <Dropdown.Divider />

                    <Dropdown.Item
                      onClick={handleLogout}
                      className="text-danger"
                    >
                      <FontAwesomeIcon icon={faSignOutAlt} className="me-2" />
                      Logout
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              ) : (
                <Button
                  variant="outline-light"
                  className="ms-2"
                  onClick={openLogin}
                >
                  <FontAwesomeIcon icon={faUser} /> Login
                </Button>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      <Modal
        show={showLoginModal}
        onHide={handleLoginModalClose}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Body className="p-0">
          <div className="login-modal-wrapper css-scale-in">
            <button
              className="login-modal-close"
              onClick={handleLoginModalClose}
              aria-label="Close"
              type="button"
            >
              ×
            </button>

            <div className="login-modal-container">
              <Login onLoginSuccess={handleLoginModalClose} />
            </div>
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
};

export default NavBar;
