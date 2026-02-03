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

var activeCaps = {};
var isupport = [];
var supportedCaps = [
	'userhost-in-names',
	'away-notify',
	'multi-prefix',
	'chghost',
	'extended-join',
	'account-notify',
	'account-tag',
	'message-tags',
	'server-time',
	'echo-message',
	'sasl',
	'cap-notify',
	'batch',
	'labeled-response',
	'draft/chathistory',
	// Mutually exclusive capabilities (in order of preference)
	['draft/metadata-2', 'draft/metadata-notify-2', 'draft/metadata'],
	['setname', 'draft/setname']
];
var serverCaps = {};
var capInProgress = false;
var saslInProgress = false;

function ircBatch(name, type, args, msg){
	this.name = name;
	this.type = type;
	this.args = args;
	this.callback = null;
	this.label = null;
	this.parents = [];

	this.getLabel = function(){
		if(this.label)
			return this.label;
		for(var i=0; i<parents.length; i++){
			if(this.parents[i].label)
				return this.parents[i].label;
		}
		return null;
	};

	if(msg && msg.tags && 'batch' in msg.tags){ // nested batches - add parent
		var parentBatch = gateway.batch[msg.tags.batch];
		this.parents.push(parentBatch);
		this.parents = this.parents.concat(parentBatch.parents);
	}
}

// Legacy bind objects - kept empty for backward compatibility
var batchBinds = {};
var cmdBinds = {};
var ctcpBinds = {};

// ============================================================================
// BATCH HANDLERS
// ============================================================================

ircEvents.on('batch:chathistory', function(data){
	var msg = data.msg;
	var batch = data.batch;
	batch.receivedMessages = 0; // Track how many messages we received
	batch.oldestMsgid = null; // Track oldest message msgid
	batch.oldestTimestamp = null; // Track oldest message timestamp
});

ircEvents.on('batch:chathistory', function(data){
	var msg = data.msg;
	var batch = data.batch;
	// This will be called when the batch ends (msg.isBatchEnd is true)
	// We need to set a callback to add the "load older" link
	batch.callback = function(batch, msg){
		console.log('chathistory batch ended, received', batch.receivedMessages, 'messages');
		var chan = gateway.findChannel(batch.args[0]);
		if(!chan) return;

		// Remove any existing "load older" button first
		$('#' + chan.id + '-window .loadOlderButton').remove();
		$('#' + chan.id + '-window .noOlderHistory').remove();

		// Check if we should show "load older" link or end-of-history message
		// According to the spec, an empty batch means no more history available
		if(batch.receivedMessages > 0){
			// Use the tracked oldest message from this batch (not from DOM which might
			// include older messages from localStorage)
			var reference = null;
			if(batch.oldestMsgid){
				reference = 'msgid=' + batch.oldestMsgid;
			} else if(batch.oldestTimestamp){
				// Convert milliseconds timestamp to ISO format for chathistory protocol
				var isoStr = new Date(batch.oldestTimestamp).toISOString();
				reference = 'timestamp=' + isoStr;
			}

			if(reference){
				// Find a message from this batch to insert the button before
				var selector = batch.oldestMsgid
					? '[data-msgid="' + batch.oldestMsgid + '"]'
					: '[data-time="' + batch.oldestTimestamp + '"]';
				var targetMsg = $('#' + chan.id + '-window .messageDiv' + selector).first();

				if(targetMsg.length){
					var html = '<div class="loadOlderButton" data-channel="' + chan.name + '" data-reference="' + reference + '"><a href="javascript:gateway.loadOlderHistory(\'' + chan.name.replace(/'/g, "\\'") + '\')">' + language.loadOlderHistory + '</a></div>';
					// Insert above the oldest message from this batch
					targetMsg.before(html);
				}
			}
		} else {
			// Empty batch - show "no older messages" message
			// Insert above the oldest timestamped message in the window
			var oldestMsg = $('#' + chan.id + '-window .messageDiv[data-time]').first();
			if(oldestMsg.length){
				var html = '<div class="noOlderHistory">' + language.noOlderHistory + '</div>';
				oldestMsg.before(html);
			}
		}
	};
});

ircEvents.on('batch:labeled-response', function(data){
	// Empty handler for labeled-response batches
});

ircEvents.on('batch:metadata', function(data){
	// Batch for metadata responses (draft/metadata-2)
	// Contains RPL_KEYVALUE, RPL_KEYNOTSET, or METADATA messages
});

ircEvents.on('batch:metadata-subs', function(data){
	// Batch for subscription list responses (draft/metadata-2)
	// Contains RPL_METADATASUBS numerics
});

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

ircEvents.on('cmd:ACCOUNT', function(msg) {
	if(msg.args.length < 1 || msg.args[0] == '*' || msg.args[0] == '0'){
		msg.user.setAccount(false);
	} else {
		msg.user.setAccount(msg.args[0]);
	}
});

ircEvents.on('cmd:ACK', function(msg) {
	// labeled-response ACK - empty handler
});

ircEvents.on('cmd:AUTHENTICATE', function(msg) {
	if(msg.args[0] == '+'){
		ircCommand.performQuick('AUTHENTICATE', [Base64.encode(guser.nickservnick + '\0' + guser.nickservnick + '\0' + guser.nickservpass)]);
		gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLogin+he(guser.nickservnick)]);
		gateway.connectStatus = 'identified';
	} else {
		// Server sent unexpected AUTHENTICATE response (not '+')
		// For PLAIN mechanism, server should only send '+' to request credentials
		// Ignore and wait for 903/904/906 numerics to complete authentication
		console.log('Unexpected AUTHENTICATE response:', msg.args[0]);
	}
});

ircEvents.on('cmd:AWAY', function(msg) {
	if(msg.text == ''){
		msg.user.notAway();
	} else {
		msg.user.setAway(msg.text);
	}
});

ircEvents.on('cmd:BATCH', function(msg) {
	var name = msg.args[0].substr(1);
	var type = msg.args[1];
	if(msg.args[0].charAt(0) == '-'){
		var batch = gateway.batch[name];
		if(!batch){
			console.error('BATCH "' + name + '" ended but not started!');
			return;
		}
		if(batch.callback){
			batch.callback(batch, msg);
		}
		delete gateway.batch[name];
		msg.isBatchEnd = true;
		msg.batch = batch;
	} else if(msg.args[0].charAt(0) == '+'){
		var batch = new ircBatch(name, type, msg.args.slice(2), msg);
		gateway.batch[name] = batch;
		if('label' in msg.tags){
			batch.label = msg.tags.label;
		}
		// Emit batch start event
		ircEvents.emit('batch:' + type, {msg: msg, batch: batch});
		msg.isBatchStart = true;
	} else {
		console.error('Unknown batch argument!');
		return;
	}
});

ircEvents.on('cmd:CAP', function(msg) {
	switch(msg.args[1]){
		case 'LS': case 'NEW':
			// Parse available capabilities from server
			if (msg.args[2] == '*')
				capInProgress = true;
			else
				capInProgress = false;

			// Parse capabilities from THIS line only (before adding to accumulated serverCaps)
			var thisLineCaps = {};
			var availableCaps = msg.text.split(' ');
			for(var i=0; i<availableCaps.length; i++){
				var capString = availableCaps[i];
				var value = true;
				var cap = '';
				var argIndex = capString.indexOf('=')
				if(argIndex > 0){
					cap = capString.substring(0, argIndex);
					value = capString.substring(argIndex+1);
				} else {
					cap = capString;
				}
				thisLineCaps[cap] = value;
			}

			// Build list of capabilities to request from THIS line only
			var useCaps = '';
			for(var i=0; i<supportedCaps.length; i++){
				var capSpec = supportedCaps[i];
				var selectedCap = null;

				if(Array.isArray(capSpec)){
					// Mutually exclusive capabilities - pick first available
					for(var j=0; j<capSpec.length; j++){
						if(capSpec[j] in thisLineCaps){
							selectedCap = capSpec[j];
							break;
						}
					}
				} else {
					// Single capability
					if(capSpec in thisLineCaps){
						selectedCap = capSpec;
					}
				}

				if(selectedCap){
					if(useCaps.length > 0) useCaps += ' ';
					useCaps += selectedCap;
				}
			}

			// Send CAP REQ for capabilities from this line
			if(useCaps.length > 0){
				ircCommand.performQuick('CAP', ['REQ'], useCaps);
			}

			// Now add this line's capabilities to accumulated serverCaps
			for(var cap in thisLineCaps){
				serverCaps[cap] = thisLineCaps[cap];
			}
			break;
		case 'ACK':
			var newCapsParsed = {};
			var newCaps = msg.text.split(' ');
			for(var i=0; i<newCaps.length; i++){
				var cap = newCaps[i];
				var add = true;

				if(cap.charAt(0) == '-'){
					add = false;
					cap = cap.substr(1);
				}
				if(!(cap in activeCaps) && add){ // add capability
					activeCaps[cap] = serverCaps[cap];
					newCapsParsed[cap] = serverCaps[cap];
				}
				if(cap in activeCaps && !add){ // remove capability
					delete activeCaps[cap];
				}
			}
			// Check for any metadata capability (draft/metadata-2, draft/metadata-notify-2, or draft/metadata)
			if('draft/metadata-2' in newCapsParsed || 'draft/metadata-notify-2' in newCapsParsed || 'draft/metadata' in newCapsParsed){
				ircCommand.metadata('SUB', '*', ['avatar', 'status', 'bot', 'homepage', 'display-name', 'bot-url', 'color']); // subscribing to the metadata
				if(textSettingsValues['avatar']){
					disp.avatarChanged();
				}
				$('.setAvatar').show(); // now that we support metadata, we can show own avatar
			}
			if(guser.nickservpass != '' && guser.nickservnick != '' && 'sasl' in newCapsParsed){
				ircCommand.performQuick('AUTHENTICATE', ['PLAIN']);
				gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLoginAttempt]);
				saslInProgress = true;
			} else {
				if (!capInProgress && !saslInProgress)
					ircCommand.performQuick('CAP', ['END']);
			}
			break;
		case 'DEL':
			var delCaps = msg.text.split(' ');
			for(var i=0; i<delCaps.length; i++){
				var cap = delCaps[i];
				if(cap in activeCaps){
					delete activeCaps[cap];
				}
				if(cap in serverCaps){
					delete serverCaps[cap];
				}
			}
			break;
	}
});

