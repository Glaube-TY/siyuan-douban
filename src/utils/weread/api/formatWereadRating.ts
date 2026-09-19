export function formatWereadRatingPercent(value: unknown): string {
  const numericValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const percent = numericValue > 100 ? numericValue / 10 : numericValue;
  return percent > 0 ? `${Number(percent.toFixed(1))}%` : "";
}
