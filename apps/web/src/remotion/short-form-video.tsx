"use client";

import React from "react";
import { Audio, Video } from "@remotion/media";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface ShortFormScene {
  narration?: string;
  caption?: string;
}

export interface ShortFormVideoProps {
  title: string;
  scenes: ShortFormScene[];
  /** Optional fal (or fixture) footage layered under captions. */
  footageUrl?: string | null;
  /** Optional ElevenLabs (or fixture) narration track. */
  narrationUrl?: string | null;
  narrationVolume?: number;
}

/** Frames per scene at 30fps → ~3s; 3 scenes ≈ 9s MVP clip. */
export const SHORT_FORM_SCENE_FRAMES = 90;

/** Browser MVP composition: 720p landscape, short duration. */
export const BROWSER_COMPOSITION = {
  id: "ShortFormVideo",
  fps: 30,
  width: 1280,
  height: 720,
  maxScenes: 3,
} as const;

/**
 * Short-form composition for Remotion Player + @remotion/web-renderer.
 * Uses @remotion/media Video/Audio (required for browser rendering).
 * Avoids unsupported browser CSS (no backdropFilter).
 */
export const ShortFormVideo: React.FC<ShortFormVideoProps> = ({
  title,
  scenes,
  footageUrl = null,
  narrationUrl = null,
  narrationVolume = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const safeScenes =
    scenes.length > 0
      ? scenes.slice(0, BROWSER_COMPOSITION.maxScenes)
      : [{ caption: "AI Content Studio", narration: "" }];

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, [0, 20], [24, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 20% 10%, #2a241c 0%, #171410 55%, #0f0d0a 100%)",
        color: "#f4efe6",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      {footageUrl ? (
        <AbsoluteFill>
          <Video
            src={footageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted
            volume={0}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(15,13,10,0.55) 0%, rgba(15,13,10,0.25) 40%, rgba(15,13,10,0.72) 100%)",
            }}
          />
        </AbsoluteFill>
      ) : null}

      {narrationUrl ? (
        <Audio src={narrationUrl} volume={narrationVolume} />
      ) : null}

      <AbsoluteFill
        style={{
          padding: 48,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7dd3c7",
            }}
          >
            Content Studio
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: 48,
              lineHeight: 1.08,
              fontWeight: 600,
              maxWidth: "90%",
            }}
          >
            {title}
          </h1>
        </div>

        <div style={{ position: "relative", minHeight: 160 }}>
          {safeScenes.map((scene, index) => {
            const from = index * SHORT_FORM_SCENE_FRAMES;
            return (
              <Sequence
                key={`scene-${index}`}
                from={from}
                durationInFrames={SHORT_FORM_SCENE_FRAMES}
                name={`scene-${index + 1}`}
              >
                <SceneCard
                  caption={
                    scene.caption || scene.narration || `Scene ${index + 1}`
                  }
                  index={index}
                  total={safeScenes.length}
                  fps={fps}
                />
              </Sequence>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function SceneCard({
  caption,
  index,
  total,
  fps,
}: {
  caption: string;
  index: number;
  total: number;
  fps: number;
}): React.ReactElement {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 12, SHORT_FORM_SCENE_FRAMES - 12, SHORT_FORM_SCENE_FRAMES],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const rise = interpolate(frame, [0, 16], [28, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${rise}px)`,
        border: "1px solid rgba(244, 239, 230, 0.16)",
        borderRadius: 20,
        padding: "24px 28px",
        background: "rgba(255, 252, 247, 0.1)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 16,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#a39a8c",
        }}
      >
        Scene {index + 1} / {total} ·{" "}
        {Math.round(SHORT_FORM_SCENE_FRAMES / fps)}s
      </p>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 28,
          lineHeight: 1.25,
          maxWidth: "28ch",
        }}
      >
        {caption}
      </p>
    </div>
  );
}

/** Duration for a scene list (capped for browser MVP). */
export function durationInFramesForScenes(sceneCount: number): number {
  const count = Math.max(
    1,
    Math.min(sceneCount, BROWSER_COMPOSITION.maxScenes),
  );
  return count * SHORT_FORM_SCENE_FRAMES;
}

/**
 * Extends composition length so narration/footage are not truncated.
 * Falls back to scene-based duration when media durations are unknown.
 */
export function durationInFramesForComposition(params: {
  sceneCount: number;
  narrationDurationMs?: number | null;
  footageDurationMs?: number | null;
  fps?: number;
}): number {
  const fps = params.fps ?? BROWSER_COMPOSITION.fps;
  const sceneFrames = durationInFramesForScenes(params.sceneCount);
  const narrationFrames = params.narrationDurationMs
    ? Math.ceil((params.narrationDurationMs / 1000) * fps)
    : 0;
  const footageFrames = params.footageDurationMs
    ? Math.ceil((params.footageDurationMs / 1000) * fps)
    : 0;
  return Math.max(sceneFrames, narrationFrames, footageFrames);
}
