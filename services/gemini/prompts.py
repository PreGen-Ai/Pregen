# services/gemini/prompts.py
#
# Centralized LLM prompt templates.
# Provider-neutral: used by both OpenAI (primary) and Gemini (fallback).
#
# Authoring rules applied throughout:
#  - JSON tasks: explicit output contract, no markdown outside markers, schema inline.
#  - Text tasks: concise instructions, student-safe tone, constructive framing only.
#  - All prompts: respect language/curriculum fields, avoid harsh language,
#    avoid personal data, no AI self-references.


class Prompts:
    """
    Centralized prompt templates for all AI-assisted LMS flows.

    Prompts are grouped by feature:
      TUTOR_PROMPT            — tutor chat
      ASSIGNMENT_PROMPT       — assignment generation (JSON)
      QUIZ_PROMPT             — quiz generation (JSON)
      QUIZ_VERIFY_PROMPT      — quiz validation (JSON)
      EXPLANATION_PROMPT      — concept explanation (text)
      ESSAY_GRADING_PROMPT    — essay grading (JSON)
      ESSAY_GRADE_JUDGE_PROMPT — grade arbitration (JSON)
      MCQ_GRADING_PROMPT      — MCQ grading (JSON)
      GRADING_PROMPT          — full assignment grading (JSON)
      COMPLETE_GRADING_PROMPT — detailed grading (JSON)
      QUESTION_REWRITE_PROMPT — question rewriting (JSON)
      DISTRACTOR_GENERATION_PROMPT — MCQ distractor generation (JSON)
      MISTAKE_EXPLANATION_PROMPT   — student mistake explanation (JSON)
      DRAFT_FEEDBACK_PROMPT        — teacher feedback draft (JSON)
      ANNOUNCEMENT_DRAFT_PROMPT    — announcement drafting (JSON)
      LESSON_SUMMARY_PROMPT        — lesson transformation (JSON)
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
        """Convenience builder — delegates to TUTOR_PROMPT.format(...)."""
        return Prompts.TUTOR_PROMPT.format(
            tone=tone,
            language=language,
            curriculum=curriculum or "Unknown",
            subject=subject,
            study_mode=study_mode or "general",
            curriculum_guidelines=curriculum_guidelines or "None",
            context=context or "No prior context.",
            material=material or "No course material uploaded for this session.",
            message=message,
            max_words=max_words,
        )

    # ================================================================
    # TUTOR CHAT PROMPT
    # Placeholders: tone, language, curriculum, subject, study_mode,
    #               curriculum_guidelines, context, material, message, max_words
    # ================================================================
    TUTOR_PROMPT = """
You are a knowledgeable, patient AI tutor.

Language: {language}
Tone: {tone}
Curriculum / Level: {curriculum}
Subject: {subject}
Study Mode: {study_mode}

Curriculum guidelines (apply only where clearly relevant):
{curriculum_guidelines}

Recent conversation context:
{context}

Course material (from uploaded files — prefer this over general knowledge):
{material}

Student question:
{message}

────────────────────────────────────
STUDY MODE INSTRUCTIONS
────────────────────────────────────
- explain_simply : Simple language, short sentences, one concrete analogy. No jargon.
- explain_deeply : Full explanation with underlying principles, derivations if relevant, and links to related concepts.
- give_example   : Lead with 1–2 worked examples, then explain the concept.
- quiz_me        : Do NOT answer directly. Ask 1–2 guiding questions to help the student reason toward the answer themselves.
- summarize      : Compact, revision-ready summary with key terms bolded. Suitable for pre-exam review.
- general        : Clear, balanced explanation appropriate for the level.

────────────────────────────────────
GROUNDING RULES
────────────────────────────────────
- Ground your answer in the course material when it is relevant.
- If the question cannot be answered from the material, say:
  "This topic isn't in your uploaded materials. Here is general knowledge on this topic:"
  Then provide a clearly labeled general answer.
- Do NOT fabricate course-specific facts, page numbers, or diagrams not present in the material.

