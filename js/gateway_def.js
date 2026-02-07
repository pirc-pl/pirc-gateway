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
		this.user = null;
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

		if(ircmsg.sender.nick.length > 0){
			var user = users.getUser(ircmsg.sender.nick);
			ircmsg.user = user;

			// add u@h
			if(ircmsg.sender.user){
				if(ircmsg.sender.ident.length > 0) user.setIdent(ircmsg.sender.ident);
				if(ircmsg.sender.host.length > 0) user.setHost(ircmsg.sender.host);
			}

			if(ircmsg.sender.server){
				user.server = true;
			}
		}

		ircEvents.emit('domain:processIncomingTags', { ircmsg: ircmsg }); // Emit domain event
		return ircmsg;
	}
};

var gateway = {
	'websock': 0,
	// Removed connectStatus, joined, setConnectedWhenIdentified, firstConnect, userQuit, sasl, whowasExpect312, retrySasl, pingcnt
	// Removed whoisData, smallListData, lasterror, label, labelCallbacks, labelInfo, labelsToHide, batch
	// Removed connectTimeoutID - now managed by domain layer
	'labelProcessed': false, // Track if current label was processed
	'pingIntervalID': false,
	'whoChannelsIntervalID': false,
	'disconnectMessageShown': 0,
	// Removed displayOwnWhois, statusWindow, lastKeypressWindow, keypressSuppress - now in uiState (gateway_display.js)
	'allowNewSend' : true,
	'commandProcessing': false,
	'chanPassword': function(chan) {
		if($('#chpass').val() == ''){
			$$.alert(language.passwordNotGiven);
			return false;
		}
		ircEvents.emit('domain:requestJoinChannel', { channelName: chan, password: $('#chpass').val(), time: new Date() }); // Emit domain event
		$(".errorwindow").fadeOut(250); // UI action
		return true;
	},
	'reconnect': function() { // UI-initiated reconnect
		gateway.websock.onerror = undefined;
		gateway.websock.onclose = undefined;
		if (gateway.websock) {
		    gateway.websock.close();
		}
		gateway.websock = false;
		setTimeout(function(){
			ircEvents.emit('domain:setConnectStatus', { status: 'disconnected' });
			$$.closeDialog('connect', 'reconnect');
			$$.displayDialog('connect', '1', language.connecting, language.reconnectingWait);
			gateway.connect(true);
		}, 500);
	},
	// Removed iKnowIAmConnected: logic moved to domain:connected listener and UI client:connected listener
	// Removed disconnected: logic moved to domain:connectionDisconnected listener and UI client:disconnected listeners
	// Removed ping() method (now domain-driven)
	'configureConnection': function(){ // Protocol/Connection layer
		gateway.websock.onmessage = gateway.onRecv;
		gateway.websock.onerror = gateway.sockError;
		gateway.websock.onclose = gateway.sockError;
		if(gateway.delayedSendTimer){
			clearInterval(gateway.delayedSendTimer);
			gateway.delayedSendTimer = false;
		}
		gateway.delayedSendTimer = setInterval(function(){
			if(gateway.toSend.length > 0){
				gateway.forceSend(gateway.toSend.shift());
			} else {
				if(gateway.sendDelayCnt > 0){
					gateway.sendDelayCnt--;
				}
			}
		}, 1000);
	},
	'connect': function(force) { // Protocol/Connection layer init
		ircEvents.emit('domain:connectionInitiated'); // Inform domain layer

		// gateway.userQuit = false; // Handled by domain
		// Request domain layer to manage connection timeout
		ircEvents.emit('domain:setConnectionTimeout', { duration: 20000 });
		gateway.websock = new WebSocket(mainSettings.server);
		gateway.websock.onopen = function(e){
			gateway.configureConnection();
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
			// gateway.connectTime = (+new Date)/1000; // This should be domain state
		}
	},
	'processData': function(data) { // Protocol layer: process incoming parsed IRC messages
	//	while(gateway.commandProcessing); // This might cause blocking, reconsider if needed
		gateway.commandProcessing = true;
		for (i in data.packets) {
			// gateway.labelProcessed = false; // Managed by domain
			gateway.labelProcessed = false; // Set domain state
			try {
				var msg = data.packets[i];
				if(!msg || !msg.command) continue;
				console.log('→', ircLog.filterIncoming(msg));
				if(msg.tags && 'batch' in msg.tags && msg.tags.batch){
					var batchObj = domainBatch[msg.tags.batch]; // Access domainBatch via event
					if (batchObj) {
						msg.batch = batchObj;
					}
				}
				var command = msg.command;
				var continueProcessing = ircEvents.emit('cmd:' + command, msg); // Emit raw protocol event

				if(!ircEvents.hasListeners('cmd:' + command)) {
					cmdNotImplemented(msg); // UI call for unhandled command
				}
			} catch(error) {
				console.error('Error processing message!', msg, error);
			}
			if(('label' in msg.tags && !('isBatchStart' in msg)) || ('isBatchEnd' in msg)){
				var batch = null;
				if('label' in msg.tags){
					var label = msg.tags.label;
				} else {
					var batchObj = domainBatch[msg.tags.batch]; // Access domainBatch
					if(!batchObj || !batchObj.label)
						continue;
					var label = batchObj.getLabel(); // Domain method
					if(!label)
						continue;
					batch = batchObj;
				}
				// if(!gateway.labelProcessed){ // Managed by domain
				if(!gateway.labelProcessed){
					ircEvents.emit('domain:labelNotProcessed', { label: label, msg: msg, batch: batch }); // Emit domain event
				}
				// Clearing callbacks/info/labelsToHide via domain events
				ircEvents.emit('domain:clearLabelState', { label: label }); // Emit domain event
			}
		}
		gateway.commandProcessing = false;
	},
	'sockError': function(e) { // Protocol/Connection layer
		console.error('WebSocket error!');
		setTimeout(function(){
			ircEvents.emit('domain:websocketError', { event: e, currentStatus: domainConnectStatus, autoReconnect: settings.get('autoReconnect') }); // Emit domain event
		}, 1000);
	},
	'onRecv': function(sdata) { // Protocol layer: entry point from websocket
		if(typeof sdata.data === 'string' || sdata.data instanceof String){
			var data = irc.parseMessage(sdata.data);
			gateway.processData(data);
			ircEvents.emit('domain:processConnectionStatusUpdate'); // Signal domain to re-evaluate connection status
		} else {
			var reader = new FileReader();
			reader.addEventListener("loadend", function() {
				var data = irc.parseMessage(reader.result);
				gateway.processData(data);
				ircEvents.emit('domain:processConnectionStatusUpdate'); // Signal domain to re-evaluate connection status
			});
			reader.readAsText(sdata.data);
		}
	},
	'ctcp': function(dest, text) { // UI event handler, should emit domain event
		ircEvents.emit('domain:requestCtcpCommand', { dest: dest, text: text, time: new Date() }); // Emit domain event
	},
	// Removed processStatus() method (now domain-driven)
	// Removed joinChannels() method (now domain-driven)
	// Removed connectTimeout() method (now domain-driven)
	// Removed stopAndReconnect() method (now domain-driven)
	'initSys': function() { // UI initialization
		var html = language.connectingWaitHtml;
		$$.displayDialog('connect', '1', language.connecting, html);
	},
	'initialize': function() { // UI-initiated connection flow
		var nickInput, chanInput, passInput;

		if(settings.get('automLogIn')){
			if(conn.my_nick == '' || conn.my_reqChannel == ''){
				$$.alert(language.errorLoadingData);
				return false;
			}
			nickInput = conn.my_nick;
			chanInput = conn.my_reqChannel;
			passInput = conn.my_pass;
		} else {
			nickInput = $('#nsnick').val();
			chanInput = $('#nschan').val();
			passInput = $('#nspass').val();
			// Validation checks
			if(nickInput == ''){ $$.alert(language.mustGiveNick); return false; }
			if(chanInput == ''){ $$.alert(language.mustGiveChannel); return false; }
			if(chanInput.charAt(0) != '#'){ chanInput = '#' + chanInput; $('#nschan').val(chanInput); }
			if(!nickInput.match(/^[\[\^\|0-9a-z_`\{\}\[\]\-]+$/i)) { $$.alert(language.badCharsInNick); return false; }
			if(nickInput.match(/^[0-9-]/)){
				$$.alert(language.badNickStart);
				return false;
			}
			if(!chanInput.match(/^[#,a-z0-9_\.\-\\]+$/i)) { $$.alert(language.badCharsInChan); return false; }
			if(passInput.match(/[ ]+/i)) { $$.alert(language.spaceInPassword); return false; }
		}

		if(settings.get('enableautomLogIn')){
			// Handled by settings.set('automLogIn', true);
			settings.set('automLogIn', true); // Use settings.set directly
			var button = [ {
				text: 'OK',
				click: function(){ $(this).dialog('close'); }
			} ];
			$$.displayDialog('connect', '2', language.information, language.youCanDisableAutoconnect, button);
		}
		
		// Emit domain event to update user info before connecting
		ircEvents.emit('domain:updateConnectionParams', {
			nick: nickInput,
			channels: [ chanInput ],
			nickservNick: nickInput,
			nickservPass: passInput,
			savePassword: settings.get('save_password')
		});

		try { // UI localStorage updates
			if(chanInput){ localStorage.setItem('channel', chanInput); }
			if(nickInput){ localStorage.setItem('nick', nickInput); }
			if(settings.get('save_password')){
				if(nickInput && passInput){ // Use current nick and pass
					localStorage.setItem('password', encryptPassword(passInput));
				}
			}
		} catch(e) {}
		
		// guser.account = guser.nick; // This is domain logic, will be handled by domain:updateConnectionParams
		try {
			window.history.pushState('', guser.nick+ ' @ '+mainSettings.networkName, '/'+chanInput.substr(1)+'/'+nickInput+'/');
		} catch(e) {}
		gateway.initSys();
		gateway.connect(false); // Initiate protocol connection

		return true;
	},
	'delayedSendTimer': false, // Protocol layer
	'toSend': [], // Protocol layer
	'sendDelayCnt': 0, // Protocol layer
	'sendDelayed': function(data){ // Protocol layer
		gateway.toSend.push(data);
	},
	'send': function(data) { // Protocol layer
		if(gateway.websock.readyState === gateway.websock.OPEN && (gateway.sendDelayCnt < 3 || domainConnectStatus != 'connected')){
			gateway.forceSend(data);
			gateway.sendDelayCnt++;
		} else {
			gateway.toSend.push(data);
		}
	},
	'forceSend': function(data){ // Protocol layer
		if(gateway.websock.readyState === gateway.websock.OPEN){
			console.log('← '+ircLog.filterOutgoing(data));
			sdata = data + '\r\n';
			gateway.websock.send(sdata);
		} else {
			console.log('Outmsg delayed: '+ircLog.filterOutgoing(data));
			gateway.toSend.push(data);
		}
	},
	// Removed 'channels' - now in uiState (gateway_display.js), exposed via gateway.channels
	'findChannel': function(name) { // UI-level lookup
		if(typeof(name) != 'string') return false;
		for (var i=0; i<gateway.channels.length; i++) {
			if(gateway.channels[i].name.toLowerCase() == name.toLowerCase()) {
				return gateway.channels[i];
			}
		}
		return false;
	},
	'removeChannel': function(name) { // UI-level removal
		if(typeof(name) != 'string') return false;
		var channels2 = [];
		for (i in gateway.channels) {
			if(gateway.channels[i] && gateway.channels[i].name.toLowerCase() == name.toLowerCase()) {
				gateway.findChannel(name).markRead();
				gateway.channels[i].close(); // UI-level close, which emits domain event
			} else if(gateway.channels[i]) {
				channels2.push(gateway.channels[i]);
			}
		}
		gateway.channels = channels2;
		$('#input').focus();
		return false;
	},
	'sortChannelTabs': function() { // UI-level sorting
		if(settings.get('sortChannelsByJoinOrder')){
			return; // Keep join order, don't sort
		}
		// Sort channels array alphabetically by name
		gateway.channels.sort(function(a, b){
			return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
		});
		// Re-order DOM elements to match sorted array
		var lastTab = $('#--status-tab');
		for(var i = 0; i < gateway.channels.length; i++){
			var tab = $('#' + gateway.channels[i].id + '-tab');
			if(tab.length){
				tab.detach().insertAfter(lastTab);
				lastTab = tab;
			}
		}
	},
	// Removed 'queries' - now in uiState (gateway_display.js), exposed via gateway.queries
	'findQuery': function(name) { // UI-level lookup
		if(typeof(name) != 'string') return false;
		for (i in gateway.queries) {
			if(gateway.queries[i] && gateway.queries[i].name.toLowerCase() == name.toLowerCase()) {
				return gateway.queries[i];
			}
		}
		return false;
	},
	'removeQuery': function(name) { // UI-level removal
		// This method is called from Query.close() which already emits domain:requestRemoveQuery.
		// So this function is mainly responsible for UI cleanup of the gateway.queries array.
		if(typeof(name) != 'string') return false;
		var queries2 = [];
		for (i in gateway.queries) {
			if(gateway.queries[i] && gateway.queries[i].name.toLowerCase() == name.toLowerCase()) {
				gateway.findQuery(name).markRead();
				// The actual UI element closing is done by Query.close() when domain:requestRemoveQuery is processed
				// Here we just update the internal array
			} else if(gateway.queries[i]) {
				queries2.push(gateway.queries[i]);
			}
		}
		gateway.queries = queries2;
		$('#input').focus();
		return false;
	},
	'changeTopic': function(channel) { // UI-initiated action, emits domain event
		if(!confirm(language.areYouSureToChangeTopicOf+channel+'? '+language.itCantBeUndone)){
			return false;
		}
		var newTopic = $('#topicEdit').val().replace(/\n/g, ' ');
		ircEvents.emit('domain:requestTopicChange', { channelName: channel, newTopic: newTopic, time: new Date() }); // Emit domain event
		$$.closeDialog('confirm', 'topic'); // UI action
		return true;
	},
	// Removed 'tabHistory' - now in uiState (gateway_display.js), exposed via gateway.tabHistory
	'lasterror': '', // This is now domainLastError
	// Removed 'nickListVisibility' - now in uiState (gateway_display.js), exposed via gateway.nickListVisibility
	// Removed nickListToggle, checkNickListVisibility, showNickList - moved to uiNicklist (gateway_display.js)
	// Removed insert, insertEmoji, insertColor, insertCode - moved to uiHelpers (gateway_display.js)
	// Removed nextTab, prevTab, switchTab, tabHistoryLast - moved to uiTabs (gateway_display.js)
	// Removed notEnoughParams - moved to uiInput (gateway_display.js)
	'callCommand': function(command, input, alias) { // Delegates to user_commands.js
		if(alias && alias in commands) {
			if(typeof(commands[alias].callback) == 'string') {
				return gateway.callCommand(command, input, commands[alias].callback);
			} else if(typeof(commands[alias].callback) == 'function') {
				commands[alias].callback(command, input);
				return true;
			} else {
				return false;
			}
		} else if(command[0].toLowerCase() in commands) {
			if(typeof(commands[command[0].toLowerCase()].callback) == 'string') {
				return gateway.callCommand(command, input, commands[command[0].toLowerCase()].callback);
			} else if(typeof(commands[command[0].toLowerCase()].callback) == 'function') {
				commands[command[0].toLowerCase()].callback(command, input);
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	},
	// Removed parseUserCommand, parseUserMessage, parseUserInput, performCommand - moved to uiInput (gateway_display.js)
	'sendSingleMessage': function(text, active){ // UI action, emits domain event
		ircEvents.emit('domain:requestSendMessage', { target: active.name, message: text, time: new Date() }); // Emit domain event
	},
	// Removed 'commandHistory', 'commandHistoryPos' - now in uiState (gateway_display.js)
	// Removed inputFocus - moved to uiHelpers (gateway_display.js)
	// Removed openQuery - moved to uiWindows (gateway_display.js)
	'showStatus': function(channel, nick) { // UI action, emits domain events
		var html = '<p>' + language.giveForNick + '<strong>'+he(nick)+'</strong>' + language.temporaryPrivilegesOnChan + '<strong>'+he(channel)+'</strong>:</p>' + 
			'<select id="admopts-add-'+md5(channel)+'">' + 
				'<option value="-">' + language.selectOption + '</option>'+
				'<option value="+v">' + language.voicePrivilege + '</option>'+
				'<option value="+h">' + language.halfopPrivilege + '</option>'+
				'<option value="+o">' + language.opPrivilege + '</option>'+
				'<option value="+a">' + language.sopPrivilege + '</option>'+
				'<option value="+q">' + language.founderPrivilege + '</option>'+
			'</select>' + 
			'<p>' + language.giveForNick + '<strong>'+he(nick)+'</strong>' + language.chanservPrivilegesOnChan + '<strong>'+he(channel)+'</strong><br>' + language.youNeedServicePrivileges + ':</p>' + 
			'<select id="admopts-addsvs-'+md5(channel)+'">' + 
				'<option value="-">' + language.selectOption + '</option>'+
				'<option value="VOP">VOP: ' + language.voicePrivilege + '</option>'+
				'<option value="HOP">HOP: ' + language.halfopPrivilege + '</option>'+
				'<option value="AOP">AOP: ' + language.opPrivilege + '</option>'+
				'<option value="SOP">SOP: ' + language.sopPrivilege + '</option>'+
				'<option value="QOP">QOP: ' + language.founderPrivilege + '</option>'+
			'</select>';
		var button = [ 
			{
				text: language.cancel,
				click: function(){
					$(this).dialog('close');
				}
			},
			{
				text: 'OK',
				click: function(){
					var mode = $('#admopts-add-'+md5(channel)).val();
					var svsmode = $('#admopts-addsvs-'+md5(channel)).val();
					if(mode == '-' && svsmode == '-'){
						$$.alert(language.selectAvalilableOption);
						return;
					}
					if(mode != '-') ircEvents.emit('domain:requestModeChange', { channel: channel, modeString: mode+' '+nick, time: new Date() }); // Emit domain event
					if(svsmode != '-') ircEvents.emit('domain:requestServiceCommand', { service: 'ChanServ', command: svsmode, args: [channel, 'ADD', nick], time: new Date() }); // Emit domain event
					$(this).dialog('close');
				}
			}
		];
		$$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
	},
	'showStatusAnti': function(channel, nick) { // UI action, emits domain events
		var html = '<p>' + language.removeFromNick + '<strong>'+he(nick)+'</strong>' + language.temporaryPrivilegesOnChan + '<strong>'+he(channel)+'</strong>:</p>' + 
			'<select id="admopts-del-'+md5(channel)+'">' + 
				'<option value="-">' + language.selectOption + '</option>'+
				'<option value="-v">' + language.voicePrivilege + '</option>'+
				'<option value="-h">' + language.voicePrivilege + '</option>'+
				'<option value="-o">' + language.opPrivilege + '</option>'+
				'<option value="-a">' + language.sopPrivilege + '</option>'+
				'<option value="-q">' + language.founderPrivilege + '</option>'+
			'</select>' + 
			'<p>' + language.completelyRemoveNick + '<strong>'+he(nick)+'</strong>' + language.fromChanservPrivilegesOnChan + '<strong>'+he(channel)+'</strong><br>' + language.youNeedServicePrivileges + ':</p>' + 
			'<select id="admopts-delsvs-'+md5(channel)+'">' + 
				'<option value="-">' + language.dontRemove + '</option>'+
				'<option value="+">' + language.yesRemove + '</option>'+
			'</select>';
		var button = [ 
			{
				text: language.cancel,
				click: function(){
					$(this).dialog('close');
				}
			},
			{
				text: 'OK',
				click: function(){
					var mode = $('#admopts-del-'+md5(channel)).val();
					var svsmode = $('#admopts-delsvs-'+md5(channel)).val();
					if(mode == '-' && svsmode == '-'){
						$$.alert(language.selectAvailableOption);
						return;
					}
					if(mode != '-') ircEvents.emit('domain:requestModeChange', { channel: channel, modeString: mode+' '+nick, time: new Date() }); // Emit domain event
					if(svsmode == '+') ircEvents.emit('domain:requestServiceCommand', { service: 'ChanServ', command: 'ACCESS', args: [channel, 'DEL', nick], time: new Date() }); // Emit domain event
					$(this).dialog('close');
				}
			}
		];
		$$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
	},
	'showChannelModes': function(channel) { // UI action
		var channame = channel.substring(1);
		var ch = md5(channame);
		
		var html = '<p>'+language.changeChannelModesOf+he(channel)+":</p>" +
			'<table><tr><th></th><th>' + language.character + '</th><th>' + language.description + '</th></tr>';
		//generate HTML table with all supported and settable chanmodes
		modes.changeableSingle.forEach(function(mode){
			if(modes['single'].indexOf(mode[0]) >= 0) html += '<tr><td><input type="checkbox" id="'+ch+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td></tr>';
		}, this);
		modes.changeableArg.forEach(function(mode){
			if(modes['argAdd'].indexOf(mode[0]) >= 0 || modes['argBoth'].indexOf(mode[0]) >= 0) html += '<tr><td><input type="checkbox" id="'+ch+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td><td><input type="text" id="'+ch+'_mode_'+mode[0]+'_text"></td></tr>';
		}, this);
		html += '</table>';

		var button = [ { 
			text: language.applySetting,
			click: function(){
				gateway.changeChannelModes(channel); // UI action, will emit domain event
				$(this).dialog('close');
			}
		} ];

		$$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
		
		var chanModes = gateway.findChannel(channel).modes; // UI's view of channel modes
		if(!chanModes){
			return;
		}
		//uzupełnianie tabeli trybami już ustawionymi
		modes.changeableSingle.forEach(function(mode){
			if(chanModes[mode[0]]){
				$('#'+ch+'_mode_'+mode[0]).prop('checked', true);
			}
		}, this);
		modes.changeableArg.forEach(function(mode){
			if(chanModes[mode[0]]){
				$('#'+ch+'_mode_'+mode[0]).prop('checked', true);
				$('#'+ch+'_mode_'+mode[0]+'_text').val(chanModes[mode[0]]);
			}
		}, this);
	},
	'changeChannelModes': function(channel) { // UI action, emits domain event
		var modesw = '';
		var modeop = '';
		var modearg = '';
		var chanModes = gateway.findChannel(channel).modes; // UI's view of channel modes
		var channame = channel.substring(1);
		var ch = md5(channame);
		
		modes.changeableSingle.forEach(function(mode){
			mode = mode[0];
			var set = chanModes[mode];
			var checked = $('#'+ch+'_mode_'+mode).prop('checked');
			if(set != checked){
				if(checked){
					if(modeop != '+'){
							modeop = '+';
							modesw += '+';
						}
					modesw += mode;
				} else {
					if(modeop != '-'){
							modeop = '-';
							modesw += '-';
						}
					modesw += mode;
				}
			}
		}, this);
		
		modes.changeableArg.forEach(function(mode){
			mode = mode[0];
			var set = chanModes[mode];
			var checked = $('#'+ch+'_mode_'+mode).prop('checked');
			var text = $('#'+ch+'_mode_'+mode+'_text').val();
			if(set != checked || (set && set != text)){
				if(checked){
					if(modeop != '+'){
							modeop = '+';
							modesw += '+';
						}
					modesw += mode;
					modearg += text + ' ';
				} else {
					if(modeop != '-'){
							modeop = '-';
							modesw += '-';
						}
					modesw += mode;
					if(mode == 'k'){
						modearg += text + ' ';
					}
				}
			}
		}, this);
		
		ircEvents.emit('domain:requestModeChange', { target: channel, modeString: modesw+' '+modearg, time: new Date() }); // Emit domain event
		setTimeout(function(){ ircEvents.emit('ui:showChannelModesDialog', { channelName: channel }); }, 2000); // Re-open dialog (UI action)
	},
	'showInvitePrompt': function(channel) { // UI action, emits domain event
		var html = '<p>Nick: <input id="inviteNick" type="text"></p>';
		var button = [ { 
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, { 
			text: language.inviteSomeone,
			click: function(){
				var nick = $('#inviteNick').val();
				if(!nick || nick == ''){
					$$.alert(language.mustGiveNick);
					return;
				}
				ircEvents.emit('domain:requestInvite', { channel: channel, nick: nick, time: new Date() }); // Emit domain event
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('admin', 'invite-'+channel, language.inviteUserTo+he(channel), html, button);
	},
	'knocking': function(channel, nick, reason) { // UI action, emits domain event
		var html = '<b>'+nick+'</b>' + language.requestsInvitationTo + '<b>'+he(channel)+'</b> ('+$$.colorize(reason)+')';
		var button = [ { 
			text: 'Zaproś',
			click: function(){
				ircEvents.emit('domain:requestInvite', { channel: channel, nick: nick, time: new Date() }); // Emit domain event
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('knock', nick, language.requestForInvitation, html, button);
	},
	'showKick' : function(channel, nick) { // UI action, emits domain event
		var html = '<p>'+language.kickUser+he(nick)+language.fromChannel+he(channel)+'. ' + language.giveKickReason + '</p>' + 
			"<input type='text' id='kickinput' maxlength='307' />";
		var button = [ { 
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, { 
			text: language.doKick,
			click: function(){
				var reason = $('#kickinput').val();
				ircEvents.emit('domain:requestKick', { channel: channel, nick: nick, reason: reason, time: new Date() }); // Emit domain event
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('admin', 'kick-'+channel, 'KICK', html, button);
	},
	/*'showBan' : function(channel, nick) { // This function is complex UI, needs full refactor
		console.warn('showBan is complex UI logic, needs refactor. Emitting ui:showBanDialog');
		ircEvents.emit('ui:showBanDialog', { channel: channel, nick: nick });
	},
	'banClick': function() { // This function is part of showBan dialog, needs refactor
		console.warn('banClick is part of showBan dialog, needs refactor. Emitting domain:requestBan');
		ircEvents.emit('domain:requestBan', { channel: banData.channel, mask: gateway.banFormatView(), time: new Date() });
	},
	'banFormatView': function() { // This function is part of showBan dialog, needs refactor
		console.warn('banFormatView is part of showBan dialog, needs refactor.');
		// This should be pure UI logic or triggered by domain events about ban masks
		var banFormat = '';
		if($('#banNick').is(':checked')){
			banFormat += banData.nick;
		} else {
			banFormat += '*';
		}
		banFormat += '!';
		if(banData.noIdent){
			if($('#banNoIdent').is(':checked')){
				banFormat += '~';
			} else {
				banFormat += '*';
			}
		}
		if($('#banIdentText').is(':checked')){
			banFormat += banData.ident;
		} else {
			banFormat += '*';
		}
		banFormat += '@';
		var len = banData.hostElements.length;
		var hostElementAdded = false;
		for(var i=0;i<len;i++){
			if($('#banHostElement' + i).is(':checked')){
				if(!hostElementAdded){
					hostElementAdded = true;
					if(i > 0){
						banFormat += '*'+lastSeparator;
					}
				}
				banFormat += banData.hostElements[i];
				
			} else {
				if(hostElementAdded) {
					banFormat += '*';
				} else {
					var lastSeparator = banData.hostElementSeparators[i];
				}
			}
			if(hostElementAdded && i < len-1){
				banFormat += banData.hostElementSeparators[i];
			}
		}
		if(!hostElementAdded){
			banFormat += '*';
		}
		$('#banFormat').text(banFormat);
		return banFormat;
	},
	*/
	// Removed getActive - moved to uiTabs (gateway_display.js)
	// Removed 'active' - now in uiState (gateway_display.js), exposed via gateway.active
	// Removed toggleNickOpt, toggleNickOptInfo, toggleNickOptAdmin - moved to uiNicklist (gateway_display.js)
	// Removed toggleChannelOperOpts, toggleChannelOpts, toggleNickOpts - moved to uiNicklist (gateway_display.js)
	'showPermError': function(text) { // UI action
		var html = language.noAccess +
			'<br>' + language.notEnoughPrivileges + '<br>'+text;
		$$.displayDialog('error', 'error', language.error, html);
	},
	'clickQuit': function() { // UI action, emits domain event
		var html = '<form id="quit-form" onsubmit="ircEvents.emit(\'domain:requestQuit\', { message: $(\'#quit-msg\').val(), time: new Date() }); $$.closeDialog(\'confirm\', \'quit\'); return false;" action="javascript:void(0);">'+ 
			language.quitMessage + '<input type="text" id="quit-msg" value="' + language.defaultQuitMessage + '" />';
			'</form>';
		var button = [ { 
			text: language.disconnect,
			click: function(){
				$('#quit-form').submit();
				$(this).dialog('close');
			}
		}, { 
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('confirm', 'quit', language.ircQuit, html, button);
		$('#quit-msg').focus();
		$('#quit-msg').select();
	},
	'quit': function() { // This is now part of clickQuit's submit handler
		// commands.quit.callback(['quit'], '/quit '+$('#quit-msg').val()); // No longer directly callable here
		console.warn('gateway.quit() is deprecated. Use domain:requestQuit event.');
		$('.notifywindow').fadeOut(100);
	},
	// Removed 'completion' - now in uiState (gateway_display.js), exposed via gateway.completion
	// Removed doComplete - moved to uiHelpers (gateway_display.js)
	'parseChannelMode': function(args, chan, dispType) { // This is domain logic and needs to be moved to gateway_domain.js
		console.warn('gateway.parseChannelMode is domain logic and should be moved.');
		// Delegate to domain event
		ircEvents.emit('domain:parseChannelMode', { args: args, channelName: chan.name, dispType: dispType, rawMsg: {} /* needs full msg object */ });
		return ''; // This function no longer generates infoText directly
	},
	'parseIsupport': function() { // This is domain logic and needs to be moved to gateway_domain.js
		console.warn('gateway.parseIsupport is domain logic and should be moved.');
		ircEvents.emit('domain:parseIsupport', {}); // Emit domain event
	},
	'storageHandler': function(evt) { // This is domain logic and needs to be moved to gateway_domain.js
		console.warn('gateway.storageHandler is domain logic and should be moved.');
		ircEvents.emit('domain:processStorageEvent', { evt: evt, time: new Date() }); // Emit domain event
	},
	// Removed quitQueue, quitTimeout, netJoinUsers, netJoinQueue, netJoinTimeout
	'processNetsplit': function(){ // Domain logic, needs to be moved to gateway_domain.js
		console.warn('gateway.processNetsplit is domain logic and should be moved.');
		ircEvents.emit('domain:processNetsplitEvents', { time: new Date() }); // Emit domain event
	},
	'processNetjoin': function(){ // Domain logic, needs to be moved to gateway_domain.js
		console.warn('gateway.processNetjoin is domain logic and should be moved.');
		ircEvents.emit('domain:processNetjoinEvents', { time: new Date() }); // Emit domain event
	},
	'processQuit': function(msg){ // Domain logic, needs to be moved to gateway_domain.js
		console.warn('gateway.processQuit is domain logic and should be moved.');
		ircEvents.emit('domain:processQuitCommand', { msg: msg, time: new Date() }); // Emit domain event
		return true; // Keep old return for compatibility until fully removed
	},
	'processJoin': function(msg){ // Domain logic, needs to be moved to gateway_domain.js
		console.warn('gateway.processJoin is domain logic and should be moved.');
		ircEvents.emit('domain:processJoinCommand', { msg: msg, time: new Date() }); // Emit domain event
	},
	// Removed findOrCreate - moved to uiWindows (gateway_display.js)
	'find': function(name){ // UI helper
		if(!name || name == ''){
			return false;
		}
		if(name.charAt(0) == '#'){ //kanał
			return gateway.findChannel(name);
		} else { //query
			return gateway.findQuery(name);
		}
		return false;
	},
	'smallListLoading': false, // Now domain state
	// Removed 'listWindow' - now in uiState (gateway_display.js), exposed via gateway.listWindow
	'listWindowLabel': null, // Domain state
	// Removed getOrOpenListWindow, toggleChanList, refreshChanList - moved to uiWindows (gateway_display.js)
	// Removed toggleFormatting - moved to uiHelpers (gateway_display.js)
	'parseUmodes': function(modes) { // This is domain logic, needs to be moved to gateway_domain.js
		console.warn('gateway.parseUmodes is domain logic and should be moved.');
		ircEvents.emit('domain:processUserModes', { modes: modes, time: new Date() }); // Emit domain event
	},
	'getUmodeString': function(){ // UI helper, displays current umode
		var modeString = '';
		if(guser.umodes){
			for(var mode in guser.umodes){
				if(guser.umodes[mode]) modeString += mode;
			}
		}
		if(!modeString) modeString = language.none; // Fallback
		return modeString;
	},
	// Removed enterPressed, arrowPressed, inputPaste, inputKeypress - moved to uiInput (gateway_display.js)
	'displayGlobalBanInfo': function(text){ // UI action
		var html = language.connectionNotAllowedHtml +
			'</ul><br><p>' + language.serverMessageIs + '<br>'+he(text)+'</p>';
		$$.closeDialog('connect', '1');
		$$.displayDialog('error', 'noaccess', language.noAccessToNetwork, html);
		ircEvents.emit('domain:setConnectStatus', { status: 'banned' }); // Set status via domain event
	},
	// Removed getMeta, getAvatarUrl, getMsgid - moved to uiHelpers (gateway_display.js)
	'makeLabel': function(){ // Domain helper - calls global generateLabel function
		return generateLabel(); // Direct call to global function
	},
	// Removed calculateHistoryLimit - moved to uiHelpers (gateway_display.js)
	'insertMessage': function(cmd, dest, text, ownMsg, label, sender, time, options){ // UI action
		// options can contain: attrs, addClass, isHistory, msgid - provided by abstracted event
		options = options || {};
		if(!time)
			time = new Date();
		var attrs = options.attrs || ('data-time="' + time.getTime() + '"');
		var addClass = options.addClass || '';
		// Note: All domain state checks (caps, labels, batches) are now done in domain layer
		// UI receives abstracted message:received events with all necessary metadata

		if(!sender) sender = guser.me;

		if(sender == guser.me && text.charAt(0) == '\001') return; // don't display own ctcp requests/replies, this is confirmed to be called when sending requests and NOT for actions

		var meta = gateway.getMeta(sender.nick, 100);
		var images = $$.parseImages(text, attrs);
		var message = $$.colorize(text);
		var nickComments = '';
		var nick = sender.nick;
		var msgid = options.msgid || ''; // Get msgid from abstracted options
		var tab = null;
		var channel = false;

		// Deduplication: if duplicate msgid exists, remove old message (new one takes precedence)
		if(msgid.length > 0){
			var existingMsg = $('[data-msgid="'+msgid+'"]');
			if(existingMsg.length > 0){
				console.log('[DEDUP] Removing duplicate message with msgid:', msgid);
				existingMsg.remove();
			}
		}
		
		if(dest.charAt(0) == '#'){
			tab = gateway.findOrCreate(dest);
			tab.typing.stop(sender);
			channel = true;
		}

		var nickInfo = '';
		if(sender.account){
			nickInfo = language.loggedInAs + he(sender.account);
		} else if(sender.registered) { // possible if the server does not send account name
			nickInfo = language.loggedIn;
		} else {
			nickInfo = language.notLoggedIn;
		}
		if(sender.bot){
			if(nickInfo.length > 0) nickInfo += '\n';
			nickInfo += language.userIsBot;
		}
		if(channel){
			// Check if this is a history message using abstracted flag
			if(options.isHistory){
				if(nickInfo.length > 0) nickInfo += '\n';
				nickInfo += language.historyEntry;
			}
		}
		var user = users.getUser(sender.nick);
		if('display-name' in user.metadata){
			nick = he(user.metadata['display-name']);
			nickComments = ' <span class="realNick" title="' + language.realNickname + '">(' + he(sender.nick) + ')</span>';
		} else {
			nick = he(sender.nick);
		}
		if(nickInfo.length > 0)
			nick = '<span title="' + nickInfo + '">' + nick + '</span>';

		// Process message through event handlers
		var messageData = { sender: sender.nick, dest: dest, message: message };
		ircEvents.emit('message:process', messageData);
		message = messageData.message;

//		$('[data-msgid="'+msgid+'"]').remove(); // drop the message from backlog field

		if(channel && sender != guser.me){ // Compare with domain's guser.me
			var pattern = "\\b"+escapeRegExp(guser.me.nick)+"\\b";
			var re = new RegExp(pattern);
			var hlmatch = re.test(message);
		} else {
			var hlmatch = false;
		}

		if(cmd == 'NOTICE' && channel){ // channel notice
			var appendOptions = options.isHistory ? {isHistory: true} : {};
			tab.appendMessage(language.messagePatterns.notice, [addClass, attrs, $$.niceTime(time), he(sender.nick), he(sender.ident), he(sender.host), he(message)], time, appendOptions);
			if(hlmatch && gateway.active != tab.name) {
				tab.markBold();
			}
			return;
		}
		if(cmd == 'PRIVMSG' || cmd == 'ACTION'){ // channel or private message
			if(!channel){
				if(sender.nick == guser.me.nick){ // Compare with domain's guser.nick
					var qname = dest;
				} else {
					var qname = sender.nick;
				}
				var foundTab = gateway.find(qname); // UI operation, call directly
				if(
						((sender.nick == guser.me.nick && dest.isInList(servicesNicks))
						|| (dest == guser.me.nick && sender.nick.isInList(servicesNicks)))				&& !foundTab){
					if($("#noticeDisplay").val() == 0){ // pop-up
						var html = '<span class="notice">[<b>' + sender.nick + " → " + dest + "</b>]</span> " + message;
						$$.displayDialog('notice', 'service', language.networkServiceMessage, html, false, attrs);
						return;
					} else if($("#noticeDisplay").val() == 2){ // status
						gateway.statusWindow.appendMessage(language.messagePatterns.yourServiceCommand, [addClass, attrs, $.niceTime(time), he(guser.nick), he(dest), he(message)], time);
						return;
					} else { // query
						// default behavior
					}
				}
				tab = gateway.findOrCreate(qname);
				tab.typing.stop(sender);
			} else {
				var qname = dest;
			}
			if(cmd != 'ACTION'){
				var messageDiv;
				var isHistoryBatch = options.isHistory || false; // Use abstracted flag from domain layer
				console.log('[BATCH-DEBUG] insertMessage:', {dest: dest, text: text.substring(0,30), isHistoryBatch: isHistoryBatch});
				if(isHistoryBatch){
					// For history messages, find the message immediately BEFORE this one chronologically
					// (not the last one in DOM order, which would be a newer message)
					var allMessages = $('#'+tab.id+'-window div.messageDiv:not(".msgRepeat")');
					var prevMessage = null;
					var currentTime = time.getTime();
					for(var i = 0; i < allMessages.length; i++){
						var msgTime = allMessages[i].getAttribute('data-time');
						if(msgTime && parseInt(msgTime) < currentTime){
							prevMessage = allMessages[i];
						} else if(msgTime && parseInt(msgTime) >= currentTime){
							break; // Messages are in chronological order, no need to continue
						}
					}
					messageDiv = prevMessage ? $(prevMessage) : $();
				} else {
					messageDiv = $('#'+tab.id+'-window div.messageDiv:not(".msgRepeat"):last');
				}
				var messageClass = 'msgNormal';
				var senderClass = 'sender'+md5(sender.nick);
				var shouldBundle = messageDiv.length && messageDiv.hasClass(senderClass) && messageDiv[0].getAttribute('data-time') <= time.getTime();
				console.log('[BUNDLE-DEBUG]', {
					hasPrevious: messageDiv.length > 0,
					senderClass: senderClass,
					hasSenderClass: messageDiv.hasClass(senderClass),
					prevTime: messageDiv[0] ? messageDiv[0].getAttribute('data-time') : 'N/A',
					currentTime: time.getTime(),
					shouldBundle: shouldBundle,
					sender: sender.nick
				});
				if(shouldBundle){ // last message was by the same sender and is not newer that the received one
					messageDiv.find('span.msgText').append('<span class="msgRepeatBlock ' + addClass + '" ' + attrs + '><br><span class="time">'+$$.niceTime(time)+'</span> &nbsp;'+message+'</span>');
					messageClass = 'msgRepeat';
					console.log('[BUNDLE-DEBUG] Bundling message with previous');
				} else {
					console.log('[BUNDLE-DEBUG] Creating new message div');
					// activeCaps needs to be domain
					if(('labeled-response' in activeCaps) && ('echo-message' in activeCaps) && ownMsg){
						// the message will be re-sent anyway
					} else {
						tab.markingSwitch = !tab.markingSwitch;
					}
				}
				if(tab.markingSwitch){
					messageClass += ' oddMessage';
				} else {
					messageClass += ' evenMessage';
				}
				message = '<span class="time msgRepeatBlock">'+$$.niceTime(time)+'</span> &nbsp;' + message;
			}
			messageClass += ' ' + addClass;
			// Prepare options for appendMessage
			var appendOptions = {};
			if(options.isHistory){
				appendOptions.isHistory = true;
			}

			if(hlmatch) { // highlighted
				if(cmd != 'ACTION'){
						tab.appendMessage(language.messagePatterns.channelMsgHilight, ['sender'+md5(sender.nick) + ' ' + messageClass, attrs, meta, $$.niceTime(time), nick , nickComments, message], time, appendOptions);
				} else {
						tab.appendMessage(language.messagePatterns.channelActionHilight, [addClass, attrs, $$.niceTime(time), nick, message], time, appendOptions);
				}
				if(messageClass.indexOf('msgRepeat') > -1){
					messageDiv.find('span.nick').addClass('repeat-hilight');
				}
				if(gateway.active != dest.toLowerCase() || !disp.focused) {
					tab.markNew();
				}
			} else { // not highlighted or query
				if(cmd != 'ACTION'){
						tab.appendMessage((sender.nick == guser.me.nick)?language.messagePatterns.yourMsg:language.messagePatterns.channelMsg, ['sender'+md5(sender.nick) + ' ' + messageClass, attrs, meta, $$.niceTime(time), $$.nickColor(sender.nick), nick , nickComments, message], time, appendOptions);
				} else {
						tab.appendMessage((sender.nick == guser.me.nick)?language.messagePatterns.yourAction:language.messagePatterns.channelAction, [addClass, attrs, $$.niceTime(time), $$.nickColor(sender.nick), nick, message], time, appendOptions);
				}
				if(gateway.active.toLowerCase() != qname.toLowerCase() || !disp.focused) {
					if(channel){
						tab.markBold();
					} else {
						tab.markNew();
					}
				}
			}

			tab.appendMessage('%s', [images.html], time, options);
			$$.applyCallbacks(images.callbacks);
			return;
		}
		if(cmd == 'NOTICE'){ // private notice
			if(ownMsg){
				if($("#noticeDisplay").val() == 2) { // notice in status window
					gateway.statusWindow.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), he(dest), he(message)], time);
				} else if($("#noticeDisplay").val() == 1) { // notice in a query window
					var query = gateway.findOrCreate(command[1]);
					query.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), he(dest), he(message)], time);
				} else if($("#noticeDisplay").val() == 0) { // notice in pop-up
					var html = "<span class=\"notice\">[<b>" + sender.nick + " → " + dest + "</b>]</span> " + message;
					$$.displayDialog('notice', dest, language.privateNoticeFrom+' '+dest, html, false, attrs);
				}
				return;
			}
				if(!sender.server){ // sent by user or service
				if(sender.nick == guser.me.nick){ // Compare with domain's guser.nick
					var qname = dest;
				} else {
					var qname = sender.nick;
				}
				// gateway.find(qname) needs to be domain
				var foundTab = gateway.findQuery(qname);
				if(
						((sender.nick == guser.me.nick && dest.isInList(servicesNicks))
						|| (dest == guser.me.nick && sender.nick.isInList(servicesNicks)))				&& !foundTab){
					if($("#noticeDisplay").val() == 0){ // pop-up
						var html = '<span class="notice">[<b>' + sender.nick + " → " + dest + "</b>]</span> " + message;
						$$.displayDialog('notice', 'service', language.networkServiceMessage, html, false, attrs);
						return;
					} else if($("#noticeDisplay").val() == 2){ // status
						gateway.statusWindow.appendMessage(language.messagePatterns.yourServiceCommand, [addClass, attrs, $.niceTime(time), he(guser.nick), he(dest), he(message)], time);
						return;
					} else { // query
						// default behavior
					}
				}
				tab = gateway.findOrCreate(qname);
				tab.typing.stop(sender);
			} else { // sent by server
				var expressions = [/^Your "real name" is now set to be/, / invited [^ ]+ into the channel.$/]; // TODO should this look like this?
				for(var i=0; i<expressions.length; i++){
					if(text.match(expressions[i])){
						return;
					}
				}

				var expr = /^\\\[Knock\\\\] by ([^ !]+)![^ ]+ \(([^)]+)\)$/; // detect KNOCK by someone
				var match = expr.exec(text);
				if(match){
					ircEvents.emit('domain:requestKnock', { channel: dest.substring(dest.indexOf('#')), nick: match[1], reason: match[2], time: new Date() }); // Emit domain event
					return;
				}
				expr = /^Knocked on (.*)$/; // detect own KNOCK
				var match = expr.exec(text);
				if(match){
					var chan = gateway.findChannel(match[1]); // UI lookup
					if(chan){
						chan.appendMessage(language.messagePatterns.knocked, [$$.niceTime(time), he(match[1])], time);
					} else {
						gateway.statusWindow.appendMessage(language.messagePatterns.knocked, [$$.niceTime(time), he(match[1])], time);
					}
					return;
				}
				
				// we ignore these not to bug users with pop-ups
				if(sender.nick == 'AUTH' || sender.nick == '*' || dest == '*') { // connect notices
					return;
				}
				if(text.match(/^\*\*\* You are connected to .+ with .+$/)){ // *** You are connected to bramka2.pirc.pl with TLSv1.2-AES128-GCM-SHA256-128bits
					return;
				}
				$$.displayDialog('notice', sender.nick, language.privateNoticeFromServer + he(sender.nick) + language.to + he(dest), message, false, attrs);
			}
			return;
		}
		console.error('Unhandled message from '+sender.nick+' to '+dest+'!');
	},
	'updateHistory': function(){ // UI utility
		for(var i=0; i<gateway.channels.length; i++){
			var chan = gateway.channels[i];
			updateHistory(chan.name, chan.id);
		}
		for(var i=0; i<gateway.queries.length; i++){
			var query = gateway.queries[i];
			updateHistory(query.name, query.id);
		}
	},
	'labelNotProcessed': function(label, msg, batch){ // Protocol/Domain logic
		// Access labelCallbacks via domain event
		ircEvents.emit('domain:processLabelNotProcessed', { label: label, msg: msg, batch: batch });
	},
	'setLabelCallback': function(label, callback, timeoutMs) { // Protocol/Domain logic
		ircEvents.emit('domain:setLabelCallback', { label: label, callback: callback, timeoutMs: timeoutMs });
	},
	'msgNotDelivered': function(label, msg){ // Domain logic
		// activeCaps is domain state - needs to be passed via domain event listener to UI or a domain-exposed accessor
		console.log('[LABEL-DEBUG] msgNotDelivered called with label:', label, 'echo-message cap:', ('echo-message' in activeCaps));
		if(!('echo-message' in activeCaps))
			return;
		var sel = $('[data-label="'+label+'"]'); // UI selector
		console.log('[LABEL-DEBUG] Found', sel.length, 'element(s) with data-label="'+label+'"');
		sel.addClass('msgDeliveryFailed'); // UI action
		sel.prop('title', language.messageNotDelivered); // UI action
		console.log('[LABEL-DEBUG] Added msgDeliveryFailed class to', sel.length, 'element(s)');
	},
	'isHistoryBatch': function(tags){ // Domain helper - accesses domainBatch directly (layering violation, acceptable for now)
		return gateway.findBatchOfType(tags, 'chathistory');
	},
	'historyBatchActive': function(chan){ // Domain helper - accesses domainBatch directly (layering violation, acceptable for now)
		// Check if there's an active chathistory batch for this channel
		for(var batchId in domainBatch){
			var batch = domainBatch[batchId];
			if(batch.type == 'chathistory' && batch.args && batch.args[0] && batch.args[0].toLowerCase() == chan.toLowerCase()){
				console.log('[BATCH-DEBUG] historyBatchActive: true for', chan, 'batchId:', batchId);
				return true;
			}
			// Also check parent batches
			if(batch.parents){
				for(var i=0; i<batch.parents.length; i++){
					if(batch.parents[i].type == 'chathistory' && batch.parents[i].args && batch.parents[i].args[0] && batch.parents[i].args[0].toLowerCase() == chan.toLowerCase()){
						console.log('[BATCH-DEBUG] historyBatchActive: true for', chan, 'in parent batch');
						return true;
					}
				}
			}
		}
		console.log('[BATCH-DEBUG] historyBatchActive: false for', chan);
		return false;
	},
	'loadOlderHistory': function(channel){ // UI action, emits domain event
		// activeCaps is domain state - needs to be passed via domain event listener to UI or a domain-exposed accessor
		if(!('draft/chathistory' in activeCaps)){
			console.log('CHATHISTORY not available');
			return;
		}

		var chan = gateway.findChannel(channel); // UI lookup
		if(!chan){
			console.log('Channel not found:', channel);
			return;
		}

		var loadOlderButton = $('#' + chan.id + '-window .loadOlderButton'); // UI lookup
		var msgid = loadOlderButton.attr('data-msgid') || null; // UI data
		var timestamp = loadOlderButton.attr('data-timestamp') || null; // UI data

		loadOlderButton.remove(); // UI action

		if(!msgid && !timestamp){
			console.log('No reference point found for loading older history');
			return;
		}

		var limit = gateway.calculateHistoryLimit(); // UI calculation
		// isupport is global, but effectively domain config
		if('CHATHISTORY' in isupport){
			var isupportLimit = isupport['CHATHISTORY'];
			if(isupportLimit != 0 && isupportLimit < limit){
				limit = isupportLimit;
			}
		}

		console.log('Requesting history BEFORE msgid:', msgid, 'timestamp:', timestamp, 'limit:', limit);
		ircEvents.emit('domain:requestChatHistory', { channelName: channel, type: 'BEFORE', msgid: msgid, timestamp: timestamp, limit: limit, time: new Date() }); // Emit domain event
	},
	'findBatchOfType': function(tags, type){ // Domain helper - accesses global domainBatch (layering violation, acceptable for now)
		if(!tags || !('batch' in tags)){
			console.log('[BATCH-DEBUG] No batch in tags, type requested:', type);
			return null;
		}
		var batch = domainBatch[tags.batch];
		if(!batch){
			console.log('[BATCH-DEBUG] Batch', tags.batch, 'not found in domainBatch');
			return null;
		}
		console.log('[BATCH-DEBUG] Checking batch', tags.batch, 'type:', batch.type, 'looking for:', type);
		if(batch.type == type)
			return batch;
		if(batch.parents){
			for(var i=0; i<batch.parents.length; i++){
				if(batch.parents[i].type == type)
					return batch.parents[i];
			}
		}
		console.log('[BATCH-DEBUG] Batch type mismatch, returning null');
		return null;
	},
	'processIncomingTags': function(ircmsg){ // Domain logic
		ircEvents.emit('domain:processIncomingTags', { ircmsg: ircmsg });
	},
	'typing': function(user, dest, mode){ // This is primarily domain logic, should be moved to gateway_domain.js
		// The logic for tab.typing.start/stop is in Query/Channel UI objects
		console.warn('gateway.typing is deprecated. Use domain:processTypingActivity event.');
		ircEvents.emit('domain:processTypingActivity', { user: user, dest: dest, mode: mode, time: new Date() });
	},
	'changeCapSupport': function(cap, enable){ // Domain logic
		ircEvents.emit('domain:changeCapSupport', { cap: cap, enable: enable });
	},
	'hideMessageWithLabel': function(label){ // Domain logic
		ircEvents.emit('domain:addLabelToHide', { label: label });
	}
}


// IRCEventEmitter class and ircEvents instance are defined in gateway_functions.js
// (must be available before gateway_cmd_binds.js loads)

// Formal hook registration API for addons
var hooks = {
	/**
	 * Register command handler
	 * @param {string} command - IRC command (e.g., 'PRIVMSG')
	 * @param {function} handler - Handler function(msg)
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onCommand: function(command, handler, options) {
		return ircEvents.on('cmd:' + command, handler, options);
	},
	/**
	 * Register metadata change handler
	 * @param {string} key - Metadata key (e.g., 'avatar')
	 * @param {function} handler - Handler function(data) where data = {user, key, value}
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onMetadata: function(key, handler, options) {
		return ircEvents.on('metadata:' + key, handler, options);
	},
	/**
	 * Add message text processor
	 * @param {function} processor - Function(senderNick, dest, message) returns modified message
	 */
	addMessageProcessor: function(processor, options) {
		// Wrapper to adapt old processor signature to new event data object
		var handler = function(data) {
			data.message = processor(data.sender, data.dest, data.message);
		};
		return ircEvents.on('message:process', handler, options);
	},
	/**
	 * Register CTCP handler
	 * @param {string} ctcp - CTCP type (e.g., 'VERSION')
	 * @param {function} handler - Handler function(msg)
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onCtcp: function(ctcp, handler, options) {
		return ircEvents.on('ctcp:' + ctcp, handler, options);
	},
	/**
	 * Register batch handler
	 * @param {string} type - Batch type (e.g., 'chathistory')
	 * @param {function} handler - Handler function(data) where data = {msg, batch}
	 * @param {object} options - { priority: 0-100, once: boolean }
	 * @returns {function} Unsubscribe function
	 */
	onBatch: function(type, handler, options) {
		return ircEvents.on('batch:' + type, handler, options);
	},
	/**
	 * Direct event registration (for custom events)
	 */
	on: function(event, handler, options) {
		return ircEvents.on(event, handler, options);
	},
	once: function(event, handler, options) {
		return ircEvents.once(event, handler, options);
	},
	off: function(event, handler) {
		ircEvents.off(event, handler);
	},
	emit: function(event, data) {
		return ircEvents.emit(event, data);
	}
};
window.hooks = hooks;