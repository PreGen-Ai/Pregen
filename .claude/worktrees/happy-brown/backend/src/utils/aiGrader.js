/**
 * Simple AI grader stub. In a real implementation this would call
 * an external AI service or run a model to score answers.
 *
 * @param {string} answers - The student's submission text.
 * @returns {number} A score between 0 and 100.
 */
exports.grade = async (answers) => {
  // For demonstration, the score is proportional to answer length.
  if (!answers || typeof answers !== "string") {
    return 0;
  }
  // Score based on number of characters, capped at 100.
  const lengthScore = Math.min(answers.length, 100);
  // Add a small random component
  const randomBonus = Math.floor(Math.random() * 10);
  return Math.min(lengthScore + randomBonus, 100);
};
