from typing import List, Union, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, ValidationInfo, AliasChoices, model_validator


# ------------------------------------------------------------------------------
# Tutor Response Model
# ------------------------------------------------------------------------------
class TutorResponse(BaseModel):
    session_id: str
    message: str
    subject: str
    tone: Optional[str] = "friendly"
    language: str
    reply: str
    timestamp: str
    confidence: float
    fallback: bool = False
    curriculum: Optional[str] = ""

    model_config = {"extra": "ignore"}


# ------------------------------------------------------------------------------
# Quiz Question Model
# ------------------------------------------------------------------------------
class QuizQuestion(BaseModel):
    id: str = Field(default="1", description="Unique question ID")

    type: str = Field(
        default="multiple_choice",
        description="multiple_choice | essay | true_false",
    )

    question: str = Field(..., description="Question text")

    # Scoring
    max_score: int = Field(
        default=1,
        ge=1,
        description="Max score for this question",
    )

    # MCQ fields
    options: List[str] = Field(default_factory=list)

    # Accept BOTH 'answer' and 'correct_answer' from incoming JSON
    # MCQ: single letter A/B/C/D
    # True/False: 'True' or 'False'
    # Essay: free text key points (not heavily used in grading)
    answer: str = Field(
        default="",
        description="Correct answer (MCQ letter A-D, True/False, or essay key points)",
        validation_alias=AliasChoices("answer", "correct_answer"),
    )

    # Essay-specific fields
    expected_answer: Optional[str] = ""
    rubric: Optional[str] = ""
    explanation: str = ""

    # Keep consistent: you normalize lists into newline-separated string anyway
    solution_steps: str = ""

    model_config = {"extra": "ignore"}

    # ------------------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------------------
    @field_validator("type", mode="before")
    def normalize_type(cls, v):
        valid = {"multiple_choice", "essay", "true_false"}
        if not v:
            return "multiple_choice"
        v = str(v).strip().lower().replace(" ", "_")
        return v if v in valid else "multiple_choice"

    @field_validator("max_score", mode="before")
    def normalize_max_score(cls, v, info: ValidationInfo):
        qtype = (info.data or {}).get("type", "multiple_choice")
        if v is None:
            return 10 if qtype == "essay" else 1
        try:
            n = int(v)
            if qtype == "essay":
                return max(5, n)
            return max(1, n)
        except Exception:
            return 10 if qtype == "essay" else 1

    @field_validator("solution_steps", mode="before")
    def normalize_steps(cls, v):
        if v is None:
            return ""
        if isinstance(v, list):
            return "\n".join(str(x).strip() for x in v if str(x).strip())
        return str(v).strip()

    @field_validator("options", mode="before")
    def validate_mcq_options(cls, v, info: ValidationInfo):
        qtype = (info.data or {}).get("type", "multiple_choice")
        if qtype != "multiple_choice":
            return []

        if not v or not isinstance(v, list) or len(v) < 4:
            return [
                "A. Option 1",
                "B. Option 2",
                "C. Option 3",
                "D. Option 4",
            ]

        return v[:4]

    @field_validator("answer", mode="before")
    def normalize_answer(cls, v, info: ValidationInfo):
        if v is None:
            return ""

        qtype = (info.data or {}).get("type", "multiple_choice")
        v = str(v).strip()

        # True/False normalization
        if qtype == "true_false":
            return "True" if v.lower() in {"true", "t", "yes", "y"} else "False"

        # MCQ normalization
        if qtype == "multiple_choice":
            if len(v) == 1 and v.upper() in "ABCD":
                return v.upper()
            if len(v) > 1 and v[0].upper() in "ABCD" and v[1] in {".", ")"}:
                return v[0].upper()
            return v

        # Essay answer is free text
        return v


# ------------------------------------------------------------------------------
# Quiz Response Model
# ------------------------------------------------------------------------------
class QuizResponse(BaseModel):
    quiz: List[QuizQuestion]
    topic: str
    subject: str
    difficulty: str
    grade_level: str
    confidence: float = 1.0
    bloom_level: Optional[str] = "understand"
    grounded: bool = False  # True when course_context was supplied

    total_mcq: Optional[int] = None
    total_essay: Optional[int] = None
    total_true_false: Optional[int] = None

    model_config = {"extra": "ignore"}

    @model_validator(mode="after")
    def compute_counts(self):
        quiz = self.quiz or []
        self.total_mcq = sum(1 for q in quiz if q.type == "multiple_choice")
        self.total_essay = sum(1 for q in quiz if q.type == "essay")
        self.total_true_false = sum(1 for q in quiz if q.type == "true_false")
        return self


