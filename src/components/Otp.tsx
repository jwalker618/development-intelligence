import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Fires once when the 6th digit lands (auto-submit). */
  onComplete?: (v: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * Six-cell OTP field (design 5a): one hidden input drives six rendered cells,
 * so `one-time-code` autocomplete and paste-fills-all-six work natively.
 * Reused by login step B and the MFA enrol/disable confirms.
 */
export function Otp({ value, onChange, onComplete, disabled, error, autoFocus }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (value.length === 6 && firedFor.current !== value) {
      firedFor.current = value;
      onComplete?.(value);
    }
    if (value.length < 6) firedFor.current = null;
  }, [value, onComplete]);

  const active = Math.min(value.length, 5);

  return (
    <div
      className={`otp-row${disabled ? " disabled" : ""}`}
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        className="otp-hidden"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-label="6-digit code"
      />
      {Array.from({ length: 6 }, (_, i) => {
        const digit = value[i] ?? "";
        const isActive = !disabled && i === active && value.length < 6;
        return (
          <span
            key={i}
            className={[
              "otp-cell",
              digit ? "filled" : "",
              isActive ? "active" : "",
              error ? "err" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {digit}
            {isActive && <i className="otp-caret" />}
          </span>
        );
      })}
    </div>
  );
}
