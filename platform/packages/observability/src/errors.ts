/**
 * Error reporting — actionable by construction.
 *
 * @blueprint §8 · §5 rule 3
 * @owner platform-foundation
 * @why "Every failure must produce actionable logs." A report that says
 *      something went wrong is not actionable. Every report here carries what
 *      failed, what the caller was doing, and whether the caller's work
 *      survived — the three questions Blueprint v3 §23 requires every error
 *      surface to answer.
 * @implements observability/errors
 */
import { redact, type Logger } from "./logger.js";

export type Severity = "expected" | "unexpected" | "critical";

export type ErrorReport = {
  readonly severity: Severity;
  /** What the caller was attempting, in domain terms. */
  readonly operation: string;
  /** Whether the caller's work survived — the question an error surface must
   *  answer and almost never does. */
  readonly workPreserved: boolean;
  readonly correlationId: string;
  readonly cause: unknown;
  readonly context?: Readonly<Record<string, unknown>>;
};

export interface ErrorSink { report(r: ErrorReport): void; }

/**
 * A domain refusal is EXPECTED. Reporting it as an error trains the team to
 * ignore errors, which is how a real one gets missed. Refusals are logged at
 * info with their code; only unexpected failures reach the error sink.
 */
export function createErrorReporter(sink: ErrorSink, log: Logger) {
  /**
   * The sink gets the same redaction the log does.
   *
   * `context` is arbitrary caller fields — exactly what `redact` exists for —
   * and it was reaching the sink raw while the identical fields went through
   * the redactor on their way to the log. An error sink is the path that
   * leaves the device, so it was the weaker half of the two.
   *
   * `cause` is deliberately left intact: a stack is what makes a failure
   * actionable, and this module's purpose is actionable failures. A sink
   * implementation must treat it as untrusted content.
   */
  const safe = (r: Omit<ErrorReport, "severity">, severity: Severity): ErrorReport => ({
    ...r, severity,
    ...(r.context === undefined ? {} : { context: redact(r.context) }),
  });

  return {
    refusal(operation: string, code: string, correlationId: string, context: Readonly<Record<string, unknown>> = {}): void {
      // `refusalCode`, not `code`: "code" is on the never-log list because it
      // means a patient's PICKUP code, and logging this under that name erased
      // the single most useful field a refusal has. Two different things had
      // the same name, and the redactor — correctly — could not tell them
      // apart. A domain refusal code is a closed-set enum and carries no
      // patient content.
      log.info(`refused: ${operation}`, { refusalCode: code, correlationId, ...context });
    },
    unexpected(r: Omit<ErrorReport, "severity">): void {
      const report = safe(r, "unexpected");
      log.error(`failed: ${r.operation}`, {
        correlationId: r.correlationId, workPreserved: r.workPreserved,
        cause: r.cause instanceof Error ? r.cause.message : String(r.cause),
        ...(r.context ?? {}),
      });
      sink.report(report);
    },
    critical(r: Omit<ErrorReport, "severity">): void {
      const report = safe(r, "critical");
      log.error(`CRITICAL: ${r.operation}`, {
        correlationId: r.correlationId, workPreserved: r.workPreserved,
        cause: r.cause instanceof Error ? r.cause.message : String(r.cause),
        ...(r.context ?? {}),
      });
      sink.report(report);
    },
  };
}

export const memoryErrorSink = (): ErrorSink & { reports: ErrorReport[] } => {
  const reports: ErrorReport[] = [];
  return { reports, report: (r) => { reports.push(r); } };
};
