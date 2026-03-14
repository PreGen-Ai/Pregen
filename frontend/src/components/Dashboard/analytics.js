import React, { useEffect, useState, useMemo } from "react";
import { useAuthContext } from "../../context/AuthContext";
import "../styles/Analytics.css";

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "https://pregen.onrender.com";

// Move all dummy data outside the component to avoid useEffect dependency issues
const dummyUserStats = { totalUsers: 120, activeUsers: 97, deleted: 5 };
const dummyWorkspaceStats = [
  { name: "AI Fundamentals", avgProgress: 78 },
  { name: "ML Projects", avgProgress: 83 },
  { name: "Deep Learning", avgProgress: 91 },
];
const dummyQuizPerformance = [
  { quiz: "Math Fundamentals", avgScore: 87 },
  { quiz: "AI Ethics", avgScore: 75 },
  { quiz: "Neural Networks", avgScore: 92 },
];
const dummyStudentPerformance = { avgScore: 85, rank: 5, totalQuizzes: 12 };
const dummyWeakAreas = [
  { subject: "Math", weakness: "Linear Algebra" },
  { subject: "AI", weakness: "Ethics and Bias" },
];
const dummyTimeline = [
  { week: "Week 1", score: 70 },
  { week: "Week 2", score: 80 },
  { week: "Week 3", score: 90 },
];
const dummyRecommendations = [
  "Review Neural Networks basics",
  "Focus on Data Preprocessing techniques",
  "Attempt more ML case studies",
];
const dummySessions = [
  { date: "2025-11-01", duration: 45 },
  { date: "2025-11-02", duration: 60 },
  { date: "2025-11-03", duration: 50 },
];

// NEW: Dummy Class 9BC Data
const dummyClassStudents = [
  { id: 1, name: "Emma Johnson", overallScore: 92, rank: 1, attendance: 98 },
  { id: 2, name: "Noah Williams", overallScore: 88, rank: 2, attendance: 95 },
  { id: 3, name: "Olivia Brown", overallScore: 87, rank: 3, attendance: 96 },
  { id: 4, name: "Liam Davis", overallScore: 85, rank: 4, attendance: 92 },
  { id: 5, name: "Ava Miller", overallScore: 84, rank: 5, attendance: 94 },
  {
    id: 6,
    name: "William Wilson",
    overallScore: 82,
    rank: 6,
    attendance: 90,
  },
  { id: 7, name: "Sophia Moore", overallScore: 80, rank: 7, attendance: 88 },
  { id: 8, name: "James Taylor", overallScore: 78, rank: 8, attendance: 85 },
  {
    id: 9,
    name: "Isabella Anderson",
    overallScore: 76,
    rank: 9,
    attendance: 91,
  },
  {
    id: 10,
    name: "Benjamin Thomas",
    overallScore: 74,
    rank: 10,
    attendance: 89,
  },
];

const dummySubjectPerformance = [
  { subject: "Mathematics", avgScore: 85, topScore: 98, improvement: 12 },
  { subject: "Science", avgScore: 82, topScore: 95, improvement: 8 },
  { subject: "English", avgScore: 88, topScore: 96, improvement: 15 },
  { subject: "History", avgScore: 79, topScore: 92, improvement: 5 },
  {
    subject: "Computer Science",
    avgScore: 91,
    topScore: 99,
    improvement: 18,
  },
];

const dummyPerformanceHeatmap = [
  {
    student: "Emma Johnson",
    math: 98,
    science: 95,
    english: 96,
    history: 90,
    cs: 99,
  },
  {
    student: "Noah Williams",
    math: 92,
    science: 90,
    english: 94,
    history: 85,
    cs: 95,
  },
  {
    student: "Olivia Brown",
    math: 90,
    science: 88,
    english: 95,
    history: 87,
    cs: 92,
  },
  {
    student: "Liam Davis",
    math: 88,
    science: 85,
    english: 90,
    history: 82,
    cs: 90,
  },
  {
    student: "Ava Miller",
    math: 85,
    science: 83,
    english: 92,
    history: 80,
    cs: 88,
  },
];

const dummyTopPerformers = [
  { subject: "Mathematics", topStudent: "Emma Johnson", score: 98 },
  { subject: "Science", topStudent: "Emma Johnson", score: 95 },
  { subject: "English", topStudent: "Olivia Brown", score: 95 },
  { subject: "History", topStudent: "Emma Johnson", score: 90 },
  { subject: "Computer Science", topStudent: "Emma Johnson", score: 99 },
];

const dummyClassStats = {
  totalStudents: 28,
  averageScore: 81,
  classRank: "2nd",
  attendanceRate: 92,
  topSubject: "Computer Science",
  weakestSubject: "History",
};

