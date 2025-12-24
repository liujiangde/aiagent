export function getPort() {
  const raw = process.env.PORT || "4000"
  const n = parseInt(raw)
  return Number.isFinite(n) && n > 0 ? n : 4000
}
