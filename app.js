(function () {
  "use strict";

  var dataFilePath = "data/todo-manager-state.json";
  var apiStatePath = "/api/state";
  var storageKey = "todo-manager-state";
  var defaultMessage =
    "Review my day honestly. Tell me what I did right, where I was lazy, and create tomorrow's plan.";

  var state = {
    version: 1,
    updatedAt: "",
    settings: {
      theme: "dark",
      filter: "all",
      activeWeekStart: "",
      sidebarCollapsed: false,
      expandedDays: {}
    },
    months: {},
    drafts: {
      taskInput: "",
      summary: ""
    },
    history: []
  };

  var editingTaskId = null;
  var creatingForDay = null;
  var sidebarOpen = false;
  var toastTimer = null;
  var persistTimer = null;
  var scrimTimer = null;

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    await loadState();
    bindEvents();
    applyTheme();
    render();
  }

  function cacheElements() {
    els.weekBoard = document.getElementById("weekBoard");
    els.weekTitle = document.getElementById("weekTitle");
    els.progressText = document.getElementById("progressText");
    els.ringFill = document.getElementById("ringFill");
    els.filterTabs = document.querySelector(".filter-tabs");
    els.filterGlider = document.querySelector(".filter-glider");
    els.quickAddInput = document.getElementById("quickAddInput");
    els.sidebar = document.getElementById("sidebar");
    els.sidebarToggle = document.getElementById("sidebarToggle");
    els.sidebarClose = document.getElementById("sidebarClose");
    els.sidebarScrim = document.getElementById("sidebarScrim");
    els.taskInput = document.getElementById("taskInput");
    els.jsonFileInput = document.getElementById("jsonFileInput");
    els.historyList = document.getElementById("historyList");
    els.toast = document.getElementById("toast");
    els.noteModal = document.getElementById("noteModal");
    els.noteCategory = document.getElementById("noteCategory");
    els.noteTitle = document.getElementById("noteTitle");
    els.noteText = document.getElementById("noteText");
    els.editTaskTitle = document.getElementById("editTaskTitle");
    els.editTaskCategory = document.getElementById("editTaskCategory");
    els.editTaskPriority = document.getElementById("editTaskPriority");
    els.editTaskDay = document.getElementById("editTaskDay");
    els.closeNoteBtn = document.getElementById("closeNoteBtn");
    els.cancelNoteBtn = document.getElementById("cancelNoteBtn");
    els.saveNoteBtn = document.getElementById("saveNoteBtn");
    els.deleteTaskBtn = document.getElementById("deleteTaskBtn");
  }

  function bindEvents() {
    document.getElementById("loadJsonBtn").addEventListener("click", loadJsonTasks);
    document.getElementById("generateSummaryBtn").addEventListener("click", generateSummary);
    document.getElementById("downloadBtn").addEventListener("click", downloadState);
    document.getElementById("clearDayBtn").addEventListener("click", clearCurrentDay);
    document.getElementById("resetWeekBtn").addEventListener("click", resetWeek);
    document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);
    document.getElementById("prevWeekBtn").addEventListener("click", function () {
      shiftWeek(-7);
    });
    document.getElementById("todayWeekBtn").addEventListener("click", function () {
      state.settings.activeWeekStart = getWeekStartKey(new Date());
      saveState();
      render();
    });
    document.getElementById("nextWeekBtn").addEventListener("click", function () {
      shiftWeek(7);
    });

    els.sidebarToggle.addEventListener("click", toggleSidebar);
    els.sidebarClose.addEventListener("click", toggleSidebar);
    els.sidebarScrim.addEventListener("click", toggleSidebar);

    document.querySelectorAll(".menu-section-head").forEach(function (head) {
      head.addEventListener("click", function () {
        var section = head.parentElement;
        var open = section.dataset.open === "true";
        section.dataset.open = open ? "false" : "true";
        head.setAttribute("aria-expanded", String(!open));
      });
    });

    els.quickAddInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        quickAddTask();
      }
    });

    els.taskInput.addEventListener("input", function () {
      state.drafts.taskInput = els.taskInput.value;
      saveState();
    });
    els.jsonFileInput.addEventListener("change", importSelectedJsonFile);
    els.closeNoteBtn.addEventListener("click", closeNoteModal);
    els.cancelNoteBtn.addEventListener("click", closeNoteModal);
    els.saveNoteBtn.addEventListener("click", saveNote);
    els.deleteTaskBtn.addEventListener("click", deleteEditingTask);
    els.noteModal.addEventListener("click", function (event) {
      if (event.target === els.noteModal) {
        closeNoteModal();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (!els.noteModal.hidden) {
          closeNoteModal();
        } else if (sidebarOpen) {
          toggleSidebar();
        }
      }
      if (event.key === "/" && document.activeElement === document.body) {
        event.preventDefault();
        els.quickAddInput.focus();
      }
    });

    document.querySelectorAll(".filter-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        state.settings.filter = button.dataset.filter;
        saveState();
        render();
      });
    });

    window.addEventListener("resize", positionFilterGlider);
  }

  /* ---------- State persistence ---------- */

  async function loadState() {
    var serverState = await readServerState();
    if (serverState && hasStateContent(serverState)) {
      state = normalizeState(serverState);
      syncDraftFields();
      return;
    }

    var storedState = readStoredState();
    if (storedState) {
      state = normalizeState(storedState);
      syncDraftFields();
      return;
    }

    try {
      var response = await fetch(dataFilePath, { cache: "no-store" });
      if (response.ok) {
        state = normalizeState(await response.json());
      }
    } catch (error) {
      state = normalizeState(state);
    }

    state = normalizeState(state);
    syncDraftFields();
  }

  function hasStateContent(nextState) {
    if (!nextState || typeof nextState !== "object") {
      return false;
    }
    var months = nextState.months && typeof nextState.months === "object" ? nextState.months : {};
    var taskCount = Object.keys(months).reduce(function (count, monthKey) {
      var tasks = months[monthKey] && months[monthKey].tasks;
      return count + (Array.isArray(tasks) ? tasks.length : 0);
    }, 0);
    return Boolean(nextState.updatedAt || taskCount || (nextState.history && nextState.history.length));
  }

  function normalizeState(nextState) {
    var source = nextState && typeof nextState === "object" ? nextState : {};
    var settings = Object.assign({}, state.settings, source.settings || {});
    var drafts = Object.assign({}, state.drafts, source.drafts || {});
    var tasks = [];

    if (Array.isArray(source.tasks)) {
      tasks = source.tasks;
    }
    if (source.months && typeof source.months === "object") {
      Object.keys(source.months).forEach(function (monthKey) {
        var monthTasks = source.months[monthKey] && source.months[monthKey].tasks;
        if (Array.isArray(monthTasks)) {
          tasks = tasks.concat(monthTasks);
        }
      });
    }

    if (!settings.theme) {
      settings.theme = "dark";
    }
    if (!settings.filter) {
      settings.filter = "all";
    }
    if (!settings.activeWeekStart) {
      settings.activeWeekStart = getWeekStartKey(new Date());
    }
    if (!settings.expandedDays || typeof settings.expandedDays !== "object") {
      settings.expandedDays = {};
    }

    return {
      version: Number(source.version) || 1,
      updatedAt: source.updatedAt || "",
      settings: settings,
      months: groupTasksByMonth(tasks.map(normalizeExistingTask)),
      drafts: drafts,
      history: Array.isArray(source.history) ? source.history : []
    };
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    writeStoredState();
    queueServerPersist();
  }

  function syncDraftFields() {
    els.taskInput.value = state.drafts.taskInput || "";
  }

  async function readServerState() {
    try {
      var response = await fetch(apiStatePath, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  function queueServerPersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistStateToServer, 150);
  }

  async function persistStateToServer() {
    try {
      await fetch(apiStatePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createExportState())
      });
    } catch (error) {
      // The app still works from localStorage if it is opened without server.js.
    }
  }

  function readStoredState() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredState() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(storageKey, JSON.stringify(createExportState()));
      }
    } catch (error) {
      // Autosave can fail in private browsing or when browser storage is full.
    }
  }

  function createExportState() {
    return {
      version: state.version,
      updatedAt: state.updatedAt,
      settings: state.settings,
      months: state.months,
      drafts: state.drafts,
      history: state.history
    };
  }

  /* ---------- Rendering ---------- */

  function applyTheme() {
    document.documentElement.dataset.theme = state.settings.theme;
  }

  function render() {
    renderFilters();
    renderWeekTitle();
    renderWeekBoard();
    renderProgress();
    renderHistory();
  }

  function renderFilters() {
    document.querySelectorAll(".filter-btn").forEach(function (button) {
      button.classList.toggle("active", button.dataset.filter === state.settings.filter);
    });
    positionFilterGlider();
  }

  function positionFilterGlider() {
    var active = document.querySelector(".filter-btn.active");
    if (!active || !els.filterGlider) {
      return;
    }
    els.filterGlider.style.left = active.offsetLeft + "px";
    els.filterGlider.style.width = active.offsetWidth + "px";
  }

  function renderWeekTitle() {
    var days = getCurrentWeekDates();
    var first = parseLocalDate(days[0]);
    var last = parseLocalDate(days[6]);
    var opts = { month: "short", day: "numeric" };
    els.weekTitle.textContent =
      first.toLocaleDateString(undefined, opts) + " — " + last.toLocaleDateString(undefined, opts);
  }

  function renderWeekBoard() {
    var days = getCurrentWeekDates();
    els.weekBoard.innerHTML = "";

    days.forEach(function (date, index) {
      var column = document.createElement("article");
      column.className = "day-column";
      column.style.setProperty("--i", index);
      column.dataset.date = date;
      var expanded = isDayExpanded(date);
      if (date === todayKey()) {
        column.classList.add("today-column");
      }
      column.classList.toggle("expanded", expanded);

      var dayTasks = getAllTasks().filter(function (task) {
        return task.day === date;
      });
      var visibleTasks = dayTasks.filter(taskMatchesFilter);
      var doneCount = dayTasks.filter(function (task) {
        return task.status === "done";
      }).length;

      var header = document.createElement("div");
      header.className = "day-header";

      var title = document.createElement("h3");
      if (date === todayKey()) {
        var dot = document.createElement("span");
        dot.className = "today-dot";
        title.appendChild(dot);
      }
      title.appendChild(document.createTextNode(getWeekdayName(date)));

      var count = document.createElement("span");
      count.className = "day-count";
      count.textContent = dayTasks.length ? doneCount + "/" + dayTasks.length : "—";

      var expandBtn = document.createElement("button");
      expandBtn.className = "expand-day-btn";
      expandBtn.type = "button";
      expandBtn.title = expanded ? "Shrink day" : "Expand day";
      expandBtn.setAttribute("aria-label", expandBtn.title);
      expandBtn.setAttribute("aria-expanded", String(expanded));
      expandBtn.innerHTML = expanded
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
      expandBtn.addEventListener("click", function () {
        toggleDayExpansion(date);
      });

      var headRight = document.createElement("div");
      headRight.className = "day-head-right";
      headRight.append(count, expandBtn);

      header.append(title, headRight);

      var sub = document.createElement("p");
      sub.className = "day-date";
      sub.textContent = date;

      var headerWrap = document.createElement("div");
      headerWrap.append(header, sub);

      var list = document.createElement("div");
      list.className = "task-list";

      if (!visibleTasks.length) {
        var empty = document.createElement("div");
        empty.className = "empty-day";
        empty.textContent = dayTasks.length ? "Filtered out" : "Drop tasks here";
        list.appendChild(empty);
      } else {
        visibleTasks.forEach(function (task) {
          list.appendChild(createTaskCard(task));
        });
      }

      var addBtn = document.createElement("button");
      addBtn.className = "add-task-btn";
      addBtn.type = "button";
      addBtn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Add task';
      addBtn.addEventListener("click", function () {
        openCreateModal(date);
      });

      bindDropTarget(column, date);
      column.append(headerWrap, list, addBtn);
      els.weekBoard.appendChild(column);
    });
  }

  function createTaskCard(task) {
    var card = document.createElement("div");
    card.className = "task-card";
    card.dataset.priority = normalizePriority(task.priority);
    card.draggable = true;
    if (task.status === "done") {
      card.classList.add("done");
    }

    card.addEventListener("dragstart", function (event) {
      event.dataTransfer.setData("text/plain", task.id);
      event.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(function () {
        card.classList.add("dragging");
      });
    });
    card.addEventListener("dragend", function () {
      card.classList.remove("dragging");
      document.querySelectorAll(".day-column.drag-over").forEach(function (col) {
        col.classList.remove("drag-over");
      });
    });

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.status === "done";
    checkbox.setAttribute("aria-label", "Mark task complete");
    checkbox.addEventListener("change", function () {
      task.status = checkbox.checked ? "done" : "pending";
      setTask(task);
      saveState();
      card.classList.toggle("done", checkbox.checked);
      // Delay the re-render so the checkbox pop animation is visible.
      setTimeout(render, 320);
    });

    var body = document.createElement("div");
    body.className = "task-body";

    var meta = document.createElement("div");
    meta.className = "task-meta";
    meta.appendChild(createPill(task.category || "General"));
    meta.appendChild(createPill(task.priority || "medium", "priority-" + normalizePriority(task.priority)));

    var title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title || "Untitled task";
    body.append(meta, title);

    if (task.learningNote) {
      var note = document.createElement("p");
      note.className = "note-preview";
      note.textContent = task.learningNote;
      body.appendChild(note);
    }

    var actions = document.createElement("div");
    actions.className = "card-actions";

    var edit = document.createElement("button");
    edit.className = "icon-btn";
    edit.type = "button";
    edit.title = "Edit task";
    edit.setAttribute("aria-label", "Edit " + (task.title || "task"));
    edit.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    edit.addEventListener("click", function () {
      openNoteModal(task.id);
    });

    var remove = document.createElement("button");
    remove.className = "icon-btn danger";
    remove.type = "button";
    remove.title = "Delete task";
    remove.setAttribute("aria-label", "Delete " + (task.title || "task"));
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 4 1 10h8l1-10"/></svg>';
    remove.addEventListener("click", function () {
      card.classList.add("removing");
      setTimeout(function () {
        deleteTask(task.id);
      }, 260);
    });

    actions.append(edit, remove);
    card.append(checkbox, body, actions);

    card.addEventListener("dblclick", function () {
      openNoteModal(task.id);
    });

    return card;
  }

  function isDayExpanded(dateKey) {
    var stored = state.settings.expandedDays ? state.settings.expandedDays[dateKey] : undefined;
    if (stored === undefined) {
      // Today starts big so the current day is easy to read and work.
      return dateKey === todayKey();
    }
    return Boolean(stored);
  }

  function toggleDayExpansion(dateKey) {
    if (!state.settings.expandedDays || typeof state.settings.expandedDays !== "object") {
      state.settings.expandedDays = {};
    }
    state.settings.expandedDays[dateKey] = !isDayExpanded(dateKey);
    saveState();
    render();
  }

  function bindDropTarget(column, date) {
    column.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", function (event) {
      if (!column.contains(event.relatedTarget)) {
        column.classList.remove("drag-over");
      }
    });
    column.addEventListener("drop", function (event) {
      event.preventDefault();
      column.classList.remove("drag-over");
      var taskId = event.dataTransfer.getData("text/plain");
      var task = findTask(taskId);
      if (!task || task.day === date) {
        return;
      }
      task.day = date;
      setTask(task);
      saveState();
      render();
      showToast("Moved to " + getWeekdayName(date) + ".");
    });
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
    var weekTasks = getAllTasks().filter(function (task) {
      return weekDates.indexOf(task.day) !== -1;
    });
    var total = weekTasks.length;
    var completed = weekTasks.filter(function (task) {
      return task.status === "done";
    }).length;
    var percent = total ? Math.round((completed / total) * 100) : 0;

    els.progressText.textContent = percent + "%";
    var circumference = 2 * Math.PI * 18;
    els.ringFill.style.strokeDashoffset = circumference * (1 - percent / 100);
  }

  function renderHistory() {
    if (!els.historyList) {
      return;
    }
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
        escapeHtml(report.completedTasks + "/" + report.totalTasks + " done") +
        "</span>";
      item.addEventListener("click", function () {
        copyText(JSON.stringify(report.summary, null, 2));
        showToast("Report copied to clipboard.");
      });
      els.historyList.appendChild(item);
    });
  }

  function taskMatchesFilter(task) {
    if (state.settings.filter === "done") {
      return task.status === "done";
    }
    if (state.settings.filter === "pending") {
      return task.status !== "done";
    }
    return true;
  }

  /* ---------- Task actions ---------- */

  function quickAddTask() {
    var raw = els.quickAddInput.value.trim();
    if (!raw) {
      return;
    }

    var priority = "medium";
    var category = "General";

    raw = raw.replace(/!(high|medium|low)\b/i, function (_, level) {
      priority = level.toLowerCase();
      return "";
    });
    raw = raw.replace(/#(\S+)/, function (_, tag) {
      category = tag;
      return "";
    });

    var title = raw.replace(/\s{2,}/g, " ").trim();
    if (!title) {
      showToast("Give the task a title.");
      return;
    }

    var day = todayKey();
    var weekDates = getCurrentWeekDates();
    if (weekDates.indexOf(day) === -1) {
      day = weekDates[0];
    }

    addTasks([
      normalizeTask({ title: title, category: category, priority: priority, day: day })
    ]);
    els.quickAddInput.value = "";
    showToast("Task added.");
  }

  function loadJsonTasks() {
    var raw = els.taskInput.value.trim();
    if (!raw) {
      els.jsonFileInput.click();
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
      showToast("JSON tasks loaded and saved.");
    } catch (error) {
      showToast(error.message || "Invalid JSON.");
    }
  }

  function addTasks(tasks) {
    setAllTasks(getAllTasks().concat(tasks));
    if (tasks.length) {
      state.settings.activeWeekStart = getWeekStartKey(parseLocalDate(tasks[0].day));
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

  async function generateSummary() {
    var days = getCurrentWeekDates();
    var weekTasks = getAllTasks().filter(function (task) {
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

    state.drafts.summary = JSON.stringify(summary, null, 2);
    addHistory(summary);
    saveState();
    render();
    await copyText(state.drafts.summary);
    showToast("Summary JSON copied.");
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

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall through to the legacy copy path.
      }
    }
    var copyTarget = document.createElement("textarea");
    copyTarget.style.position = "fixed";
    copyTarget.style.opacity = "0";
    document.body.appendChild(copyTarget);
    copyTarget.value = text;
    copyTarget.focus();
    copyTarget.select();
    document.execCommand("copy");
    copyTarget.remove();
  }

  function downloadState() {
    var text = JSON.stringify(createExportState(), null, 2);
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "todo-manager-state-" + todayKey().slice(0, 7) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Month-wise JSON exported.");
  }

  function clearCurrentDay() {
    var today = todayKey();
    setAllTasks(
      getAllTasks().filter(function (task) {
        return task.day !== today;
      })
    );
    saveState();
    render();
    showToast("Today's tasks cleared.");
  }

  function resetWeek() {
    var days = getCurrentWeekDates();
    setAllTasks(
      getAllTasks().filter(function (task) {
        return days.indexOf(task.day) === -1;
      })
    );
    state.drafts.summary = "";
    saveState();
    render();
    showToast("Week reset.");
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState();
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    document.body.classList.toggle("sidebar-open", sidebarOpen);
    els.sidebar.setAttribute("aria-hidden", String(!sidebarOpen));
    els.sidebarToggle.setAttribute("aria-expanded", String(sidebarOpen));
    clearTimeout(scrimTimer);
    if (sidebarOpen) {
      els.sidebarScrim.hidden = false;
    } else {
      scrimTimer = setTimeout(function () {
        els.sidebarScrim.hidden = true;
      }, 350);
    }
  }

  function shiftWeek(days) {
    var start = parseLocalDate(state.settings.activeWeekStart || getWeekStartKey(new Date()));
    start.setDate(start.getDate() + days);
    state.settings.activeWeekStart = formatDateKey(start);
    saveState();
    render();
  }

  /* ---------- Modal ---------- */

  function openCreateModal(day) {
    editingTaskId = null;
    creatingForDay = day;
    els.noteCategory.textContent = "New task · " + day;
    els.noteTitle.textContent = "Add Task";
    els.editTaskTitle.value = "";
    els.editTaskCategory.value = "General";
    els.editTaskPriority.value = "medium";
    els.editTaskDay.value = day;
    els.noteText.value = "";
    els.deleteTaskBtn.style.visibility = "hidden";
    els.noteModal.hidden = false;
    setTimeout(function () {
      els.editTaskTitle.focus();
    }, 60);
  }

  function openNoteModal(taskId) {
    var task = findTask(taskId);
    if (!task) {
      return;
    }
    editingTaskId = taskId;
    creatingForDay = null;
    els.noteCategory.textContent = task.category + " · " + task.day;
    els.noteTitle.textContent = "Edit Task";
    els.editTaskTitle.value = task.title || "";
    els.editTaskCategory.value = task.category || "General";
    els.editTaskPriority.value = normalizePriority(task.priority);
    els.editTaskDay.value = task.day || todayKey();
    els.noteText.value = task.learningNote || "";
    els.deleteTaskBtn.style.visibility = "visible";
    els.noteModal.hidden = false;
    setTimeout(function () {
      els.noteText.focus();
    }, 60);
  }

  function closeNoteModal() {
    editingTaskId = null;
    creatingForDay = null;
    els.noteModal.hidden = true;
  }

  function saveNote() {
    if (creatingForDay) {
      var title = String(els.editTaskTitle.value || "").trim();
      if (!title) {
        showToast("Give the task a title.");
        els.editTaskTitle.focus();
        return;
      }
      addTasks([
        normalizeTask({
          title: title,
          category: els.editTaskCategory.value,
          priority: els.editTaskPriority.value,
          day: isValidDateKey(els.editTaskDay.value) ? els.editTaskDay.value : creatingForDay,
          learningNote: els.noteText.value
        })
      ]);
      closeNoteModal();
      showToast("Task added.");
      return;
    }

    var task = findTask(editingTaskId);
    if (!task) {
      closeNoteModal();
      return;
    }
    task.learningNote = els.noteText.value.trim();
    task.title = String(els.editTaskTitle.value || "Untitled task").trim();
    task.category = String(els.editTaskCategory.value || "General").trim();
    task.priority = normalizePriority(els.editTaskPriority.value);
    task.day = isValidDateKey(els.editTaskDay.value) ? els.editTaskDay.value : task.day;
    setTask(task);
    saveState();
    closeNoteModal();
    render();
    showToast("Task saved.");
  }

  function deleteEditingTask() {
    if (!editingTaskId) {
      return;
    }
    deleteTask(editingTaskId);
    closeNoteModal();
  }

  function deleteTask(taskId) {
    setAllTasks(
      getAllTasks().filter(function (task) {
        return task.id !== taskId;
      })
    );
    saveState();
    render();
    showToast("Task deleted.");
  }

  /* ---------- File import ---------- */

  async function importSelectedJsonFile() {
    var file = els.jsonFileInput.files && els.jsonFileInput.files[0];
    if (!file) {
      return;
    }
    try {
      state = normalizeState(JSON.parse(await file.text()));
      syncDraftFields();
      saveState();
      applyTheme();
      render();
      showToast("JSON file loaded and saved.");
    } catch (error) {
      showToast("Invalid JSON file.");
    }
    els.jsonFileInput.value = "";
  }

  /* ---------- Task collection helpers ---------- */

  function findTask(taskId) {
    return getAllTasks().find(function (task) {
      return task.id === taskId;
    });
  }

  function getAllTasks() {
    return Object.keys(state.months)
      .sort()
      .reduce(function (tasks, monthKey) {
        return tasks.concat(state.months[monthKey].tasks || []);
      }, []);
  }

  function setAllTasks(tasks) {
    state.months = groupTasksByMonth(tasks);
  }

  function setTask(updatedTask) {
    var tasks = getAllTasks().map(function (task) {
      return task.id === updatedTask.id ? updatedTask : task;
    });
    setAllTasks(tasks);
  }

  function groupTasksByMonth(tasks) {
    return tasks.reduce(function (months, task) {
      var monthKey = getMonthKey(task.day);
      if (!months[monthKey]) {
        months[monthKey] = { tasks: [] };
      }
      months[monthKey].tasks.push(task);
      return months;
    }, {});
  }

  function normalizeExistingTask(task) {
    var normalized = normalizeTask(task || {});
    normalized.id = task && task.id ? String(task.id) : normalized.id;
    return normalized;
  }

  /* ---------- Date helpers ---------- */

  function getCurrentWeekDates() {
    var start = parseLocalDate(state.settings.activeWeekStart || getWeekStartKey(new Date()));

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

  function getMonthKey(dateKey) {
    return String(dateKey || todayKey()).slice(0, 7);
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
