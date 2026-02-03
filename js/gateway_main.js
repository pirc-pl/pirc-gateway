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

/**
 * Application entry point.
 *
 * Creates the single IrcConnection instance (which owns chat, transport,
 * command, and per-connection event bus) and wires up system:ready handlers.
 *
 * Instantiation happens here at load time, not inside system:ready, because
 * the chat and protocol event listeners registered by other files must be
 * active immediately — both IRC data and user interaction can happen before
 * system:ready fires.
 *
 * system:ready is emitted from readyFunc() in gateway_functions.js after all
 * scripts, language files and addons have finished loading.
 */

// ---------------------------------------------------------------------------
// Per-connection object instantiation
// ---------------------------------------------------------------------------

// IrcConnection creates the chat, transport, command API and registers all
// protocol + chat event handlers on a per-connection event bus.
// conn.initialNick is set by parsePath() in gateway_conn.js (before this file loads).
// ircEvents (the global IRCEventEmitter) is the UI bus: chat events are
// forwarded to it with a connectionId field so UI listeners receive them.
const connection = new IrcConnection(conn.initialNick, ircEvents, 0);

// Point commandBus at the per-connection event bus so UI code reaches chat handlers directly.
initCommandBus(connection.events);

// Per-connection helpers (factory instances tied to this connection's chat + transport).
const commands = createUserCommands(commandBus, connection.chat, connection.transport);
const services = createServices(connection.chat, commandBus);

// Connection state accessors — reference the single UI connection.
function getConnectionStatus() { return connection.chat.connectStatus; }
function getConnectionTime()   { return connection.chat.connectTime;   }

// Copy initial channels parsed from URL path into chat.me (SelfUser).
connection.chat.me.channels = conn.initialChannels.slice();

// ---------------------------------------------------------------------------
// system:ready handlers
// ---------------------------------------------------------------------------

// UI environment setup (theme, selectors, language-dependent mode fields)
// setEnvironment is defined in gateway_functions.js and updates connection.chat.modes
// for the language-dependent fields (changeableSingle, changeableArg).
ircEvents.on('system:ready', setEnvironment);
ircEvents.on('system:ready', fillEmoticonSelector);
ircEvents.on('system:ready', fillColorSelector);

// Connection dialog and initial IRC flow — defined in gateway_conn.js
ircEvents.on('system:ready', conn.gatewayInit);

// Display event listeners and UI bindings registered in gateway_display.js
