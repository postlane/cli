// SPDX-License-Identifier: BUSL-1.1
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
});
