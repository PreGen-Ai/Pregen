import { useState, useEffect, useRef, useContext } from "react";
import { Button, Form, Table, Spinner, Alert } from "react-bootstrap";
import { toast } from "react-toastify";
import { ThemeContext } from "../../../context/ThemeContext";
import useDashboard from "../../../hooks/useDashboard";
import { useAuthContext } from "../../../context/AuthContext";
import AvatarEditor from "react-avatar-editor";
import axios from "axios";
import "../../styles/Settings.css";

const Settings = () => {
  const { state: authState } = useAuthContext();
  const { user } = authState || {};
  const {
    state: dashboardState = {},
    fetchProfile = () => {},
    handleUpdateProfile = async () => {},
    fetchDashboardData = () => {},
  } = useDashboard() || {};

  const [profile, setProfile] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Theme toggle
  const { theme, toggleTheme } = useContext(ThemeContext);

  // Firebase-style image upload
  const [profilePhoto, setProfilePhoto] = useState(user?.profilePhoto || null);
  const [image, setImage] = useState(null);
  const [scale, setScale] = useState(1.2);
  const [rotate, setRotate] = useState(0);
  const editorRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      try {
        await fetchDashboardData();
        if (user?._id) await fetchProfile();
        setLoading(false);
      } catch (err) {
        console.error("Settings load error:", err);
        setError("Failed to load settings data.");
        setLoading(false);
      }
    };
    init();
  }, [fetchDashboardData, fetchProfile, user]);

  useEffect(() => {
    if (dashboardState.profile) {
      setProfile({
        name: dashboardState.profile.name || "",
        email: dashboardState.profile.email || "",
        password: "",
      });
    }
  }, [dashboardState.profile]);

  const handleChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handleSubmitProfileUpdate = async () => {
    try {
      await handleUpdateProfile(profile);
      toast.success("Profile updated successfully.");
    } catch (err) {
      toast.error("Error updating profile.");
      console.error("Update error:", err);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) setImage(file);
  };

  const handleImageSave = async () => {
    if (!editorRef.current) return;

    const canvas = editorRef.current.getImageScaledToCanvas();
    const dataUrl = canvas.toDataURL();
    const blob = await fetch(dataUrl).then((res) => res.blob());

    const formData = new FormData();
    formData.append("photoFile", blob, "profile-photo.png");

    try {
      const res = await axios.put(
        `http://localhost:4000/api/users/update/${user._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const updatedPhoto = res.data.user.profilePhoto;
      setProfilePhoto(updatedPhoto);
      toast.success("Profile photo updated.");
    } catch (err) {
      toast.error("Failed to upload profile photo.");
      console.error("Photo upload error:", err);
    }
  };

  if (loading)
    return <Spinner animation="border" variant="primary" className="m-5" />;
  if (error)
    return (
      <Alert variant="danger" className="m-3">
        {error}
      </Alert>
    );

  return (
    <div className="settings-container">
      <h2>Settings</h2>

      <div className="theme-toggle mb-3">
        <Button variant="outline-secondary" onClick={toggleTheme}>
          Toggle to {theme === "light" ? "Dark" : "Light"} Mode
        </Button>
      </div>

      <div className="profile-photo-editor mb-4">
        <h5>Change Profile Photo</h5>
        {profilePhoto && (
          <img
            src={`http://localhost:4000${profilePhoto}`}
            alt="Current Profile"
            className="profile-photo mb-2"
          />
        )}
        <input type="file" accept="image/*" onChange={handleImageChange} />
        {image && (
          <>
            <AvatarEditor
              ref={editorRef}
              image={image}
              width={150}
              height={150}
              border={10}
              borderRadius={75}
              scale={scale}
              rotate={rotate}
            />
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
            />
            <Button
              variant="warning"
              onClick={() => setRotate((r) => r + 90)}
              className="mx-2"
            >
              Rotate
            </Button>
            <Button variant="success" onClick={handleImageSave}>
              Save
            </Button>
          </>
        )}
      </div>

      <h3>Profile Information</h3>
      <Form>
        <Form.Group controlId="name">
          <Form.Label>Name</Form.Label>
          <Form.Control
            type="text"
            name="name"
            value={profile.name}
            onChange={handleChange}
          />
        </Form.Group>

        <Form.Group controlId="email">
          <Form.Label>Email</Form.Label>
          <Form.Control
            type="email"
            name="email"
            value={profile.email}
            onChange={handleChange}
          />
        </Form.Group>

        <Form.Group controlId="password">
          <Form.Label>Password</Form.Label>
          <Form.Control
            type="password"
            name="password"
            value={profile.password}
            onChange={handleChange}
            placeholder="Enter new password (optional)"
          />
        </Form.Group>

        <Button
          variant="primary"
          onClick={handleSubmitProfileUpdate}
          className="mt-3"
        >
          Update Profile
        </Button>
      </Form>

     
    </div>
  );
};

export default Settings;
