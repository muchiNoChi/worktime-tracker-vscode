import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SEPARATOR = '---------------------------------------------------------------';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Matches: "; 3. 2026-03-08 Mon 09:15"
const TIMESTAMP_RE = /^; \d+\. \d{4}-\d{2}-\d{2} \w{3} \d{2}:\d{2}$/;

function getFilePath(): string {
  const cfg = vscode.workspace.getConfiguration('timeTracker');
  const rawPath = cfg.get<string>('filePath', '~/time-tracking.txt');
  return rawPath.startsWith('~')
    ? path.join(os.homedir(), rawPath.slice(1))
    : rawPath;
}

function formatTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const day = DAY_NAMES[date.getDay()];
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${day} ${hh}:${min}`;
}

function formatDateOnly(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const day = DAY_NAMES[date.getDay()];
  return `${yyyy}-${mm}-${dd} ${day}`;
}

function ensureFileExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf8');
  }
}

function readLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

/**
 * A task is open if the count of timestamp lines for today is odd
 * (opening written, closing not yet written).
 */
function deriveIsTracking(filePath: string, todayPrefix: string): boolean {
  const lines = readLines(filePath);
  let count = 0;
  for (const line of lines) {
    if (TIMESTAMP_RE.test(line) && line.includes(todayPrefix)) {
      count++;
    }
  }
  return count % 2 === 1;
}

/**
 * Next task number for today = floor(timestampCount / 2) + 1.
 * Works for both start (even count) and stop (odd count — same number as the open task).
 */
function nextTaskNumber(filePath: string, todayPrefix: string): number {
  const lines = readLines(filePath);
  let tsCount = 0;
  for (const line of lines) {
    if (TIMESTAMP_RE.test(line) && line.includes(todayPrefix)) {
      tsCount++;
    }
  }
  return Math.floor(tsCount / 2) + 1;
}

/**
 * Insert textToInsert right after today's separator line.
 * If no today-section exists, prepend a new separator + text at the top of the file,
 * stripping any leading separator from the existing content to avoid doubling.
 */
function insertAfterTodaySeparator(filePath: string, todayPrefix: string, textToInsert: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Find a separator whose immediately following non-empty line belongs to today
  let separatorIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === SEPARATOR) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') { continue; }
        if (TIMESTAMP_RE.test(lines[j]) && lines[j].includes(todayPrefix)) {
          separatorIdx = i;
        }
        break;
      }
      if (separatorIdx === i) { break; }
    }
  }

  if (separatorIdx !== -1) {
    // Today's section exists — insert right after its separator
    lines.splice(separatorIdx + 1, 0, ...textToInsert.split('\n'));
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  } else {
    // New day — prepend separator + text.
    // Strip a leading separator from the existing content to avoid doubling.
    let rest = content;
    if (rest.startsWith(SEPARATOR + '\n')) {
      rest = rest.slice(SEPARATOR.length + 1);
    } else if (rest.startsWith(SEPARATOR)) {
      rest = rest.slice(SEPARATOR.length);
    }
    const joiner = rest.length > 0 && !rest.startsWith('\n') ? '\n' : '';
    fs.writeFileSync(filePath, `${SEPARATOR}\n${textToInsert}${joiner}${rest}`, 'utf8');
  }
}

/**
 * Insert the closing timestamp at the end of the topmost (newest) open task block.
 * Finds today's separator, then finds the first blank line after it (end of the open block),
 * and inserts the closing line just before that blank line.
 */
function closeOpenTask(filePath: string, todayPrefix: string, closingLine: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Find today's separator
  let separatorIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === SEPARATOR) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') { continue; }
        if (TIMESTAMP_RE.test(lines[j]) && lines[j].includes(todayPrefix)) {
          separatorIdx = i;
        }
        break;
      }
      if (separatorIdx === i) { break; }
    }
  }

  if (separatorIdx === -1) {
    // Fallback: append
    fs.appendFileSync(filePath, closingLine + '\n\n', 'utf8');
    return;
  }

  // Find the first blank line after the separator (end of the open task block)
  let insertIdx = -1;
  for (let i = separatorIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      insertIdx = i;
      break;
    }
  }

  if (insertIdx === -1) {
    // Task block runs to end of file — push closing line + blank line
    lines.push(closingLine, '');
  } else {
    lines.splice(insertIdx, 0, closingLine);
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/**
 * Open the tracking file and place the cursor at the end of the description stub line
 * (the line containing "; N. " ready for the user to type their description).
 */
async function openFileAtDescriptionLine(filePath: string) {
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  // Revert to pick up the freshly written content
  await vscode.commands.executeCommand('workbench.action.files.revert');

  // Re-acquire doc after revert
  const freshDoc = vscode.window.activeTextEditor?.document;
  if (!freshDoc) { return; }

  // Find the description stub line: starts with "; " but is NOT a timestamp
  for (let i = 0; i < freshDoc.lineCount; i++) {
    const text = freshDoc.lineAt(i).text;
    if (text.startsWith('; ') && !TIMESTAMP_RE.test(text)) {
      const pos = new vscode.Position(i, text.length);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
      break;
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'timeTracker.toggle';
  statusBar.show();

  // Derive initial state from file — never trust globalState alone
  const initFilePath = getFilePath();
  const initTodayPrefix = formatDateOnly(new Date());
  let isTracking: boolean = fs.existsSync(initFilePath)
    ? deriveIsTracking(initFilePath, initTodayPrefix)
    : false;

  function updateStatusBar() {
    if (isTracking) {
      statusBar.text = '$(watch) Stop task';
      statusBar.tooltip = 'Time Tracker: click to stop task';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBar.text = '$(watch) Start task';
      statusBar.tooltip = 'Time Tracker: click to start task';
      statusBar.backgroundColor = undefined;
    }
  }

  updateStatusBar();

  const command = vscode.commands.registerCommand('timeTracker.toggle', async () => {
    const filePath = getFilePath();
    const now = new Date();
    const timestamp = formatTimestamp(now);
    const todayPrefix = formatDateOnly(now);

    try {
      ensureFileExists(filePath);
    } catch (err) {
      vscode.window.showErrorMessage(`Time Tracker: cannot create file at ${filePath}: ${err}`);
      return;
    }

    // Always re-derive from file before acting — source of truth
    isTracking = deriveIsTracking(filePath, todayPrefix);

    if (!isTracking) {
      // START task
      const n = nextTaskNumber(filePath, todayPrefix);
      const openingLine = `; ${n}. ${timestamp}`;
      const descriptionStub = `; ${n}. `;
      insertAfterTodaySeparator(filePath, todayPrefix, `${openingLine}\n${descriptionStub}\n`);
      isTracking = true;
      updateStatusBar();
      await openFileAtDescriptionLine(filePath);
    } else {
      // STOP task
      const n = nextTaskNumber(filePath, todayPrefix);
      const closingLine = `; ${n}. ${timestamp}`;
      closeOpenTask(filePath, todayPrefix, closingLine);
      isTracking = false;
      updateStatusBar();

      // Refresh editor if file is open
      const uri = vscode.Uri.file(filePath);
      const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
      if (openDoc) {
        await vscode.window.showTextDocument(openDoc, { preview: false });
        await vscode.commands.executeCommand('workbench.action.files.revert');
      }
    }

    await context.globalState.update('isTracking', isTracking);
  });

  context.subscriptions.push(command, statusBar);
}

export function deactivate() {}
