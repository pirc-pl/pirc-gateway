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
// IRC TRANSPORT LAYER
// ===========================================================================
// This file handles WebSocket transport and raw IRC message parsing.
// It is the lowest layer in the architecture:
//   WebSocket → irc_transport.js (parsing) → irc_protocol.js → chat_integrator.js → gateway_display.js
// ===========================================================================

// ===========================================================================
// IRC MESSAGE LOGGING AND FILTERING
// ===========================================================================

const ircLog = {
	'channelPrefixes': '#&',
	'privateCommands': ['PRIVMSG', 'NOTICE', 'TAGMSG'],
	'authCommands': ['PASS', 'AUTHENTICATE', 'OPER'],
	'isChannel': function(target) {
		if (!target || target.length === 0) return false;
		return this.channelPrefixes.indexOf(target.charAt(0)) !== -1;
	},
	'filterIncoming': function(msg) {
		if (!msg) return msg;
		const replacer = (key, value) => key === 'user' ? undefined : value;
		if (this.authCommands.indexOf(msg.command) !== -1) {
			const filtered = JSON.parse(JSON.stringify(msg, replacer));
			filtered.args = ['[hidden]'];
			return filtered;
		}
		if (this.privateCommands.indexOf(msg.command) === -1) {
			return msg;
		}
		const filtered = JSON.parse(JSON.stringify(msg, replacer));
		const target = filtered.args && filtered.args[0];
		if (this.isChannel(target)) {
			if (filtered.args.length > 1) {
				filtered.args[filtered.args.length - 1] = '[hidden]';
			}
		} else {
			filtered.args = ['[hidden]'];
			filtered.sender = {nick: '[hidden]', ident: '[hidden]', host: '[hidden]', server: false, user: true};
		}
		return filtered;
	},
	'filterOutgoing': function(line) {
		const parts = line.split(' ');
		const cmd = parts[0].toUpperCase();
		if (this.authCommands.indexOf(cmd) !== -1) {
			return `${cmd  } [hidden]`;
		}
		if (this.privateCommands.indexOf(cmd) === -1) {
			return line;
		}
		const target = parts[1];
		const colonIdx = line.indexOf(' :');
		if (this.isChannel(target)) {
			if (colonIdx !== -1) {
				return `${line.substring(0, colonIdx)  } :[hidden]`;
			}
			return `${parts.slice(0, 2).join(' ')  } [hidden]`;
		} else {
			return `${cmd  } [hidden] :[hidden]`;
		}
	}
};

// ===========================================================================
// IRC MESSAGE PARSER
// ===========================================================================

