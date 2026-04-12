"""
pydantic_models.py

Pydantic models for request validation and API documentation.
Fully aligned with Model-A architecture and normalized pipelines.

Notes:
- Uses strict normalizers for enums and common fields.
- `.normalized()` helper methods return backend-friendly dicts.
- Designed to be compatible with both Pydantic v1 and v2 usage patterns
  (no use of v2-only decorators).
"""

from pydantic import BaseModel, Field, conint
from enum import Enum
from typing import Optional, Any, Dict, List


# ==========================================================
# ENUMS — WITH STRICT NORMALIZATION
# ==========================================================
class QuestionType(str, Enum):
    multiple_choice = "multiple_choice"
    essay = "essay"
    true_false = "true_false"
    mixed = "mixed"

    @classmethod
    def normalize(cls, value: Optional[str]) -> str:
        if not value:
            return cls.multiple_choice.value
        v = value.strip().lower().replace(" ", "_")
        mapping = {
            "mcq": cls.multiple_choice.value,
            "multiple_choice": cls.multiple_choice.value,
            "multiplechoice": cls.multiple_choice.value,
            "multiple-choice": cls.multiple_choice.value,
            "essay": cls.essay.value,
            "essay_questions": cls.essay.value,
            "short_answer": cls.essay.value,
            "true_false": cls.true_false.value,
            "true/false": cls.true_false.value,
            "true-false": cls.true_false.value,
            "mixed": cls.mixed.value,
            "mixed_(mcq_+_essay)": cls.mixed.value,
        }
        return mapping.get(v, cls.multiple_choice.value)


class Difficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"

    @classmethod
    def normalize(cls, value: Optional[str]) -> str:
        if not value:
            return cls.medium.value
        v = value.strip().lower()
        return v if v in (cls.easy.value, cls.medium.value, cls.hard.value) else cls.medium.value


class Tone(str, Enum):
    supportive = "supportive"
    academic = "academic"
    humorous = "humorous"
    critical = "critical"


# ==========================================================
# QUIZ GENERATION REQUEST
# ==========================================================
class QuizRequest(BaseModel):
    """
    Request model for quiz generation.
    Fields are intentionally permissive; `.normalized()` ensures backend-safe values.
    Commit 20: added bloom_level and course_context for grounded generation.
    """
    topic: str = Field(..., description="Topic of the quiz")
    num_questions: conint(gt=0, le=50) = 5
    question_type: Optional[str] = "multiple_choice"
    difficulty: Optional[str] = "medium"
    grade_level: Optional[str] = "High School"
    language: Optional[str] = "English"
    curriculum: Optional[str] = None   # allow empty (frontend may omit)
    bloom_level: Optional[str] = "understand"  # remember|understand|apply|analyze|evaluate|create
    course_context: Optional[str] = None       # lesson/module text for grounded generation
    subject: Optional[str] = None

    def normalized(self) -> dict:
        """Return fully normalized structure for QuizService."""
        topic = (self.topic or "").strip()
        grade_level = (self.grade_level or "High School").strip()
        language = (self.language or "English").strip()
        curriculum = (self.curriculum or "").strip()
        bloom = (self.bloom_level or "understand").strip().lower()
        course_ctx = (self.course_context or "").strip()

        return {
            "topic": topic,
            "num_questions": int(self.num_questions),
            "question_type": QuestionType.normalize(self.question_type),
            "difficulty": Difficulty.normalize(self.difficulty),
            "grade_level": grade_level,
            "language": language,
            "curriculum": curriculum,
            "bloom_level": bloom,
            "course_context": course_ctx,
            **({"subject": self.subject.strip()} if self.subject else {}),
        }


# ==========================================================
# ASSIGNMENT REQUEST
# ==========================================================
class AssignmentRequest(BaseModel):
    topic: str
    grade_level: Optional[str] = "High School"
    subject: Optional[str] = "General"
    num_questions: conint(gt=0, le=30) = 5
    language: Optional[str] = "English"
    question_type: Optional[str] = "mixed"
    difficulty: Optional[str] = "medium"
    assignment_type: Optional[str] = "homework"
    curriculum: Optional[str] = "American"
    instructions: Optional[str] = None
    learning_objectives: Optional[List[str]] = None
    total_points: Optional[int] = Field(default=100, ge=1, le=1000)
    estimated_time: Optional[str] = None
    course_context: Optional[str] = None  # Commit 20: lesson text for grounded generation

    def normalized(self) -> dict:
        """Normalized structure to match AssignmentService inputs."""
        return {
            "topic": (self.topic or "").strip(),
            "grade_level": (self.grade_level or "High School").strip(),
            "subject": (self.subject or "General").strip(),
            "num_questions": int(self.num_questions),
            "language": (self.language or "English").strip(),
            "question_type": (self.question_type or "mixed").strip(),
            "difficulty": (self.difficulty or "medium").strip(),
            "assignment_type": (self.assignment_type or "homework").strip(),
            "curriculum": (self.curriculum or "American").strip(),
            "instructions": (self.instructions or "").strip(),
            "learning_objectives": self.learning_objectives or [],
            "total_points": int(self.total_points or 100),
            "estimated_time": (self.estimated_time or "").strip(),
            "course_context": (self.course_context or "").strip(),
        }
