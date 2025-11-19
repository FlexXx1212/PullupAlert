# Pullup Alert – Klimmzug-Routine SPA

Single Page App als Reminder und Übungsanzeige für tägliche Klimmzug-Einheiten

## Features

- Workouts + Zeiten zentral in `workouts.json` (JSON-Format, flexibel erweiterbar).
- Automatische Alerts zu den definierten Uhrzeiten:
  - Blinkender Tab-Titel, bis der Tab wieder aktiv ist.
  - Anzeige des passenden Workouts im Vollbild mit großer Schrift.
- 75-Sekunden-Timer, der automatisch immer wieder neu startet.
- Button „Workout abschließen“:
  - Markiert das Workout als erledigt (tagesbasiert, via `localStorage`).
  - Rückkehr zur Übersicht, erledigte Workouts werden ausgraut.
- Nicht abgeschlossene Workouts:
  - Erinnerung alle 30 Minuten mit erneutem Signalton und Anzeige.
- Dark-Theme (dunkelgrau) mit cyanfarbenen Akzenten, schlicht und modern.
- Vollständig statisch, kompatibel mit GitHub Pages.

## Dateien

- `index.html` – Einstieg und Struktur der SPA.
- `style.css` – Styling (Dark Mode, Karten, Timer, etc.).
- `app.js` – Logik für Timer, Reminder, Status, Routing zwischen den Views.
- `workouts.json` – Workout-Plan im JSON-Format (hier Uhrzeiten + Inhalte bearbeiten).

## Anpassungen

1. **Workout-Zeiten ändern:**

   Öffne `workouts.json` und passe die `time`-Felder an (Format `HH:MM`, 24h):

   ```json
   {
     "id": "morning",
     "time": "10:30",
     "title": "Einheit 1 – Rücken & Bizeps",
     "label": "Morgens",
     "exercises": [ "...", "..." ]
   }