const irc = {
	'messagedata': function() {
		this.args = [];
		this.tags = {};
		this.command = '';
		this.sender = {
			'nick': '',
			'ident': '',
			'host': '',
			'server': false,
			'user': false
		};
		this.time = new Date();
		this.getLabel = function() { // get originating label even if it's a batch or even a nested batch
			if ('label' in this.tags)
				return this.tags.label;
			if ('batch' in this.tags) {
				const batch = chat.batch[this.tags.batch]; // Access chat.batch via event
				if (!batch)
					return null;
				if (batch.label)
					return batch.label;
				for (const parent of batch.parents) {
					if (parent.label)
						return parent.label;
				}
				return null;
			};
		};
	},
	'parseMessage': function(msg) {
		const packets = [];
		let packetcnt = 0;
		msg = msg.split(/\r?\n/);
		for (const line of msg) {
			packets[packetcnt++] = irc.parseLine(line);
		}
		return { packets: packets };
	},
	'parseTags': function(tagsLine) {
		const tags = {};
		let tagState = 'keyName';
		let keyValue = '';
		let keyName = '';
		for (let i = 0; i < tagsLine.length; i++) {
			const cchar = tagsLine.charAt(i);
			switch (tagState) {
				case 'keyName':
					switch (cchar) {
						case '=':
							tagState = 'keyValue';
							keyValue = '';
							break;
						case ';':
							tags[keyName] = '';
							keyName = ''; // staying in tagStateKeyName
							break;
						default: keyName += cchar; break;
					}
					break;
				case 'keyValue':
					switch (cchar) {
						case '\\': tagState = 'keyValueEscape'; break;
						case ';':
							tags[keyName] = keyValue;
							keyName = '';
							tagState = 'keyName';
							break;
						default: keyValue += cchar; break;
					}
					break;
				case 'keyValueEscape':
					switch (cchar) {
						case ':': keyValue += ';'; break;
						case 's': keyValue += ' '; break;
						case 'r': keyValue += '\r'; break;
						case 'n': keyValue += '\n'; break;
						// Per IRC spec, unrecognized escape sequences are treated as the escaped char
						default: keyValue += cchar; break;
					}
					tagState = 'keyValue';
					break;
			}
		}
		if (keyName.length > 0) tags[keyName] = keyValue; // flush last tag
		return tags;
	},
	'parseLine': function(line) {
		const ircmsg = new irc.messagedata();

		line = line.trim();
		if (line == '') {
			return;
		}
		const msglen = line.length;
		let pstate = 'start';
		let currArg = '';
		let tags = '';
		let prevChar = '';

		for (let i = 0; i < msglen; i++) {
			const cchar = line.charAt(i);
			switch (pstate) {
				case 'start':
					switch (cchar) {
						case '@': pstate = 'tags'; break;
						case ':': pstate = 'senderNick'; break;
						default:
							pstate = 'command';
							ircmsg.command += cchar;
							break;
					}
					break;
				case 'tags':
					switch (cchar) {
						case ' ':
							pstate = 'start';
							ircmsg.tags = irc.parseTags(tags);
							break;
						default: tags += cchar; break;
					}
					break;
				case 'senderNick':
					switch (cchar) {
						case '!': pstate = 'senderUser'; break;
						case '@': pstate = 'senderHost'; break;
						case ' ':
							pstate = 'command'; break;
						default: ircmsg.sender.nick += cchar; break;
					}
					break;
				case 'senderUser':
					switch (cchar) {
						case '@': pstate = 'senderHost'; break;
						case ' ':
							pstate = 'command'; break;
						default: ircmsg.sender.ident += cchar; break;
					}
					break;
				case 'senderHost':
					switch (cchar) {
						case ' ':
							pstate = 'command'; break;
						default: ircmsg.sender.host += cchar; break;
					}
					break;
				case 'command':
					switch (cchar) {
						case ' ':
							pstate = 'args'; break;
						default: ircmsg.command += cchar; break;
					}
					break;
				case 'args':
					switch (cchar) {
						case ' ':
							if (currArg != '') {
								ircmsg.args.push(currArg);
							}
							currArg = '';
							break;
						case ':':
							if (prevChar == ' ') {
								pstate = 'message';
							}
							else {
								currArg += cchar;
							}
							break;
						default: currArg += cchar; break;
					}
					break;
				case 'message':
					currArg += cchar;
					break;
			}
			prevChar = cchar;
		}
		if (pstate == 'args' || pstate == 'message') {
			ircmsg.args.push(currArg);
		}
		if (ircmsg.sender.ident == '' && ircmsg.sender.host == '' && ircmsg.sender.nick.indexOf('.') != -1) {
			ircmsg.sender.server = true;
		} else {
			ircmsg.sender.user = true;
		}


		// Freeze parsed result - immutable transport output; enrichment happens in processData
		Object.freeze(ircmsg.args);
		Object.freeze(ircmsg.tags);
		Object.freeze(ircmsg.sender);
		Object.freeze(ircmsg);
		return ircmsg;
	}
};

// ===========================================================================
// IRC TRANSPORT (WebSocket)
// ===========================================================================

/**
 * Per-connection IRC transport layer.
 *
 * @param {IrcEventEmitter} events - Connection-scoped event bus.
 * @param {ChatIntegrator}          chat - Connection's chat state.
 */
class IrcTransport {
	constructor(events, chat) {
		this._events = events;
		this._domain = chat;
		this.websock = null;
		this.delayedSendTimer = false;
		this.toSend = [];
		this.sendDelayCnt = 0;
		this.sockErrorPending = null;
		this.labelProcessed = false;
		this.commandProcessing = false;
		this.connectionNick = '';
	}

	/**
	 * Configure WebSocket connection handlers and send timer
	 */
	configureConnection() {
		const self = this;
		this.websock.onmessage = function(e) { self.onRecv(e); };
		this.websock.onerror = function(e) { self.sockError(e); };
		this.websock.onclose = function(e) { self.sockError(e); };
		if (this.delayedSendTimer) {
			clearInterval(this.delayedSendTimer);
			this.delayedSendTimer = false;
		}
		this.delayedSendTimer = setInterval(() => {
			if (self.toSend.length > 0) {
				self.forceSend(self.toSend.shift());
			} else {
				if (self.sendDelayCnt > 0) {
					self.sendDelayCnt--;
				}
			}
		}, 1000);
	}

	/**
	 * Initiate WebSocket connection to IRC server
	 * @param {boolean} force - Whether this is a forced reconnect
	 */
	connect(force, nick) {
		const self = this;
		if (nick !== undefined) this.connectionNick = nick || '';
		this._events.emit('chat:connectionInitiated'); // Inform chat layer

		// Request chat layer to manage connection timeout
		this._events.emit('chat:setConnectionTimeout', { duration: 20000 });
		this.websock = new WebSocket(mainSettings.server);
		this.websock.onopen = function(e) {
			self.configureConnection();
			let username = mainSettings.defaultName;
			if (self.connectionNick) {
				username += ` "${  self.connectionNick  }"`;
			}
			setTimeout(() => {
				self._events.emit('chat:requestCapLs', { version: '302' });
				self._events.emit('chat:requestUser', { username: 'pirc', mode: '*', unused: '*', realname: username });
				self._events.emit('chat:requestNickChange', { newNick: self.connectionNick });
			}, 0);
			self._events.emit('chat:userClearState');
		};
	}