ircEvents.on('cmd:CHGHOST', function(msg) {
	msg.user.setIdent(msg.args[0]);
	msg.user.setHost(msg.args[1]);
});

ircEvents.on('cmd:FAIL', function(msg) {
	// Standard replies (https://ircv3.net/specs/extensions/standard-replies)
	// Format: FAIL <command> <code> [<context>...] :<description>
	var command = msg.args[0];
	var code = msg.args[1];
	var description = msg.text;

	console.log('FAIL', command, code, description);

	// Handle specific FAIL types
	if(command == 'METADATA'){
		// FAIL METADATA responses for draft/metadata-2
		// Examples: KEY_INVALID, KEY_NO_PERMISSION, TOO_MANY_SUBS, etc.
		// These are informational - the batch will complete normally
	}
});

ircEvents.on('cmd:ERROR', function(msg) {
	gateway.lasterror = msg.text;

	gateway.disconnected(msg.text);

	var expr = /^Closing Link: [^ ]+\[([^ ]+)\] \(User has been banned from/;
	var match = expr.exec(msg.text);
	if(match){
		gateway.displayGlobalBanInfo(msg.text);
		gateway.connectStatus = 'banned';
	}
	if(gateway.connectStatus == 'banned') return;

	if(gateway.connectStatus == 'disconnected') {
		if(gateway.firstConnect){
			gateway.reconnect();
		}
		return;
	}

	gateway.connectStatus = 'disconnected';

	if(msg.text.match(/\(NickServ \(RECOVER command used by [^ ]+\)\)$/) || msg.text.match(/\(NickServ \(Użytkownik [^ ]+\ użył komendy RECOVER\)\)$/)){
		$$.displayReconnect();
		var html = language.recoverErrorHtml;
		$$.displayDialog('error', 'herror', language.error, html);
	} else {
		var html = '<h3>' + language.serverClosedConnection + '</h3>' +
			'<p>' + language.informations + ': '+he(msg.text)+'</p>';
		$$.displayDialog('error', 'error', language.error, html);
		if($('#autoReconnect').is(':checked')){
			gateway.reconnect();
		} else {
			$$.displayReconnect();
		}
	}
});

ircEvents.on('cmd:EXTJWT', function(msg){
	if(!msg.batch){
		return; // labelNotProcessed handler will take full care of that
	}
	if(msg.args[2] == '*'){
		var tokenData = msg.args[3];
	} else {
		var tokenData = msg.args[2];
	}
	if(!('extjwtContent' in msg.batch)){
		msg.batch.extjwtContent = tokenData;
	} else {
		msg.batch.extjwtContent += tokenData;
	}
	// Actual batch output data is handled by the labelNotProcessed handler too
});

ircEvents.on('cmd:INVITE', function(msg) {
	var html = '<b>'+he(msg.sender.nick)+'</b> ' + language.inviting + ' <b>'+he(msg.text);
	var button = [ {
		text: language.enter,
		click: function(){
			ircCommand.channelJoin(msg.text);
			$(this).dialog('close');
		}
	}, {
		text: language.ignore,
		click: function(){
			$(this).dialog('close');
		}
	} ];
	$$.displayDialog('invite', msg.sender.nick+msg.text, language.invitation, html, button);
});

// JOIN handler 1 - own joins
ircEvents.on('cmd:JOIN', function(msg) {
	if(msg.user == guser.me) {
		if('extended-join' in activeCaps){
			var channame = msg.args[0];
		} else {
			var channame = msg.text;
		}
		var chan = gateway.findChannel(channame);
		if(chan) {
			chan.rejoin();
		} else {
			chan = gateway.findOrCreate(channame, true);
			chan.appendMessage(language.messagePatterns.joinOwn, [$$.niceTime(msg.time), msg.sender.nick, msg.sender.ident, msg.sender.host, channame]);
		}
		ircCommand.mode(channame, '');
		if("WHOX" in isupport){
			ircCommand.whox(channame, "tuhanfr,101"); // to pozwoli nam dostać też nazwę konta
		} else {
			ircCommand.who(channame);
		}

		// For server-triggered JOINs (no label), request history after delay
		var label = msg.getLabel ? msg.getLabel() : (msg.tags && msg.tags.label);
		if(!label || !(label in gateway.labelInfo) || gateway.labelInfo[label].cmd != 'JOIN'){
			// Server-triggered JOIN or no labeled-response capability
			// Use 500ms timeout fallback to allow JOIN data to arrive
			setTimeout(function(){
				if('draft/chathistory' in activeCaps && 'CHATHISTORY' in isupport){
					var limit = gateway.calculateHistoryLimit();
					var isupportLimit = isupport['CHATHISTORY'];
					if(isupportLimit != 0 && isupportLimit < limit){
						limit = isupportLimit;
					}
					ircCommand.chathistory('LATEST', channame, '*', undefined, limit);
				}
			}, 500);
		}
		// For user-initiated JOINs, history is requested by the callback set in channelJoin()
	}
});

// JOIN handler 2 - all joins
ircEvents.on('cmd:JOIN', function(msg) {
	if(msg.user != guser.me) {
		gateway.processJoin(msg);
	}
	if('extended-join' in activeCaps){
		var channame = msg.args[0];
	} else {
		var channame = msg.text;
		ircCommand.who(msg.sender.nick); // fallback
	}
	var chan = gateway.findChannel(channame);
	if(!chan) return;
	msg.user.setIdent(msg.sender.ident);
	msg.user.setHost(msg.sender.host);
	if('extended-join' in activeCaps){
		if(msg.args[1] != '*'){
			msg.user.setAccount(msg.args[1]);
		} else {
			msg.user.setRegistered(false);
		}
		msg.user.setRealname(msg.text);
	}
	nicklistUser = chan.nicklist.addUser(msg.user);
	nicklistUser.setMode('owner', false);
	nicklistUser.setMode('admin', false);
	nicklistUser.setMode('op', false);
	nicklistUser.setMode('halfop', false);
	nicklistUser.setMode('voice', false);
});

ircEvents.on('cmd:KICK', function(msg) {
	if(gateway.findChannel(msg.args[0])) {
		if(msg.args[1] != guser.nick) {
			gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.kick, [$$.niceTime(msg.time), he(msg.sender.nick), he(msg.args[1]), he(msg.args[0]), $$.colorize(msg.text)]);
			gateway.findChannel(msg.args[0]).nicklist.removeNick(msg.args[1]);
		} else {
			gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.kickOwn, [$$.niceTime(msg.time), he(msg.sender.nick), he(msg.args[0]), $$.colorize(msg.text)]);
			gateway.findChannel(msg.args[0]).part();
		}
	}
});

ircEvents.on('cmd:METADATA', function(msg) {
	var target = msg.args[0];
	var key = msg.args[1];
	var value = msg.args[3];
	if(target.charAt(0) == '#'){ // channel
	} else {
		var user = users.getUser(target);
		user.setMetadata(key, value);
		// Emit metadata event
		ircEvents.emit('metadata:' + key, {user: user, key: key, value: value});
	}
});

ircEvents.on('cmd:MODE', function(msg) {
	var chanName = msg.args[0];
	if(chanName == guser.nick){
		gateway.parseUmodes(msg.text);
		gateway.statusWindow.appendMessage(language.messagePatterns.umode, [$$.niceTime(msg.time), guser.nick, gateway.getUmodeString()]);
	} else if(gateway.findChannel(chanName)) {
		var modestr = '';
		for (i in msg.args) {
			if(i != 0) {
				modestr += msg.args[i]+' ';
			}
		}
		modestr = modestr.slice(0,-1);
		var chan = gateway.findChannel(chanName);
		var args2 = msg.args;
		args2.shift();
		var info = gateway.parseChannelMode(args2, chan);
		if (!$('#showMode').is(':checked') || msg.sender.nick.toLowerCase() == guser.nick.toLowerCase()) {
			chan.appendMessage(language.messagePatterns.modeChange, [$$.niceTime(msg.time), he(msg.sender.nick), /*he(modestr)*/info, he(chanName)]);
		}
	}
});

ircEvents.on('cmd:NICK', function(msg) {
	users.changeNick(msg.sender.nick, msg.text, msg.time);
});

