# services/gemini/prompts.py
# Commit 20 — prompt hardening, course grounding, study modes, richer feedback

class Prompts:
    """
    Centralized prompt templates for tutor interaction, quiz generation, grading, and explanation.
    Commit 20 additions:
    - Course-material grounding in quiz/assignment/explanation prompts
    - Bloom taxonomy level support in quiz prompt
    - Study mode directives in tutor prompt
    - Explicit "not in materials" fallback in tutor prompt
    - Richer MCQ/essay feedback prompts
    - New prompts: QUESTION_REWRITE, DISTRACTOR_GEN, MISTAKE_EXPLANATION,
      DRAFT_FEEDBACK, ANNOUNCEMENT_DRAFT, LESSON_SUMMARY
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
        study_mode: str = "general",
    ) -> str:
        """Legacy builder — retained for compatibility. Now delegates to TUTOR_PROMPT format."""
        return Prompts.TUTOR_PROMPT.format(
            tone=tone,
            language=language,
            curriculum=curriculum or "Unknown",
            subject=subject,
            study_mode=study_mode or "general",
            curriculum_guidelines=curriculum_guidelines or "None",
            context=context or "No prior context",
            material=material or "No course material uploaded for this session.",
            message=message,
            max_words=max_words,
        )

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
Study Mode: {study_mode}

Guidelines (use only if clearly relevant):
{curriculum_guidelines}

Recent Context:
{context}

Course Material (sourced from uploaded course files — PREFER this over general knowledge):
{material}

Student Question:
{message}

-----------------------------
STUDY MODE INSTRUCTIONS
-----------------------------
Apply the study mode as follows:
- explain_simply: Use very simple language, short sentences, one concrete analogy. Avoid jargon.
- explain_deeply: Provide thorough explanation with underlying principles, derivations if relevant, and connections to related concepts.
- give_example: Lead with 1–2 concrete worked examples before explaining the concept.
- quiz_me: Do NOT answer the question directly. Instead, ask the student 1–2 guided questions to prompt them to reason toward the answer themselves.
- summarize: Give a compact revision-ready summary with key terms bolded, suitable for pre-exam review.
- general: Standard balanced explanation.

-----------------------------
GROUNDING RULES
-----------------------------
- If course material is provided above, base your answer on it and reference it naturally.
- If the question CANNOT be answered from the course material AND general subject knowledge is insufficient, say:
  "I couldn't find a direct answer in your course materials. Here is general knowledge on this topic:"
  Then provide a general answer clearly labeled as such.
- Do NOT fabricate course-specific facts, diagrams, page numbers, or examples not in the material.

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
difficulty={difficulty}; requested_type={question_type}; bloom_level={bloom_level}.
{subject_directive}

{course_context_block}

Return ONLY JSON between markers. No markdown/text outside.

---BEGIN QUIZ JSON---
{{
  "quiz": [
    {{
      "id": 1,
      "type": "multiple_choice|true_false|essay",
      "question": "string",
      "max_score": 1,
      "bloom_level": "{bloom_level}",

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

Rules:
- MCQ: 4 labeled options; answer is ONLY A/B/C/D; max_score=1; explanation <= 25 words.
  Distractors must be plausible and reflect common student misconceptions, not trivial fillers.
- True/False: answer True/False; max_score=1; explanation <= 25 words.
- Essay: max_score=10; include expected_answer + rubric + solution_steps(5–7); explanation <= 30 words.
- Bloom level guidance: remember=recall facts; understand=explain concepts; apply=use in new context;
  analyze=break down; evaluate=judge/argue; create=produce/design.
- If course material context is provided, ground questions directly in that content.
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
{course_context_block}
Write 2–4 sentences: definition, key idea, one concrete example, why it matters.
Keep it clear and at the right level. No headings. Output ONLY the explanation text.
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
  "mistakes": ["specific error 1", "specific error 2"],
  "misconceptions": ["misconception detected, if any"],
  "feedback": "2–3 sentences of pedagogically useful feedback: what was good, what was wrong, how to improve.",
  "suggestion": "One concrete action the student should take to improve (e.g., review section X, redo step Y)."
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
- Only award points with explicit evidence from student answer.
- Be strict but constructive. Feedback must be pedagogically useful, not just "incorrect."
- mistakes = list of specific errors (omissions, misconceptions, wrong steps).
- suggestion = one actionable next step for the student.
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

    # ============================================================
    # QUESTION REWRITE PROMPT (Commit 20)
    # Placeholders: action, subject, grade_level, language, question_text, options_block
    # action: easier | harder | more_conceptual | more_applied | arabic | english
    # ============================================================
    QUESTION_REWRITE_PROMPT = """
