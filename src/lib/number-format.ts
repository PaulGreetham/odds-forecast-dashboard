export function formatEuro(value: number) {
  return `€${value.toFixed(2)}`;
}

export function formatEuroSigned(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}€${Math.abs(value).toFixed(2)}`;
}
