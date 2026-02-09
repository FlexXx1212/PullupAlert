// Konstanten für Settings-Storage
const SETTINGS_KEY = "pullup-alert-settings";
const WORKOUTS_KEY = "pullup-alert-workouts"; // Neuer Key für Workouts

const DEFAULT_EXERCISE_VARIABLES = [
  { name: "Pullups", prefix: "PULL", sets: 2, reps: 3 },
  { name: "Pushups", prefix: "PUSH", sets: 3, reps: 10 },
  { name: "Dips", prefix: "DIP", sets: 3, reps: 5 },
  { name: "L-Sit", prefix: "L", sets: 5, reps: 15 },
  { name: "Lateral Raises", prefix: "LAT", sets: 2, reps: 30 }
];

function createCategoryId() {
  return `cat_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeCategories(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const normalized = [];
  const seen = new Set();

  list.forEach((category) => {
    const name = category?.name?.toString().trim();
    if (!name) return;
    let id = category?.id?.toString().trim() || createCategoryId();
    while (seen.has(id)) {
      id = createCategoryId();
    }
    seen.add(id);
    const activeValue = category?.active;
    const legacyHidden = category?.hidden;
    const isActive = typeof activeValue === "boolean"
      ? activeValue
      : !(typeof legacyHidden === "boolean" ? legacyHidden : false);
    normalized.push({
      id,
      name,
      active: isActive
    });
  });

  return normalized;
}

function getCategoryById(categoryId) {
  return (window.categories || []).find((category) => category.id === categoryId) || null;
}

function getCategoryName(categoryId) {
  if (!categoryId) return "";
  return getCategoryById(categoryId)?.name || "";
}

function isCategoryHidden(categoryId) {
  if (!categoryId) return false;
  const category = getCategoryById(categoryId);
  if (!category) return false;
  return !category.active;
}

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

function sanitizePrefix(prefix) {
  return (prefix || "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeExerciseVariables(variables) {
  const list = Array.isArray(variables) ? variables : [];
  const normalized = [];
  const seen = new Set();

  list.forEach((variable) => {
    const prefix = sanitizePrefix(variable?.prefix);
    if (!prefix) return;
    if (seen.has(prefix)) return;
    seen.add(prefix);
    const sets = Math.max(1, parseInt(variable?.sets, 10) || 1);
    const reps = Math.max(1, parseInt(variable?.reps, 10) || 1);
    normalized.push({
      name: variable?.name?.toString().trim() || prefix,
      prefix,
      sets,
      reps
    });
  });

  return normalized;
}

function applyLegacySetsReps(variables, settings) {
  const legacySets = parseInt(settings?.sets, 10);
  const legacyReps = parseInt(settings?.reps, 10);
  if (!legacySets && !legacyReps) return variables;
  return variables.map((variable) => {
    if (variable.prefix !== "PULL") return variable;
    return {
      ...variable,
      sets: legacySets || variable.sets,
      reps: legacyReps || variable.reps
    };
  });
}

function getExerciseVariables() {
  const settings = loadSettings();
  const normalized = normalizeExerciseVariables(settings.exerciseVariables);
  if (normalized.length) return normalized;
  const legacyMerged = applyLegacySetsReps(DEFAULT_EXERCISE_VARIABLES, settings);
  return legacyMerged.length ? legacyMerged : DEFAULT_EXERCISE_VARIABLES;
}

function saveExerciseVariables(variables) {
  const settings = loadSettings();
  const normalized = normalizeExerciseVariables(variables);
  saveSettings({ ...settings, exerciseVariables: normalized });
  window.exerciseVariables = normalized.length ? normalized : DEFAULT_EXERCISE_VARIABLES;
}

function buildExerciseVariableMap(variables) {
  const map = {};
  const list = normalizeExerciseVariables(variables);
  list.forEach((variable) => {
    map[`${variable.prefix}SETS`] = variable.sets;
    map[`${variable.prefix}REPS`] = variable.reps;
  });
  const legacy = list.find((variable) => variable.prefix === "PULL") || list[0];
  if (legacy) {
    map.SETS = legacy.sets;
    map.REPS = legacy.reps;
  }
  return map;
}

// Platzhalter in Übungstexten ersetzen, inkl. Mathe-Ausdrücke
function resolveExerciseText(text, variableMap) {
  // Ersetze [PREFIXSETS], [PREFIXREPS] und Mathe-Ausdrücke wie [PULLREPS-1], [PULLSETS*2] usw.
  return text.replace(/\[(.*?)\]/g, (match, expr) => {
    let safeExpr = expr;
    Object.entries(variableMap || {}).forEach(([key, value]) => {
      const token = new RegExp(`\\b${key}\\b`, "gi");
      safeExpr = safeExpr.replace(token, value);
    });
    try {
      // eslint-disable-next-line no-eval
      let result = eval(safeExpr);
      return Math.round(result);
    } catch {
      return match;
    }
  });
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function applyInlineFormatting(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<u>$1</u>");
}

function parseExerciseLine(text, variableMap) {
  const resolved = resolveExerciseText(text, variableMap).trim();
  if (!resolved) return null;
  let type = "normal";
  let content = resolved;
  if (content.startsWith("# ")) {
    type = "heading";
    content = content.slice(2).trim();
  } else if (content.startsWith("- ")) {
    type = "bullet";
    content = content.slice(2).trim();
  }
  return {
    type,
    html: applyInlineFormatting(content)
  };
}

function createExerciseLineElement(text, variableMap, tagName = "li") {
  const parsed = parseExerciseLine(text, variableMap);
  if (!parsed) return null;
  const item = document.createElement(tagName);
  item.className = "exercise-item";
  if (parsed.type === "bullet") {
    item.classList.add("exercise-item--bullet");
  }
  if (parsed.type === "heading") {
    item.classList.add("exercise-item--heading");
  }
  item.innerHTML = parsed.html;
  return item;
}

// Pullup Alert – SPA-Logik
// - Workouts & Zeiten werden jetzt primär aus localStorage geladen
// - Abschluss-Status wird pro Tag in localStorage gespeichert

const BASE_TITLE = "Pullup Alert";
const REMINDER_INTERVAL_MINUTES = 30;
const DEFAULT_TIMER_DURATION_SECONDS = 75;
const DEFAULT_REPEAT_INTERVAL_MINUTES = 90;
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
const ALL_WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// Mapping Index -> Kürzel für UI
const INDEX_TO_WEEKDAY = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

let workouts = [];
let currentWorkout = null;
let activeTimerIntervalId = null;
let blinkIntervalId = null;
let isBlinking = false;
let activeTimerId = null;
let timerStateById = {};
let allowTimerControls = false;
let activeDate = startOfDay(new Date());

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
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKeyLocal(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return formatDateKeyLocal(startOfDay(new Date()));
}

function getDateKey(date = new Date()) {
  return formatDateKeyLocal(startOfDay(date));
}

function parseTimeToDate(timeStr, baseDate = new Date()) {
  const [hourStr, minuteStr] = (timeStr || "00:00").split(":");
  const day = startOfDay(baseDate);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Number(hourStr),
    Number(minuteStr),
    0,
    0
  );
}

function normalizeRepeatInterval(minutes) {
  const parsed = parseInt(minutes, 10);
  if (Number.isNaN(parsed)) return DEFAULT_REPEAT_INTERVAL_MINUTES;
  return Math.min(Math.max(parsed, 1), 1440);
}

function isRepeatingWorkout(workout) {
  return Boolean(workout?.repeating);
}

function getRepeatMinutes(workout) {
  if (!workout) return DEFAULT_REPEAT_INTERVAL_MINUTES;
  return normalizeRepeatInterval(workout.repeatIntervalMinutes);
}

function formatTimeShort(date) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getRepeatingDueLabel(workout) {
  if (!isRepeatingWorkout(workout)) return "";
  const nextDueAt = workout?.nextDueAt instanceof Date ? workout.nextDueAt : null;
  if (!nextDueAt) return "";
  const diffMinutes = Math.max(0, Math.ceil((nextDueAt.getTime() - Date.now()) / 60000));
  return `${formatTimeShort(nextDueAt)} (${diffMinutes} Min)`;
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

function isWorkoutCompleted(workoutId, date = new Date()) {
  const completions = loadCompletions();
  const dateKey = getDateKey(date);
  return Boolean(completions[dateKey]?.[workoutId]);
}

function setWorkoutCompleted(workoutId, completed, date = new Date()) {
  const completions = loadCompletions();
  const dateKey = getDateKey(date);
  if (!completions[dateKey]) {
    completions[dateKey] = {};
  }
  completions[dateKey][workoutId] = completed;
  saveCompletions(completions);
}

function isViewingToday(date = activeDate) {
  return getDateKey(date) === getTodayKey();
}

function isWorkoutOnDate(workout, date = activeDate) {
  const dayIndex = startOfDay(date).getDay();
  return Array.isArray(workout.daysIndex) && workout.daysIndex.includes(dayIndex);
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDateLabel(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
    .format(date)
    .replace(/\.$/, "");
}

function updateDateNavUI() {
  const pill = $("#dateStatus");
  const todayBtn = $("#todayBtn");
  const isToday = isViewingToday();
  const shortDate = formatShortDateLabel(activeDate);

  if (pill) {
    pill.textContent = isToday ? "Heute" : shortDate;
    pill.style.display = isToday ? "none" : "inline-block";
  }
  if (todayBtn) {
    todayBtn.disabled = isToday;
    todayBtn.classList.toggle("btn--disabled", isToday);
  }
}

function setActiveDate(newDate) {
  activeDate = startOfDay(newDate);
  updateDateNavUI();
  renderOverview();
  const isActiveViewVisible = document.getElementById("activeView")?.classList.contains("view--active");
  if (isActiveViewVisible && currentWorkout) {
    showActiveWorkout(currentWorkout);
  }
}

function changeActiveDateBy(days) {
  const updated = new Date(activeDate);
  updated.setDate(updated.getDate() + days);
  setActiveDate(updated);
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
function createTimerId() {
  return `t_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeWorkoutTimers(timers = [], fallbackDuration = DEFAULT_TIMER_DURATION_SECONDS) {
  const baseTimers = Array.isArray(timers) && timers.length > 0
    ? timers
    : [{
      id: createTimerId(),
      name: "Pause",
      durationSeconds: fallbackDuration,
      repeating: false
    }];

  return baseTimers.map((timer, index) => ({
    id: timer.id || createTimerId(),
    name: timer.name?.trim() || `Timer ${index + 1}`,
    durationSeconds: Number.isFinite(timer.durationSeconds)
      ? Math.max(1, timer.durationSeconds)
      : fallbackDuration,
    repeating: Boolean(timer.repeating)
  }));
}

function getFallbackTimerDuration() {
  const settings = loadSettings();
  return typeof settings.timerDurationSeconds === "number"
    ? settings.timerDurationSeconds
    : DEFAULT_TIMER_DURATION_SECONDS;
}

function clearActiveTimerInterval() {
  if (activeTimerIntervalId) {
    clearInterval(activeTimerIntervalId);
    activeTimerIntervalId = null;
  }
}

function getTimerState(timerId) {
  return timerStateById[timerId];
}

function setTimerState(timerId, updates) {
  timerStateById[timerId] = { ...timerStateById[timerId], ...updates };
}

function resetTimer(timerId) {
  const timer = currentWorkout?.timers?.find(t => t.id === timerId);
  if (!timer) return;
  setTimerState(timerId, { remaining: timer.durationSeconds });
}

function stopTimer(timerId, { reset = true } = {}) {
  clearActiveTimerInterval();
  const state = getTimerState(timerId);
  if (!state) return;
  setTimerState(timerId, { isRunning: false });
  if (reset) resetTimer(timerId);
  updateTimerCards();
}

function stopActiveTimer({ reset = true } = {}) {
  if (!activeTimerId) return;
  stopTimer(activeTimerId, { reset });
}

function sendTimerNotification(timer) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const title = "Timer abgelaufen";
  const body = currentWorkout
    ? `${currentWorkout.title}: ${timer.name} vorbei!`
    : `${timer.name} ist abgelaufen.`;

  try {
    new Notification(title, { body, tag: `pullup-alert-timer-${timer.id}` });
  } catch (err) {
    console.warn("Konnte Timer-Notification nicht erstellen", err);
  }
}