Rewrite the following quiz/assignment question according to the action below.
Return ONLY JSON between markers.

---BEGIN REWRITE JSON---
{{
  "rewritten_question": "string",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct_answer": "A|B|C|D|True|False",
  "explanation": "string (why this version is better for the action)",
  "action_applied": "{action}"
}}
---END REWRITE JSON---

Action: {action}
Subject: {subject}
Grade level: {grade_level}
Language for output: {language}

Original question:
{question_text}

Original options (if MCQ):
{options_block}

Action rules:
- easier: Simplify language, reduce cognitive load, use familiar context.
- harder: Add complexity, require multi-step reasoning, use less familiar context.
- more_conceptual: Focus on understanding the underlying principle, not just recall.
- more_applied: Reframe as a real-world scenario or calculation problem.
- arabic: Translate accurately to Arabic. Keep structure identical.
- english: Translate accurately to English. Keep structure identical.
- For rewrite actions (not translation): keep the same correct answer letter if MCQ,
  but rewrite options to match the new phrasing.
- Output the SAME question type (MCQ, essay, T/F) as the original.
""".strip()

    # ============================================================
    # DISTRACTOR GENERATION PROMPT (Commit 20)
    # Placeholders: subject, grade_level, question_text, correct_answer, existing_distractors
    # ============================================================
    DISTRACTOR_GENERATION_PROMPT = """
Generate 3 high-quality MCQ distractors for the question below.
Return ONLY JSON between markers.

---BEGIN DISTRACTORS JSON---
{{
  "distractors": [
    {{"text": "string", "why_plausible": "string"}},
    {{"text": "string", "why_plausible": "string"}},
    {{"text": "string", "why_plausible": "string"}}
  ]
}}
---END DISTRACTORS JSON---

Subject: {subject}
Grade level: {grade_level}
Question: {question_text}
Correct answer: {correct_answer}
Existing distractors (avoid repeating): {existing_distractors}

Rules:
- Each distractor must be plausible (students with partial understanding would consider it).
- Each distractor must represent a real misconception or common error, not a random wrong answer.
- Distractors must be clearly wrong to a student who truly understands the material.
- Avoid: "All of the above", "None of the above", trivially wrong statements.
- Keep length similar to the correct answer.
""".strip()

    # ============================================================
    # MISTAKE EXPLANATION PROMPT (Commit 20)
    # Placeholders: subject, grade_level, question_text, correct_answer,
    #               student_answer, question_type, explanation
    # ============================================================
    MISTAKE_EXPLANATION_PROMPT = """
A student answered a question incorrectly. Help them understand their mistake.
Return ONLY JSON between markers.

---BEGIN MISTAKE EXPLANATION---
{{
  "what_was_wrong": "string (1–2 sentences: what the student got wrong)",
  "why_it_was_wrong": "string (2–3 sentences: the underlying reasoning error or gap)",
  "how_to_fix": "string (2–3 sentences: what the student should understand instead)",
  "correct_answer_explained": "string (clear explanation of the correct answer)",
  "practice_question": {{
    "question": "string (one similar practice question)",
    "answer": "string (answer to the practice question)",
    "hint": "string (short hint)"
  }}
}}
---END MISTAKE EXPLANATION---

Subject: {subject}
Grade level: {grade_level}
Question: {question_text}
Question type: {question_type}
Correct answer: {correct_answer}
Student's answer: {student_answer}
Explanation note: {explanation}

Rules:
- Be supportive, not discouraging.
- Focus on the reasoning gap, not just "you got it wrong."
- Practice question must be similar in concept and difficulty but use different wording/numbers.
""".strip()

    # ============================================================
    # DRAFT FEEDBACK PROMPT (Commit 20) — teacher grading assist
    # Placeholders: subject, grade_level, assignment_name, question_text,
    #               rubric, student_answer, score, max_score
    # ============================================================
    DRAFT_FEEDBACK_PROMPT = """
