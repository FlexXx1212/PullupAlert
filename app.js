// Konstanten für Settings-Storage
const SETTINGS_KEY = "pullup-alert-settings";
const WORKOUTS_KEY = "pullup-alert-workouts"; // Neuer Key für Workouts

// Settings laden/speichern
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { }
}

// Platzhalter in Übungstexten ersetzen, inkl. Mathe-Ausdrücke
function resolveExerciseText(text, sets, reps) {
  // Ersetze [SETS], [REPS] und Mathe-Ausdrücke wie [REPS-1], [SETS*REPS*2] usw.
  return text.replace(/\[(.*?)\]/g, (match, expr) => {
    let safeExpr = expr
      .replace(/SETS/gi, sets)
      .replace(/REPS/gi, reps);
    try {
      // eslint-disable-next-line no-eval
      let result = eval(safeExpr);
      return Math.round(result);
    } catch {
      return match;
    }
  });
}

// Pullup Alert – SPA-Logik
// - Workouts & Zeiten werden jetzt primär aus localStorage geladen
// - Abschluss-Status wird pro Tag in localStorage gespeichert

const BASE_TITLE = "Pullup Alert";
const REMINDER_INTERVAL_MINUTES = 30;
const TIMER_DURATION_SECONDS = 75;
const STORAGE_KEY = "pullup-alert-completions";

// Wochentag-Mapping (Deutsch → Date.getDay Index)
const WEEKDAY_MAP = {
  So: 0,
  Mo: 1,
  Di: 2,
  Mi: 3,
  Do: 4,
  Fr: 5,
  Sa: 6,
};
const ALL_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
// Mapping Index -> Kürzel für UI
const INDEX_TO_WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

let workouts = [];
let currentWorkout = null;
let countdownIntervalId = null;
let blinkIntervalId = null;
let isBlinking = false;

// ---- Notification API ----
function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      Notification.requestPermission().catch(() => { });
    } catch (err) {
      console.warn("Notification permission request failed", err);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      stopTitleBlink();
    }
  });
}

function sendWorkoutNotification(workout, isReminder) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState == "visible") return;
  const title = isReminder ? "Workout Erinnerung" : "Workout jetzt starten";
  const body = workout.title;
  try {
    const notification = new Notification(title, { body: body, tag: workout.id });
    notification.onclick = (event) => {
      event.preventDefault();
      try {
        window.focus();
      } catch (_) { }
    };
  } catch (err) {
    console.warn("Konnte Notification nicht erstellen", err);
  }
}

// Hilfsfunktionen für Datum/Zeit
function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseTimeToTodayDate(timeStr) {
  const [hourStr, minuteStr] = timeStr.split(":");
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(hourStr),
    Number(minuteStr),
    0,
    0
  );
}

function loadCompletions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("Fehler beim Laden aus localStorage", e);
    return {};
  }
}

function saveCompletions(completions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completions));
  } catch (e) {
    console.error("Fehler beim Speichern in localStorage", e);
  }
}

function isWorkoutCompleted(workoutId) {
  const completions = loadCompletions();
  const todayKey = getTodayKey();
  return Boolean(completions[todayKey]?.[workoutId]);
}

function setWorkoutCompleted(workoutId, completed) {
  const completions = loadCompletions();
  const todayKey = getTodayKey();
  if (!completions[todayKey]) {
    completions[todayKey] = {};
  }
  completions[todayKey][workoutId] = completed;
  saveCompletions(completions);
}

// UI-Helpers
function $(selector) {
  return document.querySelector(selector);
}

function showView(viewId) {
  const overview = $("#overviewView");
  const active = $("#activeView");
  overview.classList.add("view--hidden");
  overview.classList.remove("view--active");
  active.classList.add("view--hidden");
  active.classList.remove("view--active");
  const view = document.getElementById(viewId);
  view.classList.remove("view--hidden");
  view.classList.add("view--active");
}

