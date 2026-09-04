import { destroySession } from "@/lib/auth";
import { ok, route } from "@/lib/api-helpers";

export const POST = route(async () => {
  await destroySession();
  return ok({ signedOut: true });
});
