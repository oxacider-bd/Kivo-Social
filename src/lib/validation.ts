import { z } from "zod";

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(password)) return "Password needs a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs a number.";
  return null;
}

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[a-z]/, "Password needs a lowercase letter.")
  .regex(/[A-Z]/, "Password needs an uppercase letter.")
  .regex(/[0-9]/, "Password needs a number.");

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please use at least 2 characters.")
    .max(50, "Keep your name under 50 characters."),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_REGEX, "3–20 characters: lowercase letters, numbers or underscores."),
  email: z.string().trim().toLowerCase().email("That email doesn't look right."),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("That email doesn't look right."),
  password: z.string().min(1, "Please enter your password."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("That email doesn't look right."),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const privacyEnum = z.enum(["PUBLIC", "FOLLOWERS", "ONLY_ME"]);

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(50).optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(USERNAME_REGEX, "3–20 characters: lowercase letters, numbers or underscores.")
      .optional(),
    bio: z.string().trim().max(280, "Keep your bio under 280 characters.").optional(),
    mood: z.string().trim().max(60, "Keep your status under 60 characters.").optional(),
    avatarUrl: z.string().max(500).nullable().optional(),
    coverUrl: z.string().max(500).nullable().optional(),
    isPrivate: z.boolean().optional(),
    defaultPrivacy: privacyEnum.optional(),
    notificationPrefs: z
      .object({
        reactions: z.boolean(),
        comments: z.boolean(),
        replies: z.boolean(),
        follows: z.boolean(),
        mentions: z.boolean(),
        spaceActivity: z.boolean(),
      })
      .optional(),
  })
  .strict();

export const createPostSchema = z.object({
  content: z.string().trim().max(5000, "Posts are limited to 5,000 characters.").default(""),
  privacy: privacyEnum.default("PUBLIC"),
  feeling: z.string().max(80).nullable().optional(),
  linkUrl: z.string().url().max(2000).nullable().optional(),
  spaceId: z.string().max(50).nullable().optional(),
  media: z
    .array(
      z.object({
        url: z.string().min(1),
        type: z.enum(["image", "video"]),
        width: z.number().int().positive().nullable().optional(),
        height: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(4, "Up to 4 photos per post.")
    .default([]),
  poll: z
    .object({
      options: z
        .array(z.string().trim().min(1, "Option can't be empty.").max(80))
        .min(2, "A poll needs at least 2 options.")
        .max(4, "A poll can have at most 4 options."),
    })
    .optional(),
});

export const updatePostSchema = z
  .object({
    content: z.string().trim().max(5000).optional(),
    privacy: privacyEnum.optional(),
  })
  .strict();

export const commentSchema = z.object({
  content: z.string().trim().min(1, "Write something first.").max(2000, "Comments are limited to 2,000 characters."),
  parentId: z.string().max(50).nullable().optional(),
});

export const reactionSchema = z.object({
  type: z.enum(["LOVE", "FUNNY", "WOW", "SAD", "FIRE", "SUPPORT"]),
});

export const createMomentSchema = z
  .object({
    type: z.enum(["text", "image", "video", "poll"]),
    content: z.string().trim().max(280).default(""),
    mediaUrl: z.string().max(500).nullable().optional(),
    mediaType: z.enum(["image", "video"]).nullable().optional(),
    background: z.string().max(40).nullable().optional(),
    poll: z
      .object({
        options: z
          .array(z.string().trim().min(1).max(80))
          .min(2)
          .max(4),
      })
      .optional(),
  })
  .refine(
    (v) =>
      (v.type === "text" && v.content.length > 0) ||
      (v.type === "image" && v.mediaUrl) ||
      (v.type === "video" && v.mediaUrl) ||
      (v.type === "poll" && (v.content.length > 0 || !!v.mediaUrl) && v.poll),
    { message: "Add something to your moment — text, media or a poll." },
  );

export const createSpaceSchema = z.object({
  name: z.string().trim().min(3, "Space names need 3+ characters.").max(40),
  description: z.string().trim().max(300).default(""),
  avatarUrl: z.string().max(500).nullable().optional(),
  coverUrl: z.string().max(500).nullable().optional(),
});

export const updateSpaceSchema = z
  .object({
    name: z.string().trim().min(3).max(40).optional(),
    description: z.string().trim().max(300).optional(),
    rules: z.string().trim().max(3000).optional(),
    announcement: z.string().trim().max(600).optional(),
    avatarUrl: z.string().max(500).nullable().optional(),
    coverUrl: z.string().max(500).nullable().optional(),
  })
  .strict();

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Give your collection a name.").max(60),
});

export const votePollSchema = z.object({ optionId: z.string().min(1) });