function updateCurrentTimeDisplay() {
  const el = $("#currentTime");
  if (!el) return;
  const now = new Date();
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  const s = now.getSeconds().toString().padStart(2, "0");
  el.textContent = `${h}:${m}:${s}`;
}

// Blinkender Tab-Titel
function startTitleBlink() {
  if (isBlinking) return;
  isBlinking = true;
  let toggle = false;
  document.title = BASE_TITLE;
  blinkIntervalId = setInterval(() => {
    document.title = toggle ? "⚡ Workout jetzt!" : BASE_TITLE;
    toggle = !toggle;
  }, 1000);
}

function stopTitleBlink() {
  if (!isBlinking) return;
  isBlinking = false;
  clearInterval(blinkIntervalId);
  blinkIntervalId = null;
  document.title = BASE_TITLE;
}

// Audio
function playAlertSound() {
  if (document.visibilityState !== "visible") return;
  const audio = new Audio("alert.mp3"); // Dynamisch erstellen, da kein HTML-Tag mehr nötig
  audio.play().catch((err) => console.warn("Audio konnte evtl. nicht automatisch abgespielt werden:", err));
}

// Timer
function stopCountdown() {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

function startCountdown() {
  stopCountdown();
  const display = $("#countdown");
  let remaining = TIMER_DURATION_SECONDS;
  display.textContent = remaining.toString();
  countdownIntervalId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = TIMER_DURATION_SECONDS;
    }
    display.textContent = remaining.toString();
  }, 1000);
}

// ---- WORKOUT MANAGEMENT ----

// Workouts laden (localStorage > JSON)
async function loadWorkouts() {
  // 1. Versuche aus localStorage zu laden
  const localRaw = localStorage.getItem(WORKOUTS_KEY);
  let dataWorkouts = [];
  let dataSets = 2;
  let dataReps = 3;

  if (localRaw) {
    const parsed = JSON.parse(localRaw);
    dataWorkouts = parsed.workouts || [];
    // Sets/Reps aus Settings laden
  } else {
    // 2. Fallback: JSON laden und in localStorage speichern (Migration)
    try {
      const response = await fetch("workouts.json", { cache: "no-store" });
      if (response.ok) {
        const jsonData = await response.json();
        dataWorkouts = jsonData.workouts || [];
        dataSets = jsonData.sets;
        dataReps = jsonData.reps;

        // Initial speichern
        saveWorkoutsToStorage(dataWorkouts);
        // Settings auch initial speichern, falls noch nicht vorhanden
        const currentSettings = loadSettings();
        if (!currentSettings.sets) {
          saveSettings({ ...currentSettings, sets: dataSets, reps: dataReps });
        }
      }
    } catch (err) {
      console.error("Konnte workouts.json nicht laden", err);
    }
  }

  // Globale Settings aktualisieren
  const settings = loadSettings();
  window.sets = typeof settings.sets === "number" ? settings.sets : dataSets;
  window.reps = typeof settings.reps === "number" ? settings.reps : dataReps;

  // Workouts verarbeiten
  const todayKey = getTodayKey();
  const todayDayIndex = new Date().getDay();

  workouts = dataWorkouts.map((w) => {
    const dateTime = parseTimeToTodayDate(w.time);
    let daysArr = Array.isArray(w.days) && w.days.length > 0 ? w.days : ALL_WEEKDAYS;
    const daysIndex = daysArr.map((d) => WEEKDAY_MAP[d] ?? null).filter((x) => x !== null);
    const isToday = daysIndex.includes(todayDayIndex);

    return {
      ...w,
      dateTime,
      days: daysArr,
      daysIndex,
      isToday,
      alertedInitially: false,
      nextReminderAt: null,
      completed: isWorkoutCompleted(w.id),
      lastDayKey: todayKey,
    };
  });
}

function saveWorkoutsToStorage(workoutsData) {
  // Wir speichern nur die reinen Daten, ohne Laufzeit-Properties
  const cleanWorkouts = workoutsData.map(w => ({
    id: w.id,
    time: w.time,
    title: w.title,
    label: w.label,
    grip: w.grip,
    days: w.days,
    exercises: w.exercises
  }));
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify({ workouts: cleanWorkouts }));
}

