"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Task = {
  id: string;
  createdAt: string;
  title: string;
  description?: string;
  area:
    | "Infra"
    | "Backend"
    | "DevOps"
    | "Certificates"
    | "DNS"
    | "Monitoring"
    | "Research"
    | "Personal";
  type: "Ticket" | "Microtask" | "Investigation" | "Follow-up" | "Meeting";
  origin: "Jira" | "Slack" | "Meeting" | "Boss" | "Self";
  impact: 1 | 2 | 3 | 4 | 5;
  urgency: 1 | 2 | 3 | 4 | 5;
  effort: "5m" | "15m" | "30m" | "1h+" | "Research";
  deadline?: string;
  status: "Inbox" | "Doing" | "Waiting" | "Done";
};

type TaskForm = {
  title: string;
  description: string;
  area: Task["area"];
  type: Task["type"];
  origin: Task["origin"];
  impact: Task["impact"];
  urgency: Task["urgency"];
  effort: Task["effort"];
  deadline: string;
  status: Task["status"];
};

const STORAGE_KEY = "dexbrain.tasks";
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const defaultForm: TaskForm = {
  title: "",
  description: "",
  area: "Infra",
  type: "Ticket",
  origin: "Self",
  impact: 3,
  urgency: 3,
  effort: "15m",
  deadline: "",
  status: "Inbox",
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntilDeadline(deadline?: string): number | null {
  if (!deadline) return null;
  const target = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = startOfDay(new Date());
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / MS_PER_DAY);
}

function calculateScore(task: Task): number {
  if (task.status === "Done") return 0;
  let score = task.impact * 2 + task.urgency;
  const days = daysUntilDeadline(task.deadline);
  if (days !== null) {
    score += 1000 - days * 20;
  }
  if (task.status === "Waiting") {
    score -= 10;
  }
  return score;
}

function calculateLevel(score: number) {
  if (score >= 900) return "Critical";
  if (score >= 30) return "High";
  if (score >= 10) return "Medium";
  return "Low";
}

