// SPDX-License-Identifier: BUSL-1.1

import { readFileSync } from 'fs';
import { join } from 'path';

/// Reads the `port` file from `dir` and returns the port number, or null if the
/// file is absent or contains an out-of-range value.
export function readPortFile(dir: string): number | null {
  const portPath = join(dir, 'port');
  let portStr: string;
  try {
    portStr = readFileSync(portPath, 'utf-8').trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}
