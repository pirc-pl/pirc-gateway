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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Merges IRC message data with command-specific properties
 *
 * This function creates protocol events for the domain layer by copying
 * all message properties to the top level. Domain handlers should access
 * data.user, data.time, etc. directly - NOT via data.raw.
 *
 * @param {Object} msg - The base IRC message object
 * @param {Object} additionalData - Command-specific properties to add
 * @returns {Object} Merged object with all properties
 */
function protocolGeneric(msg, additionalData) {
	var result = Object.assign({}, msg);
	if (additionalData) {
		Object.assign(result, additionalData);
	}
	return result;
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

ircEvents.on('cmd:ACCOUNT', function(msg) {
	ircEvents.emit('protocol:accountCommand', protocolGeneric(msg, {
		account: msg.args[0] || null
	}));
});

ircEvents.on('cmd:ACK', function(msg) {
	ircEvents.emit('protocol:ackCommand', protocolGeneric(msg));
});

ircEvents.on('cmd:AUTHENTICATE', function(msg) {
	ircEvents.emit('protocol:authenticateCommand', protocolGeneric(msg, {
		challenge: msg.args[0] || ''
	}));
});

ircEvents.on('cmd:AWAY', function(msg) {
	ircEvents.emit('protocol:awayCommand', protocolGeneric(msg, {
		awayMessage: msg.text
	}));
});

ircEvents.on('cmd:BATCH', function(msg) {
	var batchIdRaw = msg.args[0] || '';
	var prefix = batchIdRaw.charAt(0);
	var batchId = batchIdRaw.substring(1); // Strip +/- prefix

	ircEvents.emit('protocol:batchCommand', protocolGeneric(msg, {
		batchId: batchId, // ID without prefix
		isStart: prefix === '+',
		isEnd: prefix === '-',
		batchType: msg.args[1] || '',
		batchArgs: msg.args.slice(2)
	}));
});



ircEvents.on('cmd:CAP', function(msg) {
	var capText = msg.text || '';
	var caps = capText.split(' ').filter(function(c) { return c.length > 0; });

	// For ACK/NAK, parse each cap to determine if it's being enabled (+) or disabled (-)
	var parsedCaps = caps.map(function(cap) {
		if (cap.charAt(0) === '-') {
			return { name: cap.substring(1), enabled: false };
		} else {
			return { name: cap, enabled: true };
		}
	});

	ircEvents.emit('protocol:capCommand', protocolGeneric(msg, {
		subcommand: msg.args[1] || '',
		capText: capText, // Keep raw for LS/LIST parsing
		caps: parsedCaps, // Structured list with enable/disable info
		isMultiLine: (msg.args[2] === '*')
	}));
});

ircEvents.on('cmd:CHGHOST', function(msg) {
	ircEvents.emit('protocol:chghostCommand', protocolGeneric(msg, {
		newIdent: msg.args[0] || '',
		newHost: msg.args[1] || ''
	}));
});

ircEvents.on('cmd:FAIL', function(msg) {
	ircEvents.emit('protocol:failCommand', protocolGeneric(msg, {
		failedCommand: msg.args[0] || '',
		failCode: msg.args[1] || '',
		description: msg.text
	}));
});

ircEvents.on('cmd:ERROR', function(msg) {
	ircEvents.emit('protocol:errorCommand', protocolGeneric(msg, {
		message: msg.text
	}));
});

ircEvents.on('cmd:EXTJWT', function(msg){
	ircEvents.emit('protocol:extjwtCommand', protocolGeneric(msg));
});

ircEvents.on('cmd:INVITE', function(msg) {
	ircEvents.emit('protocol:inviteCommand', protocolGeneric(msg, {
		targetNick: msg.args[0] || '',
		channelName: msg.text || msg.args[1] || ''
	}));
});

ircEvents.on('cmd:JOIN', function(msg) {
	ircEvents.emit('protocol:joinCommand', protocolGeneric(msg, {
		channelName: msg.args[0] || msg.text || ''
	}));
});

ircEvents.on('cmd:KICK', function(msg) {
	ircEvents.emit('protocol:kickCommand', protocolGeneric(msg, {
		channelName: msg.args[0] || '',
		kickedNick: msg.args[1] || '',
		reason: msg.text
	}));
});

ircEvents.on('cmd:METADATA', function(msg) {
	ircEvents.emit('protocol:metadataCommand', protocolGeneric(msg, {
		target: msg.args[0] || '',
		key: msg.args[1] || '',
		subCommand: msg.args[2] || '',
		value: msg.args[3] || ''
	}));
});

ircEvents.on('cmd:MODE', function(msg) {
	var target = msg.args[0] || '';
	var isChannel = target.charAt(0) === '#' || target.charAt(0) === '&';

	ircEvents.emit('protocol:modeCommand', protocolGeneric(msg, {
		target: target,
		isChannel: isChannel,
		modeString: msg.args.slice(1).join(' ')
	}));
});

ircEvents.on('cmd:NICK', function(msg) {
	ircEvents.emit('protocol:nickCommand', protocolGeneric(msg, {
		newNick: msg.text || msg.args[0] || ''
	}));
});

ircEvents.on('cmd:NOTICE', function(msg) {
	var target = msg.args[0] || '';
	var isChannel = target.charAt(0) === '#' || target.charAt(0) === '&';

	// Check for CTCP reply (format: \x01TYPE optional text\x01)
	if (msg.text && msg.text.match(/^\001.*\001$/i)) {
		var ctcpreg = msg.text.match(/^\001(([^ ]+)( (.*))?)\001$/i);
		if (ctcpreg) {
			var fullText = ctcpreg[1];     // "VERSION xchat 2.8.8"
			var ctcpType = ctcpreg[2];     // "VERSION"
			var ctcpText = ctcpreg[4] || ''; // "xchat 2.8.8"

			ircEvents.emit('protocol:ctcpReply', protocolGeneric(msg, {
				target: target,
				ctcpType: ctcpType,
				ctcpText: ctcpText,
				fullText: fullText,
				fromNick: msg.sender.nick
			}));
			return; // Don't process as regular NOTICE
		}
	}

	// Regular NOTICE (not CTCP)
	ircEvents.emit('protocol:noticeCommand', protocolGeneric(msg, {
		target: target,
		isChannel: isChannel,
		message: msg.text
	}));
});

ircEvents.on('cmd:PING', function(msg) {
	ircEvents.emit('protocol:pingCommand', protocolGeneric(msg, {
		token: msg.text || msg.args[0] || ''
	}));
});

ircEvents.on('cmd:PONG', function(msg) {
	ircEvents.emit('protocol:pongCommand', protocolGeneric(msg, {
		token: msg.text || msg.args[0] || ''
	}));
});

ircEvents.on('cmd:PART', function(msg) {
	ircEvents.emit('protocol:partCommand', protocolGeneric(msg, {
		channelName: msg.args[0] || '',
		partMessage: msg.text
	}));
});

ircEvents.on('cmd:PRIVMSG', function(msg) {
	var target = msg.args[0] || '';
	var isChannel = target.charAt(0) === '#' || target.charAt(0) === '&';

	// Check for CTCP request (format: \x01TYPE optional text\x01)
	if (msg.text && msg.text.match(/^\001.*\001$/i)) {
		var space = msg.text.indexOf(' ');
		var ctcpType, ctcpText;
		if (space > -1) {
			ctcpType = msg.text.substring(1, space);
			ctcpText = msg.text.substring(space + 1, msg.text.length - 1);
		} else {
			ctcpType = msg.text.slice(1, -1);
			ctcpText = '';
		}
		msg.ctcptext = ctcpText;

		// Emit specific CTCP event (e.g., ctcp:VERSION, ctcp:ACTION)
		ircEvents.emit('ctcp:' + ctcpType, msg);
		return; // Don't process as regular PRIVMSG
	}

	// Regular PRIVMSG (not CTCP)
	// Emit protocol event for domain layer processing
	// Domain will emit abstracted message:received event for display
	ircEvents.emit('protocol:privmsgCommand', protocolGeneric(msg, {
		target: target,
		dest: target,
		text: msg.text,
		isChannel: isChannel,
		message: msg.text,
		tags: msg.tags,
		sender: msg.user,
		time: msg.time
	}));

	// Display is now handled by domain layer via message:received event
	// gateway.insertMessage('PRIVMSG', target, msg.text, false, false, msg.tags, msg.user, msg.time);
});

ircEvents.on('cmd:QUIT', function(msg) {
	ircEvents.emit('protocol:quitCommand', protocolGeneric(msg, {
		quitMessage: msg.text
	}));
});

ircEvents.on('cmd:SETNAME', function(msg) {
	ircEvents.emit('protocol:setnameCommand', protocolGeneric(msg, {
		newRealname: msg.text
	}));
});

ircEvents.on('cmd:TAGMSG', function(msg) {
	// TAGMSG is currently side-effect-only via tag handling subsystem
});

ircEvents.on('cmd:TOPIC', function(msg) {
	ircEvents.emit('protocol:topicCommand', protocolGeneric(msg, {
		channelName: msg.args[0] || '',
		topic: msg.text
	}));
});

// ============================================================================
// NUMERIC HANDLERS
// ============================================================================

ircEvents.on('cmd:001', function(msg) {	// RPL_WELCOME
	ircEvents.emit('protocol:rplWelcome', protocolGeneric(msg, {
		welcomeTarget: msg.args[0] || '',
		message: msg.text
	}));
});

// 002-004 empty handlers
ircEvents.on('cmd:002', function(msg) {	// RPL_YOURHOST
	ircEvents.emit('protocol:rplYourhost', protocolGeneric(msg, {
		hostTarget: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:003', function(msg) {	// RPL_CREATED
	ircEvents.emit('protocol:rplCreated', protocolGeneric(msg, {
		createdTarget: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:004', function(msg) {	// RPL_MYINFO
	ircEvents.emit('protocol:rplMyinfo', protocolGeneric(msg, {
		serverName: msg.args[0] || '',
		version: msg.args[1] || '',
		userModes: msg.args[2] || '',
		channelModes: msg.args[3] || ''
	}));
});

ircEvents.on('cmd:005', function(msg){	// RPL_ISUPPORT
	var params = msg.args.slice(0, msg.args.length - 1);
	ircEvents.emit('protocol:rplIsupport', protocolGeneric(msg, {
		target: params[0] || '',
		tokens: params.slice(1),
		message: msg.text
	}));
});

ircEvents.on('cmd:221', function(msg) {	// RPL_UMODES
	ircEvents.emit('protocol:rplUmodes', protocolGeneric(msg, {
		target: msg.args[0] || '',
		umodes: msg.args[1] || '',
		message: msg.text
	}));

});

ircEvents.on('cmd:300', function(msg) {	// RPL_NONE
	ircEvents.emit('protocol:rplNone', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:301', function(msg) {	// RPL_AWAY
	ircEvents.emit('protocol:rplAway', protocolGeneric(msg, {
		target: msg.args[0] || '',
		awayNick: msg.args[1] || '',
		awayMessage: msg.text
	}));
});

ircEvents.on('cmd:302', function(msg) {	// RPL_USERHOST
	ircEvents.emit('protocol:rplUserhost', protocolGeneric(msg, {
		target: msg.args[0] || '',
		reply: msg.args[1] || msg.text || ''
	}));
});
ircEvents.on('cmd:303', function(msg) {	// RPL_ISON
	ircEvents.emit('protocol:rplIson', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nicks: msg.text ? msg.text.split(' ') : []
	}));
});
ircEvents.on('cmd:304', function(msg) {	// RPL_TEXT
	ircEvents.emit('protocol:rplText', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:305', function(msg) {	// RPL_UNAWAY
	ircEvents.emit('protocol:rplUnaway', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:306', function(msg) {	// RPL_NOWAWAY
	ircEvents.emit('protocol:rplNowaway', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:307', function(msg) {	// RPL_WHOISREGNICK
	ircEvents.emit('protocol:rplWhoisregnick', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:308', function(msg) {	// RPL_RULESSTART
	ircEvents.emit('protocol:rplRulesstart', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:309', function(msg) {	// RPL_ENDOFRULES
	ircEvents.emit('protocol:rplEndofrules', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:310', function(msg) {	// RPL_WHOISHELPOP
	ircEvents.emit('protocol:rplWhoishelpop', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:311', function(msg) {	// RPL_WHOISUSER
	ircEvents.emit('protocol:rplWhoisuser', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		ident: msg.args[2] || '',
		host: msg.args[3] || '',
		realname: msg.text
	}));
});

ircEvents.on('cmd:312', function(msg) {	// RPL_WHOISSERVER
	ircEvents.emit('protocol:rplWhoisserver', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		server: msg.args[2] || '',
		serverInfo: msg.text
	}));
});

ircEvents.on('cmd:313', function(msg) {	// RPL_WHOISOPERATOR
	ircEvents.emit('protocol:rplWhoisoperator', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:314', function(msg){	// RPL_WHOWASUSER
	ircEvents.emit('protocol:rplWhowasuser', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		ident: msg.args[2] || '',
		host: msg.args[3] || '',
		realname: msg.text
	}));
});

ircEvents.on('cmd:315', function(msg){	// RPL_ENDOFWHO
	ircEvents.emit('protocol:rplEndofwho', protocolGeneric(msg, {
		target: msg.args[0] || '',
		query: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:317', function(msg) {	// RPL_WHOISIDLE
	ircEvents.emit('protocol:rplWhoisidle', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		idleSeconds: parseInt(msg.args[2], 10) || 0,
		signOn: parseInt(msg.args[3], 10) || 0,
		message: msg.text
	}));
});

ircEvents.on('cmd:318', function(msg) {	// RPL_ENDOFWHOIS
	ircEvents.emit('protocol:rplEndofwhois', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:319', function(msg) {	// RPL_WHOISCHANNELS
	ircEvents.emit('protocol:rplWhoischannels', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		channels: msg.text ? msg.text.split(' ') : []
	}));
});

ircEvents.on('cmd:320', function(msg) {	//RPL_WHOISSPECIAL
	ircEvents.emit('protocol:rplWhoisspecial', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:321', function(msg) {	// RPL_LISTSTART
	ircEvents.emit('protocol:rplListstart', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:322', function(msg) {	// RPL_LIST
	ircEvents.emit('protocol:rplList', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channel: msg.args[1] || '',
		visibleUsers: parseInt(msg.args[2], 10) || 0,
		topic: msg.text
	}));
});

ircEvents.on('cmd:323', function(msg){	// RPL_ENDOFLIST
	ircEvents.emit('protocol:rplEndoflist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:324', function(msg) {	// RPL_CHANNELMODEIS
	ircEvents.emit('protocol:rplChannelmodeis', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		modes: msg.args[2] || '',
		modeParams: msg.args.slice(3)
	}));
});

ircEvents.on('cmd:329', function(msg) {	// RPL_CREATIONTIME
	ircEvents.emit('protocol:rplCreationtime', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		creationTime: parseInt(msg.args[2], 10) || 0
	}));
});

ircEvents.on('cmd:330', function(msg) {	// RPL_WHOISLOGGEDIN
	ircEvents.emit('protocol:rplWhoisloggedin', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		account: msg.args[2] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:331', function(msg) {	// RPL_NOTOPIC
	ircEvents.emit('protocol:rplNotopic', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:332', function(msg) {	// RPL_TOPIC
	ircEvents.emit('protocol:rplTopic', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		topic: msg.text || ''
	}));
});

ircEvents.on('cmd:333', function(msg) {	// RPL_TOPICWHOTIME
	ircEvents.emit('protocol:rplTopicwhotime', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		setBy: msg.args[2] || '',
		setDate: parseInt(msg.args[3], 10) || 0
	}));
});

ircEvents.on('cmd:334', function(msg) {	// RPL_LISTSYNTAX
	ircEvents.emit('protocol:rplListsyntax', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:335', function(msg){	// RPL_WHOISBOT
	ircEvents.emit('protocol:rplWhoisbot', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:336', function(msg) {	// RPL_INVITELIST
	ircEvents.emit('protocol:rplInvitlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		usermask: msg.args[2] || '',
		setBy: msg.args[3] || '',
		setDate: parseInt(msg.args[4], 10) || 0
	}));
});
ircEvents.on('cmd:337', function(msg) {	// RPL_ENDOFINVITELIST
	ircEvents.emit('protocol:rplEndofinvitelist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:340', function(msg) {	// RPL_USERIP
	ircEvents.emit('protocol:rplUserip', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		userIp: msg.args[2] || ''
	}));
});

ircEvents.on('cmd:341', function(msg) {	// RPL_INVITING
	ircEvents.emit('protocol:rplInviting', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		channelName: msg.args[2] || ''
	}));
});

ircEvents.on('cmd:342', function(msg) {	// RPL_SUMMONING
	ircEvents.emit('protocol:rplSummoning', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:344', function(msg) {	// RPL_WHOISCOUNTRY
	ircEvents.emit('protocol:rplWhoiscountry', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		countryCode: msg.args[2] || '',
		countryName: msg.text
	}));
});

ircEvents.on('cmd:346', function(msg) {	// RPL_INVITELIST
	ircEvents.emit('protocol:rplInvitlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		usermask: msg.args[2] || '',
		setBy: msg.args[3] || '',
		setDate: parseInt(msg.args[4], 10) || 0
	}));
});

