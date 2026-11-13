// The route on the Earth's sphere: one line of segments, made when a route is set and hidden when it is taken off. The same `LineSegments` the grid uses.
// Nothing here asks for a frame. The element asks for one when the route changes.
import type * as THREE from "three";
import type { ThreeParts } from "../realistic/textures.ts";
import type { GeoPoint } from "../types.ts";
import { routeLeg, routePoints, type RouteLeg } from "../route.ts";

/** How far above the ground the line sits, in Earth radii: over the grid and the sphere's facets. */
const ROUTE_RADIUS = 1.003;
const ROUTE_COLOUR = 0x7df9ff;

export interface RouteStats {
  on: boolean;
  kilometres: number;
  greatCircleKm: number;
  flightHours: number;
}

export interface RouteState {
  ends: { from: GeoPoint; to: GeoPoint } | null;
  version: number;
  failed: boolean;
  stats: RouteStats;
}

export const newRouteState = (): RouteState => ({ ends: null, version: 0, failed: false, stats: { on: false, kilometres: 0, greatCircleKm: 0, flightHours: 0 } });

const same = (a: { from: GeoPoint; to: GeoPoint } | null, b: { from: GeoPoint; to: GeoPoint } | null): boolean =>
  a === b || (a !== null && b !== null && a.from.lon === b.from.lon && a.from.lat === b.from.lat && a.to.lon === b.to.lon && a.to.lat === b.to.lat);

/** Put a route on the model. Returns false when it did not change, so the element does not ask for a frame. */
export function applyRoute(state: RouteState, ends: { from: GeoPoint; to: GeoPoint } | null): boolean {
  if (same(state.ends, ends)) return false;
  state.ends = ends;
  state.version += 1;
  const leg: RouteLeg | null = ends ? routeLeg(ends.from, ends.to) : null;
  state.stats = { on: leg !== null, kilometres: leg?.kilometres ?? 0, greatCircleKm: leg?.greatCircleKm ?? 0, flightHours: leg?.flightHours ?? 0 };
  return true;
}

const positionsOf = (from: GeoPoint, to: GeoPoint): Float32Array | null => {
  const points = routePoints(from, to, 96);
  if (points.length < 2) return null;
  const out = new Float32Array((points.length - 1) * 6);
  const put = (at: number, place: GeoPoint): void => {
    const lat = (place.lat * Math.PI) / 180;
    const lon = (place.lon * Math.PI) / 180;
    const c = Math.cos(lat) * ROUTE_RADIUS;
    out[at] = c * Math.sin(lon);
    out[at + 1] = Math.sin(lat) * ROUTE_RADIUS;
    out[at + 2] = c * Math.cos(lon);
  };
  for (let i = 0; i < points.length - 1; i += 1) {
    put(i * 6, points[i]!);
    put(i * 6 + 3, points[i + 1]!);
  }
  return out;
};

export interface RouteLayer {
  sync(): void;
  dispose(): void;
}

/**
 * The route under `parent` (the group that turns with the Earth). Needs `LineSegments`, as the grid does.
 */
export function createRouteLayer(three: ThreeParts, parent: THREE.Object3D, state: RouteState): RouteLayer {
  const Lines = three.LineSegments;
  if (!Lines) throw new Error("the three.js handed over has no LineSegments, which the route needs");
  const geometry = new three.BufferGeometry();
  const material = new three.LineBasicMaterial({ color: ROUTE_COLOUR, transparent: true, opacity: 0.95, depthWrite: false });
  const line = new Lines(geometry, material);
  line.visible = false;
  line.frustumCulled = false;
  line.renderOrder = 2;
  parent.add(line);
  let built = -1;
  return {
    sync() {
      if (built === state.version) return;
      built = state.version;
      const ends = state.ends;
      const positions = ends ? positionsOf(ends.from, ends.to) : null;
      if (!positions) {
        line.visible = false;
        return;
      }
      geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
      geometry.computeBoundingSphere();
      line.visible = true;
    },
    dispose() {
      parent.remove(line);
      geometry.dispose();
      material.dispose();
    },
  };
}
