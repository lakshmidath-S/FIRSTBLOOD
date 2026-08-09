// Small shared UI primitives so every page shares the same look instead of
// each hand-rolling its own button/card classes. Deliberately minimal —
// plain Tailwind utility composition, no external component library.
import { forwardRef } from "react";

const VARIANTS = {
  primary: "bg-blood-600 hover:bg-blood-700 text-white shadow-soft disabled:hover:bg-blood-600",
  secondary: "bg-white hover:bg-ink-50 text-ink-800 border border-ink-200 shadow-soft disabled:hover:bg-white",
  subtle: "bg-ink-100 hover:bg-ink-200 text-ink-700 disabled:hover:bg-ink-100",
  danger: "bg-red-600 hover:bg-red-700 text-white shadow-soft disabled:hover:bg-red-600",
  dangerSubtle: "bg-red-50 hover:bg-red-100 text-red-700 disabled:hover:bg-red-50",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-soft disabled:hover:bg-emerald-600",
};

const SIZES = {
  sm: "text-xs px-2.5 py-1.5 rounded-lg",
  md: "text-sm px-4 py-2 rounded-lg",
  lg: "text-sm px-5 py-2.5 rounded-xl font-semibold",
};

export const Button = forwardRef(function Button(
  { variant = "primary", size = "md", className = "", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`bg-white border border-ink-200/70 rounded-xl shadow-soft ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className = "", children }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

const BADGE_TONES = {
  gray: "bg-ink-100 text-ink-600",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blood: "bg-blood-50 text-blood-700",
};

export function Badge({ tone = "gray", className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${BADGE_TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, action, className = "" }) {
  return (
    <div className={`flex items-end justify-between gap-3 flex-wrap mb-3 ${className}`}>
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-blood-600">{eyebrow}</p>}
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-blood-500/30 focus:border-blood-500 transition ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-blood-500/30 focus:border-blood-500 transition ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select
      className={`w-full border border-ink-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blood-500/30 focus:border-blood-500 transition ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

// A pill-style two-option (or more) segmented toggle — used everywhere a
// page picks between "by distance" / "by city" style mutually-exclusive
// choices instead of a raw row of buttons.
export function SegmentedToggle({ options, value, onChange, className = "" }) {
  return (
    <div className={`flex gap-1 p-1 bg-ink-100 rounded-lg ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
            value === opt.value ? "bg-white text-blood-700 shadow-soft" : "text-ink-500 hover:text-ink-700"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default", icon: Icon }) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : "text-ink-900";
  return (
    <div className="bg-ink-50 border border-ink-200/60 rounded-lg p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        {Icon && <Icon size={15} className="text-ink-400" />}
      </div>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
      {hint && <p className="text-xs text-ink-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="text-center py-10 px-4 border border-dashed border-ink-200 rounded-xl bg-white/50">
      <p className="text-sm font-medium text-ink-600">{title}</p>
      {description && <p className="text-xs text-ink-400 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
