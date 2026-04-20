import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";

jest.mock("../../services/api/api", () => ({
  __esModule: true,
  default: {
    courses: {
      getAllCourses: jest.fn(),
    },
    teachers: {
      listQuizzes: jest.fn(),
      createQuiz: jest.fn(),
      updateQuiz: jest.fn(),
      getCourseRoster: jest.fn(),
      getQuizResults: jest.fn(),
    },
    ai: {
      generateQuiz: jest.fn(),
      rewriteQuestion: jest.fn(),
    },
  },
}));

jest.mock("../../hooks/useRealtimeRefresh", () => ({
  __esModule: true,
  default: jest.fn(),
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

import TeacherQuiz from "../../components/Dashboard/pages/TeacherQuiz.jsx";
import api from "../../services/api/api";

const futureDueDate = new Date(Date.now() + 86400000).toISOString();

function renderTeacherQuiz({ quizzes = [] } = {}) {
  api.courses.getAllCourses.mockResolvedValue({
    courses: [{ _id: "course-1", title: "Physics" }],
  });
  api.teachers.listQuizzes.mockResolvedValue({ data: quizzes });
  api.teachers.getCourseRoster.mockResolvedValue({
    students: [],
    classrooms: [],
    course: { classroomId: "" },
  });
  api.teachers.createQuiz.mockResolvedValue({
    data: { _id: "quiz-created" },
  });
  api.teachers.updateQuiz.mockResolvedValue({
    data: { _id: "quiz-updated" },
  });

  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <TeacherQuiz />
    </MemoryRouter>,
  );
}

async function waitForInitialLoad() {
  await waitFor(() => expect(api.courses.getAllCourses).toHaveBeenCalled());
  await waitFor(() =>
    expect(api.teachers.getCourseRoster).toHaveBeenCalledWith("course-1"),
  );
}

function fillCreateForm(container) {
  const detailsCard = screen
    .getByRole("heading", { name: /details & assign/i })
    .closest(".dash-card");
  const textInputs = detailsCard.querySelectorAll(
    'input.form-control:not([type]), input.form-control[type="text"]',
  );
  fireEvent.change(textInputs[0], { target: { value: "Energy Quiz" } });
  fireEvent.change(textInputs[1], { target: { value: "Science" } });
  fireEvent.change(within(detailsCard).getByPlaceholderText("Question text"), {
    target: { value: "What is energy?" },
  });
}

describe("TeacherQuiz publish actions", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("publish saves published status instead of falling back to draft on create", async () => {
    const { container } = renderTeacherQuiz();
    await waitForInitialLoad();

    fillCreateForm(container);
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() =>
      expect(api.teachers.createQuiz).toHaveBeenCalledWith(
        expect.objectContaining({ status: "published" }),
      ),
    );
  });

  test("save draft keeps draft status on create", async () => {
    const { container } = renderTeacherQuiz();
    await waitForInitialLoad();

    fillCreateForm(container);
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() =>
      expect(api.teachers.createQuiz).toHaveBeenCalledWith(
        expect.objectContaining({ status: "draft" }),
      ),
    );
  });

  test("publish forces published status when editing an existing draft quiz", async () => {
    renderTeacherQuiz({
      quizzes: [
        {
          _id: "quiz-1",
          title: "Existing Draft Quiz",
          description: "Pending publication",
          subject: "Science",
          curriculum: "General",
          gradeLevel: "All",
          dueDate: futureDueDate,
          timeLimit: 30,
          maxAttempts: 1,
          passingScore: 60,
          status: "draft",
          classroomId: "",
          selectedStudentIds: [],
          questions: [
            {
              questionText: "Explain energy.",
              questionType: "essay",
              correctAnswer: "",
              points: 10,
              explanation: "",
            },
          ],
        },
      ],
    });
    await waitForInitialLoad();

    const [editButton] = await screen.findAllByRole("button", {
      name: /^edit$/i,
    });
    fireEvent.click(editButton);
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() =>
      expect(api.teachers.updateQuiz).toHaveBeenCalledWith(
        "quiz-1",
        expect.objectContaining({ status: "published" }),
      ),
    );
  });
});