function handleTimerFinished(timer) {
  playAlertSound();
  if (!timer.repeating) {
    sendTimerNotification(timer);
    stopTimer(timer.id, { reset: true });
    return;
  }
  resetTimer(timer.id);
  updateTimerCards();
}

function startTimer(timerId) {
  const timer = currentWorkout?.timers?.find(t => t.id === timerId);
  if (!timer) return;

  stopActiveTimer({ reset: true });
  activeTimerId = timerId;
  resetTimer(timerId);
  setTimerState(timerId, { isRunning: true });
  updateTimerCards();

  clearActiveTimerInterval();
  activeTimerIntervalId = setInterval(() => {
    const state = getTimerState(timerId);
    if (!state) return;
    const nextRemaining = state.remaining - 1;
    setTimerState(timerId, { remaining: nextRemaining });
    if (nextRemaining <= 0) {
      handleTimerFinished(timer);
      return;
    }
    updateTimerCards();
  }, 1000);
}

function toggleActiveTimer() {
  if (!activeTimerId) return;
  const state = getTimerState(activeTimerId);
  if (!state) return;
  if (state.isRunning) {
    stopTimer(activeTimerId, { reset: true });
  } else {
    startTimer(activeTimerId);
  }
}

function setActiveTimer(timerId) {
  if (!timerId || activeTimerId === timerId) return;
  stopActiveTimer({ reset: true });
  activeTimerId = timerId;
  updateTimerCards();
}

