// js/chat_integrator.js
// ChatIntegrator layer: manages per-connection state, converts protocol events to chat facts,
// emits semantic events consumed by the UI layer and cmds.js.
//
// Truly global (shared across connections): language, settings, mainSettings, servicesNicks.

// ============================================================================
// SELF USER (per-connection logged-in identity)
// Moved here from gateway_conn.js so ChatIntegrator can own it.
// ============================================================================

class SelfUser {
	constructor(nick) {
		this.nick = nick || '';
		this.previousNick = '';
		this.channels = [];
		this.nickservpass = '';
		this.nickservnick = '';
		this.userRef = null;
		this.umodes = {};
	}

	changeNick(newnick, silent) {
		this.nick = newnick;
		return true;
	}

	setUmode(modechar, plus) {
		if (modechar) {
			this.umodes[modechar] = plus;
		}
		if (modechar === 'r' && this.userRef) {
			this.userRef.setRegistered(plus);
		}
	}

	clearUmodes() {
		this.umodes = {};
	}

	clear(users) {
		if (this.userRef) this.userRef.setRegistered(false);
		users.clear();
		this.userRef = users.getUser('*');
		this.clearUmodes();
	}
}

// ============================================================================
// DOMAIN (per-connection state)
// ============================================================================

class ChatIntegrator {
	constructor(nick, events) {
	// IRC capability state
		this.activeCaps = {};
		this.isupport = [];
		this.supportedCaps = [
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
		this.serverCaps = {};
		this.capInProgress = false;
		this.saslInProgress = false;
		// Connection state
		this.connectStatus = 'disconnected';
		this.connectTime = 0;
		this.joined = 0;
		this.setConnectedWhenIdentified = 0;
		this.firstConnect = 1;
		this.userQuit = false;
		this.killed = false;
		this.sasl = false;
		this.whowasExpect312 = false;
		this.nickWasInUse = false;
		this.retrySasl = false;
		this.recoverTimeout = null;
		this.pingCnt = 0;
		this.lastTypingActivity = {};
		this.labelsToHide = [];
		this.batch = {};
		this._labelCounter = 0;
		this.labelCallbacks = {};    // label → callback(batch) for labeled-response
		this.pendingCallbacks = {};  // command → callback for non-labeled plain responses
		this.whoisData = {};
		this.smallListData = [];
		this.lastError = '';
		this.activeTab = '--status';
		this.tabHistory = ['--status'];
		this.channelsInitializing = {};
		this.channelsAwaitingInitialHistory = {};
		this.channelsPendingHistoryLimit = {};
		this.connectTimeoutID = 0;
		this.pingIntervalID = false;
		this.whoChannelsIntervalID = false;
		this.disconnectMessageShown = 0;
		this.commandProcessing = false;
		// Netsplit/Netjoin state
		this.netJoinUsers = {};

		// Per-connection logged-in user identity (was global guser in gateway_conn.js)
		this.me = new SelfUser(nick);

		// Per-connection channel-mode categories (RFC 1459 defaults;
		// overwritten by chat:parseIsupport when ISUPPORT arrives).
		// Language-dependent fields (changeableSingle, changeableArg) are set
		// by setEnvironment() in gateway_functions.js after language loads.
		this.modes = {
			'single': ['p', 's', 'i', 't', 'n', 'm'],
			'argBoth': ['k'],
			'argAdd': ['l'],
			'list': ['b'],
			'user': ['o', 'v'],
			'prefixes': { 'o': '@', 'v': '+' },
			'reversePrefixes': { '@': 'o', '+': 'v' }
		};

		// User list for this connection; Users constructor is defined in users.js
		// which loads before gateway_main.js where new ChatIntegrator() is called.
		this.users = new Users(this, events);
	}

	generateLabel() { return String(++this._labelCounter); }

	// UI accessor: Check if a user object represents the current user.
	isOwnUser(user) {
		if (!user) return false;
		return user === this.me.userRef || (user.nick && user.nick === this.me.userRef.nick);
	}

	// Returns true when user actions (sending messages, joining channels) are possible.
	// wrongPassword means authentication failed but the IRC connection is active.
	isConnected() {
		return this.connectStatus === 'connected' || this.connectStatus === 'wrongPassword';
	}
}


function registerChatHandlers(events, chat, transport) {

	// ============================================================================
	// BATCH HANDLERS (migrated from irc_protocol.js)
	// ============================================================================

	function ircBatch(name, type, args, msg) {
		this.name = name;
		this.type = type;
		this.args = args;
		this.callback = null;
		this.label = null;
		this.parents = [];

		this.getLabel = function() {
			if (this.label)
				return this.label;
			for (const parent of this.parents) {
				if (parent.label)
					return parent.label;
			}
			return null;
		};

		if (msg && msg.tags && 'batch' in msg.tags) { // nested batches - add parent
			const parentBatch = chat.batch[msg.tags.batch];
			this.parents.push(parentBatch);
			this.parents = this.parents.concat(parentBatch.parents);
		}
	}

	// ============================================================================
	// INCOMING MESSAGE ENRICHMENT
	// ============================================================================

	// Update user state from sender info and well-known message tags.
	// Runs for every incoming message before command handlers, so all cmd:* handlers
	// already see up-to-date user data.
	events.on('chat:processIncomingTags', ({ msg }) => {
		const user = msg.user;

		// Update user ident/host from sender prefix
		if (user && msg.sender.user) {
			if (msg.sender.ident.length > 0) user.setIdent(msg.sender.ident);
			if (msg.sender.host.length > 0) user.setHost(msg.sender.host);
		}
		if (user && msg.sender.server) {
			user.setServer(true);
		}

		// Apply server-time tag to the enriched message object
		if ('time' in msg.tags) {
			msg.time = new Date(msg.tags['time']);
		}

		if (user) {
		// account-tag: update sender's account on every message
			if ('account' in msg.tags) {
				user.setAccount(msg.tags['account'] || false);
			}
			// inspircd.org/bot: mark sender as a bot
			if ('inspircd.org/bot' in msg.tags) {
				user.setBot(true);
			}
		}

		// Handle incoming typing indicators carried in TAGMSG
		if (user && msg.command === 'TAGMSG') {
			const typingMode = '+typing' in msg.tags ? msg.tags['+typing'] : msg.tags['+draft/typing'];
			if (typingMode !== undefined) {
				events.emit('user:typingActivity', {
					user: user,
					dest: msg.args[0],
					mode: typingMode,
					time: msg.time
				});
			}
		}
	});

	events.on('batch:chathistory', ({ msg, batch }) => {

		// Track how many messages we received
		batch.receivedMessages = 0;
		batch.oldestMsgid = null;
		batch.oldestTimestamp = null;
		batch.isInitialHistory = false;

		// Set callback to add the "load older" link when batch ends
		batch.callback = function(batch, msg) {
			console.debug('chathistory batch ended, received', batch.receivedMessages, 'messages');
			const channelName = batch.args[0];
			const channelKey = channelName.toLowerCase();
			const isInitialHistory = chat.channelsAwaitingInitialHistory[channelKey] || false;

			if (isInitialHistory) {
				delete chat.channelsAwaitingInitialHistory[channelKey];
			}

			const requestedLimit = chat.channelsPendingHistoryLimit[channelKey] || (('CHATHISTORY' in chat.isupport) ? (chat.isupport['CHATHISTORY'] || 50) : 50);
			delete chat.channelsPendingHistoryLimit[channelKey];
			events.emit('channel:chatHistoryStatsUpdated', {
				channelName: channelName,
				receivedMessages: batch.receivedMessages,
				oldestMsgid: batch.oldestMsgid,
				oldestTimestamp: batch.oldestTimestamp,
				isInitialHistory: isInitialHistory,
				historyLimit: requestedLimit
			});
		};
	});

	events.on('batch:labeled-response', (data) => {
	// Empty handler for labeled-response batches
	});

	events.on('batch:metadata', (data) => {
	// Batch for metadata responses (draft/metadata-2)
	// Contains RPL_KEYVALUE, RPL_KEYNOTSET, or METADATA messages
	});

	events.on('batch:metadata-subs', (data) => {
	// Batch for subscription list responses (draft/metadata-2)
	// Contains RPL_METADATASUBS numerics
	});

	// ============================================================================
	// BATCH HELPER FUNCTIONS
	// ============================================================================

	/**
 * Find a batch of a specific type in the batch hierarchy
 * @param {Object} tags - Message tags object
 * @param {string} type - Batch type to search for (e.g., 'chathistory')
 * @returns {Object|null} - Batch object or null if not found
 */
	// Accesses global `chat.batch` directly — must receive a chat reference for multi-connection (#18, #35).
	function findBatchOfType(tags, type) {
		if (!tags || !('batch' in tags)) {
			console.debug('[BATCH-DEBUG] No batch in tags, type requested:', type);
			return null;
		}
		const batch = chat.batch[tags.batch];
		if (!batch) {
			console.debug('[BATCH-DEBUG] Batch', tags.batch, 'not found in chat.batch');
			return null;
		}
		console.debug('[BATCH-DEBUG] Checking batch', tags.batch, 'type:', batch.type, 'looking for:', type);
		if (batch.type == type)
			return batch;
		if (batch.parents) {
			for (const parent of batch.parents) {
				if (parent.type == type)
					return parent;
			}
		}
		console.debug('[BATCH-DEBUG] Batch type mismatch, returning null');
		return null;
	}

	/**
 * Check if a message is part of a chathistory batch
 * @param {Object} tags - Message tags object
 * @returns {boolean} - True if message is in a chathistory batch
 */
	function isHistoryBatch(tags) {
		return findBatchOfType(tags, 'chathistory') !== null;
	}

	/**
 * Check if there's an active chathistory batch for a channel
 * @param {string} chan - Channel name
 * @returns {boolean} - True if chathistory batch is active for this channel
 */
	function historyBatchActive(chan) {
	// Check if there's an active chathistory batch for this channel
		for (const batchId of Object.keys(chat.batch)) {
			const batch = chat.batch[batchId];
			if (batch.type == 'chathistory' && batch.args && batch.args[0] && batch.args[0].toLowerCase() == chan.toLowerCase()) {
				console.debug('[BATCH-DEBUG] historyBatchActive: true for', chan, 'batchId:', batchId);
				return true;
			}
			// Also check parent batches
			if (batch.parents) {
				for (const parent of batch.parents) {
					if (parent.type == 'chathistory' && parent.args && parent.args[0] && parent.args[0].toLowerCase() == chan.toLowerCase()) {
						console.debug('[BATCH-DEBUG] historyBatchActive: true for', chan, 'in parent batch');
						return true;
					}
				}
			}
		}
		console.debug('[BATCH-DEBUG] historyBatchActive: false for', chan);
		return false;
	}

	// ============================================================================
	// CLIENT-SPECIFIC LISTENERS (migrated from other layers)
	// ============================================================================

	events.on('client:processOwnChannelList', ({ nick, channelNames }) => {

		// This logic was moved from irc_protocol.js
		chat.connectStatus = '001'; // Update chat.connectStatus
		if (nick == chat.me.nick) {
			channelNames.forEach( (channame) => {
				const channel = channame.match(/#[^ ]*/);
				if (channel) {
					events.emit('chat:requestChannelMembers', { channel: channel[0] });
					events.emit('chat:setTopic', { channel: channel[0] });
					events.emit('chat:requestChannelMemberInfo', { channel: channel[0] });
            	}
			});


		}
	});

	events.on('channel:requestChatHistory', (data) => {
		events.emit('chat:requestHistory', { channel: data.channelName, lines: data.limit });
	});

	events.on('channel:requestWho', (data) => {
		events.emit('chat:requestChannelMemberInfo', { channel: data.channelName });
	});

	// ============================================================================
	// PROTOCOL LISTENERS (migrated from irc_protocol.js)
	// ============================================================================

	events.on('protocol:accountCommand', (data) => {
	// data.user is available in the protocolGeneric wrapper
		if (data.account === '*' || data.account === '0') {
			data.user.setAccount(false);
		} else {
			data.user.setAccount(data.account);
		}
	});

	events.on('protocol:ackCommand', (data) => {
	// Server acknowledged the labeled message; no further response (echo, etc.) will follow.
	// Notify UI to mark the pending message as delivered.
		if (data.ackedLabel) {
			events.emit('message:labelAcknowledged', { label: data.ackedLabel });
		}
	});

	events.on('protocol:authenticateCommand', (data) => {
		if (data.challenge === '+') {
			events.emit('chat:sendRawCommand', {
				command: 'AUTHENTICATE',
				args: [Base64.encode(`${chat.me.nickservnick}\0${chat.me.nickservnick}\0${chat.me.nickservpass}`)]
			});
			events.emit('auth:saslAuthenticating', { time: data.time, nickservNick: chat.me.nickservnick });
			if (!chat.retrySasl) {
				chat.connectStatus = 'identified'; // Only during initial auth; retrySasl already advanced status
			}
		} else {
			console.debug('DOMAIN: Unexpected AUTHENTICATE response:', data.challenge);
		}
	});

	events.on('protocol:awayCommand', (data) => {
	// data.user is available in the protocolGeneric wrapper
		if (data.awayMessage === '') {
			data.user.notAway();
		} else {
			data.user.setAway(data.awayMessage);
		}
	});

	events.on('protocol:batchCommand', (data) => {
	// Protocol layer provides: batchId (without prefix), isStart, isEnd, batchType, batchArgs
		const { batchId, batchType: type } = data;

		let batch;
		if (data.isEnd) { // Batch end
			batch = chat.batch[batchId];
			if (!batch) {
				console.warn(`BATCH "${  batchId  }" ended but not started`);
				return;
			}
			if (batch.callback) {
				batch.callback(batch, data);
			}
			if (batch.label && chat.labelCallbacks[batch.label]) {
				const cb = chat.labelCallbacks[batch.label];
				delete chat.labelCallbacks[batch.label];
				cb(batch);
			}
			delete chat.batch[batchId];
			data.isBatchEnd = true;
			data.batch = batch;
		} else if (data.isStart) { // Batch start
			batch = new ircBatch(batchId, type, data.batchArgs, data);
			chat.batch[batchId] = batch;
			if ('label' in data.tags) {
				batch.label = data.tags.label;
			}
			// Emit batch start event
			events.emit(`batch:${  type}`, {msg: data, batch: batch});
			data.isBatchStart = true;
		} else {
			console.error('Unknown batch type - neither start nor end');
			return;
		}
	});

	events.on('protocol:capCommand', (data) => {
		switch (data.subcommand) {
			case 'LS': case 'NEW':
			// Parse available capabilities from server
				if (data.isMultiLine) // Check for multi-line CAP LS indicator
					chat.capInProgress = true;
				else
					chat.capInProgress = false;

				// Parse capabilities from THIS line only (before adding to accumulated chat.serverCaps)
				const thisLineCaps = {};
				const availableCaps = data.capText.split(' ');
				for (const capString of availableCaps) {
					let value = true;
					let cap = '';
					const argIndex = capString.indexOf('=');
					if (argIndex > 0) {
						cap = capString.substring(0, argIndex);
						value = capString.substring(argIndex + 1);
					} else {
						cap = capString;
					}
					thisLineCaps[cap] = value;
				}

				// Build list of capabilities to request from THIS line only
				let useCaps = '';
				for (const capSpec of chat.supportedCaps) {
					let selectedCap = null;

					if (Array.isArray(capSpec)) {
					// Mutually exclusive capabilities - pick first available
						for (const cap of capSpec) {
							if (cap in thisLineCaps) {
								selectedCap = cap;
								break;
							}
						}
					} else {
					// Single capability
						if (capSpec in thisLineCaps) {
							selectedCap = capSpec;
						}
					}

					if (selectedCap) {
						if (useCaps.length > 0) useCaps += ' ';
						useCaps += selectedCap;
					}
				}

				// Request CAPs from this line (now a chat-level action)
				if (useCaps.length > 0) {
				// Emit a chat event to request CAPs, instead of direct ircCommand
					events.emit('chat:requestCap', { type: 'REQ', caps: useCaps });
				}

				// Now add this line's capabilities to accumulated chat.serverCaps
				for (const [cap, capValue] of Object.entries(thisLineCaps)) {
					chat.serverCaps[cap] = capValue;
				}
				break;
			case 'ACK':
				const newCapsParsed = {};
				// Protocol layer provides parsed caps with enabled/disabled info
				for (const cap of data.caps) {
					const capName = cap.name;
					const enabled = cap.enabled;

					if (!(capName in chat.activeCaps) && enabled) { // add capability
						chat.activeCaps[capName] = chat.serverCaps[capName];
						newCapsParsed[capName] = chat.serverCaps[capName];
					}
					if (capName in chat.activeCaps && !enabled) { // remove capability
						delete chat.activeCaps[capName];
					}
				}
				// Check for any metadata capability (draft/metadata-2, draft/metadata-notify-2, or draft/metadata)
				if ('draft/metadata-2' in newCapsParsed || 'draft/metadata-notify-2' in newCapsParsed || 'draft/metadata' in newCapsParsed) {
				// Emit chat event for metadata subscription
					events.emit('chat:requestMetadataSubscription', { keys: ['avatar', 'status', 'bot', 'homepage', 'display-name', 'bot-url', 'color'] });
					// Emit chat events indicating state change, UI will listen to these
					events.emit('chat:userAvatarCapabilityChanged');
					events.emit('chat:clientCanSetAvatar');
				}
				if (chat.me.nickservpass != '' && chat.me.nickservnick != '' && 'sasl' in newCapsParsed) {
				// Emit chat event to perform authentication
					events.emit('chat:requestSaslAuthenticate', { mechanism: 'PLAIN', time: data.time, nickservNick: chat.me.nickservnick, nickservPass: chat.me.nickservpass });
					chat.saslInProgress = true;
				} else {
					if (!chat.capInProgress && !chat.saslInProgress)
					// Emit chat event to end CAP negotiation
						events.emit('chat:endCapNegotiation');
				}
				break;
			case 'DEL':
				const delCaps = data.capText.split(' ');
				const removedActiveCaps = [];
				for (const cap of delCaps) {
					if (cap in chat.activeCaps) { delete chat.activeCaps[cap]; removedActiveCaps.push(cap); }
					if (cap in chat.serverCaps) { delete chat.serverCaps[cap]; }
				}
				if (removedActiveCaps.length > 0) {
					events.emit('server:capabilityRemoved', { caps: removedActiveCaps });
				}
				break;
		}
	});

	events.on('protocol:chghostCommand', (data) => {
	// data.user is available in protocolGeneric
		data.user.setIdent(data.newIdent);
		data.user.setHost(data.newHost);
		events.emit('user:hostChanged', {
			nick: data.user.nick,
			ident: data.newIdent,
			host: data.newHost
		});
	});

	events.on('protocol:failCommand', (data) => {
		console.debug('DOMAIN: FAIL', data.failedCommand, data.failCode, data.description);

		// Handle specific FAIL types
		if (data.failedCommand == 'METADATA') {
		// FAIL METADATA responses for draft/metadata-2
		// Examples: KEY_INVALID, KEY_NO_PERMISSION, TOO_MANY_SUBS, etc.
		// These are informational - the batch will complete normally
		}
		events.emit('server:failMessage', {
			command: data.failedCommand,
			description: data.description
		});
	});

	events.on('protocol:errorCommand', (data) => {
		chat.lastError = data.message; // Update chat.lastError

		const expr = /^Closing Link: [^ ]+\[([^ ]+)\] \(User has been banned from/;
		const match = expr.exec(data.message);
		if (match) {
		// Re-emit as a chat-level error for global ban
			events.emit('error:globalBan', {
				type: 'globalBan',
				message: data.message,
			});
			return;
		}

		if (chat.connectStatus == 'disconnected') { // Use chat.connectStatus
			if (chat.firstConnect && !chat.userQuit) { // Use chat.firstConnect; never reconnect on user-initiated quit
			// Emit chat event to request reconnect
				events.emit('chat:requestReconnect');
			}
			return;
		}

		chat.connectStatus = 'disconnected'; // Use chat.connectStatus
		chat.connectTime = 0; // Reset connection time

		events.emit('chat:connectionDisconnected', { reason: data.message });
		if (chat.killed) {
		// Server-initiated kill: do not reconnect
		} else if (data.message.match(/\(NickServ \(RECOVER command used by [^ ]+\)\)$/) || data.message.match(/\(NickServ \(Użytkownik [^ ]+\ użył komendy RECOVER\)\)\$/)) {
			events.emit('user:recoveredByNickServ', { message: data.message });
		} else {
			events.emit('client:connectionError', { type: 'serverError' });
		}
	});

	events.on('protocol:extjwtCommand', (data) => {
		let tokenData;
		if (data.args[2] == '*') {
			tokenData = data.args[3];
		} else {
			tokenData = data.args[2];
		}
		if (data.batch) {
			// Accumulate multi-part token; labelCallbacks dispatch fires on batch end.
			if (!('extjwtContent' in data.batch)) {
				data.batch.extjwtContent = tokenData;
			} else {
				data.batch.extjwtContent += tokenData;
			}
		} else {
			// Single-message response (labeled-response without a batch, or no labeled-response).
			const label = data.getLabel && data.getLabel();
			if (label && chat.labelCallbacks[label]) {
				const cb = chat.labelCallbacks[label];
				delete chat.labelCallbacks[label];
				transport.labelProcessed = true;
				cb({ extjwtContent: tokenData, label });
			} else if (chat.pendingCallbacks['extjwt']) {
				const cb = chat.pendingCallbacks['extjwt'];
				delete chat.pendingCallbacks['extjwt'];
				cb(tokenData);
			}
		}
	});

	events.on('protocol:inviteCommand', (data) => {
		// data.user, data.targetNick, data.channelName are available
		// ChatIntegrator logic for invite command - maybe log it or store for later UI display
		console.debug(`DOMAIN: ${data.user.nick} invited ${data.targetNick} to ${data.channelName}`);
		events.emit('channel:invited', {
			byNick: data.user.nick,
			targetNick: data.targetNick,
			channelName: data.channelName
		});
	});

	events.on('protocol:joinCommand', (data) => {
		const { channelName, user } = data; // user = User who joined

		let cml;
		if (user === chat.me.userRef) { // If WE joined - create channel state
			// Create ChannelMemberList for channels WE are in
			cml = chat.users.addChannelMemberList(channelName);
			// Don't add ourselves here - NAMES reply will include us with proper channel modes

			// Mark this channel as initializing (waiting for NAMES completion)
			chat.channelsInitializing[channelName.toLowerCase()] = {
				channelName: channelName,
				joinTime: data.time
			};

			// Don't emit UI event yet - wait for NAMES to complete

			// Request channel modes
			events.emit('chat:setChannelSettings', { channel: channelName, modeString: '' });

			// Request WHO/WHOX to get account info for all users
			events.emit('chat:requestChannelMemberInfo', { channel: channelName });
		} else { // Someone else joined
			// Only track if we're already in the channel
			cml = chat.users.getChannelMemberList(channelName);
			if (cml) {
				// We're in this channel - add the user to our member list
				cml.addMember(user);

				const dlimit = (+new Date) / 1000 - 300;
				let isNetsplit = false;
				if (chat.netJoinUsers[channelName] && chat.netJoinUsers[channelName][user.nick]) {
					if (chat.netJoinUsers[channelName][user.nick] > dlimit) {
						isNetsplit = true;
					}
					delete chat.netJoinUsers[channelName][user.nick];
				}

				events.emit('channel:userJoined', {
					channelName: channelName,
					nick: user.nick,
					ident: user.ident,
					host: user.host,
					isNetsplit: isNetsplit,
					time: data.time
				});

				// If extended-join is not available, request WHO for this user to get account info
				if (typeof chat.activeCaps !== 'undefined' && !('extended-join' in chat.activeCaps)) {
					events.emit('chat:requestChannelMemberInfo', { channel: user.nick });
				}
			} else {
				// Server protocol violation: received JOIN for channel we're not in
				console.error('Server protocol violation: Received JOIN for', channelName, 'from', user.nick, 'but we are not a member of this channel');

				// Optionally show in status window
				events.emit('server:userJoinedOtherChannel', {
					channelName: channelName,
					nick: user.nick,
					ident: user.ident,
					host: user.host,
					time: data.time
				});
			}
		}
	});

	events.on('protocol:metadataCommand', (data) => {
		// Handle METADATA protocol events
		// data.target, data.key, data.subCommand, data.value
		const { target, key, value } = data;
		let user = null;

		if (target.charAt(0) === '#') { // Channel metadata
			// Channel metadata handling (if needed in future)
		} else { // User metadata
			user = chat.users.getUser(target);
			user.setMetadata(key, value);
		}

		events.emit('metadata:updated', {
			target,
			user,
			key,
			subCommand: data.subCommand,
			value
		});
	});

	events.on('protocol:modeCommand', (data) => {
		const target = data.target; // Channel or user nick
		if (data.isChannel) { // Protocol layer determines if target is a channel
			const channelName = target;

			// Parse mode string into mode chars and arguments
			const modeSpecPart = data.modes || '';
			const modeArgs = data.modeArgs ? data.modeArgs.slice(0) : [];

			// Mode categories - member status modes always take a nick argument
			const memberStatusModes = (chat.modes.user && chat.modes.user.length) ? chat.modes.user : ['o', 'v', 'h', 'a', 'q'];
			// Channel modes that take an arg only when adding
			const argAddOnlyModes = (chat.modes.argAdd && chat.modes.argAdd.length) ? chat.modes.argAdd : ['k', 'l', 'f', 'j', 'L'];
			// Channel modes that always take an arg (both add and remove)
			const argBothModes = (chat.modes.argBoth && chat.modes.argBoth.length) ? chat.modes.argBoth : ['b', 'e', 'I'];

			let argIndex = 0;
			let isAdding = true;
			let currentSign = '+';
			let chanModeChars = '';    // compact channel-only mode string (no member modes)
			const chanModeParams = [];   // args for channel-only modes

			for (let mi = 0; mi < modeSpecPart.length; mi++) {
				const ch = modeSpecPart[mi];
				if (ch === '+') { isAdding = true; currentSign = '+'; continue; }
				if (ch === '-') { isAdding = false; currentSign = '-'; continue; }

				if (memberStatusModes.indexOf(ch) >= 0) {
					// Member status mode: consume the nick arg, emit chat event
					const nick = modeArgs[argIndex++] || '';
					const user = chat.users.getExistingUser(nick);
					if (user) {
						events.emit('chat:channelModeForUserChanged', {
							channelName: channelName,
							user: user,
							modeChange: { nick: nick, mode: ch, isAdding: isAdding, channelName: channelName },
							byNick: data.user.nick
						});
					}
				} else {
					// Channel setting mode: collect into clean mode string
					if (!chanModeChars || chanModeChars[chanModeChars.length - 1] !== currentSign) {
						chanModeChars += currentSign;
					}
					chanModeChars += ch;

					const takesArg = argBothModes.indexOf(ch) >= 0 || (isAdding && argAddOnlyModes.indexOf(ch) >= 0);
					if (takesArg && argIndex < modeArgs.length) {
						chanModeParams.push(modeArgs[argIndex++]);
					}
				}
			}

			// Emit channel:modesUpdated only if there are actual channel-setting mode changes
			if (chanModeChars.replace(/[+-]/g, '') !== '') {
				events.emit('channel:modesUpdated', {
					channelName: channelName,
					modes: chanModeChars,
					modeParams: chanModeParams,
					byNick: data.user.nick
				});
			}
		} else { // User mode
			// Check if this is for the current user
			const isSelf = (chat.me.userRef && target === chat.me.userRef.nick) || target === chat.me.nick;

			if (isSelf) {
				// Parse and apply the mode changes
				events.emit('chat:processUserModes', {
					modes: data.modes,
					time: data.time || new Date()
				});
			} else {
				// Mode change for another user - emit generic event
				events.emit('user:modeChanged', {
					nick: target,
					modes: data.modes,
					byNick: data.user.nick,
					time: data.time || new Date()
				});
			}
		}
	});

	events.on('protocol:nickCommand', ({ user, newNick }) => {
		const oldNick = user.nick;

		// Track previous nick to suppress spurious 401 errors for the old nick
		if (chat.me.userRef && user.id === chat.me.userRef.id) {
			chat.me.previousNick = oldNick;
		}

		// The users.changeNick function will update the global user list
		// and emit the chat:userNickChanged event which ChannelMemberList listens to.
		chat.users.changeNick(oldNick, newNick);
	});

	// When our own nick changes to the desired nickserv nick while in a ghost state,
	// clear the recover fallback timer and check if the connection can advance.
	// Also: any nick change while in wrongPassword resets to connected state.
	events.on('chat:meNickChanged', ({ newNick }) => {
		if (newNick === chat.me.nickservnick) {
			if (chat.recoverTimeout) {
				clearTimeout(chat.recoverTimeout);
				chat.recoverTimeout = null;
			}
			if (chat.connectStatus === 'ghostSent' || chat.connectStatus === 'ghostAndNickSent') {
				events.emit('chat:processConnectionStatusUpdate');
			}
		}
		if (chat.connectStatus === 'wrongPassword') {
			chat.connectStatus = 'identified';
			events.emit('chat:processConnectionStatusUpdate');
		}
	});

	events.on('protocol:noticeCommand', (data) => {
		// ChatIntegrator layer: determine message state and emit abstracted event
		// Extract only necessary fields from tags - don't pass raw tags to UI
		const tags = data.tags || {};
		const sender = data.user || { nick: data.prefix, ident: '', host: '', server: true };

		// Use server-provided timestamp if available (e.g., from history), otherwise use local time
		const messageTime = tags.time ? new Date(tags.time) : (data.time || new Date());

		const messageState = {
			messageType: 'notice',     // Message type
			text: data.message,
			dest: data.target,
			sender: sender,
			time: messageTime,

			// Abstracted tag fields
			msgid: tags.msgid || null,
			serverTime: tags.time || null,
			label: tags.label || null,

			// Abstracted state
			isHidden: false,
			isHistory: false,
			isOutgoing: false,
			isPending: false,
			isEcho: false,
			labelToReplace: null,
			shouldSkipDisplay: false
		};

		// Check if message should be hidden
		if (messageState.label && chat.labelsToHide.indexOf(messageState.label) !== -1) {
			messageState.isHidden = true;
			return;
		}

		// Filter notices from ignored users (skip server notices)
		if (!sender.server && !chat.isOwnUser(sender)) {
			const ignoreType = data.isChannel ? 'channel' : 'query';
			if (ignore.ignoring(sender, ignoreType))
				return;
		}

		// Check if this is from a chat history batch
		let historyBatch = null;
		if (tags.batch && tags.batch in chat.batch) {
			const batch = chat.batch[tags.batch];
			if (batch.type == 'chathistory') {
				messageState.isHistory = true;
				historyBatch = batch;
			} else {
				// Check parent batches
				for (const parent of batch.parents) {
					if (parent.type == 'chathistory') {
						messageState.isHistory = true;
						historyBatch = parent;
						break;
					}
				}
			}
		}

		// Track message stats in history batch
		if (historyBatch) {
			historyBatch.receivedMessages = (historyBatch.receivedMessages || 0) + 1;
			// Track oldest message for "load older" reference
			if (!historyBatch.oldestMsgid && tags.msgid) {
				historyBatch.oldestMsgid = tags.msgid;
			}
			if (!historyBatch.oldestTimestamp && tags.time) {
				historyBatch.oldestTimestamp = tags.time;
			}
		}

		// Emit abstracted message event
		events.emit('message:received', messageState);
	});

	// protocol:pingCommand removed — server PING/PONG handled directly in irc_protocol.js

	events.on('protocol:pongCommand', (data) => {
		chat.pingCnt = 0; // Reset ping counter — server is alive
		events.emit('server:pongReceived', {
			token: data.token
		});
	});

	events.on('protocol:partCommand', (data) => {
		const { channelName, partMessage, user } = data; // user = User who parted

		const cml = chat.users.getChannelMemberList(channelName);
		if (cml) {
			cml.removeMemberById(user.id); // Remove the ChannelMember
			if (user === chat.me.userRef && cml.getAllMembers().length === 0) {
				chat.users.removeChannelMemberList(channelName); // Remove the ChannelMemberList if empty and self parted
			}
		}

		// Emit event that a user has parted from a channel for the UI to update its channel object.
		events.emit('channel:userParted', {
			channelName: channelName,
			nick: user.nick,
			ident: user.ident,
			host: user.host,
			partMessage: partMessage,
			time: data.time
		});

		if (user === chat.me.userRef) { // If self parted
			// Emit specific event for UI to handle its own channel removal
			events.emit('user:selfPartedChannel', {
				channelName: channelName,
				nick: user.nick,
				partMessage: partMessage
			});
		}
	});

	events.on('protocol:kickCommand', (data) => {
		const { channelName, kickedNick, user: kicker } = data; // kicker = User who performed the kick
		const reason = data.reason || '';

		// Get the user object for the kicked user
		const kickedUser = chat.users.getExistingUser(kickedNick);
		if (!kickedUser) {
			console.warn('DOMAIN: KICK received for unknown user:', kickedNick);
			return;
		}

		// Remove kicked user from channel member list
		const cml = chat.users.getChannelMemberList(channelName);
		if (cml) {
			cml.removeMemberById(kickedUser.id);
			if (kickedUser === chat.me.userRef && cml.getAllMembers().length === 0) {
				chat.users.removeChannelMemberList(channelName);
			}
		}

		// Emit event that a user was kicked from a channel
		events.emit('channel:userKicked', {
			channelName: channelName,
			kickedNick: kickedUser.nick,
			kickedIdent: kickedUser.ident,
			kickedHost: kickedUser.host,
			kickerNick: kicker.nick,
			kickerIdent: kicker.ident,
			kickerHost: kicker.host,
			reason: reason,
			time: data.time
		});

		// If we were kicked, emit specific event for UI cleanup
		if (kickedUser === chat.me.userRef) {
			events.emit('user:selfKickedFromChannel', {
				channelName: channelName,
				kickerNick: kicker.nick,
				reason: reason
			});
		}
	});

	events.on('protocol:privmsgCommand', (data) => {
		// ChatIntegrator layer: determine message state and emit abstracted event
		// Extract only necessary fields from tags - don't pass raw tags to UI
		const tags = data.tags || {};

		// Use server-provided timestamp if available (e.g., from history), otherwise use local time
		const messageTime = tags.time ? new Date(tags.time) : data.time;

		const messageState = {
			messageType: 'message',    // Message type
			text: data.text,
			dest: data.dest,
			sender: data.sender,
			time: messageTime,

			// Abstracted tag fields - UI doesn't need to know about IRC tags
			msgid: tags.msgid || null,           // For deduplication
			serverTime: tags.time || null,       // Server-provided timestamp
			label: tags.label || null,           // For labeled-response tracking

			// Abstracted state - UI should not need to check caps/batches
			isHidden: false,           // Should this message be hidden? (password, etc.)
			isHistory: false,          // Is this from chat history batch?
			isOutgoing: false,         // Is this our own message?
			isPending: false,          // Is this awaiting delivery confirmation?
			isEcho: false,             // Is this an echo-message confirmation?
			labelToReplace: null,      // If echo, which label to replace
			shouldSkipDisplay: false   // Should UI skip displaying? (waiting for echo)
		};

		// Check if message should be hidden (contains password, etc.)
		if (messageState.label && chat.labelsToHide.indexOf(messageState.label) !== -1) {
			messageState.isHidden = true;
			transport.labelProcessed = true;
			// Don't emit display event for hidden messages
			return;
		}

		// Filter messages from ignored users
		if (!chat.isOwnUser(data.sender)) {
			const ignoreType = data.isChannel ? 'channel' : 'query';
			if (ignore.ignoring(data.sender, ignoreType))
				return;
		}

		// Check if this is from a chat history batch
		let historyBatch = null;
		if (tags.batch && tags.batch in chat.batch) {
			const batch = chat.batch[tags.batch];
			if (batch.type == 'chathistory') {
				messageState.isHistory = true;
				historyBatch = batch;
			} else {
				// Check parent batches
				for (const parent of batch.parents) {
					if (parent.type == 'chathistory') {
						messageState.isHistory = true;
						historyBatch = parent;
						break;
					}
				}
			}
		}

		// Track message stats in history batch
		if (historyBatch) {
			historyBatch.receivedMessages = (historyBatch.receivedMessages || 0) + 1;
			// Track oldest message for "load older" reference
			if (!historyBatch.oldestMsgid && tags.msgid) {
				historyBatch.oldestMsgid = tags.msgid;
			}
			if (!historyBatch.oldestTimestamp && tags.time) {
				historyBatch.oldestTimestamp = tags.time;
			}
		}

		// Check if this is our own message
		if (chat.isOwnUser(data.sender)) {
			messageState.isOutgoing = true;

			// If we have echo-message but not labeled-response, skip displaying outgoing (wait for echo)
			if (!('labeled-response' in chat.activeCaps) && ('echo-message' in chat.activeCaps)) {
				messageState.shouldSkipDisplay = true;
				return; // Don't display, wait for echo
			}

			// If we have both capabilities and this message has a label, check if it's an echo
			if (messageState.label && ('labeled-response' in chat.activeCaps) && ('echo-message' in chat.activeCaps)) {
				// Check if this is an echo (received from server) or our local pending message
				// Echo messages come from protocol:privmsgCommand, while pending messages come from chat:outgoingMessage
				// We can detect echo by checking if this came from the protocol layer (has batch support data)
				// Actually, simpler: if we're receiving a PRIVMSG with our label from protocol, it's an echo
				// Local pending messages are emitted from chat:outgoingMessage, not protocol

				// Check if this is from the protocol layer (has certain protocol-only data)
				const isFromProtocol = ('tags' in data) || ('raw' in data);

				if (isFromProtocol) {
					// This is an echo from the server
					messageState.isEcho = true;
					messageState.labelToReplace = messageState.label;
					transport.labelProcessed = true;
					messageState.isPending = false;
				} else {
					// This is our local pending message
					messageState.isPending = true;
				}
			}
		}

		// Emit abstracted message event with all necessary metadata
		events.emit('message:received', messageState);
	});

	events.on('chat:outgoingMessage', (data) => {
		// Handle outgoing messages sent by the user (display as pending while waiting for echo)
		// This creates the "pending" display that will be replaced by the echo-message
		const messageState = {
			messageType: data.messageType,
			dest: data.dest,
			text: data.text,
			sender: data.sender,
			time: data.time,
			isOutgoing: true,
			isPending: ('labeled-response' in chat.activeCaps) && ('echo-message' in chat.activeCaps),
			label: data.label,
			isEcho: false,
			labelToReplace: null,
			msgid: null,
			isHidden: false,
			isHistory: false
		};

		// Emit message:received event for UI display
		events.emit('message:received', messageState);
	});

	events.on('protocol:quitCommand', ({ quitMessage, user }) => { // user = User who quit

		if (user) {
			// Collect channels where the user was a member before removing them
			const affectedChannels = [];
			chat.users.channelMemberLists.forEach((cml) => {
				if (cml.findMemberById(user.id)) {
					affectedChannels.push(cml.channelName);
				}
			});

			// Remove user from all ChannelMemberLists they were part of
			chat.users.channelMemberLists.forEach((cml) => {
				cml.removeMemberById(user.id);
			});

			const isNetsplit = Boolean(quitMessage && quitMessage.match(/^[^ :]+\.[^ :]+ [^ :]+\.[^ :]+$/));
			if (isNetsplit) {
				const timestamp = (+new Date) / 1000;
				for (const chanName of affectedChannels) {
					if (!chat.netJoinUsers[chanName]) chat.netJoinUsers[chanName] = {};
					chat.netJoinUsers[chanName][user.nick] = timestamp;
				}
			}

			if (user === chat.me.userRef) { // Own quit
				events.emit('user:selfQuit', {
					nick: user.nick,
					quitMessage: quitMessage,
					channels: affectedChannels
				});
			} else { // Other user quit
				events.emit('user:otherQuit', {
					user: { nick: user.nick, ident: user.ident, host: user.host },
					quitMessage: quitMessage,
					channels: affectedChannels,
					isNetsplit: isNetsplit,
					time: new Date()
				});
			}
		}
	});

	events.on('protocol:setnameCommand', (data) => {
		if (data.user === chat.me.userRef) { // Own realname change
			chat.me.setRealname(data.newRealname);
		}
		events.emit('user:realnameChanged', {
			nick: data.user.nick,
			newRealname: data.newRealname
		});
	});

	events.on('protocol:topicCommand', (data) => {
		const { channelName, topic, user } = data; // user = Who set the topic

		// Emit event that a channel's topic has changed for the UI to update its channel object.
		events.emit('channel:topicChanged', {
			channelName: channelName,
			topic: topic,
			setBy: user.nick,
			setDate: data.time.getTime() / 1000
		});
	});

	// Numeric handlers

	events.on('protocol:rplWelcome', (data) => {
		// Update client state after successful connection and welcome message
		chat.connectStatus = '001';

		// Finalize our user object: move the '*' placeholder to our actual nick
		chat.users.knowOwnNick();

		// If the server assigned a different nick than we requested, handle the forced change
		if (data.welcomeTarget && data.welcomeTarget !== chat.me.nick) {
			chat.me.previousNick = chat.me.nick;
			chat.users.changeNick(chat.me.nick, data.welcomeTarget);
		}

		events.emit('client:welcome', {
			target: data.welcomeTarget,
			message: data.message
		});
		// Explicitly emit client:connected after welcome for UI
		events.emit('client:connected', {});
	});

	// ChatIntegrator logic for client:connected event
	events.on('client:connected', (data) => {
		console.debug('DOMAIN: Client connected, handling chat-level setup');
		events.emit('chat:setConnectedWhenIdentified'); // Signal chat layer
		events.emit('chat:clearConnectTimeout'); // Clear connection timeout
		// Start keepalive ping interval to prevent server/NAT from closing idle connections
		clearInterval(chat.pingIntervalID);
		chat.pingIntervalID = setInterval(() => {
			events.emit('chat:requestPing');
		}, 30000);
	});

	events.on('protocol:rplYourhost', (data) => {
		events.emit('server:yourHost', {
			hostTarget: data.hostTarget,
			message: data.message
		});
	});

	events.on('protocol:rplCreated', (data) => {
		events.emit('server:createdInfo', {
			createdTarget: data.createdTarget,
			message: data.message
		});
	});

	events.on('protocol:rplMyinfo', (data) => {
		// Store this info in a global/chat state if needed
		// gateway.serverInfo = { ... }; // This should be managed directly within chat or via properties
		events.emit('server:myInfo', {
			serverName: data.serverName,
			version: data.version,
			userModes: data.userModes,
			channelModes: data.channelModes
		});
	});

	events.on('protocol:rplIsupport', (data) => {
		// Parse and store ISUPPORT tokens
		data.tokens.forEach(token => {
			const [key, value] = token.split('=');
			chat.isupport[key] = value || true;
		});
		events.emit('chat:parseIsupport');
		events.emit('server:isupportUpdated', {
			isupport: chat.isupport
		});
	});

	events.on('protocol:rplUmodes', (data) => {
		// RPL_UMODES (221): server is telling us our complete mode string
		// Clear existing modes and parse the new mode string
		chat.me.clearUmodes();

		// Parse the mode string using chat:processUserModes
		if (data.umodes) {
			const modes = data.umodes;
			let plus = false;
			for (let i = 0; i < chat.modes.length; i++) {
				const c = chat.modes.charAt(i);
				switch (c) {
					case '+': plus = true; break;
					case '-': plus = false; break;
					case ' ': return;
					default: chat.me.setUmode(c, plus); break;
				}
			}
		}

		// Emit user:settingInfo event with the umode string
		const umodeString = getUmodeString();
		events.emit('user:settingInfo', {
			nick: chat.me.userRef ? chat.me.userRef.nick : chat.me.nick,
			settingString: umodeString,
			time: data.time || new Date()
		});
	});

	events.on('protocol:rplNone', (data) => {
		// Generic empty numeric, usually safe to ignore or log
		console.debug('DOMAIN: RPL_NONE received:', data.message);
		events.emit('server:genericMessage', {
			type: 'none',
			message: data.message
		});
	});

	events.on('protocol:rplAway', (data) => {
		const user = chat.users.getUser(data.awayNick);
		if (user) {
			user.setAway(data.awayMessage);
			events.emit('user:awayStatusChanged', {
				nick: user.nick,
				awayMessage: data.awayMessage,
				isAway: true
			});
		}
	});

	events.on('protocol:rplUserhost', (data) => {
		// Parse reply and update user info
		const parts = data.reply.match(/([^=]+)=([^@]+)@(.*)/);
		if (parts) {
			const nick = parts[1];
			const ident = parts[2];
			const host = parts[3];
			const user = chat.users.getUser(nick);
			if (user) {
				user.setIdent(ident);
				user.setHost(host);
				events.emit('user:infoUpdated', {
					nick: nick,
					ident: ident,
					host: host,
				});
			}
		}
	});

	events.on('protocol:rplIson', (data) => {
		// Update status of nicks that are on IRC
		data.nicks.forEach(nick => {
			const user = chat.users.getUser(nick);
			if (user) {
				// Online status is ISON-specific, not stored permanently
				events.emit('user:onlineStatusChanged', {
					nick: nick,
					isOnline: true
				});
			}
		});
	});

	events.on('protocol:rplText', (data) => {
		// Generic text message from server, often for notices or errors
		events.emit('server:genericMessage', {
			type: 'text',
			message: data.message,
		});
	});

	events.on('protocol:rplUnaway', (data) => {
		if (chat.me.userRef) {
			chat.me.userRef.notAway();
			events.emit('user:awayStatusChanged', {
				nick: chat.me.userRef.nick,
				isAway: false,
			});
		}
	});

	events.on('protocol:rplNowaway', (data) => {
		if (chat.me.userRef) {
			chat.me.userRef.setAway(data.message);
			events.emit('user:awayStatusChanged', {
				nick: chat.me.userRef.nick,
				awayMessage: data.message,
				isAway: true,
			});
		}
	});

	events.on('protocol:rplWhoisregnick', (data) => {
		// WHOIS-specific data - don't update permanent user state
		// Only accumulate for WHOIS display
		chat.whoisData.isRegistered = true;
	});

	events.on('protocol:rplRulesstart', (data) => {
		events.emit('server:rulesStart', {
			target: data.target,
			message: data.message,
		});
	});

	events.on('protocol:rplEndofrules', (data) => {
		events.emit('server:endOfRules', {
			target: data.target,
			message: data.message,
		});
	});

	events.on('protocol:rplWhoishelpop', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.isHelpop = true;
	});

	// Accumulator for WHOIS data
	// chat.whoisData global for chat
	events.on('protocol:rplWhoisuser', (data) => {
		// WHOIS-specific data - don't update permanent user state
		// Only accumulate for WHOIS display
		chat.whoisData.nick = data.nick;
		chat.whoisData.ident = data.ident;
		chat.whoisData.host = data.host;
		chat.whoisData.realname = data.realname;
		chat.whoisData.isWhowas = false;
	});

	events.on('protocol:rplWhoisserver', (data) => {
		// WHOIS-specific data - don't update permanent user state
		// Only accumulate for WHOIS display
		chat.whoisData.server = data.server;
		chat.whoisData.serverInfo = data.serverInfo;
	});

	events.on('protocol:rplWhoisoperator', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.operatorInfo = data.message;
	});

	events.on('protocol:rplWhowasuser', ({ nick, ident, host, realname }) => {
		// This is information about a user who is no longer online
		events.emit('user:whowasInfo', {
			nick,
			ident,
			host,
			realname,
		});
		chat.whoisData.nick = nick;
		chat.whoisData.ident = ident;
		chat.whoisData.host = host;
		chat.whoisData.realname = realname;
		chat.whoisData.isWhowas = true;
	});

	events.on('protocol:rplEndofwho', (data) => {
		events.emit('channel:endOfWho', {
			target: data.target,
			query: data.query,
			message: data.message,
		});
	});

	events.on('protocol:rplWhoisidle', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.idleSeconds = data.idleSeconds;
		chat.whoisData.signOn = data.signOn;
	});