────────────────────────────────────
FORMAT (STRICT)
────────────────────────────────────
1. Clean Markdown only.
2. Numbered lists (1. 2. 3.) — never bullet asterisks (*).
3. No backticks or inline code blocks.
4. Math: LaTeX only. Inline: \\( ... \\). Block: $$ ... $$.
   Never use Unicode math symbols outside LaTeX.
5. Clear spacing between sections.
6. No emojis or decorative symbols.
7. Do not repeat the question.
8. Maximum {max_words} words.

────────────────────────────────────
CONTENT RULES
────────────────────────────────────
- Explain clearly at the appropriate level.
- If the student asks for step-by-step, provide structured steps.
- If critical context is missing, ask at most 1–2 short clarification questions.
- If the curriculum is SAT or IGCSE and it is clearly relevant, add one short exam tip at the end.
- Be encouraging. Never dismiss or belittle a question.
""".strip()

    # ================================================================
    # ASSIGNMENT PROMPT (JSON output)
    # Placeholders: topic, grade_level, subject, num_questions
    # ================================================================
    ASSIGNMENT_PROMPT = """
You are an expert educational content designer.
Create a {num_questions}-question assignment on "{topic}" for {grade_level} ({subject}).

OUTPUT CONTRACT — return ONLY the JSON block between the markers below.
No text, explanation, or markdown outside the markers.

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
        "solution_steps": ["step 1", "step 2"],
        "rubric": "string",
        "explanation": "string (≤25 words)"
      }}
    ]
  }}
}}
---END ASSIGNMENT JSON---

RULES:
- MCQ: exactly 4 options labeled A–D; correct_answer = A/B/C/D; explanation ≤ 20 words.
  Distractors must reflect real student misconceptions — not trivial wrong answers.
- True/False: correct_answer = True or False; explanation ≤ 20 words.
- short_answer: include expected_answer + scoring_criteria.
- problem_solving: include solution_steps (3–6 steps) + explanation (≤ 25 words).
- essay: expected_answer + rubric (10-point scale) + solution_steps (5–7 steps). Use sparingly.
- All questions must be factually accurate, age-appropriate, and educationally sound.
- Output compact JSON. Do not add whitespace outside string values.
""".strip()

    # ================================================================
    # QUIZ PROMPT (JSON output)
    # Placeholders: subject, num_questions, topic, grade_level, curriculum,
    #               language, difficulty, question_type, bloom_level,
    #               subject_directive, course_context_block, curriculum_guidelines
    # ================================================================
    QUIZ_PROMPT = """
You are an expert {subject} exam designer.
Create a {num_questions}-question quiz on "{topic}" for {grade_level}.
Curriculum: {curriculum} | Language: {language} | Difficulty: {difficulty}
Type: {question_type} | Bloom level: {bloom_level}
{subject_directive}

{course_context_block}

OUTPUT CONTRACT — return ONLY the JSON block between the markers below.
No text, explanation, or markdown outside the markers.

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
      "solution_steps": ["step 1", "step 2"],
      "explanation": "string (≤25 words)"
    }}
  ]
}}
---END QUIZ JSON---

RULES:
- MCQ: exactly 4 options labeled A–D; answer = A/B/C/D only; max_score = 1; explanation ≤ 25 words.
  Distractors must reflect real student misconceptions, not random wrong answers.
- True/False: answer = True or False; max_score = 1; explanation ≤ 25 words.
- Essay: max_score = 10; include expected_answer + rubric + solution_steps (5–7 steps); explanation ≤ 30 words.
- Bloom guidance:
    remember   = recall facts or definitions
    understand = explain concepts in own words
    apply      = use knowledge in a new context
    analyze    = break down, compare, or identify relationships
    evaluate   = judge, argue, or assess with reasoning
    create     = design, produce, or synthesize something new
- Ground questions in the course material context when it is provided.
- All questions must be factually accurate, educationally sound, and appropriate for the level.
- Output compact JSON. Do not add whitespace outside string values.

