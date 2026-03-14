# My Work Time Tracker for Visual Studio Code

A minimal VSCode extension for tracking work time in a plain text file.

## How it works

Click the **$(watch) Start task** button in the status bar to begin a task. The tracking file opens automatically with the cursor ready for you to type a description. Click **$(watch) Stop task** when you're done.

## File format

Records are written in descending order (newest first). Each day is separated by a dashed line. Every line is prefixed with `; N.` where `N` is the per-day task number, making the file easy to parse.

```
---------------------------------------------------------------
; 2. 2026-03-14 Sat 10:00
; 2. Submit timesheets
; 2. 2026-03-14 Sat 10:15

; 1. 2026-03-14 Sat 09:00
; 1. Stand-up meeting
; 1. 2026-03-14 Sat 09:20

---------------------------------------------------------------
; 1. 2026-03-13 Fri 09:15
; 1. Fix login bug
; 1. 2026-03-13 Fri 11:45
```

- Task numbers reset to 1 each day
- The description line is written by you directly in the file
- An empty line separates each task

## Settings

| Setting                | Default               | Description                                                 |
|------------------------|-----------------------|-------------------------------------------------------------|
| `timeTracker.filePath` | `~/time-tracking.txt` | Path to the tracking file. Supports `~` for home directory. |

## Usage

1. Click **Start task** in the status bar (bottom left)
2. The file opens — type your task description after `; N. ` and save
3. Click **Stop task** when finished

The button turns yellow while a task is in progress. Feel free to close the file, or VSCode itself - the extension will be able to catch up with you.
