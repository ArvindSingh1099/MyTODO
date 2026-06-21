(function () {
  "use strict";

  var storageKey = "aiDailyManagerState";
  var defaultMessage =
    "Review my day honestly. Tell me what I did right, where I was lazy, and create tomorrow's plan.";

  var state = {
    tasks: [],
    theme: "light",
    filter: "all",
    activeWeekStart: "",
    sidebarCollapsed: false,
    taskInput: "",
    summary: "",
    history: []
  };

  var editingTaskId = null;
  var toastTimer = null;

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    loadState();
    bindEvents();
    applyTheme();
    render();
  }

  function cacheElements() {
    els.shell = document.querySelector(".app-shell");
    els.weekBoard = document.getElementById("weekBoard");
    els.progressText = document.getElementById("progressText");
    els.progressFill = document.getElementById("progressFill");
    els.sidebarToggle = document.getElementById("sidebarToggle");
    els.sidebarClose = document.getElementById("sidebarClose");
    els.taskInput = document.getElementById("taskInput");
    els.summaryOutput = document.getElementById("summaryOutput");
    els.historyList = document.getElementById("historyList");
    els.toast = document.getElementById("toast");
    els.noteModal = document.getElementById("noteModal");
    els.noteCategory = document.getElementById("noteCategory");
    els.noteTitle = document.getElementById("noteTitle");
    els.noteText = document.getElementById("noteText");
    els.closeNoteBtn = document.getElementById("closeNoteBtn");
    els.cancelNoteBtn = document.getElementById("cancelNoteBtn");
    els.saveNoteBtn = document.getElementById("saveNoteBtn");
  }

  function bindEvents() {
    document.getElementById("loadJsonBtn").addEventListener("click", loadJsonTasks);
    document.getElementById("loadMarkdownBtn").addEventListener("click", loadMarkdownTasks);
    document.getElementById("generateSummaryBtn").addEventListener("click", generateSummary);
    document.getElementById("copySummaryBtn").addEventListener("click", copySummary);
    document.getElementById("clearTodayBtn").addEventListener("click", clearCurrentDay);
    document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);
    document.getElementById("downloadJsonBtn").addEventListener("click", downloadSummary);
    document.getElementById("resetWeekBtn").addEventListener("click", resetWeek);
    document.getElementById("prevWeekBtn").addEventListener("click", function () {
      shiftWeek(-7);
    });
    document.getElementById("todayWeekBtn").addEventListener("click", function () {
      state.activeWeekStart = getWeekStartKey(new Date());
      saveState();
      render();
    });
    document.getElementById("nextWeekBtn").addEventListener("click", function () {
      shiftWeek(7);
    });
    els.sidebarToggle.addEventListener("click", toggleSidebar);
    els.sidebarClose.addEventListener("click", toggleSidebar);
    els.taskInput.addEventListener("input", function () {
      state.taskInput = els.taskInput.value;
      saveState();
    });
    els.summaryOutput.addEventListener("input", function () {
      state.summary = els.summaryOutput.value;
      saveState();
    });
    els.closeNoteBtn.addEventListener("click", closeNoteModal);
    els.cancelNoteBtn.addEventListener("click", closeNoteModal);
    els.saveNoteBtn.addEventListener("click", saveNote);
    els.noteModal.addEventListener("click", function (event) {
      if (event.target === els.noteModal) {
        closeNoteModal();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !els.noteModal.hidden) {
        closeNoteModal();
      }
    });

    document.querySelectorAll(".filter-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        state.filter = button.dataset.filter;
        saveState();
        render();
      });
    });
  }

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === "object") {
        state = Object.assign(state, saved);
      }
    } catch (error) {
      showToast("Saved data could not be read.");
    }

    if (!Array.isArray(state.tasks)) {
      state.tasks = [];
    }
    if (!Array.isArray(state.history)) {
      state.history = [];
    }
    if (!state.theme) {
      state.theme = "light";
    }
    if (!state.filter) {
      state.filter = "all";
    }
    if (!state.activeWeekStart) {
      state.activeWeekStart = getWeekStartKey(new Date());
    }
    els.taskInput.value = state.taskInput || "";
    els.summaryOutput.value = state.summary || "";
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
  }

  function render() {
    els.shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    renderFilters();
    renderWeekBoard();
    renderProgress();
    renderHistory();
    els.summaryOutput.value = state.summary || "";
  }

  function renderFilters() {
    document.querySelectorAll(".filter-btn").forEach(function (button) {
      button.classList.toggle("active", button.dataset.filter === state.filter);
    });
  }

  function renderWeekBoard() {
    var days = getCurrentWeekDates();
    els.weekBoard.innerHTML = "";

    days.forEach(function (date) {
      var column = document.createElement("article");
      column.className = "day-column";

      var header = document.createElement("div");
      header.className = "day-header";
      if (date === todayKey()) {
        header.classList.add("today");
      }

      var title = document.createElement("h3");
      title.textContent = getWeekdayName(date);
      var sub = document.createElement("p");
      sub.textContent = date;
      header.append(title, sub);

      var list = document.createElement("div");
      list.className = "task-list";

      var tasks = state.tasks
        .filter(function (task) {
          return task.day === date;
        })
        .filter(taskMatchesFilter);

      if (!tasks.length) {
        var empty = document.createElement("div");
        empty.className = "empty-day";
        empty.textContent = "No tasks";
        list.appendChild(empty);
      } else {
        tasks.forEach(function (task) {
          list.appendChild(createTaskCard(task));
        });
      }

      column.append(header, list);
      els.weekBoard.appendChild(column);
    });
  }

  function createTaskCard(task) {
    var card = document.createElement("div");
    card.className = "task-card";
    if (task.status === "done") {
      card.classList.add("done");
    }

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.status === "done";
    checkbox.setAttribute("aria-label", "Mark task complete");
    checkbox.addEventListener("change", function () {
      task.status = checkbox.checked ? "done" : "pending";
      saveState();
      render();
    });

    var content = document.createElement("div");
    var meta = document.createElement("div");
    meta.className = "task-meta";
    meta.appendChild(createPill(task.category || "General"));
    meta.appendChild(createPill(task.priority || "medium", "priority-" + normalizePriority(task.priority)));
    meta.appendChild(createPill(task.status || "pending"));

    var title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title || "Untitled task";
    content.append(meta, title);

    if (task.learningNote) {
      var note = document.createElement("p");
      note.className = "note-preview";
      note.textContent = task.learningNote;
      content.appendChild(note);
    }

    var edit = document.createElement("button");
    edit.className = "edit-note";
    edit.type = "button";
    edit.title = "Edit note";
    edit.setAttribute("aria-label", "Edit note for " + (task.title || "task"));
    edit.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 19h1.4l9.9-9.9-1.4-1.4L5 17.6V19Zm-2 2v-4.2L16.3 3.5c.2-.2.5-.4.8-.5.3-.1.6-.2.9-.2.3 0 .6.1.9.2.3.1.6.3.8.5l.8.8c.2.2.4.5.5.8.1.3.2.6.2.9 0 .3-.1.6-.2.9-.1.3-.3.6-.5.8L7.2 21H3Zm16-15-1-1 1 1Zm-3.4 2.4-.7-.7 1.4 1.4-.7-.7Z"/></svg>';
    edit.addEventListener("click", function () {
      openNoteModal(task.id);
    });

    card.append(checkbox, content, edit);
    return card;
  }

  function createPill(text, extraClass) {
    var pill = document.createElement("span");
    pill.className = "pill";
    if (extraClass) {
      pill.classList.add(extraClass);
    }
    pill.textContent = text;
    return pill;
  }

  function renderProgress() {
    var weekDates = getCurrentWeekDates();
    var weekTasks = state.tasks.filter(function (task) {
      return weekDates.indexOf(task.day) !== -1;
    });
    var total = weekTasks.length;
    var completed = weekTasks.filter(function (task) {
      return task.status === "done";
    }).length;
    var percent = total ? Math.round((completed / total) * 100) : 0;

    els.progressText.textContent = percent + "% complete";
    els.progressFill.style.width = percent + "%";
  }

  function renderHistory() {
    els.historyList.innerHTML = "";
    if (!state.history.length) {
      var empty = document.createElement("div");
      empty.className = "empty-day";
      empty.textContent = "No reports yet";
      els.historyList.appendChild(empty);
      return;
    }

    state.history.slice(0, 8).forEach(function (report) {
      var item = document.createElement("button");
      item.className = "history-item";
      item.type = "button";
      item.innerHTML =
        "<strong>" +
        escapeHtml(report.date || "Saved report") +
        "</strong><span>" +
        escapeHtml(report.completedTasks + "/" + report.totalTasks + " complete") +
        "</span>";
      item.addEventListener("click", function () {
        state.summary = JSON.stringify(report.summary, null, 2);
        saveState();
        render();
      });
      els.historyList.appendChild(item);
    });
  }

  function taskMatchesFilter(task) {
    if (state.filter === "done") {
      return task.status === "done";
    }
    if (state.filter === "pending") {
      return task.status !== "done";
    }
    return true;
  }

  function loadJsonTasks() {
    var raw = els.taskInput.value.trim();
    if (!raw) {
      showToast("Paste JSON first.");
      return;
    }

    try {
      var parsed = JSON.parse(raw);
      var tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
      if (!Array.isArray(tasks)) {
        throw new Error("JSON must include a tasks array.");
      }

      var fallbackDay = parsed.date || todayKey();
      addTasks(
        tasks.map(function (task) {
          return normalizeTask({
            category: task.category,
            title: task.title,
            priority: task.priority,
            day: task.day || fallbackDay,
            status: task.status,
            learningNote: task.learningNote || task.note
          });
        })
      );
      showToast("JSON tasks loaded.");
    } catch (error) {
      showToast(error.message || "Invalid JSON.");
    }
  }

  function loadMarkdownTasks() {
    var raw = els.taskInput.value.trim();
    if (!raw) {
      showToast("Paste Markdown first.");
      return;
    }

    var tasks = [];
    var category = "General";
    raw.split(/\r?\n/).forEach(function (line) {
      var heading = line.match(/^#{1,6}\s+(.+)$/);
      var checkbox = line.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/);
      var bullet = line.match(/^[-*]\s+(.+)$/);

      if (heading) {
        category = heading[1].trim();
        return;
      }

      if (checkbox) {
        tasks.push(
          normalizeTask({
            category: category,
            title: checkbox[2].trim(),
            priority: "medium",
            status: checkbox[1].toLowerCase() === "x" ? "done" : "pending",
            day: todayKey()
          })
        );
        return;
      }

      if (bullet) {
        tasks.push(
          normalizeTask({
            category: category,
            title: bullet[1].trim(),
            priority: "medium",
            day: todayKey()
          })
        );
      }
    });

    if (!tasks.length) {
      showToast("No Markdown tasks found.");
      return;
    }

    addTasks(tasks);
    showToast("Markdown tasks loaded.");
  }

  function addTasks(tasks) {
    state.tasks = state.tasks.concat(tasks);
    if (tasks.length) {
      state.activeWeekStart = getWeekStartKey(parseLocalDate(tasks[0].day));
    }
    saveState();
    render();
  }

  function normalizeTask(task) {
    return {
      id: createId(),
      category: String(task.category || "General").trim(),
      title: String(task.title || "Untitled task").trim(),
      priority: normalizePriority(task.priority),
      day: isValidDateKey(task.day) ? task.day : todayKey(),
      status: task.status === "done" || task.status === "completed" ? "done" : "pending",
      learningNote: String(task.learningNote || "").trim()
    };
  }

  function normalizePriority(priority) {
    var value = String(priority || "medium").trim().toLowerCase();
    if (["high", "medium", "low"].indexOf(value) === -1) {
      return "medium";
    }
    return value;
  }

  function generateSummary() {
    var days = getCurrentWeekDates();
    var weekTasks = state.tasks.filter(function (task) {
      return days.indexOf(task.day) !== -1;
    });
    var completed = weekTasks.filter(function (task) {
      return task.status === "done";
    }).length;
    var total = weekTasks.length;
    var summary = {
      date: todayKey(),
      weekRange: days[0] + " to " + days[6],
      completion: {
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: total - completed,
        completionPercent: total ? Math.round((completed / total) * 100) : 0
      },
      tasks: weekTasks.map(function (task) {
        return {
          day: task.day,
          category: task.category,
          title: task.title,
          priority: task.priority,
          status: task.status,
          learningNote: task.learningNote || ""
        };
      }),
      overallLearning: "",
      stuckPoints: "",
      tomorrowPriority: "",
      messageForChatGPT: defaultMessage
    };

    state.summary = JSON.stringify(summary, null, 2);
    addHistory(summary);
    saveState();
    render();
    showToast("Summary generated.");
  }

  function addHistory(summary) {
    var record = {
      id: createId(),
      date: summary.date,
      totalTasks: summary.completion.totalTasks,
      completedTasks: summary.completion.completedTasks,
      savedAt: new Date().toISOString(),
      summary: summary
    };
    state.history = [record]
      .concat(
        state.history.filter(function (item) {
          return item.date !== record.date;
        })
      )
      .slice(0, 20);
  }

  function copySummary() {
    var text = state.summary || els.summaryOutput.value;
    if (!text) {
      showToast("Generate a summary first.");
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          showToast("Summary copied.");
        },
        function () {
          fallbackCopy(text);
        }
      );
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    els.summaryOutput.value = text;
    els.summaryOutput.focus();
    els.summaryOutput.select();
    document.execCommand("copy");
    showToast("Summary copied.");
  }

  function downloadSummary() {
    var text = state.summary || els.summaryOutput.value;
    if (!text) {
      generateSummary();
      text = state.summary;
    }

    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "daily-summary-" + todayKey() + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("JSON downloaded.");
  }

  function clearCurrentDay() {
    var today = todayKey();
    state.tasks = state.tasks.filter(function (task) {
      return task.day !== today;
    });
    saveState();
    render();
    showToast("Current day cleared.");
  }

  function resetWeek() {
    var days = getCurrentWeekDates();
    state.tasks = state.tasks.filter(function (task) {
      return days.indexOf(task.day) === -1;
    });
    state.summary = "";
    saveState();
    render();
    showToast("Week reset.");
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState();
    render();
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    saveState();
    render();
  }

  function shiftWeek(days) {
    var start = parseLocalDate(state.activeWeekStart || getWeekStartKey(new Date()));
    start.setDate(start.getDate() + days);
    state.activeWeekStart = formatDateKey(start);
    saveState();
    render();
  }

  function openNoteModal(taskId) {
    var task = findTask(taskId);
    if (!task) {
      return;
    }
    editingTaskId = taskId;
    els.noteCategory.textContent = task.category + " - " + task.day;
    els.noteTitle.textContent = task.title;
    els.noteText.value = task.learningNote || "";
    els.noteModal.hidden = false;
    setTimeout(function () {
      els.noteText.focus();
    }, 0);
  }

  function closeNoteModal() {
    editingTaskId = null;
    els.noteModal.hidden = true;
  }

  function saveNote() {
    var task = findTask(editingTaskId);
    if (!task) {
      closeNoteModal();
      return;
    }
    task.learningNote = els.noteText.value.trim();
    saveState();
    closeNoteModal();
    render();
    showToast("Note saved.");
  }

  function findTask(taskId) {
    return state.tasks.find(function (task) {
      return task.id === taskId;
    });
  }

  function getCurrentWeekDates() {
    var start = parseLocalDate(state.activeWeekStart || getWeekStartKey(new Date()));

    return Array.from({ length: 7 }, function (_, index) {
      var date = new Date(start);
      date.setDate(start.getDate() + index);
      return formatDateKey(date);
    });
  }

  function getWeekStartKey(date) {
    var start = new Date(date);
    var day = start.getDay();
    var mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    return formatDateKey(start);
  }

  function todayKey() {
    return formatDateKey(new Date());
  }

  function formatDateKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function getWeekdayName(dateKey) {
    var date = parseLocalDate(dateKey);
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function parseLocalDate(dateKey) {
    var parts = dateKey.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function isValidDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function createId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "task-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 2200);
  }
})();
