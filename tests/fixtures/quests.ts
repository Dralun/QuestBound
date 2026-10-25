export const encodedQuest = {
  adId: 'NVJYNnMyR2s=',
  message: 'SW5maWx0cmF0ZSBUaGUgRmlyZSBXb2x2ZXMgYW5kIHJlY292ZXIgdGhlaXIgc2VjcmV0cy4=',
  reward: 141,
  expiresIn: 2,
  encrypted: 1,
  probability: 'UGxheWluZyB3aXRoIGZpcmU=',
}

export const decodedQuest = {
  reward: encodedQuest.reward,
  expiresIn: encodedQuest.expiresIn,
  adId: '5RX6s2Gk',
  message: 'Infiltrate The Fire Wolves and recover their secrets.',
  probability: 'Playing with fire',
}

export const rot13Quest = {
  adId: 'pbwrVCC0',
  message:
    'Xvyy Xnzvyė Ryyvffba jvgu ubhfr naq znxr Tergr Uhyqhfba sebz fgebatubyq va Fabjivyyr gb gnxr gur oynzr',
  reward: 118,
  expiresIn: 1,
  encrypted: 2,
  probability: 'Fhvpvqr zvffvba',
}

export const decodedRot13Quest = {
  reward: rot13Quest.reward,
  expiresIn: rot13Quest.expiresIn,
  adId: 'cojeIPP0',
  message:
    'Kill Kamilė Ellisson with house and make Grete Hulduson from stronghold in Snowville to take the blame',
  probability: 'Suicide mission',
}
