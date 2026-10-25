const peopleKeywords = ['help', 'rescue', 'escort', 'advertisement', 'investigate']

export function hasPeopleKeywords(message: string): boolean {
  const description = message.toLowerCase()
  return peopleKeywords.some((word) => description.includes(word))
}

const difficulties: Record<string, number> = {
  'sure thing': 0,
  'piece of cake': 1,
  'walk in the park': 1,
  'quite likely': 2,
  'hmmm....': 3,
  risky: 4,
  gamble: 4,
  'rather detrimental': 5,
  'playing with fire': 6,
  'suicide mission': 7,
  impossible: 8,
}

export function questDifficulty(probability: string): number {
  const label = probability.trim().toLowerCase()
  return Object.hasOwn(difficulties, label) ? difficulties[label]! : 9
}

export function isSafeQuest(probability: string): boolean {
  return questDifficulty(probability) <= 1
}

export function isRiskyQuest(probability: string): boolean {
  const difficulty = questDifficulty(probability)
  return difficulty >= 4 && difficulty <= 7
}