ircEvents.on('cmd:NOTICE', function(msg) {
	if (msg.text == false) {
		msg.text = " ";
	}

	// Track messages in chathistory batch
	if(msg.tags && 'batch' in msg.tags){
		var batch = gateway.batch[msg.tags.batch];
		if(batch && batch.type == 'chathistory'){
			batch.receivedMessages = (batch.receivedMessages || 0) + 1;
			// Track the oldest message reference for "load older" functionality
			// Note: spec says order SHOULD be ascending but is implementation-defined,
			// so we need to actually compare to find the oldest
			var msgTime = msg.time ? msg.time.getTime() : null;
			if(msgTime && (!batch.oldestTimestamp || msgTime < batch.oldestTimestamp)){
				batch.oldestTimestamp = msgTime;
				batch.oldestMsgid = ('msgid' in msg.tags) ? msg.tags.msgid : null;
			}
		}
	}

	if(msg.args[0].indexOf('#') == 0) { // wiadomość kanałowa
		if(ignore.ignoring(msg.user, 'channel')){
			console.log('Ignoring message on '+msg.args[0]+' by '+msg.sender.nick);
			return;
		}
	} else { //prywatna
		if(ignore.ignoring(msg.user, 'query')){
			console.log('Ignoring private message by '+msg.sender.nick);
			return;
		}
	}
	if(msg.text.match(/^\001.*\001$/i)) { // ctcp
		var ctcpreg = msg.text.match(/^\001(([^ ]+)( (.*))?)\001$/i);
		var acttext = ctcpreg[1];
		var ctcp = ctcpreg[2];
		var text = ctcpreg[4];
		if(gateway.findQuery(msg.sender.nick)) {
			gateway.findQuery(msg.sender.nick).appendMessage(language.messagePatterns.ctcpReply, [$$.niceTime(msg.time), he(msg.sender.nick), $$.colorize(acttext)]);
		} else {
			gateway.statusWindow.appendMessage(language.messagePatterns.ctcpReply, [$$.niceTime(msg.time), he(msg.sender.nick), $$.colorize(acttext)]);
		}
		if(ctcp.toLowerCase() == 'version'){
			$$.displayDialog('whois', msg.sender.nick, language.userInformation + he(msg.sender.nick), language.userSoftware + '<b>'+he(msg.sender.nick)+'</b>:<br>'+he(text));
		}
	} else { // nie-ctcp
		if(msg.sender.nick.toLowerCase() == 'nickserv'){
			if(services.nickservMessage(msg)) {
				return;
			}
		}
		if(msg.sender.nick.toLowerCase() == 'chanserv'){
			if(services.chanservMessage(msg)) {
				return;
			}
		}
		gateway.insertMessage('NOTICE', msg.args[0], msg.text, false, false, msg.tags, msg.user, msg.time);
	}
});

ircEvents.on('cmd:PING', function(msg) {
	gateway.forceSend('PONG :'+msg.text);
});

ircEvents.on('cmd:PONG', function(msg) {
	gateway.pingcnt = 0;
});

ircEvents.on('cmd:PART', function(msg) {
	var channel = msg.args[0];
	var channelTab = gateway.findChannel(channel);
	if(msg.sender.nick != guser.nick) {
		if(channelTab){
			if (!$('#showPartQuit').is(':checked')) {
				channelTab.appendMessage(language.messagePatterns.part, [$$.niceTime(msg.time), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), channel, $$.colorize(msg.text)]);
			}
			channelTab.nicklist.removeNick(msg.sender.nick);
		}
	} else {
		if(channelTab)
			channelTab.appendMessage(language.messagePatterns.partOwn, [$$.niceTime(msg.time), channel, md5(channel)]);
		gateway.statusWindow.appendMessage(language.messagePatterns.partOwn, [$$.niceTime(msg.time), channel, md5(channel)]);
		$('.channelRejoin-'+md5(channel)).click(function(){ ircCommand.channelJoin(channel); });
		if(channelTab)
			channelTab.part();
	}
});

ircEvents.on('cmd:PRIVMSG', function(msg) {
	if (msg.text === false) {
		msg.text = " ";
	}

	// Track messages in chathistory batch
	if(msg.tags && 'batch' in msg.tags){
		var batch = gateway.batch[msg.tags.batch];
		if(batch && batch.type == 'chathistory'){
			batch.receivedMessages = (batch.receivedMessages || 0) + 1;
			// Track the oldest message reference for "load older" functionality
			// Note: spec says order SHOULD be ascending but is implementation-defined,
			// so we need to actually compare to find the oldest
			var msgTime = msg.time ? msg.time.getTime() : null;
			if(msgTime && (!batch.oldestTimestamp || msgTime < batch.oldestTimestamp)){
				batch.oldestTimestamp = msgTime;
				batch.oldestMsgid = ('msgid' in msg.tags) ? msg.tags.msgid : null;
			}
		}
	}

	if(msg.args[0].indexOf('#') == 0) { // wiadomość kanałowa
		if(ignore.ignoring(msg.user, 'channel')){
			console.log('Ignoring message on '+msg.args[0]+' by '+msg.sender.nick);
			return;
		}
	} else { //prywatna
		if(ignore.ignoring(msg.user, 'query')){
			console.log('Ignoring private message by '+msg.sender.nick);
			return;
		}
	}

	if(msg.text.match(/^\001.*\001$/i)) { //CTCP
		var space = msg.text.indexOf(' ');
		if(space > -1){
			var ctcp = msg.text.substring(1, space);
			msg.ctcptext = msg.text.substring(space+1, msg.text.length-1);
		} else {
			var ctcp = msg.text.slice(1, -1);
			msg.ctcptext = '';
		}
		if('label' in msg.tags && ctcp != 'ACTION'){
			return; // don't display nor process own requests, this may change later
		}
		// Emit CTCP event
		ircEvents.emit('ctcp:' + ctcp, msg);
		return;
	}
	gateway.insertMessage('PRIVMSG', msg.args[0], msg.text, false, false, msg.tags, msg.user, msg.time);
});

ircEvents.on('cmd:QUIT', function(msg) {
	if(msg.sender.nick == guser.nick) { // does not happen on Unreal
		for(c in gateway.channels) {
			gateway.channels[c].part();
			//gateway.channels[c].appendMessage(language.messagePatterns.nickChange, [$$.niceTime(msg.time), msg.sender.nick, msg.text]);
		}
	} else {
		if(gateway.processQuit(msg))
			users.delUser(msg.sender.nick);
	}
});

ircEvents.on('cmd:SETNAME', function(msg) {
	msg.user.setRealname(msg.text);
});

ircEvents.on('cmd:TAGMSG', function(msg) {
	// it will be handled later
});

ircEvents.on('cmd:TOPIC', function(msg) {
	if(gateway.findChannel(msg.args[0])) {
		if(msg.text) {
			gateway.findChannel(msg.args[0]).setTopic(msg.text);
			gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.changeTopic, [$$.niceTime(msg.time), he(msg.sender.nick), $$.colorize(msg.text)]);
		} else {
			gateway.findChannel(msg.args[0]).setTopic('');
			gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.deleteTopic, [$$.niceTime(msg.time), he(msg.sender.nick), msg.args[0]]);
		}

	}
});

// ============================================================================
// NUMERIC HANDLERS
// ============================================================================

ircEvents.on('cmd:001', function(msg) {	// RPL_WELCOME
	try {
		var ckNick = localStorage.getItem('origNick');
		if(!ckNick){
			localStorage.setItem('origNick', guser.nick);
		}
	} catch(e){
	}

	if(msg.args[0] != guser.nick) {
		irc.lastNick = guser.nick;
		guser.nick = msg.args[0];
		$$.displayDialog('warning', 'warning', language.warning, '<p>' + language.yourCurrentNickIs + '<b>'+guser.nick+'</b>.</p>');
	}
	gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(msg.time), he(msg.text)]);
	gateway.pingcnt = 0;
	gateway.connectStatus = '001';
	users.knowOwnNick();
});

// 002-004 empty handlers
ircEvents.on('cmd:002', function(msg) {});	// RPL_YOURHOST
ircEvents.on('cmd:003', function(msg) {});	// RPL_CREATED
ircEvents.on('cmd:004', function(msg) {});	// RPL_MYINFO

ircEvents.on('cmd:005', function(msg){	// RPL_ISUPPORT
	for(var i=1; i<msg.args.length; i++){
		// Skip the trailing text message (e.g., "are supported by this server")
		// which contains spaces and is not an actual ISUPPORT token
		if(msg.args[i].indexOf(' ') !== -1){
			continue;
		}
		var data = msg.args[i].split("=");
		if(data.length < 2){
			isupport[data[0]] = true;
		} else {
			isupport[data[0]] = data[1];
		}
	}
	gateway.parseIsupport();
});

ircEvents.on('cmd:221', function(msg) {	// RPL_UMODES
	guser.clearUmodes();
	gateway.parseUmodes(msg.args[1]);
	gateway.statusWindow.appendMessage(language.messagePatterns.umode, [$$.niceTime(msg.time), guser.nick, gateway.getUmodeString()]);
	gateway.pingcnt = 0;
});

ircEvents.on('cmd:300', function(msg) {});	// RPL_NONE

ircEvents.on('cmd:301', function(msg) {	// RPL_AWAY
	var query = gateway.findQuery(msg.args[1]);
	if(query){
		query.appendMessage(language.messagePatterns.away, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.text)]);
	} else {
		$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.notPresent + ":</span><span class='data'>" + he(msg.args[1]) + language.isNotPresent + he(msg.text) + "</span></p>");
	}
});

ircEvents.on('cmd:302', function(msg) {});	// RPL_USERHOST
ircEvents.on('cmd:303', function(msg) {});	// RPL_ISON
ircEvents.on('cmd:304', function(msg) {});	// RPL_TEXT

