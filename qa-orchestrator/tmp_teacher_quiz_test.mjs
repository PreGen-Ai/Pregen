import { chromium } from "playwright";

const FRONTEND = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:4000";

async function login(email, password) {
  const response = await fetch(`${API}/api/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: response.status, data: await response.json() };
}

const auth = await login(
  "qa.teacher.live.20260419@pregen.test",
  "Teacher@1234!",
);
if (auth.status !== 200 || !auth.data?.token) {
  console.log(JSON.stringify({ loginStatus: auth.status, body: auth.data }));
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript((payload) => {
  localStorage.setItem("token", payload.token);
  localStorage.setItem(
    "user",
    JSON.stringify({ user: payload.user, token: payload.token }),
  );
}, { token: auth.data.token, user: auth.data.user });

const page = await context.newPage();
await page.goto(`${FRONTEND}/dashboard/teacher/quizzes`, {
  waitUntil: "networkidle",
  timeout: 120000,
});

const topicInput = page.locator('input[placeholder*="Newton"]').first();
const subjectSelect = page
  .locator('div.col-6:has(label:has-text("Subject")) select')
  .first();
const curriculumSelect = page
  .locator('div.col-6:has(label:has-text("Exam / Curriculum")) select')
  .first();
const questionTypeSelect = page
  .locator('div.col-6:has(label:has-text("Question type")) select')
  .first();
const difficultySelect = page
  .locator('div.col-6:has(label:has-text("Difficulty")) select')
  .first();
const countInput = page
  .locator('div.col-4:has(label:has-text("# Questions")) input')
  .first();
const gradeInput = page
  .locator('div.col-4:has(label:has-text("Grade")) input')
  .first();
const generateButton = page.getByRole("button", { name: /Generate with AI|Generating/i }).first();
const previewCard = page.locator('h4:has-text("questions ready")').first();

const attempts = [
  {
    topic: "Photosynthesis",
    subject: "Biology",
    curriculum: "IGCSE",
    questionType: "multiple_choice",
    difficulty: "medium",
    count: "5",
    grade: "10",
  },
  {
    topic: "Newton's Laws of Motion",
    subject: "Physics",
    curriculum: "IGCSE",
    questionType: "multiple_choice",
    difficulty: "medium",
    count: "5",
    grade: "10",
  },
  {
    topic: "Cell Division",
    subject: "Biology",
    curriculum: "IGCSE",
    questionType: "true_false",
    difficulty: "medium",
    count: "5",
    grade: "9",
  },
];

const results = [];

for (const attempt of attempts) {
  await topicInput.fill(attempt.topic);
  await subjectSelect.selectOption({ label: attempt.subject });
  await curriculumSelect.selectOption({ label: attempt.curriculum });
  await questionTypeSelect.selectOption(attempt.questionType);
  await difficultySelect.selectOption(attempt.difficulty);
  await countInput.fill(attempt.count);
  await gradeInput.fill(attempt.grade);

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/ai/quiz/generate") &&
      res.request().method() === "POST",
    { timeout: 180000 },
  );

  await generateButton.click();
  const response = await responsePromise;

  let responseJson = null;
  try {
    responseJson = await response.json();
  } catch {
    responseJson = null;
  }

  await previewCard.waitFor({ timeout: 180000 });
  const previewTitle = await previewCard.innerText();
  const previewItems = await page.locator("div.small.p-2.rounded").allInnerTexts();

  results.push({
    topic: attempt.topic,
    subject: attempt.subject,
    status: response.status(),
    previewTitle,
    previewSample: previewItems.slice(0, 2),
    responseKeys:
      responseJson && typeof responseJson === "object"
        ? Object.keys(responseJson).slice(0, 8)
        : [],
    questionCount: Array.isArray(responseJson?.quiz)
      ? responseJson.quiz.length
      : Array.isArray(responseJson?.data?.questions)
        ? responseJson.data.questions.length
        : null,
  });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
