import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Home from "./components/Home/home";
import "./components/styles/Home.css";

const REDIRECT_URL = "https://preprod-pregen.netlify.app/";

function RedirectToPreprod() {
  useEffect(() => {
    window.location.href = REDIRECT_URL;
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/landing" element={<Home />} />
        <Route path="/go" element={<RedirectToPreprod />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