// CRUD
function addWorkout(workoutData) {
  const newId = "w_" + Date.now();
  const newWorkout = { ...workoutData, id: newId };
  // Zu lokaler Liste hinzufügen (mit Laufzeit-Props)
  const todayKey = getTodayKey();
  const todayDayIndex = new Date().getDay();
  const dateTime = parseTimeToTodayDate(newWorkout.time);
  const daysIndex = newWorkout.days.map((d) => WEEKDAY_MAP[d] ?? null).filter((x) => x !== null);
  const isToday = daysIndex.includes(todayDayIndex);

  const runtimeWorkout = {
    ...newWorkout,
    dateTime,
    daysIndex,
    isToday,
    alertedInitially: false,
    nextReminderAt: null,
    completed: false,
    lastDayKey: todayKey
  };

  workouts.push(runtimeWorkout);
  workouts.sort((a, b) => a.time.localeCompare(b.time)); // Nach Zeit sortieren

  saveWorkoutsToStorage(workouts);
  renderOverview();
}

function updateWorkout(id, workoutData) {
  const idx = workouts.findIndex(w => w.id === id);
  if (idx === -1) return;

  const oldWorkout = workouts[idx];
  const todayDayIndex = new Date().getDay();
  const dateTime = parseTimeToTodayDate(workoutData.time);
  const daysIndex = workoutData.days.map((d) => WEEKDAY_MAP[d] ?? null).filter((x) => x !== null);
  const isToday = daysIndex.includes(todayDayIndex);

  workouts[idx] = {
    ...oldWorkout,
    ...workoutData,
    dateTime,
    daysIndex,
    isToday
  };
  workouts.sort((a, b) => a.time.localeCompare(b.time));

  saveWorkoutsToStorage(workouts);
  renderOverview();
}

function deleteWorkout(id) {
  if (!confirm("Wirklich löschen?")) return;
  workouts = workouts.filter(w => w.id !== id);
  saveWorkoutsToStorage(workouts);
  renderOverview();
}

// Übersicht rendern
function renderOverview() {
  // Inputs updaten
  const setsInput = $("#setsInput");
  const repsInput = $("#repsInput");
  if (setsInput && repsInput) {
    setsInput.value = window.sets;
    repsInput.value = window.reps;
  }

  const container = $("#workoutList");
  if (!container) return;
  container.innerHTML = "";
  const now = new Date();

  workouts.forEach((workout) => {
    const card = document.createElement("article");
    card.className = "workout-card";
    if (workout.completed) card.classList.add("workout-card--completed");
    if (!workout.isToday && !workout.completed) card.classList.add("workout-card--not-today");
    card.dataset.workoutId = workout.id;

    // Edit Button
    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openModal(workout);
    };
    card.appendChild(editBtn);

    // Header
    const header = document.createElement("div");
    header.className = "workout-card-header";
    const timeEl = document.createElement("div");
    timeEl.className = "workout-time";
    timeEl.textContent = workout.time;
    const labelEl = document.createElement("div");
    labelEl.className = "workout-label";
    labelEl.textContent = workout.label || "";
    header.appendChild(timeEl);
    header.appendChild(labelEl);

    // Titel
    const titleEl = document.createElement("h3");
    titleEl.className = "workout-title";
    titleEl.textContent = workout.title;

    // Meta
    const meta = document.createElement("div");
    meta.className = "workout-meta";
    const statusEl = document.createElement("span");
    statusEl.className = "workout-status";
    let statusText;
    if (workout.completed) {
      statusText = "Abgeschlossen";
      statusEl.classList.add("workout-status--completed");
    } else if (!workout.isToday) {
      statusText = "Nicht heute";
      statusEl.classList.add("workout-status--not-today");
    } else if (now >= workout.dateTime) {
      statusText = "Fällig";
      statusEl.classList.add("workout-status--overdue");
    } else {
      statusText = "Geplant";
      statusEl.classList.add("workout-status--pending");
    }
    statusEl.textContent = statusText;

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "btn btn--primary";
    if (workout.completed || !workout.isToday) {
      actionBtn.textContent = "Vorschau";
    } else {
      actionBtn.textContent = "Starten";
    }
    actionBtn.dataset.action = "openWorkout";
    actionBtn.dataset.workoutId = workout.id;

    meta.appendChild(statusEl);
    meta.appendChild(actionBtn);

    const daysEl = document.createElement("div");
    daysEl.className = "workout-days";
    daysEl.textContent = (workout.days || []).join(", ");

    card.appendChild(header);
    card.appendChild(titleEl);
    card.appendChild(meta);
    card.appendChild(daysEl);
    container.appendChild(card);
  });
}

