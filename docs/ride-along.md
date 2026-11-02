# Riding along

`element.ride(target, options)` on `<chikyu-space>` puts the camera at a moving body (a satellite of a group set with `setSatellites`, the Moon, the Sun or a planet) at its real place for the moment shown,
and looks at the Earth. [guides/ride-along.md](guides/ride-along.md) (Japanese: [guides/ja/ride-along.md](guides/ja/ride-along.md)) has the example; this page is the design and the budget.

![Riding along with the ISS tipped towards the horizon: the Earth's curve and its atmosphere, and the orbits of the other stations in the sky](images/space-ride-horizon.png)

## How the camera is placed

- **From it** (`view: "from"`): the camera is at the body. `ridePose` (pure, `@johnmorrisdotca/chikyu-earth/space`) works out where it looks: straight at the Earth's centre, with the way the body is going
  (its velocity, less the part that points at the Earth) at the top of the picture; `look: "horizon"` tips it forward by the Earth's angular radius less 12 degrees, so the horizon is a little above the middle;
  the shared controls' tilt tips it further, their yaw turns it round the straight-down line, their zoom narrows the 60 degree field of view. A satellite's place and velocity are one exact SGP4 call a frame
  (never the interpolation, so the camera is right at any speed); a body's way of going is the difference of its places at the two ends of the ephemeris track.
- **Behind it** (`view: "follow"`): the camera keeps a fixed distance and looks at the body, from the direction the sky was in when the view was last moved (the same camera as "Look at"). For a satellite the
  distance is `distanceKm / zoom`.
- **Switching** glides: the camera's place, its turn (a spherical interpolation) and its field of view move from where the last draw left them to the new camera over 1.2 seconds, eased. Reduced motion jumps.
- The body being ridden is not drawn (the camera is inside it), nor is its name.

## When it draws

The space view draws only when something changes and at most 30 times a second (the shared gate). A ride changes the picture all the time, so the clock draws as often as the picture moves a pixel: the speed of
the ground under the camera over its height, times the focal length in pixels (for a satellite), or the turn of the direction to the Earth (for a body), times the clock's speed, from 1 to 30 times a second.
Paused: no timer, nothing drawn. Out of sight or in a hidden tab: the renderer draws nothing. Reduced motion: one update a second and no glide.

## The budget, and how each part is tested (`e2e/ride.gl.ts`, `e2e/space.soak.ts`, `e2e/freeze.demo.ts`)

| | The test |
|---|---|
| The camera is where the body is | the ISS: within 1 km of satellite.js's own place, 420 km up; the Moon: 10 Earth radii away (compressed), 55 to 66 in the true scale |
| It moves as the body does | the ISS at 60x: the camera goes round the Earth at the ISS's rate (within 2.5 degrees over 5 seconds) |
| Frame rate capped | ride the ISS at real time and at 60x, and Mars at a day a second: see the changelog for the frames a second; none over 30 |
| Nothing at rest | paused: 0 GL draws, 0 frame requests in 3 s; after a glide it rests |
| Nothing out of sight | scrolled away or a hidden tab at 60x: 0 GL draws |
| Reduced motion | no glide; about 1 frame a second at 60x |
| Smooth switching ends | the glide from the ISS to the Moon takes about 1.2 s, is part of the way after half a second, and then 0 draws |
| Lost target | elements too old for the date: `chikyu-ride-lost`, the ordinary camera |
| Dispose, recover | five switches and a stop leave the buffers and textures where they were; a lost context comes back and still rides |
| Soak | rides of every kind in the ten-minute soak: heap, GPU objects and draws flat (numbers in the changelog) |
