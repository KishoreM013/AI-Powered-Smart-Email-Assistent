/**
 * Logging shim.
 *
 * The Cloud Functions version imported `logger` from firebase-functions, which
 * does not exist in a plain Deno runtime. Supabase captures console output and
 * surfaces it in the dashboard's Logs view, so this writes structured lines to
 * stderr, which is what gets picked up.
 */

type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", msg: string, fields?: Fields): void {
  const line = { level, msg, ...fields };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const logger = {
  info: (fields: Fields | string) =>
    typeof fields === "string" ? write("info", fields) : write("info", fields.msg as string, fields),
  warn: (fields: Fields | string) =>
    typeof fields === "string" ? write("warn", fields) : write("warn", fields.msg as string, fields),
  error: (fields: Fields | string) =>
    typeof fields === "string" ? write("error", fields) : write("error", fields.msg as string, fields),
};