# ------------------------------------------------------------------------------
# Explanation Response Model
# ------------------------------------------------------------------------------
class ExplanationResponse(BaseModel):
    topic: str
    grade_level: str
    language: str
    style: str
    explanation: str
    timestamp: str
    fallback: bool = False
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"extra": "ignore"}


# ------------------------------------------------------------------------------
# Assignment Question Model
# ------------------------------------------------------------------------------
class AssignmentQuestion(BaseModel):
    id: str = Field(..., description="Unique identifier for the question")
    type: str = Field(
        ...,
        description="Type of question: multiple_choice, essay, short_answer, problem_solving, true_false",
    )
    question: str = Field(..., description="The question text")
    points: int = Field(default=1, description="Points allocated for this question")

    # MCQ specific fields
    options: Optional[List[str]] = Field(default=None, description="Options for multiple choice questions")
    correct_answer: Optional[str] = Field(default=None, description="Correct answer for MCQ or True/False")
    explanation: Optional[str] = Field(default=None, description="Explanation for the answer")

    # Essay/Short Answer/Problem Solving specific fields
    expected_answer: Optional[str] = Field(default=None, description="Expected answer for essay/short answer questions")
    rubric: Optional[str] = Field(default=None, description="Grading rubric for essay questions")
    solution_steps: Optional[str] = Field(default=None, description="Step-by-step solution")
    scoring_criteria: Optional[str] = Field(default=None, description="Scoring criteria for short answer questions")

    model_config = {"extra": "ignore"}

    @field_validator("type", mode="before")
    def validate_question_type(cls, v):
        valid_types = {"multiple_choice", "essay", "short_answer", "problem_solving", "true_false"}
        if not v:
            return "multiple_choice"
        v = str(v).strip().lower().replace(" ", "_")
        return v if v in valid_types else "multiple_choice"

    @field_validator("points", mode="before")
    def validate_points(cls, v):
        if v is None:
            return 1
        try:
            points = int(v)
            return max(1, points)
        except (ValueError, TypeError):
            return 1

    @field_validator("options", mode="before")
    def validate_assignment_options(cls, v, info: ValidationInfo):
        qtype = (info.data or {}).get("type", "multiple_choice")
        if qtype != "multiple_choice":
            return None

        if not v or not isinstance(v, list) or len(v) < 4:
            return [
                "A. Option A",
                "B. Option B",
                "C. Option C",
                "D. Option D",
            ]
        return v[:4]

    @field_validator("correct_answer", mode="before")
    def normalize_correct_answer(cls, v, info: ValidationInfo):
        if v is None:
            return None

        qtype = (info.data or {}).get("type", "multiple_choice")
        v = str(v).strip()

        if qtype == "true_false":
            return "True" if v.lower() in {"true", "t", "yes", "y"} else "False"

        if qtype == "multiple_choice":
            if len(v) == 1 and v.upper() in "ABCD":
                return v.upper()
            if len(v) > 1 and v[0].upper() in "ABCD" and v[1] in {".", ")"}:
                return v[0].upper()
            return v

        return v

    @field_validator(
        "solution_steps",
        "expected_answer",
        "rubric",
        "scoring_criteria",
        "explanation",
        mode="before",
    )
    def normalize_text_fields(cls, v):
        if v is None:
            return ""
        return str(v).strip()

    # Helper methods
    def is_mcq(self) -> bool:
        return self.type == "multiple_choice"

    def is_essay(self) -> bool:
        return self.type == "essay"

    def is_short_answer(self) -> bool:
        return self.type == "short_answer"

    def is_problem_solving(self) -> bool:
        return self.type == "problem_solving"

    def is_true_false(self) -> bool:
        return self.type == "true_false"