ircEvents.on('cmd:305', function(msg) {	// RPL_UNAWAY
	guser.me.setAway(false);
	gateway.statusWindow.appendMessage(language.messagePatterns.yourAwayDisabled, [$$.niceTime(msg.time)]);
	gateway.statusWindow.markBold();
});

ircEvents.on('cmd:306', function(msg) {	// RPL_NOWAWAY
	guser.me.setAway(ircCommand.pendingAwayReason || true);
	gateway.statusWindow.appendMessage(language.messagePatterns.yourAwayEnabled, [$$.niceTime(msg.time)]);
	gateway.statusWindow.markBold();
});

ircEvents.on('cmd:307', function(msg) {	// RPL_WHOISREGNICK
	$$.displayDialog('whois', msg.args[1], false, '<p class="whois"><span class="info"><br /></span><span class="data">' + language.nickRegistered + '</span></p>');
});

ircEvents.on('cmd:308', function(msg) {});	// RPL_RULESSTART
ircEvents.on('cmd:309', function(msg) {});	// RPL_ENDOFRULES
ircEvents.on('cmd:310', function(msg) {});	// RPL_WHOISHELPOP

ircEvents.on('cmd:311', function(msg) {	// RPL_WHOISUSER
	var html = "<p class='whois'><span class='info'>" + language.fullMask + ":</span><span class='data'> " + he(msg.args[1]) + "!" + he(msg.args[2]) + "@" + he(msg.args[3]) + "</span></p>" +
		"<p class='whois'><span class='info'>" + language.realname + ":</span><span class='data'> " + he(msg.text) + "</span></p>";
	$$.displayDialog('whois', msg.args[1], language.userInformation + he(msg.args[1]), html);
});

ircEvents.on('cmd:312', function(msg) {	// RPL_WHOISSERVER
	if(!gateway.whowasExpect312){
		var html = "<p class='whois'><span class='info'>" + language.server + ":</span><span class='data'>" + he(msg.args[2]) + " "+ he(msg.text) + "</span></p>";
	} else {
		gateway.whowasExpect312 = false;
		var html = "<p class='whois'><span class='info'>" + language.server + ":</span><span class='data'>" + he(msg.args[2]) + "</span></p>" +
			"<p class='whois'><span class='info'>" + language.seen + ":</span><span class='data'>" + he(msg.text) + "</span></p>";
	}
	$$.displayDialog('whois', msg.args[1], false, html);
});

ircEvents.on('cmd:313', function(msg) {	// RPL_WHOISOPERATOR
	var info = '<b class="admin">' + language.ircop + '</b>';
	if(msg.text.match(/is a Network Service/i)){
		info = language.networkService;
		var sel = $$.getDialogSelector('whois', msg.args[1]).find('span.admin');
		if(sel.length){
			sel.append(' ('+info+')');
			return;
		} else {
			info = '<b class="admin">' + info + '</b>';
		}
	}
	$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data admin'>"+info+"</span></p>");
});

ircEvents.on('cmd:314', function(msg){	// RPL_WHOWASUSER
	var html = "<p class='whois'><span class='info'>" + language.fullMask + ":</span><span class='data'> " + msg.args[1] + '!' + he(msg.args[2]) + '@' + he(msg.args[3]) + '</span></p>' +
		"<p class='whois'><span class='info'>" + language.realname + ":</span><span class='data'> " + he(msg.text) + "</span></p>";
	$$.displayDialog('whois', msg.args[1], language.previousVisitsBy + he(msg.args[1]), html);
	gateway.whowasExpect312 = true;
});

ircEvents.on('cmd:315', function(msg){	// RPL_ENDOFWHO
});

ircEvents.on('cmd:317', function(msg) {	// RPL_WHOISIDLE
	$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.signedOn + ":</span><span class='data'>" + $$.parseTime(msg.args[3]) + "</span></p>");
	var idle = msg.args[2];
	var hour = Math.floor(idle/3600);
	idle = idle - hour * 3600;
	var min = Math.floor(idle/60);
	var sec = idle - min * 60;
	$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.idle + "</span><span class='data'>" + (hour>0? hour + ' ' + language.hoursShort + ' ' : "") + (min>0? min + ' ' + language.minutesShort + ' ' : "") + sec + ' ' + language.secondsShort + '</span></p>');
});

ircEvents.on('cmd:318', function(msg) {	// RPL_ENDOFWHOIS
	gateway.displayOwnWhois = false;
});

ircEvents.on('cmd:319', function(msg) {	// RPL_WHOISCHANNELS
	if(gateway.connectStatus == 'connected'){ // normalny whois
		var chanlist = msg.text.split(' ');
		var chanHtml = '';
		chanlist.forEach(function(channel){
			var chanPrefix = '';
			var chanName = channel;
			while(chanName.charAt(0) != '#'){
				chanPrefix += chanName.charAt(0);
				chanName = chanName.substring(1);
				if(chanName.length == 0){
					return;
				}
			}
			chanName = he(chanName);
			chanHtml += he(chanPrefix) + '<a href="javascript:ircCommand.channelJoin(\'' + chanName + '\')" title="' + language.joinChannel + ' ' + chanName + '">' + chanName + '</a> ';
		});
		$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.channels + ":</span><span class='data'> "+ chanHtml + "</span></p>");
	} else {	// sprawdzam, na jakich kanałach sam jestem
		gateway.connectStatus = '001';
		if(msg.args[1] == guser.nick){
			var chans = msg.text.split(' ');
			chans.forEach( function(channame){
				var channel = channame.match(/#[^ ]*/);
				if(channel){
					if(gateway.findChannel(channel[0])) {
						gateway.findChannel(channel[0]).rejoin();
					} else {
						gateway.findOrCreate(channel[0]);
					}
					ircCommand.channelNames(channel[0]);
					ircCommand.channelTopic(channel[0]);
					ircCommand.who(channel[0]);
				}
			});
		}
	}
});

ircEvents.on('cmd:320', function(msg) {	//RPL_WHOISSPECIAL
	var expr = /connected from (.*) \(([^ ]+)\)/;
	var match = expr.exec(msg.text);
	if(match){
		var cname = geoip.getName(match[2]);
		var html = language.isConnectingFrom;
		if(!cname){
			html += match[1] + ' (' + match[2] + ')';
		} else {
			html += geoip.flag(match[2])+' '+cname;
		}
	} else {
		var sel = $$.getDialogSelector('whois', msg.args[1]).find('span.admin');
		if(sel.length){
			sel.append(' ('+he(msg.text)+')');
			return;
		}
		var html = he(msg.text);
	}
	$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data'>"+html+"</span></p>");
});

ircEvents.on('cmd:321', function(msg) {	// RPL_LISTSTART
});

ircEvents.on('cmd:322', function(msg) {	// RPL_LIST
	if(gateway.smallListLoading){
		if(msg.args[1] == '*') return;
		gateway.smallListData.push([msg.args[1], msg.args[2], $$.colorize(msg.text, true)]);
		return;
	}
	// Check if this belongs to a list window (labeled-response)
	if(gateway.listWindow && gateway.listWindow.loading){
		gateway.listWindow.addEntry(msg.args[1], msg.args[2], msg.text || '');
		return;
	}
	// Fallback to status window display
	if (!msg.text) {
		var outtext = '<i>(' + language.noTopic + ')</i>'; // Na wypadek jakby topic nie był ustawiony.
	} else {
		var outtext = $$.colorize(msg.text);
	}
	if(msg.args[1] == '*'){
		gateway.statusWindow.appendMessage(language.messagePatterns.chanListElementHidden, [$$.niceTime(msg.time), he(msg.args[2])]);
	} else {
		gateway.statusWindow.appendMessage(language.messagePatterns.chanListElement, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.args[1]), he(msg.args[2]), outtext]);
	}
	gateway.statusWindow.markBold();
});

ircEvents.on('cmd:323', function(msg){	// RPL_ENDOFLIST
	// Check if this belongs to a list window
	if(gateway.listWindow && gateway.listWindow.loading){
		gateway.listWindow.render();
		gateway.listWindowLabel = null;
		return;
	}
	if(!gateway.smallListLoading){
		return;
	}
	var lcompare = function(ch1, ch2){
		return ch2[1] - ch1[1];
	}
	gateway.smallListLoading = false;
	gateway.smallListData.sort(lcompare);
	var html = '<p><span class="chlist_button" onclick="gateway.performCommand(\'LIST\')">' + language.fullList + '</span> <span class="chlist_button" onclick="gateway.refreshChanList()">' + language.refresh + '</span><p>' + language.largestChannels + ':</p><table>';
	for(i in gateway.smallListData){
		var item = gateway.smallListData[i];
		html += '<tr title="'+he(item[2])+'"><td class="chname" onclick="ircCommand.channelJoin(\''+bsEscape(item[0])+'\')">'+he(item[0])+'</td><td class="chusers">'+he(item[1])+'</td></tr>';
	}
	html += '</table>';
	$('#chlist-body').html(html);
	gateway.smallListData = [];
});

ircEvents.on('cmd:324', function(msg) {	// RPL_CHANNELMODEIS
	var chan = msg.args[1];
	var mody = JSON.parse(JSON.stringify(msg.args));
	mody.splice(0,2);
	var chanO = gateway.findChannel(chan);
	if(!chanO){
		chanO = gateway.statusWindow;
	} else {
		var chanFound = true;
	}
	var info = gateway.parseChannelMode(mody, chanO, 1);
	if(info == ''){
		info = language.none;
	}
	if (!$('#showMode').is(':checked') || !chanFound) {
		chanO.appendMessage(language.messagePatterns.mode, [$$.niceTime(msg.time), chan, info]);
	}
});

