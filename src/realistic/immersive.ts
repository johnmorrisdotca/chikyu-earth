// The full-screen mode of the 3D elements (the `immersive` attribute): the element fills its box in any shape, a plain wheel zooms instead of scrolling the page, and a touch drag turns the view.

/** The plain wheel in an immersive view is a pinch of this share: a notch (100) zooms about 1.2 times, as the family's mouse wheel does with Alt. */
const WHEEL_AS_PINCH = 0.2;

/** The host's styles in the immersive mode: any shape of box, and a touch drag that turns the view instead of scrolling the page. */
export const IMMERSIVE_STYLE = ":host([immersive]){aspect-ratio:auto;width:100%;height:100%;touch-action:none!important;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}";

/**
 * In an immersive view a plain wheel zooms. It is passed on to the shared hands as the wheel's own pinch (Ctrl and a small step), so whichever hands hold the view (the element's, or a bar bound to it) apply it with their
 * limits; Ctrl, Command, Alt and Shift with the wheel are the family's own and are left alone. Listen with `{ capture: true, passive: false }`, before the shared hands.
 */
export function immersiveWheel(host: HTMLElement, event: WheelEvent): void {
  if (!host.hasAttribute("immersive") || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const pixels = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * 800 : event.deltaY;
  host.dispatchEvent(new WheelEvent("wheel", { deltaY: Math.max(-250, Math.min(250, pixels)) * WHEEL_AS_PINCH, deltaMode: 0, clientX: event.clientX, clientY: event.clientY, ctrlKey: true, bubbles: true, cancelable: true, composed: true }));
}
