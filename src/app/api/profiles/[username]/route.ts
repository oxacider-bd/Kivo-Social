import { ok, requireUser, route } from "@/lib/api-helpers";
import {
  getProfileByUsernameOr404,
  getViewerFlags,
  toProfileDetail,
} from "../_lib/profile-server";

type Ctx = { username: string };

// ─── GET /api/profiles/:username ──────────────────────────────────────────────

export const GET = route<Ctx>(async ({ user, params }) => {
  const authed = requireUser(user);
  const profile = await getProfileByUsernameOr404(params.username);
  const viewer = await getViewerFlags(authed.id, profile);
  return ok(toProfileDetail(profile, viewer));
});