function initializeTimerState(workout) {
  timerStateById = {};
  (workout.timers || []).forEach(timer => {
    timerStateById[timer.id] = {
      remaining: timer.durationSeconds,
      isRunning: false
    };
  });
  activeTimerId = workout.timers?.[0]?.id || null;
}

function renderWorkoutTimers(workout) {
  const container = $("#workoutTimers");
  if (!container) return;
  container.innerHTML = "";

  (workout.timers || []).forEach((timer) => {
    const state = getTimerState(timer.id) || { remaining: timer.durationSeconds, isRunning: false };
    const card = document.createElement("button");
    card.type = "button";
    card.className = "workout-timer";
    card.dataset.timerId = timer.id;
    card.disabled = !allowTimerControls;
    if (timer.id === activeTimerId) card.classList.add("workout-timer--active");
    if (state.isRunning) card.classList.add("workout-timer--running");

    const header = document.createElement("div");
    header.className = "workout-timer-header";
    const name = document.createElement("span");
    name.className = "workout-timer-name";
    name.textContent = timer.name;
    header.appendChild(name);

    if (timer.repeating) {
      const repeatBadge = document.createElement("span");
      repeatBadge.className = "workout-timer-badge";
      repeatBadge.textContent = "Loop";
      header.appendChild(repeatBadge);
    }

    const time = document.createElement("div");
    time.className = "workout-timer-time";
    time.textContent = `${state.remaining}s`;

    card.appendChild(header);
    card.appendChild(time);

    card.addEventListener("click", () => {
      if (!allowTimerControls) return;
      if (activeTimerId !== timer.id) {
        setActiveTimer(timer.id);
      }
      toggleActiveTimer();
    });

    container.appendChild(card);
  });
}

function updateTimerCards() {
  if (!currentWorkout) return;
  renderWorkoutTimers(currentWorkout);
}

// ---- WORKOUT MANAGEMENT ----

// Workouts laden (localStorage > JSON)
async function loadWorkouts() {
  // 1. Versuche aus localStorage zu laden
  const localRaw = localStorage.getItem(WORKOUTS_KEY);
  let dataWorkouts = [];
  let dataExerciseVariables = DEFAULT_EXERCISE_VARIABLES;

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
        dataExerciseVariables = jsonData.exerciseVariables || DEFAULT_EXERCISE_VARIABLES;

        // Initial speichern
        saveWorkoutsToStorage(dataWorkouts);
        // Settings auch initial speichern, falls noch nicht vorhanden
        const currentSettings = loadSettings();
        if (!currentSettings.exerciseVariables) {
          saveSettings({
            ...currentSettings,
            exerciseVariables: normalizeExerciseVariables(
              applyLegacySetsReps(dataExerciseVariables, currentSettings)
            )
          });
        }
      }
    } catch (err) {
      console.error("Konnte workouts.json nicht laden", err);
    }
  }

  // Globale Settings aktualisieren
  const settings = loadSettings();
  const exerciseVariables = normalizeExerciseVariables(settings.exerciseVariables);
  let categories = normalizeCategories(settings.categories);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const categoriesByName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
  let categoriesChanged = false;
  let workoutsChanged = false;
  dataWorkouts.forEach((workout) => {
    if (workout.categoryId) return;
    const legacyLabel = workout?.label?.toString().trim();
    if (!legacyLabel) return;
    const key = legacyLabel.toLowerCase();
    let category = categoriesByName.get(key);
    if (!category) {
      category = { id: createCategoryId(), name: legacyLabel, active: true };
      categories.push(category);
      categoriesById.set(category.id, category);
      categoriesByName.set(key, category);
      categoriesChanged = true;
    }
    workout.categoryId = category.id;
    workoutsChanged = true;
  });
  dataWorkouts.forEach((workout) => {
    if (!workout.categoryId) return;
    if (!categoriesById.has(workout.categoryId)) {
      workout.categoryId = "";
      workoutsChanged = true;
    }
  });
  if (categoriesChanged) {
    saveSettings({ ...settings, categories });
  }
  if (workoutsChanged) {
    saveWorkoutsToStorage(dataWorkouts);
  }
  window.categories = categories;
  if (exerciseVariables.length) {
    window.exerciseVariables = exerciseVariables;
  } else {
    const fallbackVariables = normalizeExerciseVariables(
      applyLegacySetsReps(dataExerciseVariables, settings)
    );
    window.exerciseVariables = fallbackVariables.length ? fallbackVariables : DEFAULT_EXERCISE_VARIABLES;
    saveSettings({ ...settings, exerciseVariables: window.exerciseVariables });
  }
  const fallbackTimerDuration = typeof settings.timerDurationSeconds === "number"
    ? settings.timerDurationSeconds
    : DEFAULT_TIMER_DURATION_SECONDS;

  // Workouts verarbeiten
  const today = new Date();
  const todayKey = getTodayKey();
  const todayDayIndex = today.getDay();

  workouts = dataWorkouts.map((w) => {
    const repeating = Boolean(w.repeating);
    const repeatIntervalMinutes = normalizeRepeatInterval(w.repeatIntervalMinutes);
    const nextDueAt = w.nextDueAt ? new Date(w.nextDueAt) : null;
    const dateTime = repeating ? nextDueAt : parseTimeToDate(w.time, today);
    let daysArr = Array.isArray(w.days) && w.days.length > 0 ? w.days : ALL_WEEKDAYS;
    const daysIndex = daysArr.map((d) => WEEKDAY_MAP[d] ?? null).filter((x) => x !== null);
    const isToday = daysIndex.includes(todayDayIndex);

    return {
      ...w,
      repeating,
      repeatIntervalMinutes,
      nextDueAt,
      timers: normalizeWorkoutTimers(w.timers, fallbackTimerDuration),
      dateTime,
      days: daysArr,
      daysIndex,
      isToday,
      alertedInitially: false,
      nextReminderAt: null,
      completed: repeating ? false : isWorkoutCompleted(w.id, today),
      lastDayKey: todayKey,
    };
  });

  let repeatingUpdated = false;
  workouts.forEach((workout) => {
    if (!isRepeatingWorkout(workout) || !workout.isToday) return;
    if (!workout.nextDueAt || workout.nextDueAt < startOfDay(today)) {
      workout.nextDueAt = new Date();
      workout.dateTime = workout.nextDueAt;
      repeatingUpdated = true;
    }
  });
  if (repeatingUpdated) {
    saveWorkoutsToStorage(workouts);
  }
}

