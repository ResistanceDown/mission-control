const PACIFIC_TIME_ZONE = 'America/Los_Angeles'

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

function parseDateLike(value: string | number | Date | null | undefined, assumeSeconds = false) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    const millis = assumeSeconds ? value * 1000 : value
    const parsed = new Date(millis)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const raw = String(value).trim()
  if (!raw) return null
  if (/\bPT\b/.test(raw)) return raw
  const numeric = Number(raw)
  if (!Number.isNaN(numeric) && /^\d+(\.\d+)?$/.test(raw)) {
    const millis = assumeSeconds ? numeric * 1000 : numeric
    const parsed = new Date(millis)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatWith(
  value: string | number | Date | null | undefined,
  formatter: Intl.DateTimeFormat,
  suffix = '',
  assumeSeconds = false,
) {
  const parsed = parseDateLike(value, assumeSeconds)
  if (!parsed) return 'n/a'
  if (typeof parsed === 'string') return parsed
  return `${formatter.format(parsed)}${suffix}`
}

export function formatPacificDateTime(value: string | number | Date | null | undefined, options?: { assumeSeconds?: boolean }) {
  return formatWith(value, DATE_TIME_FORMATTER, ' PT', options?.assumeSeconds)
}

export function formatPacificDate(value: string | number | Date | null | undefined, options?: { assumeSeconds?: boolean }) {
  return formatWith(value, DATE_FORMATTER, '', options?.assumeSeconds)
}

export function formatPacificTime(value: string | number | Date | null | undefined, options?: { assumeSeconds?: boolean }) {
  return formatWith(value, TIME_FORMATTER, ' PT', options?.assumeSeconds)
}
