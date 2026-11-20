import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the brand sparkle on the studio gradient. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#765ce3,#9b80f0)" }}>
        <svg width="120" height="120" viewBox="0 0 64 64">
          <path d="M32 9l5.5 13.5L51 28l-13.5 5.5L32 47l-5.5-13.5L13 28l13.5-5.5z" fill="#fff" />
          <path d="M48 41l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" opacity="0.85" />
        </svg>
      </div>
    ),
    size,
  );
}