ircEvents.on('cmd:329', function(msg) {	// RPL_CREATIONTIME
	if(gateway.findChannel(msg.args[1])) {
		var tab = gateway.findChannel(msg.args[1]);
	} else {
		var tab = gateway.statusWindow;
	}
	tab.appendMessage(language.messagePatterns.creationTime, [$$.niceTime(msg.time), $$.parseTime(msg.args[2])]);
});

ircEvents.on('cmd:330', function(msg) {	// RPL_WHOISLOGGEDIN
	$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.accountName + ":</span><span class='data'>" + he(msg.args[2]) + "</span></p>");
});

ircEvents.on('cmd:331', function(msg) {});	// RPL_NOTOPIC

ircEvents.on('cmd:332', function(msg) {	// RPL_TOPIC
	var chan = gateway.findChannel(msg.args[1]);
	if(chan){
		var chanFound = true;
	} else {
		chan = gateway.statusWindow;
		var chanFound = false;
	}
	if(msg.text) {
		if(chanFound) chan.setTopic(msg.text);
		chan.appendMessage(language.messagePatterns.topic, [$$.niceTime(msg.time), he(msg.args[1]), $$.colorize(msg.text)]);
	} else {
		if(chanFound) chan.setTopic('');
		chan.appendMessage(language.messagePatterns.topicNotSet, [$$.niceTime(msg.time), he(msg.args[1])]);
	}
});

ircEvents.on('cmd:333', function(msg) {	// RPL_TOPICWHOTIME
	if(gateway.findChannel(msg.args[1])) {
		gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.topicTime, [$$.niceTime(msg.time), he(msg.args[2]), $$.parseTime(msg.args[3])]);
	}
});

ircEvents.on('cmd:334', function(msg) {});	// RPL_LISTSYNTAX

ircEvents.on('cmd:335', function(msg){	// RPL_WHOISBOT
	$$.displayDialog('whois', msg.args[1], false, '<p class="whois"><span class="info"><br /></span><span class="data">' + language.isBotHtml + '</span></p>');
});

ircEvents.on('cmd:336', function(msg) {});	// RPL_INVITELIST
ircEvents.on('cmd:337', function(msg) {});	// RPL_ENDOFINVITELIST
ircEvents.on('cmd:340', function(msg) {});	// RPL_USERIP

ircEvents.on('cmd:341', function(msg) {	// RPL_INVITING
	var chan = gateway.findChannel(msg.args[2]);
	if(chan){
		chan.appendMessage(language.messagePatterns.yourInvite, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.args[2])]);
	} else {
		gateway.statusWindow.appendMessage(language.messagePatterns.yourInvite, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.args[2])]);
	}
});

ircEvents.on('cmd:342', function(msg) {});	// RPL_SUMMONING

ircEvents.on('cmd:344', function(msg) {	// RPL_WHOISCOUNTRY
	var cc = msg.args[2];
	var expr = /is connecting from (.*)/;
	var match = expr.exec(msg.text);
	if (!match)
		return;
	var cname = geoip.getName(cc);
	var html = language.isConnectingFrom;
	if(!cname){
		html += match[1] + ' (' + cc + ')';
	} else {
		html += geoip.flag(cc)+' '+cname;
	}
	$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data'>"+html+"</span></p>");
});

ircEvents.on('cmd:346', function(msg) {	// RPL_INVITELIST
	disp.insertLinebeI('I', msg.args);
});

ircEvents.on('cmd:347', function(msg) {	// RPL_INVITELISTEND
	disp.endListbeI('I', msg.args[1]);
});

ircEvents.on('cmd:348', function(msg) {	// RPL_EXCEPTLIST
	disp.insertLinebeI('e', msg.args);
});

ircEvents.on('cmd:349', function(msg) {	// RPL_ENDOFEXCEPTLIST
	disp.endListbeI('e', msg.args[1]);
});

ircEvents.on('cmd:351', function(msg) {});	// RPL_VERSION

ircEvents.on('cmd:352', function(msg) {	// RPL_WHOREPLY
	var user = users.getUser(msg.args[5]);
	user.setIdent(msg.args[2]);
	user.setHost(msg.args[3]);
	user.setRealname(msg.text.substr(msg.text.indexOf(' ') + 1));
	if(msg.args[6].indexOf('*') > -1){
		user.setIrcOp(true);
	} else {
		user.setIrcOp(false);
	}
	if(msg.args[6].indexOf('B') > -1){
		user.setBot(true);
	} else {
		user.setBot(false);
	}
	if(msg.args[6].charAt(0) == 'G'){
		user.setAway(true);
	} else {
		user.notAway();
	}
	if(msg.args[6].indexOf('*') > -1){
		user.setIrcOp(true);
	} else {
		user.setIrcOp(false);
	}
	if(msg.args[6].indexOf('B') > -1){
		user.setBot(true);
	} else {
		user.setBot(false);
	}
	if(msg.args[6].indexOf('r') > -1){
		user.setRegistered(true);
	}/* else {
		user.setRegistered(false);
	}*/
});

ircEvents.on('cmd:353', function(msg) {	// RPL_NAMREPLY
	gateway.iKnowIAmConnected();
	var channel = gateway.findChannel(msg.args[2]);
	var names = msg.text.split(' ');

	var newUsers = [];
	for(var i=0; i<names.length; i++){
		var name = names[i];
		var user = {
			'modes': [],
			'flags': [],
			'nick': null,
			'ident': null,
			'host': null
		};
		var state = 'flags';
		for(var j=0; j<name.length; j++){
			var cchar = name.charAt(j);
			switch(state){
				case 'flags':
					if(cchar in modes.reversePrefixes){
						user.modes.push(modes.reversePrefixes[cchar]);
						user.flags.push(cchar);
					} else {
						state = 'nick';
						user.nick = cchar;
					}
					break;
				case 'nick':
					if(cchar == '!'){
						state = 'ident';
						user.ident = '';
					} else {
						user.nick += cchar;
					}
					break;
				case 'ident':
					if(cchar == '@'){
						state = 'host';
						user.host = '';
					} else {
						user.ident += cchar;
					}
					break;
				case 'host':
					user.host += cchar;
					break;
			}
		}
		newUsers.push(user);
	}

	if(!channel || channel.hasNames){ // manual NAMES request
		var html = '<table><tr><th></th><th>Nick</th><th>ident@host</th></tr>';
		var names = msg.text.split(' ');
		for(userId in newUsers){
			var user = newUsers[userId];
			html += '<tr><td>';
			for(var i=0; i<user.flags.length; i++) html += user.flags[i];
			html += '</td><td><b>'+user.nick+'</b></td><td>';
			if(user.ident && user.host){
				html += user.ident+'@'+user.host;
			}
			html += '</td></tr>';
		}
		html += '</table>';
		$$.displayDialog('names', msg.args[2], language.nickListFor + he(msg.args[2]), html);
		return;
	}
	for(userId in newUsers){
		var user = newUsers[userId];
		var newUser = users.getUser(user.nick);
		newUser.setIdent(user.ident);
		newUser.setHost(user.host);
		var nickListItem = channel.nicklist.addUser(newUser);
		for(var i=0; i<user.modes.length; i++){
			if(user.modes[i] in language.modes.chStatusNames){
				nickListItem.setMode(language.modes.chStatusNames[user.modes[i]], true);
			} else {
				nickListItem.setMode(user.modes[i], true); // unlisted mode char
			}
		}
	}
});

ircEvents.on('cmd:354', function(msg) {	// RPL_WHOSPCRPL (WHOX)
	if(msg.args[1] != "101"){ //%tuhanfr,101
		return;
	}
	var user = users.getUser(msg.args[4]);
	user.setIdent(msg.args[2]);
	user.setHost(msg.args[3]);
	if(msg.args[5].indexOf('*') > -1){
		user.setIrcOp(true);
	} else {
		user.setIrcOp(false);
	}
	if(msg.args[5].indexOf('B') > -1){
		user.setBot(true);
	} else {
		user.setBot(false);
	}
	if(msg.args[5].charAt(0) == 'G'){
		user.setAway(true);
	} else {
		user.notAway();
	}
	if(msg.args[6] == "0"){
		user.setAccount(false);
	} else {
		user.setAccount(msg.args[6]);
	}
	user.setRealname(msg.args[7]);
});

// Empty handlers for 361-365
ircEvents.on('cmd:361', function(msg) {});	// RPL_KILLDONE
ircEvents.on('cmd:362', function(msg) {});	// RPL_CLOSING
ircEvents.on('cmd:363', function(msg) {});	// RPL_CLOSEEND
ircEvents.on('cmd:364', function(msg) {});	// RPL_LINKS
ircEvents.on('cmd:365', function(msg) {});	// RPL_ENDOFLINKS

ircEvents.on('cmd:366', function(msg) {	// RPL_ENDOFNAMES
	var channel = gateway.findChannel(msg.args[1]);
	if(!channel){
		return;
	}
	channel.hasNames = true;
	// Group events after channel finishes loading
	disp.groupEvents('#'+channel.id+'-window');
});

