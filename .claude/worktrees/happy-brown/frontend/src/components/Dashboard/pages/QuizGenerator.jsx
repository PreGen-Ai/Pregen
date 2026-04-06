// src/pages/quizzes/QuizzesPage.jsx
import TeacherQuizzesPage from "./TeacherQuiz";
import StudentQuizzesPage from "./StudentQuiz";
import { useAuthContext } from "../../../context/AuthContext";

export default function QuizzesPage() {
  const { user } = useAuthContext();
  const role = String(user?.role || "").toLowerCase();

  if (role === "teacher") return <TeacherQuizzesPage />;
  if (role === "student") return <StudentQuizzesPage />;

  return (
    <div className="quizzes-page">
      <div className="dash-card">
        <h2>Quizzes</h2>
        <p className="text-muted">You do not have access to this page.</p>
      </div>
    </div>
  );
}