Curriculum notes (apply if relevant):
{curriculum_guidelines}
""".strip()

    # ================================================================
    # QUIZ VERIFY PROMPT (JSON output)
    # Placeholder: quiz_json
    # ================================================================
    QUIZ_VERIFY_PROMPT = """
Validate the quiz JSON below. Return ONLY the JSON object shown — no other text.

{{
  "is_valid": true,
  "issues": [],
  "fix_instructions": []
}}

Checks to perform:
- Top-level object has a "quiz" array.
- Each item has: id, type, question, max_score.
- MCQ: options array has exactly 4 elements labeled A–D; answer is one of A/B/C/D.
- True/False: answer is exactly "True" or "False".
- Essay: expected_answer is a non-empty string; rubric is a non-empty string; solution_steps is a non-empty array.
- Exactly one correct answer per question; no ambiguity.
- No questions that reference protected personal data.

Quiz JSON to validate:
{quiz_json}
""".strip()

    # ================================================================
    # EXPLANATION PROMPT (plain text output)
    # Placeholders: topic, grade_level, language, style, previous_knowledge,
    #               course_context_block
    # ================================================================
    EXPLANATION_PROMPT = """
Explain "{topic}" for a {grade_level} student. Language: {language}. Style: {style}.
Student's prior knowledge: {previous_knowledge}.
{course_context_block}

Write 2–4 sentences covering:
1. A clear definition or core idea.
2. One concrete real-world example or analogy.
3. Why this concept matters or how it connects to the subject.

Rules:
- Match the language and complexity to the grade level.
- No headings, bullet points, or lists — flowing prose only.
- Do not start with "Sure", "Certainly", or any affirmation.
- Output ONLY the explanation text.
""".strip()

    # ================================================================
    # ESSAY GRADING PROMPT (JSON output)
    # Placeholders: subject, grade_level, question_text, expected_answer,
    #               rubric, solution_steps, student_answer
    # ================================================================
    ESSAY_GRADING_PROMPT = """
You are an expert grader. Grade the student essay fairly and constructively.

OUTPUT CONTRACT — return ONLY the JSON block between the markers below.
No text or markdown outside the markers.

---BEGIN ESSAY GRADE---
{{
  "is_correct": true,
  "score": 0,
  "max_score": 10,
  "rubric_breakdown": [
    {{"criterion": "string", "awarded": 0, "max": 0, "evidence": "quote or paraphrase from student answer"}}
  ],
  "mistakes": ["specific error 1", "specific error 2"],
  "misconceptions": ["misconception detected, if any"],
  "feedback": "2–3 constructive sentences: what the student did well, what was incorrect, and one clear suggestion.",
  "suggestion": "One specific next step the student can take (e.g., review a concept, redo a step)."
}}
---END ESSAY GRADE---

Subject: {subject} | Grade level: {grade_level}
Question: {question_text}
Expected answer: {expected_answer}
Rubric: {rubric}
Solution steps: {solution_steps}
Student answer: {student_answer}

GRADING RULES:
- score is an integer 0–10; rubric_breakdown entries must sum to score.
- Award points only when the student's answer contains clear, relevant evidence.
- Be strict but fair — partial credit is appropriate for partially correct reasoning.
- feedback must be constructive and specific, not generic ("good try" is not useful).
- mistakes = specific factual errors, omissions, or wrong steps (not vague summaries).
- suggestion = one actionable improvement, not a repetition of what was wrong.
- Never include the student's name or any personal identifiers.
""".strip()

    # ================================================================
    # ESSAY GRADE JUDGE PROMPT (JSON output)
    # Placeholders: question_text, expected_answer, rubric, student_answer,
    #               grade_a, grade_b
    # ================================================================
    ESSAY_GRADE_JUDGE_PROMPT = """
Two grades were produced for the same student essay. Choose the more accurate one
or produce a corrected merged grade. Return ONLY the JSON block between the markers.

---BEGIN ESSAY GRADE---
{{
  "is_correct": true,
  "score": 0,
  "max_score": 10,
  "rubric_breakdown": [],
  "mistakes": [],
  "feedback": ""
}}
---END ESSAY GRADE---