ircEvents.on('cmd:367', function(msg) {	// RPL_BANLIST
	disp.insertLinebeI('b', msg.args);
});

ircEvents.on('cmd:368', function(msg) {	// RPL_ENDOFBANLIST
	disp.endListbeI('b', msg.args[1]);
});

ircEvents.on('cmd:369', function(msg) {	// RPL_ENDOFWHOWAS
	// not displaying end of whowas
});

ircEvents.on('cmd:371', function(msg) {});	// RPL_INFO

ircEvents.on('cmd:372', function(msg) {	// RPL_MOTD
	var message = $$.colorize(msg.text);
	gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(msg.time), message]);
});

ircEvents.on('cmd:373', function(msg) {});	// RPL_INFOSTART
ircEvents.on('cmd:374', function(msg) {});	// RPL_ENDOFINFO
ircEvents.on('cmd:375', function(msg) {});	// RPL_MOTDSTART

ircEvents.on('cmd:376', function(msg) {	// RPL_ENDOFMOTD
	gateway.joinChannels()
});

ircEvents.on('cmd:378', function(msg) {});	// RPL_WHOISHOST - not displaying hostname
ircEvents.on('cmd:379', function(msg) {});	// RPL_WHOISMODES - not displaying modes

// Empty handlers 381-395
ircEvents.on('cmd:381', function(msg) {});	// RPL_YOUREOPER
ircEvents.on('cmd:382', function(msg) {});	// RPL_REHASHING
ircEvents.on('cmd:383', function(msg) {});	// RPL_YOURESERVICE
ircEvents.on('cmd:384', function(msg) {});	// RPL_MYPORTIS
ircEvents.on('cmd:385', function(msg) {});	// RPL_NOTOPERANYMORE
ircEvents.on('cmd:386', function(msg) {});	// RPL_QLIST
ircEvents.on('cmd:387', function(msg) {});	// RPL_ENDOFQLIST
ircEvents.on('cmd:388', function(msg) {});	// RPL_ALIST
ircEvents.on('cmd:389', function(msg) {});	// RPL_ENDOFALIST
ircEvents.on('cmd:391', function(msg) {});	// RPL_TIME
ircEvents.on('cmd:392', function(msg) {});	// RPL_USERSSTART
ircEvents.on('cmd:393', function(msg) {});	// RPL_USERS
ircEvents.on('cmd:394', function(msg) {});	// RPL_ENDOFUSERS
ircEvents.on('cmd:395', function(msg) {});	// RPL_NOUSERS

ircEvents.on('cmd:396', function(msg) {	// RPL_HOSTHIDDEN
	gateway.statusWindow.appendMessage(language.messagePatterns.displayedHost, [$$.niceTime(msg.time), he(msg.args[1])]);
});

ircEvents.on('cmd:401', function(msg) {	// ERR_NOSUCHNICK
	if(msg.args[1] != irc.lastNick){
		$$.displayDialog('error', 'error', language.error, '<p>' + language.noSuchNickChannel + ': <b>'+he(msg.args[1])+'</b></p>');
	}
	gateway.statusWindow.appendMessage(language.messagePatterns.noSuchNick, [$$.niceTime(msg.time), he(msg.args[1])]);
});

ircEvents.on('cmd:402', function(msg) {	// ERR_NOSUCHSERVER
	$$.displayDialog('error', 'error', language.error, '<p>' + language.noSuchObject + ': <b>'+he(msg.args[1])+'</b></p>');
	gateway.statusWindow.appendMessage(language.messagePatterns.noSuchNick, [$$.niceTime(msg.time), he(msg.args[1])]);
});

ircEvents.on('cmd:403', function(msg) {	// ERR_NOSUCHCHANNEL
	$$.displayDialog('error', 'error', language.error, '<p>' + language.noSuchChannel + ': <b>'+he(msg.args[1])+'</b></p>');
	gateway.statusWindow.appendMessage(language.messagePatterns.noSuchChannel, [$$.niceTime(msg.time), he(msg.args[1])]);
});

ircEvents.on('cmd:404', function(msg) {	// ERR_CANNOTSENDTOCHAN
	if(msg.args[1].charAt(0) == '#') {
		var reason = '';
		if(msg.text.match(/You need voice \(\+v\) \(.*\)/)){
			reason = language.needVoice;
		} else if(msg.text.match(/You are banned \(.*\)/)){
			reason = language.youreBanned;
		} else if(msg.text.match(/Color is not permitted in this channel \(.*\)/)){
			reason = language.colorsForbidden;
		} else if(msg.text.match(/No external channel messages \(.*\)/)){
			reason = language.noExternalMsgs;
		} else if(msg.text.match(/You must have a registered nick \(\+r\) to talk on this channel \(.*\)/)){
			reason = language.registeredNickRequired;
		} else {
			reason = language.serverMessageIs + he(msg.text);
		}
		if(gateway.findChannel(msg.args[1])){
			gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(msg.time), msg.args[1], reason]);
		} else {
			$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendMessageTo + he(msg.args[1])+'</p><p>'+reason+'</p>');
			gateway.statusWindow.appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(msg.time), msg.args[1], reason]);
		}
	} else if(gateway.findQuery(msg.args[1])){
		reason = he(msg.text);
		gateway.findQuery(msg.args[1]).appendMessage(language.messagePatterns.cannotSendToUser, [$$.niceTime(msg.time), msg.args[1], reason]);
	} else {
		$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendMessageTo + ' '+he(msg.args[1])+'</p><p>' + language.serverMessageIs + he(msg.text)+'</p>');
	}
});

ircEvents.on('cmd:405', function(msg) {});	// ERR_TOOMANYCHANNELS

ircEvents.on('cmd:406', function(msg) {	// ERR_WASNOSUCHNICK
	$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.recentVisitsForNickNotFound + '<b>'+he(msg.args[1])+'</b></p>');
	gateway.statusWindow.appendMessage(language.messagePatterns.noSuchNickHistory, [$$.niceTime(msg.time), he(msg.args[1])]);
});

// Empty error handlers 407-410
ircEvents.on('cmd:407', function(msg) {});	// ERR_TOOMANYTARGETS
ircEvents.on('cmd:408', function(msg) {});	// ERR_NOSUCHSERVICE
ircEvents.on('cmd:409', function(msg) {});	// ERR_NOORIGIN
ircEvents.on('cmd:410', function(msg) {});	// ERR_INVALIDCAPCMD

ircEvents.on('cmd:411', function(msg) {	//ERR_NORECIPIENT - that was a hack to discover own nick with previous websocket interface
	if(gateway.connectStatus != 'disconnected'){
		return;
	}
	if(guser.nick == ''){
		guser.nick = msg.args[0];
	} else if(msg.args[0] != guser.nick) {
		var oldNick = guser.nick;
		setTimeout(function(){
			ircCommand.changeNick(oldNick);
		}, 500);
		guser.changeNick(msg.args[0], true);
	}
	ircCommand.whois(guser.nick);
	gateway.connectStatus = '001';
});

// Empty error handlers 412-424
ircEvents.on('cmd:412', function(msg) {});	// ERR_NOTEXTTOSEND
ircEvents.on('cmd:413', function(msg) {});	// ERR_NOTOPLEVEL
ircEvents.on('cmd:414', function(msg) {});	// ERR_WILDTOPLEVEL
ircEvents.on('cmd:416', function(msg) {});	// ERR_TOOMANYMATCHES
ircEvents.on('cmd:421', function(msg) {});	// ERR_UNKNOWNCOMMAND
ircEvents.on('cmd:422', function(msg) {});	// ERR_NOMOTD
ircEvents.on('cmd:423', function(msg) {});	// ERR_NOADMININFO
ircEvents.on('cmd:424', function(msg) {});	// ERR_FILEERROR
ircEvents.on('cmd:425', function(msg) {});	// ERR_NOOPERMOTD
ircEvents.on('cmd:429', function(msg) {});	// ERR_TOOMANYAWAY
ircEvents.on('cmd:431', function(msg) {});	// ERR_NONICKNAMEGIVEN

ircEvents.on('cmd:432', function(msg) {	// ERR_ERRONEUSNICKNAME
	if(gateway.connectStatus == 'disconnected'){
		ircCommand.changeNick('PIRC-'+Math.round(Math.random()*100));
	}
	var html = '<p>' + language.nickname + ' <b>'+he(msg.args[1])+'</b>' + language.isCurrentlyNotAvailable + '</p>';
	if(gateway.connectStatus != 'disconnected'){
		html += '<p>' + language.yourCurrentNickIs + '<b>'+guser.nick+'</b>.</p>';
	}
	$$.displayDialog('warning', 'warning', language.warning, html);
	gateway.nickWasInUse = true;
	gateway.statusWindow.appendMessage(language.messagePatterns.badNick, [$$.niceTime(msg.time), msg.args[1]]);
});

ircEvents.on('cmd:433', function(msg) {	// ERR_NICKNAMEINUSE
	if(gateway.connectStatus == 'disconnected'){
		var expr = /^([^0-9]+)(\d*)$/;
		var match = expr.exec(guser.nick);
		if(match && match[2] && !isNaN(match[2])){
			var nick = match[1];
			var suffix = parseInt(match[2]) + 1;
		} else {
			var nick = guser.nick;
			var suffix = Math.floor(Math.random() * 999);
		}
		ircCommand.changeNick(nick+suffix);
	}
	var html = '<p>' + language.nickname + ' <b>'+he(msg.args[1])+'</b>' + language.isAlreadyUsedBySomeone + '</p>';
	gateway.nickWasInUse = true;

	if(gateway.connectStatus != 'disconnected'){
		html += '<p>' + language.yourCurrentNickIs + '<b>'+guser.nick+'.</p>';
	}
	$$.displayDialog('warning', 'warning', language.warning, html);
	gateway.statusWindow.appendMessage(language.messagePatterns.nickInUse, [$$.niceTime(msg.time), msg.args[1]]);
});

