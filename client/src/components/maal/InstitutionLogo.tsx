import { useState } from "react";
import { resolveInstitution } from "@/lib/institutions";

/**
 * Institution logo with graceful degradation:
 *   1. `logoUrl` passthrough (e.g. a future `logo_url` column) or the local
 *      official logo from the institutions registry → <img>
 *   2. On load failure or unknown institution → brand-coloured monogram tile
 *      (neutral ink tile when the institution isn't in the registry).
 */
export function InstitutionLogo({
  name,
  logoUrl,
  size = 28,
  className,
}: {
  name?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const info = resolveInstitution(name);
  const src = logoUrl || info?.logo || null;
  const display = (info?.name || name || "").trim();

  if (src && !failed) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={display || "Institution"}
        loading="lazy"
        onError={() => setFailed(true)}
        className={className}
        style={{ borderRadius: 6, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }

  const background = info?.color || "#0E0E10";
  const color = info?.textOnColor || "#FFFFFF";

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        background,
        color,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {display ? display.charAt(0).toUpperCase() : "?"}
    </span>
  );
}
