// components/Dashboard/quiz/components/QuizControls.jsx
import { useState, useEffect } from "react";
import {
  Box,
  Card,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Typography,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Snackbar,
  FormControlLabel,
  Checkbox,
  Autocomplete,
  Tooltip,
  IconButton,
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Assignment, Refresh, Save, Lightbulb } from "@mui/icons-material";

import ErrorIcon from "@mui/icons-material/ErrorOutline";

import CircularProgress from "@mui/material/CircularProgress";

import quizApi from "../utils/api/quizApi";

// Constants for consistent configuration
const QUIZ_CONFIG = {
  subjects: [
    "General",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Economics",
    "Computer Science",
    "History",
    "Geography",
    "English",
    "Business",
    "Art",
    "Music",
  ],
  curricula: [
    "General",
    "IGCSE",
    "International Baccalaureate (IB)",
    "American Curriculum",
    "A-Levels",
    "SAT",
    "Advanced Placement (AP)",
    "CBSE (India)",
  ],
  questionTypes: [
    { value: "multiple_choice", label: "Multiple Choice" },
    { value: "essay", label: "Essay Questions" },
    { value: "mixed", label: "Mixed Types" },
    { value: "true_false", label: "True / False" },
    { value: "short_answer", label: "Short Answer" },
  ],
  difficulties: [
    { value: "easy", label: "Easy", description: "Basic concepts & recall" },
    { value: "medium", label: "Medium", description: "Application & analysis" },
    { value: "hard", label: "Hard", description: "Complex problem solving" },
    { value: "expert", label: "Expert", description: "Advanced synthesis" },
  ],
  bloomLevels: [
    "Remember",
    "Understand",
    "Apply",
    "Analyze",
    "Evaluate",
    "Create",
  ],
  timeLimits: [
    { value: 0, label: "No limit" },
    { value: 30, label: "30 seconds" },
    { value: 60, label: "1 minute" },
    { value: 120, label: "2 minutes" },
    { value: 300, label: "5 minutes" },
  ],
};

const DEFAULT_PRESETS = {
  quick: [
    { name: "Photosynthesis", subject: "Biology" },
    { name: "World War II", subject: "History" },
    { name: "Trigonometry", subject: "Mathematics" },
    { name: "Newton's Laws", subject: "Physics" },
    { name: "Shakespeare", subject: "English" },
    { name: "Climate Change", subject: "Geography" },
    { name: "Python Programming", subject: "Computer Science" },
    { name: "Human Anatomy", subject: "Biology" },
    { name: "Algebra Basics", subject: "Mathematics" },
    { name: "Chemical Reactions", subject: "Chemistry" },
    { name: "Microeconomics", subject: "Economics" },
    { name: "Business Ethics", subject: "Business" },
  ],
  recent: [],
};