	events.on('protocol:rplEndofwhois', (data) => {
		console.debug('[WHOIS-DEBUG] End of WHOIS for', data.nick, 'accumulated data:', chat.whoisData);
		events.emit('user:endOfWhois', {
			nick: data.nick,
		});
		events.emit('user:whoisComplete', { // Emit consolidated WHOIS data
			nick: data.nick,
			data: chat.whoisData,
		});
		chat.whoisData = {}; // Clear accumulator
	});

	events.on('protocol:rplWhoischannels', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.channels = data.channels;
	});

	events.on('protocol:rplWhoisspecial', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.specialStatus = data.message;
	});

	// chat.smallListData global for chat
	events.on('protocol:rplListstart', (data) => {
		const label = (data.batch && data.batch.label) || (data.tags && data.tags.label) || null;
		events.emit('server:listStart', {
			message: data.message,
			label: label,
		});
		chat.smallListData = []; // Initialize accumulator
	});

	events.on('protocol:rplList', (data) => {
		// Accumulate channel list information
		chat.smallListData.push({
			channel: data.channel,
			visibleUsers: data.visibleUsers,
			topic: data.topic
		});
		events.emit('server:channelListItem', {
			channel: data.channel,
			visibleUsers: data.visibleUsers,
			topic: data.topic,
		});
	});

	events.on('protocol:rplEndoflist', (data) => {
		const label = (data.batch && data.batch.label) || (data.tags && data.tags.label) || null;
		events.emit('server:endOfList', {
			message: data.message,
		});
		events.emit('list:smallListComplete', { // Emit consolidated list data
			smallListData: chat.smallListData.map(item => [item.channel, item.visibleUsers, item.topic]),
			label: label, // Present iff this was a labeled (sidebar) request
		});
		chat.smallListData = []; // Clear accumulator
	});

	events.on('protocol:rplChannelmodeis', (data) => {
		// Emit event that a channel's modes have been reported/updated for the UI to update its channel object.
		events.emit('channel:modesUpdated', {
			channelName: data.channelName,
			modes: data.modes,
			modeParams: data.modeParams,
		});
	});

	events.on('protocol:rplCreationtime', (data) => {
		chat.whoisData.creationTime = data.creationTime;
		events.emit('channel:creationTimeUpdated', {
			channelName: data.channelName,
			creationTime: data.creationTime,
		});
	});

	events.on('protocol:rplWhoisloggedin', (data) => {
		// WHOIS-specific data - don't update permanent user state
		// Only accumulate for WHOIS display
		chat.whoisData.account = data.account;
	});

	events.on('protocol:rplNotopic', (data) => {
		const channelKey = data.channelName.toLowerCase();

		// Check if channel is being initially joined
		if (chat.channelsInitializing[channelKey]) {
			// Accumulate "no topic" data for channel creation event
			chat.channelsInitializing[channelKey].topic = '';
			chat.channelsInitializing[channelKey].topicSetBy = '';
			chat.channelsInitializing[channelKey].topicSetDate = 0;
		} else {
			// Channel already exists - emit event for UI to update
			events.emit('channel:topic', {
				channelName: data.channelName,
				topic: '',
				setBy: '',
				setDate: 0,
			});
		}
	});

	events.on('protocol:rplTopic', (data) => {
		const channelKey = data.channelName.toLowerCase();

		// Check if channel is being initially joined
		if (chat.channelsInitializing[channelKey]) {
			// Accumulate topic data for channel creation event
			chat.channelsInitializing[channelKey].topic = data.topic;
		} else {
			// Channel already exists - emit event for UI to update
			events.emit('channel:topic', {
				channelName: data.channelName,
				topic: data.topic,
			});
		}
	});

	events.on('protocol:rplTopicwhotime', (data) => {
		const channelKey = data.channelName.toLowerCase();

		// Check if channel is being initially joined
		if (chat.channelsInitializing[channelKey]) {
			// Accumulate topic metadata for channel creation event
			chat.channelsInitializing[channelKey].topicSetBy = data.setBy;
			chat.channelsInitializing[channelKey].topicSetDate = data.setDate;
		} else {
			// Channel already exists - emit event for UI to update topic metadata
			events.emit('channel:topicInfoUpdated', {
				channelName: data.channelName,
				setBy: data.setBy,
				setDate: data.setDate,
			});
		}
	});

	events.on('protocol:rplListsyntax', (data) => {
		events.emit('server:listsyntaxInfo', {
			message: data.message,
		});
	});

	events.on('protocol:rplWhoisbot', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.isBot = true;
	});

	// Invite list aggregation (WHOIS-style pattern)
	const pendingInviteLists = {}; // Temporary storage for invite list entries

	events.on('protocol:rplInvitlist', (data) => {
		const channelName = data.channelName;
		if (!pendingInviteLists[channelName]) {
			pendingInviteLists[channelName] = [];
		}
		pendingInviteLists[channelName].push({
			mask: data.usermask,
			setBy: data.setBy,
			setAt: data.setDate,
		});
	});

	events.on('protocol:rplEndofinvitelist', (data) => {
		const channelName = data.channelName;
		const entries = pendingInviteLists[channelName] || [];
		events.emit('channel:inviteListComplete', {
			channelName: channelName,
			entries: entries,
			message: data.message,
		});
		delete pendingInviteLists[channelName];
	});

	events.on('protocol:rplUserip', (data) => {
		const user = chat.users.getUser(data.nick);
		if (user) {
			// IP address is WHOIS-specific, stored in chat.whoisData
			events.emit('user:ipAddressUpdated', {
				nick: user.nick,
				ipAddress: data.userIp,
			});
		}
	});

	events.on('protocol:rplInviting', (data) => {
		// The server is telling us that `byNick` invited `nick` to `channel`
		events.emit('client:invited', {
			byNick: data.user.nick, // Assuming data.user is the inviter
			targetNick: data.nick,
			channelName: data.channelName,
		});
	});

	events.on('protocol:rplSummoning', (data) => {
		events.emit('user:summoned', {
			nick: data.nick,
			message: data.message,
		});
	});

	events.on('protocol:rplWhoiscountry', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.countryCode = data.countryCode;
		chat.whoisData.countryName = data.countryName;
	});

	// Exception list aggregation (WHOIS-style pattern)
	const pendingExceptLists = {}; // Temporary storage for except list entries

	events.on('protocol:rplExceptlist', (data) => {
		const channelName = data.channelName;
		if (!pendingExceptLists[channelName]) {
			pendingExceptLists[channelName] = [];
		}
		pendingExceptLists[channelName].push({
			mask: data.exceptionMask,
			setBy: data.setBy,
			setAt: data.setDate,
		});
	});

	events.on('protocol:rplEndofexceptlist', (data) => {
		const channelName = data.channelName;
		const entries = pendingExceptLists[channelName] || [];
		events.emit('channel:exceptListComplete', {
			channelName: channelName,
			entries: entries,
			message: data.message,
		});
		delete pendingExceptLists[channelName];
	});

	events.on('protocol:rplVersion', (data) => {
		events.emit('server:versionInfo', {
			serverName: data.prefix, // From data.prefix
			version: data.version,
			debugLevel: data.debugLevel,
			comments: data.comments,
		});
	});

	events.on('protocol:rplWhoreply', (data) => {
		// Get chat-level user object. Assume users.getUser creates if not exists.
		const user = chat.users.getUser(data.nick);

		// Update chat-level user properties
		user.setIdent(data.ident);
		user.setHost(data.host);
		user.setServer(data.server);
		user.setRealname(data.realname);
		// user.setModes(data.flags); // This might require further parsing

		// Emit event with updated user info for the UI
		events.emit('user:infoUpdated', {
			nick: data.nick,
			channelName: data.channelName, // Pass channel name as context for UI
			ident: data.ident,
			host: data.host,
			server: data.server,
			realname: data.realname,
			flags: data.flags,
		});

		// If a channel name is provided, signal the UI that the user is in this channel.
		// The UI layer should handle idempotency (e.g., if the user is already listed).
		if (data.channelName) {
			events.emit('channel:userJoined', {
				channelName: data.channelName,
				nick: user.nick,
				ident: user.ident,
				host: user.host,
			});
		}
	});

	events.on('protocol:rplNamreply', ({ channelName, names }) => {

		// Get or create ChannelMemberList for this channel
		const cml = chat.users.addChannelMemberList(channelName);

		const statusModes = (chat.modes.user && chat.modes.user.length) ? chat.modes.user : ['o', 'v', 'h', 'a', 'q'];
		const namedModes = { 'o': 'op', 'v': 'voice', 'h': 'halfop', 'a': 'admin', 'q': 'owner' };
		names.forEach(nickEntry => {
			let modeStr = '';
			let nick = nickEntry;
			let ident = '';
			let host = '';

			// Full parsing of modes/prefixes from nickEntry
			const userChannelModes = {};
			let userLevel = 0;

			// Strip channel status prefixes (@, +, etc.)
			if (chat.isupport.PREFIX) {
				const prefixes = chat.isupport.PREFIX.match(/\((.*?)\)(.+)/);
				if (prefixes) {
					const modeChars = prefixes[1];
					const prefixChars = prefixes[2];
					for (let i = 0; i < prefixChars.length; i++) {
						if (nick.startsWith(prefixChars[i])) {
							modeStr += modeChars[i];
							nick = nick.substring(1);
						}
					}
				} else { // Fallback for common prefixes if ISUPPORT is malformed
					if (nick.startsWith('@')) { modeStr += 'o'; nick = nick.substring(1); }
					else if (nick.startsWith('+')) { modeStr += 'v'; nick = nick.substring(1); }
				}
			}

			// Parse nick!ident@host if server sent extended format
			const exclamIdx = nick.indexOf('!');
			if (exclamIdx !== -1) {
				const atIdx = nick.indexOf('@', exclamIdx);
				if (atIdx !== -1) {
					ident = nick.substring(exclamIdx + 1, atIdx);
					host = nick.substring(atIdx + 1);
					nick = nick.substring(0, exclamIdx);
				}
			}
			// Apply parsed modes to userChannelModes object using ISUPPORT PREFIX data
			for (let mi = 0; mi < modeStr.length; mi++) {
				const modeChar = modeStr.charAt(mi);
				const modeIndex = statusModes.indexOf(modeChar);
				if (modeIndex >= 0) {
					const levelForMode = statusModes.length - modeIndex; // index 0 = highest privilege
					if (levelForMode > userLevel) userLevel = levelForMode;
					if (namedModes[modeChar]) userChannelModes[namedModes[modeChar]] = true;
				}
			}

			// Get or create chat-level user object (this object is global to all channels)
			const user = chat.users.getUser(nick); // users.getUser handles creation if it doesn't exist

			// Set ident and host if provided in extended NAMES format
			if (ident) user.setIdent(ident);
			if (host) user.setHost(host);

			// Temporarily assign channel-specific properties to the user object for ChannelMember creation
			user.channelModes = userChannelModes;
			user.level = userLevel;

			cml.addMember(user); // Add to ChannelMemberList, which will read channelModes and level

			// Clean up temporary properties from global user object if it was modified
			delete user.channelModes;
			delete user.level;
		});

		// The original event 'channel:namesReplyComplete' is no longer strictly needed for nicklist UI
		// but may be used by other parts of the system. I will keep it for compatibility,
		// using cml.getAllMembers() to construct the data.
		events.emit('channel:namesReplyComplete', {
			channelName: channelName,
			users: cml.getAllMembers().map(member => ({
				nick: member.user.nick,
				// Reconstruct modes string for compatibility if needed by other listeners
				modes: (member.channelModes.owner ? 'q' : '') +
                   (member.channelModes.admin ? 'a' : '') +
                   (member.channelModes.op ? 'o' : '') +
                   (member.channelModes.halfop ? 'h' : '') +
                   (member.channelModes.voice ? 'v' : ''),
				ident: member.user.ident,
				host: member.user.host
			})),
		});
	});

	events.on('protocol:rplWhospcrpl', (data) => {
		const { nick, ident, host, gecos, realname, server, status } = data;

		// Normalize account field: "*", "0", and empty string mean not logged in
		const account = (data.account === '*' || data.account === '0' || data.account === '') ? false : data.account;

		// Parse status flags (format: [H|G][*][@|+|etc])
		// H = here (not away), G = gone (away), * = IRC operator, B = bot
		// Note: Channel status prefixes (@, +, etc.) are handled by NAMES/MODE, not WHO
		const isAway = status && status.charAt(0) === 'G'; // First char indicates away status
		const isIrcOp = status && status.indexOf('*') !== -1;
		const isBot = status && status.indexOf('B') !== -1;

		const realName = gecos || realname;
		const user = chat.users.getUser(nick);
		if (user) {
			user.setIdent(ident);
			user.setHost(host);
			// Use gecos if available (from msg.text), otherwise use realname (from args[7])
			user.setRealname(realName);
			user.setAccount(account);
			// Set away status based on H/G flag
			if (isAway) {
				user.setAway(true); // Match old code behavior
			} else {
				user.notAway();
			}
			// Set IRC operator status
			if (user.ircOp !== isIrcOp) {
				user.setIrcOp(isIrcOp);
			}
			// Set bot status
			if (user.bot !== isBot) {
				user.setBot(isBot);
			}

			events.emit('user:extendedInfoUpdated', {
				nick: user.nick,
				ident,
				host,
				server,
				realname: realName,
				account,
				status,
				away: isAway,
				ircOp: isIrcOp,
				bot: isBot
			});
		} else {
			const newUser = chat.users.addUser(nick);
			newUser.setIdent(ident);
			newUser.setHost(host);
			newUser.setRealname(realName);
			newUser.setAccount(account);
			if (isAway) {
				newUser.setAway('away');
			}
			if (isIrcOp) {
				newUser.setIrcOp(isIrcOp);
			}
			if (isBot) {
				newUser.setBot(isBot);
			}
			events.emit('user:extendedInfoUpdated', {
				nick,
				ident,
				host,
				server,
				realname: realName,
				account,
				status,
				away: isAway,
				ircOp: isIrcOp,
				bot: isBot
			});
		}
	});

	events.on('protocol:rplKilldone', (data) => {
		events.emit('server:killConfirmed', {
			nick: data.nick,
			reason: data.message, // data.text in protocolGeneric
		});
	});

	events.on('protocol:rplClosing', (data) => {
		events.emit('server:closingConnection', {
			server: data.serverName,
			message: data.message,
		});
	});

	events.on('protocol:rplCloseend', (data) => {
		events.emit('server:closeCommandEnded', {
			message: data.message,
		});
	});

	events.on('protocol:rplLinks', (data) => {
		events.emit('server:linkInfo', {
			linkName: data.linkName,
			remoteServer: data.remoteServer,
			hopCount: data.hopCount,
			info: data.info,
		});
	});

	events.on('protocol:rplEndoflinks', (data) => {
		events.emit('server:endOfLinksList', {
			mask: data.mask,
			message: data.message,
		});
	});

	events.on('protocol:rplEndofnames', ({ channelName }) => {
		const channelKey = channelName.toLowerCase();

		// Check if this channel is being initially joined
		let cml, members;
		if (chat.channelsInitializing[channelKey]) {
			// Get the complete member list from chat
			cml = chat.users.getChannelMemberList(channelName);
			if (cml) {
				members = cml.getAllMembers(); // Get all ChannelMember objects

				// Check if server supports chat history
				const historySupported = ('draft/chathistory' in chat.activeCaps) && ('CHATHISTORY' in chat.isupport);
				const historyMaxLimit = historySupported ? (chat.isupport['CHATHISTORY'] || 0) : 0;

				// Emit channel:channelCreation with complete initial data
				events.emit('channel:channelCreation', {
					channelName: channelName,
					members: members, // Complete member list with all privileges
					joinTime: chat.channelsInitializing[channelKey].joinTime,
					// Include our own user info for the join message
					nick: chat.me.userRef.nick,
					ident: chat.me.userRef.ident,
					host: chat.me.userRef.host,
					// Include topic data if available
					topic: chat.channelsInitializing[channelKey].topic || '',
					topicSetBy: chat.channelsInitializing[channelKey].topicSetBy || '',
					topicSetDate: chat.channelsInitializing[channelKey].topicSetDate || 0,
					// Include history support info for UI
					historySupported: historySupported,
					historyMaxLimit: historyMaxLimit
				});

				// Remove from initializing list
				delete chat.channelsInitializing[channelKey];
			}
		} else {
			// This is a NAMES refresh (not initial join)
			// Emit channel:memberListReplace to tell UI to rebuild nicklist
			cml = chat.users.getChannelMemberList(channelName);
			if (cml) {
				members = cml.getAllMembers();
				events.emit('channel:memberListReplace', {
					channelName: channelName,
					members: members
				});
			}
		}
	});

	// Ban list aggregation (WHOIS-style pattern)
	const pendingBanLists = {}; // Temporary storage for ban list entries

	events.on('protocol:rplBanlist', (data) => {
		const channelName = data.channelName;
		if (!pendingBanLists[channelName]) {
			pendingBanLists[channelName] = [];
		}
		pendingBanLists[channelName].push({
			mask: data.banmask,
			setBy: data.setBy,
			setAt: data.setAt,
		});
	});

	events.on('protocol:rplEndofbanlist', (data) => {
		const channelName = data.channelName;
		const entries = pendingBanLists[channelName] || [];
		events.emit('channel:banListComplete', {
			channelName: channelName,
			entries: entries,
			message: data.message,
		});
		delete pendingBanLists[channelName];
	});

	events.on('protocol:rplEndofwhowas', (data) => {
		events.emit('user:endOfWhowas', {
			nick: data.nick,
			message: data.message,
		});
	});

	events.on('protocol:rplInfo', (data) => {
		// RPL_INFO (371) - Server info line
		// Not displayed (old code also ignored this)
	});

	events.on('protocol:rplMotd', (data) => {
		events.emit('server:motdLine', {
			line: data.line,
		});
	});

	events.on('protocol:rplInfostart', (data) => {
		// RPL_INFOSTART (373) - Server info start
		// Not displayed (old code also ignored this)
	});

	events.on('protocol:rplEndofinfo', (data) => {
		events.emit('server:endOfInfo', {
			message: data.message,
		});
	});

	events.on('protocol:rplMotdstart', (data) => {
		const serverNameMatch = data.message.match(/^- ([^ ]+) Message of the day -/);
		const serverName = serverNameMatch ? serverNameMatch[1] : '';
		events.emit('server:motdStart', {
			server: serverName,
			message: data.message,
		});
	});

	events.on('protocol:rplEndofmotd', (data) => {
		events.emit('server:endOfMotd', {
			message: data.message,
		});
	});

	events.on('protocol:rplWhoishost', (data) => {
		// WHOIS-specific data - don't update permanent user state
		// Only accumulate for WHOIS display (actual host for opers)
		chat.whoisData.hostInfo = data.host;
	});

	events.on('protocol:rplWhoismodes', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.userModes = data.modes;
	});

	events.on('protocol:rplYoureoper', (data) => {
		// Assume current user (chat.me.userRef) is the oper
		if (chat.me.userRef) {
			chat.me.userRef.setOperator(true);
		}
		events.emit('user:isOperator', {
			nick: chat.me.userRef ? chat.me.userRef.nick : null,
			message: data.message,
		});
	});

	events.on('protocol:rplRehashing', (data) => {
		events.emit('server:rehashingConfig', {
			configFile: data.configFile,
			message: data.message,
		});
	});

	events.on('protocol:rplYoureservice', (data) => {
		if (chat.me.userRef) {
			chat.me.userRef.setService(true); // Assuming `setService` method
		}
		events.emit('user:isService', {
			nick: chat.me.userRef ? chat.me.userRef.nick : null,
			message: data.message,
		});
	});

	events.on('protocol:rplMyportis', (data) => {
		events.emit('server:myPortInfo', {
			port: data.port,
			message: data.message,
		});
	});

	events.on('protocol:rplNotoperanymore', (data) => {
		if (chat.me.userRef) {
			chat.me.userRef.setOperator(false);
		}
		events.emit('user:isOperator', {
			nick: chat.me.userRef ? chat.me.userRef.nick : null,
			isOperator: false,
			message: data.message,
		});
	});

	// Quiet list (RPL_QLIST/RPL_ENDOFQLIST) not supported
	// Only ban (b), except (e), and invex (I) lists are implemented

	events.on('protocol:rplAlist', (data) => {
		// A list entries (admin list)
		events.emit('server:alistEntry', {
			channel: data.channelName,
			mask: data.mask,
			message: data.message,
		});
	});

	events.on('protocol:rplEndofalist', (data) => {
		events.emit('server:endOfAlist', {
			message: data.message,
		});
	});

	events.on('protocol:rplTime', (data) => {
		events.emit('server:serverTime', {
			server: data.prefix,
			time: data.serverTime,
		});
	});

	events.on('protocol:rplUsersstart', (data) => {
		events.emit('server:usersStart', {
			message: data.message,
		});
	});

	events.on('protocol:rplUsers', (data) => {
		// User info for USERS command
		events.emit('server:usersEntry', {
			username: data.username,
			tty: data.tty,
			host: data.host,
			nick: data.nick,
		});
	});

	events.on('protocol:rplEndofusers', (data) => {
		events.emit('server:endOfUsers', {
			message: data.message,
		});
	});

	events.on('protocol:rplNousers', (data) => {
		events.emit('server:noUsers', {
			message: data.message,
		});
	});

	events.on('protocol:rplHosthidden', (data) => {
		// RPL_HOSTHIDDEN - server confirming hidden host is active
		// Just emit event for UI to display the message
		events.emit('user:hostHidden', {
			nick: chat.me.userRef ? chat.me.userRef.nick : null,
			hiddenHost: data.hiddenHost,
			message: data.message,
			time: data.time
		});
	});

	events.on('protocol:errNosuchnick', (data) => {
		// Suppress 401 errors for our previous nick (e.g. after a nick change or server-forced rename)
		if (data.nick && data.nick === chat.me.previousNick) {
			return;
		}
		events.emit('client:errorMessage', {
			type: 'noSuchNick',
			message: data.message,
			target: data.nick,
		});
	});

	events.on('protocol:errNosuchserver', (data) => {
		events.emit('client:errorMessage', {
			type: 'noSuchServer',
			message: data.message,
			target: data.serverName,
		});
	});

	events.on('protocol:errNosuchchannel', (data) => {
		events.emit('client:errorMessage', {
			type: 'noSuchChannel',
			message: data.message,
			target: data.channelName,
		});
	});

	events.on('protocol:errCannotSendToChan', (data) => {
		// ERR_CANNOTSENDTOCHAN (404) - cannot send to channel
		console.debug('[LABEL-DEBUG] protocol:errCannotSendToChan handler, tags.label:', data.tags ? data.tags.label : 'no tags');
		// Emit channel-specific error event for UI display
		events.emit('channel:errorMessage', {
			channelName: data.channelName,
			reason: data.reason, // voiceNeeded, banned, noColor, noExternal, accountNeeded, or generic
			message: data.message, // Raw message for generic case
			time: data.time
		});
	});


	events.on('protocol:errWasnosuchnick', (data) => {
		events.emit('client:errorMessage', {
			type: 'wasNoSuchNick',
			message: data.message,
			target: data.nick,
		});
	});

	events.on('protocol:errNorecipient', (data) => {
		events.emit('client:errorMessage', {
			type: 'noRecipient',
			message: data.message,
		});
	});

	events.on('protocol:errErroneusnickname', (data) => {
		events.emit('client:errorMessage', {
			type: 'erroneousNickname',
			message: data.message,
			nick: data.nick,
		});
	});

	events.on('protocol:errNicknameinuse', (data) => {
		const duringRegistration = (chat.connectStatus === 'disconnected');
		let altNick = null;

		if (duringRegistration) {
			// Pre-registration nick collision: try an alternate nick automatically.
			// Increment trailing digits, or append random digits if none present.
			const nick = chat.me.nick;
			const match = nick.match(/^([^0-9]+)(\d*)$/);
			if (match && match[2] && !isNaN(match[2])) {
				altNick = match[1] + (parseInt(match[2]) + 1);
			} else {
				altNick = nick + Math.floor(Math.random() * 999);
			}
			chat.me.nick = altNick;
			events.emit('chat:changeNick', { nick: altNick });
		}

		chat.nickWasInUse = true;

		events.emit('chat:nickInUse', {
			nick: data.nick,
			currentNick: chat.me.nick,
			duringRegistration: duringRegistration,
			altNick: altNick,
			time: data.time
		});
	});

	events.on('protocol:errNotonchannel', (data) => {
		events.emit('client:errorMessage', {
			type: 'notOnChannel',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errUseronchannel', (data) => {
		events.emit('client:errorMessage', {
			type: 'userOnChannel',
			message: data.message,
			nick: data.nick,
			channel: data.channelName,
		});
	});

	events.on('protocol:errNonickchange', (data) => {
		events.emit('client:errorMessage', {
			type: 'noNickChange',
			message: data.message,
			nick: data.nick,
		});
	});

	events.on('protocol:errYouwillbebanned', (data) => {
		events.emit('client:errorMessage', {
			type: 'youWillBeBanned',
			message: data.message,
		});
	});

	events.on('protocol:errYoureBannedCreep', (data) => {
		// ERR_YOUREBANNEDCREEP (465) - User is banned from server
		// This requires special handling: show ban dialog and set connect status
		events.emit('client:globalBan', {
			message: data.message,
			time: data.time
		});
		// Set connection status to banned
		events.emit('chat:setConnectStatus', { status: 'banned' });
	});

	events.on('protocol:errKeyset', (data) => {
		events.emit('client:errorMessage', {
			type: 'keySet',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errOnlyserverscanchange', (data) => {
		events.emit('client:errorMessage', {
			type: 'onlyServersCanChange',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errLinkset', (data) => {
		events.emit('client:errorMessage', {
			type: 'linkSet',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errLinkchannel', (data) => {
		events.emit('client:errorMessage', {
			type: 'linkChannel',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errChannelisfull', (data) => {
		events.emit('client:errorMessage', {
			type: 'channelIsFull',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errUnknownmode', (data) => {
		events.emit('client:errorMessage', {
			type: 'unknownMode',
			message: data.message,
			mode: data.mode,
		});
	});

	events.on('protocol:errInviteonlychan', (data) => {
		events.emit('client:errorMessage', {
			type: 'inviteOnlyChan',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errBannedfromchan', (data) => {
		events.emit('client:errorMessage', {
			type: 'bannedFromChan',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errBadchannelkey', (data) => {
		events.emit('client:errorMessage', {
			type: 'badChannelKey',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errNeedreggednick', (data) => {
		events.emit('client:errorMessage', {
			type: 'needReggedNick',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errBanlistfull', (data) => {
		events.emit('client:errorMessage', {
			type: 'banListFull',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errLinkfail', (data) => {
		events.emit('client:errorMessage', {
			type: 'linkFail',
			message: data.message,
		});
	});

	events.on('protocol:errCannotknock', (data) => {
		events.emit('client:errorMessage', {
			type: 'cannotKnock',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errNoprivileges', (data) => {
		events.emit('client:errorMessage', {
			type: 'noPrivileges',
			message: data.message,
		});
	});

	events.on('protocol:errChanoprivsneeded', (data) => {
		events.emit('client:errorMessage', {
			type: 'chanOpPrivsNeeded',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errNononreg', (data) => {
		events.emit('client:errorMessage', {
			type: 'noNonreg',
			message: data.message,
		});
	});

	events.on('protocol:errNotforusers', (data) => {
		events.emit('client:errorMessage', {
			type: 'notForUsers',
			message: data.message,
		});
	});

	events.on('protocol:errSecureonlychan', (data) => {
		events.emit('client:errorMessage', {
			type: 'secureOnlyChan',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errNoswear', (data) => {
		events.emit('client:errorMessage', {
			type: 'noSwear',
			message: data.message,
		});
	});

	events.on('protocol:errNooperhost', (data) => {
		events.emit('client:errorMessage', {
			type: 'noOperHost',
			message: data.message,
		});
	});

	events.on('protocol:errNoctcp', (data) => {
		events.emit('client:errorMessage', {
			type: 'noCtcp',
			message: data.message,
		});
	});

	events.on('protocol:errChanownprivneeded', (data) => {
		events.emit('client:errorMessage', {
			type: 'chanOwnPrivNeeded',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errToomanyjoins', (data) => {
		events.emit('client:errorMessage', {
			type: 'tooManyJoins',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errUmodeunknownflag', (data) => {
		events.emit('client:errorMessage', {
			type: 'uModeUnknownFlag',
			message: data.message,
			mode: data.mode,
		});
	});

	events.on('protocol:errUsersdontmatch', (data) => {
		events.emit('client:errorMessage', {
			type: 'usersDontMatch',
			message: data.message,
		});
	});

	events.on('protocol:errSilelistfull', (data) => {
		events.emit('client:errorMessage', {
			type: 'sileListFull',
			message: data.message,
		});
	});

	events.on('protocol:errToomanywatch', (data) => {
		events.emit('client:errorMessage', {
			type: 'tooManyWatch',
			message: data.message,
		});
	});

	events.on('protocol:errNeedpong', (data) => {
		events.emit('client:errorMessage', {
			type: 'needPong',
			message: data.message,
		});
	});

	events.on('protocol:errToomanydcc', (data) => {
		events.emit('client:errorMessage', {
			type: 'tooManyDcc',
			message: data.message,
		});
	});

	events.on('protocol:errDisabled', (data) => {
		events.emit('client:errorMessage', {
			type: 'disabled',
			message: data.message,
		});
	});

	events.on('protocol:errNoinvite', (data) => {
		events.emit('client:errorMessage', {
			type: 'noInvite',
			message: data.message,
		});
	});

	events.on('protocol:errAdmonly', (data) => {
		events.emit('client:errorMessage', {
			type: 'admOnly',
			message: data.message,
		});
	});

	events.on('protocol:errOperonly', (data) => {
		events.emit('client:errorMessage', {
			type: 'operOnly',
			message: data.message,
		});
	});

	events.on('protocol:errListsyntax', (data) => {
		events.emit('client:errorMessage', {
			type: 'listSyntax',
			message: data.message,
		});
	});

	events.on('protocol:errCantsendtouser', (data) => {
		events.emit('client:errorMessage', {
			type: 'cantSendToUser',
			message: data.message,
			nick: data.nick,
		});
	});

	events.on('protocol:rplReaway', (data) => {
		events.emit('user:reAway', {
			message: data.message,
		});
	});

	events.on('protocol:rplGoneaway', (data) => {
		events.emit('user:goneAway', {
			message: data.message,
		});
	});

	events.on('protocol:rplNotaway', (data) => {
		if (chat.me.userRef) { // Ensure current user exists before updating
			chat.me.userRef.notAway();
		}
		events.emit('user:awayStatusChanged', { // Emit a consistent away status changed event
			nick: chat.me.userRef ? chat.me.userRef.nick : null,
			isAway: false,
			message: data.message,
		});
	});

	events.on('protocol:rplLogon', (data) => {
		events.emit('user:loggedIn', {
			message: data.message,
		});
	});

	events.on('protocol:rplLogoff', (data) => {
		events.emit('user:loggedOut', {
			message: data.message,
		});
	});

	events.on('protocol:rplWatchoff', (data) => {
		events.emit('client:watchOff', {
			message: data.message,
		});
	});

	events.on('protocol:rplWatchstat', (data) => {
		events.emit('client:watchStatus', {
			message: data.message,
		});
	});

	events.on('protocol:rplNowon', (data) => {
		const user = chat.users.getUser(data.nick); // Find user by nick from protocolGeneric
		if (user) {
			// Online status from JOIN, not stored permanently
			events.emit('user:onlineStatusChanged', {
				nick: user.nick,
				isOnline: true,
				message: data.message,
			});
		}
	});

	events.on('protocol:rplNowoff', (data) => {
		const user = chat.users.getUser(data.nick); // Find user by nick from protocolGeneric
		if (user) {
			// Online status from QUIT, not stored permanently
			events.emit('user:onlineStatusChanged', {
				nick: user.nick,
				isOnline: false,
				message: data.message,
			});
		}
	});

	events.on('protocol:rplWatchlist', (data) => {
		events.emit('client:watchListEntry', {
			message: data.message,
		});
	});

	events.on('protocol:rplEndofwatchlist', (data) => {
		events.emit('client:endOfWatchList', {
			message: data.message,
		});
	});

	events.on('protocol:rplClearwatch', (data) => {
		events.emit('client:clearWatch', {
			message: data.message,
		});
	});

	events.on('protocol:rplNowisaway', (data) => {
		events.emit('user:nowIsAway', {
			message: data.message,
		});
	});

	events.on('protocol:rplWhoissecure', (data) => {
		// WHOIS-specific data - don't access users storage
		chat.whoisData.isSecure = true;
	});

	events.on('protocol:errMlockrestricted', (data) => {
		events.emit('client:errorMessage', {
			type: 'mlockRestricted',
			message: data.message,
			channel: data.channelName,
		});
	});

	events.on('protocol:errCannotDoCommand', (data) => {
		// ERR_CANNOTDOCOMMAND (972) - Cannot execute command due to permissions
		events.emit('client:permissionError', {
			type: 'cannotDoCommand',
			message: data.message,
			target: data.target,
			time: data.time
		});
	});

	events.on('protocol:errCannotChangeChanMode', (data) => {
		// ERR_CANNOTCHANGECHANMODE (974) - Cannot change channel mode due to permissions
		events.emit('client:permissionError', {
			type: 'cannotChangeChanMode',
			message: data.message,
			target: data.target,
			time: data.time
		});
	});

	events.on('protocol:rplKeyvalue', (data) => {
		events.emit('metadata:keyValue', {
			target: data.target,
			key: data.key,
			value: data.value,
		});
	});

	events.on('protocol:rplMetadataend', (data) => {
		events.emit('metadata:end', {
			message: data.message,
		});
	});

	events.on('protocol:rplKeynotset', (data) => {
		events.emit('client:errorMessage', { // Emitting as an error, as it indicates something went wrong
			type: 'metadataKeyNotSet',
			message: data.message,
			target: data.target,
			key: data.key,
		});
	});

	events.on('protocol:rplMetadatasubok', (data) => {
		events.emit('metadata:subscriptionOk', {
			target: data.target,
			key: data.key,
			message: data.message,
		});
	});

	events.on('protocol:errMetadatasynclater', (data) => {
		events.emit('client:errorMessage', {
			type: 'metadataSyncLater',
			message: data.message,
			delayMs: data.delayMs,
		});
	});

	events.on('protocol:rplLoggedin', (data) => {
		events.emit('auth:loggedIn', {
			nick: data.nick,
			account: data.account,
			message: data.message,
		});
		events.emit('auth:saslLoggedIn', { // Emit for consistency with display
			nick: data.nick,
			account: data.account,
			time: data.time
		});
		events.emit('auth:userIdentifiedViaNickserv', { // Emit for consistency with display
			nick: data.nick,
			account: data.account,
			time: data.time
		});
	});

	events.on('protocol:rplLoggedout', (data) => {
		events.emit('auth:loggedOut', {
			nick: data.nick,
			message: data.message,
		});
		events.emit('auth:saslLoggedOut', { // Emit for consistency with display
			nick: data.nick,
			message: data.message,
			time: data.time
		});
	});

	events.on('protocol:rplSaslsuccess', (data) => {
		events.emit('auth:saslSuccess', {
			message: data.message,
		});
		chat.saslInProgress = false; // Reset SASL state
		chat.retrySasl = false;
		// Some servers send only 903, not 900, so send CAP END here to finalize registration
		if (!chat.capInProgress) {
			events.emit('chat:sendRawCommand', { command: 'CAP', args: ['END'] });
		}
		// Trigger status update to transition from 'identified' to 'connected'
		events.emit('chat:processConnectionStatusUpdate');
	});

	events.on('protocol:errSaslfail', (data) => {
		events.emit('auth:saslFail', {
			message: data.message,
		});
		chat.saslInProgress = false; // Reset SASL state
		// Clear credentials so GHOST/RECOVER isn't attempted with the same bad credentials.
		// They may be re-entered by the user if NickServ later prompts for login.
		chat.me.nickservpass = '';
		chat.me.nickservnick = '';
		// End capability negotiation on SASL failure to finalize registration
		events.emit('chat:sendRawCommand', { command: 'CAP', args: ['END'] });
	});

	events.on('protocol:errSaslaborted', (data) => {
		events.emit('auth:saslAborted', {
			message: data.message,
		});
		chat.saslInProgress = false; // Reset SASL state
		// End capability negotiation on SASL abort to finalize registration
		events.emit('chat:sendRawCommand', { command: 'CAP', args: ['END'] });
	});

	events.on('protocol:error', (data) => {
		// Generic error handling, for things like 404, 465, 972, 974 etc.
		// The specific `command` and `type` fields help categorize.
		let errorType = data.type || 'genericError';
		if (data.command == '404') { // ERR_CANNOTSENDTOCHAN from cmd_binds
			errorType = 'cannotSendToChan';
		} else if (data.command == '465') { // ERR_YOUREBANNEDCREEP from cmd_binds
			errorType = 'bannedCreep';
		} else if (data.command == '972') { // ERR_CANNOTDOCOMMAND from cmd_binds
			errorType = 'cannotDoCommand';
		} else if (data.command == '974') { // ERR_CANNOTCHANGECHANMODE from cmd_binds
			errorType = 'cannotChangeChanMode';
		}
		events.emit('client:errorMessage', {
			type: errorType,
			target: data.target || data.channel || data.query,
			message: data.text,
		});
	});

	events.on('protocol:ctcpAction', (data) => {
		events.emit('ctcp:action', {
			sender: data.user.nick,
			target: data.target,
			message: data.text,
		});
	});

	// Note: CTCP reply filtering moved to UI layer (gateway_display.js)
	// because both chat and UI listen to protocol:ctcpReply directly

	events.on('protocol:ctcpVersionRequest', (data) => {
		// Build version string matching old format
		let versionString = language.gatewayVersionIs + mainSettings.version;
		if (addons && addons.length > 0) {
			versionString += language.versionWithAddons;
			for (let i = 0; i < addons.length; i++) {
				if (i > 0) {
					versionString += ', ';
				}
				versionString += addons[i];
			}
		}
		versionString += `, ${  language.runningOn  } ${  navigator.userAgent}`;

		// Send CTCP reply
		events.emit('chat:sendCtcp', { dest: data.requestedBy, type: 'VERSION', text: versionString, isReply: true });

		events.emit('ctcp:versionRequest', {
			sender: data.requestedBy,
			target: data.target,
		});
	});

	events.on('protocol:ctcpUserinfoRequest', (data) => {
		// Build version string matching old format (USERINFO used same format as VERSION)
		let versionString = language.gatewayVersionIs + mainSettings.version;
		if (addons && addons.length > 0) {
			versionString += language.versionWithAddons;
			for (let i = 0; i < addons.length; i++) {
				if (i > 0) {
					versionString += ', ';
				}
				versionString += addons[i];
			}
		}
		versionString += `, ${  language.runningOn  } ${  navigator.userAgent}`;

		// Send CTCP reply
		events.emit('chat:sendCtcp', { dest: data.requestedBy, type: 'USERINFO', text: versionString, isReply: true });

		events.emit('ctcp:userinfoRequest', {
			sender: data.requestedBy,
			target: data.target,
		});
	});

	events.on('protocol:ctcpRefererRequest', (data) => {
		events.emit('ctcp:refererRequest', {
			sender: data.requestedBy,
			target: data.target,
		});
	});

	events.on('protocol:unhandledMessage', (data) => {
		console.debug('DOMAIN: Unhandled protocol message:', data.command, data.args);
		events.emit('client:unhandledMessage', {
			command: data.command,
			args: data.args,
		});
	});

	events.on('chat:labelNotProcessed', (data) => {
		// Handle labels that weren't processed by any command handler
		// This typically happens when we send a message expecting an echo-message response,
		// but receive an error or unexpected response instead
		const label = data.label;

		console.debug('[LABEL-DEBUG] chat:labelNotProcessed fired, label:', label, 'msg command:', data.msg ? data.msg.command : 'no msg');

		if (label) {
			console.debug('[LABEL-DEBUG] Emitting chat:messageDeliveryFailed for label:', label);
			events.emit('chat:messageDeliveryFailed', { label, msg: data.msg });
		}
	});


	events.on('chat:requestCap', (data) => {
		console.debug('DOMAIN: Request CAP:', data.type, data.caps);
		events.emit('chat:sendRawCommand', { command: 'CAP', args: [data.type, data.caps] });
	});

	events.on('chat:requestMetadataSubscription', (data) => {
		console.debug('DOMAIN: Request Metadata Subscription:', data.keys);
		events.emit('chat:subscribeMetadata', { keys: data.keys });
	});

	events.on('chat:userAvatarCapabilityChanged', () => {
		console.debug('DOMAIN: User avatar capability changed.');
		// This might eventually trigger a UI update or chat state change
	});

	events.on('chat:clientCanSetAvatar', () => {
		console.debug('DOMAIN: Client can now set avatar.');
		// This might eventually trigger a UI update or chat state change
	});

	events.on('chat:requestSaslAuthenticate', (data) => {
		console.debug('DOMAIN: Request SASL Authenticate:', data.mechanism);
		// Note: chat.me.nickservnick and chat.me.nickservpass are still global.
		// In a cleaner chat layer, these would be passed or managed within the chat layer state.
		events.emit('chat:sendRawCommand', { command: 'AUTHENTICATE', args: ['PLAIN'] });
		events.emit('auth:saslLoginAttempt', { time: data.time }); // Re-emit original event for other chat listeners
	});

	events.on('chat:endCapNegotiation', () => {
		console.debug('DOMAIN: End CAP Negotiation.');
		events.emit('chat:sendRawCommand', { command: 'CAP', args: ['END'] });
	});


	// ============================================================================
	// NEW DOMAIN EVENTS HANDLERS (from gateway_def.js, gateway_functions.js, gateway_tabs.js)
	// ============================================================================

	// --- Connection & Disconnection ---

	events.on('chat:requestConnect', (data) => {
		console.debug('DOMAIN: Request Connect:', data.status, data.initialMessage);
		transport.connect(data.force, data.nick !== undefined ? data.nick : chat.me.nick);
	});

	events.on('chat:setConnectedWhenIdentified', () => {
		console.debug('DOMAIN: Set Connected When Identified');
		chat.setConnectedWhenIdentified = 1;
	});


	events.on('chat:requestPing', () => {
		if (!chat.isConnected()) {
			console.debug('DOMAIN: Request Ping skipped (not connected)');
			return;
		}
		console.debug('DOMAIN: Request Ping');
		chat.pingCnt++;
		events.emit('chat:sendRawCommand', { command: 'PING', args: ['JavaScript'] });
		if (chat.pingCnt > 3) {
			chat.connectStatus = 'error';
			events.emit('chat:connectionDisconnected', { reasonKey: 'pingTimeout' }); // Pass key instead of string
			// Emit a UI event asking it to perform reconnect logic based on its settings
			events.emit('client:connectionError', { type: 'pingTimeout' });
			chat.pingCnt = 0;
		}
	});

	events.on('chat:connectionDisconnected', (data) => {
		// Normalize reason: accept either reasonKey (for translation) or reason (for direct text)
		const reasonText = data.reasonKey ? language[data.reasonKey] : data.reason;
		console.debug('DOMAIN: Connection Disconnected:', reasonText);
		chat.connectStatus = 'disconnected';
		chat.connectTime = 0;
		clearTimeout(chat.connectTimeoutID);
		if (chat.recoverTimeout) {
			clearTimeout(chat.recoverTimeout);
			chat.recoverTimeout = null;
		}
		if (transport.websock) { // Assuming transport.websock is a chat-level network interface
			transport.websock.onerror = undefined;
			transport.websock.onclose = undefined;
		}
		chat.connectTimeoutID = false;
		clearInterval(chat.pingIntervalID);
		chat.pingIntervalID = false;

		chat.me.clear(chat.users); // Clear chat user state

		events.emit('client:disconnected', { reason: reasonText });

		// ChatIntegrator-level cleanup of chat.batch
		chat.batch = {}; // Clear chat.batch object directly

		if (chat.me.nickservnick != '') {
			chat.me.nick = chat.me.nickservnick;
		}

		if (chat.disconnectMessageShown) {
			return;
		}
		chat.disconnectMessageShown = 1;

		// Emit client:disconnected event for UI layer to listen to
		events.emit('client:disconnected', { reason: reasonText });
	});

	events.on('chat:connectionInitiated', () => {
		console.debug('DOMAIN: Connection Initiated');
		chat.userQuit = false;
		chat.killed = false;
	});

	events.on('chat:connectionTimeout', () => {
		console.debug('DOMAIN: Connection Timeout');
		chat.connectTimeoutID = false;
		if (chat.userQuit) {
			return;
		}
		if (!chat.isConnected()) {
			// This used to be in gateway.connectTimeout()
			events.emit('chat:connectionTimeoutExpired', { currentStatus: chat.connectStatus });
		}
	});

	events.on('chat:websocketError', (data) => {
		console.error('DOMAIN: WebSocket Error:', data.event, 'Current Status:', chat.connectStatus);
		if (chat.connectStatus != 'disconnected' && chat.connectStatus != 'error' && chat.connectStatus != 'banned') {
			chat.connectStatus = 'error';
			events.emit('chat:connectionDisconnected', { reasonKey: 'lostNetworkConnection' });
			events.emit('client:connectionError', { type: 'networkError' });
		}
	});


	events.on('chat:clearConnectTimeout', () => {
		console.debug('DOMAIN: Clearing connect timeout.');
		clearTimeout(chat.connectTimeoutID);
		chat.connectTimeoutID = false;
	});

	events.on('chat:setConnectionTimeout', (data) => {
		console.debug(`DOMAIN: Setting connection timeout for ${  data.duration || 20000  }ms`);
		clearTimeout(chat.connectTimeoutID); // Clear any existing timeout
		const duration = data.duration || 20000; // Default 20 seconds
		chat.connectTimeoutID = setTimeout(() => {
			console.debug('DOMAIN: Connection timeout fired');
			events.emit('chat:connectionTimeout');
		}, duration);
	});

	events.on('chat:requestStopAndReconnect', (data) => {
		console.debug('DOMAIN: Request Stop And Reconnect:', data.reason);
		events.emit('chat:connectionDisconnected', { reason: data.reason });
		if (transport.websock && transport.websock.readyState === WebSocket.OPEN) events.emit('chat:quit', { message: data.reason }); // Protocol action
		setTimeout(() => { events.emit('chat:requestReconnect'); }, 500);
	});

	events.on('chat:setNickservNick', (data) => {
		console.debug('DOMAIN: Set NickServ Nick:', data.nick);
		chat.me.nickservnick = data.nick;
	});

	events.on('chat:setNickservPass', (data) => {
		console.debug('DOMAIN: Set NickServ Pass: [REDACTED]');
		chat.me.nickservpass = data.pass;
	});

	events.on('chat:savePassword', (data) => {
		console.debug('DOMAIN: Saving encrypted password to localStorage');
		try {
			localStorage.setItem('password', data.password);
		} catch (e) {
			console.error('DOMAIN: Failed to save password:', e);
		}
	});

	events.on('chat:setConnectStatus', (data) => {
		console.debug('DOMAIN: Set Connect Status:', data.status);
		chat.connectStatus = data.status;
	});

	// Start a 5-second fallback timer after sending RECOVER.
	// If the nick hasn't changed by then (server said "not being held"), authenticate
	// directly and request the nick, advancing to ghostAndNickSent.
	function startRecoverFallback() {
		if (chat.recoverTimeout) clearTimeout(chat.recoverTimeout);
		chat.recoverTimeout = setTimeout(() => {
			chat.recoverTimeout = null;
			if (chat.connectStatus !== 'ghostSent') return;
			chat.connectStatus = 'ghostAndNickSent';
			events.emit('chat:changeNick', { nick: chat.me.nickservnick });
			if (!('sasl' in chat.activeCaps)) {
				events.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'IDENTIFY', args: [chat.me.nickservnick, chat.me.nickservpass] });
			} else {
				chat.retrySasl = true;
				events.emit('chat:sendRawCommand', { command: 'AUTHENTICATE', args: ['PLAIN'] });
			}
		}, 5000);
	}

	// ChatIntegrator logic for processStatus (previously gateway.processStatus())
	events.on('chat:processConnectionStatusUpdate', () => {
		// This event is emitted after data is received. Now check connection status.

		if (chat.me.nickservpass != '' && chat.me.nickservnick != '') {
			if (chat.connectStatus == '001') {
				if (chat.me.nick != chat.me.nickservnick) { //auto-ghost
					chat.connectStatus = 'ghostSent';
					events.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'RECOVER', args: [chat.me.nickservnick, chat.me.nickservpass] });
					startRecoverFallback();
				} else chat.connectStatus = 'identified';
			}
			if (chat.connectStatus == 'reIdentify') {
				if (chat.me.nick != chat.me.nickservnick) {
					chat.connectStatus = 'ghostSent';
					events.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'RECOVER', args: [chat.me.nickservnick, chat.me.nickservpass] });
					startRecoverFallback();
				} else {
					chat.connectStatus = 'identified';
					if (!('sasl' in chat.activeCaps)) { // chat.activeCaps is chat
						events.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'IDENTIFY', args: [chat.me.nickservpass] });
					} else {
						chat.retrySasl = true;
						events.emit('chat:sendRawCommand', { command: 'AUTHENTICATE', args: ['PLAIN'] });
						// Note: SASL authentication status is shown via auth:* events
					}
				}
			}
			if (chat.connectStatus == 'ghostAndNickSent' && chat.me.nick == chat.me.nickservnick) { //ghost się udał
				if (chat.nickWasInUse) {
					events.emit('client:nickGhostComplete');
					chat.nickWasInUse = false;
				}
				chat.connectStatus = 'identified';
			}
		} else {
			if (chat.connectStatus == '001') { //nie ma hasła więc od razu uznajemy że ok
				chat.connectStatus = 'identified';
			}
		}
		if (chat.connectStatus == 'identified' && chat.setConnectedWhenIdentified == 1) { //podłączony, a szare tło schowane już wcześniej
			chat.connectStatus = 'connected';
			chat.connectTime = (+new Date) / 1000; // Store connection timestamp
		}
		if (chat.connectStatus == 'connected') {
			chat.setConnectedWhenIdentified = 0;
			if (!chat.joined) {
				events.emit('chat:connected', { channels: chat.me.channels.slice(), umodes: chat.me.umodes });
				chat.joined = 1;
				chat.disconnectMessageShown = 0;
			}
		} else {
			chat.joined = 0;
		}
	});

	// --- User & Channel Management ---

	events.on('chat:requestJoinChannel', (data) => {
		console.debug('DOMAIN: Request Join Channel:', data.channelName, data.password || 'no pass');
		if (!chat.isConnected()) return;
		events.emit('chat:joinChannel', { channels: data.channelName, password: data.password });
	});

	events.on('chat:requestJoinChannels', (data) => {
		console.debug('DOMAIN: Request Join Channels');
		const channelsToJoin = [...new Set(data && data.channels ? data.channels : [])];
		if (channelsToJoin.length > 0) {
			events.emit('chat:joinChannel', { channels: channelsToJoin });
		}
	});

	events.on('chat:requestNickChange', (data) => {
		console.debug('DOMAIN: Request Nick Change:', data.newNick);
		events.emit('chat:changeNick', { nick: data.newNick });
	});

	events.on('chat:userClearState', () => {
		console.debug('DOMAIN: User Clear State');
		chat.me.clear(chat.users); // Clear guser state
		// Also clear other chat state related to user
		chat.activeCaps = {};
		chat.serverCaps = {};
		chat.isupport = [];
		chat.capInProgress = false;
		chat.saslInProgress = false;
		chat.pingCnt = 0;
		chat.joined = 0;
		chat.setConnectedWhenIdentified = 0;
		chat.firstConnect = 1;
		chat.userQuit = false;
		chat.killed = false;
		chat.sasl = false;
		chat.whowasExpect312 = false;
		chat.nickWasInUse = false;
		chat.retrySasl = false;
		chat.labelsToHide = [];
		chat.labelCallbacks = {};
		chat.pendingCallbacks = {};
		chat.batch = {};
		chat.whoisData = {};
		chat.smallListData = [];
		chat.lastError = '';
		// Emit event for UI to react
		events.emit('user:stateCleared');
	});

	events.on('chat:updateConnectionParams', (data) => {
		console.debug('DOMAIN: Update Connection Params:', data);
		if (data.nick != chat.me.nick) {
			chat.me.changeNick(data.nick);
		}
		chat.me.channels = data.channels;
		chat.me.nickservnick = data.nickservNick;
		chat.me.nickservpass = data.nickservPass;
		if (data.savePassword) {
			// Already handled by disp.changeSettings() using encryptPassword()
		}
		chat.me.account = chat.me.nick; // Set account to current nick
	});

	events.on('chat:requestRemoveChannel', (data) => {
		console.debug('DOMAIN: Request Remove Channel:', data.channelName);
		// The chat layer initiates the protocol action to part the channel.
		// message parameter should be provided by UI layer (already translated)
		events.emit('chat:leaveChannel', { channel: data.channelName, reason: data.message || '' });

		// Emit event for UI to perform cleanup for the removed channel.
		events.emit('channel:removed', { channelName: data.channelName });
	});

	events.on('chat:requestRemoveQuery', (data) => {
		console.debug('DOMAIN: Request Remove Query:', data.queryName);
		// UI cleanup is done by Query.close()
		events.emit('query:removed', { queryName: data.queryName });
	});

	events.on('chat:requestRemoveListWindow', (data) => {
		console.debug('DOMAIN: Request Remove List Window:', data.listName);
		// The chat layer signals the UI to remove the list window.
		events.emit('listWindow:removed', { listName: data.listName });
	});


	// --- IRC Commands & Services ---

	// chat:requestIrcCommand renamed to chat:sendRawCommand; handler lives in irc_protocol.js

	events.on('chat:requestCapLs', (data) => {
		console.debug('DOMAIN: Request CAP LS:', data.version);
		events.emit('chat:sendRawCommand', { command: 'CAP', args: ['LS', data.version] });
	});

	events.on('chat:requestUser', (data) => {
		console.debug('DOMAIN: Request USER:', data.username, data.mode, data.unused, data.realname);
		// TODO: abstract to chat:initiateConnection; protocol layer handles full NICK+USER+CAP registration sequence
		events.emit('chat:sendRawCommand', { command: 'USER', args: [data.username, data.mode, data.unused, data.realname] });
	});

	events.on('chat:requestWhois', (data) => {
		console.debug('DOMAIN: Request WHOIS:', data.nick);
		events.emit('chat:queryUser', { nick: data.nick });
	});

	events.on('chat:requestNickservInfo', (data) => {
		console.debug('DOMAIN: Request NickServ Info:', data.nick);
		services.nickInfo(data.nick);
	});

	events.on('chat:requestCtcp', (data) => {
		console.debug('DOMAIN: Request CTCP:', data.nick, data.ctcpType);
		events.emit('chat:requestCtcpCommand', { dest: data.nick, text: data.ctcpType, time: new Date() });
	});

	events.on('chat:requestCtcpCommand', (data) => {
		console.debug('DOMAIN: Request CTCP Command:', data.dest, data.text);
		events.emit('chat:sendCtcp', { dest: data.dest, type: data.text, isReply: false });
	});

	events.on('chat:requestModeChange', (data) => {
		console.debug('DOMAIN: Request Mode Change:', data.target || data.channel, data.modeString);
		const chan = data.target || data.channel;
		const chantypes = (chat.isupport && chat.isupport.CHANTYPES) || '#&';
		if (chan && chantypes.indexOf(chan.charAt(0)) !== -1) {
			events.emit('chat:setChannelSettings', { channel: chan, modeString: data.modeString });
		} else {
			events.emit('chat:setUserSettings', { modeString: data.modeString });
		}
	});

	events.on('chat:requestServiceCommand', (data) => {
		console.debug('DOMAIN: Request Service Command:', data.service, data.command, data.args);
		events.emit('chat:sendServiceCommand', { service: data.service, command: data.command, args: data.args || [] });
	});

	events.on('chat:requestInvite', (data) => {
		console.debug('DOMAIN: Request Invite:', data.channel, data.nick);
		events.emit('chat:inviteUser', { channel: data.channel, nick: data.nick });
	});

	events.on('chat:requestKick', (data) => {
		console.debug('DOMAIN: Request Kick:', data.channel, data.nick, data.reason);
		events.emit('chat:kickUser', { channel: data.channel, nick: data.nick, reason: data.reason });
	});

	events.on('chat:setUserQuit', (data) => {
		console.debug('DOMAIN: Setting user quit status:', data.status);
		chat.userQuit = data.status;
	});

	events.on('protocol:killCommand', (data) => {
		if (data.targetNick !== chat.me.nick) return;
		console.debug('DOMAIN: Killed by', `${data.killerNick  }:`, data.reason);
		chat.killed = true;
	});

	events.on('chat:requestQuit', (data) => {
		console.debug('DOMAIN: Request Quit:', data.message);
		if (chat.connectStatus === 'disconnected') return;
		chat.userQuit = true;
		if (transport.websock) {
			transport.websock.onerror = undefined;
			transport.websock.onclose = undefined;
		}
		const reason = data.message || '';
		events.emit('chat:quit', { message: reason });
		events.emit('chat:connectionDisconnected', { reason: reason });
		events.emit('client:userQuit', { message: reason });
		if (transport.websock) {
			setTimeout(() => {
				if (transport.websock) transport.websock.close();
			}, 200);
		}
	});

	events.on('chat:requestListChannels', (data) => {
		console.debug('DOMAIN: Request List Channels:', data.minUsers);
		events.emit('chat:listChannels', { pattern: data.minUsers, labeled: true });
	});

	events.on('chat:requestChatHistory', (data) => {
		console.debug('DOMAIN: Request Chat History:', data.channelName, data.type, 'msgid:', data.msgid, 'timestamp:', data.timestamp, data.limit);

		const channelKey = data.channelName.toLowerCase();
		chat.channelsPendingHistoryLimit[channelKey] = data.limit;
		if (data.type === 'LATEST') {
			// Mark channel as awaiting initial history
			chat.channelsAwaitingInitialHistory[channelKey] = true;
		} else if (!data.msgid && !data.timestamp) {
			console.error('DOMAIN: No msgid or timestamp provided for CHATHISTORY request');
			return;
		}

		// Reference construction (msgid=.../timestamp=.../*) is done in protocol layer
		events.emit('chat:fetchChannelHistory', {
			type: data.type,
			channelName: data.channelName,
			msgid: data.msgid,
			timestamp: data.timestamp,
			limit: data.limit
		});
	});

	events.on('chat:requestRedoNames', (data) => {
		console.debug('DOMAIN: Request Redo Names:', data.channelName);
		events.emit('chat:requestChannelMembers', { channel: data.channelName });
		events.emit('chat:setTopic', { channel: data.channelName }); // Refresh topic (query)
		events.emit('chat:requestChannelMemberInfo', { channel: data.channelName }); // Refresh WHO info
	});

	events.on('chat:requestSendMessage', (data) => {
		console.debug('DOMAIN: Request Send Message:', data.target, data.message);

		// Clear typing status for this target when message is sent
		// Per spec: sending a message clears typing status (no notification needed)
		if (chat.lastTypingActivity[data.target]) {
			clearTimeout(chat.lastTypingActivity[data.target].timeoutId);
			delete chat.lastTypingActivity[data.target];
			console.debug('DOMAIN: Cleared typing status for', data.target, '(message sent)');
		}

		events.emit('chat:sendMessage', { dest: data.target, text: data.message, notice: data.notice });
	});

	events.on('chat:requestSendTags', (data) => {
		console.debug('DOMAIN: Request Send Tags:', data.target, data.tags, data.values);
		// Map tag arrays to signal — only typing signals are currently used
		const firstTag = Array.isArray(data.tags) ? data.tags[0] : data.tags;
		const firstValue = Array.isArray(data.values) ? data.values[0] : data.values;
		if (firstTag && (firstTag.indexOf('typing') !== -1)) {
			events.emit('chat:sendSignal', { target: data.target, type: 'typing', data: { status: firstValue } });
		}
	});

	// --- Metadata & Tags ---

	events.on('chat:requestMetadataUpdate', (data) => {
		console.debug('DOMAIN: Request Metadata Update:', data.key, data.value);
		if (data.key === 'color') {
			events.emit('chat:setColor', { color: data.value });
		} else if (data.key === 'avatar') {
			events.emit('chat:setAvatar', { url: data.value });
		} else {
			// Generic metadata: send directly as METADATA SET
			events.emit('chat:sendRawCommand', { command: 'METADATA', args: ['*', 'SET', data.key, data.value] });
		}
	});

	events.on('chat:requestExtJwt', (data) => {
		console.debug('DOMAIN: Request EXTJWT:', data.service);
		if (data.callback) {
			if ('labeled-response' in chat.activeCaps) {
				const label = chat.generateLabel();
				chat.labelCallbacks[label] = (batch) => data.callback(batch.extjwtContent);
				events.emit('chat:sendRawCommand', { command: 'EXTJWT', args: [data.service], tags: { label } });
				return;
			}
			chat.pendingCallbacks['extjwt'] = data.callback;
		}
		events.emit('chat:sendRawCommand', { command: 'EXTJWT', args: [data.service] });
	});

	// --- UI-Related ChatIntegrator Events ---

	events.on('chat:tabSwitched', (data) => {
		chat.activeTab = data.newTab;
	});

	events.on('chat:addSupportedCap', (data) => {
		chat.supportedCaps.push(data.cap);
	});

	events.on('chat:removeSupportedCap', (data) => {
		const index = chat.supportedCaps.indexOf(data.cap);
		if (index >= 0) chat.supportedCaps.splice(index, 1);
	});

	events.on('chat:removeActiveCap', (data) => {
		if (data.cap in chat.activeCaps) delete chat.activeCaps[data.cap];
	});

	events.on('chat:changeCapSupport', (data) => {
		if (data.enable) {
			if (chat.supportedCaps.indexOf(data.cap) < 0) {
				chat.supportedCaps.push(data.cap);
			}
			if (data.cap in chat.serverCaps) {
				events.emit('chat:sendRawCommand', { command: 'CAP', args: ['REQ', data.cap] });
			}
		} else {
			const index = chat.supportedCaps.indexOf(data.cap);
			if (index >= 0) chat.supportedCaps.splice(index, 1);
			if (data.cap in chat.activeCaps) {
				events.emit('chat:sendRawCommand', { command: 'CAP', args: ['REQ', `-${data.cap}`] });
				delete chat.activeCaps[data.cap];
			}
		}
	});


	// --- Typing Activity ---

	events.on('chat:processTypingActivity', (data) => {
		const currentWindowName = data.windowName; // Use windowName directly (string), not window.name
		const currentInputValue = data.inputValue;
		console.debug('DOMAIN: Processing Typing Activity:', currentWindowName, currentInputValue, data.time);

		// This logic previously in uiInput.inputKeypress()
		if (currentInputValue == '') {
			// User cleared input, potentially done typing
			if (chat.lastTypingActivity[currentWindowName]) {
				clearTimeout(chat.lastTypingActivity[currentWindowName].timeoutId);
				events.emit('chat:requestSendTags', { target: currentWindowName, tags: ['+draft/typing', '+typing'], values: ['done', 'done'], time: new Date() });
				delete chat.lastTypingActivity[currentWindowName];
			}
			return;
		}

		if (chat.lastTypingActivity[currentWindowName]) {
			clearTimeout(chat.lastTypingActivity[currentWindowName].timeoutId);
			// If already active, just reset timer
		} else {
			// Start typing notification
			events.emit('chat:requestSendTags', { target: currentWindowName, tags: ['+draft/typing', '+typing'], values: ['active', 'active'], time: new Date() });
		}

		chat.lastTypingActivity[currentWindowName] = {
			timeoutId: setTimeout(() => {
				console.debug('DOMAIN: Typing activity timed out for', currentWindowName);
				events.emit('chat:requestSendTags', { target: currentWindowName, tags: ['+draft/typing', '+typing'], values: ['paused', 'paused'], time: new Date() });
				delete chat.lastTypingActivity[currentWindowName];
			}, 5000), // 5 seconds to switch to paused
			status: 'active'
		};
	});

	events.on('chat:typingStopped', () => {
		// This was triggered when keypressSuppress timed out
		// Needs to handle sending 'paused' or 'done' based on actual input value
		console.debug('DOMAIN: Typing Stopped event received (from keypress timeout)');
		// More complex logic needed here to determine if still typing or done
		// For now, assume it's done typing if no more keypresses
	});


	// --- Connection Status Check ---
	events.on('chat:checkConnectionStatus', (data) => {
		console.debug('DOMAIN: Checking connection status:', chat.connectStatus);
		if (typeof data.callback === 'function') {
			data.callback(chat.isConnected());
		}
	});


	// --- Mode Parsing ---

	// ChatIntegrator internal method to generate umode string from user's current modes
	function getUmodeString(user) {
		let modeString = '+';
		if (user && user.umodes) {
			for (const [mode, active] of Object.entries(user.umodes)) {
				if (active === true) {
					modeString += mode;
				}
			}
		} else if (chat.me && chat.me.umodes) {
			// Fallback to chat.me.umodes for current user
			for (const [mode, active] of Object.entries(chat.me.umodes)) {
				if (active === true) {
					modeString += mode;
				}
			}
		}
		if (modeString.length === 1) {
			modeString = ''; // Return empty string, UI will use language.none
		}
		return modeString;
	}

	events.on('chat:processUserModes', (data) => {
		console.debug('DOMAIN: Processing user modes:', data.modes);
		const modes = data.modes;
		let plus = false;
		for (const c of modes) {
			switch (c) {
				case '+': plus = true; break;
				case '-': plus = false; break;
				case ' ': return; // Should not happen with well-formed mode strings
				default: chat.me.setUmode(c, plus); break; // chat.me.setUmode updates chat state
			}
		}
		// Emit user:settingInfo event with the umode string
		const umodeString = getUmodeString();
		events.emit('user:settingInfo', {
			nick: chat.me.userRef ? chat.me.userRef.nick : chat.me.nick,
			settingString: umodeString,
			time: data.time || new Date()
		});
	});


	// --- Other ChatIntegrator Logic ---

	events.on('chat:isHistoryBatch', (data) => {
		let result = false;
		if (data.tags && 'batch' in data.tags && data.tags.batch in chat.batch) {
			const batch = chat.batch[data.tags.batch];
			if (batch.type == 'chathistory') {
				result = true;
			} else {
				for (const parent of batch.parents) {
					if (parent.type == 'chathistory') {
						result = true;
						break;
					}
				}
			}
		}
		if (typeof data.callback === 'function') {
			data.callback(result);
		}
	});

	events.on('chat:addLabelToHide', (data) => {
		chat.labelsToHide.push(data.label);
	});

	events.on('chat:processStorageEvent', (data) => {
		console.debug('DOMAIN: Processing storage event:', data.evt.key);
		const evt = data.evt;

		if (!evt.newValue) {
			return;
		}

		if (conn.waitForAlive && evt.key == 'checkAliveReply') {
			conn.waitForAlive = false;
			// Signal UI to display the "already connected" message
			events.emit('client:sessionConflict', { nick: evt.newValue, suggestedChannel: chat.me.channels[0] });
			// Clear storage after processing
			try {
				localStorage.removeItem(evt.key);
				// This is problematic. If chat.me.channels[0] is #, it should not set reqChannelJoin
				if (chat.me.channels && chat.me.channels.length > 0 && chat.me.channels[0] != '#') {
					localStorage.setItem('reqChannelJoin', chat.me.channels[0]);
				}
			} catch (e) {}
		} else if (chat.isConnected()) {
			try {
				if (evt.key == 'checkAlive') {
					localStorage.removeItem(evt.key);
					localStorage.setItem('checkAliveReply', chat.me.nick);
				} else if (evt.key == 'reqChannelJoin') {
					const chan = evt.newValue;
					localStorage.removeItem(evt.key);
					// Signal UI to check if channel is already joined and prompt for join
					events.emit('client:tabChannelJoinRequest', { channelName: chan });
				}
			} catch (e) {}
		}
	});



	// --- Tab Management ---

	events.on('chat:requestOpenQuery', (data) => {
		console.debug('DOMAIN: Request Open Query:', data.nick);
		// Emit semantic event - UI will create query tab
		events.emit('user:queryRequested', { nick: data.nick, setActive: true });
	});


	// --- Mode Parsing ---


	events.on('chat:parseIsupport', () => {
		if ('CHANMODES' in chat.isupport) {
			const modeTypes = chat.isupport['CHANMODES'].split(',');
			if (modeTypes.length != 4) {
				console.error('Error parsing CHANMODES chat.isupport!');
				return;
			}
			chat.modes.single = [];
			chat.modes.argBoth = [];
			chat.modes.argAdd = [];

			for (let i = 0; i < 4; i++) {
				const modeChars = modeTypes[i];
				for (let j = 0; j < modeChars.length; j++) {
					switch (i) {
						case 0: // list type (argBoth)
							chat.modes.argBoth.push(modeChars.charAt(j));
							break;
						case 1: // add and remove with arguments (argBoth)
							chat.modes.argBoth.push(modeChars.charAt(j));
							break;
						case 2: // add with arguments (argAdd)
							chat.modes.argAdd.push(modeChars.charAt(j));
							break;
						case 3: // no arguments (single)
							chat.modes.single.push(modeChars.charAt(j));
							break;
					}
				}
			}
		}
		if ('PREFIX' in chat.isupport) {
			const expr = /^\(([^)]+)\)(.+)$/;
			const prefix = expr.exec(chat.isupport['PREFIX']);
			if (!prefix || prefix[1].length != prefix[2].length) {
				console.error('Error parsing PREFIX chat.isupport!');
				return;
			}
			chat.modes.user = [];
			chat.modes.prefixes = [];

			for (let i = 0; i < prefix[1].length; i++) {
				chat.modes.user.push(prefix[1].charAt(i));
				chat.modes.prefixes[prefix[1].charAt(i)] = prefix[2].charAt(i);
				chat.modes.reversePrefixes[prefix[2].charAt(i)] = prefix[1].charAt(i);
			}
		}
	});

	// Helper to parse mode strings (simplified for +o/-o)
	function parseChannelUserModes(modeString, channelName) {
		const changes = [];
		let isAdding = true; // true for '+', false for '-'
		const statusModes = (chat.modes.user && chat.modes.user.length) ? chat.modes.user : ['o', 'v', 'h', 'a', 'q'];

		const parts = modeString.split(' ');
		let currentModeArgIndex = 0; // Tracks the index in 'parts' for mode arguments

		// Find the actual mode string part (e.g., "+o-v")
		const modeSpecPart = parts[0];
		const argsParts = parts.slice(1); // Arguments for the modes

		for (const char of modeSpecPart) {
			if (char === '+') {
				isAdding = true;
			} else if (char === '-') {
				isAdding = false;
			} else {
				// Check if this mode takes an argument (a user nick)
				if (statusModes.indexOf(char) >= 0) {
					if (currentModeArgIndex < argsParts.length) {
						const nickAffected = argsParts[currentModeArgIndex];
						changes.push({
							nick: nickAffected,
							mode: char,
							isAdding: isAdding,
							channelName: channelName
						});
						currentModeArgIndex++;
					}
				}
			}
		}
		return changes;
	}


	// ==========================================
	// UI REQUEST HANDLERS
	// ==========================================

	// Handle UI request to load older chat history
	events.on('chat:requestHistoryBefore', (data) => {
		// Check if CHATHISTORY is supported
		if (!('CHATHISTORY' in chat.isupport)) {
			console.debug('CHATHISTORY not supported by server');
			return;
		}

		// Cap the limit based on server support
		const serverLimit = parseInt(chat.isupport['CHATHISTORY']) || 100;
		const actualLimit = Math.min(data.limit || 100, serverLimit);

		// Send the CHATHISTORY request
		events.emit('chat:fetchChannelHistory', {
			type: 'BEFORE',
			channelName: data.channel,
			msgid: data.beforeMsgid || null,
			timestamp: null,
			limit: actualLimit
		});
	});


} // end registerChatHandlers

// ===========================================================================
// IRC CONNECTION WRAPPER
// ===========================================================================
// Owns all per-connection objects: chat state, event bus, transport, and
// outgoing command API.  Each server connection is one IrcConnection instance.
// For multi-connection: create multiple instances with different nick/config.
//
// @param {string}          nick     - Initial nick for this connection.
// @param {IRCEventEmitter} uiBus    - Global UI event bus (ircEvents).
//                                     Connection events are forwarded here with connectionId.
// @param {string|number}   id       - Unique connection identifier (default 0).
function IrcConnection(nick, uiBus, id) {
	this.id = id !== undefined ? id : 0;

	// Per-connection event bus: forwards all emitted events to uiBus with connectionId.
	this.events = new IrcEventEmitter(uiBus || null, this.id);

	// Per-connection chat state.
	this.chat = new ChatIntegrator(nick, this.events);

	// Per-connection transport (WebSocket + parser).
	this.transport = new IrcTransport(this.events, this.chat);

	// Register protocol handlers (cmd:* → protocol:*) and outgoing handlers (chat:* → transport.send).
	registerProtocolHandlers(this.events, this.chat, this.transport);

	// Register chat handlers (protocol:* → chat/client/channel/user events).
	registerChatHandlers(this.events, this.chat, this.transport);
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		IrcConnection,
		ChatIntegrator,
		SelfUser,
		registerChatHandlers,
	};
}

