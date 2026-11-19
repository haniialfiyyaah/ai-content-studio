import React from "react";

/**
 * Remotion composition placeholder.
 * Live `remotion`/`@remotion/renderer` wiring lands when dependencies and
 * Chromium are available in the worker environment. Until then the HTTP
 * worker returns fixture outputs and never claims a real encode succeeded.
 */
export const ShortFormVideo: React.FC<{
  title: string;
  scenes: Array<{ narration?: string; caption?: string }>;
}> = ({ title, scenes }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#171410",
        color: "#f4efe6",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 48,
        fontFamily: "Georgia, serif",
      }}
    >
      <h1 style={{ fontSize: 64, margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 28, opacity: 0.8 }}>
        {scenes[0]?.caption || scenes[0]?.narration || "Scene 1"}
      </p>
    </div>
  );
};
