// src/components/Dashboard/quiz/utils/api/quizApi.js

import api from "./apiConfig";
import { handleApiError, ApiError } from "../errorHandler";
import reportsApi from "./reportsApi"; // ✅ Use correct reports API (Model-A)

/*───────────────────────────────────────────────────────────
 📘 QUIZ GENERATION + FAIR-SCORING GRADING (MODEL-A ALIGNED)
───────────────────────────────────────────────────────────*/
export const quizApi = {
  /**
   * ------------------------------------------------------
   * 🧠 Generate Quiz — FULLY MODEL-A SAFE
   * ------------------------------------------------------
   */
  generateQuiz: async (params) => {
    try {
      const response = await api.post("/api/quiz/generate", params);
      const data = response.data;

      let rawQuestions = null;
      let meta = {};

      if (Array.isArray(data?.quiz)) rawQuestions = data.quiz;
      else if (Array.isArray(data?.questions)) rawQuestions = data.questions;
      else if (Array.isArray(data)) rawQuestions = data;
      else
        throw new ApiError(
          "Invalid quiz format: backend did not return array",
          "INVALID_QUIZ_FORMAT"
        );

      const questions = formatQuiz(rawQuestions, params.question_type);

      return {
        questions,
        topic: data.topic || params.topic,
        subject: data.subject || "General",
        difficulty: data.difficulty || params.difficulty,
        grade_level: data.grade_level || params.grade_level,
        curriculum: data.curriculum || params.curriculum,
        source: "ai-generator",
        raw: data,
      };
    } catch (error) {
      throw handleApiError(error, "generating quiz");
    }
  },

  /**
   * ------------------------------------------------------
   * 🟦 Grade Full Quiz — MODEL-A Compatible
   * POST /api/grade-quiz
   * ------------------------------------------------------
   */
  gradeQuiz: async (payload) => {
    try {
      const assignment_questions =
        payload.assignment_data?.questions || payload.quiz_questions || [];

      if (!Array.isArray(assignment_questions))
        throw new ApiError("assignment_data.questions must be an array");

      const body = {
        student_id: payload.student_id,
        assignment_name: payload.assignment_name || "AI-Generated Quiz",
        subject: payload.subject || "General",
        curriculum: payload.curriculum || "IGCSE",
        language: payload.language || "English",

        assignment_data: {
          questions: assignment_questions,
          metadata: {
            topic: payload.topic,
            total_questions: assignment_questions.length,
            time_spent: payload.time_spent || 0,
          },
        },

        student_answers: payload.student_answers,
      };

      const res = await api.post("/api/grade-quiz", body);

      return {
        ok: res.data?.ok ?? true,
        reportId: res.data?.report_id || null,
        gradedResult: res.data,
      };
    } catch (error) {
      throw handleApiError(error, "grading quiz");
    }
  },

  /**
   * ------------------------------------------------------
   * 🟩 Grade Single Question (Model-A aligned)
   * ------------------------------------------------------
   */
  gradeSingleQuestion: async ({
    student_id,
    subject,
    curriculum,
    assignment_name = "Single Question",
    question_data,
    student_answer,
  }) => {
    try {
      const res = await api.post("/api/grade-question", {
        student_id,
        subject,
        curriculum,
        assignment_name,
        question_data,
        student_answer,
      });

      return {
        ok: res.data?.ok ?? true,
        reportId: res.data?.report_id || null,
        gradedResult: res.data,
      };
    } catch (error) {
      throw handleApiError(error, "grading single question");
    }
  },

  /**
   * ------------------------------------------------------
   * 🌡 Health Check
   * ------------------------------------------------------
   */
  checkHealth: async () => {
    try {
      const res = await api.get("/api/grade/health");
      return res.data;
    } catch (error) {
      throw handleApiError(error, "checking grading health");
    }
  },
};

/*───────────────────────────────────────────────────────────
 🧩 QUIZ FORMATTER (SAFE & MODEL-A COMPATIBLE)
───────────────────────────────────────────────────────────*/
const formatQuiz = (generatedQuiz, questionType) => {
  if (!Array.isArray(generatedQuiz)) return [];

  return generatedQuiz.map((q, i) => {
    const type = (q.type || questionType || "multiple_choice")
      .toLowerCase()
      .replace(" ", "_");

    const base = {
      id: String(q.id || q.question_id || i + 1),
      question: q.question || q.text || `Question ${i + 1}`,
      explanation: q.explanation || "",
      type,
      difficulty: q.difficulty || "medium",
      category: q.category || q.topic || "General",
      max_score: q.max_score || (type === "essay" ? 10 : 1),
      userAnswer: null,
    };

    if (type === "essay") {
      return {
        ...base,
        correctAnswer: q.expected_answer || "",
        rubric_points: q.rubric_points || [
          "Content",
          "Clarity",
          "Structure",
          "Depth",
        ],
      };
    }

    if (type === "true_false") {
      return {
        ...base,
        options: ["True", "False"],
        correctAnswer: q.answer || "True",
      };
    }

    return {
      ...base,
      options: q.options || ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: q.answer || "A",
    };
  });
};

export default quizApi;
