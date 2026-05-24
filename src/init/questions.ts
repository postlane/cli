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
  show_hn: 'Show HN',
  changelog: 'Changelog',
};

export const PLATFORM_CHOICES = SUPPORTED_PLATFORMS.map(p => ({
  name: PLATFORM_LABELS[p] ?? p,
  value: p,
}));

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
      llmModel: 'claude-sonnet-4-5-20250929',
      schedulerProvider: 'zernio',
      schedulerApiKey: '',
      repoType: 'open-source-library',
      style: 'Direct, technically precise.',
      utmCampaign: '',
      author: 'Postlane',
      attribution: noAttribution ? false : undefined,
    };
  }

  const answers = await inquirer.prompt<Partial<SetupAnswers>>([
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
      type: 'input',
      name: 'llmModel',
      message: 'LLM model name:',
      default: (answers: Partial<SetupAnswers>) => {
        switch (answers.llmProvider) {
          case 'anthropic':
            return 'claude-sonnet-4-5-20250929';
          case 'openai':
            return 'gpt-4o';
          case 'google':
            return 'gemini-2.0-flash-exp';
          default:
            return '';
        }
      },
    },
  ]);

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

  const remainingAnswers = await inquirer.prompt<Partial<SetupAnswers>>([
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
    {
      type: 'input',
      name: 'utmCampaign',
      message: 'UTM campaign (optional):',
      default: '',
    },
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

  // If --no-attribution was passed, override the prompt answer.
  // When user answers yes (or default), don't write the key — absence = enabled.
  const attributionValue = noAttribution ? false : (remainingAnswers.attribution === false ? false : undefined);

  return {
    ...answers,
    ...schedulerAnswers,
    ...remainingAnswers,
    attribution: attributionValue,
  } as SetupAnswers;
}
