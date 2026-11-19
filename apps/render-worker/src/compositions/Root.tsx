import React from "react";
import { Composition } from "remotion";
import {
  ShortFormVideo,
  SHORT_FORM_SCENE_FRAMES,
  type ShortFormVideoProps,
} from "./ShortFormVideo";

export const COMPOSITION_ID = "ShortFormVideo";

const DEFAULT_PROPS: ShortFormVideoProps = {
  title: "AI Content Studio",
  scenes: [{ caption: "Your idea, produced on-brand." }],
};

/**
 * Remotion root — registers the short-form vertical composition.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={COMPOSITION_ID}
        component={ShortFormVideo}
        durationInFrames={SHORT_FORM_SCENE_FRAMES}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
        calculateMetadata={({ props }) => {
          const sceneCount = Math.max(props.scenes?.length ?? 1, 1);
          return {
            durationInFrames: sceneCount * SHORT_FORM_SCENE_FRAMES,
          };
        }}
      />
    </>
  );
};

export default RemotionRoot;