function saveWorkoutsToStorage(workoutsData) {
  // Wir speichern nur die reinen Daten, ohne Laufzeit-Properties
  const cleanWorkouts = workoutsData.map(w => ({
    id: w.id,
    time: w.time,
    title: w.title,
    categoryId: w.categoryId || "",
    days: w.days,
    exercises: w.exercises,
    timers: w.timers,
    repeating: Boolean(w.repeating),
    repeatIntervalMinutes: normalizeRepeatInterval(w.repeatIntervalMinutes),
    nextDueAt: w.nextDueAt instanceof Date ? w.nextDueAt.getTime() : (w.nextDueAt ?? null)
  }));
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify({ workouts: cleanWorkouts }));
}

// CRUD
function addWorkout(workoutData) {
  const newId = "w_" + Date.now();
  const initialCompleted = Boolean(workoutData.completed);
  const newWorkout = {
    ...workoutData,
    id: newId,
    repeating: Boolean(workoutData.repeating),
    repeatIntervalMinutes: normalizeRepeatInterval(workoutData.repeatIntervalMinutes),
    timers: normalizeWorkoutTimers(workoutData.timers, getFallbackTimerDuration())
  };
  // Zu lokaler Liste hinzufügen (mit Laufzeit-Props)
  const today = new Date();
  const todayKey = getDateKey(today);
  const todayDayIndex = today.getDay();
  const dateTime = newWorkout.repeating ? null : parseTimeToDate(newWorkout.time, today);
  const daysIndex = newWorkout.days.map((d) => WEEKDAY_MAP[d] ?? null).filter((x) => x !== null);
  const isToday = daysIndex.includes(todayDayIndex);
  const completionForToday = isWorkoutCompleted(newId, today);
  const nextDueAt = newWorkout.repeating && isToday ? new Date() : null;

  const runtimeWorkout = {
    ...newWorkout,
    dateTime: newWorkout.repeating ? nextDueAt : dateTime,
    daysIndex,
    isToday,
    alertedInitially: false,
    nextReminderAt: null,
    completed: newWorkout.repeating ? false : completionForToday,
    nextDueAt,
    lastDayKey: todayKey
  };

  if (isViewingToday()) {
    runtimeWorkout.completed = newWorkout.repeating ? false : initialCompleted;
  }

  workouts.push(runtimeWorkout);
  workouts.sort((a, b) => a.time.localeCompare(b.time)); // Nach Zeit sortieren

  saveWorkoutsToStorage(workouts);
  if (!newWorkout.repeating) {
    setWorkoutCompleted(newId, initialCompleted, activeDate);
  }
  renderOverview();
}

