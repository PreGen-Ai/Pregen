# services/gemini/prompts.py

class Prompts:
    """
    Centralized prompt templates for tutor interaction, quiz generation, grading, and explanation.
    Optimized for LOWER I/O tokens (lean wording, no long examples, minimal repetition).
    """
    @staticmethod
    def build_tutor_prompt(
        *,
        language: str,
        tone: str,
        curriculum: str,
        subject: str,
        message: str,
        max_words: int,
        curriculum_guidelines: str = "",
        context: str = "",
        material: str = "",
    ) -> str:
        parts = []
        parts.append(
            f"You are an AI tutor. Reply in {language}. "
            f"Tone: {tone}. Level/Curriculum: {curriculum}. Subject: {subject}."
        )

        if curriculum_guidelines:
            parts += ["", "Guidelines (follow only if relevant):", curriculum_guidelines]

        if context:
            parts += ["", "Recent context:", context]

        if material:
            parts += ["", "Study material key points:", material]

        parts += [
            "",
            "Student:",
            message,
            "",
            "Formatting rules:",
            "1. Use clean Markdown.",
            "2. Prefer numbered lists (1., 2., 3.) instead of bullets.",
            "3. Avoid bold/italics unless needed.",
            "4. Put formulas on their own lines using LaTeX blocks:",
            "$$",
            "formula here",
            "$$",
            "5. Keep spacing between sections.",
            "",
            "Rules:",
            f"1. Explain clearly for this level (steps when helpful).",
            f"2. If missing critical info, ask only 1–2 short questions.",
            f"3. If SAT/IGCSE is clearly relevant, add 1 short exam tip; otherwise skip.",
            f"4. Keep it concise: <= {max_words} words.",
        ]

        return "\n".join(parts).strip()

    # ============================================================
    # TUTOR CHAT PROMPT (LEAN)
    # Placeholders used by ChatService:
    # tone, language, curriculum, subject, curriculum_guidelines, context, material, message
    # ============================================================
    TUTOR_PROMPT = """
You are an expert AI tutor.

Language: {language}
Tone: {tone}
Level/Curriculum: {curriculum}
Subject: {subject}

Guidelines (use only if clearly relevant):
{curriculum_guidelines}

Recent Context:
{context}

Study Material (if relevant, otherwise ignore):
{material}

Student Question:
{message}

-----------------------------
FORMAT REQUIREMENTS (STRICT)
-----------------------------

1) Use clean Markdown only.
2) Use numbered lists (1., 2., 3.) — NEVER use asterisks (*).
3) Do NOT use backticks or inline code formatting.
4) For math expressions:
   - Use LaTeX only.
   - Inline math: \\( ... \\)
   - Block math: $$ ... $$
   - NEVER use Unicode math symbols like ∫ 𝑢 𝑑𝑣 outside LaTeX.
5) Add clear spacing between sections.
6) Avoid emojis or decorative symbols.
7) Keep structure visually clean and professional.

-----------------------------
CONTENT RULES
-----------------------------

- Explain clearly for this level.
- If the student says "step by step", "derive", or "show", provide structured step-by-step reasoning.
- If critical information is missing, ask ONLY 1–2 short clarification questions.
- If SAT/IGCSE is clearly relevant, add ONE short exam tip at the end.
- Keep the response concise (maximum {max_words} words).
- Do not repeat the question.
- Do not add filler sentences.

Now produce the final answer.
""".strip()

    # ============================================================
    # ASSIGNMENT PROMPT (LEAN JSON)
    # Placeholders: topic, grade_level, subject, num_questions
    # ============================================================
    ASSIGNMENT_PROMPT = """
Return ONLY JSON between markers. No markdown/text outside.

---BEGIN ASSIGNMENT JSON---
{{
  "assignment": {{
    "title": "Assignment: {topic}",
    "topic": "{topic}",
    "grade_level": "{grade_level}",
    "subject": "{subject}",
    "questions": [
      {{
        "id": 1,
        "type": "multiple_choice|short_answer|problem_solving|true_false|essay",
        "question": "string",

        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correct_answer": "A|B|C|D|True|False",

        "expected_answer": "string",
        "scoring_criteria": "string",
        "solution_steps": ["..."],
        "rubric": "string",

        "explanation": "string"
      }}
    ]
  }}
}}
---END ASSIGNMENT JSON---

Task:
Create exactly {num_questions} questions on "{topic}" for {grade_level} in {subject}.
Rules:
- MCQ: 4 labeled options; correct_answer = A/B/C/D; explanation <= 20 words.
- True/False: correct_answer = True/False; explanation <= 20 words.
- short_answer: include expected_answer + scoring_criteria (short).
- problem_solving: include solution_steps (3–6) + explanation (<= 25 words).
- essay: rare; include expected_answer + rubric (10 pts) + solution_steps (5–7).
Output compact JSON (no extra whitespace if possible).
""".strip()

    # ============================================================
    # QUIZ PROMPT (LEAN JSON)
    # Placeholders used by QuizService:
    # subject, num_questions, topic, grade_level, curriculum, language, difficulty,
    # question_type, subject_directive, curriculum_guidelines
    # ============================================================
    QUIZ_PROMPT = """
You are an expert {subject} exam designer.

Make a {num_questions}-question quiz on "{topic}" for {grade_level}, curriculum={curriculum}, language={language}.
difficulty={difficulty}; requested_type={question_type}.
{subject_directive}

Return ONLY JSON between markers. No markdown/text outside.

---BEGIN QUIZ JSON---
{{
  "quiz": [
    {{
      "id": 1,
      "type": "multiple_choice|true_false|essay",
      "question": "string",
      "max_score": 1,

      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A|B|C|D|True|False",

      "expected_answer": "string",
      "rubric": "string",
      "solution_steps": ["..."],

      "explanation": "string"
    }}
  ]
}}
---END QUIZ JSON---

Rules (short):
- MCQ: 4 labeled options; answer is ONLY A/B/C/D; max_score=1; explanation <= 20 words.
- True/False: answer True/False; max_score=1; explanation <= 20 words.
- Essay: max_score=10; include expected_answer + rubric + solution_steps(5–7); explanation <= 25 words.
- Make distractors plausible; avoid trivial fillers.
- Output compact JSON (no extra whitespace if possible).

Curriculum notes (brief; apply if relevant):
{curriculum_guidelines}
""".strip()

    # ============================================================
    # QUIZ VERIFY PROMPT (LEAN)
    # Placeholder: quiz_json
    # ============================================================
    QUIZ_VERIFY_PROMPT = """
Validate the quiz JSON strictly and return ONLY JSON:

{{
  "is_valid": true/false,
  "issues": ["..."],
  "fix_instructions": ["..."]
}}

Checks:
- Top object has "quiz" list.
- Each item has id,type,question,max_score.
- MCQ: options[4] labeled A–D; answer A/B/C/D.
- TF: answer True/False.
- Essay: expected_answer + rubric + solution_steps(list).
- One correct answer; no ambiguity.

Quiz JSON:
{quiz_json}
""".strip()

    # ============================================================
    # EXPLANATION PROMPT (ALREADY SHORT; make even tighter)
    # Placeholders: topic, grade_level, language, style, previous_knowledge
    # ============================================================
    EXPLANATION_PROMPT = """
Explain "{topic}" for {grade_level} in {language} ({style}). Prior knowledge: {previous_knowledge}.
Output <= 350 characters. No headings. Include: definition + key idea + tiny example + why it matters. End with 2–4 motivating words.
Output ONLY the explanation text.
""".strip()

    # ============================================================
    # ESSAY GRADING PROMPT (LEAN JSON)
    # Placeholders: subject, grade_level, question_text, expected_answer, rubric, solution_steps, student_answer
    # ============================================================
    ESSAY_GRADING_PROMPT = """
Grade the essay using the rubric. Return ONLY JSON between markers.

---BEGIN ESSAY GRADE---
{{
  "is_correct": true/false,
  "score": 0,
  "max_score": 10,
  "rubric_breakdown": [
    {{"criterion":"...", "awarded":0, "max":0, "evidence":"..."}}
  ],
  "mistakes": ["..."],
  "feedback": "2–3 sentences."
}}
---END ESSAY GRADE---

Subject={subject}; Grade={grade_level}
Q: {question_text}
Expected: {expected_answer}
Rubric: {rubric}
Steps: {solution_steps}
Student: {student_answer}

Rules:
- score is INTEGER 0–10; breakdown sums to score.
- Only award points with explicit evidence.
- Be strict; keep feedback concise.
""".strip()

    # ============================================================
    # ESSAY GRADE JUDGE PROMPT (LEAN)
    # Placeholders: question_text, expected_answer, rubric, student_answer, grade_a, grade_b
    # ============================================================
    ESSAY_GRADE_JUDGE_PROMPT = """
Choose the better grade (A or B) or merge into one corrected grade.
Return ONLY JSON between markers with the SAME schema as ESSAY_GRADING_PROMPT.

---BEGIN ESSAY GRADE---
{{
  "is_correct": true/false,
  "score": 0,
  "max_score": 10,
  "rubric_breakdown": [],
  "mistakes": [],
  "feedback": ""
}}
---END ESSAY GRADE---

Q: {question_text}
Expected: {expected_answer}
Rubric: {rubric}
Student: {student_answer}

A: {grade_a}
B: {grade_b}

Rules:
- score INTEGER 0–10; breakdown sums to score and respects max.
- evidence must match student text.
""".strip()

    # ============================================================
    # MCQ GRADING PROMPT (LEAN)
    # Placeholders: subject, question_text, options, correct_answer, student_answer, explanation
    # ============================================================
    MCQ_GRADING_PROMPT = """
Return ONLY JSON between markers.

---BEGIN MCQ GRADE---
{{
  "is_correct": true/false,
  "score": 0,
  "max_score": 1,
  "feedback": "1 short sentence.",
  "correct_letter": "{correct_answer}"
}}
---END MCQ GRADE---

Subject: {subject}
Q: {question_text}
Options: {options}
Correct: {correct_answer}
Student: {student_answer}
Notes: {explanation}

Rule: correctness = student letter matches correct letter (map full option text to letter if needed).
""".strip()

    # ============================================================
    # GRADING PROMPT (LEAN)
    # Placeholders: curriculum, assignment_data, student_answers
    # ============================================================
    GRADING_PROMPT = """
You are an examiner for {curriculum}. Grade the submission and return ONLY JSON between markers.

---BEGIN GRADING JSON---
{{
  "overall_score": 0.0,
  "feedback": "1–2 sentences.",
  "concept_analytics": [],
  "question_analysis": [],
  "study_plan": []
}}
---END GRADING JSON---

Assignment: {assignment_data}
Answers: {student_answers}
""".strip()

    # ============================================================
    # COMPLETE GRADING PROMPT (LEAN)
    # Placeholders: subject, curriculum, assignment_name, student_id, assignment_data, student_answers
    # ============================================================
    COMPLETE_GRADING_PROMPT = """
Return ONLY JSON between markers. No extra text.

---BEGIN COMPLETE GRADE---
{{
  "overall_score": 0,
  "summary_feedback": "",
  "per_question_breakdown": [],
  "recommended_next_topics": []
}}
---END COMPLETE GRADE---

Subject={subject}; Curriculum={curriculum}
Assignment={assignment_name}; Student={student_id}

Data: {assignment_data}
Answers: {student_answers}

Rules:
- overall_score 0–100 (number).
- summary_feedback concise.
- per_question_breakdown includes question_id, score, max_score, feedback.
""".strip()
