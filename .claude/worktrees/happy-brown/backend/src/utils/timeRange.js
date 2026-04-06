export function rangeToStart(range) {
  const now = new Date();
  const start = new Date(now);

  switch (range) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "7d":
    default:
      start.setDate(start.getDate() - 7);
      break;
  }
  return start;
}
