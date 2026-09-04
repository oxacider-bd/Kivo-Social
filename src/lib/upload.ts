"use client";

import { api } from "@/lib/api";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  SUPABASE_BUCKET_BY_KIND,
  supabaseStoragePublicUrl,
} from "@/lib/supabase";

const MAX_IMAGE_DIMENSION = 1600;
const THUMBNAIL_QUALITY = 0.85;

export interface UploadedMedia {
  url: string;
  type: "image" | "video";
  width: number | null;
  height: number | null;
}

export type UploadKind = "avatar" | "cover" | "post" | "moment";

const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40MB

/** Validates + (for images) downscales via canvas, then uploads to /api/uploads. */
export async function uploadMedia(
  file: File,
  kind: UploadKind,
  opts?: { maxDimension?: number },
): Promise<UploadedMedia> {
  const isImage = ALLOWED_IMAGE.includes(file.type);
  const isVideo = ALLOWED_VIDEO.includes(file.type);
  if (!isImage && !isVideo) {
    throw new Error("That file type isn't supported. Use JPG, PNG, WebP, GIF, MP4 or WebM.");
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    throw new Error("Images are limited to 8MB.");
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error("Videos are limited to 40MB.");
  }

  if (isImage && file.type !== "image/gif") {
    const resized = await resizeImage(file, opts?.maxDimension ?? MAX_IMAGE_DIMENSION);
    return sendToServer(resized.blob, "image", kind, resized.width, resized.height);
  }
  return sendToServer(file, isImage ? "image" : "video", kind, null, null);
}

async function sendToServer(
  blob: Blob,
  type: "image" | "video",
  kind: UploadKind,
  width: number | null,
  height: number | null,
): Promise<UploadedMedia> {
  const ext =
    blob.type === "image/webp"
      ? "webp"
      : blob.type === "image/png"
        ? "png"
        : blob.type === "image/gif"
          ? "gif"
          : blob.type === "video/mp4"
            ? "mp4"
            : blob.type === "video/webm"
              ? "webm"
              : blob.type === "video/quicktime"
                ? "mov"
                : "jpg";

  // Production path: direct browser upload to the project's Supabase Storage
  // bucket, into the signed-in user's own folder (`<auth.uid()>/…`) — the
  // storage policies are the authorization layer. Works on any host (no
  // server filesystem involved).
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (user) {
      const bucket = SUPABASE_BUCKET_BY_KIND[kind];
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const objectPath = `${user.id}/${month}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(objectPath, blob, {
        contentType: blob.type,
        cacheControl: "31536000",
      });
      if (!error) {
        return { url: supabaseStoragePublicUrl(bucket, objectPath), type, width, height };
      }
      console.warn("[upload] Supabase Storage unavailable; using the app uploader.");
    }
  }

  // Fallback: the app's own uploader (legacy local accounts / not configured).
  const formData = new FormData();
  formData.append("file", blob, `upload.${ext}`);
  formData.append("kind", kind);
  const data = await api<{ url: string }>("/api/uploads", { formData });
  return { url: data.url, type, width, height };
}

/** Client-side downscale keeps uploads small and uploads fast. */
async function resizeImage(
  file: File,
  maxDimension: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Your browser couldn't process that image."))),
      "image/webp",
      THUMBNAIL_QUALITY,
    ),
  );
  return { blob, width, height };
}

export async function getImageDimensions(
  url: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