# ==========================================================
# CHAT REQUEST MODEL
# ==========================================================
class ChatRequest(BaseModel):
    session_id: str
    message: str
    subject: Optional[str] = "General"
    tone: Optional[Tone] = Tone.supportive
    language: Optional[str] = "English"
    curriculum: Optional[str] = "General"
    # Commit 20: study mode — explain_simply|explain_deeply|give_example|quiz_me|summarize|general
    study_mode: Optional[str] = "general"
    user_profile: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional personalization info (age, grade, etc.)"
    )

    def normalized(self) -> dict:
        return {
            "session_id": (self.session_id or "").strip(),
            "message": (self.message or "").strip(),
            "subject": (self.subject or "General").strip(),
            "tone": (self.tone or Tone.supportive).value if isinstance(self.tone, Tone) else str(self.tone),
            "language": (self.language or "English").strip(),
            "curriculum": (self.curriculum or "General").strip(),
            "study_mode": (self.study_mode or "general").strip(),
            "user_profile": self.user_profile or {},
        }


# ==========================================================
# EXPLANATION REQUEST
# ==========================================================
class ExplanationRequest(BaseModel):
    question_data: Dict[str, Any]
    student_answer: Optional[str] = ""
    subject: Optional[str] = "General"
    curriculum: Optional[str] = "General"
    grade_level: Optional[str] = "General"
    language: Optional[str] = "English"
    style: Optional[str] = "friendly"
    previous_knowledge: Optional[str] = "basic understanding"
    
    def normalized(self) -> dict:
        return {
            "question_data": self.question_data or {},
            "student_answer": (self.student_answer or "").strip(),
            "subject": (self.subject or "General").strip(),
            "curriculum": (self.curriculum or "General").strip(),
            "style": (self.style or "friendly").strip(),
            "grade_level": (self.grade_level or "General").strip(),
            "language": (self.language or "English").strip(),
            "previous_knowledge": (self.previous_knowledge or "basic understanding").strip(),
        }

class BatchExplanationRequest(BaseModel):
    requests: List[ExplanationRequest]
    
# ==========================================================
# RUBRIC GRADING REQUEST
# ==========================================================
class RubricRequest(BaseModel):
    subject: Optional[str] = "General"
    curriculum: Optional[str] = "General"
    question_data: Dict[str, Any]
    student_answer: str

    def normalized(self) -> dict:
        return {
            "subject": (self.subject or "General").strip(),
            "curriculum": (self.curriculum or "General").strip(),
            "question_data": self.question_data or {},
            "student_answer": (self.student_answer or "").strip(),
        }


# ==========================================================
# MCQ GRADING REQUEST
# ==========================================================
class MCQQuestion(BaseModel):
    id: Optional[str] = None
    question: str
    options: List[str]
    correct_answer: str

    def normalized(self) -> dict:
        return {
            "id": (self.id or "").strip(),
            "question": (self.question or "").strip(),
            "options": [str(o).strip() for o in (self.options or [])],
            "correct_answer": (self.correct_answer or "").strip(),
        }


class MCQRequest(BaseModel):
    questions: List[MCQQuestion]
    student_answers: Dict[str, str]

    def normalized(self) -> dict:
        return {
            "questions": [q.normalized() for q in (self.questions or [])],
            "student_answers": {str(k): (v or "").strip() for k, v in (self.student_answers or {}).items()},
        }


# ==========================================================
# FULL ASSIGNMENT / QUIZ GRADING REQUEST
# ==========================================================
class EnhancedGradingRequest(BaseModel):
    student_id: Optional[str] = None
    assignment_name: Optional[str] = None
    subject: Optional[str] = "General"
    curriculum: Optional[str] = "General"
    assignment_data: Optional[Dict[str, Any]] = None
    quiz_questions: Optional[List[Dict[str, Any]]] = None
    student_answers: Dict[str, Any]
    language: Optional[str] = "English"

    def normalized(self) -> dict:
        """Used by CompleteGrading pipeline and ReportStorageService."""
        assignment_data = self.assignment_data or {}
        quiz_questions = self.quiz_questions or assignment_data.get("questions") or []
        return {
            "student_id": (self.student_id or "unknown").strip(),
            "assignment_name": (self.assignment_name or "Assignment").strip(),
            "subject": (self.subject or "General").strip(),
            "curriculum": (self.curriculum or "General").strip(),
            "assignment_data": {
                **assignment_data,
                "questions": quiz_questions,
            },
            "quiz_questions": quiz_questions,
            "student_answers": {str(k): v for k, v in (self.student_answers or {}).items()},
            "language": (self.language or "English").strip(),
        }


# ==========================================================
# ANALYTICS / REPORTING REQUESTS
# ==========================================================
class StudentReportsRequest(BaseModel):
    student_id: str
    limit: conint(gt=0, le=50) = 10

class ProgressRequest(BaseModel):
    student_id: str
    days: conint(gt=0, le=365) = 30
