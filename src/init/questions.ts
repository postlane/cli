// SPDX-License-Identifier: BUSL-1.1

import inquirer from 'inquirer';
import chalk from 'chalk';
import { SUPPORTED_PLATFORMS } from './config_writer.js';

export interface SetupAnswers {
  platforms: string[];
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

export async function askSetupQuestions(useDefaults: boolean, noAttribution = false): Promise<SetupAnswers> {
  if (useDefaults) {
    return {
      platforms: ['x', 'bluesky', 'mastodon'],
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

  type PromptAnswers = Partial<SetupAnswers> & { llmModelPick?: string; llmModelCustom?: string; useUtm?: boolean };

  const answers = await inquirer.prompt<PromptAnswers>([
    PLATFORM_QUESTION,
    {
      type: 'input',
      name: 'mastodonInstance',
      message: 'Mastodon instance hostname (e.g. mastodon.social):',
      default: 'mastodon.social',
      when: (answers: Partial<SetupAnswers>) => Array.isArray(answers.platforms) && answers.platforms.includes('mastodon'),
      validate: (input: string) => {
        if (input.includes('://')) return 'Enter a hostname only, not a URL (e.g. mastodon.social)';
        if (!input.trim()) return 'Mastodon instance hostname is required';
        return true;
      },
    },
    {
      type: 'list',
      name: 'llmProvider',
      message: 'LLM provider:',
      choices: [
        'anthropic',
        'openai',
        'google',
        'mistral',
        'groq',
        'deepseek',
        'ollama',
        'lm_studio',
        'custom_openai',
        'other',
      ],
      default: 'anthropic',
    },
    {
      type: 'list',
      name: 'llmModelPick',
      message: 'LLM model:',
      choices: (answers: Partial<SetupAnswers>) => [
        ...(MODEL_CHOICES[answers.llmProvider ?? ''] ?? []).map(m => ({ name: m, value: m })),
        { name: 'Other (enter manually)', value: OTHER_MODEL },
      ],
      when: (answers: Partial<SetupAnswers>) =>
        answers.llmProvider != null && answers.llmProvider in MODEL_CHOICES,
    },
    {
      type: 'input',
      name: 'llmModelCustom',
      message: 'LLM model name:',
      when: (answers: Partial<SetupAnswers> & { llmModelPick?: string }) =>
        !(answers.llmProvider != null && answers.llmProvider in MODEL_CHOICES) ||
        answers.llmModelPick === OTHER_MODEL,
      validate: (input: string) => input.trim().length > 0 || 'Model name is required.',
    },
  ] as Parameters<typeof inquirer.prompt>[0]);

  // Show data disclosure notice after LLM provider is chosen
  console.log(chalk.yellow('\n' + '─'.repeat(80)));
  console.log(chalk.yellow('Note: Post drafts and recent Git context (commit messages, changed filenames)'));
  console.log(chalk.yellow(`will be sent to ${answers.llmProvider} to generate post content. Do not use Postlane`));
  console.log(chalk.yellow('in repos with confidential code if your LLM provider\'s data retention policy is'));
  console.log(chalk.yellow('not acceptable for that context.'));
  console.log(chalk.yellow('\nRead more: postlane.dev/docs/security'));
  console.log(chalk.yellow('─'.repeat(80) + '\n'));

  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: 'Press Enter to continue...',
    },
  ]);

  const schedulerAnswers = await inquirer.prompt<Partial<SetupAnswers>>([
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

  const remainingAnswers = await inquirer.prompt<Partial<SetupAnswers> & { useUtm?: boolean }>([
    {
      type: 'list',
      name: 'repoType',
      message: 'Repository type:',
      choices: [
        'docusaurus-site',
        'api-service',
        'saas-product',
        'open-source-library',
      ],
      default: 'open-source-library',
    },
    {
      type: 'input',
      name: 'style',
      message: 'Writing style:',
      default: 'Direct, technically precise, occasionally dry. No exclamation marks.',
    },
    UTM_CONFIRM_QUESTION,
    UTM_CAMPAIGN_QUESTION,
    {
      type: 'input',
      name: 'author',
      message: 'Author name:',
      default: 'Postlane',
    },
    {
      type: 'confirm',
      name: 'attribution',
      message: "Append 'Built with Postlane' to posts? (e.g., '📮 postlane.dev' added as the last line of each post — opt out any time)",
      default: true,
    },
  ]);

  const llmModel: string =
    answers.llmModelPick && answers.llmModelPick !== OTHER_MODEL
      ? answers.llmModelPick
      : (answers.llmModelCustom?.trim() ?? '');

  // If --no-attribution was passed, override the prompt answer.
  // When user answers yes (or default), don't write the key — absence = enabled.
  const attributionValue = noAttribution ? false : (remainingAnswers.attribution === false ? false : undefined);

  return {
    ...answers,
    ...schedulerAnswers,
    ...remainingAnswers,
    llmModel,
    utmCampaign: remainingAnswers.useUtm ? (remainingAnswers.utmCampaign ?? '') : '',
    attribution: attributionValue,
  } as SetupAnswers;
}
