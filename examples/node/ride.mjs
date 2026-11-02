import { ridePose } from "@johnmorrisdotca/chikyu-earth/space";

// Where a camera riding along with the ISS looks: 420 km up over the +x axis, going along -z, tipped towards the horizon.
const pose = ridePose({ position: [1.066, 0, 0], velocity: [0, 0, -7.66], look: "horizon", yaw: 0, tilt: 0, zoom: 1 });
console.log(`The horizon is ${pose.earthRadiusDegrees.toFixed(0)} degrees from straight down; the camera looks ${pose.forward.map((n) => n.toFixed(2)).join(", ")}.`);
