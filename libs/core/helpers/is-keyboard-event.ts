/**
 *
 * @param event
 */
export function isKeyboardEvent(event: Event): event is KeyboardEvent {
	return event instanceof KeyboardEvent;
}