function updateWorkout(id, workoutData) {
  const idx = workouts.findIndex(w => w.id === id);
  if (idx === -1) return;

  const oldWorkout = workouts[idx];
  const todayDayIndex = new Date().getDay();
  const repeating = Boolean(workoutData.repeating);
  const repeatIntervalMinutes = normalizeRepeatInterval(workoutData.repeatIntervalMinutes);
  const dateTime = repeating ? null : parseTimeToDate(workoutData.time, new Date());
  const daysIndex = workoutData.days.map((d) => WEEKDAY_MAP[d] ?? null).filter((x) => x !== null);
  const isToday = daysIndex.includes(todayDayIndex);

  workouts[idx] = {
    ...oldWorkout,
    ...workoutData,
    repeating,
    repeatIntervalMinutes,
    timers: normalizeWorkoutTimers(workoutData.timers, getFallbackTimerDuration()),
    dateTime,
    daysIndex,
    isToday
  };
  if (!repeating) {
    workouts[idx].nextDueAt = null;
  } else if (workouts[idx].nextDueAt instanceof Date) {
    // keep
  } else if (workouts[idx].nextDueAt) {
    workouts[idx].nextDueAt = new Date(workouts[idx].nextDueAt);
  } else if (isToday) {
    workouts[idx].nextDueAt = new Date();
  }
  if (repeating) {
    workouts[idx].dateTime = workouts[idx].nextDueAt;
  }
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
  const container = $("#workoutList");
  updateDateNavUI();
  if (!container) return;
  container.innerHTML = "";
  const now = new Date();
  const completions = loadCompletions();
  const activeDateKey = getDateKey(activeDate);
  const isTodayView = isViewingToday();
  const isPastView = activeDate < startOfDay(new Date());

  workouts.forEach((workout) => {
    if (isCategoryHidden(workout.categoryId)) return;
    const isRepeating = isRepeatingWorkout(workout);
    const isOnSelectedDay = isWorkoutOnDate(workout, activeDate);
    const isCompleted = isRepeating ? false : Boolean(completions?.[activeDateKey]?.[workout.id]);
    const scheduledDateTime = isRepeating
      ? (workout.nextDueAt instanceof Date ? workout.nextDueAt : null)
      : parseTimeToDate(workout.time, activeDate);

    const card = document.createElement("article");
    card.className = "workout-card";
    if (isCompleted) card.classList.add("workout-card--completed");
    if (!isOnSelectedDay && !isCompleted) card.classList.add("workout-card--not-today");
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
    if (isRepeating) {
      const dueLabel = getRepeatingDueLabel(workout);
      timeEl.textContent = dueLabel || `Alle ${getRepeatMinutes(workout)} Min`;
    } else {
      timeEl.textContent = workout.time;
    }
    const labelEl = document.createElement("div");
    labelEl.className = "workout-label";
    labelEl.textContent = getCategoryName(workout.categoryId);
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
    if (isCompleted) {
      statusText = "Abgeschlossen";
      statusEl.classList.add("workout-status--completed");
    } else if (!isOnSelectedDay) {
      statusText = "Ruhetag";
      statusEl.classList.add("workout-status--not-today");
    } else if (isTodayView) {
      if (isRepeating) {
        if (scheduledDateTime && now >= scheduledDateTime) {
          statusText = "Fällig";
          statusEl.classList.add("workout-status--overdue");
        } else {
          statusText = "Geplant";
          statusEl.classList.add("workout-status--pending");
        }
      } else if (scheduledDateTime && now >= scheduledDateTime) {
        statusText = "Fällig";
        statusEl.classList.add("workout-status--overdue");
      } else {
        statusText = "Geplant";
        statusEl.classList.add("workout-status--pending");
      }
    } else if (isPastView) {
      statusText = isRepeating ? "Wiederholend" : "Nachholen";
      statusEl.classList.add(isRepeating ? "workout-status--pending" : "workout-status--overdue");
    } else {
      statusText = "Geplant";
      statusEl.classList.add("workout-status--pending");
    }
    statusEl.textContent = statusText;

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    const canStart = isOnSelectedDay && !isCompleted && (isTodayView || isPastView);
    actionBtn.className = `btn ${canStart ? "btn--primary" : "btn--ghost"}`;
    actionBtn.textContent = canStart ? "Starten" : "Vorschau";
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
  stopActiveTimer({ reset: true });
  currentWorkout = workout;
  $("#activeTitle").textContent = workout.title;
  $("#activeLabel").textContent = getCategoryName(workout.categoryId);
  if (isRepeatingWorkout(workout)) {
    $("#activeTime").textContent = `Wiederholend: alle ${getRepeatMinutes(workout)} Min`;
  } else {
    $("#activeTime").textContent = `Zeit: ${workout.time} Uhr`;
  }
  const activeDateLabel = $("#activeDate");
  if (activeDateLabel) {
    activeDateLabel.textContent = formatDateLabel(activeDate);
    activeDateLabel.classList.toggle("active-date--off", !isViewingToday());
  }

  const list = $("#activeExercises");
  list.innerHTML = "";

  const variableMap = buildExerciseVariableMap(window.exerciseVariables);
  (workout.exercises || []).forEach((text) => {
    const item = createExerciseLineElement(text, variableMap, "li");
    if (item) list.appendChild(item);
  });
  updateExerciseListSizing(list, list.children.length);

  const footer = document.querySelector('.active-footer');
  const container = document.querySelector('.active-container');
  const isCompletedForDate = isRepeatingWorkout(workout) ? false : isWorkoutCompleted(workout.id, activeDate);
  const isOnSelectedDay = isWorkoutOnDate(workout, activeDate);
  const isPastView = activeDate < startOfDay(new Date());
  const allowActiveControls = isOnSelectedDay && !isCompletedForDate && (isViewingToday() || isPastView);
  allowTimerControls = allowActiveControls;
  initializeTimerState(workout);
  renderWorkoutTimers(workout);

  if (allowActiveControls) {
    if (footer) footer.style.display = '';
    if (container) container.classList.remove('preview-mode');
  } else {
    if (footer) footer.style.display = 'none';
    if (container) container.classList.add('preview-mode');
    stopActiveTimer({ reset: true });
  }
  showView("activeView");
}

function updateExerciseListSizing(list, count) {
  if (!list) return;
  const maxItems = 5;
  const safeCount = Math.max(count, 1);
  const scale = Math.min(1, maxItems / safeCount);
  const clampedScale = Math.max(0.65, scale);
  const minSize = (1.3 * clampedScale).toFixed(2);
  const maxSize = (2.1 * clampedScale).toFixed(2);
  const vwSize = (3 * clampedScale).toFixed(2);
  const lineHeight = Math.max(1.1, 1.5 * clampedScale).toFixed(2);

  list.style.setProperty("--exercise-font-min", `${minSize}rem`);
  list.style.setProperty("--exercise-font-max", `${maxSize}rem`);
  list.style.setProperty("--exercise-font-vw", `${vwSize}vw`);
  list.style.setProperty("--exercise-line-height", lineHeight);
}

function markCurrentWorkoutCompleted() {
  if (!currentWorkout) return;
  const isRepeating = isRepeatingWorkout(currentWorkout);
  if (isRepeating) {
    const minutes = getRepeatMinutes(currentWorkout);
    currentWorkout.nextDueAt = new Date(Date.now() + minutes * 60 * 1000);
    currentWorkout.dateTime = currentWorkout.nextDueAt;
    currentWorkout.alertedInitially = false;
    currentWorkout.nextReminderAt = null;
    saveWorkoutsToStorage(workouts);
  } else {
    if (isViewingToday()) {
      currentWorkout.completed = true;
    }
    setWorkoutCompleted(currentWorkout.id, true, activeDate);
  }
  if (standUpSettings.resetOnWorkoutComplete && (!isRepeating || standUpSettings.resetOnRepeatingWorkouts)) {
    resetStandUpTimer();
  }
  stopActiveTimer({ reset: true });
  allowTimerControls = false;
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
        w.completed = isRepeatingWorkout(w) ? false : isWorkoutCompleted(w.id, now);
        w.alertedInitially = false;
        w.nextReminderAt = null;
        if (isRepeatingWorkout(w)) {
          w.isToday = w.daysIndex.includes(todayDayIndex);
          if (w.isToday) {
            if (!w.nextDueAt || w.nextDueAt < startOfDay(now)) {
              w.nextDueAt = new Date();
            }
          } else {
            w.nextDueAt = null;
          }
          w.dateTime = w.nextDueAt;
        } else {
          w.dateTime = parseTimeToDate(w.time, now);
        }
        w.lastDayKey = todayKey;
        if (!isRepeatingWorkout(w)) {
          w.isToday = w.daysIndex.includes(todayDayIndex);
        }
        saveWorkoutsToStorage(workouts);
        needsRerender = true;
      }
      if (isCategoryHidden(w.categoryId)) return;
      if (w.completed) return;
      if (!w.isToday) return;
      if (isRepeatingWorkout(w)) {
        if (!w.nextDueAt || w.nextDueAt < startOfDay(now)) {
          w.nextDueAt = new Date();
          w.alertedInitially = false;
          w.nextReminderAt = null;
          saveWorkoutsToStorage(workouts);
          needsRerender = true;
        }
        if (!w.alertedInitially && now >= w.nextDueAt) {
          w.alertedInitially = true;
          w.nextReminderAt = new Date(w.nextDueAt.getTime() + REMINDER_INTERVAL_MINUTES * 60 * 1000);
          triggerWorkoutAlert(w, false);
          needsRerender = true;
        } else if (w.alertedInitially && w.nextReminderAt && now >= w.nextReminderAt) {
          triggerWorkoutAlert(w, true);
          while (w.nextReminderAt <= now) {
            w.nextReminderAt = new Date(w.nextReminderAt.getTime() + REMINDER_INTERVAL_MINUTES * 60 * 1000);
          }
        }
      } else if (w.dateTime) {
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
      }
    });
    if (needsRerender) renderOverview();
  }, 1000);
}

function triggerWorkoutAlert(workout, isReminder) {
  playAlertSound();
  startTitleBlink();
  sendWorkoutNotification(workout, isReminder);
}

// ---- MODAL LOGIC ----

function setToggleCompletionButtonState(state) {
  const toggleBtn = $("#toggleCompletionBtn");
  if (!toggleBtn) return;

  toggleBtn.dataset.state = state;
  if (state === "completed") {
    toggleBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    toggleBtn.classList.add("btn--primary");
    toggleBtn.classList.remove("btn--ghost");
    toggleBtn.title = "Aktuell erledigt (klicken für 'noch nicht erledigt')";
  } else {
    toggleBtn.innerHTML = '<i class="fa-solid fa-x"></i>';
    toggleBtn.classList.remove("btn--primary");
    toggleBtn.classList.add("btn--ghost");
    toggleBtn.title = "Aktuell nicht erledigt (klicken für 'erledigt')";
  }
}

function toggleCompletionButtonState() {
  const toggleBtn = $("#toggleCompletionBtn");
  if (!toggleBtn) return;
  const nextState = toggleBtn.dataset.state === "completed" ? "pending" : "completed";
  setToggleCompletionButtonState(nextState);
}

