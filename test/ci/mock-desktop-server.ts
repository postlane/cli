// SPDX-License-Identifier: BUSL-1.1
import http from 'http';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECT_CONFIG = {
  project_id: null, // intentionally broken for 23.3.14 smoke gate test
  project_name: 'CI Test Project',
};

let server: http.Server | null = null;

/// Starts the mock desktop server on a random port.
/// Writes the port number to {homeDir}/.postlane/port (mode 0o600) so the CLI
/// can discover it the same way it discovers the real desktop app.
/// Defaults homeDir to os.homedir() — pass a tmp dir in unit tests to avoid
/// touching the real ~/.postlane/ directory.
export function start(homeDir?: string): Promise<{ port: number }> {
  const home = homeDir ?? homedir();
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      const url = req.url ?? '';
      if (req.method === 'GET' && url.startsWith('/github-project-config')) {
        req.resume(); // drain request stream before responding (required on Linux)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(PROJECT_CONFIG));
      } else if (req.method === 'GET' && url === '/health') {
        req.resume();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      } else if (req.method === 'POST' && url === '/register') {
        req.resume(); // discard body
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, name: 'smoke-test-repo' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server = s;
    s.listen(0, '127.0.0.1', () => {
      const address = s.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Unexpected server address type after listen'));
        return;
      }
      const { port } = address;
      const postlaneDir = join(home, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });
      writeFileSync(join(postlaneDir, 'port'), String(port), { mode: 0o600 });
      resolve({ port });
    });
    s.on('error', reject);
  });
}

/// Stops the mock server. Safe to call when already stopped.
export function stop(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((err) => {
      server = null;
      if (err) reject(err);
      else resolve();
    });
  });
}
