export function formatIqd(amount: number): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount)} د.ع`;
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  }).format(new Date(value));
}

export function formatClock(value: string): string {
  return new Intl.DateTimeFormat("ar-IQ-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatCountdown(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safeMilliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

