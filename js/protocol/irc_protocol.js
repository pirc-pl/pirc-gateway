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

function registerProtocolHandlers(events, chat, transport) {

	// Label generation delegates to chat.generateLabel() so all outgoing
	// labeled commands share one counter and labels never collide.
	function generateLabel() { return chat.generateLabel(); }

	// ============================================================================
	// IRC SEND HELPER (builds and sends a full IRC command string)
	// ============================================================================

	function escapeTagValue(value) {
		if (typeof value !== 'string') value = String(value);
		return value
			.replace(/\\/g, '\\')
			.replace(/;/g, '\\:')
			.replace(/ /g, '\\s')
			.replace(/\r/g, '\\r')
			.replace(/\n/g, '\\n');
	}

	/**
	 * Build and send an IRC line.
	 * @param {string}        command
	 * @param {string[]}      [args]
	 * @param {string}        [text]   - appended as ":text"
	 * @param {Object}        [tags]   - message-tags (sent only if message-tags cap active)
	 */
	function sendIrc(command, args, tags) {
		let cmdString = '';
		if (tags && ('message-tags' in chat.activeCaps)) {
			cmdString += '@';
			let first = true;
			for (const [tagName, tagValue] of Object.entries(tags)) {
				if (!first) cmdString += ';';
				first = false;
				cmdString += tagName;
				if (tagValue !== null && tagValue !== undefined && tagValue !== '') {
					cmdString += `=${escapeTagValue(tagValue)}`;
				}
			}
			cmdString += ' ';
		}
		if (!command) {
			if ('message-tags' in chat.activeCaps) {
				command = 'TAGMSG';
			} else return;
		}
		cmdString += command;
		if (args && args.length > 0) {
			for (let i = 0; i < args.length - 1; i++) cmdString += ` ${args[i]}`;
			cmdString += ` :${args[args.length - 1]}`;
		}
		transport.send(cmdString);
	}

	// ============================================================================
	// HELPER FUNCTIONS
	// ============================================================================

	/**
 * Merges IRC message data with command-specific properties
 *
 * This function creates protocol events for the chat layer by copying
 * all message properties to the top level. ChatIntegrator handlers should access
 * data.user, data.time, etc. directly - NOT via data.raw.
 *
 * @param {Object} msg - The base IRC message object
 * @param {Object} additionalData - Command-specific properties to add
 * @returns {Object} Merged object with all properties
 */
	function isChannelName(name) {
		const chantypes = (chat.isupport && chat.isupport.CHANTYPES) || '#&';
		return name && chantypes.indexOf(name.charAt(0)) !== -1;
	}

	function protocolGeneric(msg, additionalData) {
		const result = Object.assign({}, msg);
		if (additionalData) {
			Object.assign(result, additionalData);
		}
		return result;
	}

	// ============================================================================
	// COMMAND HANDLERS
	// ============================================================================

	events.on('cmd:ACCOUNT', (msg) => {
		events.emit('protocol:accountCommand', protocolGeneric(msg, {
			account: msg.args[0] || null
		}));
	});

	events.on('cmd:ACK', (msg) => {
		events.emit('protocol:ackCommand', protocolGeneric(msg, {
			ackedLabel: (msg.tags && msg.tags['label']) || null
		}));
	});

	events.on('cmd:AUTHENTICATE', (msg) => {
		events.emit('protocol:authenticateCommand', protocolGeneric(msg, {
			challenge: msg.args[0] || ''
		}));
	});

	events.on('cmd:AWAY', (msg) => {
		events.emit('protocol:awayCommand', protocolGeneric(msg, {
			awayMessage: msg.args[0]
		}));
	});

	events.on('cmd:BATCH', (msg) => {
		const batchIdRaw = msg.args[0] || '';
		const prefix = batchIdRaw.charAt(0);
		const batchId = batchIdRaw.substring(1); // Strip +/- prefix

		events.emit('protocol:batchCommand', protocolGeneric(msg, {
			batchId: batchId, // ID without prefix
			isStart: prefix === '+',
			isEnd: prefix === '-',
			batchType: msg.args[1] || '',
			batchArgs: msg.args.slice(2)
		}));
	});



	events.on('cmd:CAP', (msg) => {
		const isMultiLine = (msg.args[2] === '*');
		const capText = (isMultiLine ? msg.args[3] : msg.args[2]) || '';
		const caps = capText.split(' ').filter((c) => { return c.length > 0; });

		// For ACK/NAK, parse each cap to determine if it's being enabled (+) or disabled (-)
		const parsedCaps = caps.map((cap) => {
			if (cap.charAt(0) === '-') {
				return { name: cap.substring(1), enabled: false };
			} else {
				return { name: cap, enabled: true };
			}
		});

		events.emit('protocol:capCommand', protocolGeneric(msg, {
			subcommand: msg.args[1] || '',
			capText: capText, // Keep raw for LS/LIST parsing
			caps: parsedCaps, // Structured list with enable/disable info
			isMultiLine: isMultiLine
		}));
	});

	events.on('cmd:CHGHOST', (msg) => {
		events.emit('protocol:chghostCommand', protocolGeneric(msg, {
			newIdent: msg.args[0] || '',
			newHost: msg.args[1] || ''
		}));
	});

	events.on('cmd:FAIL', (msg) => {
		events.emit('protocol:failCommand', protocolGeneric(msg, {
			failedCommand: msg.args[0] || '',
			failCode: msg.args[1] || '',
			description: msg.args[2]
		}));
	});

	events.on('cmd:ERROR', (msg) => {
		events.emit('protocol:errorCommand', protocolGeneric(msg, {
			message: msg.args[0]
		}));
	});

	events.on('cmd:KILL', (msg) => {
		events.emit('protocol:killCommand', protocolGeneric(msg, {
			killerNick: msg.sender.nick,
			targetNick: msg.args[0],
			reason: msg.args[1]
		}));
	});

	events.on('cmd:EXTJWT', (msg) => {
		events.emit('protocol:extjwtCommand', protocolGeneric(msg));
	});

	events.on('cmd:INVITE', (msg) => {
		events.emit('protocol:inviteCommand', protocolGeneric(msg, {
			targetNick: msg.args[0] || '',
			channelName: msg.args[1] || ''
		}));
	});

	events.on('cmd:JOIN', (msg) => {
		events.emit('protocol:joinCommand', protocolGeneric(msg, {
			channelName: msg.args[0] || ''
		}));
	});

	events.on('cmd:KICK', (msg) => {
		events.emit('protocol:kickCommand', protocolGeneric(msg, {
			channelName: msg.args[0] || '',
			kickedNick: msg.args[1] || '',
			reason: msg.args[2]
		}));
	});

	events.on('cmd:METADATA', (msg) => {
		events.emit('protocol:metadataCommand', protocolGeneric(msg, {
			target: msg.args[0] || '',
			key: msg.args[1] || '',
			subCommand: msg.args[2] || '',
			value: msg.args[3] || ''
		}));
	});

	events.on('cmd:MODE', (msg) => {
		const target = msg.args[0] || '';
		const isChannel = isChannelName(target);

		events.emit('protocol:modeCommand', protocolGeneric(msg, {
			target: target,
			isChannel: isChannel,
			modes: msg.args[1] || '',
			modeArgs: msg.args.slice(2)
		}));
	});

	events.on('cmd:NICK', (msg) => {
		events.emit('protocol:nickCommand', protocolGeneric(msg, {
			newNick: msg.args[0] || ''
		}));
	});

	events.on('cmd:NOTICE', (msg) => {
		const target = msg.args[0] || '';
		const isChannel = isChannelName(target);

		// Check for CTCP reply (format: \x01TYPE optional text\x01)
		if (msg.args[1] && msg.args[1].match(/^\001.*\001$/i)) {
			const ctcpreg = msg.args[1].match(/^\001(([^ ]+)( (.*))?)\001$/i);
			if (ctcpreg) {
				const fullText = ctcpreg[1];     // "VERSION xchat 2.8.8"
				const ctcpType = ctcpreg[2];     // "VERSION"
				const ctcpText = ctcpreg[4] || ''; // "xchat 2.8.8"

				events.emit('protocol:ctcpReply', protocolGeneric(msg, {
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
		events.emit('protocol:noticeCommand', protocolGeneric(msg, {
			target: target,
			isChannel: isChannel,
			message: msg.args[1]
		}));
	});

	events.on('cmd:PING', (msg) => {
		// Server keepalive PING — respond immediately, never queue (stale PONGs break new sessions).
		const token = msg.args[0] || '';
		transport.forceSend(`PONG :${token}`);
	});

	events.on('cmd:PONG', (msg) => {
		events.emit('protocol:pongCommand', protocolGeneric(msg, {
			token: msg.args[0] || ''
		}));
	});

	events.on('cmd:PART', (msg) => {
		events.emit('protocol:partCommand', protocolGeneric(msg, {
			channelName: msg.args[0] || '',
			partMessage: msg.args[1]
		}));
	});

	events.on('cmd:PRIVMSG', (msg) => {
		const target = msg.args[0] || '';
		const isChannel = isChannelName(target);

		// Check for CTCP request (format: \x01TYPE optional text\x01)
		if (msg.args[1] && msg.args[1].match(/^\001.*\001$/i)) {
			const space = msg.args[1].indexOf(' ');
			let ctcpType, ctcpText;
			if (space > -1) {
				ctcpType = msg.args[1].substring(1, space);
				ctcpText = msg.args[1].substring(space + 1, msg.args[1].length - 1);
			} else {
				ctcpType = msg.args[1].slice(1, -1);
				ctcpText = '';
			}
			msg.ctcptext = ctcpText;

			// Emit specific CTCP event (e.g., ctcp:VERSION, ctcp:ACTION)
			events.emit(`ctcp:${  ctcpType}`, msg);
			return; // Don't process as regular PRIVMSG
		}

		// Regular PRIVMSG (not CTCP)
		// Emit protocol event for chat layer processing
		// ChatIntegrator will emit abstracted message:received event for display
		events.emit('protocol:privmsgCommand', protocolGeneric(msg, {
			target: target,
			dest: target,
			text: msg.args[1],
			isChannel: isChannel,
			message: msg.args[1],
			tags: msg.tags,
			sender: msg.user,
			time: msg.time
		}));

	// Display is now handled by chat layer via message:received event
	// gateway.insertMessage('PRIVMSG', target, msg.args[1], false, false, msg.tags, msg.user, msg.time);
	});

	events.on('cmd:QUIT', (msg) => {
		events.emit('protocol:quitCommand', protocolGeneric(msg, {
			quitMessage: msg.args[0]
		}));
	});

	events.on('cmd:SETNAME', (msg) => {
		events.emit('protocol:setnameCommand', protocolGeneric(msg, {
			newRealname: msg.args[0]
		}));
	});

	events.on('cmd:TAGMSG', (msg) => {
	// TAGMSG is currently side-effect-only via tag handling subsystem
	});

	events.on('cmd:TOPIC', (msg) => {
		events.emit('protocol:topicCommand', protocolGeneric(msg, {
			channelName: msg.args[0] || '',
			topic: msg.args[1]
		}));
	});

	// ============================================================================
	// NUMERIC HANDLERS
	// ============================================================================

	events.on('cmd:001', (msg) => {	// RPL_WELCOME
		events.emit('protocol:rplWelcome', protocolGeneric(msg, {
			welcomeTarget: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	// 002-004 empty handlers
	events.on('cmd:002', (msg) => {	// RPL_YOURHOST
		events.emit('protocol:rplYourhost', protocolGeneric(msg, {
			hostTarget: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:003', (msg) => {	// RPL_CREATED
		events.emit('protocol:rplCreated', protocolGeneric(msg, {
			createdTarget: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:004', (msg) => {	// RPL_MYINFO
		events.emit('protocol:rplMyinfo', protocolGeneric(msg, {
			serverName: msg.args[0] || '',
			version: msg.args[1] || '',
			userModes: msg.args[2] || '',
			channelModes: msg.args[3] || ''
		}));
	});

	events.on('cmd:005', (msg) => {	// RPL_ISUPPORT
		const params = msg.args.slice(0, msg.args.length - 1);
		events.emit('protocol:rplIsupport', protocolGeneric(msg, {
			target: params[0] || '',
			tokens: params.slice(1),
			message: msg.args[0]
		}));
	});

	events.on('cmd:221', (msg) => {	// RPL_UMODES
		events.emit('protocol:rplUmodes', protocolGeneric(msg, {
			target: msg.args[0] || '',
			umodes: msg.args[1] || '',
			message: msg.args[2]
		}));

	});

	events.on('cmd:300', (msg) => {	// RPL_NONE
		events.emit('protocol:rplNone', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:301', (msg) => {	// RPL_AWAY
		events.emit('protocol:rplAway', protocolGeneric(msg, {
			target: msg.args[0] || '',
			awayNick: msg.args[1] || '',
			awayMessage: msg.args[2]
		}));
	});

	events.on('cmd:302', (msg) => {	// RPL_USERHOST
		events.emit('protocol:rplUserhost', protocolGeneric(msg, {
			target: msg.args[0] || '',
			reply: msg.args[1] || ''
		}));
	});
	events.on('cmd:303', (msg) => {	// RPL_ISON
		events.emit('protocol:rplIson', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nicks: msg.args[1] ? msg.args[1].split(' ') : []
		}));
	});
	events.on('cmd:304', (msg) => {	// RPL_TEXT
		events.emit('protocol:rplText', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:305', (msg) => {	// RPL_UNAWAY
		events.emit('protocol:rplUnaway', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:306', (msg) => {	// RPL_NOWAWAY
		events.emit('protocol:rplNowaway', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:307', (msg) => {	// RPL_WHOISREGNICK
		events.emit('protocol:rplWhoisregnick', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:308', (msg) => {	// RPL_RULESSTART
		events.emit('protocol:rplRulesstart', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:309', (msg) => {	// RPL_ENDOFRULES
		events.emit('protocol:rplEndofrules', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:310', (msg) => {	// RPL_WHOISHELPOP
		events.emit('protocol:rplWhoishelpop', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:311', (msg) => {	// RPL_WHOISUSER
		events.emit('protocol:rplWhoisuser', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			realname: msg.args[5]
		}));
	});

	events.on('cmd:312', (msg) => {	// RPL_WHOISSERVER
		events.emit('protocol:rplWhoisserver', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			server: msg.args[2] || '',
			serverInfo: msg.args[3]
		}));
	});

	events.on('cmd:313', (msg) => {	// RPL_WHOISOPERATOR
		events.emit('protocol:rplWhoisoperator', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:314', (msg) => {	// RPL_WHOWASUSER
		events.emit('protocol:rplWhowasuser', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			realname: msg.args[5]
		}));
	});

	events.on('cmd:315', (msg) => {	// RPL_ENDOFWHO
		events.emit('protocol:rplEndofwho', protocolGeneric(msg, {
			target: msg.args[0] || '',
			query: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:317', (msg) => {	// RPL_WHOISIDLE
		events.emit('protocol:rplWhoisidle', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			idleSeconds: parseInt(msg.args[2], 10) || 0,
			signOn: parseInt(msg.args[3], 10) || 0,
			message: msg.args[4]
		}));
	});

	events.on('cmd:318', (msg) => {	// RPL_ENDOFWHOIS
		events.emit('protocol:rplEndofwhois', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:319', (msg) => {	// RPL_WHOISCHANNELS
		events.emit('protocol:rplWhoischannels', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			channels: msg.args[2] ? msg.args[2].split(' ') : []
		}));
	});

	events.on('cmd:320', (msg) => {	//RPL_WHOISSPECIAL
		events.emit('protocol:rplWhoisspecial', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:321', (msg) => {	// RPL_LISTSTART
		events.emit('protocol:rplListstart', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:322', (msg) => {	// RPL_LIST
		events.emit('protocol:rplList', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channel: msg.args[1] || '',
			visibleUsers: parseInt(msg.args[2], 10) || 0,
			topic: msg.args[3]
		}));
	});

	events.on('cmd:323', (msg) => {	// RPL_ENDOFLIST
		events.emit('protocol:rplEndoflist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:324', (msg) => {	// RPL_CHANNELMODEIS
		events.emit('protocol:rplChannelmodeis', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			modes: msg.args[2] || '',
			modeParams: msg.args.slice(3)
		}));
	});

	events.on('cmd:329', (msg) => {	// RPL_CREATIONTIME
		events.emit('protocol:rplCreationtime', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			creationTime: parseInt(msg.args[2], 10) || 0
		}));
	});

	events.on('cmd:330', (msg) => {	// RPL_WHOISLOGGEDIN
		events.emit('protocol:rplWhoisloggedin', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			account: msg.args[2] || '',
			message: msg.args[3]
		}));
	});

	events.on('cmd:331', (msg) => {	// RPL_NOTOPIC
		events.emit('protocol:rplNotopic', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:332', (msg) => {	// RPL_TOPIC
		events.emit('protocol:rplTopic', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			topic: msg.args[2] || ''
		}));
	});

	events.on('cmd:333', (msg) => {	// RPL_TOPICWHOTIME
		events.emit('protocol:rplTopicwhotime', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			setBy: msg.args[2] || '',
			setDate: parseInt(msg.args[3], 10) || 0
		}));
	});

	events.on('cmd:334', (msg) => {	// RPL_LISTSYNTAX
		events.emit('protocol:rplListsyntax', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:335', (msg) => {	// RPL_WHOISBOT
		events.emit('protocol:rplWhoisbot', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:336', (msg) => {	// RPL_INVITELIST
		events.emit('protocol:rplInvitlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			usermask: msg.args[2] || '',
			setBy: msg.args[3] || '',
			setDate: parseInt(msg.args[4], 10) || 0
		}));
	});
	events.on('cmd:337', (msg) => {	// RPL_ENDOFINVITELIST
		events.emit('protocol:rplEndofinvitelist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});
	events.on('cmd:340', (msg) => {	// RPL_USERIP
		events.emit('protocol:rplUserip', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			userIp: msg.args[2] || ''
		}));
	});

	events.on('cmd:341', (msg) => {	// RPL_INVITING
		events.emit('protocol:rplInviting', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			channelName: msg.args[2] || ''
		}));
	});

	events.on('cmd:342', (msg) => {	// RPL_SUMMONING
		events.emit('protocol:rplSummoning', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:344', (msg) => {	// RPL_WHOISCOUNTRY
		events.emit('protocol:rplWhoiscountry', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			countryCode: msg.args[2] || '',
			countryName: msg.args[3]
		}));
	});

	events.on('cmd:346', (msg) => {	// RPL_INVITELIST
		events.emit('protocol:rplInvitlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			usermask: msg.args[2] || '',
			setBy: msg.args[3] || '',
			setDate: parseInt(msg.args[4], 10) || 0
		}));
	});

	events.on('cmd:347', (msg) => {	// RPL_INVITELISTEND
		events.emit('protocol:rplEndofinvitelist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:348', (msg) => {	// RPL_EXCEPTLIST
		events.emit('protocol:rplExceptlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			exceptionMask: msg.args[2] || '',
			setBy: msg.args[3] || '',
			setDate: parseInt(msg.args[4], 10) || 0
		}));
	});

	events.on('cmd:349', (msg) => {	// RPL_ENDOFEXCEPTLIST
		events.emit('protocol:rplEndofexceptlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:351', (msg) => {	// RPL_VERSION
		events.emit('protocol:rplVersion', protocolGeneric(msg, {
			target: msg.args[0] || '',
			version: msg.args[1] || '',
			debugLevel: msg.args[2] || '',
			comments: msg.args[3]
		}));
	});

	events.on('cmd:352', (msg) => {	// RPL_WHOREPLY
		events.emit('protocol:rplWhoreply', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			server: msg.args[4] || '',
			nick: msg.args[5] || '',
			flags: msg.args[6] || '',
			hopRealname: msg.args[7] || ''
		}));
	});

	events.on('cmd:353', (msg) => {	// RPL_NAMREPLY
		events.emit('protocol:rplNamreply', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelType: msg.args[1] || '',
			channelName: msg.args[2] || '',
			names: msg.args[3] ? msg.args[3].split(' ') : []
		}));
	});

	events.on('cmd:354', (msg) => {	// RPL_WHOSPCRPL (WHOX)
	// Field order depends on the format string used in the WHOX request
	// Check query type to determine field mapping
		const queryType = msg.args[1] || '';
		let data;

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
				realname: msg.args[7] || '',
				gecos: msg.args[7] || ''
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
				realname: msg.args[7] || '',
				gecos: msg.args[7] || ''
			};
		}

		events.emit('protocol:rplWhospcrpl', protocolGeneric(msg, data));
	});

	// Server admin numerics (361-365)
	events.on('cmd:361', (msg) => {	// RPL_ADMINME
		events.emit('protocol:rplAdminme', protocolGeneric(msg, {
			target: msg.args[0] || '',
			server: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:362', (msg) => {	// RPL_ADMINLOC1
		events.emit('protocol:rplAdminloc1', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:363', (msg) => {	// RPL_ADMINLOC2
		events.emit('protocol:rplAdminloc2', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:364', (msg) => {	// RPL_ADMINEMAIL
		events.emit('protocol:rplAdminemail', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:365', (msg) => {	// RPL_ENDOFADMIN
		events.emit('protocol:rplEndofadmin', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:366', (msg) => {	// RPL_ENDOFNAMES
		events.emit('protocol:rplEndofnames', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:367', (msg) => {	// RPL_BANLIST
		events.emit('protocol:rplBanlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			banmask: msg.args[2] || '',
			setBy: msg.args[3] || '',
			setAt: parseInt(msg.args[4], 10) || 0
		}));
	});

	events.on('cmd:368', (msg) => {	// RPL_ENDOFBANLIST
		events.emit('protocol:rplEndofbanlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:369', (msg) => {	// RPL_ENDOFWHOWAS
		events.emit('protocol:rplEndofwhowas', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:371', (msg) => {	// RPL_INFO
		events.emit('protocol:rplInfo', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:372', (msg) => {	// RPL_MOTD
		events.emit('protocol:rplMotd', protocolGeneric(msg, {
			target: msg.args[0] || '',
			line: msg.args[1]
		}));
	});

	events.on('cmd:373', (msg) => {	// RPL_INFOSTART
		events.emit('protocol:rplInfostart', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:374', (msg) => {	// RPL_ENDOFINFO
		events.emit('protocol:rplEndofinfo', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:375', (msg) => {	// RPL_MOTDSTART
		events.emit('protocol:rplMotdstart', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:376', (msg) => {	// RPL_ENDOFMOTD
		events.emit('protocol:rplEndofmotd', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:378', (msg) => {	// RPL_WHOISHOST - not displaying hostname
		events.emit('protocol:rplWhoishost', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			host: msg.args[2]
		}));
	});
	events.on('cmd:379', (msg) => {	// RPL_WHOISMODES - not displaying modes
		events.emit('protocol:rplWhoismodes', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			modes: msg.args[2]
		}));
	});

	// Empty handlers 381-395
	events.on('cmd:381', (msg) => {	// RPL_YOUREOPER
		events.emit('protocol:rplYoureoper', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:382', (msg) => {	// RPL_REHASHING
		events.emit('protocol:rplRehashing', protocolGeneric(msg, {
			target: msg.args[0] || '',
			configFile: msg.args[1] || '',
			message: msg.args[2]
		}));
	});
	events.on('cmd:383', (msg) => {	// RPL_YOURESERVICE
		events.emit('protocol:rplYoureservice', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:384', (msg) => {	// RPL_MYPORTIS
		events.emit('protocol:rplMyportis', protocolGeneric(msg, {
			target: msg.args[0] || '',
			port: msg.args[1] || '',
			message: msg.args[2]
		}));
	});
	events.on('cmd:385', (msg) => {	// RPL_NOTOPERANYMORE
		events.emit('protocol:rplNotoperanymore', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	// RPL_QLIST (386) and RPL_ENDOFQLIST (387) - Quiet list not supported
	// Only ban (b), except (e), and invex (I) lists are implemented
	events.on('cmd:388', (msg) => {	// RPL_ALIST
		events.emit('protocol:rplAlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			mask: msg.args[2] || '',
			message: msg.args[3]
		}));
	});
	events.on('cmd:389', (msg) => {	// RPL_ENDOFALIST
		events.emit('protocol:rplEndofalist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:391', (msg) => {	// RPL_TIME
		events.emit('protocol:rplTime', protocolGeneric(msg, {
			target: msg.args[0] || '',
			serverTime: msg.args[1]
		}));
	});
	events.on('cmd:392', (msg) => {	// RPL_USERSSTART
		events.emit('protocol:rplUsersstart', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:393', (msg) => {	// RPL_USERS
		events.emit('protocol:rplUsers', protocolGeneric(msg, {
			target: msg.args[0] || '',
			username: msg.args[1] || '',
			tty: msg.args[2] || '',
			host: msg.args[3] || '',
			server: msg.args[4] || '',
			nick: msg.args[5] || '',
			message: msg.args[6]
		}));
	});
	events.on('cmd:394', (msg) => {	// RPL_ENDOFUSERS
		events.emit('protocol:rplEndofusers', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});
	events.on('cmd:395', (msg) => {	// RPL_NOUSERS
		events.emit('protocol:rplNousers', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:396', (msg) => {	// RPL_HOSTHIDDEN
		events.emit('protocol:rplHosthidden', protocolGeneric(msg, {
			target: msg.args[0] || '',
			hiddenHost: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:401', (msg) => {	// ERR_NOSUCHNICK
		events.emit('protocol:errNosuchnick', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:402', (msg) => {	// ERR_NOSUCHSERVER
		events.emit('protocol:errNosuchserver', protocolGeneric(msg, {
			target: msg.args[0] || '',
			serverName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:403', (msg) => {	// ERR_NOSUCHCHANNEL
		events.emit('protocol:errNosuchchannel', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});



	events.on('cmd:404', (msg) => {	// ERR_CANNOTSENDTOCHAN
		const reasonText = msg.args[2];
		let parsedReason = '';

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

		events.emit('protocol:errCannotSendToChan', protocolGeneric(msg, {
			channelName: msg.args[1] || '',
			reason: parsedReason,
			message: msg.args[2] // Keep raw message for detailed display if reason is generic
		}));
	});

	// 405 ERR_TOOMANYCHANNELS - falls through to cmdNotImplemented

	events.on('cmd:406', (msg) => {	// ERR_WASNOSUCHNICK
		events.emit('protocol:errWasnosuchnick', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// 407-410: ERR_TOOMANYTARGETS, ERR_NOSUCHSERVICE, ERR_NOORIGIN, ERR_INVALIDCAPCMD
	// Fall through to cmdNotImplemented

	events.on('cmd:411', (msg) => {	//ERR_NORECIPIENT
		events.emit('protocol:errNorecipient', protocolGeneric(msg, {
			target: msg.args[0] || '',
			command: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// 412-431: Various errors - fall through to cmdNotImplemented
	// ERR_NOTEXTTOSEND, ERR_NOTOPLEVEL, ERR_WILDTOPLEVEL, ERR_TOOMANYMATCHES,
	// ERR_UNKNOWNCOMMAND, ERR_NOMOTD, ERR_NOADMININFO, ERR_FILEERROR,
	// ERR_NOOPERMOTD, ERR_TOOMANYAWAY, ERR_NONICKNAMEGIVEN

	events.on('cmd:432', (msg) => {	// ERR_ERRONEUSNICKNAME
		events.emit('protocol:errErroneusnickname', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:433', (msg) => {	// ERR_NICKNAMEINUSE
		events.emit('protocol:errNicknameinuse', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// 434-441: Various errors - fall through to cmdNotImplemented
	// ERR_NORULES, ERR_SERVICECONFUSED, ERR_NICKCOLLISION, ERR_BANNICKCHANGE,
	// ERR_NCHANGETOOFAST, ERR_TARGETTOOFAST, ERR_SERVICESDOWN, ERR_USERNOTINCHANNEL

	events.on('cmd:442', (msg) => {	// ERR_NOTONCHANNEL
		events.emit('protocol:errNotonchannel', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:443', (msg) => {	// ERR_USERONCHANNEL
		events.emit('protocol:errUseronchannel', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			channelName: msg.args[2] || '',
			message: msg.args[3]
		}));
	});

	// 444-446: ERR_NOLOGIN, ERR_SUMMONDISABLED, ERR_USERSDISABLED - fall through to cmdNotImplemented

	events.on('cmd:447', (msg) => {	// ERR_NONICKCHANGE
		events.emit('protocol:errNonickchange', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// 448-464: Various errors - fall through to cmdNotImplemented
	// ERR_FORBIDDENCHANNEL, ERR_NOTREGISTERED, ERR_HOSTILENAME, ERR_NOHIDING,
	// ERR_NOTFORHALFOPS, ERR_NEEDMOREPARAMS, ERR_ALREADYREGISTRED, ERR_NOPERMFORHOST, ERR_PASSWDMISMATCH





	events.on('cmd:465', (msg) => {	// ERR_YOUREBANNEDCREEP
		events.emit('protocol:errYoureBannedCreep', protocolGeneric(msg, {
			message: msg.args[1] // Pass the message for the chat/UI to handle
		}));
	});

	// Error numerics 466-471
	events.on('cmd:466', (msg) => {	// ERR_YOUWILLBEBANNED
		events.emit('protocol:errYouwillbebanned', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:467', (msg) => {	// ERR_KEYSET
		events.emit('protocol:errKeyset', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:468', (msg) => {	// ERR_INVALIDUSERNAME
		events.emit('protocol:errInvalidusername', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:469', (msg) => {	// ERR_LINKSET
		events.emit('protocol:errLinkset', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:470', (msg) => {	// ERR_LINKCHANNEL
		events.emit('protocol:errLinkchannel', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			forwardChannel: msg.args[2] || '',
			message: msg.args[3]
		}));
	});

	events.on('cmd:471', (msg) => {	// ERR_CHANNELISFULL
		events.emit('protocol:errChannelisfull', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:472', (msg) => {	// ERR_UNKNOWNMODE
		events.emit('protocol:errUnknownmode', protocolGeneric(msg, {
			target: msg.args[0] || '',
			mode: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:473', (msg) => {	// ERR_INVITEONLYCHAN
		events.emit('protocol:errInviteonlychan', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:474', (msg) => {	// ERR_BANNEDFROMCHAN
		events.emit('protocol:errBannedfromchan', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:475', (msg) => {	// ERR_BADCHANNELKEY
		events.emit('protocol:errBadchannelkey', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:477', (msg) => {	// ERR_NEEDREGGEDNICK
		events.emit('protocol:errNeedreggednick', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// Error numerics 478-479
	events.on('cmd:478', (msg) => {	// ERR_BANLISTFULL
		events.emit('protocol:errBanlistfull', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			banmask: msg.args[2] || '',
			message: msg.args[3]
		}));
	});

	events.on('cmd:479', (msg) => {	// ERR_BADCHANNAME / ERR_LINKFAIL
		events.emit('protocol:errBadchanname', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});


	events.on('cmd:480', (msg) => {	// ERR_CANNOTKNOCK
		events.emit('protocol:errCannotknock', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:481', (msg) => {	// ERR_NOPRIVILEGES
		events.emit('protocol:errNoprivileges', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:482', (msg) => {	// ERR_CHANOPRIVSNEEDED
		events.emit('protocol:errChanoprivsneeded', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:486', (msg) => {	// ERR_NONONREG
		events.emit('protocol:errNononreg', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:487', (msg) => {	// ERR_CHANTOORECENT / ERR_TARGETTOOFAST
		events.emit('protocol:errChantoorecent', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:489', (msg) => {	// ERR_SECUREONLYCHAN
		events.emit('protocol:errSecureonlychan', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// Error numerics 490-492
	events.on('cmd:490', (msg) => {	// ERR_NOSWEAR
		events.emit('protocol:errNoswear', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:491', (msg) => {	// ERR_NOOPERHOST
		events.emit('protocol:errNooperhost', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:492', (msg) => {	// ERR_NOSERVICEHOST
		events.emit('protocol:errNoservicehost', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:499', (msg) => {	// ERR_CHANOWNPRIVNEEDED
		events.emit('protocol:errChanownprivneeded', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// Error numerics 500-502
	events.on('cmd:500', (msg) => {	// ERR_TOOMANYJOINS
		events.emit('protocol:errToomanyjoins', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:501', (msg) => {	// ERR_UMODEUNKNOWNFLAG
		events.emit('protocol:errUmodeunknownflag', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:502', (msg) => {	// ERR_USERSDONTMATCH
		events.emit('protocol:errUsersdontmatch', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	// Error numerics 511-521
	events.on('cmd:511', (msg) => {	// ERR_SILELISTFULL
		events.emit('protocol:errSilelistfull', protocolGeneric(msg, {
			target: msg.args[0] || '',
			mask: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:512', (msg) => {	// ERR_TOOMANYWATCH / ERR_NOSUCHGLINE
		events.emit('protocol:errToomanywatch', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:513', (msg) => {	// ERR_BADPING / ERR_NEEDPONG
		events.emit('protocol:errBadping', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:514', (msg) => {	// ERR_NOSUCHGLINE / ERR_INVALIDKEY
		events.emit('protocol:errNosuchgline', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:517', (msg) => {	// ERR_DISABLED
		events.emit('protocol:errDisabled', protocolGeneric(msg, {
			target: msg.args[0] || '',
			command: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:518', (msg) => {	// ERR_LONGMASK
		events.emit('protocol:errLongmask', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:519', (msg) => {	// ERR_TOOMANYUSERS
		events.emit('protocol:errToomanyusers', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:520', (msg) => {	// ERR_MASKTOOWIDE / ERR_WHOTRUNC
		events.emit('protocol:errMasktoowide', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:521', (msg) => {	// ERR_LISTSYNTAX
		events.emit('protocol:errListsyntax', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:531', (msg) => {	// ERR_CANTSENDTOUSER
		events.emit('protocol:errCantsendtouser', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	// WATCH numerics (597-609)
	events.on('cmd:597', (msg) => {	// RPL_REAWAY
		events.emit('protocol:rplReaway', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			awayTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});

	events.on('cmd:598', (msg) => {	// RPL_GONEOFFLINE
		events.emit('protocol:rplGoneoffline', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			offlineTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});

	events.on('cmd:599', (msg) => {	// RPL_NOTAWAY
		events.emit('protocol:rplNotaway', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			awayTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});

	events.on('cmd:600', (msg) => {	// RPL_LOGON
		events.emit('protocol:rplLogon', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			logonTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});

	events.on('cmd:601', (msg) => {	// RPL_LOGOFF
		events.emit('protocol:rplLogoff', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			logoffTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});

	events.on('cmd:602', (msg) => {	// RPL_WATCHOFF
		events.emit('protocol:rplWatchoff', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			message: msg.args[4]
		}));
	});

	events.on('cmd:603', (msg) => {	// RPL_WATCHSTAT
		events.emit('protocol:rplWatchstat', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:604', (msg) => {	// RPL_NOWON
		events.emit('protocol:rplNowon', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			logonTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});

	events.on('cmd:605', (msg) => {	// RPL_NOWOFF
		events.emit('protocol:rplNowoff', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			logoffTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});

	events.on('cmd:606', (msg) => {	// RPL_WATCHLIST
		events.emit('protocol:rplWatchlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			watchedNick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:607', (msg) => {	// RPL_ENDOFWATCHLIST
		events.emit('protocol:rplEndofwatchlist', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:608', (msg) => {	// RPL_WATCHCLEAR / RPL_CLEARWATCH
		events.emit('protocol:rplWatchclear', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:609', (msg) => {	// RPL_NOWISAWAY
		events.emit('protocol:rplNowisaway', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			ident: msg.args[2] || '',
			host: msg.args[3] || '',
			awayTime: parseInt(msg.args[4], 10) || 0,
			message: msg.args[5]
		}));
	});



	events.on('cmd:671', (msg) => {	// RPL_WHOISSECURE
		events.emit('protocol:rplWhoissecure', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:742', (msg) => {	// ERR_MLOCKRESTRICTED
		events.emit('protocol:errMlockrestricted', protocolGeneric(msg, {
			target: msg.args[0] || '',
			channelName: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:761', (msg) => {	// RPL_KEYVALUE
		events.emit('protocol:rplKeyvalue', protocolGeneric(msg, {
			target: msg.args[0] || '',
			key: msg.args[1] || '',
			value: msg.args[2] || ''
		}));
	});
	events.on('cmd:762', (msg) => {	// RPL_METADATAEND
		events.emit('protocol:rplMetadataend', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:766', (msg) => {	// RPL_KEYNOTSET (draft/metadata-2)
		events.emit('protocol:rplKeynotset', protocolGeneric(msg, {
			target: msg.args[0] || '',
			key: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:770', (msg) => {	// RPL_METADATASUBOK
		events.emit('protocol:rplMetadatasubok', protocolGeneric(msg, {
			target: msg.args[0] || '',
			key: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:774', (msg) => {	//ERR_METADATASYNCLATER
		let delayMs = 0;
		if (msg.args[1]) {
			delayMs = parseInt(msg.args[1], 10) * 1000 || 0;
		}
		events.emit('protocol:errMetadatasynclater', protocolGeneric(msg, {
			target: msg.args[0] || '',
			delayMs: delayMs,
			message: msg.args[2]
		}));
	});

	events.on('cmd:900', (msg) => {	// RPL_LOGGEDIN
		events.emit('protocol:rplLoggedin', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			account: msg.args[2] || '',
			message: msg.args[3]
		}));
	});

	events.on('cmd:901', (msg) => {	// RPL_LOGGEDOUT
		events.emit('protocol:rplLoggedout', protocolGeneric(msg, {
			target: msg.args[0] || '',
			nick: msg.args[1] || '',
			message: msg.args[2]
		}));
	});

	events.on('cmd:903', (msg) => {	// RPL_SASLSUCCESS
		events.emit('protocol:rplSaslsuccess', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:904', (msg) => {	// ERR_SASLFAIL
		events.emit('protocol:errSaslfail', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:906', (msg) => {	// ERR_SASLABORTED
		events.emit('protocol:errSaslaborted', protocolGeneric(msg, {
			target: msg.args[0] || '',
			message: msg.args[1]
		}));
	});

	events.on('cmd:972', (msg) => {	// ERR_CANNOTDOCOMMAND
		events.emit('protocol:errCannotDoCommand', protocolGeneric(msg, {
			target: msg.args[1] || '',
			message: msg.args[2] // Pass the raw message for chat/UI to handle details
		}));
	});

	events.on('cmd:974', (msg) => {	// ERR_CANNOTCHANGECHANMODE
		events.emit('protocol:errCannotChangeChanMode', protocolGeneric(msg, {
			target: msg.args[1] || '',
			message: msg.args[2] // Pass the raw message for chat/UI to handle details
		}));
	});





	// ============================================================================
	// CTCP HANDLERS
	// ============================================================================

	events.on('ctcp:ACTION', (msg) => {
		events.emit('protocol:ctcpAction', protocolGeneric(msg, {
			target: msg.args[0] || '',
			text: msg.ctcptext || ''
		}));
	});

	events.on('ctcp:VERSION', (msg) => {
		events.emit('protocol:ctcpVersionRequest', protocolGeneric(msg, {
			target: msg.args[0] || '',
			requestedBy: msg.sender.nick
		}));
	});

	events.on('ctcp:USERINFO', (msg) => {
		events.emit('protocol:ctcpUserinfoRequest', protocolGeneric(msg, {
			target: msg.args[0] || '',
			requestedBy: msg.sender.nick
		}));
	});

	events.on('ctcp:REFERER', (msg) => {
		events.emit('protocol:ctcpRefererRequest', protocolGeneric(msg, {
			target: msg.args[0] || '',
			requestedBy: msg.sender.nick
		}));
	});

	// ============================================================================
	// OUTGOING COMMAND HANDLERS  (chat:* → transport.send)
	// All IRC knowledge for outgoing commands lives here.
	// ============================================================================

	// --- Message sending ---

	/**
	 * chat:sendMessage — send a PRIVMSG or NOTICE (NOTICE = "whisper" in some other chat systems).
	 * @param {string}  dest
	 * @param {string}  text
	 * @param {boolean} [notice]  - true = NOTICE, false/undefined = PRIVMSG
	 * @param {boolean} [slow]    - reserved for future throttle path
	 * @param {boolean} [hide]    - if true, suppress outgoing echo (service commands)
	 */
	events.on('chat:sendMessage', (data) => {
		const cmd = data.notice ? 'NOTICE' : 'PRIVMSG';
		const label = generateLabel();
		const tags = ('message-tags' in chat.activeCaps) ? { label } : null;
		if (tags && ('labeled-response' in chat.activeCaps)) {
			events.emit('chat:setLabelInfo', { label, info: { cmd } });
		}
		sendIrc(cmd, [data.dest, data.text], tags);
		if (data.hide) {
			events.emit('chat:addLabelToHide', { label });
		} else {
			events.emit('chat:outgoingMessage', {
				messageType: data.notice ? 'notice' : 'message',
				dest: data.dest,
				text: data.text,
				label,
				sender: chat.me.userRef,
				time: new Date()
			});
		}
	});

	/** chat:sendAction — send CTCP ACTION (/me). */
	events.on('chat:sendAction', (data) => {
		const ctcp = `\x01ACTION ${data.text}\x01`;
		const label = generateLabel();
		const tags = ('message-tags' in chat.activeCaps) ? { label } : null;
		if (tags && ('labeled-response' in chat.activeCaps)) {
			events.emit('chat:setLabelInfo', { label, info: { cmd: 'PRIVMSG' } });
		}
		sendIrc('PRIVMSG', [data.dest, ctcp], tags);
		events.emit('chat:outgoingMessage', {
			messageType: 'action',
			dest: data.dest,
			text: data.text,
			label,
			sender: chat.me.userRef,
			time: new Date()
		});
	});

	/**
	 * chat:sendCtcp — send a CTCP request (PRIVMSG) or reply (NOTICE).
	 * @param {string}  dest
	 * @param {string}  type   - CTCP type, e.g. "VERSION"
	 * @param {string}  [text]
	 * @param {boolean} [isReply] - true = NOTICE (reply), false = PRIVMSG (request)
	 */
	events.on('chat:sendCtcp', (data) => {
		const ctcp = data.text ? `\x01${data.type} ${data.text}\x01` : `\x01${data.type}\x01`;
		const cmd = data.isReply ? 'NOTICE' : 'PRIVMSG';
		sendIrc(cmd, [data.dest, ctcp]);
	});

	// --- Channel management ---

	/**
	 * chat:joinChannel — join one or more channels.
	 * "leave" = PART in IRC; see chat:leaveChannel.
	 * @param {string|string[]} channels
	 * @param {string}          [password]
	 */
	events.on('chat:joinChannel', (data) => {
		let channelString;
		if (Array.isArray(data.channels)) {
			if (data.channels.length === 0) return;
			channelString = data.channels.map((c) => (typeof c === 'string' ? c : c.name)).join(',');
		} else {
			channelString = data.channels;
		}
		const channelList = channelString.split(',');
		if ('labeled-response' in chat.activeCaps) {
			const label = generateLabel();
			events.emit('chat:setLabelInfo', { label, info: { cmd: 'JOIN', channels: channelList } });
			const tags = ('message-tags' in chat.activeCaps) ? { label } : null;
			if (data.password) {
				sendIrc('JOIN', [channelString, data.password], tags);
			} else {
				sendIrc('JOIN', [channelString], tags);
			}
		} else {
			if (data.password) {
				sendIrc('JOIN', [channelString, data.password]);
			} else {
				sendIrc('JOIN', [channelString]);
			}
		}
	});

	/**
	 * chat:leaveChannel — leave (PART) a channel.
	 * Called "leave" (natural language); the IRC protocol word is PART.
	 */
	events.on('chat:leaveChannel', (data) => {
		if (data.reason) {
			sendIrc('PART', [data.channel, data.reason]);
		} else {
			sendIrc('PART', [data.channel]);
		}
	});

	/** chat:setTopic — set or query channel topic. */
	events.on('chat:setTopic', (data) => {
		if (data.text !== undefined && data.text !== null) {
			sendIrc('TOPIC', [data.channel, data.text]);
		} else {
			sendIrc('TOPIC', [data.channel]);
		}
	});

	/** chat:knockChannel — send KNOCK to a channel. */
	events.on('chat:knockChannel', (data) => {
		if (data.message) {
			sendIrc('KNOCK', [data.channel, data.message]);
		} else {
			sendIrc('KNOCK', [data.channel]);
		}
	});

	/** chat:inviteUser — invite a user to a channel. */
	events.on('chat:inviteUser', (data) => {
		sendIrc('INVITE', [data.nick, data.channel]);
	});

	/** chat:kickUser — kick a user from a channel. */
	events.on('chat:kickUser', (data) => {
		if (data.reason) {
			sendIrc('KICK', [data.channel, data.nick, data.reason]);
		} else {
			sendIrc('KICK', [data.channel, data.nick]);
		}
	});

	// --- Member / presence queries ---

	/** chat:requestChannelMembers — refresh NAMES list for a channel. */
	events.on('chat:requestChannelMembers', (data) => {
		sendIrc('NAMES', [data.channel]);
	});

	/**
	 * chat:requestChannelMemberInfo — request WHO/WHOX for a channel.
	 * Uses WHOX format if the server advertises it.
	 */
	events.on('chat:requestChannelMemberInfo', (data) => {
		if (typeof chat.isupport !== 'undefined' && 'WHOX' in chat.isupport) {
			sendIrc('WHO', [data.channel, '%tuhanfr,101']);
		} else {
			sendIrc('WHO', [data.channel]);
		}
	});

	// --- Nick management ---

	/** chat:changeNick — request a nick change. */
	events.on('chat:changeNick', (data) => {
		sendIrc('NICK', [data.nick]);
	});

	// --- Settings / modes ---

	/** chat:setChannelSettings — set channel modes. Mode string stays IRC-style for now. */
	events.on('chat:setChannelSettings', (data) => {
		const args = [data.channel];
		if (data.modeString) args.push(...data.modeString.split(' '));
		sendIrc('MODE', args);
	});

	/** chat:setUserSettings — set user (self) modes. */
	events.on('chat:setUserSettings', (data) => {
		const args = [chat.me.nick];
		if (data.modeString) args.push(...data.modeString.split(' '));
		sendIrc('MODE', args);
	});

	// --- User info queries ---

	/** chat:queryUser — request WHOIS for a user (double-nick forces home server). */
	events.on('chat:queryUser', (data) => {
		sendIrc('WHOIS', [data.nick, data.nick]);
	});

	/** chat:queryUserHistory — request WHOWAS for a user. */
	events.on('chat:queryUserHistory', (data) => {
		sendIrc('WHOWAS', [data.nick]);
	});

	// --- Channel listing ---

	/**
	 * chat:listChannels — request channel list from server.
	 * Multi-listener pattern: protocol sends LIST; UI also listens to open/focus the list window.
	 * @param {string}  [pattern]  - filter expression (e.g. ">9")
	 * @param {boolean} [labeled]  - use labeled-response if available (sidebar/small list)
	 */
	events.on('chat:listChannels', (data) => {
		const args = data.pattern ? [data.pattern] : [];
		if (data.labeled && ('labeled-response' in chat.activeCaps)) {
			const label = generateLabel();
			const tags = ('message-tags' in chat.activeCaps) ? { label } : null;
			sendIrc('LIST', args, tags);
		} else {
			sendIrc('LIST', args);
		}
	});

	// --- History ---

	/**
	 * chat:fetchChannelHistory — send CHATHISTORY command.
	 * Reference construction (msgid=... / timestamp=... / *) happens here, not in chat layer.
	 */
	events.on('chat:fetchChannelHistory', (data) => {
		let reference;
		if (data.type === 'LATEST') {
			reference = '*';
		} else if (data.msgid) {
			reference = `msgid=${data.msgid}`;
		} else if (data.timestamp) {
			reference = `timestamp=${data.timestamp}`;
		} else {
			console.error('PROTOCOL: No msgid or timestamp provided for CHATHISTORY request');
			return;
		}
		const args = [data.type, data.channelName, reference];
		if (data.limit !== undefined) args.push(String(data.limit));
		sendIrc('CHATHISTORY', args);
	});

	/** chat:requestHistory — send legacy HISTORY command. */
	events.on('chat:requestHistory', (data) => {
		const args = [data.channel];
		if (data.lines) args.push(String(data.lines));
		sendIrc('HISTORY', args);
	});

	// --- Presence ---

	/** chat:setAway — set or clear away status. */
	events.on('chat:setAway', (data) => {
		if (data.message) {
			sendIrc('AWAY', [data.message]);
		} else {
			sendIrc('AWAY');
		}
	});

	/** chat:quit — disconnect from server. */
	events.on('chat:quit', (data) => {
		if (data.message) {
			sendIrc('QUIT', [data.message]);
		} else {
			sendIrc('QUIT');
		}
	});

	// --- Services ---

	/**
	 * chat:sendServiceCommand — send a command to an IRC service (NickServ, ChanServ, etc.)
	 * Delivered as a hidden PRIVMSG.
	 * @param {string}   service
	 * @param {string}   command
	 * @param {string[]} args
	 */
	events.on('chat:sendServiceCommand', (data) => {
		const args = Array.isArray(data.args) ? data.args : [data.args];
		let commandString = data.command;
		for (const arg of args) commandString += ` ${arg}`;
		events.emit('chat:sendMessage', { dest: data.service, text: commandString, hide: true });
	});

	// --- Signals (typing indicators etc.) ---

	/**
	 * chat:sendSignal — send a TAGMSG signal (e.g. typing indicator).
	 * Only sent if message-tags cap is active.
	 * @param {string} target
	 * @param {string} type    - 'typing'
	 * @param {Object} data2   - for typing: { status: 'active'|'paused'|'done' }
	 */
	events.on('chat:sendSignal', (data) => {
		if (!('message-tags' in chat.activeCaps)) return;
		const tags = {};
		if (data.type === 'typing') {
			tags['+draft/typing'] = data.data.status;
			tags['+typing'] = data.data.status;
		} else {
			// Future signal types can be added here
			return;
		}
		sendIrc(null, [data.target], tags);
	});

	// --- Server-stored properties / metadata ---

	/**
	 * chat:setColor — set or clear own nick color via IRCv3 METADATA.
	 * (* is IRCv3 METADATA shorthand for self; this is IRC-specific.)
	 * @param {string|null} color  - CSS color string, or null/falsy to clear
	 */
	events.on('chat:setColor', (data) => {
		if (data.color) {
			sendIrc('METADATA', ['*', 'SET', 'color', data.color]);
		} else {
			sendIrc('METADATA', ['*', 'SET', 'color']);
		}
	});

	/** chat:setAvatar — set own avatar URL via METADATA. */
	events.on('chat:setAvatar', (data) => {
		if (data.url) {
			sendIrc('METADATA', ['*', 'SET', 'avatar', data.url]);
		} else {
			sendIrc('METADATA', ['*', 'SET', 'avatar']);
		}
	});

	/** chat:subscribeMetadata — send METADATA SUB. */
	events.on('chat:subscribeMetadata', (data) => {
		const args = ['*', 'SUB'].concat(data.keys);
		sendIrc('METADATA', args);
	});

	// --- Raw / protocol-internal bypass ---

	/**
	 * chat:sendRawCommand — escape hatch for protocol-internal commands
	 * (CAP, AUTHENTICATE, PING, EXTJWT, etc.)
	 * @param {string}   [command]
	 * @param {string[]} [args]  - last element is sent as trailing parameter (with leading ':')
	 * @param {string}   [raw]   - if provided, sent verbatim (overrides command/args)
	 */
	events.on('chat:sendRawCommand', (data) => {
		if (data.raw !== undefined && data.raw !== null) {
			transport.send(data.raw);
			return;
		}
		sendIrc(data.command, data.args, data.tags || null);
	});

}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { registerProtocolHandlers };
}