Question: {question_text}
Expected answer: {expected_answer}
Rubric: {rubric}
Student answer: {student_answer}

Grade A: {grade_a}
Grade B: {grade_b}

RULES:
- score is an integer 0–10; rubric_breakdown entries must sum to score and respect max values.
- All evidence cited must come directly from the student's answer.
- Choose the grade that is more accurate and better justified; do not just average the two.
""".strip()

    # ================================================================
    # MCQ GRADING PROMPT (JSON output)
    # Placeholders: subject, question_text, options, correct_answer,
    #               student_answer, explanation
    # ================================================================
    MCQ_GRADING_PROMPT = """
Grade the student's multiple-choice answer.
Return ONLY the JSON block between the markers below — no other text.

---BEGIN MCQ GRADE---
{{
  "is_correct": true,
  "score": 0,
  "max_score": 1,
  "feedback": "One concise, constructive sentence explaining why the answer is correct or incorrect.",
  "correct_letter": "{correct_answer}"
}}
---END MCQ GRADE---

Subject: {subject}
Question: {question_text}
Options: {options}
Correct answer: {correct_answer}
Student's answer: {student_answer}
Explanation note: {explanation}

RULES:
- is_correct = true if and only if the student's letter matches the correct letter.
- If the student provided full option text instead of a letter, map it to the closest letter.
- feedback must be specific — reference the concept, not just "correct" or "incorrect".
- Never reveal other options' correctness.
""".strip()

    # ================================================================
    # GRADING PROMPT (JSON output — full assignment)
    # Placeholders: curriculum, assignment_data, student_answers
    # ================================================================
    GRADING_PROMPT = """
You are an examiner for the {curriculum} curriculum.
Grade the student submission below and return ONLY the JSON block between the markers.

---BEGIN GRADING JSON---
{{
  "overall_score": 0.0,
  "feedback": "1–2 sentences of constructive overall feedback.",
  "concept_analytics": [],
  "question_analysis": [],
  "study_plan": []
}}
---END GRADING JSON---

Assignment data:
{assignment_data}

Student answers:
{student_answers}

RULES:
- overall_score is a number 0–100.
- feedback is constructive — note strengths and one clear area for improvement.
- question_analysis: one entry per question with question_id, score, max_score, feedback.
- study_plan: list of specific topics the student should revisit based on errors.
""".strip()

    # ================================================================
    # COMPLETE GRADING PROMPT (JSON output — detailed)
    # Placeholders: subject, curriculum, assignment_name, student_id,
    #               assignment_data, student_answers
    # ================================================================
    COMPLETE_GRADING_PROMPT = """
Grade the student submission and return ONLY the JSON block between the markers.
No text or markdown outside the markers.

---BEGIN COMPLETE GRADE---
{{
  "overall_score": 0,
  "summary_feedback": "2–3 constructive sentences highlighting strengths and areas for growth.",
  "per_question_breakdown": [
    {{
      "question_id": "string",
      "score": 0,
      "max_score": 0,
      "feedback": "Specific, constructive feedback for this question."
    }}
  ],
  "recommended_next_topics": ["topic 1", "topic 2"]
}}
---END COMPLETE GRADE---

Subject: {subject} | Curriculum: {curriculum}
Assignment: {assignment_name} | Student ID: {student_id}

Data: {assignment_data}
Answers: {student_answers}

RULES:
- overall_score is an integer 0–100.
- summary_feedback is constructive — do not use harsh language; identify specific strengths.
- per_question_breakdown must include every question in the assignment.
- recommended_next_topics: 2–4 specific topics the student should review, based on errors.
""".strip()

    # ================================================================
    # QUESTION REWRITE PROMPT (JSON output)
    # Placeholders: action, subject, grade_level, language,
    #               question_text, options_block
    # action: easier | harder | more_conceptual | more_applied | arabic | english
    # ================================================================
    QUESTION_REWRITE_PROMPT = """
