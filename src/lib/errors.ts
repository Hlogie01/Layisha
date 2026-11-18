import "server-only";

interface DbError {
  code?: string;
  message: string;
}

/**
 * Turns a database error into something safe to show a user.
 * Messages we raise ourselves in SQL (`raise exception '...'`, code P0001) are
 * written for users and pass through. Anything else (constraint names, SQL
 * details) is logged on the server and replaced with `fallback`.
 */
export function userMessage(error: DbError, fallback: string): string {
  if (error.code === "P0001") return error.message;
  console.error(`[db] ${fallback}:`, error.code, error.message);
  return fallback;
}
