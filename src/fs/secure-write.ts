// SPDX-License-Identifier: BUSL-1.1

import { writeFileSync, renameSync } from 'fs';

export function writeSecureJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, filePath);
}
