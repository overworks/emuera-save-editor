import { describe, expect, it } from 'vitest';
import { formatMessage, resolveLocale, translator } from '../src/i18n';
import { messages } from '../src/messages';
import { MessageError, messageOf } from '../src/core/diagnostic';
import { SaveError, integer } from '../src/core/model';
import { Labels } from '../src/core/labels';

describe('language selection and messages', () => {
  it.each([
    [['en-US'], undefined, 'en'],
    [['ko-KR'], undefined, 'ko'],
    [['ja-JP'], undefined, 'ja'],
    [['fr-FR', 'ja-JP', 'en-US'], undefined, 'ja'],
    [['fr-FR'], undefined, 'en'],
    [[], undefined, 'en'],
    [['ko-KR'], 'ja', 'ja'],
    [['ja-JP'], 'EN-gb', 'en'],
    [['ko-KR'], 'constructor', 'ko'],
    [['fr-FR'], '__proto__', 'en'],
  ] as const)('resolves browser languages %j with URL preference %s to %s', (languages, requested, expected) => {
    expect(resolveLocale(languages, requested)).toBe(expected);
  });

  it('keeps all three translations and their interpolation parameters complete', () => {
    const tokens = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const [key, translations] of Object.entries(messages)) {
      expect(translations, key).toHaveLength(3);
      const variants = translations.flatMap(value => typeof value === 'string' ? [value] : Object.values(value));
      for (const value of variants) {
        expect(value.trim(), key).not.toBe('');
        expect(tokens(value), key).toEqual(tokens(variants[0]));
      }
    }
  });

  it('uses English plurals and localized counts without interpreting user text', () => {
    const en = translator('en');
    expect(en('changedCount', { count: 1 })).toBe('1 value changed');
    expect(en('changedCount', { count: 2 })).toBe('2 values changed');
    expect(translator('ko')('itemCount', { count: 1000 })).toBe('1,000개 항목');
    expect(translator('ja')('itemCount', { count: 1000 })).toBe('1,000 件の項目');
    expect(en('error.duplicateVariable', { name: '$& {count} 한글' })).toBe('Duplicate variable $& {count} 한글 cannot be edited.');
  });

  it('translates structured Worker errors including positions after a language change', () => {
    const error = new SaveError('error.binaryVersion', 12, 'byte', { version: '1809' });
    const received = new MessageError(structuredClone(error.diagnostic));
    expect(formatMessage(translator('en'), messageOf(received))).toBe('Unsupported binary version 1809. (byte 12)');
    expect(formatMessage(translator('ko'), messageOf(received))).toBe('지원하지 않는 바이너리 버전 1809입니다. (바이트 12)');
    expect(formatMessage(translator('ja'), messageOf(received))).toBe('未対応のバイナリバージョン 1809 です。 (バイト 12)');
    expect(formatMessage(translator('ja'), new SaveError('error.unexpectedEnd', 8, 'line').diagnostic)).toContain('行 8');
    expect(messageOf(new Error('native error'))).toEqual({ key: 'error.unexpected' });
    expect(() => integer('9223372036854775808')).toThrowError('error.integerRange');
  });

  it('keeps CSV names and line numbers intact while translating warnings', () => {
    const labels = new Labels();
    const warnings = labels.load([{ name: 'ABL.csv', bytes: new TextEncoder().encode('0,집중력\n0,Changed\nbad') }], 'auto');
    expect(labels.get('ABL', '0')).toBe('집중력');
    expect(formatMessage(translator('en'), warnings[0])).toBe('ABL.csv:2: Duplicate index 0; kept the existing label.');
    expect(formatMessage(translator('ja'), warnings[1])).toBe('ABL.csv:3: インデックスを読み取れません。');
    expect(formatMessage(translator('ko'), warnings[0])).toContain('기존 이름을 유지합니다.');
  });
});