// Empty error handlers 434-441
ircEvents.on('cmd:434', function(msg) {});	// ERR_NORULES
ircEvents.on('cmd:435', function(msg) {});	// ERR_SERVICECONFUSED
ircEvents.on('cmd:436', function(msg) {});	// ERR_NICKCOLLISION
ircEvents.on('cmd:437', function(msg) {});	// ERR_BANNICKCHANGE
ircEvents.on('cmd:438', function(msg) {});	// ERR_NCHANGETOOFAST
ircEvents.on('cmd:439', function(msg) {});	// ERR_TARGETTOOFAST
ircEvents.on('cmd:440', function(msg) {});	// ERR_SERVICESDOWN
ircEvents.on('cmd:441', function(msg) {});	// ERR_USERNOTINCHANNEL

ircEvents.on('cmd:442', function(msg) {	// ERR_NOTONCHANNEL
	var html = '<p>'+he(msg.args[1])+':' + language.youreNotOnChannel + '</p>';
	$$.displayDialog('error', 'error', language.error, html);
	gateway.statusWindow.appendMessage(language.messagePatterns.notOnChannel, [$$.niceTime(msg.time), he(msg.args[1])]);
});

ircEvents.on('cmd:443', function(msg) {	// ERR_USERONCHANNEL
	var html = '<p>'+he(msg.args[2])+": <b>"+he(msg.args[1])+'</b>' + language.isAlreadyOnChannel + '</p>';
	$$.displayDialog('error', 'error', language.error, html);
	gateway.statusWindow.appendMessage(language.messagePatterns.alreadyOnChannel, [$$.niceTime(msg.time), he(msg.args[2]), he(msg.args[1])]);
});

// Empty error handlers 444-446
ircEvents.on('cmd:444', function(msg) {});	// ERR_NOLOGIN
ircEvents.on('cmd:445', function(msg) {});	// ERR_SUMMONDISABLED
ircEvents.on('cmd:446', function(msg) {});	// ERR_USERSDISABLED

ircEvents.on('cmd:447', function(msg) {	// ERR_NONICKCHANGE
	var html = '<p>' + language.cantChangeNickMessageHtml + he(msg.text) + '</p>';
	$$.displayDialog('error', 'error', language.error, html);
	gateway.statusWindow.appendMessage(language.messagePatterns.notOnChannel, [$$.niceTime(msg.time), he(msg.args[1])]);
});

// Empty error handlers 448-460
ircEvents.on('cmd:448', function(msg) {});	// ERR_FORBIDDENCHANNEL
ircEvents.on('cmd:451', function(msg) {});	// ERR_NOTREGISTERED
ircEvents.on('cmd:455', function(msg) {});	// ERR_HOSTILENAME
ircEvents.on('cmd:459', function(msg) {});	// ERR_NOHIDING
ircEvents.on('cmd:460', function(msg) {});	// ERR_NOTFORHALFOPS
ircEvents.on('cmd:461', function(msg) {});	// ERR_NEEDMOREPARAMS
ircEvents.on('cmd:462', function(msg) {});	// ERR_ALREADYREGISTRED
ircEvents.on('cmd:463', function(msg) {});	// ERR_NOPERMFORHOST
ircEvents.on('cmd:464', function(msg) {});	// ERR_PASSWDMISMATCH

ircEvents.on('cmd:465', function(msg) {	// ERR_YOUREBANNEDCREEP
	gateway.displayGlobalBanInfo(msg.text);
});

// Empty error handlers 466-471
ircEvents.on('cmd:466', function(msg) {});	// ERR_YOUWILLBEBANNED
ircEvents.on('cmd:467', function(msg) {});	// ERR_KEYSET
ircEvents.on('cmd:468', function(msg) {});	// ERR_ONLYSERVERSCANCHANGE
ircEvents.on('cmd:469', function(msg) {});	// ERR_LINKSET
ircEvents.on('cmd:470', function(msg) {});	// ERR_LINKCHANNEL
ircEvents.on('cmd:471', function(msg) {});	// ERR_CHANNELISFULL

ircEvents.on('cmd:472', function(msg) {	// ERR_UNKNOWNMODE
	gateway.statusWindow.appendMessage(language.messagePatterns.invalidMode, [$$.niceTime(msg.time), msg.args[1]]);
	var html = language.invalidMode + ': "'+msg.args[1]+'"';
	$$.displayDialog('error', 'error', language.error, html);
});

ircEvents.on('cmd:473', function(msg) {	// ERR_INVITEONLYCHAN
	gateway.iKnowIAmConnected();
	var html = '<p>' + language.cantJoin + ' <b>' + he(msg.args[1]) + '</b>' +
		'<br>' + language.inviteRequired + '</p>';
	var button = [ {
		text: language.askOpersForEntry,
		click: function(){
			ircCommand.channelKnock(msg.args[1], language.entryRequest);
			$(this).dialog('close');
		}
	} ];
	gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.inviteRequiredShort]);
	$$.displayDialog('warning', 'warning', language.warning, html, button);
});

ircEvents.on('cmd:474', function(msg) {	// ERR_BANNEDFROMCHAN
	gateway.iKnowIAmConnected(); // TODO inne powody, przez które nie można wejść
	var html =  '<p>' + language.cantJoin + ' <b>' + msg.args[1] + "</b>";
	if (msg.text == "Cannot join channel (+b)") {
		html += '<br>' + language.youreBanned + '.</p>';
		gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.youreBanned]);
	}
	$$.displayDialog('error', 'error', language.error, html);
});

ircEvents.on('cmd:475', function(msg) {	// ERR_BADCHANNELKEY
	gateway.iKnowIAmConnected();
	var html = '<p>' + language.cantJoin + ' <b>' + msg.args[1] + "</b>" +
		'<br>' + language.needValidPassword + '.' +
		'<br><form onsubmit="gateway.chanPassword(\''+he(msg.args[1])+'\');$$.closeDialog(\'warning\', \'warning\')" action="javascript:void(0);">' +
		'Hasło do '+he(msg.args[1])+': <input type="password" id="chpass" /> <input type="submit" value="' + language.enter + '" /></form></p>';
	gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.passwordRequired]);
	$$.displayDialog('warning', 'warning', language.warning, html);
});

ircEvents.on('cmd:477', function(msg) {	// ERR_NEEDREGGEDNICK
	gateway.iKnowIAmConnected();
	var html = '<p>' + language.cantJoin + ' <b>' + he(msg.args[1]) + "</b>" +
		'<br>' + language.registerYourNickToJoin + '</p>';
	gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.registeredNickRequiredForChan]);
	$$.displayDialog('error', 'error', language.error, html);
});

// Empty error handlers 478-479
ircEvents.on('cmd:478', function(msg) {});	// ERR_BANLISTFULL
ircEvents.on('cmd:479', function(msg) {});	// ERR_LINKFAIL

ircEvents.on('cmd:480', function(msg) {	// ERR_CANNOTKNOCK
	var html = '<p>' + language.cantKnock + '<br>' +
		language.serverMessageIs + he(msg.text) + '</p>';
	gateway.statusWindow.appendMessage(language.messagePatterns.alreadyOnChannel, [$$.niceTime(msg.time), language.serverMessageIs, he(msg.text)]);
	$$.displayDialog('error', 'error', language.error, html);
});

ircEvents.on('cmd:481', function(msg) {});	// ERR_NOPRIVILEGES

ircEvents.on('cmd:482', function(msg) {	// ERR_CHANOPRIVSNEEDED
	var html = msg.args[1] + ': ' + language.noAccess + '.<br>' + language.notEnoughPrivileges;
	if(gateway.findChannel(msg.args[1])) {
		gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), msg.args[1]]);
	}
	$$.displayDialog('error', 'error', language.error, html);
});

ircEvents.on('cmd:486', function(msg) {	// ERR_NONONREG
	var expr = /^You must identify to a registered nick to private message ([^ ]*)$/;
	var match = expr.exec(msg.text);
	if(match){
		var query = gateway.findQuery(match[1]);
		if(query){
			query.appendMessage(language.messagePatterns.cannotSendToUser, [$$.niceTime(msg.time), match[1], language.yourNickMustBeRegistered]);
		}
		$$.displayDialog('error', 'error', language.error, '<p>' + language.cantSendPMTo + '<b>'+match[1]+'</b></p><p>' + language.userAcceptsPMsOnlyFromRegistered + '</p>');
	} else {
		$$.displayDialog('error', 'error', language.error, '<p>' + language.cantSendPM + '</p><p>' + language.serverMessageIs + he(msg.text)+'</p>');
	}
});

ircEvents.on('cmd:487', function(msg) {});	// ERR_NOTFORUSERS

ircEvents.on('cmd:489', function(msg) {	// ERR_SECUREONLYCHAN
	gateway.iKnowIAmConnected();
	var html = '<p>' + language.cantJoin + ' <b>' + he(msg.args[1]) + "</b>" +
		'<br>' + language.SSLRequired + '</p>';
	gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.SSLRequired]);
	$$.displayDialog('error', 'error', language.error, html);
});

