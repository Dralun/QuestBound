import { describe, expect, it } from 'vitest'
import {
  flag,
  gameIdentifier,
  identifier,
  items,
  number,
  parseReputation,
  quests,
  record,
  statsPatch,
  text,
} from '../../app/utils/validation'
import { itemIcons, shopIcons } from '../../app/utils/icons'
import { decodedQuest, decodedRot13Quest, encodedQuest, rot13Quest } from '../fixtures/quests'

const quest = {
  adId: 'quest-1',
  message: 'Help the realm',
  probability: 'Sure thing',
  reward: 51,
  expiresIn: 7,
}

describe('API response validation', () => {
  it('trims valid game ids and gives useful form validation errors', () => {
    expect(gameIdentifier('  Ab12Cd34  ')).toBe('Ab12Cd34')
    for (const value of [
      '',
      ' ',
      '../x',
      'x/y',
      'x?secret',
      'game-id',
      'game_id',
      'x'.repeat(9),
      null,
    ]) {
      expect(() => gameIdentifier(value)).toThrow('Enter a game ID')
    }
  })
  it('keeps long quest and item identifiers valid independently of the game ID limit', () => {
    expect(identifier('long_quest-identifier')).toBe('long_quest-identifier')
    expect(items([{ id: 'wingpotmax', name: 'Potion of awesome wings', cost: 300 }])[0]?.id).toBe(
      'wingpotmax',
    )
    expect(() => gameIdentifier('wingpotmax')).toThrow('Enter a game ID')
  })
  it('handles documented envelopes and recorded array responses', () => {
    expect(quests([quest])).toEqual(quests({ messages: [{ ...quest, reward: '51' }] }))
    expect(items([{ id: 'hpot', name: 'Healing potion', cost: 50 }])).toEqual(
      items({ items: [{ id: 'hpot', name: 'Healing potion', cost: 50 }] }),
    )
    expect(quests([{ ...quest, probability: undefined }])[0]?.probability).toBe('Unknown')
    expect(quests([{ ...quest, expiresIn: 0 }])).toEqual([])
  })
  it('extracts every stat including zero without inventing missing values', () => {
    expect(statsPatch({ lives: 0, gold: 0, score: 8, highScore: 0, turn: 2, level: 1 })).toEqual({
      lives: 0,
      gold: 0,
      score: 8,
      turn: 2,
      level: 1,
    })
    expect(statsPatch({ gold: 12 })).toEqual({ gold: 12 })
    expect(statsPatch({ highScore: 'ignored', score: 3 })).toEqual({ score: 3 })
    expect(statsPatch([])).toEqual({})
    expect(() => statsPatch({ gold: 5, lives: -1 })).toThrow()
  })
  it('accepts signed and fractional reputation counters including zero', () => {
    expect(parseReputation({ people: -0.25, state: 0, underworld: 0.0001 })).toEqual({
      people: -0.25,
      state: 0,
      underworld: 0.0001,
    })
  })
  it.each([
    {},
    [],
    { people: '0', state: 0, underworld: 0 },
    { people: 0, state: NaN, underworld: 0 },
    { people: 0, state: 0, underworld: Infinity },
  ])('rejects incomplete or invalid reputation', (value) => {
    expect(() => parseReputation(value)).toThrow()
  })
  it.each([null, [], 1, 'x'])('rejects invalid objects: %s', (value) => {
    expect(() => record(value)).toThrow()
  })
  it.each([null, '', ' ', 12, 'x'.repeat(20001)])('rejects invalid text', (value) => {
    expect(() => text(value)).toThrow()
  })
  it.each(['../x', 'a/b', 'a?b', 'x'.repeat(129)])('rejects unsafe path identifiers', (value) => {
    expect(() => identifier(value)).toThrow()
  })
  it.each([-1, NaN, Infinity, '1', 0.2, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid numeric data',
    (value) => {
      expect(() => number(value)).toThrow()
    },
  )
  it('accepts only explicit boolean representations', () => {
    for (const value of [true, 'true']) expect(flag(value)).toBe(true)
    for (const value of [false, 'false']) expect(flag(value)).toBe(false)
    expect(() => flag(1)).toThrow()
  })
  it('rejects malformed, duplicated, and oversized lists', () => {
    expect(() => quests({ messages: 'bad' })).toThrow()
    expect(() => quests([quest, quest])).toThrow()
    expect(() => quests(Array.from({ length: 1001 }, () => quest))).toThrow()
    expect(() => quests([{ ...quest, reward: '12x' }])).toThrow()
    expect(() => quests([{ ...quest, encrypted: -1 }])).toThrow()
    expect(() => items([{ id: 'x', name: 'x', cost: -1 }])).toThrow()
  })
  it('decodes all three base64 fields before validating and storing a quest', () => {
    expect(quests([encodedQuest])).toEqual([decodedQuest])
    expect(quests({ messages: [encodedQuest, quest] })).toEqual([decodedQuest, quest])
  })
  it('decodes UTF-8 and never decodes normalized or unencrypted text twice', () => {
    const message = 'Aid the dragon 🐉 near Jõgeva.'
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(message)))
    expect(quests([{ ...encodedQuest, message: encoded }])[0]?.message).toBe(message)
    const normalized = quests([{ ...encodedQuest, message: btoa('SGVsbG8=') }])[0]!
    expect(normalized.message).toBe('SGVsbG8=')
    expect(quests([{ ...quest, message: 'SGVsbG8=' }])[0]?.message).toBe('SGVsbG8=')
    expect(quests([{ ...encodedQuest, probability: undefined }])[0]?.probability).toBe('Unknown')
  })
  it.each(['adId', 'message', 'probability'])(
    'rejects malformed base64 or invalid UTF-8 in %s',
    (field) => {
      for (const value of ['???', '/w==', btoa(' '), 123]) {
        expect(() => quests([{ ...encodedQuest, [field]: value }])).toThrow('unexpected response')
      }
    },
  )
  it('validates decoded ids and detects duplicates after decoding', () => {
    expect(() => quests([{ ...encodedQuest, adId: btoa('../secret') }])).toThrow()
    expect(() => quests([encodedQuest, decodedQuest])).toThrow()
  })
  it('decodes all ROT13 fields once, preserving Unicode, case, numbers and punctuation', () => {
    expect(quests([rot13Quest])).toEqual([decodedRot13Quest])
    expect(quests([decodedRot13Quest])).toEqual([decodedRot13Quest])
    expect(quests([{ ...rot13Quest, message: 'Uryc gur ernyz! 123 🐉' }])[0]?.message).toBe(
      'Help the realm! 123 🐉',
    )
    expect(quests([{ ...rot13Quest, probability: undefined }])[0]?.probability).toBe('Unknown')
    expect(quests([{ ...quest, encrypted: 9 }])[0]?.message).toBe(quest.message)
  })
  it.each(['adId', 'message', 'probability'])('rejects invalid ROT13 text in %s', (field) => {
    for (const value of [123, '', ' ']) {
      expect(() => quests([{ ...rot13Quest, [field]: value }])).toThrow('unexpected response')
    }
  })
  it('validates ROT13 ids and detects duplicates after decoding', () => {
    expect(() => quests([{ ...rot13Quest, adId: '../frperg' }])).toThrow()
    expect(() => quests([rot13Quest, decodedRot13Quest])).toThrow()
  })
})

describe('shop icon mapping', () => {
  it('assigns every supplied item its own icon and handles new ids consistently', () => {
    expect(new Set(Object.values(itemIcons)).size).toBe(11)
    const ids = [...Object.keys(itemIcons), 'new-item', 'new-other', '__proto__', 'constructor']
    const icons = shopIcons(ids)
    expect(new Set(Object.values(icons)).size).toBe(ids.length)
    expect(shopIcons([...ids].reverse())).toEqual(icons)
  })
})
