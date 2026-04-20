import {
  getPracticeEntityId,
  mergePractices,
  upsertPractices,
} from "../../components/Dashboard/pages/practiceLab.helpers";

describe("PracticeLab helpers", () => {
  test("dedupes stored and API practices by canonical _id", () => {
    const storedPractices = [
      {
        id: "practice_123",
        title: "Local copy",
        generated_at: "2026-04-20T10:00:00.000Z",
      },
    ];
    const apiPractices = [
      {
        _id: "practice_123",
        title: "Server copy",
        generated_at: "2026-04-20T11:00:00.000Z",
      },
    ];

    const merged = mergePractices(apiPractices, storedPractices);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("practice_123");
    expect(merged[0]._id).toBe("practice_123");
    expect(merged[0].title).toBe("Server copy");
  });

  test("adds a newly generated practice exactly once and keeps reloads stable", () => {
    const existingPractices = [
      {
        _id: "practice_a",
        id: "practice_a",
        title: "Existing practice",
        generated_at: "2026-04-20T09:00:00.000Z",
      },
    ];
    const newPractice = {
      _id: "practice_b",
      title: "New practice",
      generated_at: "2026-04-20T12:00:00.000Z",
    };

    const afterGenerate = upsertPractices(existingPractices, newPractice);
    const afterReload = mergePractices(
      [
        { _id: "practice_a", title: "Existing practice", generated_at: "2026-04-20T09:00:00.000Z" },
        { _id: "practice_b", title: "New practice", generated_at: "2026-04-20T12:00:00.000Z" },
      ],
      afterGenerate,
    );

    expect(afterGenerate).toHaveLength(2);
    expect(afterReload).toHaveLength(2);
    expect(
      afterReload.filter(
        (practice) => getPracticeEntityId(practice) === "practice_b",
      ),
    ).toHaveLength(1);
  });
});
