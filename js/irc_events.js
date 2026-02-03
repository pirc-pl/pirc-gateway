/* Copyright (c) 2020-2026 k4be and the PIRC.pl Team
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// ===========================================================================
// CONNECTION-SCOPED EVENT EMITTER
// ===========================================================================
// IrcEventEmitter is a per-connection event bus that extends IRCEventEmitter
// (defined in gateway_functions.js).  Every event emitted on a connection bus
// is also forwarded to the global UI bus (the parent) with a connectionId
// field added, so that UI layers listening on the global ircEvents bus receive
// all chat events for every connection in a uniform, tagged format.
//
// Two-bus model (Step 6 of multi_connection_plan.md):
//   Per-connection bus  (IrcEventEmitter)  — protocol ↔ chat, internal
//   Global UI bus       (global ircEvents) — chat → UI, tagged with connectionId
// ===========================================================================

/**
 * Connection-scoped event emitter.
 *
 * @param {IRCEventEmitter} parentBus  - The global UI bus (ircEvents).
 *                                       All emitted events are forwarded here
 *                                       with connectionId added to the payload.
 * @param {string|number}   connectionId - Identifier for this connection.
 */
class IrcEventEmitter extends IRCEventEmitter {
	constructor(parentBus, connectionId) {
		super();
		this._parentBus    = parentBus    || null;
		this._connectionId = connectionId !== undefined ? connectionId : null;
	}

	/**
	 * Emit an event on the per-connection bus and forward it to the parent UI bus.
	 *
	 * @param {string} event - Event name.
	 * @param {*}      data  - Event payload (object preferred).
	 * @returns {*} Return value from IRCEventEmitter.emit (used by generateLabel).
	 */
	emit(event, data) {
		// 1. Call handlers registered on this per-connection bus.
		const result = super.emit(event, data);

		// 2. Forward to global UI bus with connectionId injected.
		if (this._parentBus && this._connectionId !== null) {
			let fwdData;
			if (data !== null && data !== undefined && typeof data === 'object') {
				fwdData = Object.assign({ connectionId: this._connectionId }, data);
			} else {
				// Scalar / missing payload: wrap it so connectionId can be attached.
				fwdData = { connectionId: this._connectionId };
				if (data !== undefined) fwdData.value = data;
			}
			this._parentBus.emit(event, fwdData);
		}

		return result;
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { IrcEventEmitter };
}