Rewrite the question below according to the specified action.
Return ONLY the JSON block between the markers — no other text.

---BEGIN REWRITE JSON---
{{
  "rewritten_question": "string",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct_answer": "A|B|C|D|True|False",
  "explanation": "string (1–2 sentences: why this version is better for the action)",
  "action_applied": "{action}"
}}
---END REWRITE JSON---

Action: {action}
Subject: {subject}
Grade level: {grade_level}
Output language: {language}

Original question:
{question_text}

Original options (if MCQ):
{options_block}

ACTION RULES:
- easier         : Simplify language, reduce cognitive load, use familiar context.
- harder         : Add complexity, require multi-step reasoning, use less familiar context.
- more_conceptual: Focus on understanding the underlying principle, not recall.
- more_applied   : Reframe as a real-world scenario or practical calculation.
- arabic         : Translate accurately to Arabic. Preserve structure and meaning exactly.
- english        : Translate accurately to English. Preserve structure and meaning exactly.

For rewrite (non-translation) actions on MCQ:
- Keep the same correct answer letter if possible.
- Rewrite all options to match the new phrasing.
- Output the same question type (MCQ, essay, T/F) as the original.
- Ensure the rewritten question is factually accurate and educationally sound.
""".strip()

    # ================================================================
    # DISTRACTOR GENERATION PROMPT (JSON output)
    # Placeholders: subject, grade_level, question_text, correct_answer,
    #               existing_distractors
    # ================================================================
    DISTRACTOR_GENERATION_PROMPT = """
Generate 3 high-quality MCQ distractors for the question below.
Return ONLY the JSON block between the markers — no other text.

---BEGIN DISTRACTORS JSON---
{{
  "distractors": [
    {{"text": "string", "why_plausible": "string (the misconception it represents)"}},
    {{"text": "string", "why_plausible": "string"}},
    {{"text": "string", "why_plausible": "string"}}
  ]
}}
---END DISTRACTORS JSON---

Subject: {subject}
Grade level: {grade_level}
Question: {question_text}
Correct answer: {correct_answer}
Existing distractors to avoid repeating: {existing_distractors}

RULES:
- Each distractor must be plausible to a student with partial understanding.
- Each distractor must represent a specific, real misconception or common error.
- Distractors must be clearly wrong to a student who fully understands the material.
- Avoid: "All of the above", "None of the above", trivially absurd statements.
- Keep each distractor approximately the same length as the correct answer.
- Never include the correct answer as a distractor.
""".strip()

    # ================================================================
    # MISTAKE EXPLANATION PROMPT (JSON output)
    # Placeholders: subject, grade_level, question_text, correct_answer,
    #               student_answer, question_type, explanation
    # ================================================================
    MISTAKE_EXPLANATION_PROMPT = """
A student answered a question incorrectly. Help them understand and learn from their mistake.
Return ONLY the JSON block between the markers — no other text.

