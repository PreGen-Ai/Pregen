import {
  extractCourseItems,
  extractGeneratedQuestions,
} from "../../components/Dashboard/pages/teacherQuiz.helpers";

describe("TeacherQuiz helpers", () => {
  test("accepts teacher course responses shaped as { courses: [...] }", () => {
    const courses = extractCourseItems({
      courses: [{ _id: "course_1", title: "Physics" }],
    });

    expect(courses).toEqual([{ _id: "course_1", title: "Physics" }]);
  });

  test("extracts quiz questions from a direct { quiz: [...] } payload", () => {
    const questions = extractGeneratedQuestions({
      quiz: [
        {
          question: "What is force?",
          type: "multiple_choice",
          options: ["Push", "Pull", "Both", "Neither"],
          answer: "C",
        },
      ],
    });

    expect(questions).toHaveLength(1);
    expect(questions[0].questionText).toBe("What is force?");
    expect(questions[0].correctAnswer).toBe("C");
  });

  test("extracts quiz questions from direct list payloads", () => {
    const questions = extractGeneratedQuestions([
      {
        question: "State Newton's first law.",
        type: "essay",
        expected_answer: "Objects stay at rest or in motion unless acted on by a net force.",
      },
    ]);

    expect(questions).toHaveLength(1);
    expect(questions[0].questionText).toBe("State Newton's first law.");
    expect(questions[0].questionType).toBe("essay");
  });

  test("extracts quiz questions from wrapped JSON-mode payloads", () => {
    const questions = extractGeneratedQuestions({
      data: {
        content: {
          quiz: [
            {
              prompt: "Which planet is known as the red planet?",
              type: "multiple_choice",
              choices: ["Earth", "Mars", "Venus", "Jupiter"],
              answer: "Mars",
            },
          ],
        },
      },
    });

    expect(questions).toHaveLength(1);
    expect(questions[0].questionText).toBe(
      "Which planet is known as the red planet?",
    );
    expect(questions[0].options).toEqual([
      "Earth",
      "Mars",
      "Venus",
      "Jupiter",
    ]);
    expect(questions[0].correctAnswer).toBe("B");
  });
});
