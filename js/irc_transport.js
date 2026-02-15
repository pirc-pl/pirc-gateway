/* Copyright (c) 2020 k4be and the PIRC.pl Team
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
//   WebSocket → irc_transport.js (parsing) → irc_protocol.js → gateway_domain.js → gateway_display.js
// ===========================================================================

// ===========================================================================
// IRC MESSAGE LOGGING AND FILTERING
// ===========================================================================

var ircLog = {
	'channelPrefixes': '#&',
	'privateCommands': ['PRIVMSG', 'NOTICE', 'TAGMSG'],
	'authCommands': ['PASS', 'AUTHENTICATE', 'OPER'],
	'isChannel': function(target) {
		if (!target || target.length === 0) return false;
		return this.channelPrefixes.indexOf(target.charAt(0)) !== -1;
	},
	'filterIncoming': function(msg) {
		if (!msg) return msg;
		if (this.authCommands.indexOf(msg.command) !== -1) {
			var filtered = JSON.parse(JSON.stringify(msg));
			filtered.args = ['[hidden]'];
			filtered.text = '';
			return filtered;
		}
		if (this.privateCommands.indexOf(msg.command) === -1) {
			return msg;
		}
		var filtered = JSON.parse(JSON.stringify(msg));
		var target = filtered.args && filtered.args[0];
		if (this.isChannel(target)) {
			filtered.text = '[hidden]';
			if (filtered.args.length > 1) {
				filtered.args[filtered.args.length - 1] = '[hidden]';
			}
		} else {
			filtered.text = '[hidden]';
			filtered.args = ['[hidden]'];
			filtered.sender = {nick: '[hidden]', ident: '[hidden]', host: '[hidden]', server: false, user: true};
		}
		return filtered;
	},
	'filterOutgoing': function(line) {
		var parts = line.split(' ');
		var cmd = parts[0].toUpperCase();
		if (this.authCommands.indexOf(cmd) !== -1) {
			return cmd + ' [hidden]';
		}
		if (this.privateCommands.indexOf(cmd) === -1) {
			return line;
		}
		var target = parts[1];
		var colonIdx = line.indexOf(' :');
		if (this.isChannel(target)) {
			if (colonIdx !== -1) {
				return line.substring(0, colonIdx) + ' :[hidden]';
			}
			return parts.slice(0, 2).join(' ') + ' [hidden]';
		} else {
			return cmd + ' [hidden] :[hidden]';
		}
	}
};

// ===========================================================================
// IRC MESSAGE PARSER
// ===========================================================================

var irc = {
	'lastNick': '', // This is domain state (guser.nick)
	'messagedata': function() {
		this.text = '';
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
		this.getLabel = function(){ // get originating label even if it's a batch or even a nested batch
			if('label' in this.tags)
				return this.tags.label;
			if('batch' in this.tags){
				var batch = domainBatch[this.tags.batch]; // Access domainBatch via event
				if(!batch)
					return null;
				if(batch.label)
					return batch.label;
				for(var i=0; i<batch.parents.length; i++){
					if(batch.parents[i].label)
						return batch.parents[i].label;
				}
				return null;
			};
		};
	},
	'oldData': '',
	'parseMessage': function(msg){
		var packets = [];
		var packetcnt = 0;
		msg = msg.split(/\r?\n/);
		for(var i=0; i<msg.length; i++){
			packets[packetcnt++] = irc.parseLine(msg[i]);
		}
		return {'status': 2, 'packets': packets };
	},
	'parseTags': function(tagsLine){
		var tags = {};
		var tagState = 'keyName';
		var keyValue = '';
		var keyName = '';
		for(var i = 0; i < tagsLine.length; i++){
			var cchar = tagsLine.charAt(i);
			switch(tagState){
				case 'keyName':
					switch(cchar){
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
					switch(cchar){
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
					switch(cchar){
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
		if(keyName.length > 0) tags[keyName] = keyValue; // flush last tag
		return tags;
	},
	'parseLine': function(line){
		var ircmsg = new irc.messagedata();

		var line = line.trim();
		if(line == ''){
			return;
		}
		var msglen = line.length;
		var pstate = 'start';
		var currArg = '';
		var tags = '';
		var haveText = false;
		var prevChar = '';

		for(var i = 0; i < msglen; i++){
			var cchar = line.charAt(i);
			switch(pstate){
				case 'start':
					switch(cchar){
						case '@': pstate = 'tags'; break;
						case ':': pstate = 'senderNick'; break;
						default:
							pstate = 'command';
							ircmsg.command += cchar;
							break;
					}
					break;
				case 'tags':
					switch(cchar){
						case ' ':
							pstate = 'start';
							ircmsg.tags = irc.parseTags(tags);
							break;
						default: tags += cchar; break;
					}
					break;
				case 'senderNick':
					switch(cchar){
						case '!': pstate = 'senderUser'; break;
						case '@': pstate = 'senderHost'; break;
						case ' ':
							pstate = 'command'; break;
						default: ircmsg.sender.nick += cchar; break;
					}
					break;
				case 'senderUser':
					switch(cchar){
						case '@': pstate = 'senderHost'; break;
						case ' ':
							pstate = 'command'; break;
						default: ircmsg.sender.ident += cchar; break;
					}
					break;
				case 'senderHost':
					switch(cchar){
						case ' ':
							pstate = 'command'; break;
						default: ircmsg.sender.host += cchar; break;
					}
					break;
				case 'command':
					switch(cchar){
						case ' ':
							pstate = 'args'; break;
						default: ircmsg.command += cchar; break;
					}
					break;
				case 'args':
					switch(cchar){
						case ' ':
							if(currArg != ''){
								ircmsg.args.push(currArg);
							}
							currArg = '';
										break;
						case ':':
								if(prevChar == ' '){
											pstate = 'message';
										haveText = true;
										}
										else {
											currArg += cchar;
										}
										break;
							default: currArg += cchar; break;
					}
					break;
				case 'message':
					ircmsg.text += cchar;
					break;
			}
			prevChar = cchar;
		}
		if(pstate == 'args'){
			ircmsg.args.push(currArg);
		}
		if(ircmsg.sender.ident == '' && ircmsg.sender.host == '' && ircmsg.sender.nick.indexOf('.')!=-1){
			ircmsg.sender.server = true;
		} else {
			ircmsg.sender.user = true;
		}

		if(!haveText){
			ircmsg.text = ircmsg.args[ircmsg.args.length-1]; // handling last argument as text if : is missing
		} else {
			ircmsg.args.push(ircmsg.text); // handling text as a last argument as required by the protocol
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

var ircTransport = {
	'websock': 0,
	'delayedSendTimer': false,
	'toSend': [],
	'sendDelayCnt': 0,
	'sockErrorPending': null,

	/**
	 * Configure WebSocket connection handlers and send timer
	 */
	'configureConnection': function(){
		ircTransport.websock.onmessage = ircTransport.onRecv;
		ircTransport.websock.onerror = ircTransport.sockError;
		ircTransport.websock.onclose = ircTransport.sockError;
		if(ircTransport.delayedSendTimer){
			clearInterval(ircTransport.delayedSendTimer);
			ircTransport.delayedSendTimer = false;
		}
		ircTransport.delayedSendTimer = setInterval(function(){
			if(ircTransport.toSend.length > 0){
				ircTransport.forceSend(ircTransport.toSend.shift());
			} else {
				if(ircTransport.sendDelayCnt > 0){
					ircTransport.sendDelayCnt--;
				}
			}
		}, 1000);
	},

	/**
	 * Initiate WebSocket connection to IRC server
	 * @param {boolean} force - Whether this is a forced reconnect
	 */
	'connect': function(force) {
		ircEvents.emit('domain:connectionInitiated'); // Inform domain layer

		// Request domain layer to manage connection timeout
		ircEvents.emit('domain:setConnectionTimeout', { duration: 20000 });
		ircTransport.websock = new WebSocket(mainSettings.server);
		ircTransport.websock.onopen = function(e){
			ircTransport.configureConnection();
			var username = mainSettings.defaultName;
			try {
				var ckNick = localStorage.getItem('origNick');
			 	if(ckNick){
					username += ' "'+ckNick+'"';
				}
			} catch(e) {}
			setTimeout(function() {
				// These are raw protocol commands, so directly calling ircCommand is fine for now
				ircEvents.emit('domain:requestCapLs', { version: '302' });
				ircEvents.emit('domain:requestUser', { username: 'pirc', mode: '*', unused: '*', realname: username });
				ircEvents.emit('domain:requestNickChange', { newNick: guser.nick }); // guser.nick is domain
			}, 0);
			ircEvents.emit('domain:userClearState'); // Clear guser state via domain event
		}
	},

	/**
	 * User-initiated reconnect
	 */
	'reconnect': function() {
		if (ircTransport.sockErrorPending !== null) {
			clearTimeout(ircTransport.sockErrorPending);
			ircTransport.sockErrorPending = null;
		}
		ircTransport.websock.onerror = undefined;
		ircTransport.websock.onclose = undefined;
		if (ircTransport.websock) {
		    ircTransport.websock.close();
		}
		ircTransport.websock = false;
		setTimeout(function(){
			ircEvents.emit('domain:setConnectStatus', { status: 'disconnected' });
			$$.closeDialog('connect', 'reconnect');
			$$.displayDialog('connect', '1', language.connecting, language.reconnectingWait);
			ircTransport.connect(true);
		}, 500);
	},

	/**
	 * WebSocket error handler
	 * @param {Event} e - WebSocket error event
	 */
	'sockError': function(e) {
		console.error('WebSocket error!');
		if (ircTransport.sockErrorPending !== null) return; // onerror and onclose can both fire; deduplicate
		ircTransport.sockErrorPending = setTimeout(function(){
			ircTransport.sockErrorPending = null;
			ircEvents.emit('domain:websocketError', { event: e, currentStatus: domainConnectStatus, autoReconnect: settings.get('autoReconnect') }); // Emit domain event
		}, 1000);
	},

	/**
	 * WebSocket message receiver
	 * @param {MessageEvent} sdata - WebSocket message event
	 */
	'onRecv': function(sdata) {
		if(typeof sdata.data === 'string' || sdata.data instanceof String){
			var data = irc.parseMessage(sdata.data);
			ircTransport.processData(data);
			ircEvents.emit('domain:processConnectionStatusUpdate'); // Signal domain to re-evaluate connection status
		} else {
			var reader = new FileReader();
			reader.addEventListener("loadend", function() {
				var data = irc.parseMessage(reader.result);
				ircTransport.processData(data);
				ircEvents.emit('domain:processConnectionStatusUpdate'); // Signal domain to re-evaluate connection status
			});
			reader.readAsText(sdata.data);
		}
	},

	/**
	 * Process incoming IRC message data
	 * @param {Object} data - Parsed IRC message data
	 */
	'processData': function(data) {
		gateway.commandProcessing = true;
		for (i in data.packets) {
			gateway.labelProcessed = false; // Set domain state
			var msg = data.packets[i];
			if(!msg || !msg.command) continue;

			// Create mutable enriched copy of the immutable parsed message,
			// attaching the sender's user object and batch reference
			var enrichedMsg = Object.assign({}, msg);
			enrichedMsg.user = msg.sender.nick ? users.getUser(msg.sender.nick) : null;
			if(msg.tags && 'batch' in msg.tags && msg.tags.batch){
				var batchObj = domainBatch[msg.tags.batch]; // Access domainBatch via event
				if (batchObj) {
					enrichedMsg.batch = batchObj;
				}
			}

			try {
				console.log('→', ircLog.filterIncoming(enrichedMsg));
				// Let domain update user state from sender info and message tags
				ircEvents.emit('domain:processIncomingTags', { msg: enrichedMsg });
				var command = enrichedMsg.command;
				ircEvents.emit('cmd:' + command, enrichedMsg); // Emit raw protocol event

				if(!ircEvents.hasListeners('cmd:' + command)) {
					cmdNotImplemented(enrichedMsg); // UI call for unhandled command
				}
			} catch(error) {
				console.error('Error processing message!', enrichedMsg, error);
			}
			if(('label' in enrichedMsg.tags && !('isBatchStart' in enrichedMsg)) || ('isBatchEnd' in enrichedMsg)){
				var batch = null;
				if('label' in enrichedMsg.tags){
					var label = enrichedMsg.tags.label;
				} else {
					var batchObj = domainBatch[enrichedMsg.tags.batch]; // Access domainBatch
					if(!batchObj || !batchObj.label)
						continue;
					var label = batchObj.getLabel(); // Domain method
					if(!label)
						continue;
					batch = batchObj;
				}
				if(!gateway.labelProcessed){
					ircEvents.emit('domain:labelNotProcessed', { label: label, msg: enrichedMsg, batch: batch }); // Emit domain event
				}
				// Clearing callbacks/info/labelsToHide via domain events
				ircEvents.emit('domain:clearLabelState', { label: label }); // Emit domain event
			}
		}
		gateway.commandProcessing = false;
	},

	/**
	 * Send IRC command with throttling
	 * @param {string} data - IRC command to send
	 */
	'send': function(data) {
		if(ircTransport.websock.readyState === ircTransport.websock.OPEN && (ircTransport.sendDelayCnt < 3 || domainConnectStatus != 'connected')){
			ircTransport.forceSend(data);
			ircTransport.sendDelayCnt++;
		} else {
			ircTransport.toSend.push(data);
		}
	},

	/**
	 * Send IRC command immediately without throttling
	 * @param {string} data - IRC command to send
	 */
	'forceSend': function(data){
		if(ircTransport.websock.readyState === ircTransport.websock.OPEN){
			console.log('← '+ircLog.filterOutgoing(data));
			sdata = data + '\r\n';
			ircTransport.websock.send(sdata);
		} else {
			console.log('Outmsg delayed: '+ircLog.filterOutgoing(data));
			ircTransport.toSend.push(data);
		}
	}
};