You are helping a teacher draft feedback for a student submission.
Return ONLY JSON between markers. The teacher will review and edit before sending.

---BEGIN DRAFT FEEDBACK---
{{
  "draft_comment": "string (3–5 sentences of constructive feedback the teacher can send to the student)",
  "strengths": ["string", "string"],
  "improvements": ["string", "string"],
  "grade_justification": "string (1–2 sentences explaining why this score was awarded)",
  "ai_generated": true
}}
---END DRAFT FEEDBACK---

Subject: {subject}
Grade level: {grade_level}
Assignment: {assignment_name}
Question: {question_text}
Rubric: {rubric}
Student answer: {student_answer}
Score awarded: {score} / {max_score}

Rules:
- Be constructive and specific. Reference the student's actual words where possible.
- draft_comment is what the teacher might send to the student (editable).
- strengths = what the student did well.
- improvements = what needs work.
- Mark ai_generated: true so the teacher knows this is a draft, not a final grade.
- Never make the final grade decision — the teacher confirms all grades.
""".strip()

    # ============================================================
    # ANNOUNCEMENT DRAFT PROMPT (Commit 20)
    # Placeholders: action, context, current_text, language
    # action: draft_from_context | rewrite_tone | simplify | shorten | translate
    # ============================================================
    ANNOUNCEMENT_DRAFT_PROMPT = """
Help a teacher with an announcement message.
Return ONLY JSON between markers.

---BEGIN ANNOUNCEMENT DRAFT---
{{
  "draft": "string (the announcement text)",
  "action_applied": "{action}",
  "tone": "string (professional | friendly | formal)",
  "word_count": 0
}}
---END ANNOUNCEMENT DRAFT---

Action: {action}
Language: {language}
Context / existing text:
{context}

Current announcement text (if editing):
{current_text}

Action rules:
- draft_from_context: Write a clear, friendly announcement from the context provided
  (e.g., "Assignment due Friday", "Quiz postponed to Monday").
- rewrite_tone: Keep the meaning, improve the tone to be professional and clear.
- simplify: Rewrite in simpler language suitable for all parents and students.
- shorten: Keep the key information but reduce to ≤ 60 words.
- translate: Translate accurately to {language}. Keep the same meaning and tone.

Rules:
- Always produce a complete, sendable announcement (not a template with placeholders).
- Do not invent deadlines, dates, or information not present in the context.
""".strip()

    # ============================================================
    # LESSON SUMMARY PROMPT (Commit 20)
    # Placeholders: output_type, subject, grade_level, language, lesson_text
    # output_type: summary | flashcards | key_concepts | revision_sheet | glossary | homework_draft
    # ============================================================
    LESSON_SUMMARY_PROMPT = """
Transform the lesson content below into the requested output format.
Return ONLY JSON between markers.

---BEGIN LESSON OUTPUT---
{{
  "output_type": "{output_type}",
  "subject": "{subject}",
  "grade_level": "{grade_level}",
  "title": "string",
  "content": [
    {{"label": "string", "text": "string"}}
  ],
  "word_count": 0
}}
---END LESSON OUTPUT---

Output type: {output_type}
Subject: {subject}
Grade level: {grade_level}
Language: {language}

Lesson content:
{lesson_text}

Output type rules:
- summary: 3–5 paragraph summary covering main concepts. label = paragraph heading.
- flashcards: 8–15 Q&A cards. label = question, text = answer (2–3 sentences).
- key_concepts: 6–12 key concepts with brief definitions. label = term, text = definition + example.
- revision_sheet: Structured notes with headings and bullet points. label = section heading.
- glossary: Alphabetical key terms. label = term, text = definition.
- homework_draft: 3–5 homework questions based on the lesson. label = "Q{n}", text = question + answer key.

Rules:
- Only use content from the lesson text. Do not hallucinate facts.
- Keep language appropriate for the grade level.
- If lesson text is too short, note it in the title: "Short lesson — output may be limited."
""".strip()
