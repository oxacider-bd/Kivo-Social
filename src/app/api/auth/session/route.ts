import { ok, route } from "@/lib/api-helpers";
import { toSessionDTO } from "@/lib/dto";

export const GET = route(async ({ user }) => {
  if (!user) return ok(null);
  return ok(toSessionDTO(user));
});