// Aktives Workout anzeigen
function showActiveWorkout(workout) {
  currentWorkout = workout;
  $("#activeTitle").textContent = workout.title;
  $("#activeLabel").textContent = workout.label || "";
  $("#activeTime").textContent = `Zeit: ${workout.time} Uhr`;

  const gripEl = $("#activeGrip");
  if (workout.grip && workout.grip !== "-") {
    gripEl.textContent = `Griff: ${workout.grip}`;
    gripEl.style.display = "";
  } else {
    gripEl.style.display = "none";
  }

  const list = $("#activeExercises");
  list.innerHTML = "";

  (workout.exercises || []).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = resolveExerciseText(text, window.sets, window.reps);
    list.appendChild(li);
  });

  const footer = document.querySelector('.active-footer');
  const container = document.querySelector('.active-container');

  if (workout.completed || !workout.isToday) {
    if (footer) footer.style.display = 'none';
    if (container) container.classList.add('preview-mode');
  } else {
    if (footer) footer.style.display = '';
    if (container) container.classList.remove('preview-mode');
    startCountdown();
  }
  showView("activeView");
}

function markCurrentWorkoutCompleted() {
  if (!currentWorkout) return;
  currentWorkout.completed = true;
  setWorkoutCompleted(currentWorkout.id, true);
  stopCountdown();
  stopTitleBlink();
  showView("overviewView");
  renderOverview();
}

// Zeitbasierte Reminder-Logik
function setupReminderTicker() {
  setInterval(() => {
    updateCurrentTimeDisplay();
    const now = new Date();
    const todayKey = getTodayKey();
    const todayDayIndex = now.getDay();
    let needsRerender = false;

    workouts.forEach((w) => {
      if (w.lastDayKey !== todayKey) {
        w.completed = false;
        w.alertedInitially = false;
        w.nextReminderAt = null;
        w.dateTime = parseTimeToTodayDate(w.time);
        w.lastDayKey = todayKey;
        w.isToday = w.daysIndex.includes(todayDayIndex);
        needsRerender = true;
      }
      if (w.completed) return;
      if (!w.isToday) return;
      if (!w.dateTime) return;

      if (!w.alertedInitially && now >= w.dateTime) {
        w.alertedInitially = true;
        w.nextReminderAt = new Date(w.dateTime.getTime() + REMINDER_INTERVAL_MINUTES * 60 * 1000);
        triggerWorkoutAlert(w, false);
        needsRerender = true;
      } else if (w.alertedInitially && w.nextReminderAt && now >= w.nextReminderAt) {
        triggerWorkoutAlert(w, true);
        while (w.nextReminderAt <= now) {
          w.nextReminderAt = new Date(w.nextReminderAt.getTime() + REMINDER_INTERVAL_MINUTES * 60 * 1000);
        }
      }
    });
    if (needsRerender) renderOverview();
  }, 1000);
}

function triggerWorkoutAlert(workout, isReminder) {
  showActiveWorkout(workout);
  playAlertSound();
  startTitleBlink();
  sendWorkoutNotification(workout, isReminder);
}

