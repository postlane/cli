// SPDX-License-Identifier: BUSL-1.1
import http from 'http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { start, stop } from './mock-desktop-server.js';
import { readFileSync, statSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rm } from 'fs/promises';

describe('mock-desktop-server', () => {
  let port: number;
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = mkdtempSync(join(tmpdir(), 'postlane-mock-'));
    ({ port } = await start(tmpHome));
  });

  afterEach(async () => {
    await stop();
    await rm(tmpHome, { recursive: true, force: true });
  });

  it('start() returns a valid port number', () => {
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('writes port to {homeDir}/.postlane/port with correct content', () => {
    const content = readFileSync(join(tmpHome, '.postlane', 'port'), 'utf-8').trim();
    expect(content).toBe(String(port));
  });

  it('{homeDir}/.postlane/port has mode 0o600', () => {
    const stats = statSync(join(tmpHome, '.postlane', 'port'));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('writes session.token to {homeDir}/.postlane/session.token with mode 0o600', () => {
    const tokenPath = join(tmpHome, '.postlane', 'session.token');
    const content = readFileSync(tokenPath, 'utf-8').trim();
    expect(content.length).toBeGreaterThan(0);
    const stats = statSync(tokenPath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('GET /github-project-config returns 200 with project_id and project_name', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/github-project-config?org_login=test-org`);
    expect(res.status).toBe(200);
    const data: unknown = await res.json();
    expect(data).toEqual({ project_id: 'ci-test-project-id', project_name: 'CI Test Project' });
  });

  it('GET /health returns 200', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
  });

  it('GET /unknown-path returns 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/unknown-path`);
    expect(res.status).toBe(404);
  });

  it('POST /register without Authorization header returns 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/register`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('POST /register with valid Bearer token returns 200 with success and name', async () => {
    const token = readFileSync(join(tmpHome, '.postlane', 'session.token'), 'utf-8').trim();
    const res = await fetch(`http://127.0.0.1:${port}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data: unknown = await res.json();
    expect(data).toEqual({ success: true, name: 'smoke-test-repo' });
  });

  it('start() with an explicit token writes that token to session.token and accepts it on /register', async () => {
    await stop();
    const explicit = 'explicit-known-token-for-test';
    const tmp2 = mkdtempSync(join(tmpdir(), 'postlane-mock-explicit-'));
    try {
      const { port: p2 } = await start(tmp2, explicit);
      const stored = readFileSync(join(tmp2, '.postlane', 'session.token'), 'utf-8').trim();
      expect(stored).toBe(explicit);
      const res = await fetch(`http://127.0.0.1:${p2}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${explicit}` },
      });
      expect(res.status).toBe(200);
    } finally {
      await stop();
      await rm(tmp2, { recursive: true, force: true });
      // Restart the original server for afterEach cleanup
      ({ port } = await start(tmpHome));
    }
  });

  it('POST /register with wrong Bearer token returns 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/register`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(res.status).toBe(401);
  });

  it('stop() closes the server so subsequent requests fail', async () => {
    await stop();
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });

  // ── F12: double-start guard ──────────────────────────────────────────────
  it('start() called while already running rejects with "already running" error', async () => {
    const tmp2 = mkdtempSync(join(tmpdir(), 'postlane-mock-double-'));
    try {
      await expect(start(tmp2)).rejects.toThrow('already running');
    } finally {
      await rm(tmp2, { recursive: true, force: true });
    }
  });

  // ── F8: array Authorization header normalisation ─────────────────────────
  it('POST /register with array Authorization header still returns 200', async () => {
    const token = readFileSync(join(tmpHome, '.postlane', 'session.token'), 'utf-8').trim();
    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/register', method: 'POST' },
        (res) => resolve(res.statusCode ?? 0),
      );
      // Passing an array forces Node.js to send two Authorization header lines;
      // the server receives them as string | string[] — both must be handled.
      req.setHeader('Authorization', [`Bearer ${token}`, `Bearer ${token}`]);
      req.on('error', reject);
      req.end();
    });
    expect(statusCode).toBe(200);
  });
});