---BEGIN MISTAKE EXPLANATION---
{{
  "what_was_wrong": "string (1–2 sentences: precisely what the student got wrong)",
  "why_it_was_wrong": "string (2–3 sentences: the underlying reasoning gap or misconception)",
  "how_to_fix": "string (2–3 sentences: what the student needs to understand instead)",
  "correct_answer_explained": "string (clear, thorough explanation of the correct answer)",
  "practice_question": {{
    "question": "string (one similar practice question)",
    "answer": "string (answer to the practice question)",
    "hint": "string (one short hint to guide the student)"
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

RULES:
- Use a supportive, encouraging tone — never make the student feel embarrassed.
- Focus on the reasoning gap, not just labeling the answer wrong.
- The practice question must be conceptually similar but use different wording or numbers.
- Never reveal other students' answers or include personal identifiers.
""".strip()

    # ================================================================
    # DRAFT FEEDBACK PROMPT (JSON output) — teacher grading assist
    # Placeholders: subject, grade_level, assignment_name, question_text,
    #               rubric, student_answer, score, max_score
    # ================================================================
    DRAFT_FEEDBACK_PROMPT = """
You are assisting a teacher by drafting feedback for a student submission.
The teacher will review, edit, and approve this before sending it to the student.
Return ONLY the JSON block between the markers — no other text.

---BEGIN DRAFT FEEDBACK---
{{
  "draft_comment": "string (3–5 sentences of constructive, specific feedback the teacher can send)",
  "strengths": ["string", "string"],
  "improvements": ["string", "string"],
  "grade_justification": "string (1–2 sentences explaining why this score was awarded)",
  "ai_generated": true,
  "teacher_must_review": true
}}
---END DRAFT FEEDBACK---

Subject: {subject}
Grade level: {grade_level}
Assignment: {assignment_name}
Question: {question_text}
Rubric: {rubric}
Student answer: {student_answer}
Score awarded: {score} / {max_score}

RULES:
- draft_comment is addressed to the student — constructive, specific, and encouraging.
- Reference the student's actual words where it supports the feedback.
- strengths: at least one genuine strength, even in a low-scoring answer.
- improvements: specific, actionable (not just "be more detailed").
- grade_justification: explains the score relative to the rubric without being harsh.
- Never make the final grading decision — the teacher confirms all grades.
- Do not include the student's name or any personal identifiers.
""".strip()

    # ================================================================
    # ANNOUNCEMENT DRAFT PROMPT (JSON output)
    # Placeholders: action, context, current_text, language
    # action: draft_from_context | rewrite_tone | simplify | shorten | translate
    # ================================================================
    ANNOUNCEMENT_DRAFT_PROMPT = """
Help a teacher write or improve a class announcement.
Return ONLY the JSON block between the markers — no other text.

---BEGIN ANNOUNCEMENT DRAFT---
{{
  "draft": "string (the complete announcement text, ready to send)",
  "action_applied": "{action}",
  "tone": "professional|friendly|formal",
  "word_count": 0
}}
---END ANNOUNCEMENT DRAFT---

Action: {action}
Output language: {language}

Context / topic:
{context}

Current text (if editing an existing announcement):
{current_text}

ACTION RULES:
- draft_from_context : Write a clear, friendly announcement from the context provided.
                       Do not invent deadlines, dates, or facts not in the context.
- rewrite_tone       : Keep the same meaning; improve the tone to be professional and clear.
- simplify           : Rewrite in simpler language suitable for students and parents of all literacy levels.
- shorten            : Reduce to ≤ 60 words while keeping all key information.
- translate          : Translate accurately to {language}. Preserve tone and meaning exactly.

GENERAL RULES:
- Produce a complete, sendable announcement — no placeholders like [date] or [name].
- Be professional and warm; avoid overly formal or bureaucratic language.
- word_count must accurately reflect the number of words in the draft.
""".strip()

    # ================================================================
    # LESSON SUMMARY PROMPT (JSON output)
    # Placeholders: output_type, subject, grade_level, language, lesson_text
    # output_type: summary | flashcards | key_concepts | revision_sheet |
    #              glossary | homework_draft
    # ================================================================
    LESSON_SUMMARY_PROMPT = """
Transform the lesson content below into the requested output format.
Return ONLY the JSON block between the markers — no other text.

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

OUTPUT TYPE RULES:
- summary        : 3–5 paragraphs covering main concepts. label = paragraph heading.
- flashcards     : 8–15 Q&A pairs. label = question, text = answer (2–3 sentences).
- key_concepts   : 6–12 terms with definitions. label = term, text = definition + one example.
- revision_sheet : Structured notes with section headings and concise bullet content.
                   label = section heading, text = concise notes for that section.
- glossary       : Alphabetically sorted key terms. label = term, text = definition.
- homework_draft : 3–5 questions based on the lesson.
                   label = "Q{{n}}", text = question + answer key.

GENERAL RULES:
- Use only content present in the lesson text — do not hallucinate facts.
- Language and complexity must match the grade level.
- If the lesson text is very short, include a note in the title: "(Short lesson — output may be limited)"
- word_count must accurately count the total words across all content items.
""".strip()
