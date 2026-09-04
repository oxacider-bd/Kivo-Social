import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";
import { fail, ok, requireUser, route } from "@/lib/api-helpers";

const KINDS = ["avatar", "cover", "post", "moment", "space"] as const;
type Kind = (typeof KINDS)[number];

const ALLOWED: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 8 * 1024 * 1024 },
  "image/png": { ext: "png", maxBytes: 8 * 1024 * 1024 },
  "image/webp": { ext: "webp", maxBytes: 8 * 1024 * 1024 },
  "image/gif": { ext: "gif", maxBytes: 8 * 1024 * 1024 },
  "video/mp4": { ext: "mp4", maxBytes: 40 * 1024 * 1024 },
  "video/webm": { ext: "webm", maxBytes: 40 * 1024 * 1024 },
  "video/quicktime": { ext: "mov", maxBytes: 40 * 1024 * 1024 },
};

/**
 * Local media storage with a Supabase-compatible bucket layout:
 * public/uploads/{bucket}/{yyyy-mm}/{uuid}.{ext}
 * Swapping to Supabase Storage later only requires changing this handler.
 */
export const POST = route(async ({ req, user }) => {
  requireUser(user);

  const formData = await req.formData().catch(() => null);
  if (!formData) return fail("VALIDATION", "No file received.");
  const file = formData.get("file");
  const kindRaw = String(formData.get("kind") ?? "post");
  if (!(file instanceof File)) return fail("VALIDATION", "No file received.");
  if (!KINDS.includes(kindRaw as Kind)) return fail("VALIDATION", "Invalid upload target.");

  const spec = ALLOWED[file.type];
  if (!spec) {
    return fail("VALIDATION", "That file type isn't supported. Use JPG, PNG, WebP, GIF, MP4 or WebM.");
  }
  if (file.size > spec.maxBytes) {
    return fail(
      "VALIDATION",
      file.type.startsWith("video/") ? "Videos are limited to 40MB." : "Images are limited to 8MB.",
    );
  }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(process.cwd(), "public", "uploads", kindRaw, month);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${spec.ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), bytes);

  return ok({ url: `/uploads/${kindRaw}/${month}/${filename}` });
});
