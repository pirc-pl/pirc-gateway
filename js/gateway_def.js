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

// IRC parser (irc) and logging (ircLog) moved to irc_transport.js

/**
 * ============================================================================
 * GATEWAY OBJECT - Legacy Coordination Layer
 * ============================================================================
 *
 * This object historically served as the main application coordinator but has
 * been significantly refactored. Most functionality has been moved to specialized
 * layers following proper architectural separation:
 *
 * TRANSPORT LAYER (irc_transport.js):
 *   - WebSocket management (connect, reconnect, send, receive)
 *   - IRC message parsing
 *   - Connection lifecycle
 *
 * PROTOCOL LAYER (irc_protocol.js):
 *   - IRC command handlers
 *   - Protocol event emission
 *
 * DOMAIN LAYER (gateway_domain.js):
 *   - Application state management
 *   - Business logic
 *   - Batch/label handling
 *   - User/channel domain objects
 *
 * UI LAYER (gateway_display.js):
 *   - DOM manipulation
 *   - Event listening
 *   - Dialog management
 *   - Tab management
 *   - User input handling
 *
 * WHAT REMAINS IN GATEWAY:
 *
 * 1. THIN WRAPPERS (for backwards compatibility):
 *    - reconnect(), connect(), send(), forceSend() → ircTransport
 *    - isHistoryBatch(), historyBatchActive(), findBatchOfType() → domain functions
 *
 * 2. UI STATE REFERENCES (exposed from gateway_display.js):
 *    - channels, queries, active, statusWindow, listWindow, etc.
 *    - These are managed in uiState but exposed via gateway for compatibility
 *
 * 3. UI HELPER FUNCTIONS:
 *    - findChannel(), findQuery(), find() - array lookups
 *    - removeChannel(), removeQuery() - array management
 *    - sortChannelTabs() - tab ordering
 *
 * 4. LEGACY STATE FLAGS (to be migrated):
 *    - labelProcessed - should move to transport/domain
 *    - pingIntervalID, whoChannelsIntervalID - timer IDs
 *    - disconnectMessageShown - UI state
 *    - allowNewSend, commandProcessing - transport state
 *    - lasterror - domain state
 *    - smallListLoading - UI state (to migrate)
 *
 * 5. COMMAND DELEGATION:
 *    - callCommand() - delegates to user_commands.js
 *
 * 6. LARGE COMPLEX FUNCTIONS (need refactoring):
 *    - insertMessage() - ~300 lines, should move to UI layer
 *    - msgNotDelivered() - has UI logic, should move to UI layer
 *    - sendSingleMessage() - thin wrapper, could be removed
 *    - getUmodeString() - mixes domain/UI concerns
 *
 * FUTURE REFACTORING GOALS:
 * - Move insertMessage to gateway_display.js
 * - Move remaining state flags to appropriate layers
 * - Remove all thin wrappers once all call sites are updated
 * - Eventually reduce gateway to just a reference container or remove entirely
 */
