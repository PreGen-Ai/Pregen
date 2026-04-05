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
- CORS allowlisting accepts `CLIENT_URL` plus optional `CORS_ORIGIN` / `CORS_ALLOWED_ORIGINS` values. These can be comma-separated, and trailing slashes are normalized automatically.
- For local-only backend verification, set `MONGO_USE_LOCAL_FALLBACK=true` and provide `MONGO_LOCAL_URL` with a running local Mongo instance.
- If you are using MongoDB Atlas, the current machine must be allowed to reach the cluster hosts on port `27017`; DNS resolution alone is not enough.
- If Atlas SRV lookup fails in Node on your machine but the resolved Atlas shard hosts are reachable, you can temporarily use a direct-host replica-set URI in `MONGO_URL` for local verification. Keep this as a local-only override and do not commit real credentials.
- Copy `backend/.env.example` when setting up a fresh local environment.
