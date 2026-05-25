// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { PLATFORM_CHOICES, PLATFORM_QUESTION, MODEL_CHOICES, OTHER_MODEL, UTM_CONFIRM_QUESTION, UTM_CAMPAIGN_QUESTION } from '../src/init/questions.js';
import { SUPPORTED_PLATFORMS } from '../src/init/config_writer.js';

describe('platform question configuration', () => {
  it('PLATFORM_CHOICES covers every supported platform', () => {
    const choiceValues = PLATFORM_CHOICES.map(c => c.value);
    for (const platform of SUPPORTED_PLATFORMS) {
      expect(choiceValues).toContain(platform);
    }
  });

  it('every choice has a human-readable name and a value', () => {
    for (const choice of PLATFORM_CHOICES) {
      expect(typeof choice.name).toBe('string');
      expect(choice.name.length).toBeGreaterThan(0);
      expect(typeof choice.value).toBe('string');
      expect(choice.value.length).toBeGreaterThan(0);
    }
  });

  it('platform question type is checkbox, not input', () => {
    expect(PLATFORM_QUESTION.type).toBe('checkbox');
  });

  it('platform question has a validate function that rejects empty selection', () => {
    expect(typeof PLATFORM_QUESTION.validate).toBe('function');
    const result = (PLATFORM_QUESTION.validate as (v: string[]) => string | boolean)([]);
    expect(result).not.toBe(true);
    expect(typeof result).toBe('string');
  });

  it('platform question validate passes when at least one platform is selected', () => {
    const result = (PLATFORM_QUESTION.validate as (v: string[]) => string | boolean)([SUPPORTED_PLATFORMS[0]]);
    expect(result).toBe(true);
  });
});

describe('UTM campaign questions', () => {
  it('utm confirm question type is confirm, not input', () => {
    expect(UTM_CONFIRM_QUESTION.type).toBe('confirm');
  });

  it('utm confirm question defaults to false', () => {
    expect(UTM_CONFIRM_QUESTION.default).toBe(false);
  });

  it('utm campaign question is not shown when useUtm is false', () => {
    const result = UTM_CAMPAIGN_QUESTION.when({ useUtm: false });
    expect(result).toBe(false);
  });

  it('utm campaign question is shown when useUtm is true', () => {
    const result = UTM_CAMPAIGN_QUESTION.when({ useUtm: true });
    expect(result).toBe(true);
  });

  it('utm campaign question validate rejects empty input', () => {
    const result = UTM_CAMPAIGN_QUESTION.validate('');
    expect(result).not.toBe(true);
    expect(typeof result).toBe('string');
  });

  it('utm campaign question validate accepts non-empty input', () => {
    const result = UTM_CAMPAIGN_QUESTION.validate('postlane');
    expect(result).toBe(true);
  });
});

describe('model choices configuration', () => {
  it('MODEL_CHOICES has entries for anthropic, openai, and google', () => {
    expect('anthropic' in MODEL_CHOICES).toBe(true);
    expect('openai' in MODEL_CHOICES).toBe(true);
    expect('google' in MODEL_CHOICES).toBe(true);
  });

  it('each provider list is non-empty', () => {
    for (const models of Object.values(MODEL_CHOICES)) {
      expect(models.length).toBeGreaterThan(0);
    }
  });

  it('each model entry is a non-empty string', () => {
    for (const models of Object.values(MODEL_CHOICES)) {
      for (const model of models) {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      }
    }
  });

  it('OTHER_MODEL sentinel is a non-empty string distinct from any real model name', () => {
    expect(typeof OTHER_MODEL).toBe('string');
    expect(OTHER_MODEL.length).toBeGreaterThan(0);
    for (const models of Object.values(MODEL_CHOICES)) {
      expect(models).not.toContain(OTHER_MODEL);
    }
  });
});
