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
  "phone", "phonenumber", "phone_enc", "name", "patientname", "subjectname",
  "code", "reservationcode", "pin", "pinhash", "token", "refreshtoken",
  "password", "secret", "authorization", "prescriptionimage", "imagebytes",
  "medicine", "medicinename", "itemname", "note", "address",
].map((k) => k.toLowerCase()));

/** Values longer than this are truncated — a log line is not a payload store. */
const MAX_VALUE = 200;

/**
 * Names are matched case-insensitively. A field called `PatientName` is the
 * same field as `patientName`, and a redactor that disagrees is one that
 * depends on which service happened to name it.
 */
const forbidden = (key: string): boolean => NEVER_LOG.has(key.toLowerCase());

/** One value, redacted — including inside arrays.
 *
 *  Arrays used to be skipped: the recursion tested `!Array.isArray(v)` and
 *  assigned anything else through untouched. The request a patient submits is
 *  `lines: [{ itemId, packs, ... }]`, and an offer is `lines: [{ itemName,
 *  note, ... }]` — so the one shape in the product that actually carries
 *  medicine names and a pharmacist's words was the one shape that walked past
 *  the redactor into the log. §8 says the audit records that a read happened,
 *  never what was read; a log line listing medicines is a medical record in a
 *  text file. */
function scrub(v: unknown): unknown {
  if (typeof v === "string") return v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE)}…` : v;
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") return redact(v as LogFields);
  return v;
}

export function redact(fields: LogFields): LogFields {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = forbidden(k) ? "[redacted]" : scrub(v);
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
