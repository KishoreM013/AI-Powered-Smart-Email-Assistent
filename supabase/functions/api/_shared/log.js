/**
 * Logging shim.
 *
 * The Cloud Functions version imported `logger` from firebase-functions, which
 * does not exist in a plain Deno runtime. Supabase captures console output and
 * surfaces it in the dashboard's Logs view, so this writes structured lines to
 * stderr, which is what gets picked up.
 */
function write(level, msg, fields) {
    const line = { level, msg, ...fields };
    const text = JSON.stringify(line);
    if (level === "error")
        console.error(text);
    else if (level === "warn")
        console.warn(text);
    else
        console.log(text);
}
export const logger = {
    info: (fields) => typeof fields === "string" ? write("info", fields) : write("info", fields.msg, fields),
    warn: (fields) => typeof fields === "string" ? write("warn", fields) : write("warn", fields.msg, fields),
    error: (fields) => typeof fields === "string" ? write("error", fields) : write("error", fields.msg, fields),
};
