/**
 * Structured logging with redaction that is on by default.
 *
 * @blueprint §8 · §5
 * @owner platform-foundation
 * @why Blueprint v3 §8 says the audit stores a digest, never the content — it
 *      records that a read happened, not what was read. Logs must hold the same
 *      line. Redaction is applied to every field rather than at each call site,
 *      because a call site that must remember to redact will eventually forget.
 * @implements observability/logger
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Readonly<Record<string, unknown>>;

export type LogRecord = {
  readonly level: LogLevel;
  readonly message: string;
  readonly at: number;
  readonly service: string;
  readonly releaseId: string;
  readonly correlationId?: string;
  readonly fields: LogFields;
};

export interface LogSink { write(record: LogRecord): void; }

/**
 * Field names that are never logged, at any level, in any service. Clinical
 * content and identity are both on the list: a log line naming a medicine and
 * a phone number is a medical record in a text file.
 */
const NEVER_LOG = new Set([
  "phone", "phoneNumber", "phone_enc", "name", "patientName", "subjectName",
  "code", "reservationCode", "pin", "pinHash", "token", "refreshToken",
  "password", "secret", "authorization", "prescriptionImage", "imageBytes",
  "medicine", "medicineName", "itemName", "note", "address",
]);

/** Values longer than this are truncated — a log line is not a payload store. */
const MAX_VALUE = 200;

export function redact(fields: LogFields): LogFields {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (NEVER_LOG.has(k)) { out[k] = "[redacted]"; continue; }
    if (typeof v === "string" && v.length > MAX_VALUE) { out[k] = `${v.slice(0, MAX_VALUE)}…`; continue; }
    if (v && typeof v === "object" && !Array.isArray(v)) { out[k] = redact(v as LogFields); continue; }
    out[k] = v;
  }
  return out;
}

const ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LoggerOptions = {
  readonly service: string;
  readonly releaseId: string;
  readonly minLevel: LogLevel;
  readonly sink: LogSink;
  /** Explicit, because the domain is pure and nothing here may read a clock
   *  the caller did not supply. */
  readonly now: () => number;
};

export type Logger = {
  readonly [L in LogLevel]: (message: string, fields?: LogFields) => void;
} & {
  /** A child logger carries a correlation id so a flow is traceable end to
   *  end without every call site threading it manually. */
  child(correlationId: string, fields?: LogFields): Logger;
};

export function createLogger(opts: LoggerOptions, bound: LogFields = {}, correlationId?: string): Logger {
  const emit = (level: LogLevel) => (message: string, fields: LogFields = {}) => {
    if (ORDER[level] < ORDER[opts.minLevel]) return;
    opts.sink.write({
      level, message, at: opts.now(),
      service: opts.service, releaseId: opts.releaseId,
      ...(correlationId === undefined ? {} : { correlationId }),
      fields: redact({ ...bound, ...fields }),
    });
  };
  return {
    debug: emit("debug"), info: emit("info"), warn: emit("warn"), error: emit("error"),
    child(id, fields = {}) { return createLogger(opts, { ...bound, ...fields }, id); },
  };
}

/** The one global this package declares, so the rest of the platform can be
 *  compiled without the DOM lib and `console` stays greppable. */
declare const console: { log(...args: unknown[]): void };

export const consoleSink: LogSink = {
  write(record) {
    // The only place in the platform permitted to touch the console. Every
    // other layer takes a Logger, which is why this is greppable.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(record));
  },
};

export const memorySink = (): LogSink & { records: LogRecord[] } => {
  const records: LogRecord[] = [];
  return { records, write: (r) => { records.push(r); } };
};