// Empty error handlers 490-492
ircEvents.on('cmd:490', function(msg) {});	// ERR_NOSWEAR
ircEvents.on('cmd:491', function(msg) {});	// ERR_NOOPERHOST
ircEvents.on('cmd:492', function(msg) {});	// ERR_NOCTCP

ircEvents.on('cmd:499', function(msg) {	// ERR_CHANOWNPRIVNEEDED
	var html = msg.args[1] + ': ' + language.noAccess + '.<br>' + language.noPermsForAction + '.';
	if(gateway.findChannel(msg.args[1])) {
		gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), msg.args[1]]);
	}
	$$.displayDialog('error', 'error', language.error, html);
});

// Empty error handlers 500-521
ircEvents.on('cmd:500', function(msg) {});	// ERR_TOOMANYJOINS
ircEvents.on('cmd:501', function(msg) {});	// ERR_UMODEUNKNOWNFLAG
ircEvents.on('cmd:502', function(msg) {});	// ERR_USERSDONTMATCH
ircEvents.on('cmd:511', function(msg) {});	// ERR_SILELISTFULL
ircEvents.on('cmd:512', function(msg) {});	// ERR_TOOMANYWATCH
ircEvents.on('cmd:513', function(msg) {});	// ERR_NEEDPONG
ircEvents.on('cmd:514', function(msg) {});	// ERR_TOOMANYDCC
ircEvents.on('cmd:517', function(msg) {});	// ERR_DISABLED
ircEvents.on('cmd:518', function(msg) {});	// ERR_NOINVITE
ircEvents.on('cmd:519', function(msg) {});	// ERR_ADMONLY
ircEvents.on('cmd:520', function(msg) {});	// ERR_OPERONLY
ircEvents.on('cmd:521', function(msg) {});	// ERR_LISTSYNTAX

ircEvents.on('cmd:531', function(msg) {	// ERR_CANTSENDTOUSER
	var expr = /^You must identify to a registered nick to private message this user$/;
	var match = expr.exec(msg.text);
	if(match){
		var query = gateway.findQuery(msg.args[1]);
		if(query){
			query.appendMessage(language.messagePatterns.cannotSendToUser, [$$.niceTime(msg.time), he(msg.args[1]), language.yourNickMustBeRegistered]);
		}
		$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendPMTo + ' <b>'+he(msg.args[1])+'</b></p><p>' + language.userAcceptsPMsOnlyFromRegistered + '</p>');
	} else {
		$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendPM + '.</p><p>' + language.serverMessageIs + he(msg.text)+'</p>');
	}
});

// Empty handlers 597-609
ircEvents.on('cmd:597', function(msg) {});	// RPL_REAWAY
ircEvents.on('cmd:598', function(msg) {});	// RPL_GONEAWAY
ircEvents.on('cmd:599', function(msg) {});	// RPL_NOTAWAY
ircEvents.on('cmd:600', function(msg) {});	// RPL_LOGON
ircEvents.on('cmd:601', function(msg) {});	// RPL_LOGOFF
ircEvents.on('cmd:602', function(msg) {});	// RPL_WATCHOFF
ircEvents.on('cmd:603', function(msg) {});	// RPL_WATCHSTAT
ircEvents.on('cmd:604', function(msg) {});	// RPL_NOWON
ircEvents.on('cmd:605', function(msg) {});	// RPL_NOWOFF
ircEvents.on('cmd:606', function(msg) {});	// RPL_WATCHLIST
ircEvents.on('cmd:607', function(msg) {});	// RPL_ENDOFWATCHLIST
ircEvents.on('cmd:608', function(msg) {});	// RPL_CLEARWATCH
ircEvents.on('cmd:609', function(msg) {});	// RPL_NOWISAWAY

ircEvents.on('cmd:671', function(msg) {	// RPL_WHOISSECURE
	$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>TLS:</span><span class='data'>" + language.hasSecureConnection + "</span></p>");
});

ircEvents.on('cmd:742', function(msg) {});	// ERR_MLOCKRESTRICTED

ircEvents.on('cmd:761', function(msg){ });	// RPL_KEYVALUE
ircEvents.on('cmd:762', function(msg){ });	// RPL_METADATAEND

ircEvents.on('cmd:766', function(msg){	// RPL_KEYNOTSET (draft/metadata-2)
	// Indicates a key is not set (replaces ERR_NOMATCHINGKEY in new spec)
	// Format: 766 <client> <target> <key> :key not set
});

ircEvents.on('cmd:770', function(msg){ });	// RPL_METADATASUBOK

ircEvents.on('cmd:774', function(msg){	//ERR_METADATASYNCLATER
	if(msg.args[1]){
		var time = parseInt(msg.args[1]) * 1000;
	} else {
		var time = 1000;
	}
	setTimeout(ircCommand.metadata('SYNC', msg.args[0]), time);
});

ircEvents.on('cmd:900', function(msg) {	// RPL_LOGGEDIN
	saslInProgress = false;
	ircCommand.performQuick('CAP', ['END']);
	gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.weAreLoggedInAs + he(msg.args[2])]);
	if(msg.args[2] != '0'){
		guser.me.setAccount(msg.args[2]);
	} else {
		guser.me.setAccount(false);
	}
	$$.closeDialog('error', 'nickserv'); // if we displayed login prompt, let's close it.
});

ircEvents.on('cmd:901', function(msg) {	// RPL_LOGGEDOUT
	guser.me.setAccount(false);
	gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), he(msg.text)]);
});

ircEvents.on('cmd:903', function(msg) {	// RPL_SASLSUCCESS
	saslInProgress = false;
	gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLoginSuccess]);
	gateway.retrySasl = false;
	// Some servers send only 903, not 900, so send CAP END here too
	if(!capInProgress){
		ircCommand.performQuick('CAP', ['END']);
	}
});

ircEvents.on('cmd:904', function(msg) {	// ERR_SASLFAIL
	saslInProgress = false;
	ircCommand.performQuick('CAP', ['END']);
	gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLoginFail]);
	if(gateway.retrySasl){
		var html = language.suppliedNickPassword + '<b>'+guser.nickservnick+'</b>'+language.passwordInvalidTryAgain+'<br>'+services.badNickString();
		$$.displayDialog('error', 'nickserv', language.error, html);
		services.displayBadNickCounter();
	}
});

ircEvents.on('cmd:906', function(msg) {	// ERR_SASLABORTED
	saslInProgress = false;
	ircCommand.performQuick('CAP', ['END']);
	gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLNotLoggedIn]);
	// 906 means authentication was aborted (client or server initiated)
	// Do NOT retry - this is an abort, not a failure
});

ircEvents.on('cmd:972', function(msg) {	// ERR_CANNOTDOCOMMAND
	gateway.showPermError(msg.text);
	if(gateway.getActive()) {
		gateway.getActive().appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), he(msg.args[1])]);
	}
});

ircEvents.on('cmd:974', function(msg) {	// ERR_CANNOTCHANGECHANMODE
	gateway.showPermError(msg.text);
	if(gateway.getActive()) {
		gateway.getActive().appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), he(msg.args[1])]);
	}
});

// ============================================================================
// CTCP HANDLERS
// ============================================================================

ircEvents.on('ctcp:ACTION', function(msg){
	gateway.insertMessage('ACTION', msg.args[0], msg.ctcptext, false, false, msg.tags, msg.user, msg.time);
});

ircEvents.on('ctcp:VERSION', function(msg){
	version_string = language.gatewayVersionIs+mainSettings.version;
	if(addons.length > 0){
		version_string += language.versionWithAddons;
		for(i in addons){
			if(i>0){
				version_string += ', ';
			}
			version_string += addons[i];
		}
	}
	version_string += ', ' + language.runningOn + ' '+navigator.userAgent;
	ircCommand.sendCtcpReply(msg.sender.nick, 'VERSION '+version_string);
});

ircEvents.on('ctcp:USERINFO', function(msg){
	version_string = language.gatewayVersionIs+mainSettings.version;
	if(addons.length > 0){
		version_string += language.versionWithAddons;
		for(i in addons){
			if(i>0){
				version_string += ', ';
			}
			version_string += addons[i];
		}
	}
	version_string += ', ' + language.runningOn + ' '+navigator.userAgent;
	ircCommand.sendCtcpReply(msg.sender.nick, 'USERINFO '+version_string);
});

ircEvents.on('ctcp:REFERER', function(msg){
	referer_string = document.referrer;
	if(referer_string == ''){
		referer_string = language.unknown;
	}
	ircCommand.sendCtcpReply(msg.sender.nick, 'REFERER '+referer_string);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cmdNotImplemented(msg){
	var tab = gateway.statusWindow;
	var text = '('+msg.command+') ';
	var startIndex = 0;

	if(msg.args && msg.args.length > 0 && msg.args[0].charAt(0) == '#' && gateway.findChannel(msg.args[0])){
		tab = gateway.findChannel(msg.args[0]);
		startIndex = 1;
		text = '[' + msg.sender.nick + ']' + text;
	}

	for(var i=startIndex; i<msg.args.length; i++){
		text += ' ' + msg.args[i];
	}

	if(msg.command.charAt(0) == '4'){
		tab.appendMessage(language.messagePatterns.unimplementedError, [$$.niceTime(msg.time), text]);
	} else {
		tab.appendMessage(language.messagePatterns.unimplemented, [$$.niceTime(msg.time), text]);
	}
}