function renderCategoryOptions(selectedId = "") {
  const select = $("#wfCategory");
  if (!select) return;
  select.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Keine Kategorie";
  select.appendChild(emptyOption);

  const categories = normalizeCategories(window.categories);
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });

  select.value = selectedId || "";
}

function openModal(workout = null) {
  const modal = $("#workoutModal");
  const form = $("#workoutForm");
  const deleteBtn = $("#deleteWorkoutBtn");
  const title = $("#modalTitle");
  const toggleBtn = $("#toggleCompletionBtn");
  const repeatToggle = $("#wfRepeating");
  const repeatMinutesInput = $("#wfRepeatMinutes");
  const timeInput = $("#wfTime");

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

  renderCategoryOptions(workout?.categoryId || "");

  if (workout) {
    // Edit Mode
    title.textContent = "Workout bearbeiten";
    $("#editWorkoutId").value = workout.id;
    $("#wfTitle").value = workout.title;
    $("#wfTime").value = workout.time;
    $("#wfExercises").value = (workout.exercises || []).join("\n");
    renderTimerEditor(workout.timers || []);
    repeatToggle.checked = Boolean(workout.repeating);
    repeatMinutesInput.value = getRepeatMinutes(workout);

    (workout.days || []).forEach(day => {
      const cb = daysContainer.querySelector(`input[value="${day}"]`);
      if (cb) cb.checked = true;
    });

    deleteBtn.style.display = "block";
    deleteBtn.onclick = () => {
      deleteWorkout(workout.id);
      closeModal();
    };

    toggleBtn.style.display = "inline-flex";
    const completionState = isRepeatingWorkout(workout) ? false : isWorkoutCompleted(workout.id, activeDate);
    setToggleCompletionButtonState(completionState ? "completed" : "pending");
  } else {
    // Create Mode
    title.textContent = "Neues Workout";
    deleteBtn.style.display = "none";
    toggleBtn.style.display = "inline-flex";
    setToggleCompletionButtonState("pending");
    // Default: Alle Tage ausgewählt
    daysContainer.querySelectorAll("input").forEach(cb => cb.checked = true);
    renderTimerEditor([]);
    repeatToggle.checked = false;
    repeatMinutesInput.value = DEFAULT_REPEAT_INTERVAL_MINUTES;
  }

  if (repeatToggle) {
    repeatToggle.onchange = () => {
      updateRepeatFields();
    };
  }

  function updateRepeatFields() {
    const isRepeating = repeatToggle?.checked;
    if (timeInput) {
      timeInput.disabled = Boolean(isRepeating);
      timeInput.required = !isRepeating;
      if (isRepeating && !timeInput.value) {
        timeInput.value = "00:00";
      }
    }
    if (repeatMinutesInput) {
      repeatMinutesInput.disabled = !isRepeating;
    }
    if (toggleBtn) {
      toggleBtn.style.display = isRepeating ? "none" : "inline-flex";
    }
  }

  updateRepeatFields();
  updateModalPreview();
  modal.classList.remove("modal--hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const modal = $("#workoutModal");
  modal.classList.add("modal--hidden");
  modal.setAttribute("aria-hidden", "true");
}

function openSettingsModal() {
  const modal = $("#settingsModal");
  if (!modal) return;
  modal.classList.remove("modal--hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeSettingsModal() {
  const modal = $("#settingsModal");
  if (!modal) return;
  modal.classList.add("modal--hidden");
  modal.setAttribute("aria-hidden", "true");
}

function updateModalPreview() {
  const text = $("#wfExercises").value;
  const preview = $("#wfPreview");
  if (!text.trim()) {
    preview.textContent = "-";
    preview.classList.add("preview-empty");
    return;
  }
  preview.innerHTML = "";
  preview.classList.remove("preview-empty");
  const lines = text.split("\n");
  const variableMap = buildExerciseVariableMap(window.exerciseVariables);
  lines.forEach((line) => {
    const item = createExerciseLineElement(line, variableMap, "div");
    if (item) preview.appendChild(item);
  });
}

function createTimerEditorRow(timer, container) {
  const row = document.createElement("div");
  row.className = "timer-row";
  row.dataset.timerId = timer.id || createTimerId();

  const fields = document.createElement("div");
  fields.className = "timer-row-fields";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "timer-name-input";
  nameInput.placeholder = "Timer Name";
  nameInput.value = timer.name || "";

  const secondsInput = document.createElement("input");
  secondsInput.type = "number";
  secondsInput.min = "1";
  secondsInput.max = "999";
  secondsInput.className = "timer-seconds-input";
  secondsInput.value = timer.durationSeconds || getFallbackTimerDuration();

  const secondsLabel = document.createElement("label");
  secondsLabel.className = "timer-seconds-label";
  secondsLabel.appendChild(secondsInput);
  secondsLabel.append("Sek.");

  const repeatLabel = document.createElement("label");
  repeatLabel.className = "timer-repeat";
  const repeatInput = document.createElement("input");
  repeatInput.type = "checkbox";
  repeatInput.className = "timer-repeat-input";
  repeatInput.checked = Boolean(timer.repeating);
  repeatLabel.appendChild(repeatInput);
  repeatLabel.append(" Loop");

  fields.appendChild(nameInput);
  fields.appendChild(secondsLabel);
  fields.appendChild(repeatLabel);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn--ghost timer-remove";
  removeBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
  removeBtn.setAttribute("aria-label", "Timer entfernen");
  removeBtn.setAttribute("title", "Timer entfernen");
  removeBtn.addEventListener("click", () => {
    row.remove();
    if (!container.querySelector(".timer-row")) {
      addTimerEditorRow(container);
    }
  });

  row.appendChild(fields);
  row.appendChild(removeBtn);
  return row;
}

function addTimerEditorRow(container) {
  if (!container) return;
  const index = container.querySelectorAll(".timer-row").length + 1;
  const timer = {
    id: createTimerId(),
    name: `Timer ${index}`,
    durationSeconds: getFallbackTimerDuration(),
    repeating: false
  };
  container.appendChild(createTimerEditorRow(timer, container));
}

function renderTimerEditor(timers = []) {
  const container = $("#wfTimersContainer");
  if (!container) return;
  container.innerHTML = "";
  const safeTimers = normalizeWorkoutTimers(timers, getFallbackTimerDuration());
  safeTimers.forEach(timer => {
    container.appendChild(createTimerEditorRow(timer, container));
  });
}

function handleModalSubmit(e) {
  e.preventDefault();
  const id = $("#editWorkoutId").value;
  const title = $("#wfTitle").value;
  const categoryId = $("#wfCategory").value;
  const time = $("#wfTime").value;
  const repeating = Boolean($("#wfRepeating").checked);
  const repeatMinutesInput = $("#wfRepeatMinutes").value;
  const repeatIntervalMinutes = normalizeRepeatInterval(repeatMinutesInput);
  const exercises = $("#wfExercises").value.split("\n").filter(line => line.trim() !== "");
  const timerRows = Array.from(document.querySelectorAll("#wfTimersContainer .timer-row"));
  const timers = timerRows.map((row, index) => {
    const nameInput = row.querySelector(".timer-name-input");
    const secondsInput = row.querySelector(".timer-seconds-input");
    const repeatInput = row.querySelector(".timer-repeat-input");
    let duration = parseInt(secondsInput?.value, 10);
    if (isNaN(duration) || duration < 1) duration = getFallbackTimerDuration();
    if (duration > 999) duration = 999;

    return {
      id: row.dataset.timerId || createTimerId(),
      name: nameInput?.value.trim() || `Timer ${index + 1}`,
      durationSeconds: duration,
      repeating: Boolean(repeatInput?.checked)
    };
  });

  const selectedDays = Array.from(document.querySelectorAll("#wfDaysContainer input:checked"))
    .map(cb => cb.value);

  const toggleBtn = $("#toggleCompletionBtn");
  const completionState = repeating ? null : (toggleBtn ? toggleBtn.dataset.state === "completed" : null);

  const data = {
    title,
    categoryId,
    time: repeating ? (time || "00:00") : time,
    repeating,
    repeatIntervalMinutes,
    days: selectedDays,
    exercises,
    timers: normalizeWorkoutTimers(timers, getFallbackTimerDuration())
  };

  if (id) {
    if (completionState !== null) {
      data.completed = completionState;
    }
    updateWorkout(id, data);
    if (completionState !== null) {
      setWorkoutCompleted(id, completionState, activeDate);
      const updatedWorkout = workouts.find((w) => w.id === id);
      if (updatedWorkout && isViewingToday()) {
        updatedWorkout.completed = completionState;
      }
    }
  } else {
    data.completed = completionState ?? false;
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
      const min = parseInt(input.getAttribute("min"), 10) || 1;
      const max = parseInt(input.getAttribute("max"), 10) || 99;
      if (val < min) val = min;
      if (val > max) val = max;

      input.value = val;
      // Trigger change event manually
      input.dispatchEvent(new Event("change"));
    });
  });
}

