import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class FolderSelectionCancelled extends Error {
  constructor() {
    super('Folder selection cancelled');
    this.name = 'FolderSelectionCancelled';
  }
}

export async function pickProjectFolder(): Promise<string> {
  const platform = process.platform;
  if (platform === 'win32') return pickWindowsFolder();
  if (platform === 'darwin') return pickMacFolder();
  if (platform === 'linux') return pickLinuxFolder();
  throw new Error(`Native folder picker is not supported on ${platform}`);
}

async function pickWindowsFolder(): Promise<string> {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Select web project folder'",
    '$dialog.ShowNewFolderButton = $false',
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }"
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true });
  return requireSelection(stdout);
}

async function pickMacFolder(): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', 'POSIX path of (choose folder with prompt "Select web project folder")']);
  return requireSelection(stdout);
}

async function pickLinuxFolder(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', '--title=Select web project folder']);
    return requireSelection(stdout);
  } catch (zenityError) {
    try {
      const { stdout } = await execFileAsync('kdialog', ['--getexistingdirectory', '.', '--title', 'Select web project folder']);
      return requireSelection(stdout);
    } catch {
      if (isCancellation(zenityError)) throw new FolderSelectionCancelled();
      throw new Error('No supported native folder picker found. Install zenity or kdialog, or enter a path manually.');
    }
  }
}

function requireSelection(stdout: string): string {
  const selected = stdout.trim();
  if (!selected) throw new FolderSelectionCancelled();
  return selected;
}

function isCancellation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && Number((error as { code?: unknown }).code) === 1;
}
