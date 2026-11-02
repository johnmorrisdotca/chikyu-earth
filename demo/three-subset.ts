// The parts of three.js the realistic Earth uses, and nothing else: the demo hands this to the element so the bundle holds a few
// hundred kilobytes of three instead of all of it. A page does the same with `setThreeLoader(() => import("./three-subset"))`.
export {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