const QuizControls = ({
  onQuizGenerated = () => {},
  loading = false,
  onLoadingChange = null,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [topicSuggestions, setTopicSuggestions] = useState([]);
  const [userPresets, setUserPresets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("quizPresets")) || DEFAULT_PRESETS;
    } catch {
      return DEFAULT_PRESETS;
    }
  });

  const [quizParams, setQuizParams] = useState({
    topic: "",
    num_questions: 5,
    question_type: "multiple_choice",
    difficulty: "medium",
    grade_level: "high school",
    subject: "General",
    curriculum: "General",
    bloom_level: [],
    time_limit: 0,
    tags: [],
    include_images: false,
  });

  // Use external loading if provided, otherwise use internal state
  const isLoading = onLoadingChange !== null ? loading : internalLoading;

  /* =======================================================
     EFFECTS & UTILITIES
     ======================================================= */
  useEffect(() => {
    // Save minified presets to localStorage
    try {
      const minifiedPresets = {
        quick: userPresets.quick,
        recent: userPresets.recent,
        custom: (userPresets.custom || []).map((preset) => ({
          name: preset.name,
          topic: preset.topic,
          subject: preset.subject,
          curriculum: preset.curriculum,
          question_type: preset.question_type,
          difficulty: preset.difficulty,
          num_questions: preset.num_questions,
        })),
      };
      localStorage.setItem("quizPresets", JSON.stringify(minifiedPresets));
    } catch (error) {
      console.warn("Failed to save presets to localStorage:", error);
    }
  }, [userPresets]);

  // Enhanced topic suggestions with fuzzy matching
  useEffect(() => {
    if (quizParams.topic.length > 1) {
      const searchTerm = quizParams.topic.toLowerCase().trim();
      const suggestions = DEFAULT_PRESETS.quick
        .filter((topic) => {
          const topicName = topic.name.toLowerCase();

          // Priority 1: Exact match or starts with
          if (topicName.startsWith(searchTerm)) return true;

          // Priority 2: Contains the term
          if (topicName.includes(searchTerm)) return true;

          // Priority 3: Fuzzy matching with word boundaries
          const searchWords = searchTerm.split(/\s+/);
          const topicWords = topicName.split(/\s+/);

          return searchWords.some((word) =>
            topicWords.some(
              (topicWord) =>
                topicWord.startsWith(word) || topicWord.includes(word)
            )
          );
        })
        .slice(0, 5);
      setTopicSuggestions(suggestions);
    } else {
      setTopicSuggestions([]);
    }
  }, [quizParams.topic]);

  /* =======================================================
     MODEL-A COMPATIBLE NORMALIZATION & VALIDATION
     ======================================================= */
  const normalizeQuizParams = (params) => {
    const normalized = { ...params };

    // Ensure required fields
    if (!normalized.topic?.trim()) {
      throw new Error("Topic is required");
    }

    // ✅ CRITICAL FIX: Normalize for Model-A compatibility
    // Subject mapping
    if (normalized.subject === "General Knowledge") {
      normalized.subject = "General";
    }

    // Curriculum mapping
    if (normalized.curriculum === "None / General") {
      normalized.curriculum = "General";
    }

    // Ensure number is within reasonable bounds
    normalized.num_questions = Math.min(
      Math.max(parseInt(normalized.num_questions) || 10, 1),
      50
    );

    // ✅ CRITICAL FIX: Add Model-A required flags
    if (
      normalized.question_type.includes("essay") ||
      normalized.question_type === "mixed"
    ) {
      normalized.include_rubric = true;
    }

    // Add timestamp for tracking
    normalized.timestamp = new Date().toISOString();

    console.log("📦 Normalized Model-A quiz params:", normalized);
    return normalized;
  };

  const validateTopic = (topic) => {
    if (!topic?.trim()) {
      return "Topic is required";
    }
    if (topic.trim().length < 2) {
      return "Topic should be at least 2 characters long";
    }
    if (topic.trim().length > 100) {
      return "Topic is too long (max 100 characters)";
    }
    return null;
  };

  /* =======================================================
     ENHANCED RESPONSE EXTRACTION FOR MODEL-A
     ======================================================= */
  const extractQuestionsFromResponse = (response) => {
    console.group("🔍 Model-A Response Extraction");
    console.log("Raw API response:", response);

    // ✅ CRITICAL FIX: Enhanced extraction patterns for Model-A
    const extractionPatterns = [
      response?.quiz?.questions,
      response?.generated_quiz?.questions, // Model-A pattern
      response?.result?.questions, // Model-A pattern
      response?.questions,
      response?.data?.questions,
      response?.output?.questions, // Model-A pattern
      response?.quiz_data?.questions, // Model-A pattern
      response, // Direct array
    ];

    let questions = [];
    let extractionSource = "unknown";

    for (const pattern of extractionPatterns) {
      if (Array.isArray(pattern) && pattern.length > 0) {
        questions = pattern;
        extractionSource =
          pattern === response?.quiz?.questions
            ? "response.quiz.questions"
            : pattern === response?.generated_quiz?.questions
            ? "response.generated_quiz.questions"
            : pattern === response?.result?.questions
            ? "response.result.questions"
            : pattern === response?.questions
            ? "response.questions"
            : pattern === response?.data?.questions
            ? "response.data.questions"
            : pattern === response?.output?.questions
            ? "response.output.questions"
            : pattern === response?.quiz_data?.questions
            ? "response.quiz_data.questions"
            : "direct array";
        break;
      }
    }

    console.log(
      `📊 Extracted ${questions.length} questions from: ${extractionSource}`
    );
    console.groupEnd();

    return questions;
  };

  /* =======================================================
     ENHANCED QUESTION VALIDATION FOR MODEL-A SCHEMA
     ======================================================= */
  const validateQuestions = (questions) => {
    if (!Array.isArray(questions)) {
      throw new Error("Invalid response: questions should be an array");
    }

    if (questions.length === 0) {
      throw new Error(
        "No questions were generated. Please try a different topic or adjust parameters."
      );
    }

    // ✅ CRITICAL FIX: Enhanced validation for Model-A question types
    const validQuestions = questions.filter((q, index) => {
      if (!q || typeof q !== "object") return false;

      // Check for basic question content
      const hasQuestionContent = q.question || q.text || q.prompt;
      if (!hasQuestionContent) return false;

      // ✅ CRITICAL FIX: Prevent chain-of-thought output being treated as quiz
      if (q.task || q.chain_of_thought || q.explanation_only) {
        console.warn(`Filtered out chain-of-thought output at index ${index}`);
        return false;
      }

      // Validate based on question type
      const questionType = q.type || "multiple_choice";

      switch (questionType) {
        case "multiple_choice":
          return (
            Array.isArray(q.options) &&
            q.options.length >= 2 &&
            (q.correct_answer || q.answer)
          );

        case "true_false":
          return q.correct_answer !== undefined && q.correct_answer !== null;

        case "essay":
          return (
            (q.expected_answer || q.correct_answer || q.answer) &&
            (q.rubric_points || q.solution_steps)
          );

        case "short_answer":
          return q.correct_answer || q.expected_answer;

        default:
          // For unknown types or mixed, require at least some structure
          return (
            q.correct_answer !== undefined ||
            Array.isArray(q.options) ||
            q.expected_answer
          );
      }
    });

    if (validQuestions.length === 0) {
      throw new Error(
        "Generated questions don't match expected format. Please try again with different parameters."
      );
    }

    console.log(
      `✅ Validated ${validQuestions.length}/${questions.length} questions for Model-A`
    );
    return validQuestions;
  };

  /* =======================================================
     ENHANCE QUESTIONS FOR USEQUIZLOGIC COMPATIBILITY
     ======================================================= */
  const enhanceQuestionsForQuizLogic = (questions, params) => {
    return questions.map((q, index) => {
      const enhanced = {
        // Preserve original data
        ...q,

        // ✅ CRITICAL FIX: Ensure required fields for useQuizLogic
        id: q.id || q.question_id || `gen-${index + 1}`,
        question: q.question || q.text || q.prompt || `Question ${index + 1}`,
        type: q.type || "multiple_choice",
        max_score: q.max_score || (q.type === "essay" ? 10 : 1),

        // Add context from generation parameters
        subject: q.subject || params.subject,
        difficulty: q.difficulty || params.difficulty,
        curriculum: q.curriculum || params.curriculum,
        category: q.category || params.subject,

        // Ensure correct answer field consistency
        correctAnswer: q.correct_answer || q.answer || q.correctAnswer,
        expected_answer: q.expected_answer || q.correct_answer,

        // Ensure options array for multiple choice
        options: Array.isArray(q.options)
          ? q.options
          : q.type === "multiple_choice"
          ? ["Option A", "Option B", "Option C", "Option D"]
          : undefined,
      };

      return enhanced;
    });
  };

  /* =======================================================
     MAIN QUIZ GENERATION HANDLER
     ======================================================= */
  const handleGenerateQuiz = async () => {
    try {
      setError(null);
      setSuccess(null);

      // Validate topic first
      const topicError = validateTopic(quizParams.topic);
      if (topicError) {
        setError(topicError);
        return;
      }

      // Set loading state
      if (onLoadingChange) {
        onLoadingChange(true);
      } else {
        setInternalLoading(true);
      }

      console.group("🚀 Model-A Quiz Generation Started");
      console.log("Original params:", quizParams);

      // Normalize parameters for Model-A
      const normalizedParams = normalizeQuizParams(quizParams);
      console.log("Model-A normalized params:", normalizedParams);

      // Make API call with error boundary
      let response;
      try {
        response = await quizApi.generateQuiz(normalizedParams);
      } catch (apiError) {
        console.error("❌ API call failed:", apiError);
        throw new Error(
          apiError.response?.data?.message ||
            apiError.message ||
            "Failed to connect to quiz generation service. Please check your connection and try again."
        );
      }

      // Extract questions with Model-A patterns
      const questions = extractQuestionsFromResponse(response);

      // Validate extracted questions against Model-A schema
      const validQuestions = validateQuestions(questions);

      // ✅ CRITICAL FIX: Enhance questions for useQuizLogic compatibility
      const enhancedQuestions = enhanceQuestionsForQuizLogic(
        validQuestions,
        normalizedParams
      );

      console.log(
        `✅ Successfully processed ${enhancedQuestions.length} questions for useQuizLogic`
      );

      // Update recent topics
      setUserPresets((prev) => ({
        ...prev,
        recent: [
          {
            name: quizParams.topic,
            subject: quizParams.subject,
            timestamp: new Date().toISOString(),
          },
          ...prev.recent.filter((p) => p.name !== quizParams.topic).slice(0, 9),
        ],
      }));

      // Pass enhanced questions to parent component
      onQuizGenerated(enhancedQuestions);

      // Show success
      setSuccess(
        `Successfully generated ${enhancedQuestions.length} questions!`
      );

      console.groupEnd();
    } catch (err) {
      console.error("❌ Quiz generation failed:", err);

      const errorMessage =
        err.message || "Quiz generation failed. Please try again.";
      setError(errorMessage);

      // Don't show alert for validation errors, only for unexpected errors
      if (
        !err.message.includes("Topic") &&
        !err.message.includes("Generated questions")
      ) {
        alert(`Quiz generation failed: ${errorMessage}`);
      }
    } finally {
      // Clear loading state
      if (onLoadingChange) {
        onLoadingChange(false);
      } else {
        setInternalLoading(false);
      }
    }
  };

  /* =======================================================
     PRESET & QUICK ACTION HANDLERS
     ======================================================= */
  const handleQuickTopicSelect = (topic) => {
    setQuizParams((prev) => ({ ...prev, topic }));
    setError(null);
    setSuccess(null);
  };

  const handleUseSameSettings = () => {
    if (!quizParams.topic.trim()) {
      setError("Please enter a topic first");
      return;
    }
    handleGenerateQuiz();
  };

  const handleSavePreset = () => {
    const presetName = prompt("Enter a name for this preset:");
    if (presetName) {
      setUserPresets((prev) => ({
        ...prev,
        custom: [
          ...(prev.custom || []),
          {
            name: presetName,
            topic: quizParams.topic,
            subject: quizParams.subject,
            curriculum: quizParams.curriculum,
            question_type: quizParams.question_type,
            difficulty: quizParams.difficulty,
            num_questions: quizParams.num_questions,
          },
        ],
      }));
      setSuccess(`Preset "${presetName}" saved!`);
    }
  };

  const handleLoadPreset = (preset) => {
    setQuizParams(preset);
    setSuccess(`Loaded preset "${preset.name}"`);
  };

  /* =======================================================
     UI HELPERS
     ======================================================= */
  const getDifficultyHint = () => {
    const hints = {
      easy: "5-10 questions recommended",
      medium: "10-15 questions recommended",
      hard: "15-20 questions recommended",
      expert: "20+ questions recommended",
    };
    return hints[quizParams.difficulty] || "";
  };

  const getEstimatedTime = () => {
    const baseTime = quizParams.num_questions * 2; // 2 minutes per question
    const difficultyMultiplier = {
      easy: 0.8,
      medium: 1,
      hard: 1.5,
      expert: 2,
    };
    return Math.round(
      baseTime * (difficultyMultiplier[quizParams.difficulty] || 1)
    );
  };

  /* =======================================================
     RENDER COMPONENTS
     ======================================================= */
  const renderQuickActions = () => (
    <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
      <Tooltip title="Generate again with same settings">
        <IconButton
          onClick={handleUseSameSettings}
          disabled={isLoading || !quizParams.topic.trim()}
          size="small"
        >
          <Refresh />
        </IconButton>
      </Tooltip>

      <Tooltip title="Save current settings as preset">
        <IconButton
          onClick={handleSavePreset}
          disabled={isLoading}
          size="small"
        >
          <Save />
        </IconButton>
      </Tooltip>
    </Box>
  );

  const renderTopicField = () => (
    <Grid item xs={12}>
      <Autocomplete
        freeSolo
        options={topicSuggestions}
        getOptionLabel={(option) =>
          typeof option === "string" ? option : option.name
        }
        inputValue={quizParams.topic}
        onInputChange={(event, newValue) => {
          setQuizParams((prev) => ({ ...prev, topic: newValue }));
          setError(null);
        }}
        renderOption={(props, option, index) => {
          const { key, ...otherProps } = props;
          return (
            <li key={key} {...otherProps}>
              <Box>
                <Typography variant="body2">{option.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {option.subject}
                </Typography>
              </Box>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Quiz Topic"
            placeholder="Enter topic (e.g., Photosynthesis, World War II, Algebra)"
            error={!!error}
            helperText={
              error
                ? error
                : quizParams.topic.length > 0
                ? "💡 Be specific for better results"
                : "Enter a topic to generate quiz questions"
            }
          />
        )}
      />
    </Grid>
  );

  const renderAdvancedSettings = () => (
    <Grid item xs={12}>
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Lightbulb fontSize="small" />
            Advanced Settings
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Bloom's Taxonomy Level</InputLabel>
                <Select
                  multiple
                  label="Bloom's Taxonomy Level"
                  value={quizParams.bloom_level}
                  onChange={(e) =>
                    setQuizParams((prev) => ({
                      ...prev,
                      bloom_level: e.target.value,
                    }))
                  }
                  renderValue={(selected) => selected.join(", ")}
                >
                  {QUIZ_CONFIG.bloomLevels.map((level) => (
                    <MenuItem key={level} value={level}>
                      {level}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Time Limit Per Question</InputLabel>
                <Select
                  label="Time Limit Per Question"
                  value={quizParams.time_limit}
                  onChange={(e) =>
                    setQuizParams((prev) => ({
                      ...prev,
                      time_limit: e.target.value,
                    }))
                  }
                >
                  {QUIZ_CONFIG.timeLimits.map((limit) => (
                    <MenuItem key={limit.value} value={limit.value}>
                      {limit.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={quizParams.include_images}
                    onChange={(e) =>
                      setQuizParams((prev) => ({
                        ...prev,
                        include_images: e.target.checked,
                      }))
                    }
                  />
                }
                label="Include image-based questions (when available)"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Custom Tags (comma-separated)"
                placeholder="e.g., fundamental, application, critical-thinking"
                value={quizParams.tags.join(", ")}
                onChange={(e) =>
                  setQuizParams((prev) => ({
                    ...prev,
                    tags: e.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Grid>
  );

  const renderPresets = () => (
    <Grid item xs={12}>
      <QuickTopics
        onTopicSelect={handleQuickTopicSelect}
        disabled={isLoading}
        presets={userPresets}
        onLoadPreset={handleLoadPreset}
      />
    </Grid>
  );

  const renderGenerateButton = () => (
    <Grid item xs={12}>
      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={!isLoading && <Assignment />}
        onClick={handleGenerateQuiz}
        disabled={!quizParams.topic.trim() || isLoading}
        sx={{
          py: 1.5,
          fontSize: "1.1rem",
          fontWeight: "bold",
        }}
      >
        {isLoading ? (
          <>
            <CircularProgress size={24} color="inherit" sx={{ mr: 1 }} />
            Generating Quiz...
          </>
        ) : (
          "Generate Quiz"
        )}
      </Button>

      {!quizParams.topic.trim() && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, display: "block" }}
        >
          <ErrorIcon sx={{ fontSize: 16, verticalAlign: "middle", mr: 0.5 }} />
          Please enter a topic to generate a quiz
        </Typography>
      )}

      {quizParams.topic.trim() && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, display: "block" }}
        >
          ⏱️ Estimated time: {getEstimatedTime()} minutes •{" "}
          {getDifficultyHint()}
        </Typography>
      )}
    </Grid>
  );

  return (
    <Card sx={{ p: 3, mt: 3, position: "relative" }}>
      {/* Notifications */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{ width: "100%" }}
        >
          <ErrorIcon sx={{ mr: 1, verticalAlign: "middle" }} />
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!success}
        autoHideDuration={4000}
        onClose={() => setSuccess(null)}
      >
        <Alert
          severity="success"
          onClose={() => setSuccess(null)}
          sx={{ width: "100%" }}
        >
          {success}
        </Alert>
      </Snackbar>

      <Typography
        variant="h5"
        gutterBottom
        sx={{ display: "flex", alignItems: "center", gap: 1 }}
      >
        <Assignment /> Create Quiz
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Generate custom quizzes powered by AI. Fill in the topic and adjust
        parameters as needed.
      </Typography>

      {renderQuickActions()}

      <Grid container spacing={3}>
        {renderTopicField()}

        {/* Basic Settings */}
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth disabled={isLoading}>
            <InputLabel>Subject</InputLabel>
            <Select
              label="Subject"
              value={quizParams.subject}
              onChange={(e) =>
                setQuizParams((prev) => ({ ...prev, subject: e.target.value }))
              }
            >
              {QUIZ_CONFIG.subjects.map((subject) => (
                <MenuItem key={subject} value={subject}>
                  {subject}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth disabled={isLoading}>
            <InputLabel>Curriculum</InputLabel>
            <Select
              label="Curriculum"
              value={quizParams.curriculum}
              onChange={(e) =>
                setQuizParams((prev) => ({
                  ...prev,
                  curriculum: e.target.value,
                }))
              }
            >
              {QUIZ_CONFIG.curricula.map((curriculum) => (
                <MenuItem key={curriculum} value={curriculum}>
                  {curriculum}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={4}>
          <FormControl fullWidth disabled={isLoading}>
            <InputLabel>Question Type</InputLabel>
            <Select
              label="Question Type"
              value={quizParams.question_type}
              onChange={(e) =>
                setQuizParams((prev) => ({
                  ...prev,
                  question_type: e.target.value,
                }))
              }
            >
              {QUIZ_CONFIG.questionTypes.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={4}>
          <FormControl fullWidth disabled={isLoading}>
            <InputLabel>Difficulty</InputLabel>
            <Select
              label="Difficulty"
              value={quizParams.difficulty}
              onChange={(e) =>
                setQuizParams((prev) => ({
                  ...prev,
                  difficulty: e.target.value,
                }))
              }
            >
              {QUIZ_CONFIG.difficulties.map((diff) => (
                <MenuItem key={diff.value} value={diff.value}>
                  <Box>
                    <Typography>{diff.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {diff.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={4}>
          <FormControl fullWidth disabled={isLoading}>
            <InputLabel>Number of Questions</InputLabel>
            <Select
              label="Number of Questions"
              value={quizParams.num_questions}
              onChange={(e) =>
                setQuizParams((prev) => ({
                  ...prev,
                  num_questions: e.target.value,
                }))
              }
            >
              {[5, 10, 15, 20, 25, 35, 50].map((num) => (
                <MenuItem key={num} value={num}>
                  {num} Questions
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {renderAdvancedSettings()}
        {renderGenerateButton()}
        {renderPresets()}
      </Grid>

      {/* Debug info */}
      {process.env.NODE_ENV === "development" && (
        <Box sx={{ mt: 2, p: 1, bgcolor: "grey.100", borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Debug: {isLoading ? "🔄 Loading..." : "✅ Ready"} | Topic: "
            {quizParams.topic}"
          </Typography>
        </Box>
      )}
    </Card>
  );
};

/* ======================================================
   ENHANCED QUICK TOPICS COMPONENT
====================================================== */
const QuickTopics = ({
  onTopicSelect,
  disabled = false,
  presets,
  onLoadPreset,
}) => {
  const [activeTab, setActiveTab] = useState("quick");

  const tabs = [
    { id: "quick", label: "Quick Topics", data: presets.quick },
    { id: "recent", label: "Recent", data: presets.recent },
    { id: "custom", label: "My Presets", data: presets.custom || [] },
  ];

  const activeData = tabs.find((tab) => tab.id === activeTab)?.data || [];

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Quick Start
      </Typography>

      {/* Tab Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Box sx={{ display: "flex" }}>
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              sx={{
                minWidth: "auto",
                px: 2,
                py: 1,
                borderBottom: activeTab === tab.id ? 2 : 0,
                borderColor: "primary.main",
                borderRadius: 0,
                color: activeTab === tab.id ? "primary.main" : "text.secondary",
              }}
            >
              {tab.label} ({tab.data?.length || 0})
            </Button>
          ))}
        </Box>
      </Box>

      {/* Topics/Presets Grid */}
      {activeData.length > 0 ? (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {activeData.map((item, index) => (
            <Chip
              key={item.name + index}
              label={item.name}
              clickable
              onClick={() =>
                !disabled &&
                (activeTab === "custom" && onLoadPreset
                  ? onLoadPreset(item)
                  : onTopicSelect(item.name))
              }
              disabled={disabled}
              color={activeTab === "custom" ? "secondary" : "primary"}
              variant="outlined"
              size="small"
              title={
                activeTab === "custom"
                  ? `Preset: ${item.name}`
                  : `Subject: ${item.subject}`
              }
            />
          ))}
        </Box>
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontStyle: "italic" }}
        >
          {activeTab === "recent"
            ? "No recent topics yet"
            : activeTab === "custom"
            ? "No custom presets saved yet"
            : "No topics available"}
        </Typography>
      )}
    </Box>
  );
};

export default QuizControls;
