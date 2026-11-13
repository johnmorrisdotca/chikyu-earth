// One press means one thing. A press that a satellite's dot or a path took (see space/path-controls.ts) is marked here, and the sky does not pick a star or a figure from it.
const claimed = new WeakSet<Event>();

/** Mark a press as taken. */
export const claimPress = (event: Event): void => {
  claimed.add(event);
};

/** Whether a press was taken by a dot or a path. */
export const pressClaimed = (event: Event): boolean => claimed.has(event);
