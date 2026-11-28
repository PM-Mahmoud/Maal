import { useState } from "react";
import { resolveInstitution } from "@/lib/institutions";

/**
 * Institution logo with graceful degradation:
 *   1. An explicit logo URL (when supplied).
 *   2. The local official logo from the institution registry.
 *   3. On load failure or unknown institution → brand-coloured monogram tile
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
  const [failed, setFailed] = useState<string[]>([]);
  const info = resolveInstitution(name);
  const src = [logoUrl, info?.logo].find((url) => !!url && !failed.includes(url));
  const local = !!info && src === info.logo;
  const display = (info?.name || name || "").trim();

  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt={display || "Institution"}
        loading="lazy"
        onError={() => setFailed((urls) => [...urls, src])}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          objectFit: "contain",
          flexShrink: 0,
          boxSizing: "border-box",
          padding: local ? Math.max(2, Math.round(size * 0.1)) : undefined,
          background: local ? info.logoBackground : undefined,
        }}
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
