// Konstanten für Settings-Storage
const SETTINGS_KEY = "pullup-alert-settings";

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
  } catch {}
}

// Platzhalter in Übungstexten ersetzen, inkl. Mathe-Ausdrücke
function resolveExerciseText(text, sets, repeats) {
  // Ersetze [SETS], [REPEATS] und Mathe-Ausdrücke wie [REPEATS-1], [SETS*REPEATS*2] usw.
  return text.replace(/\[(.*?)\]/g, (match, expr) => {
    let safeExpr = expr
      .replace(/SETS/gi, sets)
      .replace(/REPEATS/gi, repeats);
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
// - Workouts & Zeiten werden ausschließlich in workouts.json gepflegt
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

let workouts = []; // wird aus workouts.json geladen
let currentWorkout = null;
let countdownIntervalId = null;
let blinkIntervalId = null;
let isBlinking = false;

// ---- Notification API ----
// Fordert beim Initialisieren der App die Berechtigung für Desktop‑Benachrichtigungen an.
function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    try {
      Notification.requestPermission().catch(() => {});
    } catch (err) {
      console.warn("Notification permission request failed", err);
    }
  }
  // Wenn der Tab wieder aktiv wird, Blinken stoppen
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      stopTitleBlink();
    }
  });
}

// Erstellt eine Desktop‑Benachrichtigung für ein fälliges Workout.
function sendWorkoutNotification(workout, isReminder) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  // Zeige keine Notification, wenn der Tab sichtbar ist
  if (document.visibilityState == "visible") return;
  const title = isReminder ? "Workout Erinnerung" : "Workout jetzt starten";
  const body = workout.title;
  try {
    const notification = new Notification(title, { body: body, tag: workout.id });
    notification.onclick = (event) => {
      event.preventDefault();
      try {
        window.focus();
      } catch (_) {}
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
  // Spiele Sound nur, wenn Seite sichtbar ist (Autoplay-Beschränkungen)
  if (document.visibilityState !== "visible") return;
  const audio = $("#alertSound");
  if (!audio) return;
  audio.currentTime = 0;
  audio
    .play()
    .catch((err) => console.warn("Audio konnte evtl. nicht automatisch abgespielt werden:", err));
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

// Workouts aus JSON laden & anreichern
async function loadWorkouts() {
  const response = await fetch("workouts.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Konnte workouts.json nicht laden");
  }
  const data = await response.json();
  // sets & repeats global speichern für resolveExerciseText
  const settings = loadSettings();
  window.defaultSets = data.sets;
  window.defaultRepeats = data.repeats;
  window.sets = typeof settings.sets === "number" ? settings.sets : data.sets;
  window.repeats = typeof settings.repeats === "number" ? settings.repeats : data.repeats;
  const todayKey = getTodayKey();
  const todayDayIndex = new Date().getDay();
  workouts = (data.workouts || []).map((w) => {
    const dateTime = parseTimeToTodayDate(w.time);
    // Wochentage aus dem JSON lesen; wenn nicht definiert, alle Tage
    let daysArr;
    if (Array.isArray(w.days) && w.days.length > 0) {
      daysArr = w.days;
    } else {
      daysArr = ALL_WEEKDAYS;
    }
    // in Indexe umwandeln
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

// Übersicht rendern
function renderOverview() {
  // Settings-Inputs initialisieren
  const setsInput = $("#setsInput");
  const repeatsInput = $("#repeatsInput");
  if (setsInput && repeatsInput) {
    setsInput.value = window.sets;
    repeatsInput.value = window.repeats;
  }
  const container = $("#workoutList");
  if (!container) return;
  container.innerHTML = "";
  const now = new Date();
  workouts.forEach((workout) => {
    const card = document.createElement("article");
    card.className = "workout-card";
    // Klasse für erledigte Workouts
    if (workout.completed) {
      card.classList.add("workout-card--completed");
    }
    // Klasse für Workouts, die nicht am heutigen Tag stattfinden
    if (!workout.isToday && !workout.completed) {
      card.classList.add("workout-card--not-today");
    }
    card.dataset.workoutId = workout.id;
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
    // Meta + Status + Action
    const meta = document.createElement("div");
    meta.className = "workout-meta";
    const statusEl = document.createElement("span");
    statusEl.className = "workout-status";
    let statusText;
    if (workout.completed) {
      statusText = "Heute abgeschlossen";
      statusEl.classList.add("workout-status--completed");
    } else if (!workout.isToday) {
      // Nicht heutiger Tag
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
    // Button-Text und Aktionsregeln
    if (workout.completed) {
      actionBtn.textContent = "Vorschau";
    } else if (!workout.isToday) {
      actionBtn.textContent = "Vorschau";
    } else {
      actionBtn.textContent = "Starten";
    }
    actionBtn.disabled = false;
    actionBtn.dataset.action = "openWorkout";
    actionBtn.dataset.workoutId = workout.id;
    meta.appendChild(statusEl);
    meta.appendChild(actionBtn);
    // Wochentage-Label hinzufügen
    const daysEl = document.createElement("div");
    daysEl.className = "workout-days";
    // Wenn Tage definiert, zeige sie, ansonsten leere Zeichenfolge
    daysEl.textContent = (workout.days || []).join(", ");
    // Zusammenbauen der Karte
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
  $("#activeGrip").textContent = `Griff: ${workout.grip}`;
  const list = $("#activeExercises");
  list.innerHTML = "";
  // Hole sets und repeats aus globalen Daten (workouts.json oder Settings)
  const sets = typeof window.sets === "number" ? window.sets : window.defaultSets || 2;
  const repeats = typeof window.repeats === "number" ? window.repeats : window.defaultRepeats || 3;
  (workout.exercises || []).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = resolveExerciseText(text, sets, repeats);
    list.appendChild(li);
  });
  const footer = document.querySelector('.active-footer');
  const container = document.querySelector('.active-container');
  // Vorschau-Modus für erledigte oder nicht-heutige Workouts
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

// Abschluss / Rückkehr zur Übersicht
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
      // Falls Tag gewechselt wurde (Seite lief über Mitternacht)
      if (w.lastDayKey !== todayKey) {
        w.completed = false;
        w.alertedInitially = false;
        w.nextReminderAt = null;
        w.dateTime = parseTimeToTodayDate(w.time);
        w.lastDayKey = todayKey;
        // Aktualisiere isToday basierend auf daysIndex
        w.isToday = w.daysIndex.includes(todayDayIndex);
        needsRerender = true;
      }
      // Erledigte oder nicht-heutige Workouts überspringen
      if (w.completed) return;
      if (!w.isToday) return;
      if (!w.dateTime) return;
      // Noch kein Erst-Alert → sobald Zeit erreicht ist, auslösen
      if (!w.alertedInitially && now >= w.dateTime) {
        w.alertedInitially = true;
        w.nextReminderAt = new Date(
          w.dateTime.getTime() + REMINDER_INTERVAL_MINUTES * 60 * 1000
        );
        triggerWorkoutAlert(w, false);
        needsRerender = true;
      } else if (w.alertedInitially && w.nextReminderAt && now >= w.nextReminderAt) {
        // Reminder alle 30 Minuten, solange nicht abgeschlossen
        triggerWorkoutAlert(w, true);
        // Nächste Reminderzeit setzen, evtl. mehrfach nachholen, falls Seite länger inaktiv
        while (w.nextReminderAt <= now) {
          w.nextReminderAt = new Date(
            w.nextReminderAt.getTime() +
              REMINDER_INTERVAL_MINUTES * 60 * 1000
          );
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
  console.log(
    `Workout-Alert: ${workout.title} (${workout.time})`,
    isReminder ? "[Reminder]" : "[Erst-Alert]"
  );
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
}

// Initialisierung
async function initApp() {
  try {
    await loadWorkouts();
  } catch (err) {
    console.error(err);
    alert(
      "Fehler beim Laden der workouts.json. Bitte stelle sicher, dass die Datei vorhanden ist."
    );
    return;
  }
  renderOverview();
  setupEventListeners();
  // Settings-Form Events
  const setsInput = $("#setsInput");
  const repeatsInput = $("#repeatsInput");
  if (setsInput && repeatsInput) {
    setsInput.addEventListener("change", () => {
      let val = parseInt(setsInput.value, 10);
      if (isNaN(val) || val < 1) val = window.defaultSets || 2;
      window.sets = val;
      saveSettings({ ...loadSettings(), sets: val, repeats: window.repeats });
      renderOverview();
    });
    repeatsInput.addEventListener("change", () => {
      let val = parseInt(repeatsInput.value, 10);
      if (isNaN(val) || val < 1) val = window.defaultRepeats || 3;
      window.repeats = val;
      saveSettings({ ...loadSettings(), sets: window.sets, repeats: val });
      renderOverview();
    });
  }
  setupReminderTicker();
  updateCurrentTimeDisplay();
  document.title = BASE_TITLE;
  requestNotificationPermission();
}

document.addEventListener("DOMContentLoaded", initApp);