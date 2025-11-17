// Pullup Alert – SPA-Logik
// - Workouts & Zeiten werden ausschließlich in workouts.json gepflegt
// - Abschluss-Status wird pro Tag in localStorage gespeichert

const BASE_TITLE = "Pullup Alert";
const REMINDER_INTERVAL_MINUTES = 30;
const TIMER_DURATION_SECONDS = 75;
const STORAGE_KEY = "pullup-alert-completions";

let workouts = []; // wird aus workouts.json geladen
let currentWorkout = null;
let countdownIntervalId = null;
let blinkIntervalId = null;
let isBlinking = false;

// Hilfsfunktionen für Datum/Zeit

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseTimeToTodayDate(timeStr) {
  // timeStr im Format "HH:MM"
  const [hourStr, minuteStr] = timeStr.split(":");
  const now = new Date();
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(hourStr),
    Number(minuteStr),
    0,
    0
  );
  return d;
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

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    // Tab wurde wieder aktiv → Blinken beenden
    stopTitleBlink();
  }
});

// Audio

function playAlertSound() {
  const audio = $("#alertSound");
  if (!audio) return;
  // Hinweis: Browser blocken evtl. Autoplay ohne vorherige User-Interaktion
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
      remaining = TIMER_DURATION_SECONDS; // Loop von vorn
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
  const todayKey = getTodayKey();

  workouts = (data.workouts || []).map((w) => {
    const dateTime = parseTimeToTodayDate(w.time);
    return {
      ...w,
      dateTime,
      alertedInitially: false,
      nextReminderAt: null,
      completed: isWorkoutCompleted(w.id),
      lastDayKey: todayKey,
    };
  });
}

// Übersicht rendern

function renderOverview() {
  const container = $("#workoutList");
  if (!container) return;
  container.innerHTML = "";

  const now = new Date();

  workouts.forEach((workout) => {
    const card = document.createElement("article");
    card.className = "workout-card";
    if (workout.completed) {
      card.classList.add("workout-card--completed");
    }
    card.dataset.workoutId = workout.id;

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

    const titleEl = document.createElement("h3");
    titleEl.className = "workout-title";
    titleEl.textContent = workout.title;

    const meta = document.createElement("div");
    meta.className = "workout-meta";

    const statusEl = document.createElement("span");
    statusEl.className = "workout-status";

    let statusText = "Geplant";
    if (workout.completed) {
      statusText = "Heute abgeschlossen";
      statusEl.classList.add("workout-status--completed");
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
    actionBtn.textContent = workout.completed ? "Erledigt" : "Starten";
    actionBtn.disabled = workout.completed;
    actionBtn.dataset.action = "openWorkout";
    actionBtn.dataset.workoutId = workout.id;

    meta.appendChild(statusEl);
    meta.appendChild(actionBtn);

    card.appendChild(header);
    card.appendChild(titleEl);
    card.appendChild(meta);

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
  (workout.exercises || []).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  });

  showView("activeView");
  startCountdown();
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
  // Läuft einmal pro Sekunde – kümmert sich um:
  // - Uhrzeit-Anzeige
  // - Erst-Alerts zur Workout-Zeit
  // - 30-Minuten-Reminder
  setInterval(() => {
    updateCurrentTimeDisplay();
    const now = new Date();
    const todayKey = getTodayKey();

    workouts.forEach((w) => {
      // Falls Tag gewechselt wurde (Seite lief über Mitternacht)
      if (w.lastDayKey !== todayKey) {
        w.completed = false;
        w.alertedInitially = false;
        w.nextReminderAt = null;
        w.dateTime = parseTimeToTodayDate(w.time);
        w.lastDayKey = todayKey;
      }

      if (w.completed) return;
      if (!w.dateTime) return;

      // Noch kein Erst-Alert → sobald Zeit erreicht ist, auslösen
      if (!w.alertedInitially && now >= w.dateTime) {
        w.alertedInitially = true;
        w.nextReminderAt = new Date(
          w.dateTime.getTime() + REMINDER_INTERVAL_MINUTES * 60 * 1000
        );
        triggerWorkoutAlert(w, false);
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

    // Übersicht aktualisieren, damit Status "Fällig" sichtbar wird
    renderOverview();
  }, 1000);
}

function triggerWorkoutAlert(workout, isReminder) {
  // Aktives Workout anzeigen
  showActiveWorkout(workout);

  // Sound & Tab-Blinken
  playAlertSound();
  startTitleBlink();

  // Option: man könnte Reminder im UI kenntlich machen, aktuell identisch
  console.log(
    `Workout-Alert: ${workout.title} (${workout.time})`,
    isReminder ? "[Reminder]" : "[Erst-Alert]"
  );
}

// Event-Handler

function setupEventListeners() {
  // Übersicht: Buttons "Starten"
  const list = $("#workoutList");
  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.action === "openWorkout") {
      const workoutId = target.dataset.workoutId;
      const workout = workouts.find((w) => w.id === workoutId);
      if (workout && !workout.completed) {
        showActiveWorkout(workout);
      }
    }
  });

  // Zurück-Button
  $("#backToOverview").addEventListener("click", () => {
    stopCountdown();
    showView("overviewView");
    stopTitleBlink();
    document.title = BASE_TITLE;
  });

  // Workout abschließen
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
  setupReminderTicker();
  updateCurrentTimeDisplay();
  document.title = BASE_TITLE;
}

document.addEventListener("DOMContentLoaded", initApp);
