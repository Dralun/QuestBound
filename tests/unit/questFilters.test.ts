import { describe, expect, it } from 'vitest'
import { isRiskyQuest, isSafeQuest, questDifficulty } from '../../app/utils/questFilters'

describe('quest filter and warning rules', () => {
  it.each([
    [' Sure Thing ', 0, true, false],
    ['PIECE OF CAKE', 1, true, false],
    ['Walk in the park', 1, true, false],
    ['Quite likely', 2, false, false],
    ['Hmmm....', 3, false, false],
    ['Risky', 4, false, true],
    ['Gamble', 4, false, true],
    ['Rather detrimental', 5, false, true],
    ['Playing with fire', 6, false, true],
    ['Suicide mission', 7, false, true],
    ['Impossible', 8, false, false],
    ['Unknown', 9, false, false],
    ['constructor', 9, false, false],
    ['peace of cake', 9, false, false],
    ['hmm...', 9, false, false],
    ['hmm…', 9, false, false],
    ['hmmm...', 9, false, false],
    ['hmmm.....', 9, false, false],
  ])('classifies %s consistently', (probability, difficulty, safe, risky) => {
    expect(questDifficulty(probability)).toBe(difficulty)
    expect(isSafeQuest(probability)).toBe(safe)
    expect(isRiskyQuest(probability)).toBe(risky)
  })
})
