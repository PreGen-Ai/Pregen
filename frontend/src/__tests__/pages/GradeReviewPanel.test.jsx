import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import GradeReviewPanel from "../../components/Dashboard/pages/GradeReviewPanel.jsx";

jest.mock("../../services/api/api", () => ({
  __esModule: true,
  default: {
    gradebook: {
      getSubmission: jest.fn(),
      getQuizAttempt: jest.fn(),
      updateSubmission: jest.fn(),
      updateQuizAttempt: jest.fn(),
    },
    ai: {
      generateExplanation: jest.fn(),
    },
  },
}));

jest.mock("../../utils/requestId", () => ({
  withRequestId: jest.fn(() => ({ config: {} })),
}));

jest.mock("react-toastify", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const api = require("../../services/api/api").default;
const { toast } = require("react-toastify");
const { withRequestId } = require("../../utils/requestId");

describe("GradeReviewPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withRequestId.mockReturnValue({ config: {} });
  });

  test("loads question detail and saves teacher review payload", async () => {
    api.gradebook.getQuizAttempt.mockResolvedValue({
      attempt: {
        _id: "attempt-1",
        title: "Photosynthesis review",
        courseTitle: "Biology",
        student: {
          firstName: "Sara",
          lastName: "Student",
          email: "sara@example.com",
        },
        reviewStatus: "pending_review",
        gradingStatus: "pending_teacher_review",
        score: 70,
        questions: [
          {
            questionId: "q-1",
            questionText: "Which pigment captures light energy?",
            questionType: "multiple_choice",
            options: ["Water", "Chlorophyll", "Glucose", "Oxygen"],
            correctAnswer: "B",
            studentAnswer: "B",
            maxScore: 1,
            aiScore: 1,
            aiFeedback: "Correct objective answer.",
          },
        ],
      },
    });
    api.gradebook.updateQuizAttempt.mockResolvedValue({
      item: {
        _id: "attempt-1",
        reviewStatus: "reviewed",
      },
    });

    const onClose = jest.fn();
    const onSaved = jest.fn();

    render(
      <GradeReviewPanel
        item={{
          _id: "attempt-1",
          kind: "quiz",
          sourceId: "attempt-1",
          title: "Photosynthesis review",
          courseTitle: "Biology",
          student: {
            firstName: "Sara",
            lastName: "Student",
          },
        }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    expect(
      await screen.findByText(/Which pigment captures light energy\?/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Correct answer:/i)).toBeInTheDocument();
    expect(screen.getByText(/Student answer/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Teacher score"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Final feedback"), {
      target: { value: "Reviewed by teacher." },
    });
    fireEvent.change(screen.getByLabelText("Review status"), {
      target: { value: "reviewed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));

    await waitFor(() => {
      expect(api.gradebook.updateQuizAttempt).toHaveBeenCalledWith(
        "attempt-1",
        expect.objectContaining({
          reviewStatus: "reviewed",
          score: 100,
          feedback: "Reviewed by teacher.",
          questions: [
            expect.objectContaining({
              questionId: "q-1",
              teacherScore: 1,
            }),
          ],
        }),
        {},
      );
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });
});
