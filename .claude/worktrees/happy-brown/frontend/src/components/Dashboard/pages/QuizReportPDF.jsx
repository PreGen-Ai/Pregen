import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

// ------------------------
// Styles
// ------------------------
const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    padding: 30,
    fontSize: 12,
    lineHeight: 1.4,
    fontFamily: "Helvetica",
  },

  // Cover Page
  coverContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    marginTop: 40,
  },
  coverLogo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  coverImage: {
    width: "100%",
    height: 180,
    marginTop: 25,
    borderRadius: 6,
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#2c3e50",
  },
  coverSubtitle: {
    fontSize: 16,
    color: "#34495e",
    marginBottom: 20,
  },
  coverMeta: {
    marginTop: 15,
    fontSize: 12,
    color: "#7f8c8d",
  },

  // Header (Page 2)
  pageHeader: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#2c3e50",
    paddingBottom: 10,
  },
  logoTopLeft: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 40,
    height: 40,
  },

  // Score Section
  scoreSection: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e9ecef",
    marginVertical: 20,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
  },
  performanceMessage: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 5,
    textAlign: "center",
    color: "#27ae60",
  },

  // Question Blocks
  questionBlock: {
    padding: 12,
    marginVertical: 10,
    backgroundColor: "#f8fafc",
    borderLeftWidth: 4,
    borderLeftColor: "#3498db",
    borderRadius: 4,
  },
  correctBorder: {
    borderLeftColor: "#27ae60",
  },
  incorrectBorder: {
    borderLeftColor: "#e74c3c",
  },
  questionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  questionType: {
    fontSize: 10,
    backgroundColor: "#ecf0f1",
    padding: 3,
    borderRadius: 3,
  },
  answerSection: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#e9ecef",
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
  },
  label: { fontWeight: "bold" },
  wrong: { color: "#e74c3c", fontWeight: "bold" },
  correct: { color: "#27ae60", fontWeight: "bold" },

  explanationBlock: {
    marginTop: 8,
    backgroundColor: "#e8f4fd",
    borderLeftWidth: 3,
    borderLeftColor: "#3498db",
    padding: 8,
    borderRadius: 4,
  },
  feedbackBlock: {
    marginTop: 8,
    backgroundColor: "#fff3cd",
    borderLeftWidth: 3,
    borderLeftColor: "#ffc107",
    padding: 8,
    borderRadius: 4,
  },

  footer: {
    marginTop: 30,
    textAlign: "center",
    fontSize: 10,
    color: "#95a5a6",
  },
});

// ------------------------
// Component
// ------------------------
const QuizReportPDF = ({ reportData }) => {
  const {
    title,
    student_name,
    topic,
    subject,
    curriculum,
    grade_level,
    difficulty,
    score,
    total_questions,
    correct_answers,
    time_spent,
    date_generated,
    questions,
    performance_message,
    overall_feedback,
  } = reportData;

  return (
    <Document>
      {/* ===================================== */}
      {/*  COVER PAGE */}
      {/* ===================================== */}
      <Page size="A4" style={styles.page}>
        <View style={styles.coverContainer}>
          <Image style={styles.coverLogo} src="/assets/logo.jpg" />
          <Text style={styles.coverTitle}>{title}</Text>
          <Text style={styles.coverSubtitle}>
            {topic} — {subject}
          </Text>

          <Image style={styles.coverImage} src="/assets/chat.png" />

          <Text style={styles.coverMeta}>Curriculum: {curriculum}</Text>
          <Text style={styles.coverMeta}>Grade Level: {grade_level}</Text>
          <Text style={styles.coverMeta}>Difficulty: {difficulty}</Text>
          <Text style={styles.coverMeta}>Generated On: {date_generated}</Text>
        </View>
      </Page>

      {/* ===================================== */}
      {/*  REPORT PAGE */}
      {/* ===================================== */}
      <Page size="A4" style={styles.page} wrap>
        {/* Logo Top Left */}
        <Image style={styles.logoTopLeft} src="/assets/logo.jpg" />

        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={{ fontSize: 20, fontWeight: "bold" }}>
            Quiz Performance Report
          </Text>
          <Text>
            Student: {student_name} | Time Spent: {time_spent}
          </Text>
        </View>

        {/* Score */}
        <View style={styles.scoreSection}>
          <Text style={styles.scoreValue}>{score}%</Text>
          <Text style={styles.performanceMessage}>{performance_message}</Text>
          <Text>
            Correct Answers: {correct_answers}/{total_questions}
          </Text>
          {overall_feedback && (
            <Text style={{ marginTop: 8, textAlign: "center" }}>
              {overall_feedback}
            </Text>
          )}
        </View>

        {/* Questions Breakdown */}
        <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 10 }}>
          Question Breakdown
        </Text>

        {questions.map((q, idx) => (
          <View
            key={q.id}
            style={[
              styles.questionBlock,
              q.isCorrect ? styles.correctBorder : styles.incorrectBorder,
            ]}
            wrap={false}
          >
            <View style={styles.questionHeader}>
              <Text style={{ fontWeight: "bold" }}>Question {idx + 1}</Text>
              <Text style={styles.questionType}>
                {q.isCorrect ? "✓ Correct" : "✗ Incorrect"}
              </Text>
            </View>

            <Text>{q.question}</Text>

            {/* Answers */}
            <View style={styles.answerSection}>
              <Text>
                <Text style={styles.label}>Your Answer: </Text>
                <Text style={!q.isCorrect ? styles.wrong : {}}>
                  {q.userAnswer}
                </Text>
              </Text>

              {!q.isCorrect && q.type !== "essay" && (
                <Text>
                  <Text style={styles.label}>Correct Answer: </Text>
                  <Text style={styles.correct}>{q.correctAnswer}</Text>
                </Text>
              )}
            </View>

            {/* Feedback */}
            {q.feedback && (
              <View style={styles.feedbackBlock}>
                <Text>
                  <Text style={{ fontWeight: "bold" }}>AI Feedback: </Text>
                  {q.feedback}
                </Text>
              </View>
            )}

            {/* Explanation */}
            {(q.enhanced_explanation || q.explanation) && (
              <View style={styles.explanationBlock}>
                <Text>
                  <Text style={{ fontWeight: "bold" }}>Explanation: </Text>
                  {q.enhanced_explanation || q.explanation}
                </Text>
              </View>
            )}
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Generated by AI Quiz Generator • {date_generated}</Text>
        </View>
      </Page>
    </Document>
  );
};

export default QuizReportPDF;