	/**
	 * User-initiated reconnect
	 */
	reconnect() {
		const self = this;
		if (this.sockErrorPending !== null) {
			clearTimeout(this.sockErrorPending);
			this.sockErrorPending = null;
		}
		if (this.websock) {
			this.websock.onerror = undefined;
			this.websock.onclose = undefined;
			this.websock.close();
		}
		this.websock = null;
		this.toSend = [];
		this.sendDelayCnt = 0;
		setTimeout(() => {
			self._events.emit('chat:setConnectStatus', { status: 'disconnected' });
			self._events.emit('transport:reconnecting');
			self.connect(true);
		}, 500);
	}

	/**
	 * WebSocket error handler
	 * @param {Event} e - WebSocket error event
	 */
	sockError(e) {
		const self = this;
		console.error('WebSocket error!');
		if (this.sockErrorPending !== null) return; // onerror and onclose can both fire; deduplicate
		this.sockErrorPending = setTimeout(() => {
			self.sockErrorPending = null;
			self._events.emit('chat:websocketError', { event: e, currentStatus: self._domain.connectStatus, autoReconnect: settings.get('autoReconnect') });
		}, 1000);
	}

	/**
	 * WebSocket message receiver
	 * @param {MessageEvent} sdata - WebSocket message event
	 */
	onRecv(sdata) {
		const self = this;
		if (typeof sdata.data === 'string' || sdata.data instanceof String) {
			const data = irc.parseMessage(sdata.data);
			self.processData(data);
			self._events.emit('chat:processConnectionStatusUpdate');
		} else {
			const reader = new FileReader();
			reader.addEventListener('loadend', () => {
				const data = irc.parseMessage(reader.result);
				self.processData(data);
				self._events.emit('chat:processConnectionStatusUpdate');
			});
			reader.readAsText(sdata.data);
		}
	}

	/**
	 * Process incoming IRC message data
	 * @param {Object} data - Parsed IRC message data
	 */
	processData(data) {
		this.commandProcessing = true;
		for (const msg of data.packets) {
			this.labelProcessed = false;
			if (!msg || !msg.command) continue;

			// Create mutable enriched copy of the immutable parsed message,
			// attaching the sender's user object and batch reference
			const enrichedMsg = Object.assign({}, msg);
			enrichedMsg.user = msg.sender.nick ? this._domain.users.getUser(msg.sender.nick) : null;
			if (msg.tags && 'batch' in msg.tags && msg.tags.batch) {
				const batchObj = this._domain.batch[msg.tags.batch];
				if (batchObj) {
					enrichedMsg.batch = batchObj;
				}
			}

			try {
				console.log('→', ircLog.filterIncoming(enrichedMsg));
				// Let chat update user state from sender info and message tags
				this._events.emit('chat:processIncomingTags', { msg: enrichedMsg });
				const command = enrichedMsg.command;
				this._events.emit(`cmd:${  command}`, enrichedMsg); // Emit raw protocol event

				if (!this._events.hasListeners(`cmd:${  command}`)) {
					this._events.emit('protocol:unhandledMessage', {
						command: enrichedMsg.command,
						args: enrichedMsg.args,
						text: enrichedMsg.text,
						time: enrichedMsg.time,
						sender: enrichedMsg.sender
					});
				}
			} catch (error) {
				console.error('Error processing message!', enrichedMsg, error);
			}
			if (('label' in enrichedMsg.tags && !('isBatchStart' in enrichedMsg)) || ('isBatchEnd' in enrichedMsg)) {
				let batch = null;
				let label;
				if ('label' in enrichedMsg.tags) {
					label = enrichedMsg.tags.label;
				} else {
					const batchObj = this._domain.batch[enrichedMsg.tags.batch];
					if (!batchObj || !batchObj.label)
						continue;
					label = batchObj.getLabel();
					if (!label)
						continue;
					batch = batchObj;
				}
				if (!this.labelProcessed) {
					this._events.emit('chat:labelNotProcessed', { label: label, msg: enrichedMsg, batch: batch });
				}
				this._events.emit('chat:clearLabelState', { label: label });
			}
		}
		this.commandProcessing = false;
	}

	/**
	 * Send IRC command with throttling
	 * @param {string} data - IRC command to send
	 */
	send(data) {
		if (this.websock && this.websock.readyState === this.websock.OPEN && (this.sendDelayCnt < 3 || !this._domain.isConnected())) {
			this.forceSend(data);
			this.sendDelayCnt++;
		} else {
			this.toSend.push(data);
		}
	}

	/**
	 * Send IRC command immediately without throttling
	 * @param {string} data - IRC command to send
	 */
	forceSend(data) {
		if (this.websock && this.websock.readyState === this.websock.OPEN) {
			console.log(`← ${  ircLog.filterOutgoing(data)}`);
			const sdata = `${data  }\r\n`;
			this.websock.send(sdata);
		} else {
			console.log(`Outmsg delayed: ${  ircLog.filterOutgoing(data)}`);
			this.toSend.push(data);
		}
	}
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { IrcTransport };
}
