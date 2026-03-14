import { useState, useEffect } from "react";
import "./AnalyticsSidebar.css";

const AnalyticsSidebar = ({
  analytics = {
    totalQuizzes: 0,
    averageScore: 0,
    bestScore: 0,
    topicsAttempted: [],
    improvement: 0,
    streak: 0,
  },
  studentProgress = {
    improvement: 0,
    progress_data: [],
    weak_areas: [],
    strong_areas: [],
  },
  rubricData = null,
  curriculum = "IGCSE",
  subject = "General",
  questionType = "multiple_choice",
  gradeLevel = "high school",
  timeSpent = 0,
  currentScore = null,
}) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [isExpanded, setIsExpanded] = useState(true);

  // Mock progress data if not provided
  const progressData =
    studentProgress?.progress_data || generateMockProgressData();
  const weakAreas = studentProgress?.weak_areas || ["Algebra", "Geometry"];
  const strongAreas = studentProgress?.strong_areas || [
    "Arithmetic",
    "Statistics",
  ];

  function generateMockProgressData() {
    return Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString(),
      average_score: Math.floor(Math.random() * 30) + 60,
      quizzes_taken: Math.floor(Math.random() * 3) + 1,
    }));
  }

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const calculateSubjectMastery = () => {
    const baseScore = analytics.averageScore;
    const improvement = studentProgress?.improvement || 0;
    return Math.min(100, baseScore + improvement * 0.5);
  };

  const getPerformanceTrend = () => {
    if (progressData.length < 2) return "stable";
    const recent =
      progressData.slice(-3).reduce((sum, day) => sum + day.average_score, 0) /
      3;
    const previous =
      progressData
        .slice(-6, -3)
        .reduce((sum, day) => sum + day.average_score, 0) / 3;
    return recent > previous
      ? "improving"
      : recent < previous
      ? "declining"
      : "stable";
  };

  const performanceTrend = getPerformanceTrend();

  return (
    <div
      className={`analytics-sidebar ${isExpanded ? "expanded" : "collapsed"}`}
    >
      {/* Header */}
      <div className="sidebar-header">
        <div className="header-content">
          <h3>📊 Analytics Dashboard</h3>
          <button
            className="expand-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isExpanded ? "◀" : "▶"}
          </button>
        </div>

        {isExpanded && (
          <div className="tabs">
            {["overview", "progress", "rubric", "insights"].map((tab) => (
              <button
                key={tab}
                className={`tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="sidebar-content">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="tab-content">
              {/* Key Metrics */}
              <div className="metrics-grid">
                <div className="metric-card primary">
                  <div className="metric-icon">📚</div>
                  <div className="metric-value">{analytics.totalQuizzes}</div>
                  <div className="metric-label">Total Quizzes</div>
                </div>

                <div className="metric-card success">
                  <div className="metric-icon">🎯</div>
                  <div className="metric-value">{analytics.averageScore}%</div>
                  <div className="metric-label">Average Score</div>
                </div>

                <div className="metric-card warning">
                  <div className="metric-icon">🏆</div>
                  <div className="metric-value">{analytics.bestScore}%</div>
                  <div className="metric-label">Best Score</div>
                </div>

                <div className="metric-card info">
                  <div className="metric-icon">⚡</div>
                  <div className="metric-value">{analytics.streak || 0}</div>
                  <div className="metric-label">Day Streak</div>
                </div>
              </div>

              {/* Current Session */}
              <div className="session-info">
                <h4>Current Session</h4>
                <div className="session-stats">
                  <div className="session-stat">
                    <span className="stat-label">Time Spent:</span>
                    <span className="stat-value">{formatTime(timeSpent)}</span>
                  </div>
                  <div className="session-stat">
                    <span className="stat-label">Curriculum:</span>
                    <span className="stat-value">{curriculum}</span>
                  </div>
                  <div className="session-stat">
                    <span className="stat-label">Subject:</span>
                    <span className="stat-value">{subject}</span>
                  </div>
                </div>
              </div>

              {/* Performance Trend */}
              <div className="performance-trend">
                <h4>Performance Trend</h4>
                <div className={`trend-indicator ${performanceTrend}`}>
                  <span className="trend-icon">
                    {performanceTrend === "improving"
                      ? "📈"
                      : performanceTrend === "declining"
                      ? "📉"
                      : "➡️"}
                  </span>
                  <span className="trend-text">
                    {performanceTrend === "improving"
                      ? "Improving"
                      : performanceTrend === "declining"
                      ? "Needs attention"
                      : "Stable"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Progress Tab */}
          {activeTab === "progress" && (
            <div className="tab-content">
              {/* Progress Chart */}
              <div className="progress-chart">
                <h4>7-Day Progress</h4>
                <div className="chart-bars">
                  {progressData.map((day, index) => (
                    <div key={index} className="chart-bar-container">
                      <div className="chart-bar">
                        <div
                          className="chart-fill"
                          style={{ height: `${day.average_score}%` }}
                        ></div>
                      </div>
                      <div className="chart-label">
                        {new Date(day.date).toLocaleDateString("en-US", {
                          weekday: "short",
                        })}
                      </div>
                      <div className="chart-score">{day.average_score}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Improvement Stats */}
              <div className="improvement-stats">
                <div className="improvement-card">
                  <div className="improvement-value">
                    +{studentProgress?.improvement || 5}%
                  </div>
                  <div className="improvement-label">Overall Improvement</div>
                </div>

                <div className="mastery-level">
                  <div className="mastery-header">
                    <span>Subject Mastery</span>
                    <span>{calculateSubjectMastery()}%</span>
                  </div>
                  <div className="mastery-bar">
                    <div
                      className="mastery-fill"
                      style={{ width: `${calculateSubjectMastery()}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Areas Analysis */}
              <div className="areas-analysis">
                <div className="strong-areas">
                  <h5>💪 Strong Areas</h5>
                  <div className="areas-list">
                    {strongAreas.map((area, index) => (
                      <div key={index} className="area-item">
                        <span className="area-name">{area}</span>
                        <span className="area-score">85%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="weak-areas">
                  <h5>🎯 Needs Practice</h5>
                  <div className="areas-list">
                    {weakAreas.map((area, index) => (
                      <div key={index} className="area-item">
                        <span className="area-name">{area}</span>
                        <span className="area-score">45%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rubric Tab */}
          {activeTab === "rubric" && (
            <div className="tab-content">
              {rubricData ? (
                <div className="rubric-display">
                  <h4>📋 Grading Rubric</h4>
                  <div className="rubric-overview">
                    <div className="rubric-metrics">
                      <div className="rubric-metric">
                        <span>Total Points:</span>
                        <strong>{rubricData.total_points || 10}</strong>
                      </div>
                      <div className="rubric-metric">
                        <span>Criteria:</span>
                        <strong>
                          {rubricData.rubric_breakdown?.length || 4}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="rubric-criteria">
                    {rubricData.rubric_breakdown?.map((criterion, index) => (
                      <div key={index} className="criterion-item">
                        <div className="criterion-header">
                          <span className="criterion-point">
                            {criterion.point}
                          </span>
                          <span className="criterion-weight">
                            {criterion.max_points || 2.5} pts
                          </span>
                        </div>
                        <div className="criterion-feedback">
                          {criterion.feedback ||
                            "Demonstrate understanding of this point"}
                        </div>
                        <div className="criterion-examples">
                          <strong>Examples:</strong>{" "}
                          {criterion.examples ||
                            "Clear explanations, relevant examples"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-rubric">
                  <div className="empty-icon">📋</div>
                  <h5>No Rubric Generated</h5>
                  <p>
                    Generate a rubric for essay questions to see detailed
                    grading criteria.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Insights Tab */}
          {activeTab === "insights" && (
            <div className="tab-content">
              <div className="ai-insights">
                <h4>🤖 AI Insights</h4>

                <div className="insight-card">
                  <div className="insight-icon">💡</div>
                  <div className="insight-content">
                    <h5>Learning Pattern</h5>
                    <p>
                      You perform better on practical questions than theoretical
                      ones. Focus on understanding core concepts.
                    </p>
                  </div>
                </div>

                <div className="insight-card">
                  <div className="insight-icon">⏰</div>
                  <div className="insight-content">
                    <h5>Time Management</h5>
                    <p>
                      Average time per question: 2.5 minutes. Consider speeding
                      up on multiple-choice sections.
                    </p>
                  </div>
                </div>

                <div className="insight-card">
                  <div className="insight-icon">🎯</div>
                  <div className="insight-content">
                    <h5>Recommendation</h5>
                    <p>
                      Practice more {weakAreas[0]} questions to improve your
                      overall score.
                    </p>
                  </div>
                </div>
              </div>

              <div className="study-suggestions">
                <h4>📚 Study Suggestions</h4>
                <ul className="suggestions-list">
                  <li>Review {subject} fundamentals for 15 minutes daily</li>
                  <li>
                    Practice {questionType} questions under timed conditions
                  </li>
                  <li>Focus on {weakAreas.join(" and ")} topics this week</li>
                  <li>Take 2-3 quizzes per week to maintain progress</li>
                </ul>
              </div>

              <div className="next-milestone">
                <h4>🏆 Next Milestone</h4>
                <div className="milestone-card">
                  <div className="milestone-progress">
                    <div className="progress-circle">
                      <span>{analytics.averageScore}%</span>
                    </div>
                  </div>
                  <div className="milestone-info">
                    <strong>Reach 80% Average</strong>
                    <p>{80 - analytics.averageScore}% to go!</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mini View when Collapsed */}
      {!isExpanded && (
        <div className="sidebar-mini">
          <div className="mini-metric">
            <div className="mini-value">{analytics.averageScore}%</div>
            <div className="mini-label">Avg</div>
          </div>
          <div className="mini-metric">
            <div className="mini-value">{analytics.bestScore}%</div>
            <div className="mini-label">Best</div>
          </div>
          <div className="mini-metric">
            <div className="mini-value">{analytics.totalQuizzes}</div>
            <div className="mini-label">Quiz</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsSidebar;