ircEvents.on('cmd:347', function(msg) {	// RPL_INVITELISTEND
	ircEvents.emit('protocol:rplInvitlistend', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:348', function(msg) {	// RPL_EXCEPTLIST
	ircEvents.emit('protocol:rplExceptlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		exceptionMask: msg.args[2] || '',
		setBy: msg.args[3] || '',
		setDate: parseInt(msg.args[4], 10) || 0
	}));
});

ircEvents.on('cmd:349', function(msg) {	// RPL_ENDOFEXCEPTLIST
	ircEvents.emit('protocol:rplEndofexceptlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:351', function(msg) {	// RPL_VERSION
	ircEvents.emit('protocol:rplVersion', protocolGeneric(msg, {
		target: msg.args[0] || '',
		version: msg.args[1] || '',
		debugLevel: msg.args[2] || '',
		comments: msg.text
	}));
});

ircEvents.on('cmd:352', function(msg) {	// RPL_WHOREPLY
	ircEvents.emit('protocol:rplWhoreply', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		ident: msg.args[2] || '',
		host: msg.args[3] || '',
		server: msg.args[4] || '',
		nick: msg.args[5] || '',
		flags: msg.args[6] || '',
		hopRealname: msg.text || ''
	}));
});

ircEvents.on('cmd:353', function(msg) {	// RPL_NAMREPLY
	ircEvents.emit('protocol:rplNamreply', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelType: msg.args[1] || '',
		channelName: msg.args[2] || '',
		names: msg.text ? msg.text.split(' ') : []
	}));
});

