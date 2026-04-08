// frontend/src/__tests__/api/api.test.js
// Unit tests for the frontend API client (api.js) — structure, shape, error handling
import axios from "axios";

// Mock axios
jest.mock("axios", () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { baseURL: "" },
  };
  return {
    create: jest.fn(() => mockAxiosInstance),
    __esModule: true,
    default: { create: jest.fn(() => mockAxiosInstance) },
  };
});

describe("API Client — Module Shape", () => {
  let api;

  beforeAll(() => {
    // Dynamic require after mocking
    api = require("../../services/api/api.js").api;
  });

  test("api is defined", () => {
    expect(api).toBeDefined();
  });

  test("api.users namespace exists", () => {
    expect(api.users).toBeDefined();
  });

  test("api.courses namespace exists", () => {
    expect(api.courses).toBeDefined();
  });

  test("api.teachers namespace exists", () => {
    expect(api.teachers).toBeDefined();
  });

  test("api.students namespace exists", () => {
    expect(api.students).toBeDefined();
  });

  test("api.quizzes namespace exists", () => {
    expect(api.quizzes).toBeDefined();
  });

  test("api.admin namespace exists", () => {
    expect(api.admin).toBeDefined();
  });

  test("api.ai namespace exists", () => {
    expect(api.ai).toBeDefined();
  });

  test("api.documents namespace exists", () => {
    expect(api.documents).toBeDefined();
  });

  test("api.gradebook namespace exists or api.grades exists", () => {
    const hasGradebook = !!(api.gradebook || api.grades);
    expect(hasGradebook).toBe(true);
  });

  test("api.announcements namespace exists", () => {
    expect(api.announcements).toBeDefined();
  });
});

describe("API Client — User Methods", () => {
  let api;

  beforeAll(() => {
    api = require("../../services/api/api.js").api;
  });

  const expectedUserMethods = ["login", "logout", "checkAuth"];

  for (const method of expectedUserMethods) {
    test(`api.users.${method} is a function`, () => {
      expect(typeof api.users[method]).toBe("function");
    });
  }
});

describe("API Client — Course Methods", () => {
  let api;

  beforeAll(() => {
    api = require("../../services/api/api.js").api;
  });

  const expectedCourseMethods = ["getAllCourses", "getCourseById", "createCourse"];

  for (const method of expectedCourseMethods) {
    test(`api.courses.${method} is a function`, () => {
      expect(typeof api.courses[method]).toBe("function");
    });
  }
});

describe("API Client — Teacher Methods", () => {
  let api;

  beforeAll(() => {
    api = require("../../services/api/api.js").api;
  });

  const expectedMethods = [
    "listAssignments",
    "createAssignment",
    "updateAssignment",
    "listQuizzes",
    "createQuiz",
  ];

  for (const method of expectedMethods) {
    test(`api.teachers.${method} is a function`, () => {
      expect(typeof api.teachers[method]).toBe("function");
    });
  }
});

describe("API Client — Admin Methods", () => {
  let api;

  beforeAll(() => {
    api = require("../../services/api/api.js").api;
  });

  const expectedMethods = ["listUsers", "createClass", "getBranding", "getAiSettings"];

  for (const method of expectedMethods) {
    test(`api.admin.${method} is a function`, () => {
      expect(typeof api.admin[method]).toBe("function");
    });
  }
});
