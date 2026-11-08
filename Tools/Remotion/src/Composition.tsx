import { AbsoluteFill, Composition, useCurrentFrame } from "remotion";

export const MyComposition = () => (
  <Composition id="StudioTest" component={StudioTest} durationInFrames={90} fps={30} width={640} height={360} />
);

const StudioTest = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", color: "#ffffff", fontFamily: "Arial", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
      <div>Remotion ready</div>
      <div style={{ position: "absolute", bottom: 50, left: 30 + frame * 5, width: 40, height: 40, borderRadius: 20, backgroundColor: "#ffffff" }} />
    </AbsoluteFill>
  );
};