ircEvents.on('cmd:354', function(msg) {	// RPL_WHOSPCRPL (WHOX)
	// Field order depends on the format string used in the WHOX request
	// Check query type to determine field mapping
	var queryType = msg.args[1] || '';
	var data;

	if (queryType === '101') {
		// Our format "tuhanfr,101" requested: token, ident, host, account, nick, flags, realname
		// But server actually returns: token, ident, host, nick, flags, account, realname
		// Server appears to reorder fields: tuhnfar instead of tuhanfr
		data = {
			target: msg.args[0] || '',
			queryType: queryType,
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			nick: msg.args[4] || '',        // Server puts nick before account
			status: msg.args[5] || '',      // Status flags
			account: msg.args[6] || '',     // Account is after flags, not before nick
			realname: msg.args[7] || msg.text || '',
			gecos: msg.args[7] || msg.text || ''
		};
	} else {
		// Default/legacy format or other query types
		data = {
			target: msg.args[0] || '',
			queryType: queryType,
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			nick: msg.args[4] || '',
			status: msg.args[5] || '',
			account: msg.args[6] || '',
			realname: msg.text || '',
			gecos: msg.text || ''
		};
	}

	ircEvents.emit('protocol:rplWhospcrpl', protocolGeneric(msg, data));
});



ircEvents.on('cmd:366', function(msg) {	// RPL_ENDOFNAMES
	ircEvents.emit('protocol:rplEndofnames', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:367', function(msg) {	// RPL_BANLIST
	ircEvents.emit('protocol:rplBanlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		banmask: msg.args[2] || '',
		setBy: msg.args[3] || '',
		setAt: parseInt(msg.args[4], 10) || 0
	}));
});

