// SPDX-License-Identifier: BUSL-1.1
// Isolation tests for extracted askSetupQuestions sections (Task 5)

import { describe, it, expect, vi } from 'vitest';

describe('askLlmProvider', () => {
  it('is exported from src/init/questions.ts', async () => {
    const mod = await import('../src/init/questions.js');
    expect(typeof mod.askLlmProvider).toBe('function');
  });

  it('returns provider and model from inquirer answers', async () => {
    vi.resetModules();
    vi.doMock('inquirer', () => ({
      default: {
        prompt: async () => ({
          llmProvider: 'openai',
          llmModelPick: 'gpt-4o',
          llmModelCustom: undefined,
        }),
      },
    }));

    const { askLlmProvider } = await import('../src/init/questions.js');
    const result = await askLlmProvider();

    vi.doUnmock('inquirer');
    vi.resetModules();

    expect(result.llmProvider).toBe('openai');
    expect(result.llmModel).toBe('gpt-4o');
  });

  it('falls back to llmModelCustom when llmModelPick is __other__', async () => {
    vi.resetModules();
    vi.doMock('inquirer', () => ({
      default: {
        prompt: async () => ({
          llmProvider: 'ollama',
          llmModelPick: '__other__',
          llmModelCustom: 'llama3',
        }),
      },
    }));

    const { askLlmProvider } = await import('../src/init/questions.js');
    const result = await askLlmProvider();

    vi.doUnmock('inquirer');
    vi.resetModules();

    expect(result.llmModel).toBe('llama3');
  });
});

describe('showDataDisclosure', () => {
  it('is exported from src/init/questions.ts', async () => {
    const mod = await import('../src/init/questions.js');
    expect(typeof mod.showDataDisclosure).toBe('function');
  });

  it('prints the provider name and security URL', async () => {
    vi.resetModules();
    vi.doMock('inquirer', () => ({
      default: { prompt: async () => ({}) },
    }));

    const { showDataDisclosure } = await import('../src/init/questions.js');

    const logged: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logged.push(args.map(String).join(' '));
    });

    await showDataDisclosure('anthropic');

    logSpy.mockRestore();
    vi.doUnmock('inquirer');
    vi.resetModules();

    const output = logged.join('\n');
    expect(output).toContain('anthropic');
    expect(output).toContain('postlane.dev/docs/security');
  });
});
