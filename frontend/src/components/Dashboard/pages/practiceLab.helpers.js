export const getPracticeEntityId = (practice, fallbackKey = "") => {
  if (!practice || typeof practice !== "object") {
    return fallbackKey ? String(fallbackKey) : "";
  }

  const rawId =
    practice._id ||
    practice.id ||
    practice.report_id ||
    fallbackKey ||
    "";

  return rawId ? String(rawId) : "";
};

const normalizePracticeRecord = (practice, fallbackKey = "") => {
  if (!practice || typeof practice !== "object") return null;

  const canonicalId = getPracticeEntityId(practice, fallbackKey);
  if (!canonicalId) return { ...practice };

  return {
    ...practice,
    _id: practice._id || canonicalId,
    id: practice.id || practice._id || canonicalId,
  };
};

export const mergePractices = (apiPractices = [], storedPractices = []) => {
  const merged = new Map();

  [...storedPractices, ...apiPractices].forEach((practice, index) => {
    if (!practice || typeof practice !== "object") return;

    const fallbackKey = `${practice.topic || "practice"}-${practice.generated_at || index}`;
    const normalizedPractice = normalizePracticeRecord(practice, fallbackKey);
    const key = getPracticeEntityId(normalizedPractice, fallbackKey);

    merged.set(key, {
      ...(merged.get(key) || {}),
      ...normalizedPractice,
    });
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = new Date(a?.generated_at || 0).getTime();
    const bTime = new Date(b?.generated_at || 0).getTime();
    return bTime - aTime;
  });
};

export const upsertPractices = (existingPractices = [], nextPractice) => {
  const nextPractices = Array.isArray(nextPractice)
    ? nextPractice
    : nextPractice
      ? [nextPractice]
      : [];

  return mergePractices(nextPractices, existingPractices);
};