const Analytics = () => {
  const { state } = useAuthContext();
  const user = state?.user;
  const role = user?.role?.toLowerCase() || "student";

  const [useDummyData, setUseDummyData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState("9BC"); // Default class

  // Data states
  const [userStats, setUserStats] = useState(null);
  const [workspaceStats, setWorkspaceStats] = useState([]);
  const [quizPerformance, setQuizPerformance] = useState([]);
  const [studentPerformance, setStudentPerformance] = useState(null);
  const [weakAreas, setWeakAreas] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [sessions, setSessions] = useState([]);

  // NEW: Class 9BC Analytics Data
  const [classStudents, setClassStudents] = useState([]);
  const [subjectPerformance, setSubjectPerformance] = useState([]);
  const [performanceHeatmap, setPerformanceHeatmap] = useState([]);
  const [topPerformers, setTopPerformers] = useState([]);
  const [classStats, setClassStats] = useState(null);

  // Helper to fetch data
  const fetchData = async (endpoint, setter) => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setter(data);
    } catch (err) {
      console.error("Fetch error:", endpoint, err);
      setter(null);
    }
  };

  // 🔹 Role-based data fetching
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      if (useDummyData) {
        setUserStats(dummyUserStats);
        setWorkspaceStats(dummyWorkspaceStats);
        setQuizPerformance(dummyQuizPerformance);
        setStudentPerformance(dummyStudentPerformance);
        setWeakAreas(dummyWeakAreas);
        setTimeline(dummyTimeline);
        setRecommendations(dummyRecommendations);
        setSessions(dummySessions);

        // Load class analytics data
        setClassStudents(dummyClassStudents);
        setSubjectPerformance(dummySubjectPerformance);
        setPerformanceHeatmap(dummyPerformanceHeatmap);
        setTopPerformers(dummyTopPerformers);
        setClassStats(dummyClassStats);

        setLoading(false);
        return;
      }

      try {
        if (role === "admin") {
          await fetchData("/api/analytics/users", setUserStats);
          await fetchData("/api/analytics/workspaces", setWorkspaceStats);
        }

        if (role === "teacher") {
          await fetchData("/api/analytics/workspaces", setWorkspaceStats);
          await fetchData(
            "/api/analytics/quiz-performance",
            setQuizPerformance
          );

          // Load class analytics
          await fetchData(
            `/api/analytics/classes/${selectedClass}/students`,
            setClassStudents
          );
          await fetchData(
            `/api/analytics/classes/${selectedClass}/subjects`,
            setSubjectPerformance
          );
          await fetchData(
            `/api/analytics/classes/${selectedClass}/heatmap`,
            setPerformanceHeatmap
          );
          await fetchData(
            `/api/analytics/classes/${selectedClass}/top-performers`,
            setTopPerformers
          );
          await fetchData(
            `/api/analytics/classes/${selectedClass}/stats`,
            setClassStats
          );
        }

        if (role === "student" && user?._id) {
          await fetchData(
            `/api/analytics/students/${user._id}/performance`,
            setStudentPerformance
          );
          await fetchData(
            `/api/analytics/students/${user._id}/weak-areas`,
            setWeakAreas
          );
          await fetchData(
            `/api/analytics/students/${user._id}/timeline`,
            setTimeline
          );
          await fetchData(
            `/api/analytics/students/${user._id}/recommendations`,
            setRecommendations
          );
          await fetchData(
            `/api/analytics/students/${user._id}/sessions`,
            setSessions
          );
        }
      } catch (err) {
        console.error("Analytics load error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [role, user?._id, useDummyData, selectedClass]);

  // Helper function to get score color
  const getScoreColor = (score) => {
    if (score >= 90) return "#10b981"; // Green
    if (score >= 80) return "#f59e0b"; // Yellow
    if (score >= 70) return "#f97316"; // Orange
    return "#ef4444"; // Red
  };

  // Helper function to get heatmap cell color
  const getHeatmapColor = (score) => {
    if (score >= 90) return "#dcfce7"; // Light green
    if (score >= 80) return "#fef9c3"; // Light yellow
    if (score >= 70) return "#ffedd5"; // Light orange
    return "#fee2e2"; // Light red
  };

  // 🔹 Loader or UI
  if (loading)
    return <div className="analytics-loader">Loading analytics...</div>;

  return (
    <div className="analytics-container">
      <div className="header">
        <h1>📊 Learning Analytics Dashboard</h1>
        <div className="controls">
          {(role === "teacher" || role === "admin") && (
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="class-selector"
            >
              <option value="9BC">Class 9BC</option>
              <option value="9A">Class 9A</option>
              <option value="9B">Class 9B</option>
              <option value="10A">Class 10A</option>
              <option value="10B">Class 10B</option>
            </select>
          )}
          <button
            className="dummy-toggle"
            onClick={() => setUseDummyData(!useDummyData)}
          >
            {useDummyData ? "Using Dummy Data" : "Switch to Dummy Data"}
          </button>
        </div>
      </div>

      {/* ====================== CLASS 9BC ANALYTICS ====================== */}
      {(role === "teacher" || role === "admin") && (
        <>
          <div className="class-header">
            <h2>🏫 Class {selectedClass} Analytics</h2>
            {classStats && (
              <div className="class-overview-cards">
                <div className="glass-card">
                  <h3>Total Students</h3>
                  <p>{classStats.totalStudents}</p>
                </div>
                <div className="glass-card">
                  <h3>Average Score</h3>
                  <p>{classStats.averageScore}%</p>
                </div>
                <div className="glass-card">
                  <h3>Class Rank</h3>
                  <p>{classStats.classRank}</p>
                </div>
                <div className="glass-card">
                  <h3>Attendance Rate</h3>
                  <p>{classStats.attendanceRate}%</p>
                </div>
              </div>
            )}
          </div>

          {/* Top Students Leaderboard */}
          <div className="analytics-section">
            <h3>🏆 Top 10 Students - Class {selectedClass}</h3>
            <div className="leaderboard">
              {classStudents.slice(0, 10).map((student, index) => (
                <div key={student.id} className="leaderboard-item">
                  <div
                    className="rank-badge"
                    style={{
                      backgroundColor: getScoreColor(student.overallScore),
                    }}
                  >
                    #{student.rank}
                  </div>
                  <div className="student-info">
                    <span className="student-name">{student.name}</span>
                    <span
                      className="student-score"
                      style={{ color: getScoreColor(student.overallScore) }}
                    >
                      {student.overallScore}%
                    </span>
                  </div>
                  <div className="attendance">📊 {student.attendance}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject Performance */}
          <div className="analytics-section">
            <h3>📚 Subject Performance Analysis</h3>
            <div className="subject-grid">
              {subjectPerformance.map((subject, index) => (
                <div key={index} className="subject-card">
                  <h4>{subject.subject}</h4>
                  <div className="subject-stats">
                    <div className="stat">
                      <span className="label">Average:</span>
                      <span
                        className="value"
                        style={{ color: getScoreColor(subject.avgScore) }}
                      >
                        {subject.avgScore}%
                      </span>
                    </div>
                    <div className="stat">
                      <span className="label">Top Score:</span>
                      <span
                        className="value"
                        style={{ color: getScoreColor(subject.topScore) }}
                      >
                        {subject.topScore}%
                      </span>
                    </div>
                    <div className="stat">
                      <span className="label">Improvement:</span>
                      <span className="value positive">
                        +{subject.improvement}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Heatmap */}
          <div className="analytics-section">
            <h3>🔥 Performance Heatmap - Top 5 Students</h3>
            <div className="heatmap-container">
              <div className="heatmap-header">
                <div className="student-header">Student</div>
                <div className="subject-header">Mathematics</div>
                <div className="subject-header">Science</div>
                <div className="subject-header">English</div>
                <div className="subject-header">History</div>
                <div className="subject-header">Computer Science</div>
              </div>
              {performanceHeatmap.map((student, index) => (
                <div key={index} className="heatmap-row">
                  <div className="student-name">{student.student}</div>
                  <div
                    className="heatmap-cell"
                    style={{ backgroundColor: getHeatmapColor(student.math) }}
                    title={`Math: ${student.math}%`}
                  >
                    {student.math}%
                  </div>
                  <div
                    className="heatmap-cell"
                    style={{
                      backgroundColor: getHeatmapColor(student.science),
                    }}
                    title={`Science: ${student.science}%`}
                  >
                    {student.science}%
                  </div>
                  <div
                    className="heatmap-cell"
                    style={{
                      backgroundColor: getHeatmapColor(student.english),
                    }}
                    title={`English: ${student.english}%`}
                  >
                    {student.english}%
                  </div>
                  <div
                    className="heatmap-cell"
                    style={{
                      backgroundColor: getHeatmapColor(student.history),
                    }}
                    title={`History: ${student.history}%`}
                  >
                    {student.history}%
                  </div>
                  <div
                    className="heatmap-cell"
                    style={{ backgroundColor: getHeatmapColor(student.cs) }}
                    title={`Computer Science: ${student.cs}%`}
                  >
                    {student.cs}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Performers by Subject */}
          <div className="analytics-section">
            <h3>⭐ Top Performers by Subject</h3>
            <div className="top-performers-grid">
              {topPerformers.map((performer, index) => (
                <div key={index} className="performer-card">
                  <h4>{performer.subject}</h4>
                  <div className="performer-info">
                    <span className="performer-name">
                      {performer.topStudent}
                    </span>
                    <span
                      className="performer-score"
                      style={{ color: getScoreColor(performer.score) }}
                    >
                      {performer.score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Best and Worst Subjects */}
          <div className="analytics-section">
            <h3>🎯 Class Strengths & Weaknesses</h3>
            <div className="strengths-weaknesses">
              <div className="strength-card positive">
                <h4>🏆 Strongest Subject</h4>
                <p>{classStats?.topSubject}</p>
                <span className="score-highlight">
                  Average:{" "}
                  {
                    subjectPerformance.find(
                      (s) => s.subject === classStats?.topSubject
                    )?.avgScore
                  }
                  %
                </span>
              </div>
              <div className="strength-card negative">
                <h4>📉 Needs Improvement</h4>
                <p>{classStats?.weakestSubject}</p>
                <span className="score-highlight">
                  Average:{" "}
                  {
                    subjectPerformance.find(
                      (s) => s.subject === classStats?.weakestSubject
                    )?.avgScore
                  }
                  %
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ====================== ADMIN ANALYTICS ====================== */}
      {role === "admin" && (
        <>
          <h2>👑 Platform Overview</h2>
          <div className="card-grid">
            <div className="glass-card">
              <h3>Total Users</h3>
              <p>{userStats?.totalUsers ?? "N/A"}</p>
            </div>
            <div className="glass-card">
              <h3>Active Users</h3>
              <p>{userStats?.activeUsers ?? "N/A"}</p>
            </div>
            <div className="glass-card">
              <h3>Deleted Accounts</h3>
              <p>{userStats?.deleted ?? "N/A"}</p>
            </div>
          </div>

          <h2>🧠 Workspace Performance</h2>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Avg Progress (%)</th>
              </tr>
            </thead>
            <tbody>
              {workspaceStats?.map((ws, i) => (
                <tr key={i}>
                  <td>{ws.name}</td>
                  <td>{ws.avgProgress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ====================== TEACHER ANALYTICS ====================== */}
      {role === "teacher" && (
        <>
          <h2>🏫 Workspace Progress</h2>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Average Progress (%)</th>
              </tr>
            </thead>
            <tbody>
              {workspaceStats?.map((w, i) => (
                <tr key={i}>
                  <td>{w.name}</td>
                  <td>{w.avgProgress}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>🧩 Quiz Performance Distribution</h2>
          <div className="card-grid">
            {quizPerformance?.map((q, i) => (
              <div key={i} className="glass-card">
                <h3>{q.quiz}</h3>
                <p>Average Score: {q.avgScore}%</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ====================== STUDENT ANALYTICS ====================== */}
      {role === "student" && (
        <>
          <h2>🎓 My Performance Overview</h2>
          {studentPerformance ? (
            <div className="card-grid">
              <div className="glass-card">
                <h3>Average Score</h3>
                <p>{studentPerformance.avgScore}%</p>
              </div>
              <div className="glass-card">
                <h3>Rank</h3>
                <p>#{studentPerformance.rank}</p>
              </div>
              <div className="glass-card">
                <h3>Total Quizzes</h3>
                <p>{studentPerformance.totalQuizzes}</p>
              </div>
            </div>
          ) : (
            <p>No performance data available.</p>
          )}

          <h2>📉 Weak Areas</h2>
          <ul className="weakness-list">
            {weakAreas.length > 0 ? (
              weakAreas.map((w, i) => (
                <li key={i}>
                  <strong>{w.subject}</strong>: {w.weakness}
                </li>
              ))
            ) : (
              <li>No weak areas detected 🎯</li>
            )}
          </ul>

          <h2>📈 Progress Timeline</h2>
          <div className="timeline-chart">
            {timeline.map((t, i) => (
              <div key={i} className="timeline-bar">
                <span>{t.week}</span>
                <div className="progress-bar" style={{ width: `${t.score}%` }}>
                  {t.score}%
                </div>
              </div>
            ))}
          </div>

          <h2>💡 Personalized Recommendations</h2>
          <ul>
            {recommendations.map((r, i) => (
              <li key={i}>✅ {r}</li>
            ))}
          </ul>

          <h2>🕒 Daily Learning Sessions</h2>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Duration (mins)</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={i}>
                  <td>{s.date}</td>
                  <td>{s.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {useDummyData && (
        <div className="dummy-notice">
          📝 Currently displaying static dummy data for demonstration purposes.
        </div>
      )}
    </div>
  );
};

export default Analytics;
