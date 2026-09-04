"use client";

import type { ReactionType } from "@/types";

export const REACTIONS: {
  type: ReactionType;
  emoji: string;
  label: string;
  color: string;
}[] = [
  { type: "LOVE", emoji: "❤️", label: "Love", color: "text-red-500" },
  { type: "FUNNY", emoji: "😂", label: "Funny", color: "text-amber-500" },
  { type: "WOW", emoji: "😮", label: "Wow", color: "text-violet-500" },
  { type: "SAD", emoji: "😢", label: "Sad", color: "text-sky-600" },
  { type: "FIRE", emoji: "🔥", label: "Fire", color: "text-orange-500" },
  { type: "SUPPORT", emoji: "🤝", label: "Support", color: "text-emerald-500" },
];

export function reactionMeta(type: ReactionType) {
  return REACTIONS.find((r) => r.type === type) ?? REACTIONS[0];
}

export const FEELINGS: { emoji: string; label: string }[] = [
  { emoji: "😊", label: "happy" },
  { emoji: "🤩", label: "excited" },
  { emoji: "😌", label: "peaceful" },
  { emoji: "😤", label: "determined" },
  { emoji: "🥳", label: "celebratory" },
  { emoji: "😴", label: "sleepy" },
  { emoji: "🤔", label: "thoughtful" },
  { emoji: "🤯", label: "amazed" },
  { emoji: "💪", label: "motivated" },
  { emoji: "🧠", label: "focused" },
  { emoji: "🚀", label: "ship-it mode" },
  { emoji: "☕", label: "caffeinated" },
];

export const MOMENT_BACKGROUNDS: { id: string; className: string }[] = [
  { id: "ember", className: "bg-gradient-to-br from-orange-400 via-rose-500 to-red-500" },
  { id: "forest", className: "bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700" },
  { id: "dusk", className: "bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600" },
  { id: "dawn", className: "bg-gradient-to-br from-amber-300 via-orange-400 to-rose-400" },
  { id: "slate", className: "bg-gradient-to-br from-slate-600 via-slate-700 to-slate-900" },
  { id: "ocean", className: "bg-gradient-to-br from-teal-400 via-cyan-600 to-sky-700" },
];

export const MAX_POST_CHARS = 5000;
export const MAX_COMMENT_CHARS = 2000;
