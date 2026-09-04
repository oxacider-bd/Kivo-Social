"use client";

import { create } from "zustand";

interface ComposerState {
  open: boolean;
  spacePreset: { id: string; name: string } | null;
  openComposer: (spacePreset?: { id: string; name: string } | null) => void;
  closeComposer: () => void;
}

export const useComposer = create<ComposerState>((set) => ({
  open: false,
  spacePreset: null,
  openComposer: (spacePreset = null) => set({ open: true, spacePreset }),
  closeComposer: () => set({ open: false, spacePreset: null }),
}));

interface UiState {
  unreadNotifications: number;
  setUnreadNotifications: (n: number) => void;
  incUnread: () => void;
}

export const useUi = create<UiState>((set) => ({
  unreadNotifications: 0,
  setUnreadNotifications: (n) => set({ unreadNotifications: n }),
  incUnread: () => set((s) => ({ unreadNotifications: s.unreadNotifications + 1 })),
}));