ircEvents.on('cmd:368', function(msg) {	// RPL_ENDOFBANLIST
	ircEvents.emit('protocol:rplEndofbanlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:369', function(msg) {	// RPL_ENDOFWHOWAS
	ircEvents.emit('protocol:rplEndofwhowas', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:371', function(msg) {	// RPL_INFO
	ircEvents.emit('protocol:rplInfo', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:372', function(msg) {	// RPL_MOTD
	ircEvents.emit('protocol:rplMotd', protocolGeneric(msg, {
		target: msg.args[0] || '',
		line: msg.text
	}));
});

ircEvents.on('cmd:373', function(msg) {	// RPL_INFOSTART
	ircEvents.emit('protocol:rplInfostart', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:374', function(msg) {	// RPL_ENDOFINFO
	ircEvents.emit('protocol:rplEndofinfo', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:375', function(msg) {	// RPL_MOTDSTART
	ircEvents.emit('protocol:rplMotdstart', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:376', function(msg) {	// RPL_ENDOFMOTD
	ircEvents.emit('protocol:rplEndofmotd', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:378', function(msg) {	// RPL_WHOISHOST - not displaying hostname
	ircEvents.emit('protocol:rplWhoishost', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		host: msg.text
	}));
});
ircEvents.on('cmd:379', function(msg) {	// RPL_WHOISMODES - not displaying modes
	ircEvents.emit('protocol:rplWhoismodes', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		modes: msg.text
	}));
});

// Empty handlers 381-395
ircEvents.on('cmd:381', function(msg) {	// RPL_YOUREOPER
	ircEvents.emit('protocol:rplYoureoper', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:382', function(msg) {	// RPL_REHASHING
	ircEvents.emit('protocol:rplRehashing', protocolGeneric(msg, {
		target: msg.args[0] || '',
		configFile: msg.args[1] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:383', function(msg) {	// RPL_YOURESERVICE
	ircEvents.emit('protocol:rplYoureservice', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:384', function(msg) {	// RPL_MYPORTIS
	ircEvents.emit('protocol:rplMyportis', protocolGeneric(msg, {
		target: msg.args[0] || '',
		port: msg.args[1] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:385', function(msg) {	// RPL_NOTOPERANYMORE
	ircEvents.emit('protocol:rplNotoperanymore', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:386', function(msg) {	// RPL_QLIST
	ircEvents.emit('protocol:rplQlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		mask: msg.args[2] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:387', function(msg) {	// RPL_ENDOFQLIST
	ircEvents.emit('protocol:rplEndofqlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:388', function(msg) {	// RPL_ALIST
	ircEvents.emit('protocol:rplAlist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		mask: msg.args[2] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:389', function(msg) {	// RPL_ENDOFALIST
	ircEvents.emit('protocol:rplEndofalist', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:391', function(msg) {	// RPL_TIME
	ircEvents.emit('protocol:rplTime', protocolGeneric(msg, {
		target: msg.args[0] || '',
		serverTime: msg.text
	}));
});
ircEvents.on('cmd:392', function(msg) {	// RPL_USERSSTART
	ircEvents.emit('protocol:rplUsersstart', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:393', function(msg) {	// RPL_USERS
	ircEvents.emit('protocol:rplUsers', protocolGeneric(msg, {
		target: msg.args[0] || '',
		username: msg.args[1] || '',
		tty: msg.args[2] || '',
		host: msg.args[3] || '',
		server: msg.args[4] || '',
		nick: msg.args[5] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:394', function(msg) {	// RPL_ENDOFUSERS
	ircEvents.emit('protocol:rplEndofusers', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});
ircEvents.on('cmd:395', function(msg) {	// RPL_NOUSERS
	ircEvents.emit('protocol:rplNousers', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:396', function(msg) {	// RPL_HOSTHIDDEN
	ircEvents.emit('protocol:rplHosthidden', protocolGeneric(msg, {
		target: msg.args[0] || '',
		hiddenHost: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:401', function(msg) {	// ERR_NOSUCHNICK
	ircEvents.emit('protocol:errNosuchnick', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:402', function(msg) {	// ERR_NOSUCHSERVER
	ircEvents.emit('protocol:errNosuchserver', protocolGeneric(msg, {
		target: msg.args[0] || '',
		serverName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:403', function(msg) {	// ERR_NOSUCHCHANNEL
	ircEvents.emit('protocol:errNosuchchannel', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});



ircEvents.on('cmd:404', function(msg) {	// ERR_CANNOTSENDTOCHAN
    var reasonText = msg.text;
    var parsedReason = '';

    if (reasonText.match(/You need voice \(\+v\) \(.*\)/)) {
        parsedReason = 'voiceNeeded';
    } else if (reasonText.match(/You are banned \(.*\)/)) {
        parsedReason = 'banned';
    } else if (reasonText.match(/Color is not permitted in this channel \(.*\)/)) {
        parsedReason = 'noColor';
    } else if (reasonText.match(/No external channel messages \(.*\)/)) {
        parsedReason = 'noExternal';
    } else if (reasonText.match(/You must have a registered nick \(\+r\) to talk on this channel \(.*\)/)) {
        parsedReason = 'accountNeeded';
    } else {
        parsedReason = 'generic'; // Default to generic if no specific match
    }

    ircEvents.emit('protocol:errCannotSendToChan', protocolGeneric(msg, {
        channelName: msg.args[1] || '',
        reason: parsedReason,
        message: msg.text // Keep raw message for detailed display if reason is generic
    }));
});

// 405 ERR_TOOMANYCHANNELS - falls through to cmdNotImplemented

ircEvents.on('cmd:406', function(msg) {	// ERR_WASNOSUCHNICK
	ircEvents.emit('protocol:errWasnosuchnick', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

// 407-410: ERR_TOOMANYTARGETS, ERR_NOSUCHSERVICE, ERR_NOORIGIN, ERR_INVALIDCAPCMD
// Fall through to cmdNotImplemented

ircEvents.on('cmd:411', function(msg) {	//ERR_NORECIPIENT
	ircEvents.emit('protocol:errNorecipient', protocolGeneric(msg, {
		target: msg.args[0] || '',
		command: msg.args[1] || '',
		message: msg.text
	}));
});

// 412-431: Various errors - fall through to cmdNotImplemented
// ERR_NOTEXTTOSEND, ERR_NOTOPLEVEL, ERR_WILDTOPLEVEL, ERR_TOOMANYMATCHES,
// ERR_UNKNOWNCOMMAND, ERR_NOMOTD, ERR_NOADMININFO, ERR_FILEERROR,
// ERR_NOOPERMOTD, ERR_TOOMANYAWAY, ERR_NONICKNAMEGIVEN

ircEvents.on('cmd:432', function(msg) {	// ERR_ERRONEUSNICKNAME
	ircEvents.emit('protocol:errErroneusnickname', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:433', function(msg) {	// ERR_NICKNAMEINUSE
	ircEvents.emit('protocol:errNicknameinuse', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

// 434-441: Various errors - fall through to cmdNotImplemented
// ERR_NORULES, ERR_SERVICECONFUSED, ERR_NICKCOLLISION, ERR_BANNICKCHANGE,
// ERR_NCHANGETOOFAST, ERR_TARGETTOOFAST, ERR_SERVICESDOWN, ERR_USERNOTINCHANNEL

ircEvents.on('cmd:442', function(msg) {	// ERR_NOTONCHANNEL
	ircEvents.emit('protocol:errNotonchannel', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:443', function(msg) {	// ERR_USERONCHANNEL
	ircEvents.emit('protocol:errUseronchannel', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		channelName: msg.args[2] || '',
		message: msg.text
	}));
});

// 444-446: ERR_NOLOGIN, ERR_SUMMONDISABLED, ERR_USERSDISABLED - fall through to cmdNotImplemented

ircEvents.on('cmd:447', function(msg) {	// ERR_NONICKCHANGE
	ircEvents.emit('protocol:errNonickchange', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

// 448-464: Various errors - fall through to cmdNotImplemented
// ERR_FORBIDDENCHANNEL, ERR_NOTREGISTERED, ERR_HOSTILENAME, ERR_NOHIDING,
// ERR_NOTFORHALFOPS, ERR_NEEDMOREPARAMS, ERR_ALREADYREGISTRED, ERR_NOPERMFORHOST, ERR_PASSWDMISMATCH





ircEvents.on('cmd:465', function(msg) {	// ERR_YOUREBANNEDCREEP
    ircEvents.emit('protocol:errYoureBannedCreep', protocolGeneric(msg, {
        message: msg.text // Pass the message for the domain/UI to handle
    }));
});


ircEvents.on('cmd:472', function(msg) {	// ERR_UNKNOWNMODE
	ircEvents.emit('protocol:errUnknownmode', protocolGeneric(msg, {
		target: msg.args[0] || '',
		mode: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:473', function(msg) {	// ERR_INVITEONLYCHAN
	ircEvents.emit('protocol:errInviteonlychan', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:474', function(msg) {	// ERR_BANNEDFROMCHAN
	ircEvents.emit('protocol:errBannedfromchan', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:475', function(msg) {	// ERR_BADCHANNELKEY
	ircEvents.emit('protocol:errBadchannelkey', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:477', function(msg) {	// ERR_NEEDREGGEDNICK
	ircEvents.emit('protocol:errNeedreggednick', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});



ircEvents.on('cmd:480', function(msg) {	// ERR_CANNOTKNOCK
	ircEvents.emit('protocol:errCannotknock', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:481', function(msg) {	// ERR_NOPRIVILEGES
	ircEvents.emit('protocol:errNoprivileges', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:482', function(msg) {	// ERR_CHANOPRIVSNEEDED
	ircEvents.emit('protocol:errChanoprivsneeded', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:486', function(msg) {	// ERR_NONONREG
	ircEvents.emit('protocol:errNononreg', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});



ircEvents.on('cmd:489', function(msg) {	// ERR_SECUREONLYCHAN
	ircEvents.emit('protocol:errSecureonlychan', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});



ircEvents.on('cmd:499', function(msg) {	// ERR_CHANOWNPRIVNEEDED
	ircEvents.emit('protocol:errChanownprivneeded', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});



ircEvents.on('cmd:531', function(msg) {	// ERR_CANTSENDTOUSER
	ircEvents.emit('protocol:errCantsendtouser', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});



ircEvents.on('cmd:671', function(msg) {	// RPL_WHOISSECURE
	ircEvents.emit('protocol:rplWhoissecure', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:742', function(msg) {	// ERR_MLOCKRESTRICTED
	ircEvents.emit('protocol:errMlockrestricted', protocolGeneric(msg, {
		target: msg.args[0] || '',
		channelName: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:761', function(msg){	// RPL_KEYVALUE
	ircEvents.emit('protocol:rplKeyvalue', protocolGeneric(msg, {
		target: msg.args[0] || '',
		key: msg.args[1] || '',
		value: msg.args[2] || msg.text || ''
	}));
});
ircEvents.on('cmd:762', function(msg){	// RPL_METADATAEND
	ircEvents.emit('protocol:rplMetadataend', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:766', function(msg){	// RPL_KEYNOTSET (draft/metadata-2)
	ircEvents.emit('protocol:rplKeynotset', protocolGeneric(msg, {
		target: msg.args[0] || '',
		key: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:770', function(msg){	// RPL_METADATASUBOK
	ircEvents.emit('protocol:rplMetadatasubok', protocolGeneric(msg, {
		target: msg.args[0] || '',
		key: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:774', function(msg){	//ERR_METADATASYNCLATER
	var delayMs = 0;
	if (msg.args[1]) {
		delayMs = parseInt(msg.args[1], 10) * 1000 || 0;
	}
	ircEvents.emit('protocol:errMetadatasynclater', protocolGeneric(msg, {
		target: msg.args[0] || '',
		delayMs: delayMs,
		message: msg.text
	}));
});

ircEvents.on('cmd:900', function(msg) {	// RPL_LOGGEDIN
	ircEvents.emit('protocol:rplLoggedin', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		account: msg.args[2] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:901', function(msg) {	// RPL_LOGGEDOUT
	ircEvents.emit('protocol:rplLoggedout', protocolGeneric(msg, {
		target: msg.args[0] || '',
		nick: msg.args[1] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:903', function(msg) {	// RPL_SASLSUCCESS
	ircEvents.emit('protocol:rplSaslsuccess', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:904', function(msg) {	// ERR_SASLFAIL
	ircEvents.emit('protocol:errSaslfail', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:906', function(msg) {	// ERR_SASLABORTED
	ircEvents.emit('protocol:errSaslaborted', protocolGeneric(msg, {
		target: msg.args[0] || '',
		message: msg.text
	}));
});

ircEvents.on('cmd:972', function(msg) {	// ERR_CANNOTDOCOMMAND
    ircEvents.emit('protocol:errCannotDoCommand', protocolGeneric(msg, {
        target: msg.args[1] || '',
        message: msg.text // Pass the raw message for domain/UI to handle details
    }));
});

ircEvents.on('cmd:974', function(msg) {	// ERR_CANNOTCHANGECHANMODE
    ircEvents.emit('protocol:errCannotChangeChanMode', protocolGeneric(msg, {
        target: msg.args[1] || '',
        message: msg.text // Pass the raw message for domain/UI to handle details
    }));
});





// ============================================================================
// CTCP HANDLERS
// ============================================================================

ircEvents.on('ctcp:ACTION', function(msg){
	ircEvents.emit('protocol:ctcpAction', protocolGeneric(msg, {
		target: msg.args[0] || '',
		text: msg.ctcptext || ''
	}));
});

ircEvents.on('ctcp:VERSION', function(msg){
	ircEvents.emit('protocol:ctcpVersionRequest', protocolGeneric(msg, {
		target: msg.args[0] || '',
		requestedBy: msg.sender.nick
	}));
});

ircEvents.on('ctcp:USERINFO', function(msg){
	ircEvents.emit('protocol:ctcpUserinfoRequest', protocolGeneric(msg, {
		target: msg.args[0] || '',
		requestedBy: msg.sender.nick
	}));
});

ircEvents.on('ctcp:REFERER', function(msg){
	ircEvents.emit('protocol:ctcpRefererRequest', protocolGeneric(msg, {
		target: msg.args[0] || '',
		requestedBy: msg.sender.nick
	}));
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function cmdNotImplemented(msg){
	// The protocol layer emits a raw event for unhandled messages.
	// The domain or UI layers will then decide how to interpret and display this.
	ircEvents.emit('protocol:unhandledMessage', {
		command: msg.command,
		args: msg.args,
		text: msg.text,
		time: msg.time,
		sender: msg.sender // Include sender for full context
	});
}
