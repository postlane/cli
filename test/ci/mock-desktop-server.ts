// SPDX-License-Identifier: BUSL-1.1
import http from 'http';
import { randomBytes } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECT_CONFIG = {
  project_id: 'ci-test-project-id',
  project_name: 'CI Test Project',
};

let server: http.Server | null = null;
let activeToken: string | null = null;

function rejectUnauthorized(res: http.ServerResponse): void {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const auth = req.headers['authorization'];
  if (!auth || !activeToken) return false;
  return auth === `Bearer ${activeToken}`;
}

/// Starts the mock desktop server on a random port.
/// Writes the port number to {homeDir}/.postlane/port (mode 0o600) and a
/// random session token to {homeDir}/.postlane/session.token (mode 0o600) so
/// the CLI can discover the server and authenticate exactly as it does with the
/// real desktop app. Pass a tmp dir in unit tests to avoid touching ~/.postlane/.
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
        if (!isAuthorized(req)) {
          req.resume();
          rejectUnauthorized(res);
          return;
        }
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
      const token = randomBytes(32).toString('hex');
      writeFileSync(join(postlaneDir, 'session.token'), token, { mode: 0o600 });
      activeToken = token;
      resolve({ port });
    });
    s.on('error', reject);
  });
}

/// Stops the mock server and clears the active session token.
/// Safe to call when already stopped.
export function stop(): Promise<void> {
  return new Promise((resolve, reject) => {
    activeToken = null;
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
