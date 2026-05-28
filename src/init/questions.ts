// SPDX-License-Identifier: BUSL-1.1

import inquirer from 'inquirer';
import chalk from 'chalk';
import { SUPPORTED_PLATFORMS } from './config_writer.js';

export interface SetupAnswers {
  mastodonInstance?: string;
  llmProvider: string;
  llmModel: string;
  schedulerProvider: string;
  schedulerApiKey: string;
  repoType: string;
  style: string;
  utmCampaign: string;
  author: string;
  attribution?: boolean;
}

interface LlmSelection {
  llmProvider: string;
  llmModel: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  x: 'X (Twitter)',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  linkedin: 'LinkedIn',
  substack_notes: 'Substack Notes',
  substack: 'Substack',
  product_hunt: 'Product Hunt',
  show_hn: 'Hacker News',
  changelog: 'Changelog',
};

export const PLATFORM_CHOICES = SUPPORTED_PLATFORMS.map(p => ({
  name: PLATFORM_LABELS[p] ?? p,
  value: p,
}));

// Curated model lists — update these with each CLI release.
// Providers not in this map fall back to a free-text input.
// Always present "Other (enter manually)" so a new model never blocks init.
export const OTHER_MODEL = '__other__';

export const MODEL_CHOICES: Record<string, string[]> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3'],
  google: ['gemini-2.5-pro', 'gemini-2.0-flash'],
};

export const UTM_CONFIRM_QUESTION = {
  type: 'confirm' as const,
  name: 'useUtm',
  message: 'Add UTM campaign tracking to post links?',
  default: false,
};

export const UTM_CAMPAIGN_QUESTION = {
  type: 'input' as const,
  name: 'utmCampaign',
  message: 'UTM campaign name:',
  default: 'postlane',
  when: (a: { useUtm?: boolean }) => a.useUtm === true,
  validate: (input: string) => input.trim().length > 0 || 'Campaign name is required.',
};

export const PLATFORM_QUESTION = {
  type: 'checkbox' as const,
  name: 'platforms',
  message: 'Which platforms do you post on?',
  choices: PLATFORM_CHOICES,
  default: ['x', 'bluesky', 'mastodon'],
  validate: (selected: string[]) =>
    selected.length > 0 || 'Select at least one platform.',
};

type LlmPromptAnswers = {
  llmProvider?: string;
  llmModelPick?: string;
  llmModelCustom?: string;
};

/// Prompts the user to select an LLM provider and model.
/// Returns the resolved provider and model strings.
export async function askLlmProvider(): Promise<LlmSelection> {
  const answers = await inquirer.prompt<LlmPromptAnswers>([
    {
      type: 'list',
      name: 'llmProvider',
      message: 'LLM provider:',
      choices: [
        'anthropic', 'openai', 'google', 'mistral', 'groq',
        'deepseek', 'ollama', 'lm_studio', 'custom_openai', 'other',
      ],
      default: 'anthropic',
    },
    {
      type: 'list',
      name: 'llmModelPick',
      message: 'LLM model:',
      choices: (a: LlmPromptAnswers) => [
        ...(MODEL_CHOICES[a.llmProvider ?? ''] ?? []).map(m => ({ name: m, value: m })),
        { name: 'Other (enter manually)', value: OTHER_MODEL },
      ],
      when: (a: LlmPromptAnswers) =>
        a.llmProvider != null && a.llmProvider in MODEL_CHOICES,
    },
    {
      type: 'input',
      name: 'llmModelCustom',
      message: 'LLM model name:',
      when: (a: LlmPromptAnswers) =>
        !(a.llmProvider != null && a.llmProvider in MODEL_CHOICES) ||
        a.llmModelPick === OTHER_MODEL,
      validate: (input: string) => input.trim().length > 0 || 'Model name is required.',
    },
  ]);

  const llmProvider = answers.llmProvider ?? 'anthropic';
  const llmModel =
    answers.llmModelPick && answers.llmModelPick !== OTHER_MODEL
      ? answers.llmModelPick
      : (answers.llmModelCustom?.trim() ?? '');

  return { llmProvider, llmModel };
}

