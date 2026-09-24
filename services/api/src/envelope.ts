import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function fail(message: string, code?: string): { ok: false; error: { message: string; code?: string } } {
  return code ? { ok: false, error: { message, code } } : { ok: false, error: { message } };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: Error & { statusCode?: unknown; validation?: unknown }, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send(fail("Validation failed", "VALIDATION_ERROR"));
    }
    const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
    if (statusCode === 401) return reply.status(401).send(fail(err.message || "Unauthorized", "UNAUTHORIZED"));
    if (statusCode === 403) return reply.status(403).send(fail(err.message || "Forbidden", "FORBIDDEN"));
    if (statusCode >= 400 && statusCode < 500) {
      // Every 4xx carries a machine-readable code.
      const codeByStatus: Record<number, string> = {
        400: "BAD_REQUEST",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        413: "PAYLOAD_TOO_LARGE",
        415: "UNSUPPORTED_MEDIA_TYPE",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
      };
      return reply.status(statusCode).send(fail(err.message || "Request failed", codeByStatus[statusCode] ?? "BAD_REQUEST"));
    }
    app.log.error(err);
    return reply.status(500).send(fail("Internal server error", "INTERNAL_ERROR"));
  });
}