function updateExerciseVariablePrefixList() {
  const listEl = $("#exercisePrefixList");
  if (!listEl) return;
  const variables = normalizeExerciseVariables(window.exerciseVariables);
  if (!variables.length) {
    listEl.textContent = "Noch keine Prefixes definiert.";
    return;
  }
  const prefixes = variables.map(variable => variable.prefix).join(", ");
  listEl.textContent = `Verfügbare Prefixes: ${prefixes}`;
}

function generateUniquePrefix(base, variables) {
  const upperBase = sanitizePrefix(base || "VAR");
  const existing = new Set(variables.map(variable => variable.prefix));
  if (!existing.has(upperBase)) return upperBase;
  let index = 2;
  while (existing.has(`${upperBase}${index}`)) {
    index += 1;
  }
  return `${upperBase}${index}`;
}

function renderExerciseVariablesSettings() {
  const container = $("#exerciseVariablesList");
  if (!container) return;
  container.innerHTML = "";

  const variables = normalizeExerciseVariables(window.exerciseVariables);

  variables.forEach((variable, index) => {
    const row = document.createElement("div");
    row.className = "exercise-variable-row";
    row.dataset.index = String(index);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = variable.name;
    nameInput.placeholder = "Übung";
    nameInput.dataset.field = "name";

    const prefixInput = document.createElement("input");
    prefixInput.type = "text";
    prefixInput.value = variable.prefix;
    prefixInput.placeholder = "Prefix";
    prefixInput.dataset.field = "prefix";

    const setsInput = document.createElement("input");
    setsInput.type = "number";
    setsInput.min = "1";
    setsInput.max = "99";
    setsInput.value = variable.sets;
    setsInput.placeholder = "Sets";
    setsInput.dataset.field = "sets";

    const repsInput = document.createElement("input");
    repsInput.type = "number";
    repsInput.min = "1";
    repsInput.max = "999";
    repsInput.value = variable.reps;
    repsInput.placeholder = "Reps";
    repsInput.dataset.field = "reps";

    const actions = document.createElement("div");
    actions.className = "exercise-variable-actions";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost";
    removeBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
    removeBtn.setAttribute("aria-label", "Variable löschen");
    removeBtn.setAttribute("title", "Variable löschen");
    actions.appendChild(removeBtn);

    [nameInput, prefixInput, setsInput, repsInput].forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        const current = normalizeExerciseVariables(window.exerciseVariables);
        if (!current[index]) return;
        const updated = [...current];
        if (field === "name") {
          updated[index] = { ...updated[index], name: input.value.trim() || updated[index].prefix };
        }
        if (field === "prefix") {
          updated[index] = { ...updated[index], prefix: sanitizePrefix(input.value) };
        }
        if (field === "sets") {
          updated[index] = { ...updated[index], sets: Math.max(1, parseInt(input.value, 10) || 1) };
        }
        if (field === "reps") {
          updated[index] = { ...updated[index], reps: Math.max(1, parseInt(input.value, 10) || 1) };
        }
        saveExerciseVariables(updated);
        renderExerciseVariablesSettings();
        updateExerciseVariablePrefixList();
        updateModalPreview();
      });
    });

    removeBtn.addEventListener("click", () => {
      const current = normalizeExerciseVariables(window.exerciseVariables);
      const updated = current.filter((_, idx) => idx !== index);
      saveExerciseVariables(updated);
      renderExerciseVariablesSettings();
      updateExerciseVariablePrefixList();
      updateModalPreview();
    });

    row.appendChild(nameInput);
    row.appendChild(prefixInput);
    row.appendChild(setsInput);
    row.appendChild(repsInput);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function saveCategories(categories) {
  const settings = loadSettings();
  const normalized = normalizeCategories(categories);
  saveSettings({ ...settings, categories: normalized });
  window.categories = normalized;
}

function updateWorkoutsForCategoryRemoval(categoryId) {
  let updated = false;
  workouts = workouts.map((workout) => {
    if (workout.categoryId !== categoryId) return workout;
    updated = true;
    return { ...workout, categoryId: "" };
  });
  if (updated) {
    saveWorkoutsToStorage(workouts);
    renderOverview();
  }
  if (currentWorkout?.categoryId === categoryId) {
    currentWorkout = { ...currentWorkout, categoryId: "" };
  }
}