/// Displays the data disclosure notice and waits for the user to press Enter.
export async function showDataDisclosure(providerName: string): Promise<void> {
  console.log(chalk.yellow('\n' + '─'.repeat(80)));
  console.log(chalk.yellow('Note: Post drafts and recent Git context (commit messages, changed filenames)'));
  console.log(chalk.yellow(`will be sent to ${providerName} to generate post content. Do not use Postlane`));
  console.log(chalk.yellow("in repos with confidential code if your LLM provider's data retention policy is"));
  console.log(chalk.yellow('not acceptable for that context.'));
  console.log(chalk.yellow('\nRead more: postlane.dev/docs/security'));
  console.log(chalk.yellow('─'.repeat(80) + '\n'));

  await inquirer.prompt([
    { type: 'input', name: 'continue', message: 'Press Enter to continue...' },
  ]);
}

interface ContentAnswers {
  schedulerProvider: string;
  schedulerApiKey: string;
  repoType: string;
  style: string;
  utmCampaign: string;
  author: string;
  attribution?: boolean;
}

async function askSchedulerAndContent(noAttribution: boolean): Promise<ContentAnswers> {
  const schedulerAnswers = await inquirer.prompt<{ schedulerProvider?: string; schedulerApiKey?: string }>([
    {
      type: 'list',
      name: 'schedulerProvider',
      message: 'Scheduler provider:',
      choices: ['zernio', 'buffer', 'ayrshare'],
      default: 'zernio',
    },
    {
      type: 'password',
      name: 'schedulerApiKey',
      message: 'Scheduler API key (not stored in config.json):',
      mask: '*',
    },
  ]);

  const remainingAnswers = await inquirer.prompt<{
    repoType?: string; style?: string; useUtm?: boolean;
    utmCampaign?: string; author?: string; attribution?: boolean;
  }>([
    {
      type: 'list',
      name: 'repoType',
      message: 'Repository type:',
      choices: ['docusaurus-site', 'api-service', 'saas-product', 'open-source-library'],
      default: 'open-source-library',
    },
    { type: 'input', name: 'style', message: 'Writing style:', default: 'Direct, technically precise, occasionally dry. No exclamation marks.' },
    UTM_CONFIRM_QUESTION,
    UTM_CAMPAIGN_QUESTION,
    { type: 'input', name: 'author', message: 'Author name:', default: 'Postlane' },
    {
      type: 'confirm',
      name: 'attribution',
      message: "Append 'Built with Postlane' to posts? (e.g., '📮 postlane.dev' added as the last line of each post — opt out any time)",
      default: true,
    },
  ]);

  const attributionValue = noAttribution ? false : (remainingAnswers.attribution === false ? false : undefined);

  return {
    schedulerProvider: schedulerAnswers.schedulerProvider ?? 'zernio',
    schedulerApiKey: schedulerAnswers.schedulerApiKey ?? '',
    repoType: remainingAnswers.repoType ?? 'open-source-library',
    style: remainingAnswers.style ?? '',
    utmCampaign: remainingAnswers.useUtm ? (remainingAnswers.utmCampaign ?? '') : '',
    author: remainingAnswers.author ?? '',
    attribution: attributionValue,
  };
}

export async function askSetupQuestions(useDefaults: boolean, noAttribution = false): Promise<SetupAnswers> {
  if (useDefaults) {
    return {
      mastodonInstance: 'mastodon.social',
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-4-6',
      schedulerProvider: 'zernio',
      schedulerApiKey: '',
      repoType: 'open-source-library',
      style: 'Direct, technically precise.',
      utmCampaign: '',
      author: 'Postlane',
      attribution: noAttribution ? false : undefined,
    };
  }

  const { llmProvider, llmModel } = await askLlmProvider();
  await showDataDisclosure(llmProvider);
  const content = await askSchedulerAndContent(noAttribution);

  return { llmProvider, llmModel, ...content };
}
