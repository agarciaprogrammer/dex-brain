"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  createdAt: string;
  title: string;
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
  const [form, setForm] = useState<TaskForm>(defaultForm);

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

  const sortedTasks = useMemo(() => {
    return [...tasks].sort(
      (a, b) => calculateScore(b) - calculateScore(a)
    );
  }, [tasks]);

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
    } else {
      const newTask: Task = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: form.title.trim(),
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

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-6 text-slate-100">
      <main className="mx-auto w-full max-w-7xl flex flex-col gap-4 pb-16">
        <section className="w-full border-b border-slate-800 bg-slate-900/50 py-3 px-4 text-sm">
          <div className="max-w-7xl mx-auto flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Open Tasks
                </div>
                <div className="text-lg font-semibold text-white">{stats.open}</div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Critical
                </div>
                <div className="text-lg font-semibold text-white">{stats.critical}</div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Due In 7 Days
                </div>
                <div className="text-lg font-semibold text-white">{stats.soon}</div>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Waiting
                </div>
                <div className="text-lg font-semibold text-white">{stats.waiting}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-700 rounded-md">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400 sticky top-0">
                <tr>
                  <th className="w-1 px-2 py-2" />
                  <th className="px-2 py-2">Title</th>
                  <th className="px-3 py-2">Area</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Impact</th>
                  <th className="px-3 py-2">Urgency</th>
                  <th className="px-3 py-2">Effort</th>
                  <th className="px-3 py-2">Deadline</th>
                  <th className="px-3 py-2">Days Left</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sortedTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-6 py-8 text-center text-sm text-slate-400"
                    >
                      No tasks yet. Add your first task.
                    </td>
                  </tr>
                ) : (
                  sortedTasks.map((task) => {
                    const score = calculateScore(task);
                    const level = calculateLevel(score);
                    const daysLeft = daysUntilDeadline(task.deadline);
                    const isUrgent = daysLeft !== null && daysLeft <= 2;
                    const isDone = task.status === "Done";

                    return (
                      <tr
                        key={task.id}
                        onClick={() => {
                          setEditingTask(task);
                        }}
                        className={`${isDone ? "opacity-60" : ""} transition duration-150 hover:bg-slate-800 cursor-pointer`}
                      >
                        <td className="w-1 px-0 py-2">
                          <div className={`w-1 h-6 rounded-sm ${levelClass(level)}`} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="max-w-[260px] break-words">
                            <span className={isDone ? "line-through" : ""}>
                              {task.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{task.area}</td>
                        <td className="px-3 py-2 text-slate-300">{task.type}</td>
                        <td className="px-3 py-2 text-slate-300">{task.impact}</td>
                        <td className="px-3 py-2 text-slate-300">{task.urgency}</td>
                        <td className="px-3 py-2 text-slate-300">{task.effort}</td>
                        <td className="px-3 py-2 text-slate-300">{task.deadline ? task.deadline : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={isUrgent ? "text-yellow-400" : "text-slate-300"}>
                            {daysLeft === null ? "—" : daysLeft}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-200 font-medium">{task.status}</td>
                        <td className="px-3 py-2 text-center text-slate-200">{score}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <button
        type="button"
        onClick={openModal}
        className="fixed bottom-6 right-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
      >
        + Add Task
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-md border border-slate-700 bg-slate-900 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">{editingTask ? "Edit Task" : "Add Task"}</h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              <label className="text-xs font-medium text-slate-300">
                Title
                <input
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
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

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-300">
                  Area
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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

                <label className="text-xs font-medium text-slate-300">
                  Type
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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

                <label className="text-xs font-medium text-slate-300">
                  Origin
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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

                <label className="text-xs font-medium text-slate-300">
                  Effort
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-300">
                  Impact
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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

                <label className="text-xs font-medium text-slate-300">
                  Urgency
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-300">
                  Deadline
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={form.deadline}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        deadline: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="text-xs font-medium text-slate-300">
                  Status
                  <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
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
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-500"
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
                  className="rounded-md border border-slate-600 bg-transparent px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
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
