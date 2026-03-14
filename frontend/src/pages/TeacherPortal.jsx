import React, { useEffect, useState } from 'react';
import api from "../services/api/api";
import Leaderboard from '../components/Dashboard/analytics';

/**
 * Teacher portal page. Allows creating assignments, grading submissions,
 * viewing stats and the leaderboard.
 */
const TeacherPortal = () => {
  const [assignments, setAssignments] = useState([]);
  const [stats, setStats] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
  });

  const fetchAssignments = () => {
    // Teachers may want to see only their assignments,
    // but for now we retrieve all assignments.
    api
      .get('/student/assignments')
      .then((res) => setAssignments(res.data))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchAssignments();
    api
      .get('/teacher/statistics')
      .then((res) => setStats(res.data))
      .catch((err) => console.error(err));
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/teacher/assignments', form);
      setForm({ title: '', description: '', dueDate: '' });
      fetchAssignments();
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating assignment');
    }
  };

  const handleGrade = async (assignmentId) => {
    try {
      await api.post('/teacher/assignments/grade', { assignmentId });
      alert('Submissions graded');
      fetchAssignments();
    } catch (err) {
      alert(err.response?.data?.error || 'Error grading submissions');
    }
  };

  return (
    <div>
      <h2>Teacher Portal</h2>
      <section>
        <h3>Create Assignment</h3>
        <form onSubmit={handleCreate}>
          <input
            type="text"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Title"
            required
          />
          <input
            type="text"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Description"
          />
          <input
            type="date"
            name="dueDate"
            value={form.dueDate}
            onChange={handleChange}
            required
          />
          <button type="submit">Create</button>
        </form>
      </section>
      <section>
        <h3>Your Assignments</h3>
        <ul>
          {assignments.map((a) => (
            <li key={a._id}>
              {a.title} – Due: {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'N/A'}
              <button style={{ marginLeft: '1rem' }} onClick={() => handleGrade(a._id)}>
                Grade
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Statistics</h3>
        <ul>
          {stats.map((s) => (
            <li key={s.assignmentId}>
              {s.title}: Avg Score {s.averageScore.toFixed(2)} ({s.submissions}{' '}
              submissions)
            </li>
          ))}
        </ul>
      </section>
      <Leaderboard />
    </div>
  );
};

export default TeacherPortal;