function levelClass(level: string) {
  // Return a small color used for the left priority indicator.
  switch (level) {
    case "Critical":
      return "bg-red-600";
    case "High":
      return "bg-orange-500";
    case "Medium":
      return "bg-yellow-500";
    default:
      return "bg-transparent";
  }
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(defaultForm);
  const [activeFilter, setActiveFilter] = useState<string>("All Tasks");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [areaFilter, setAreaFilter] = useState<string>("All");
  const [hideDone, setHideDone] = useState(false);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Task[];
      if (Array.isArray(parsed)) {
        setTasks(parsed);
      }
    } catch {
      // Ignore invalid storage data.
    }
  }, []);

  useEffect(() => {
    const updateTime = () => setCurrentDate(new Date().toLocaleString());
    updateTime();
    const interval = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // Note: task sorting now handled by filteredSortedTasks memo below

  const stats = useMemo(() => {
    const openTasks = tasks.filter((task) => task.status !== "Done");
    const criticalTasks = tasks.filter(
      (task) => calculateLevel(calculateScore(task)) === "Critical"
    );
    const waitingTasks = tasks.filter((task) => task.status === "Waiting");
    const deadlineSoon = tasks.filter((task) => {
      if (task.status === "Done") return false;
      const days = daysUntilDeadline(task.deadline);
      return days !== null && days >= 0 && days <= 7;
    });

    return {
      open: openTasks.length,
      critical: criticalTasks.length,
      soon: deadlineSoon.length,
      waiting: waitingTasks.length,
    };
  }, [tasks]);

  function openModal() {
    // Start create flow
    setEditingTask(null);
    setForm(defaultForm);
    setViewingTask(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingTask(null);
    setForm(defaultForm);
  }

  // Sync form with editingTask. If editingTask is null reset to defaults.
  useEffect(() => {
    if (editingTask) {
      setForm({
        title: editingTask.title,
        description: editingTask.description ?? "",
        area: editingTask.area,
        type: editingTask.type,
        origin: editingTask.origin,
        impact: editingTask.impact,
        urgency: editingTask.urgency,
        effort: editingTask.effort,
        deadline: editingTask.deadline ?? "",
        status: editingTask.status,
      });
      setIsModalOpen(true);
    } else {
      setForm(defaultForm);
    }
  }, [editingTask]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    if (editingTask) {
      // Edit existing task: preserve id and createdAt, replace other fields
      const updatedTasks = tasks.map((t) =>
        t.id === editingTask.id
          ? {
              ...t,
              title: form.title.trim(),
              description: form.description ? form.description : "",
              area: form.area,
              type: form.type,
              origin: form.origin,
              impact: form.impact,
              urgency: form.urgency,
              effort: form.effort,
              deadline: form.deadline ? form.deadline : undefined,
              status: form.status,
            }
          : t
      );

      setTasks(updatedTasks);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTasks));
      // Close and clear editing state
      setIsModalOpen(false);
      setEditingTask(null);
      setViewingTask(null);
    } else {
      const newTask: Task = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: form.title.trim(),
        description: form.description ? form.description : "",
        area: form.area,
        type: form.type,
        origin: form.origin,
        impact: form.impact,
        urgency: form.urgency,
        effort: form.effort,
        deadline: form.deadline ? form.deadline : undefined,
        status: form.status,
      };

      const nextTasks = [newTask, ...tasks];
      setTasks(nextTasks);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks));
      closeModal();
    }
  }

  // Inline status update
  function updateTaskStatus(id: string, status: Task["status"]) {
    const updated = tasks.map((t) => (t.id === id ? { ...t, status } : t));
    setTasks(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  // Delete flow
  function confirmDelete(id: string) {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  }

  function performDelete() {
    if (!deleteTargetId) return;
    const updated = tasks.filter((t) => t.id !== deleteTargetId);
    setTasks(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShowDeleteConfirm(false);
    setDeleteTargetId(null);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
    setAreaFilter("All");
    setActiveFilter("All Tasks");
    setHideDone(false);
    setSortBy(null);
    setSortDir("desc");
  }

  function toggleSort(key: string) {
    if (sortBy === key) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
      return;
    }
    setSortBy(key);
    setSortDir("desc");
  }

  function sortIndicator(key: string) {
    if (sortBy !== key) return "";
    return sortDir === "desc" ? "▾" : "▴";
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "n") {
        setEditingTask(null);
        setForm(defaultForm);
        setViewingTask(null);
        setIsModalOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        setIsModalOpen(false);
        setShowDeleteConfirm(false);
        setEditingTask(null);
        setViewingTask(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Filtering and sorting (memoized)
  const filteredSortedTasks = useMemo(() => {
    // Apply sidebar quick filters
    let list = tasks;

    // Active sidebar filters
    switch (activeFilter) {
      case "Quick Wins":
        list = list.filter((t) => t.effort === "5m" || t.effort === "15m");
        break;
      case "Critical":
        list = list.filter((t) => calculateLevel(calculateScore(t)) === "Critical");
        break;
      case "Due Soon":
        list = list.filter((t) => {
          const d = daysUntilDeadline(t.deadline);
          return d !== null && d <= 3 && d >= 0;
        });
        break;
      case "Waiting":
        list = list.filter((t) => t.status === "Waiting");
        break;
      case "Done":
        list = list.filter((t) => t.status === "Done");
        break;
      default:
        break;
    }

    if (hideDone) list = list.filter((t) => t.status !== "Done");

    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (areaFilter !== "All") list = list.filter((t) => t.area === areaFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q));
    }

    // Stable sort: attach original index
    const withIndex = list.map((t, i) => ({ t, i }));

    const comparator = (a: { t: Task; i: number }, b: { t: Task; i: number }) => {
      if (!sortBy) {
        // default: score desc
        const sa = calculateScore(a.t);
        const sb = calculateScore(b.t);
        if (sb !== sa) return sb - sa;
        return a.i - b.i;
      }

      let av: number | string | null = null;
      let bv: number | string | null = null;

      switch (sortBy) {
        case "title":
          av = a.t.title.toLowerCase();
          bv = b.t.title.toLowerCase();
          break;
        case "area":
          av = a.t.area;
          bv = b.t.area;
          break;
        case "type":
          av = a.t.type;
          bv = b.t.type;
          break;
        case "effort":
          av = a.t.effort;
          bv = b.t.effort;
          break;
        case "status":
          av = a.t.status;
          bv = b.t.status;
          break;
        case "impact":
          av = a.t.impact;
          bv = b.t.impact;
          break;
        case "urgency":
          av = a.t.urgency;
          bv = b.t.urgency;
          break;
        case "deadline":
          av = daysUntilDeadline(a.t.deadline) ?? Number.POSITIVE_INFINITY;
          bv = daysUntilDeadline(b.t.deadline) ?? Number.POSITIVE_INFINITY;
          break;
        case "daysLeft":
          av = daysUntilDeadline(a.t.deadline) ?? Number.POSITIVE_INFINITY;
          bv = daysUntilDeadline(b.t.deadline) ?? Number.POSITIVE_INFINITY;
          break;
        case "score":
          av = calculateScore(a.t);
          bv = calculateScore(b.t);
          break;
        default:
          av = calculateScore(a.t);
          bv = calculateScore(b.t);
      }

      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv);
        if (cmp === 0) return a.i - b.i;
        return sortDir === "asc" ? cmp : -cmp;
      }

      const na = typeof av === "number" ? av : Number(av ?? 0);
      const nb = typeof bv === "number" ? bv : Number(bv ?? 0);

      if (na === nb) return a.i - b.i;
      if (sortDir === "asc") return na - nb;
      return nb - na;
    };

    withIndex.sort(comparator);
    return withIndex.map((x) => x.t);
  }, [tasks, activeFilter, hideDone, statusFilter, areaFilter, search, sortBy, sortDir]);

  const insights = useMemo(() => {
    const top = [...tasks].sort((a, b) => calculateScore(b) - calculateScore(a)).slice(0, 3);
    const byArea: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let impactSum = 0;
    let urgencySum = 0;
    tasks.forEach((t) => {
      byArea[t.area] = (byArea[t.area] || 0) + 1;
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      impactSum += t.impact;
      urgencySum += t.urgency;
    });
    const avgImpact = tasks.length ? (impactSum / tasks.length).toFixed(1) : "-";
    const avgUrgency = tasks.length ? (urgencySum / tasks.length).toFixed(1) : "-";
    return { top, byArea, byStatus, avgImpact, avgUrgency };
  }, [tasks]);

  const viewingScore = viewingTask ? calculateScore(viewingTask) : 0;
  const viewingDaysLeft = viewingTask ? daysUntilDeadline(viewingTask.deadline) : null;
  const viewingCreatedAt = viewingTask ? new Date(viewingTask.createdAt).toLocaleString() : "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-7xl px-6 pb-8 pt-6">
        <div className="space-y-6">
          <header className="border-b border-slate-800 pb-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-lg font-semibold text-slate-100">Task Control Panel</div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Operational view
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Current Time</div>
                <div className="text-sm text-slate-200">{currentDate}</div>
              </div>
            </div>
          </header>

          <section className="overflow-x-auto">
            <div className="inline-flex min-w-max items-center divide-x divide-slate-800 rounded-sm border border-slate-800 bg-slate-900 px-2 py-2">
              <div className="px-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Open Tasks</div>
                <div className="text-lg font-semibold text-slate-100">{stats.open}</div>
              </div>
              <div className="px-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Critical</div>
                <div className="text-lg font-semibold text-slate-100">{stats.critical}</div>
              </div>
              <div className="px-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Due In 7 Days</div>
                <div className="text-lg font-semibold text-slate-100">{stats.soon}</div>
              </div>
              <div className="px-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Waiting</div>
                <div className="text-lg font-semibold text-slate-100">{stats.waiting}</div>
              </div>
            </div>
          </section>

          <section className="rounded-sm border border-slate-800 bg-slate-900 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
              <span className="mr-2 text-slate-500">Views</span>
              {["All Tasks", "Quick Wins", "Critical", "Due Soon", "Waiting", "Done"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveFilter(label)}
                  className={`h-7 rounded-sm border px-2 text-[10px] uppercase tracking-[0.2em] ${
                    activeFilter === label
                      ? "border-slate-800 bg-slate-800 text-slate-100"
                      : "border-slate-800 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Search
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title..."
                    className="h-8 w-52 rounded-sm border border-slate-800 bg-slate-950 px-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-slate-600 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-8 w-32 rounded-sm border border-slate-800 bg-slate-950 px-2 text-xs text-slate-100"
                  >
                    <option>All</option>
                    <option>Inbox</option>
                    <option>Doing</option>
                    <option>Waiting</option>
                    <option>Done</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Area
                  <select
                    value={areaFilter}
                    onChange={(e) => setAreaFilter(e.target.value)}
                    className="h-8 w-40 rounded-sm border border-slate-800 bg-slate-950 px-2 text-xs text-slate-100"
                  >
                    <option>All</option>
                    <option>Infra</option>
                    <option>Backend</option>
                    <option>DevOps</option>
                    <option>Certificates</option>
                    <option>DNS</option>
                    <option>Monitoring</option>
                    <option>Research</option>
                    <option>Personal</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  <input
                    type="checkbox"
                    checked={hideDone}
                    onChange={(e) => setHideDone(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm border border-slate-800 bg-slate-950 text-blue-500"
                  />
                  Hide Done
                </label>
                <button
                  onClick={clearFilters}
                  className="h-8 rounded-sm border border-slate-800 bg-slate-900 px-3 text-[11px] uppercase tracking-[0.2em] text-slate-300 hover:bg-slate-800"
                >
                  Clear Filters
                </button>
                <button
                  onClick={() => setShowInsights((s) => !s)}
                  className="h-8 rounded-sm border border-slate-800 bg-slate-900 px-3 text-[11px] uppercase tracking-[0.2em] text-slate-300 hover:bg-slate-800"
                >
                  Insights
                </button>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-sm border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-[12px] leading-5">
              <thead className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="w-1 px-2 py-2" />
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("title")}
                      className="flex items-center gap-1"
                    >
                      Title <span>{sortIndicator("title")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("area")}
                      className="flex items-center gap-1"
                    >
                      Area <span>{sortIndicator("area")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("type")}
                      className="flex items-center gap-1"
                    >
                      Type <span>{sortIndicator("type")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("impact")}
                      className="flex items-center gap-1"
                    >
                      Impact <span>{sortIndicator("impact")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("urgency")}
                      className="flex items-center gap-1"
                    >
                      Urgency <span>{sortIndicator("urgency")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("effort")}
                      className="flex items-center gap-1"
                    >
                      Effort <span>{sortIndicator("effort")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("deadline")}
                      className="flex items-center gap-1"
                    >
                      Deadline <span>{sortIndicator("deadline")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("daysLeft")}
                      className="flex items-center gap-1"
                    >
                      Days Left <span>{sortIndicator("daysLeft")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleSort("status")}
                      className="flex items-center gap-1"
                    >
                      Status <span>{sortIndicator("status")}</span>
                    </button>
                  </th>
                  <th className="px-3 py-2">Actions</th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("score")}
                      className="ml-auto flex items-center gap-1"
                    >
                      Score <span>{sortIndicator("score")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-8 text-center text-sm text-slate-400">
                      No tasks yet. Add your first task to get started.
                    </td>
                  </tr>
                ) : filteredSortedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-6 py-8 text-center text-sm text-slate-400">
                      No tasks match current filters.
                    </td>
                  </tr>
                ) : (
                  filteredSortedTasks.map((task) => {
                    const score = calculateScore(task);
                    const level = calculateLevel(score);
                    const daysLeft = daysUntilDeadline(task.deadline);
                    const isUrgent = daysLeft !== null && daysLeft <= 2;
                    const isDone = task.status === "Done";

                    return (
                      <tr
                        key={task.id}
                        onClick={() => {
                          setViewingTask(task);
                        }}
                        className={`group cursor-pointer transition-colors hover:bg-slate-800/60 ${
                          isDone ? "opacity-60" : ""
                        }`}
                      >
                        <td className="w-1 px-0 py-2">
                          <div className={`h-6 w-1 ${levelClass(level)}`} />
                        </td>
                        <td className="px-3 py-2 text-slate-100">
                          <div className="max-w-[320px] break-words">
                            <span className={isDone ? "line-through" : ""}>{task.title}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{task.area}</td>
                        <td className="px-3 py-2 text-slate-300">{task.type}</td>
                        <td className="px-3 py-2 text-slate-300">{task.impact}</td>
                        <td className="px-3 py-2 text-slate-300">{task.urgency}</td>
                        <td className="px-3 py-2 text-slate-300">{task.effort}</td>
                        <td className="px-3 py-2 text-slate-300">{task.deadline ? task.deadline : "—"}</td>
                        <td
                          className={`px-3 py-2 ${
                            daysLeft === null
                              ? "text-slate-500"
                              : isUrgent
                                ? "text-red-400"
                                : "text-slate-300"
                          }`}
                        >
                          {daysLeft === null ? "—" : daysLeft}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">
                            {task.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingTask(null);
                                setEditingTask(task);
                              }}
                              title="Edit"
                              aria-label="Edit task"
                              className="text-slate-300 hover:text-slate-100"
                            >
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M4 13.5V16h2.5L16 6.5 13.5 4 4 13.5Z" />
                                <path d="M12 5l3 3" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(task.id);
                              }}
                              title="Delete"
                              aria-label="Delete task"
                              className="text-red-400 hover:text-red-300"
                            >
                              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M6 6h8" />
                                <path d="M8 6V4h4v2" />
                                <path d="M7 6v9" />
                                <path d="M13 6v9" />
                                <path d="M5 6l1 11h8l1-11" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-100 font-semibold">{score}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {showInsights && (
          <section className="mt-8 rounded-sm border border-slate-800 bg-slate-900 px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100">Insights</div>
              <button
                type="button"
                onClick={() => setShowInsights(false)}
                className="text-[10px] uppercase tracking-[0.2em] text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">Top 3 Tasks</div>
            <ol className="mb-4 list-decimal list-inside text-sm text-slate-200">
              {insights.top.map((t) => (
                <li key={t.id} className="mb-1">
                  {t.title} <span className="text-slate-400">({calculateScore(t)})</span>
                </li>
              ))}
            </ol>
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">Tasks by Area</div>
            <ul className="mb-4 text-sm text-slate-200">
              {Object.entries(insights.byArea).map(([k, v]) => (
                <li key={k} className="text-slate-200">
                  {k}: <span className="text-slate-400">{v}</span>
                </li>
              ))}
            </ul>
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">Tasks by Status</div>
            <ul className="mb-4 text-sm text-slate-200">
              {Object.entries(insights.byStatus).map(([k, v]) => (
                <li key={k} className="text-slate-200">
                  {k}: <span className="text-slate-400">{v}</span>
                </li>
              ))}
            </ul>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Averages</div>
            <div className="mt-1 text-sm text-slate-300">
              Impact: <span className="text-slate-100">{insights.avgImpact}</span>
            </div>
            <div className="text-sm text-slate-300">
              Urgency: <span className="text-slate-100">{insights.avgUrgency}</span>
            </div>
          </section>
        )}
      </div>

      <button
        type="button"
        onClick={openModal}
        className="fixed bottom-6 right-6 rounded-sm bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
      >
        + Add Task
      </button>

      {viewingTask && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-sm border border-slate-800 bg-slate-900 shadow-xl animate-[fade-in_150ms_ease-out]">
            <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-100">{viewingTask.title}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  Task Overview
                </div>
              </div>
              <span className="rounded-sm border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                {viewingTask.status}
              </span>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Area</div>
                    <div className="text-sm text-slate-200">{viewingTask.area}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Type</div>
                    <div className="text-sm text-slate-200">{viewingTask.type}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Impact</div>
                    <div className="text-sm text-slate-200">{viewingTask.impact}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Urgency</div>
                    <div className="text-sm text-slate-200">{viewingTask.urgency}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Effort</div>
                    <div className="text-sm text-slate-200">{viewingTask.effort}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Deadline</div>
                    <div className="text-sm text-slate-200">
                      {viewingTask.deadline ? viewingTask.deadline : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Days Left</div>
                    <div className="text-sm text-slate-200">
                      {viewingDaysLeft === null ? "—" : viewingDaysLeft}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Score</div>
                    <div className="text-sm text-slate-200">{viewingScore}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Created</div>
                    <div className="text-sm text-slate-200">{viewingCreatedAt}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-800 pt-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Description</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                  {viewingTask.description?.trim()
                    ? viewingTask.description
                    : "No description provided."}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                className="h-8 rounded-sm border border-slate-800 bg-transparent px-3 text-xs uppercase tracking-[0.2em] text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewingTask(null);
                  setEditingTask(viewingTask);
                }}
                className="h-8 rounded-sm border border-slate-800 bg-slate-800 px-3 text-xs uppercase tracking-[0.2em] text-slate-100 hover:bg-slate-700"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-sm border border-slate-800 bg-slate-900 shadow-xl animate-[fade-in_150ms_ease-out]">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-100">
              Confirm Delete
            </div>
            <div className="px-4 py-4 text-sm text-slate-300">
              This will permanently remove the selected task.
            </div>
            <div className="flex items-center justify-end gap-2 px-4 pb-4">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTargetId(null);
                }}
                className="h-8 rounded-sm border border-slate-800 bg-transparent px-3 text-xs uppercase tracking-[0.2em] text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                className="h-8 rounded-sm bg-red-600 px-3 text-xs uppercase tracking-[0.2em] text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-sm border border-slate-800 bg-slate-900 shadow-xl animate-[fade-in_150ms_ease-out]">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-100">
                {editingTask ? "Edit Task" : "Add Task"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="h-7 rounded-sm border border-slate-800 px-3 text-[11px] uppercase tracking-[0.2em] text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <form className="flex flex-col gap-3 px-4 py-4" onSubmit={handleSubmit}>
              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Title
                <input
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-600 focus:outline-none"
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Description
                <textarea
                  className="mt-1 min-h-[100px] w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-600 focus:outline-none"
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Area
                <select
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.area}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      area: event.target.value as Task["area"],
                    }))
                  }
                >
                  <option>Infra</option>
                  <option>Backend</option>
                  <option>DevOps</option>
                  <option>Certificates</option>
                  <option>DNS</option>
                  <option>Monitoring</option>
                  <option>Research</option>
                  <option>Personal</option>
                </select>
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Type
                <select
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.type}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      type: event.target.value as Task["type"],
                    }))
                  }
                >
                  <option>Ticket</option>
                  <option>Microtask</option>
                  <option>Investigation</option>
                  <option>Follow-up</option>
                  <option>Meeting</option>
                </select>
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Origin
                <select
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.origin}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      origin: event.target.value as Task["origin"],
                    }))
                  }
                >
                  <option>Jira</option>
                  <option>Slack</option>
                  <option>Meeting</option>
                  <option>Boss</option>
                  <option>Self</option>
                </select>
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Effort
                <select
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.effort}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      effort: event.target.value as Task["effort"],
                    }))
                  }
                >
                  <option>5m</option>
                  <option>15m</option>
                  <option>30m</option>
                  <option>1h+</option>
                  <option>Research</option>
                </select>
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Impact
                <select
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.impact}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      impact: Number(event.target.value) as Task["impact"],
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Urgency
                <select
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.urgency}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      urgency: Number(event.target.value) as Task["urgency"],
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Deadline
                <input
                  type="date"
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.deadline}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      deadline: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Status
                <select
                  className="mt-1 w-full rounded-sm border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      status: event.target.value as Task["status"],
                    }))
                  }
                >
                  <option>Inbox</option>
                  <option>Doing</option>
                  <option>Waiting</option>
                  <option>Done</option>
                </select>
              </label>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="submit"
                  className="h-8 rounded-sm bg-blue-600 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-blue-500"
                >
                  {editingTask ? "Save Changes" : "Create Task"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    // Cancel editing/creating: close modal and reset editingTask
                    setIsModalOpen(false);
                    setEditingTask(null);
                  }}
                  className="h-8 rounded-sm border border-slate-800 bg-transparent px-3 text-xs uppercase tracking-[0.2em] text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
