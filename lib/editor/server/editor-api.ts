/**
 * Shared helpers for the editor's endpoints. Those endpoints live in
 * `route.dev.ts` files, which are routes only in development (see
 * next.config.ts). `devOnly` is a second line of defence in case a handler is
 * ever reached in a production process.
 */
export function devOnly(): Response | null {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return null;
}

/** Runs a handler body and turns thrown errors into a 400 with their message. */
export async function respond(body: () => unknown | Promise<unknown>): Promise<Response> {
  const blocked = devOnly();
  if (blocked) return blocked;
  try {
    return Response.json(await body());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