# ------------------------------------------------------------------------------
# Assignment Response Model
# ------------------------------------------------------------------------------
class AssignmentResponse(BaseModel):
    assignment: List[AssignmentQuestion] = Field(..., description="List of assignment questions")
    topic: str = Field(..., description="Topic of the assignment")
    subject: str = Field(..., description="Subject area")
    difficulty: str = Field(..., description="Difficulty level: easy, medium, hard")
    grade_level: str = Field(..., description="Grade level or educational stage")
    assignment_type: str = Field(
        ...,
        description="Type of assignment: homework, classwork, worksheet, project, assessment, practice",
    )
    total_points: int = Field(..., description="Total points for the assignment")
    estimated_time: Optional[str] = Field(default=None, description="Estimated time to complete")
    instructions: Optional[str] = Field(default=None, description="Overall assignment instructions")
    learning_objectives: Optional[List[str]] = Field(default=None, description="Learning objectives for the assignment")
    confidence: float = Field(..., description="Confidence score of the generation", ge=0.0, le=1.0)

    # Analytics fields
    total_mcq: Optional[int] = Field(default=None, description="Count of multiple choice questions")
    total_essay: Optional[int] = Field(default=None, description="Count of essay questions")
    total_short_answer: Optional[int] = Field(default=None, description="Count of short answer questions")
    total_problem_solving: Optional[int] = Field(default=None, description="Count of problem solving questions")
    total_true_false: Optional[int] = Field(default=None, description="Count of true/false questions")

    model_config = {"extra": "ignore"}

    @field_validator("assignment_type", mode="before")
    def validate_assignment_type(cls, v):
        valid_types = {"homework", "classwork", "worksheet", "project", "assessment", "practice"}
        if not v:
            return "homework"
        v = str(v).strip().lower()
        return v if v in valid_types else "homework"

    @field_validator("difficulty", mode="before")
    def validate_difficulty(cls, v):
        valid_levels = {"easy", "medium", "hard"}
        if not v:
            return "medium"
        v = str(v).strip().lower()
        return v if v in valid_levels else "medium"

    @field_validator("total_points", mode="before")
    def validate_total_points(cls, v):
        if v is None:
            return 100
        try:
            points = int(v)
            return max(1, points)
        except (ValueError, TypeError):
            return 100

    @field_validator("confidence", mode="before")
    def validate_confidence(cls, v):
        if v is None:
            return 1.0
        try:
            confidence = float(v)
            return max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            return 1.0

    @field_validator("learning_objectives", mode="before")
    def normalize_learning_objectives(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            if "," in v:
                return [obj.strip() for obj in v.split(",") if obj.strip()]
            if "\n" in v:
                return [obj.strip() for obj in v.split("\n") if obj.strip()]
            return [v.strip()] if v.strip() else []
        if isinstance(v, list):
            return [str(obj).strip() for obj in v if obj]
        return []

    @model_validator(mode="after")
    def compute_counts(self):
        assignment = self.assignment or []
        self.total_mcq = sum(1 for q in assignment if q.type == "multiple_choice")
        self.total_essay = sum(1 for q in assignment if q.type == "essay")
        self.total_short_answer = sum(1 for q in assignment if q.type == "short_answer")
        self.total_problem_solving = sum(1 for q in assignment if q.type == "problem_solving")
        self.total_true_false = sum(1 for q in assignment if q.type == "true_false")
        return self

    # Helper methods
    def calculate_total_points(self) -> int:
        return sum(question.points for question in self.assignment)

    def get_question_types_summary(self) -> Dict[str, int]:
        return {
            "multiple_choice": self.total_mcq or 0,
            "essay": self.total_essay or 0,
            "short_answer": self.total_short_answer or 0,
            "problem_solving": self.total_problem_solving or 0,
            "true_false": self.total_true_false or 0,
        }


# ------------------------------------------------------------------------------
# Example Data for Documentation
# ------------------------------------------------------------------------------
ASSIGNMENT_EXAMPLE = {
    "assignment": [
        {
            "id": "1",
            "type": "multiple_choice",
            "question": "What is the capital of France?",
            "points": 1,
            "options": ["A. London", "B. Paris", "C. Berlin", "D. Madrid"],
            "correct_answer": "B. Paris",
            "explanation": "Paris is the capital and most populous city of France.",
        },
        {
            "id": "2",
            "type": "essay",
            "question": "Explain the significance of the French Revolution.",
            "points": 5,
            "expected_answer": "The French Revolution was a period of radical political and societal change...",
            "rubric": "Content accuracy (40%), Organization (30%), Clarity (30%)",
            "solution_steps": "1. Introduction 2. Key events 3. Impact 4. Conclusion",
        },
    ],
    "topic": "European History",
    "subject": "History",
    "difficulty": "medium",
    "grade_level": "10th Grade",
    "assignment_type": "homework",
    "total_points": 25,
    "estimated_time": "45 minutes",
    "instructions": "Answer all questions to the best of your ability. Show your work for essay questions.",
    "learning_objectives": [
        "Understand key historical events",
        "Analyze cause and effect relationships",
        "Develop critical thinking skills",
    ],
    "confidence": 0.95,
}
