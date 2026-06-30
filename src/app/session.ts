// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/// Reads the `port` file from `dir` and returns the port number, or null if the
/// file is absent or contains an out-of-range value.
export function readPortFile(dir: string): number | null {
  const portPath = join(dir, 'port');
  if (!existsSync(portPath)) return null;
  const portStr = readFileSync(portPath, 'utf-8').trim();
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}
