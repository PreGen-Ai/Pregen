# PreGen

## Overview

PreGen is an AI-powered educational platform designed to automate and enhance the creation of learning materials. It enables educators, institutions, and content creators to generate quizzes, assignments, and study content automatically from raw inputs such as topics, documents, or learning objectives.

The core goal of PreGen is to reduce manual effort in educational content creation while improving consistency, coverage, and personalization using artificial intelligence.

---

## Problem Statement

Traditional educational content creation is:

- Time-consuming and repetitive  
- Difficult to scale across subjects and levels  
- Prone to inconsistency in quality and difficulty  
- Hard to personalize for different learners  

PreGen addresses these challenges by using AI to generate structured, high-quality educational materials on demand.

---

## Solution

PreGen provides an end-to-end AI-assisted workflow that:

- Accepts topics, syllabi, or source material as input  
- Generates quizzes, questions, and assignments automatically  
- Supports multiple difficulty levels and formats  
- Enables rapid iteration and customization  

This allows educators to focus on teaching strategy and learner outcomes rather than manual content preparation.

---

## Key Features

- AI-generated quizzes and assessments  
- Support for multiple question types (MCQs, short answer, conceptual questions)  
- Difficulty-level control (easy, medium, hard)  
- Fast content generation from minimal input  
- Scalable architecture suitable for schools, platforms, and individuals  
- Designed for extensibility with future AI and analytics modules  

---

## Target Users

- Educators and instructors  
- Online learning platforms  
- Training and certification providers  
- Students creating self-study material  
- EdTech startups and institutions  

---

## High-Level Architecture

- **Frontend**: User interface for input, preview, and export of generated content  
- **Backend**: API layer handling requests and orchestration  
- **AI Layer**: Language models responsible for content generation and refinement  
- **Data Layer**: Storage for generated content, templates, and metadata  

The system is designed to be modular, allowing independent scaling and future feature expansion.

---

## Use Cases

- Generate quizzes for lectures or courses  
- Create practice questions from a syllabus or topic list  
- Rapidly prototype educational material for new courses  
- Assist students in self-testing and revision  
- Support large-scale content generation for EdTech platforms  

---

## Future Enhancements

- Learning analytics and performance tracking  
- Adaptive difficulty based on learner behavior  
- Multi-language support  
- Export formats (PDF, LMS integrations)  
- Teacher feedback loop to improve AI output quality  
- Collaborative content editing  

---

## Project Status

PreGen is an actively developed project focused on building a reliable AI-driven foundation for educational content generation. The architecture and workflows are designed to support production-grade deployment and future scaling.

---

## License

This project is proprietary. All rights reserved.  
Unauthorized copying, modification, or distribution is not permitted without explicit permission.

---

## Backend Startup Notes

- The backend loads environment variables from `backend/.env` by default, even if the server is started from a different working directory.
- Mongo configuration accepts `MONGO_URL`, `MONGO_URI`, or `MONGODB_URI`.
- Express sessions should use a dedicated `SESSION_SECRET`. If it is missing, the backend falls back to `JWT_SECRET` and logs a startup warning.
- CORS allowlisting accepts `CLIENT_URL` plus optional `CORS_ORIGIN` / `CORS_ALLOWED_ORIGINS` values. These can be comma-separated, and trailing slashes are normalized automatically.
- Run `npm run doctor` inside `backend/` before deploying or troubleshooting startup issues. It prints a sanitized summary of the selected env file, Mongo mode, CORS origins, session-secret source, AI service URL, and runtime warnings.
- For local-only backend verification, set `MONGO_USE_LOCAL_FALLBACK=true` and provide `MONGO_LOCAL_URL` with a running local Mongo instance.
- If you are using MongoDB Atlas, the current machine must be allowed to reach the cluster hosts on port `27017`; DNS resolution alone is not enough.
- If Atlas SRV lookup fails in Node on your machine but the resolved Atlas shard hosts are reachable, you can temporarily use a direct-host replica-set URI in `MONGO_URL` for local verification. Keep this as a local-only override and do not commit real credentials.
- Copy `backend/.env.example` when setting up a fresh local environment.

## Local Run Order

1. Start the backend from `backend/` with `npm install` and `npm run doctor`.
2. Start the AI service from `services/` once its env is configured.
3. Start the frontend from `frontend/` after setting the backend base URL.
4. Confirm `GET /api/health` on the backend before using the UI.

## Deployment Environment Checklist

### Backend

- Required:
  - `NODE_ENV`
  - `PORT`
  - `CLIENT_URL`
  - `JWT_SECRET`
  - `SESSION_SECRET`
  - `MONGO_URL`
  - `GEMINI_API_KEY`
- Usually required in deployment:
  - `MONGO_DB_NAME`
  - `CORS_ORIGIN` or `CORS_ALLOWED_ORIGINS`
  - `AI_SERVICE_URL`
- Optional:
  - `REDIS_URL`
  - `MONGO_CONNECT_TIMEOUT_MS`
  - `MONGO_SERVER_SELECTION_TIMEOUT_MS`
  - `MONGO_SOCKET_TIMEOUT_MS`
  - `MONGO_RETRY_ATTEMPTS`
  - `MONGO_RETRY_DELAY_MS`

### Frontend

- `REACT_APP_API_BASE_URL`
- `REACT_APP_AI_BASE_URL`

Both frontend vars should point to the deployed backend because the browser should talk to Node only.

### Services

- Configure the AI service with its model/provider secrets and any Mongo envs it needs.
- Point backend `AI_SERVICE_URL` at the deployed service URL.

## Atlas Guidance

- Prefer the SRV Atlas URI in normal deployment.
- If local Node SRV resolution fails but Atlas shard hosts are reachable, use a direct-host replica-set URI locally as a temporary verification override only.
- `npm run doctor` and backend startup logs will show the selected Mongo mode, scheme, targets, retry settings, and env source without printing credentials.

## Bootstrap Order

1. Start the backend and confirm `/api/health`.
2. Start the AI service if you need bridged AI flows.
3. Start the frontend and confirm login reaches the backend.
4. Seed the first `SUPERADMIN` if the database is empty.
   - There is no public self-signup for superadmin creation.
   - Create the first superadmin directly in MongoDB using a hashed password, then log in through the normal auth path.
5. Create the first tenant from the superadmin tenant management flow.
6. Create the first tenant admin from the canonical superadmin admin-creation flow.
7. Log in as the tenant admin and create the first teachers, students, classes, and subjects.

## Smoke-Test Checklist

### Super Admin

- Log in successfully.
- Create a tenant.
- Update the tenant.
- Create a tenant admin.
- Open AI cost / AI usage pages.

### Tenant Admin

- Create a teacher with email and password.
- Create a student with email and password.
- Create a class.
- Enroll and unenroll a student.
- Create or update a subject.
- Open AI controls and branding pages.

### Teacher

- Create an assignment and a quiz.
- Create a lesson module and at least one lesson content item.
- Publish an announcement.
- Review submissions and quiz attempts.
- Update scores and feedback through the gradebook.

### Student

- Log in and view enrolled materials.
- View announcements.
- Submit an assignment.
- Start and submit a quiz.
- Open the practice lab and confirm it uses the backend AI bridge.
- View grades and feedback.
