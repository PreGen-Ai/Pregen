import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import {
  Button,
  DataTable,
  DropdownMenu,
  PageHeader,
  Tabs,
  Toolbar,
} from "../components/ui";
import { FiEye, FiFilter } from "react-icons/fi";

function formatDate(value, fallback = "No date") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function formatGrade(value) {
  if (value === null || value === undefined || value === "") return "Not graded";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(0)}%` : "Not graded";
}

export default function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("announcements");
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [gradeRows, setGradeRows] = useState([]);
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      try {
        const [announcementsRes, coursesRes, gradebookRes, assignmentsRes] =
          await Promise.all([
            api.announcements.list(),
            api.courses.getAllCourses({ limit: 20 }),
            api.gradebook.list(),
            api.students.listAssignments({ limit: 100 }),
          ]);

        const courseItems = Array.isArray(coursesRes?.courses)
          ? coursesRes.courses
          : Array.isArray(coursesRes?.items)
            ? coursesRes.items
            : Array.isArray(coursesRes)
              ? coursesRes
              : [];

        const lessonResponses = await Promise.allSettled(
          courseItems.slice(0, 8).map((course) => api.lessons.listCourseLessons(course._id)),
        );

        const nextLessons = lessonResponses.flatMap((result, index) => {
          if (result.status !== "fulfilled") return [];
          const course = courseItems[index];
          return (result.value?.modules || []).flatMap((module) =>
            (module.items || []).map((item) => ({
              id: item._id,
              subjectName: item.title || "Lesson item",
              startingDate: item.createdAt || module.createdAt || course?.createdAt,
              dueDate: "",
              type: item.contentType || "Lesson",
              grade: "-",
            })),
          );
        });

        if (!live) return;
        setAnnouncements(announcementsRes?.items || announcementsRes || []);
        setLessons(nextLessons);
        setGradeRows(gradebookRes?.items || []);
        setAssignments(assignmentsRes?.data || []);
      } catch (error) {
        if (live) toast.error(error?.message || "Failed to load history");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const rows = useMemo(() => {
    const assignmentById = new Map(assignments.map((item) => [String(item._id), item]));
    const grades = gradeRows.map((item) => {
      const assignment = assignmentById.get(String(item.assignmentId || item.sourceId));
      return {
        id: item._id || item.sourceId,
        subjectName: item.courseTitle || item.title || assignment?.title || "Graded work",
        startingDate: item.createdAt || item.submittedAt || assignment?.createdAt,
        dueDate: item.dueDate || assignment?.dueDate,
        type: item.kind === "quiz" ? "Quiz" : "Assignment",
        grade: formatGrade(item.score),
      };
    });

    if (tab === "grades") return grades;
    if (tab === "lessons") return lessons;

    return announcements.map((item) => ({
      id: item._id,
      subjectName: item.title || "Announcement",
      startingDate: item.publishedAt || item.createdAt,
      dueDate: item.expiresAt || "",
      type: item.category || item.scope || "Announcement",
      grade: "-",
    }));
  }, [announcements, assignments, gradeRows, lessons, tab]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (!query) return true;
        return [row.subjectName, row.type, row.grade].join(" ").toLowerCase().includes(query);
      })
      .filter((row) => {
        if (!dateFilter || !row.startingDate) return true;
        return new Date(row.startingDate).toISOString().slice(0, 10) === dateFilter;
      });
  }, [dateFilter, rows, search]);

  return (
    <div className="quizzes-page">
      <PageHeader
        backTo="/dashboard/assignments"
        title="History"
        subtitle="Find your work, recent lessons, and activities where you left off."
      />

      <Toolbar
        dateValue={dateFilter}
        onDateChange={setDateFilter}
        searchValue={search}
        onSearchChange={setSearch}
        right={
          <Button variant="secondary" onClick={() => toast.info("Search and date filters are active.")}>
            <FiFilter />
            Filters
          </Button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "announcements", label: "Announcements" },
          { value: "lessons", label: "Lesson no." },
          { value: "grades", label: "Grades" },
        ]}
      />

      <DataTable
        loading={loading}
        rows={filteredRows}
        itemLabel={tab}
        emptyMessage="No history items found."
        getRowKey={(row) => row.id}
        columns={[
          { key: "subjectName", header: "Subject Name" },
          { key: "startingDate", header: "Starting date", render: (row) => formatDate(row.startingDate) },
          { key: "dueDate", header: "Due Date", render: (row) => formatDate(row.dueDate, "No due date") },
          { key: "type", header: "Type" },
          { key: "grade", header: "Grade" },
          {
            key: "actions",
            header: "Actions",
            width: 72,
            render: () => (
              <DropdownMenu
                items={[
                  {
                    label: "View details",
                    icon: <FiEye />,
                    onClick: () => toast.info("Open the source page for full details."),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
