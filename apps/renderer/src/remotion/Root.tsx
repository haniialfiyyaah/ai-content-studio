import { Composition } from "remotion";
import { Short } from "./Short";
import { FPS, defaultProps, type ShortProps } from "./types";

export function Root() {
  return (
    <Composition
      id="Short"
      component={Short}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 12}
      defaultProps={defaultProps}
      calculateMetadata={({ props }: { props: ShortProps }) => {
        const scenes = props.scenes.reduce((sum, s) => sum + s.seconds, 0);
        const voice = props.words.length ? props.words[props.words.length - 1].end + 0.6 : 0;
        return { durationInFrames: Math.max(FPS * 3, Math.ceil(Math.max(scenes, voice) * FPS)) };
      }}
    />
  );
}
