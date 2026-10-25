export const itemIcons: Record<string, string> = {
  hpot: 'game-icons:health-potion',
  cs: 'game-icons:claw-slashes',
  gas: 'game-icons:gas-pump',
  wax: 'game-icons:scales',
  tricks: 'game-icons:spell-book',
  wingpot: 'game-icons:feather',
  ch: 'game-icons:triple-claws',
  rf: 'game-icons:rocket-flight',
  iron: 'game-icons:breastplate',
  mtrix: 'game-icons:book-aura',
  wingpotmax: 'game-icons:winged-shield',
}

const extraIcons = [
  'game-icons:crystal-ball',
  'game-icons:emerald',
  'game-icons:anvil',
  'game-icons:leather-boot',
  'game-icons:magic-lamp',
  'game-icons:compass',
  'game-icons:diamond-ring',
  'game-icons:fire-gem',
  'game-icons:treasure-map',
  'game-icons:orb-wand',
  'game-icons:round-shield',
  'game-icons:locked-chest',
]

export function shopIcons(ids: string[]): Record<string, string> {
  const unknown = [...new Set(ids.filter((id) => !Object.hasOwn(itemIcons, id)))].sort()
  return Object.fromEntries(
    ids.map((id) => [
      id,
      Object.hasOwn(itemIcons, id)
        ? itemIcons[id]!
        : extraIcons[unknown.indexOf(id) % extraIcons.length]!,
    ]),
  )
}

export const bundledIcons = [...Object.values(itemIcons), ...extraIcons]
