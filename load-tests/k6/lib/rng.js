export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

export function randStr(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

export function testEmail(prefix = 'lt') {
  return `${prefix}_${randStr(8)}@loadtest.pregen.io`;
}

export function thinkTime(minS = 1, maxS = 3) {
  return randInt(minS * 1000, maxS * 1000) / 1000;
}

const ANSWERS = [
  'The mitochondria is the powerhouse of the cell and produces ATP through cellular respiration.',
  'Photosynthesis converts solar energy into chemical energy stored in glucose using CO2 and water.',
  'The French Revolution began in 1789 and led to the Declaration of the Rights of Man.',
  'Newton formulated the law of universal gravitation after observing the motion of celestial bodies.',
  'Shakespeare wrote approximately 37 plays and 154 sonnets between 1589 and 1613.',
  'The water cycle includes evaporation, condensation, precipitation, and collection.',
  'World War I started in 1914 after the assassination of Archduke Franz Ferdinand.',
  'DNA carries genetic information in a double helix structure made of nucleotides.',
];

export function submissionText() {
  return ANSWERS[randInt(0, ANSWERS.length - 1)];
}

export function pickByWeight(weightedItems) {
  const total = weightedItems.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of weightedItems) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return weightedItems[weightedItems.length - 1].value;
}
