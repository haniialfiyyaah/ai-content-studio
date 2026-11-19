import React from "react";
import { ShortFormVideo } from "./ShortFormVideo";

/**
 * Remotion root registry placeholder.
 * Wire with `registerRoot` once remotion packages are installed:
 *   import { Composition, registerRoot } from "remotion";
 */
export const RemotionRoot: React.FC = () => {
  return (
    <ShortFormVideo
      title="AI Content Studio"
      scenes={[{ caption: "Composition root ready for Remotion bundling" }]}
    />
  );
};

export default RemotionRoot;