function renderCategorySettings() {
  const container = $("#categorySettingsList");
  if (!container) return;
  container.innerHTML = "";

  const categories = normalizeCategories(window.categories);
  if (!categories.length) {
    const empty = document.createElement("p");
    empty.className = "hint-small";
    empty.textContent = "Noch keine Kategorien angelegt.";
    container.appendChild(empty);
    return;
  }

  categories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.dataset.id = category.id;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = category.name;
    nameInput.placeholder = "Kategorie";

    const toggleWrap = document.createElement("div");
    toggleWrap.className = "category-toggle";
    const toggleLabel = document.createElement("span");
    toggleLabel.textContent = "Aktiv";
    const toggle = document.createElement("label");
    toggle.className = "switch";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.checked = category.active;
    const slider = document.createElement("span");
    slider.className = "slider round";
    toggle.appendChild(toggleInput);
    toggle.appendChild(slider);
    toggleWrap.appendChild(toggleLabel);
    toggleWrap.appendChild(toggle);

    const actions = document.createElement("div");
    actions.className = "category-actions";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn--ghost";
    removeBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
    removeBtn.setAttribute("aria-label", "Kategorie löschen");
    removeBtn.setAttribute("title", "Kategorie löschen");
    actions.appendChild(removeBtn);

    nameInput.addEventListener("change", () => {
      const updated = normalizeCategories(window.categories).map((item) => {
        if (item.id !== category.id) return item;
        return { ...item, name: nameInput.value.trim() || item.name };
      });
      saveCategories(updated);
      renderCategorySettings();
      renderCategoryOptions(category.id);
      renderOverview();
    });

    toggleInput.addEventListener("change", () => {
      const updated = normalizeCategories(window.categories).map((item) => {
        if (item.id !== category.id) return item;
        return { ...item, active: toggleInput.checked };
      });
      saveCategories(updated);
      renderOverview();
    });

    removeBtn.addEventListener("click", () => {
      if (!confirm("Kategorie wirklich löschen?")) return;
      const updated = normalizeCategories(window.categories).filter((item) => item.id !== category.id);
      saveCategories(updated);
      updateWorkoutsForCategoryRemoval(category.id);
      renderCategorySettings();
      renderCategoryOptions();
      renderOverview();
    });

    row.appendChild(nameInput);
    row.appendChild(toggleWrap);
    row.appendChild(actions);
    container.appendChild(row);
  });
}


// Event-Handler
function setupEventListeners() {
  const prevDayBtn = $("#prevDayBtn");
  const nextDayBtn = $("#nextDayBtn");
  const todayBtn = $("#todayBtn");

  if (prevDayBtn) prevDayBtn.addEventListener("click", () => changeActiveDateBy(-1));
  if (nextDayBtn) nextDayBtn.addEventListener("click", () => changeActiveDateBy(1));
  if (todayBtn) todayBtn.addEventListener("click", () => setActiveDate(new Date()));

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
    stopActiveTimer({ reset: true });
    allowTimerControls = false;
    showView("overviewView");
    stopTitleBlink();
    document.title = BASE_TITLE;
  });

  $("#completeButton").addEventListener("click", () => {
    markCurrentWorkoutCompleted();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;

    const target = event.target;
    const isTypingField = target instanceof HTMLElement && (
      target.isContentEditable ||
      ["INPUT", "TEXTAREA"].includes(target.tagName)
    );

    if (isTypingField) return;

    event.preventDefault();
    if (!allowTimerControls) return;
    toggleActiveTimer();
  });

  // Modal Events
  $("#addWorkoutBtn").addEventListener("click", () => openModal());
  $("#closeModalBtn").addEventListener("click", closeModal);
  $("#cancelModalBtn").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", closeModal);
  $("#workoutForm").addEventListener("submit", handleModalSubmit);
  $("#wfExercises").addEventListener("input", updateModalPreview);
  $("#toggleCompletionBtn").addEventListener("click", toggleCompletionButtonState);
  const addTimerBtn = $("#addTimerBtn");
  if (addTimerBtn) {
    addTimerBtn.addEventListener("click", () => {
      const container = $("#wfTimersContainer");
      addTimerEditorRow(container);
    });
  }

  const openSettingsBtn = $("#openSettingsBtn");
  const closeSettingsBtn = $("#closeSettingsBtn");
  const settingsBackdrop = $("#settingsModalBackdrop");

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", openSettingsModal);
  }
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", closeSettingsModal);
  }
  if (settingsBackdrop) {
    settingsBackdrop.addEventListener("click", closeSettingsModal);
  }

  const addExerciseVariableBtn = $("#addExerciseVariable");
  if (addExerciseVariableBtn) {
    addExerciseVariableBtn.addEventListener("click", () => {
      const current = normalizeExerciseVariables(window.exerciseVariables);
      const prefix = generateUniquePrefix("VAR", current);
      const updated = [
        ...current,
        { name: "Neue Übung", prefix, sets: 2, reps: 3 }
      ];
      saveExerciseVariables(updated);
      renderExerciseVariablesSettings();
      updateExerciseVariablePrefixList();
      updateModalPreview();
    });
  }

  const addCategoryBtn = $("#addCategoryBtn");
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", () => {
      const current = normalizeCategories(window.categories);
      const newCategory = {
        id: createCategoryId(),
        name: "Neue Kategorie",
        active: true
      };
      const updated = [...current, newCategory];
      saveCategories(updated);
      renderCategorySettings();
      renderCategoryOptions(newCategory.id);
      renderOverview();
    });
  }
}

// Initialisierung
async function initApp() {
  await loadWorkouts();
  renderOverview();
  setupEventListeners();
  setupCustomInputs();

  window.exerciseVariables = getExerciseVariables();
  renderExerciseVariablesSettings();
  updateExerciseVariablePrefixList();
  renderCategorySettings();

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
  maxDur: 20,
  resetOnWorkoutComplete: false,
  resetOnRepeatingWorkouts: false
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
  const resetOnWorkoutToggle = $("#suResetOnWorkout");
  const resetOnRepeatingToggle = $("#suResetOnRepeatingWorkouts");
  const resetOnRepeatingGroup = $("#suResetOnRepeatingGroup");

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

  if (resetOnWorkoutToggle) {
    resetOnWorkoutToggle.checked = Boolean(standUpSettings.resetOnWorkoutComplete);
    resetOnWorkoutToggle.addEventListener("change", (e) => {
      standUpSettings.resetOnWorkoutComplete = e.target.checked;
      saveStandUpSettings();
      updateRepeatingResetState();
    });
  }

  if (resetOnRepeatingToggle) {
    resetOnRepeatingToggle.checked = Boolean(standUpSettings.resetOnRepeatingWorkouts);
    resetOnRepeatingToggle.addEventListener("change", (e) => {
      standUpSettings.resetOnRepeatingWorkouts = e.target.checked;
      saveStandUpSettings();
    });
  }

  const updateRepeatingResetState = () => {
    if (!resetOnRepeatingToggle) return;
    const enabled = Boolean(standUpSettings.resetOnWorkoutComplete);
    resetOnRepeatingToggle.disabled = !enabled;
    if (resetOnRepeatingGroup) {
      resetOnRepeatingGroup.classList.toggle("setting-group--disabled", !enabled);
    }
  };

  updateRepeatingResetState();

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
