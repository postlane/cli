// SPDX-License-Identifier: BUSL-1.1

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const KNOWN_INSTALL_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Postlane.app',
    join(homedir(), 'Applications/Postlane.app'),
  ],
  linux: [
    '/usr/bin/postlane',
    '/usr/local/bin/postlane',
    join(homedir(), '.local/bin/postlane'),
  ],
  win32: [
    join(process.env.LOCALAPPDATA || '', 'Programs\\Postlane\\Postlane.exe'),
    join(process.env.PROGRAMFILES || '', 'Postlane\\Postlane.exe'),
  ],
};

/// Returns true when portStr is a valid TCP port number (1–65535, digits only).
export function isValidPort(portStr: string): boolean {
  if (!/^\d{1,5}$/.test(portStr)) return false;
  const n = parseInt(portStr, 10);
  return n >= 1 && n <= 65535;
}

/// Returns true when the Postlane app health endpoint at the given port responds 200.
/// Always returns false for invalid ports or when the request fails.
export async function isAppHealthy(portStr: string): Promise<boolean> {
  if (!isValidPort(portStr)) return false;
  const url = `http://127.0.0.1:${portStr}/health`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (err) {
    console.warn(
      `[postlane health] health check failed on port ${portStr}: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/// Returns true when at least one of the known install paths for the current platform exists.
export function isAppInstalled(): boolean {
  const paths = KNOWN_INSTALL_PATHS[process.platform] ?? [];
  return paths.some(p => existsSync(p));
}
