// SPDX-License-Identifier: BUSL-1.1

import inquirer from 'inquirer';
import chalk from 'chalk';

export interface SetupAnswers {
  baseUrl: string;
  platforms: string[];
  llmProvider: string;
  llmModel: string;
  schedulerProvider: string;
  schedulerApiKey: string;
  profileId?: string;
  repoType: string;
  style: string;
  utmCampaign: string;
  author: string;
  attribution?: boolean;
}

export async function askSetupQuestions(useDefaults: boolean): Promise<SetupAnswers> {
  if (useDefaults) {
    return {
      baseUrl: 'https://example.com',
      platforms: ['x', 'bluesky', 'mastodon'],
      llmProvider: 'anthropic',
      llmModel: 'claude-sonnet-4-5-20250929',
      schedulerProvider: 'zernio',
      schedulerApiKey: '',
      repoType: 'open-source-library',
      style: 'Direct, technically precise.',
      utmCampaign: '',
      author: 'Postlane',
    };
  }

  const answers = await inquirer.prompt<Partial<SetupAnswers>>([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Base URL for your project:',
      default: 'https://example.com',
      validate: (input: string) => {
        if (!input.startsWith('https://')) {
          return 'URL must start with https://';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'platforms',
      message: 'Platforms (comma-separated):',
      default: 'x,bluesky,mastodon',
      filter: (input: string) => input.split(',').map(p => p.trim()),
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

  // TODO: Implement profile selection by calling list_profiles()
  // For now, skip profile selection

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
      message: "Add a 'Built with Postlane' footer to posts? (opt out any time)",
      default: true,
    },
  ]);

  return {
    ...answers,
    ...schedulerAnswers,
    ...remainingAnswers,
    // When user answers yes (or default), don't write the key — absence = enabled.
    attribution: answers.attribution === false ? false : undefined,
  } as SetupAnswers;
}