var gateway = {
	// =========================================================================
	// LEGACY STATE FLAGS (to be migrated to appropriate layers)
	// =========================================================================
	'labelProcessed': false, // Track if current label was processed (transport/domain state)
	'pingIntervalID': false, // Timer ID for ping checks (domain state)
	'whoChannelsIntervalID': false, // Timer ID for WHO queries (domain state)
	'disconnectMessageShown': 0, // Disconnect message counter (UI state)
	'allowNewSend' : true, // Send throttle flag (transport state)
	'commandProcessing': false, // Command processing flag (transport state)
	'lasterror': '', // Last error string (domain state)

	// Cross-tab storage event handler: relay storage events to the domain layer
	'storageHandler': function(evt) {
		ircEvents.emit('domain:processStorageEvent', { evt: evt });
	},

	// =========================================================================
	// THIN WRAPPERS - Transport Layer (for backwards compatibility)
	// =========================================================================
	'reconnect': function() { // → ircTransport.reconnect()
		ircTransport.reconnect();
	},
	'connect': function(force) { // → ircTransport.connect()
		ircTransport.connect(force);
	},
	'send': function(data) { // → ircTransport.send()
		ircTransport.send(data);
	},
	'forceSend': function(data) { // → ircTransport.forceSend()
		ircTransport.forceSend(data);
	},

	// =========================================================================
	// THIN WRAPPERS - Domain Events (for backwards compatibility)
	// =========================================================================
	'ctcp': function(dest, text) { // → domain:requestCtcpCommand
		ircEvents.emit('domain:requestCtcpCommand', { dest: dest, text: text, time: new Date() });
	},
	'sendSingleMessage': function(text, active){ // → domain:requestSendMessage
		ircEvents.emit('domain:requestSendMessage', { target: active.name, message: text, time: new Date() });
	},

	// =========================================================================
	// UI HELPER FUNCTIONS - Channel/Query Management
	// =========================================================================
	// Note: 'channels' array is in uiState (gateway_display.js), exposed via gateway.channels
	'findChannel': function(name) { // Lookup channel tab by name
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
	// Note: 'queries' array is in uiState (gateway_display.js), exposed via gateway.queries
	'findQuery': function(name) { // Lookup query tab by name
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
	// =========================================================================
	// COMMAND DELEGATION - User Commands
	// =========================================================================
	'callCommand': function(command, input, alias) { // Delegates to commands in gateway_user_commands.js
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
	// =========================================================================
	// HELPERS - Miscellaneous
	// =========================================================================
	'find': function(name){ // Combined lookup for channel or query by name
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
	'getUmodeString': function(){ // Get formatted user mode string (mixes domain/UI)
		var modeString = '';
		if(guser.umodes){
			for(var mode in guser.umodes){
				if(guser.umodes[mode]) modeString += mode;
			}
		}
		if(!modeString) modeString = language.none; // Fallback
		return modeString;
	},

	// =========================================================================
	// THIN WRAPPERS - Domain Functions (for backwards compatibility)
	// =========================================================================
	'isHistoryBatch': function(tags){ // → isHistoryBatch() in gateway_domain.js
		return isHistoryBatch(tags);
	},
	'historyBatchActive': function(chan){ // → historyBatchActive() in gateway_domain.js
		return historyBatchActive(chan);
	},
	'findBatchOfType': function(tags, type){ // → findBatchOfType() in gateway_domain.js
		return findBatchOfType(tags, type);
	},

	// =========================================================================
	// COMPLEX FUNCTIONS - Need Refactoring
	// =========================================================================
	// TODO: These functions should be moved to appropriate layers

	/*'showBan' : function(channel, nick) { // COMMENTED OUT - Complex UI, needs refactor
		console.warn('showBan is complex UI logic, needs refactor.');
		// showBan function is now in gateway_services.js
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
	'insertMessage': function(cmd, dest, text, ownMsg, label, sender, time, options){ // TODO: Move to gateway_display.js (~300 lines)
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
	'msgNotDelivered': function(label, msg){ // TODO: Refactor - has UI logic, should move to UI layer
		// This function mixes domain logic (checking activeCaps) with UI logic (DOM manipulation)
		// Should be split: domain emits event, UI layer handles visual feedback
		console.log('[LABEL-DEBUG] msgNotDelivered called with label:', label, 'echo-message cap:', ('echo-message' in activeCaps));
		if(!('echo-message' in activeCaps))
			return;
		var sel = $('[data-label="'+label+'"]'); // UI selector
		console.log('[LABEL-DEBUG] Found', sel.length, 'element(s) with data-label="'+label+'"');
		sel.addClass('msgDeliveryFailed'); // UI action
		sel.prop('title', language.messageNotDelivered); // UI action
		console.log('[LABEL-DEBUG] Added msgDeliveryFailed class to', sel.length, 'element(s)');
	},
	// Removed processIncomingTags - thin wrapper, callers now emit domain:processIncomingTags directly
	// Removed typing - deprecated thin wrapper, callers now emit domain:processTypingActivity directly
	// Removed changeCapSupport - thin wrapper, callers now emit domain:changeCapSupport directly
	// Removed hideMessageWithLabel - thin wrapper, callers now emit domain:addLabelToHide directly
}


// IRCEventEmitter class and ircEvents instance are defined in gateway_functions.js
// (must be available before irc_protocol.js loads)

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
window.hooks = hooks;// NOTE: The following UI dialog functions have been moved to gateway_display.js (uiDialogs):
// - showStatus, showStatusAnti, showChannelModes, changeChannelModes
// - showInvitePrompt, knocking, clickQuit, loadOlderHistory
// They remain defined here temporarily for compatibility but will be fully removed in a future commit
// All calls go through gateway.functionName() which are attached from gateway_display.js