// ---- MODAL LOGIC ----

function openModal(workout = null) {
  const modal = $("#workoutModal");
  const form = $("#workoutForm");
  const deleteBtn = $("#deleteWorkoutBtn");
  const title = $("#modalTitle");

  // Reset Form
  form.reset();
  $("#editWorkoutId").value = "";

  // Wochentage generieren
  const daysContainer = $("#wfDaysContainer");
  daysContainer.innerHTML = "";
  ALL_WEEKDAYS.forEach(day => {
    const id = `day_${day}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = id;
    checkbox.value = day;
    checkbox.className = "day-checkbox";

    const label = document.createElement("label");
    label.htmlFor = id;
    label.className = "day-label";
    label.textContent = day;

    daysContainer.appendChild(checkbox);
    daysContainer.appendChild(label);
  });

  if (workout) {
    // Edit Mode
    title.textContent = "Workout bearbeiten";
    $("#editWorkoutId").value = workout.id;
    $("#wfTitle").value = workout.title;
    $("#wfLabel").value = workout.label || "";
    $("#wfTime").value = workout.time;
    $("#wfGrip").value = (workout.grip && workout.grip !== "-") ? workout.grip : "";
    $("#wfExercises").value = (workout.exercises || []).join("\n");

    (workout.days || []).forEach(day => {
      const cb = daysContainer.querySelector(`input[value="${day}"]`);
      if (cb) cb.checked = true;
    });

    deleteBtn.style.display = "block";
    deleteBtn.onclick = () => {
      deleteWorkout(workout.id);
      closeModal();
    };
  } else {
    // Create Mode
    title.textContent = "Neues Workout";
    deleteBtn.style.display = "none";
    // Default: Alle Tage ausgewählt
    daysContainer.querySelectorAll("input").forEach(cb => cb.checked = true);
  }

  updateModalPreview();
  modal.classList.remove("modal--hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const modal = $("#workoutModal");
  modal.classList.add("modal--hidden");
  modal.setAttribute("aria-hidden", "true");
}

function updateModalPreview() {
  const text = $("#wfExercises").value;
  if (!text.trim()) {
    $("#wfPreview").textContent = "-";
    return;
  }
  // Alle Zeilen verarbeiten
  const lines = text.split("\n");
  const resolvedLines = lines.map(line => resolveExerciseText(line, window.sets, window.reps));
  $("#wfPreview").textContent = resolvedLines.join("\n");
}

function handleModalSubmit(e) {
  e.preventDefault();
  const id = $("#editWorkoutId").value;
  const title = $("#wfTitle").value;
  const label = $("#wfLabel").value;
  const time = $("#wfTime").value;
  const grip = $("#wfGrip").value.trim(); // Empty string if not provided
  const exercises = $("#wfExercises").value.split("\n").filter(line => line.trim() !== "");

  const selectedDays = Array.from(document.querySelectorAll("#wfDaysContainer input:checked"))
    .map(cb => cb.value);

  const data = {
    title,
    label,
    time,
    grip,
    days: selectedDays,
    exercises
  };

  if (id) {
    updateWorkout(id, data);
  } else {
    addWorkout(data);
  }
  closeModal();
}

// ---- CUSTOM INPUTS LOGIC ----
function setupCustomInputs() {
  document.querySelectorAll(".btn-control").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const action = btn.dataset.action;
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      let val = parseInt(input.value, 10) || 0;
      if (action === "inc") val++;
      if (action === "dec") val--;
      if (val < 1) val = 1;
      if (val > 99) val = 99;

      input.value = val;
      // Trigger change event manually
      input.dispatchEvent(new Event("change"));
    });
  });
}


// Event-Handler
function setupEventListeners() {
  const list = $("#workoutList");
  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action === "openWorkout") {
      const workoutId = target.dataset.workoutId;
      const workout = workouts.find((w) => w.id === workoutId);
      if (workout) {
        showActiveWorkout(workout);
      }
    }
  });

  $("#backToOverview").addEventListener("click", () => {
    stopCountdown();
    showView("overviewView");
    stopTitleBlink();
    document.title = BASE_TITLE;
  });

  $("#completeButton").addEventListener("click", () => {
    markCurrentWorkoutCompleted();
  });

  // Modal Events
  $("#addWorkoutBtn").addEventListener("click", () => openModal());
  $("#closeModalBtn").addEventListener("click", closeModal);
  $("#cancelModalBtn").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", closeModal);
  $("#workoutForm").addEventListener("submit", handleModalSubmit);
  $("#wfExercises").addEventListener("input", updateModalPreview);
}

// Initialisierung
async function initApp() {
  await loadWorkouts();
  renderOverview();
  setupEventListeners();
  setupCustomInputs();

  // Settings-Form Events
  const setsInput = $("#setsInput");
  const repsInput = $("#repsInput");

  const updateSettings = () => {
    let s = parseInt(setsInput.value, 10);
    let r = parseInt(repsInput.value, 10);
    if (isNaN(s) || s < 1) s = 2;
    if (isNaN(r) || r < 1) r = 3;
    window.sets = s;
    window.reps = r;
    saveSettings({ sets: s, reps: r });
    renderOverview();
    // Update Preview if modal is open
    if (!$("#workoutModal").classList.contains("modal--hidden")) {
      updateModalPreview();
    }
  };

  if (setsInput && repsInput) {
    setsInput.addEventListener("change", updateSettings);
    repsInput.addEventListener("change", updateSettings);
  }

  setupReminderTicker();
  updateCurrentTimeDisplay();
  document.title = BASE_TITLE;
  requestNotificationPermission();

  // Stand Up Alert Logic starten
  initStandUpLogic();
}

document.addEventListener("DOMContentLoaded", initApp);

/* ---------------------------------------------------------
   STAND UP ALERT LOGIC
   --------------------------------------------------------- */

const STANDUP_SETTINGS_KEY = "pullup-alert-standup-settings";
const STANDUP_STATE_KEY = "pullup-alert-standup-state";

let standUpSettings = {
  enabled: false,
  minTime: 45,
  maxTime: 75,
  minDur: 10,
  maxDur: 20
};

let standUpState = {
  phase: "IDLE", // IDLE, SITTING, STANDING
  targetTime: null // Timestamp (ms)
};

function loadStandUpSettings() {
  try {
    const raw = localStorage.getItem(STANDUP_SETTINGS_KEY);
    if (raw) {
      standUpSettings = { ...standUpSettings, ...JSON.parse(raw) };
    }
  } catch (e) { console.warn(e); }
}

function saveStandUpSettings() {
  localStorage.setItem(STANDUP_SETTINGS_KEY, JSON.stringify(standUpSettings));
}

function loadStandUpState() {
  try {
    const raw = localStorage.getItem(STANDUP_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      standUpState = parsed;
      // Wenn targetTime existiert, muss es evtl. geprüft werden
    }
  } catch (e) { console.warn(e); }
}

function saveStandUpState() {
  localStorage.setItem(STANDUP_STATE_KEY, JSON.stringify(standUpState));
}

function getRandomMinutes(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resetStandUpTimer() {
  if (!standUpSettings.enabled) return;
  startSittingPhase();
}

function initStandUpLogic() {
  loadStandUpSettings();
  loadStandUpState();

  // UI initialisieren
  const toggle = $("#standUpToggle");
  const minTimeIn = $("#suMinTime");
  const maxTimeIn = $("#suMaxTime");
  const minDurIn = $("#suMinDur");
  const maxDurIn = $("#suMaxDur");
  const resetBtn = $("#standUpReset");

  if (toggle) {
    toggle.checked = standUpSettings.enabled;
    toggle.addEventListener("change", (e) => {
      standUpSettings.enabled = e.target.checked;
      saveStandUpSettings();
      handleStandUpToggle();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", resetStandUpTimer);
    resetBtn.disabled = !standUpSettings.enabled;
  }

  // Inputs
  const updateInputs = () => {
    standUpSettings.minTime = parseInt(minTimeIn.value) || 45;
    standUpSettings.maxTime = parseInt(maxTimeIn.value) || 75;
    standUpSettings.minDur = parseInt(minDurIn.value) || 10;
    standUpSettings.maxDur = parseInt(maxDurIn.value) || 20;
    saveStandUpSettings();
  };

  [minTimeIn, maxTimeIn, minDurIn, maxDurIn].forEach(el => {
    if (el) {
      // Set initial values
      if (el.id === "suMinTime") el.value = standUpSettings.minTime;
      if (el.id === "suMaxTime") el.value = standUpSettings.maxTime;
      if (el.id === "suMinDur") el.value = standUpSettings.minDur;
      if (el.id === "suMaxDur") el.value = standUpSettings.maxDur;

      el.addEventListener("change", updateInputs);
    }
  });

  // Wenn beim Laden enabled ist, aber IDLE -> Starten
  if (standUpSettings.enabled && standUpState.phase === "IDLE") {
    startSittingPhase();
  }

  // Ticker starten
  setInterval(updateStandUpTicker, 1000);
  updateStandUpTicker();
}

function handleStandUpToggle() {
  if (standUpSettings.enabled) {
    if (standUpState.phase === "IDLE") {
      startSittingPhase();
    }
  } else {
    standUpState.phase = "IDLE";
    standUpState.targetTime = null;
    saveStandUpState();
    updateStandUpTicker();
  }
}

function startSittingPhase() {
  const minutes = getRandomMinutes(standUpSettings.minTime, standUpSettings.maxTime);
  standUpState.phase = "SITTING";
  standUpState.targetTime = Date.now() + minutes * 60 * 1000;
  saveStandUpState();
  updateStandUpTicker();
}

function startStandingPhase() {
  const minutes = getRandomMinutes(standUpSettings.minDur, standUpSettings.maxDur);
  standUpState.phase = "STANDING";
  standUpState.targetTime = Date.now() + minutes * 60 * 1000;
  saveStandUpState();
  updateStandUpTicker();

  notifyStandUp("Aufstehen!", `Zeit für ${minutes} Minuten im Stehen arbeiten.`);
}

function updateStandUpTicker() {
  const timerEl = $("#standUpTimer");
  const resetBtn = $("#standUpReset");
  if (!timerEl) return;

  if (!standUpSettings.enabled || standUpState.phase === "IDLE") {
    timerEl.style.display = "none";
    if (resetBtn) {
      resetBtn.style.display = "none";
      resetBtn.disabled = true;
    }
    return;
  }

  timerEl.style.display = "inline-block";
  if (resetBtn) {
    resetBtn.style.display = "inline-flex";
    resetBtn.disabled = false;
  }
  const now = Date.now();
  let diff = standUpState.targetTime - now;

  if (diff <= 0) {
    // Zeit abgelaufen -> Phase wechseln
    if (standUpState.phase === "SITTING") {
      startStandingPhase();
    } else if (standUpState.phase === "STANDING") {
      // Zurück zu Sitting
      notifyStandUp("Hinsetzen!", "Du kannst dich wieder setzen.");
      startSittingPhase();
    }
    return;
  }

  // Formatieren
  const totalSeconds = Math.floor(diff / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const timeStr = `${m}:${s.toString().padStart(2, "0")}`;

  if (standUpState.phase === "SITTING") {
    timerEl.textContent = `Sitzen: ${timeStr}`;
    timerEl.className = "standup-timer active";
  } else {
    timerEl.textContent = `Stehen: ${timeStr}`;
    timerEl.className = "standup-timer standing";
  }
}

function notifyStandUp(title, body) {
  playAlertSound();
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    const notification = new Notification(title, { body });
    notification.onclick = (event) => {
      event.preventDefault();
      try {
      window.focus();
      } catch (_) { }
    };
  }
}