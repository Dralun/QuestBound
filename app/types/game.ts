export const statKeys = ['lives', 'gold', 'score', 'turn', 'level'] as const

export type StatKey = (typeof statKeys)[number]
export type Stats = Record<StatKey, number>
export interface Reputation {
  people: number
  state: number
  underworld: number
}
export type Payload = Record<string, unknown> | unknown[]
export type Transport = (
  path: string,
  method?: 'GET' | 'POST',
  signal?: AbortSignal,
) => Promise<Payload>

export interface Quest {
  adId: string
  message: string
  probability: string
  reward: number
  expiresIn: number
}

export interface ShopItem {
  id: string
  name: string
  cost: number
}

export interface Purchase extends ShopItem {
  quantity: number
}

export interface Outcome {
  id: number
  kind: 'quest' | 'purchase'
  success: boolean
  message: string
  title: string
  goldGained: number | null
  livesLost: number | null
  turn: number
}
