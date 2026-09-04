"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * KIVO 6-digit OTP input.
 *
 * Accessibility + input model: ONE real <input> (the accessible logical
 * field) spans all six visual slots, so native browser behavior covers
 * typing, backspace, arrow keys, select-all and pasting a full code — no
 * fragile multi-input choreography. The slots are a visual mirror
 * (aria-hidden) of the input's value.
 *
 *  - numeric only, exactly `length` digits (non-digits are stripped)
 *  - `inputMode="numeric"` + `autoComplete="one-time-code"` for mobile
 *    keyboards and OTP autofill
 *  - font-size ≥ 16px on the real input to avoid iOS focus zoom
 *  - states: focus (slot ring + caret), error (destructive + one gentle
 *    shake via the parent's key), success (emerald), disabled
 *  - respects prefers-reduced-motion
 */

export interface OtpInputProps {
  /** Current digits only (controlled). */
  value: string;
  onChange: (digits: string) => void;
  /** Code length — the Supabase template sends a 6-digit token. */
  length?: number;
  disabled?: boolean;
  /** Marks all slots destructive (invalid code). */
  error?: boolean;
  /** Marks all slots emerald (verified). */
  success?: boolean;
  /** Focus the field on mount. */
  autoFocus?: boolean;
  /** Accessible name for the single logical input. */
  label?: string;
  /** ids of elements describing the input (error/status text). */
  describedBy?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  error = false,
  success = false,
  autoFocus = true,
  label = "6-digit verification code",
  describedBy,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const digits = value.replace(/\D/g, "").slice(0, length);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip first, THEN cap — never rely on maxLength, which would truncate a
    // pasted code like "12-34-56 78" to its first 6 raw characters and lose
    // digits before the numeric filter runs.
    onChange(e.target.value.replace(/\D/g, "").slice(0, length));
  }

  // The highlighted "active" slot follows the caret position (end of value).
  const activeIndex = focused && !success ? Math.min(digits.length, length - 1) : -1;

  return (
    <div className={cn("relative w-fit mx-auto", disabled && "pointer-events-none")}>
      <style>{`
        @keyframes kivo-otp-caret {
          0%, 45% { opacity: 1; }
          50%, 95% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes kivo-otp-shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-3px); }
          40%, 60% { transform: translateX(3px); }
        }
        .kivo-otp-shake { animation: kivo-otp-shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
        .kivo-otp-caret { animation: kivo-otp-caret 1.1s step-end infinite; }
        @media (prefers-reduced-motion: reduce) {
          .kivo-otp-shake, .kivo-otp-caret { animation: none; }
        }
      `}</style>

      {/* Visual slots — a mirror of the input's value (screen readers use the input). */}
      <div aria-hidden="true" className={cn("flex justify-center gap-1.5 sm:gap-3", error && "kivo-otp-shake")}>
        {Array.from({ length }).map((_, i) => {
          const char = digits[i] ?? "";
          const active = i === activeIndex && !disabled;
          return (
            <div
              key={i}
              className={cn(
                "relative flex h-12 w-10 sm:h-14 sm:w-12 items-center justify-center rounded-xl border bg-background",
                "text-lg sm:text-xl font-semibold tabular-nums transition-all duration-150",
                char
                  ? "border-foreground/25 text-foreground"
                  : "border-border text-transparent",
                active &&
                  "-translate-y-0.5 border-brand ring-[3px] ring-brand/20",
                error &&
                  "border-destructive/60 bg-destructive/5 text-destructive",
                success &&
                  "border-emerald-500/70 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
                disabled && "opacity-60",
              )}
            >
              {char || (active ? "" : "•")}
              {active && !char && (
                <span className="kivo-otp-caret absolute left-1/2 top-1/2 h-4 sm:h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
              )}
            </div>
          );
        })}
      </div>

      {/* The single accessible logical input covering the slots. */}
      <input
        ref={inputRef}
        type="text"
        name="otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        enterKeyHint="done"
        value={digits}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={error || undefined}
        spellCheck={false}
        className="absolute inset-0 h-full w-full cursor-default rounded-xl text-base opacity-0 outline-none disabled:cursor-not-allowed"
        style={{ caretColor: "transparent" }}
      />
    </div>
  );
}
