// js/gateway_domain.js
// This file will contain listeners for domain-level events that orchestrate core application logic,
// separating it from protocol handling (irc_protocol.js) and UI rendering (gateway_display.js).

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

// Domain-specific state variables, previously in gateway_def.js
var domainConnectStatus = 'disconnected';
var domainConnectTime = 0; // Timestamp when connection was established
var domainJoined = 0;
var domainSetConnectedWhenIdentified = 0;
var domainFirstConnect = 1;
var domainUserQuit = false;
var domainLabel = 0; // Label counter for labeled-response
var domainSasl = false;
var domainWhowasExpect312 = false; // Check if this is still needed as part of consolidated WHOIS
var domainNickWasInUse = false;
var domainRetrySasl = false;
var domainPingCnt = 0;
var domainLastTypingActivity = {}; // Track last typing activity per window
var domainLabelsToHide = []; // Labels for messages that should be hidden (e.g., passwords)
var domainBatch = {}; // Store active batch objects
var domainWhoisData = {}; // Accumulator for WHOIS data from multiple RPL_WHOIS*
var domainSmallListData = []; // Accumulator for small list data from RPL_LIST
var domainLastError = '';
var domainActiveTab = '--status'; // Domain's view of the currently active tab
var domainTabHistory = ['--status']; // Domain's view of tab history for back navigation
var domainChannelsInitializing = {}; // Track channels being initially joined (waiting for NAMES completion)
var domainChannelsAwaitingInitialHistory = {}; // Track channels awaiting initial history (to distinguish from manual "load older")
var domainConnectTimeoutID = 0;
var domainPingIntervalID = false;
var domainWhoChannelsIntervalID = false;
var domainDisconnectMessageShown = 0;
var domainCommandProcessing = false;

// Netsplit/Netjoin related state, previously in gateway_def.js
var domainQuitQueue = [];
var domainQuitTimeout = false;
var domainNetJoinUsers = {};
var domainNetJoinQueue = [];
var domainNetJoinTimeout = false;


// ============================================================================
// BATCH HANDLERS (migrated from irc_protocol.js)
// ============================================================================

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
		for(var i=0; i<this.parents.length; i++){
			if(this.parents[i].label)
				return this.parents[i].label;
		}
		return null;
	};

	if(msg && msg.tags && 'batch' in msg.tags){ // nested batches - add parent
		var parentBatch = domainBatch[msg.tags.batch];
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
ircEvents.on('domain:processIncomingTags', function(data) {
	var msg = data.msg;
	var user = msg.user;

	// Update user ident/host from sender prefix
	if(user && msg.sender.user) {
		if(msg.sender.ident.length > 0) user.setIdent(msg.sender.ident);
		if(msg.sender.host.length > 0) user.setHost(msg.sender.host);
	}
	if(user && msg.sender.server) {
		user.setServer(true);
	}

	// Apply server-time tag to the enriched message object
	if('time' in msg.tags) {
		msg.time = new Date(msg.tags['time']);
	}

	if(user) {
		// account-tag: update sender's account on every message
		if('account' in msg.tags) {
			user.setAccount(msg.tags['account'] || false);
		}
		// inspircd.org/bot: mark sender as a bot
		if('inspircd.org/bot' in msg.tags) {
			user.setBot(true);
		}
	}

	// Handle incoming typing indicators carried in TAGMSG
	if(user && msg.command === 'TAGMSG') {
		var typingMode = '+typing' in msg.tags ? msg.tags['+typing'] : msg.tags['+draft/typing'];
		if(typingMode !== undefined) {
			ircEvents.emit('user:typingActivity', {
				user: user,
				dest: msg.args[0],
				mode: typingMode,
				time: msg.time
			});
		}
	}
});

ircEvents.on('batch:chathistory', function(data){
	var msg = data.msg;
	var batch = data.batch;

	// Track how many messages we received
	batch.receivedMessages = 0;
	batch.oldestMsgid = null;
	batch.oldestTimestamp = null;
	batch.isInitialHistory = false; // Will be set by the request

	// Set callback to add the "load older" link when batch ends
	batch.callback = function(batch, msg){
		console.log('chathistory batch ended, received', batch.receivedMessages, 'messages');
		var chan = gateway.findChannel(batch.args[0]);
		if(!chan) return;

		var channelKey = chan.name.toLowerCase();
		var isInitialHistory = domainChannelsAwaitingInitialHistory[channelKey] || false;

		// Clear the initial history flag
		if(isInitialHistory){
			delete domainChannelsAwaitingInitialHistory[channelKey];
		}

		ircEvents.emit('channel:chatHistoryStatsUpdated', {
			channelName: chan.name,
			channelId: chan.id,
			receivedMessages: batch.receivedMessages,
			oldestMsgid: batch.oldestMsgid,
			oldestTimestamp: batch.oldestTimestamp,
			isInitialHistory: isInitialHistory
		});
	}
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
// BATCH HELPER FUNCTIONS
// ============================================================================

/**
 * Find a batch of a specific type in the batch hierarchy
 * @param {Object} tags - Message tags object
 * @param {string} type - Batch type to search for (e.g., 'chathistory')
 * @returns {Object|null} - Batch object or null if not found
 */
function findBatchOfType(tags, type){
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
}

/**
 * Check if a message is part of a chathistory batch
 * @param {Object} tags - Message tags object
 * @returns {boolean} - True if message is in a chathistory batch
 */
function isHistoryBatch(tags){
	return findBatchOfType(tags, 'chathistory') !== null;
}

/**
 * Check if there's an active chathistory batch for a channel
 * @param {string} chan - Channel name
 * @returns {boolean} - True if chathistory batch is active for this channel
 */
function historyBatchActive(chan){
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
}

// ============================================================================
// CLIENT-SPECIFIC LISTENERS (migrated from other layers)
// ============================================================================

ircEvents.on('client:processOwnChannelList', function(data) {
    var nick = data.nick;
    var channelNames = data.channelNames;

    // This logic was moved from irc_protocol.js
    domainConnectStatus = '001'; // Update domainConnectStatus
    if(nick == guser.nick){
        channelNames.forEach( function(channame){
            var channel = channame.match(/#[^ ]*/);
            if(channel){
                ircEvents.emit('domain:ensureChannelTabExists', { channelName: channel[0], time: new Date() });

                ircCommand.channelNames(channel[0]);
                ircCommand.channelTopic(channel[0]);
                ircCommand.who(channel[0]);
            	}
            });


    }
});

ircEvents.on('channel:requestChatHistory', function(data) {
	ircCommand.channelHistory(data.channelName, data.limit);
});

ircEvents.on('channel:requestWho', function(data) {
	ircCommand.who(data.channelName);
});

// ============================================================================
// PROTOCOL LISTENERS (migrated from irc_protocol.js)
// ============================================================================

ircEvents.on('protocol:accountCommand', function(data) {
	// data.user is available in the protocolGeneric wrapper
	if(data.account === '*' || data.account === '0'){
		data.user.setAccount(false);
	} else {
		data.user.setAccount(data.account);
	}
});

ircEvents.on('protocol:ackCommand', function(data) {
	// Labeled-response ACK command received by domain layer.
	// Original handler was empty, so for now, we just acknowledge receipt.
	console.log('DOMAIN: ACK command received:', data.raw);
});

ircEvents.on('protocol:authenticateCommand', function(data) {
	if(data.challenge === '+'){
		// Emit a domain event to request authentication command, instead of direct ircCommand
		ircEvents.emit('domain:requestIrcCommand', {
			command: 'AUTHENTICATE',
			args: [Base64.encode(guser.nickservnick + '\0' + guser.nickservnick + '\0' + guser.nickservpass)]
		});
		ircEvents.emit('auth:saslAuthenticating', { time: data.time, nickservNick: guser.nickservnick });
		domainConnectStatus = 'identified'; // Logical update
	} else {
		console.log('DOMAIN: Unexpected AUTHENTICATE response:', data.challenge);
	}
});

ircEvents.on('protocol:awayCommand', function(data) {
	// data.user is available in the protocolGeneric wrapper
	if(data.awayMessage === ''){
		data.user.notAway();
	} else {
		data.user.setAway(data.awayMessage);
	}
});

ircEvents.on('protocol:batchCommand', function(data) {
	// Protocol layer provides: batchId (without prefix), isStart, isEnd, batchType, batchArgs
	var batchId = data.batchId;
	var type = data.batchType;

	if(data.isEnd){ // Batch end
		var batch = domainBatch[batchId];
		if(!batch){
			console.warn('BATCH "' + batchId + '" ended but not started');
			return;
		}
		if(batch.callback){
			batch.callback(batch, data);
		}
		delete domainBatch[batchId];
		data.isBatchEnd = true;
		data.batch = batch;
	} else if(data.isStart){ // Batch start
		var batch = new ircBatch(batchId, type, data.batchArgs, data);
		domainBatch[batchId] = batch;
		if('label' in data.tags){
			batch.label = data.tags.label;
		}
		// Emit batch start event
		ircEvents.emit('batch:' + type, {msg: data, batch: batch});
		data.isBatchStart = true;
	} else {
		console.error('Unknown batch type - neither start nor end');
		return;
	}
});

ircEvents.on('protocol:capCommand', function(data) {
	switch(data.subcommand){
		case 'LS': case 'NEW':
			// Parse available capabilities from server
			if (data.isMultiLine) // Check for multi-line CAP LS indicator
				capInProgress = true;
			else
				capInProgress = false;

			// Parse capabilities from THIS line only (before adding to accumulated serverCaps)
			var thisLineCaps = {};
			var availableCaps = data.capText.split(' ');
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

			// Request CAPs from this line (now a domain-level action)
			if(useCaps.length > 0){
				// Emit a domain event to request CAPs, instead of direct ircCommand
				ircEvents.emit('domain:requestCap', { type: 'REQ', caps: useCaps });
			}

			// Now add this line's capabilities to accumulated serverCaps
			for(var cap in thisLineCaps){
				serverCaps[cap] = thisLineCaps[cap];
			}
			break;
		case 'ACK':
			var newCapsParsed = {};
			// Protocol layer provides parsed caps with enabled/disabled info
			for(var i=0; i<data.caps.length; i++){
				var cap = data.caps[i];
				var capName = cap.name;
				var enabled = cap.enabled;

				if(!(capName in activeCaps) && enabled){ // add capability
					activeCaps[capName] = serverCaps[capName];
					newCapsParsed[capName] = serverCaps[capName];
				}
				if(capName in activeCaps && !enabled){ // remove capability
					delete activeCaps[capName];
				}
			}
			// Check for any metadata capability (draft/metadata-2, draft/metadata-notify-2, or draft/metadata)
			if('draft/metadata-2' in newCapsParsed || 'draft/metadata-notify-2' in newCapsParsed || 'draft/metadata' in newCapsParsed){
				// Emit domain event for metadata subscription
				ircEvents.emit('domain:requestMetadataSubscription', { keys: ['avatar', 'status', 'bot', 'homepage', 'display-name', 'bot-url', 'color'] });
				// Emit domain events indicating state change, UI will listen to these
				ircEvents.emit('domain:userAvatarCapabilityChanged');
				ircEvents.emit('domain:clientCanSetAvatar');
			}
			if(guser.nickservpass != '' && guser.nickservnick != '' && 'sasl' in newCapsParsed){
				// Emit domain event to perform authentication
				ircEvents.emit('domain:requestSaslAuthenticate', { mechanism: 'PLAIN', time: data.time, nickservNick: guser.nickservnick, nickservPass: guser.nickservpass });
				saslInProgress = true;
			} else {
				if (!capInProgress && !saslInProgress)
					// Emit domain event to end CAP negotiation
					ircEvents.emit('domain:endCapNegotiation');
			}
			break;
		case 'DEL':
			var delCaps = data.capText.split(' ');
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

ircEvents.on('protocol:chghostCommand', function(data) {
	// data.user is available in protocolGeneric
	data.user.setIdent(data.newIdent);
	data.user.setHost(data.newHost);
    ircEvents.emit('user:hostChanged', {
        nick: data.user.nick,
        ident: data.newIdent,
        host: data.newHost
    });
});

ircEvents.on('protocol:failCommand', function(data) {
	console.log('DOMAIN: FAIL', data.failedCommand, data.failCode, data.description);

	// Handle specific FAIL types
	if(data.failedCommand == 'METADATA'){
		// FAIL METADATA responses for draft/metadata-2
		// Examples: KEY_INVALID, KEY_NO_PERMISSION, TOO_MANY_SUBS, etc.
		// These are informational - the batch will complete normally
	}
    ircEvents.emit('server:failMessage', {
        command: data.failedCommand,
        code: data.failCode,
        description: data.description
    });
});

ircEvents.on('protocol:errorCommand', function(data) {
	domainLastError = data.message; // Update domainLastError
	ircEvents.emit('connection:disconnected', { reason: data.message }); // Abstract gateway.disconnected

	var expr = /^Closing Link: [^ ]+\[([^ ]+)\] \(User has been banned from/;
	var match = expr.exec(data.message);
	if(match){
		// Re-emit as a domain-level error for global ban
		ircEvents.emit('error:globalBan', {
			code: '465', // Using a generic error code for global ban as no specific code for it
			type: 'globalBan',
			message: data.message,
		});
		return;
	}

	if(domainConnectStatus == 'disconnected') { // Use domainConnectStatus
		if(domainFirstConnect){ // Use domainFirstConnect
			// Emit domain event to request reconnect
			ircEvents.emit('domain:requestReconnect');
		}
		return;
	}

	domainConnectStatus = 'disconnected'; // Use domainConnectStatus
	domainConnectTime = 0; // Reset connection time

	if(data.message.match(/\(NickServ \(RECOVER command used by [^ ]+\)\)$/) || data.message.match(/\(NickServ \(Użytkownik [^ ]+\ użył komendy RECOVER\)\)\$/)){
		ircEvents.emit('connection:reconnectNeeded'); // This event is still relevant for the UI
		ircEvents.emit('nickserv:recoverCommandTriggered'); // This is a domain event
	} else {
		ircEvents.emit('connection:serverDisconnected', { reason: data.message }); // This event is still relevant for the UI
		ircEvents.emit('connection:reconnectRequested'); // This is a domain event
	}
});

ircEvents.on('protocol:extjwtCommand', function(data) {
	if(!data.batch){
		return; // labelNotProcessed handler will take full care of that
	}
	if(data.args[2] == '*'){ // Check raw args as data.arg might be processed
		var tokenData = data.args[3];
	} else {
		var tokenData = data.args[2];
	}
	if(!('extjwtContent' in data.batch)){
		data.batch.extjwtContent = tokenData;
	} else {
		data.batch.extjwtContent += tokenData;
	}
	// Actual batch output data is handled by the labelNotProcessed handler too
});

ircEvents.on('protocol:inviteCommand', function(data) {
    // data.user, data.targetNick, data.channelName are available
    // Domain logic for invite command - maybe log it or store for later UI display
    console.log(`DOMAIN: ${data.user.nick} invited ${data.targetNick} to ${data.channelName}`);
    ircEvents.emit('channel:invited', {
        byNick: data.user.nick,
        targetNick: data.targetNick,
        channelName: data.channelName
    });
});

ircEvents.on('protocol:joinCommand', function(data) {
    var channelName = data.channelName;
    var user = data.user; // User who joined

    if (user === guser.me) { // If WE joined - create channel state
        // Create ChannelMemberList for channels WE are in
        var cml = users.addChannelMemberList(channelName);
        // Don't add ourselves here - NAMES reply will include us with proper channel modes

        // Mark this channel as initializing (waiting for NAMES completion)
        domainChannelsInitializing[channelName.toLowerCase()] = {
            channelName: channelName,
            joinTime: data.time
        };

        // Don't emit UI event yet - wait for NAMES to complete

        // Request channel modes
        ircCommand.mode(channelName, '');

        // Request WHO/WHOX to get account info for all users
        if (typeof isupport !== 'undefined' && 'WHOX' in isupport) {
            ircCommand.whox(channelName, "tuhanfr,101");
        } else {
            ircCommand.who(channelName);
        }
    } else { // Someone else joined
        // Only track if we're already in the channel
        var cml = users.getChannelMemberList(channelName);
        if (cml) {
            // We're in this channel - add the user to our member list
            cml.addMember(user);

            ircEvents.emit('channel:userJoined', {
                channelName: channelName,
                nick: user.nick,
                ident: user.ident,
                host: user.host,
                time: data.time
            });

            // If extended-join is not available, request WHO for this user to get account info
            if (typeof activeCaps !== 'undefined' && !('extended-join' in activeCaps)) {
                ircCommand.who(user.nick);
            }
        } else {
            // Server protocol violation: received JOIN for channel we're not in
            console.error('Server protocol violation: Received JOIN for', channelName, 'from', user.nick, 'but we are not a member of this channel');

            // Optionally show in status window
            ircEvents.emit('server:userJoinedOtherChannel', {
                channelName: channelName,
                nick: user.nick,
                ident: user.ident,
                host: user.host,
                time: data.time
            });
        }
    }
});

ircEvents.on('protocol:metadataCommand', function(data) {
    // Handle METADATA protocol events
    // data.target, data.key, data.subCommand, data.value
    var target = data.target;
    var key = data.key;
    var value = data.value;

    if (target.charAt(0) === '#') { // Channel metadata
        // Channel metadata handling (if needed in future)
    } else { // User metadata
        var user = users.getUser(target);
        user.setMetadata(key, value);
        // Emit specific metadata event for legacy compatibility
        ircEvents.emit('metadata:' + key, {
            user: user,
            key: key,
            value: value
        });
    }

    // Emit general metadata updated event
    ircEvents.emit('metadata:updated', {
        target: data.target,
        key: data.key,
        subCommand: data.subCommand,
        value: data.value
    });
});

ircEvents.on('protocol:modeCommand', function(data) {
    var target = data.target; // Channel or user nick
    var modeString = data.modeString; // "+o SomeNick" or "+m"

    if (data.isChannel) { // Protocol layer determines if target is a channel
        var channelName = target;

        // Parse mode string into mode chars and arguments
        var parts = modeString.split(' ');
        var modeSpecPart = parts[0] || '';
        var modeArgs = parts.slice(1);

        // Mode categories - member status modes always take a nick argument
        var memberStatusModes = ['o', 'v', 'h', 'a', 'q'];
        // Channel modes that take an arg only when adding
        var argAddOnlyModes = ['k', 'l', 'f', 'j', 'L'];
        // Channel modes that always take an arg (both add and remove)
        var argBothModes = ['b', 'e', 'I'];

        var argIndex = 0;
        var isAdding = true;
        var currentSign = '+';
        var chanModeChars = '';    // compact channel-only mode string (no member modes)
        var chanModeParams = [];   // args for channel-only modes

        for (var mi = 0; mi < modeSpecPart.length; mi++) {
            var ch = modeSpecPart[mi];
            if (ch === '+') { isAdding = true; currentSign = '+'; continue; }
            if (ch === '-') { isAdding = false; currentSign = '-'; continue; }

            if (memberStatusModes.indexOf(ch) >= 0) {
                // Member status mode: consume the nick arg, emit domain event
                var nick = modeArgs[argIndex++] || '';
                var user = users.getExistingUser(nick);
                if (user) {
                    ircEvents.emit('domain:channelModeForUserChanged', {
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

                var takesArg = argBothModes.indexOf(ch) >= 0 || (isAdding && argAddOnlyModes.indexOf(ch) >= 0);
                if (takesArg && argIndex < modeArgs.length) {
                    chanModeParams.push(modeArgs[argIndex++]);
                }
            }
        }

        // Emit channel:modesUpdated only if there are actual channel-setting mode changes
        if (chanModeChars.replace(/[+-]/g, '') !== '') {
            ircEvents.emit('channel:modesUpdated', {
                channelName: channelName,
                modes: chanModeChars,
                modeParams: chanModeParams,
                byNick: data.user.nick
            });
        }
    } else { // User mode
        // Check if this is for the current user
        var isSelf = (guser.me && target === guser.me.nick) || target === guser.nick;

        if (isSelf) {
            // Parse and apply the mode changes
            ircEvents.emit('domain:processUserModes', {
                modes: modeString,
                time: data.time || new Date()
            });
        } else {
            // Mode change for another user - emit generic event
            ircEvents.emit('user:modeChanged', {
                nick: target,
                modeString: modeString,
                byNick: data.user.nick,
                time: data.time || new Date()
            });
        }
    }
});

ircEvents.on('protocol:nickCommand', function(data) {
    var oldNick = data.user.nick;
    var newNick = data.newNick;

    // The users.changeNick function will update the global user list
    // and emit the domain:userNickChanged event which ChannelMemberList listens to.
    users.changeNick(oldNick, newNick);

    // If it's our own nick change, emit specific event for UI
    if (data.user.id === guser.me.id) { // Compare stable IDs for own nick
        ircEvents.emit('user:myNickChanged', { oldNick: oldNick, newNick: newNick });
    }
});

ircEvents.on('protocol:noticeCommand', function(data) {
    // Domain layer: determine message state and emit abstracted event
    // Extract only necessary fields from tags - don't pass raw tags to UI
    var tags = data.tags || {};
    var sender = data.user || { nick: data.prefix, ident: '', host: '', server: true };

    // Use server-provided timestamp if available (e.g., from history), otherwise use local time
    var messageTime = tags.time ? new Date(tags.time) : (data.time || new Date());

    var messageState = {
        messageType: 'NOTICE',     // Message type
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
    if(messageState.label && domainLabelsToHide.indexOf(messageState.label) !== -1){
        messageState.isHidden = true;
        return;
    }

    // Check if this is from a chat history batch
    var historyBatch = null;
    if(tags.batch && tags.batch in domainBatch){
        var batch = domainBatch[tags.batch];
        if(batch.type == 'chathistory') {
            messageState.isHistory = true;
            historyBatch = batch;
        } else {
            // Check parent batches
            for(var i=0; i<batch.parents.length; i++){
                if(batch.parents[i].type == 'chathistory'){
                    messageState.isHistory = true;
                    historyBatch = batch.parents[i];
                    break;
                }
            }
        }
    }

    // Track message stats in history batch
    if(historyBatch){
        historyBatch.receivedMessages = (historyBatch.receivedMessages || 0) + 1;
        // Track oldest message for "load older" reference
        if(!historyBatch.oldestMsgid && tags.msgid){
            historyBatch.oldestMsgid = tags.msgid;
        }
        if(!historyBatch.oldestTimestamp && tags.time){
            historyBatch.oldestTimestamp = tags.time;
        }
    }

    // Emit abstracted message event
    ircEvents.emit('message:received', messageState);
});

ircEvents.on('protocol:pingCommand', function(data) {
    // Domain logic for PING: respond with PONG
    ircEvents.emit('domain:requestIrcCommand', {
        command: 'PONG',
        args: [data.token]
    });
    ircEvents.emit('server:pingReceived', { // For debugging/monitoring
        token: data.token
    });
});

ircEvents.on('protocol:pongCommand', function(data) {
    // Domain logic for PONG: record latency, etc.
    ircEvents.emit('server:pongReceived', {
        token: data.token
    });
});

ircEvents.on('protocol:partCommand', function(data) {
    var channelName = data.channelName;
    var partMessage = data.partMessage;
    var user = data.user; // User who parted

    var cml = users.getChannelMemberList(channelName);
    if (cml) {
        cml.removeMemberById(user.id); // Remove the ChannelMember
        if (user === guser.me && cml.getAllMembers().length === 0) {
            users.removeChannelMemberList(channelName); // Remove the ChannelMemberList if empty and self parted
        }
    }

    // Emit event that a user has parted from a channel for the UI to update its channel object.
    ircEvents.emit('channel:userParted', {
        channelName: channelName,
        nick: user.nick,
        ident: user.ident,
        host: user.host,
        partMessage: partMessage,
        time: data.time
    });

    if (user === guser.me) { // If self parted
        // Emit specific event for UI to handle its own channel removal
        ircEvents.emit('user:selfPartedChannel', {
            channelName: channelName,
            nick: user.nick,
            partMessage: partMessage
        });
    }
});

ircEvents.on('protocol:kickCommand', function(data) {
    var channelName = data.channelName;
    var kickedNick = data.kickedNick;
    var reason = data.reason || '';
    var kicker = data.user; // User who performed the kick

    // Get the user object for the kicked user
    var kickedUser = users.getExistingUser(kickedNick);
    if (!kickedUser) {
        console.warn('DOMAIN: KICK received for unknown user:', kickedNick);
        return;
    }

    // Remove kicked user from channel member list
    var cml = users.getChannelMemberList(channelName);
    if (cml) {
        cml.removeMemberById(kickedUser.id);
        if (kickedUser === guser.me && cml.getAllMembers().length === 0) {
            users.removeChannelMemberList(channelName);
        }
    }

    // Emit event that a user was kicked from a channel
    ircEvents.emit('channel:userKicked', {
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
    if (kickedUser === guser.me) {
        ircEvents.emit('user:selfKickedFromChannel', {
            channelName: channelName,
            kickerNick: kicker.nick,
            reason: reason
        });
    }
});

ircEvents.on('protocol:privmsgCommand', function(data) {
    // Domain layer: determine message state and emit abstracted event
    // Extract only necessary fields from tags - don't pass raw tags to UI
    var tags = data.tags || {};

    // Use server-provided timestamp if available (e.g., from history), otherwise use local time
    var messageTime = tags.time ? new Date(tags.time) : data.time;

    var messageState = {
        messageType: 'PRIVMSG',    // Message type
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
    if(messageState.label && domainLabelsToHide.indexOf(messageState.label) !== -1){
        messageState.isHidden = true;
        gateway.labelProcessed = true;
        // Don't emit display event for hidden messages
        return;
    }

    // Check if this is from a chat history batch
    var historyBatch = null;
    if(tags.batch && tags.batch in domainBatch){
        var batch = domainBatch[tags.batch];
        if(batch.type == 'chathistory') {
            messageState.isHistory = true;
            historyBatch = batch;
        } else {
            // Check parent batches
            for(var i=0; i<batch.parents.length; i++){
                if(batch.parents[i].type == 'chathistory'){
                    messageState.isHistory = true;
                    historyBatch = batch.parents[i];
                    break;
                }
            }
        }
    }

    // Track message stats in history batch
    if(historyBatch){
        historyBatch.receivedMessages = (historyBatch.receivedMessages || 0) + 1;
        // Track oldest message for "load older" reference
        if(!historyBatch.oldestMsgid && tags.msgid){
            historyBatch.oldestMsgid = tags.msgid;
        }
        if(!historyBatch.oldestTimestamp && tags.time){
            historyBatch.oldestTimestamp = tags.time;
        }
    }

    // Check if this is our own message
    if(data.sender === guser.me || data.sender.nick === guser.me.nick){
        messageState.isOutgoing = true;

        // If we have echo-message but not labeled-response, skip displaying outgoing (wait for echo)
        if(!('labeled-response' in activeCaps) && ('echo-message' in activeCaps)){
            messageState.shouldSkipDisplay = true;
            return; // Don't display, wait for echo
        }

        // If we have both capabilities and this message has a label, check if it's an echo
        if(messageState.label && ('labeled-response' in activeCaps) && ('echo-message' in activeCaps)){
            // Check if this is an echo (received from server) or our local pending message
            // Echo messages come from protocol:privmsgCommand, while pending messages come from domain:outgoingMessage
            // We can detect echo by checking if this came from the protocol layer (has batch support data)
            // Actually, simpler: if we're receiving a PRIVMSG with our label from protocol, it's an echo
            // Local pending messages are emitted from domain:outgoingMessage, not protocol

            // Check if this is from the protocol layer (has certain protocol-only data)
            var isFromProtocol = ('tags' in data) || ('raw' in data);

            if(isFromProtocol){
                // This is an echo from the server
                messageState.isEcho = true;
                messageState.labelToReplace = messageState.label;
                gateway.labelProcessed = true;
                messageState.isPending = false;
            } else {
                // This is our local pending message
                messageState.isPending = true;
            }
        }
    }

    // Emit abstracted message event with all necessary metadata
    ircEvents.emit('message:received', messageState);
});

ircEvents.on('domain:outgoingMessage', function(data) {
    // Handle outgoing messages sent by the user (display as pending while waiting for echo)
    // This creates the "pending" display that will be replaced by the echo-message
    var messageState = {
        messageType: data.messageType,
        dest: data.dest,
        text: data.text,
        sender: data.sender,
        time: data.time,
        isOutgoing: true,
        isPending: ('labeled-response' in activeCaps) && ('echo-message' in activeCaps),
        label: data.label,
        isEcho: false,
        labelToReplace: null,
        msgid: null,
        isHidden: false,
        isHistory: false
    };

    // Emit message:received event for UI display
    ircEvents.emit('message:received', messageState);
});

ircEvents.on('protocol:quitCommand', function(data) {
    var quitMessage = data.quitMessage;
    var user = data.user; // User who quit

    if (user) {
        // Collect channels where the user was a member before removing them
        var affectedChannels = [];
        users.channelMemberLists.forEach(function(cml) {
            if (cml.findMemberById(user.id)) {
                affectedChannels.push(cml.channelName);
            }
        });

        // Remove user from all ChannelMemberLists they were part of
        users.channelMemberLists.forEach(function(cml) {
            cml.removeMemberById(user.id);
        });
        if (user === guser.me) { // Own quit
            ircEvents.emit('user:selfQuit', {
                nick: user.nick,
                quitMessage: quitMessage,
                channels: affectedChannels
            });
        } else { // Other user quit
            ircEvents.emit('user:otherQuit', {
                user: { nick: user.nick, ident: user.ident, host: user.host }, // Pass relevant user info
                quitMessage: quitMessage,
                channels: affectedChannels,
                time: new Date()
            });
        }
    }
});

ircEvents.on('protocol:setnameCommand', function(data) {
    if (data.user === guser.me) { // Own realname change
        guser.setRealname(data.newRealname);
    }
    ircEvents.emit('user:realnameChanged', {
        nick: data.user.nick,
        newRealname: data.newRealname
    });
});

ircEvents.on('protocol:topicCommand', function(data) {
    var channelName = data.channelName;
    var topic = data.topic;
    var user = data.user; // Who set the topic

    // Emit event that a channel's topic has changed for the UI to update its channel object.
    ircEvents.emit('channel:topicChanged', {
        channelName: channelName,
        topic: topic,
        setBy: user.nick,
        setDate: data.time.getTime() / 1000
    });
});

// Numeric handlers

ircEvents.on('protocol:rplWelcome', function(data) {
    // Update client state after successful connection and welcome message
    domainConnectStatus = '001';
    ircEvents.emit('client:welcome', {
        target: data.welcomeTarget,
        message: data.message
    });
    // Explicitly emit client:connected after welcome for UI
    ircEvents.emit('client:connected', {});
});

// Domain logic for client:connected event
ircEvents.on('client:connected', function(data) {
    console.log('DOMAIN: Client connected, handling domain-level setup');
    ircEvents.emit('domain:setConnectedWhenIdentified'); // Signal domain layer
    ircEvents.emit('domain:clearConnectTimeout'); // Clear connection timeout
});

ircEvents.on('protocol:rplYourhost', function(data) {
    ircEvents.emit('server:yourHost', {
        hostTarget: data.hostTarget,
        message: data.message
    });
});

ircEvents.on('protocol:rplCreated', function(data) {
    ircEvents.emit('server:createdInfo', {
        createdTarget: data.createdTarget,
        message: data.message
    });
});

ircEvents.on('protocol:rplMyinfo', function(data) {
    // Store this info in a global/domain state if needed
    // gateway.serverInfo = { ... }; // This should be managed directly within domain or via properties
    ircEvents.emit('server:myInfo', {
        serverName: data.serverName,
        version: data.version,
        userModes: data.userModes,
        channelModes: data.channelModes
    });
});

ircEvents.on('protocol:rplIsupport', function(data) {
    // Parse and store ISUPPORT tokens
    data.tokens.forEach(token => {
        let [key, value] = token.split('=');
        isupport[key] = value || true;
    });
    ircEvents.emit('server:isupportUpdated', {
        isupport: isupport
    });
});

ircEvents.on('protocol:rplUmodes', function(data) {
    // RPL_UMODES (221): server is telling us our complete mode string
    // Clear existing modes and parse the new mode string
    guser.clearUmodes();

    // Parse the mode string using domain:processUserModes
    if (data.umodes) {
        var modes = data.umodes;
        var plus = false;
        for(var i=0; i<modes.length; i++){
            var c = modes.charAt(i);
            switch(c){
                case '+': plus = true; break;
                case '-': plus = false; break;
                case ' ': return;
                default: guser.setUmode(c, plus); break;
            }
        }
    }

    // Emit user:settingInfo event with the umode string
    var umodeString = getUmodeString();
    ircEvents.emit('user:settingInfo', {
        nick: guser.me ? guser.me.nick : guser.nick,
        settingString: umodeString,
        time: data.time || new Date()
    });
});

ircEvents.on('protocol:rplNone', function(data) {
    // Generic empty numeric, usually safe to ignore or log
    console.log('DOMAIN: RPL_NONE received:', data.message);
    ircEvents.emit('server:genericMessage', {
        type: 'none',
        message: data.message
    });
});

ircEvents.on('protocol:rplAway', function(data) {
    var user = users.getUser(data.awayNick);
    if (user) {
        user.setAway(data.awayMessage);
        ircEvents.emit('user:awayStatusChanged', {
            nick: user.nick,
            awayMessage: data.awayMessage,
            isAway: true
        });
    }
});

ircEvents.on('protocol:rplUserhost', function(data) {
    // Parse reply and update user info
    var parts = data.reply.match(/([^=]+)=([^@]+)@(.*)/);
    if (parts) {
        var nick = parts[1];
        var ident = parts[2];
        var host = parts[3];
        var user = users.getUser(nick);
        if (user) {
            user.setIdent(ident);
            user.setHost(host);
            ircEvents.emit('user:infoUpdated', {
                nick: nick,
                ident: ident,
                host: host,
            });
        }
    }
});

ircEvents.on('protocol:rplIson', function(data) {
    // Update status of nicks that are on IRC
    data.nicks.forEach(nick => {
        var user = users.getUser(nick);
        if (user) {
            // Online status is ISON-specific, not stored permanently
            ircEvents.emit('user:onlineStatusChanged', {
                nick: nick,
                isOnline: true
            });
        }
    });
});

ircEvents.on('protocol:rplText', function(data) {
    // Generic text message from server, often for notices or errors
    ircEvents.emit('server:genericMessage', {
        type: 'text',
        message: data.message,
    });
});

ircEvents.on('protocol:rplUnaway', function(data) {
    if (guser.me) {
        guser.me.notAway();
        ircEvents.emit('user:awayStatusChanged', {
            nick: guser.me.nick,
            isAway: false,
        });
    }
});

ircEvents.on('protocol:rplNowaway', function(data) {
    if (guser.me) {
        guser.me.setAway(data.message);
        ircEvents.emit('user:awayStatusChanged', {
            nick: guser.me.nick,
            awayMessage: data.message,
            isAway: true,
        });
    }
});

ircEvents.on('protocol:rplWhoisregnick', function(data) {
    // WHOIS-specific data - don't update permanent user state
    // Only accumulate for WHOIS display
    domainWhoisData.isRegistered = true;
});

ircEvents.on('protocol:rplRulesstart', function(data) {
    ircEvents.emit('server:rulesStart', {
        target: data.target,
        message: data.message,
    });
});

ircEvents.on('protocol:rplEndofrules', function(data) {
    ircEvents.emit('server:endOfRules', {
        target: data.target,
        message: data.message,
    });
});

ircEvents.on('protocol:rplWhoishelpop', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Helpop status is WHOIS-specific, not stored permanently
        ircEvents.emit('user:helpopStatusChanged', {
            nick: user.nick,
            isHelpop: true,
        });
    }
});

// Accumulator for WHOIS data
// domainWhoisData global for domain
ircEvents.on('protocol:rplWhoisuser', function(data) {
    // WHOIS-specific data - don't update permanent user state
    // Only accumulate for WHOIS display
    domainWhoisData.nick = data.nick;
    domainWhoisData.ident = data.ident;
    domainWhoisData.host = data.host;
    domainWhoisData.realname = data.realname;
    domainWhoisData.isWhowas = false;
});

ircEvents.on('protocol:rplWhoisserver', function(data) {
    // WHOIS-specific data - don't update permanent user state
    // Only accumulate for WHOIS display
    domainWhoisData.server = data.server;
    domainWhoisData.serverInfo = data.serverInfo;
});

ircEvents.on('protocol:rplWhoisoperator', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Operator status is WHOIS-specific, not stored permanently
        ircEvents.emit('user:operatorStatusChanged', {
            nick: user.nick,
            isOperator: true,
        });
        domainWhoisData.operatorInfo = data.message;
    }
});

ircEvents.on('protocol:rplWhowasuser', function(data) {
    // This is information about a user who is no longer online
    ircEvents.emit('user:whowasInfo', {
        nick: data.nick,
        ident: data.ident,
        host: data.host,
        realname: data.realname,
    });
    domainWhoisData.nick = data.nick;
    domainWhoisData.ident = data.ident;
    domainWhoisData.host = data.host;
    domainWhoisData.realname = data.realname;
    domainWhoisData.isWhowas = true;
});

ircEvents.on('protocol:rplEndofwho', function(data) {
    ircEvents.emit('channel:endOfWho', {
        target: data.target,
        query: data.query,
        message: data.message,
    });
});

ircEvents.on('protocol:rplWhoisidle', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Idle and signon time are WHOIS-specific, stored in domainWhoisData
        ircEvents.emit('user:idleInfoUpdated', {
            nick: user.nick,
            idleSeconds: data.idleSeconds,
            signOn: data.signOn,
        });
        domainWhoisData.idleTime = data.idleSeconds;
        domainWhoisData.signedOn = data.signOn;
    }
});

ircEvents.on('protocol:rplEndofwhois', function(data) {
    console.log('[WHOIS-DEBUG] End of WHOIS for', data.nick, 'accumulated data:', domainWhoisData);
    ircEvents.emit('user:endOfWhois', {
        nick: data.nick,
    });
    ircEvents.emit('user:whoisComplete', { // Emit consolidated WHOIS data
        nick: data.nick,
        data: domainWhoisData,
    });
    domainWhoisData = {}; // Clear accumulator
});

ircEvents.on('protocol:rplWhoischannels', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Channel list is WHOIS-specific, stored in domainWhoisData
        ircEvents.emit('user:channelsUpdated', {
            nick: user.nick,
            channels: data.channels,
        });
        domainWhoisData.channels = data.channels;
    }
});

ircEvents.on('protocol:rplWhoisspecial', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Special status is WHOIS-specific info like "is a Network Administrator"
        // No need to store on user object, just emit for UI display
        ircEvents.emit('user:specialStatusUpdated', {
            nick: user.nick,
            status: data.message,
        });
        domainWhoisData.specialInfo = data.message;
    }
});

// domainSmallListData global for domain
ircEvents.on('protocol:rplListstart', function(data) {
    ircEvents.emit('server:listStart', {
        message: data.message,
    });
    domainSmallListData = []; // Initialize accumulator
});

ircEvents.on('protocol:rplList', function(data) {
    // Accumulate channel list information
    domainSmallListData.push({
        channel: data.channel,
        visibleUsers: data.visibleUsers,
        topic: data.topic
    });
    ircEvents.emit('server:channelListItem', {
        channel: data.channel,
        visibleUsers: data.visibleUsers,
        topic: data.topic,
    });
});

ircEvents.on('protocol:rplEndoflist', function(data) {
    ircEvents.emit('server:endOfList', {
        message: data.message,
    });
    ircEvents.emit('list:smallListComplete', { // Emit consolidated list data
        smallListData: domainSmallListData.map(item => [item.channel, item.visibleUsers, item.topic]),
    });
    domainSmallListData = []; // Clear accumulator
    gateway.smallListLoading = false; // Allow future /list commands to use full list window
});

ircEvents.on('protocol:rplChannelmodeis', function(data) {
    // Emit event that a channel's modes have been reported/updated for the UI to update its channel object.
    ircEvents.emit('channel:modesUpdated', {
        channelName: data.channelName,
        modes: data.modes,
        modeParams: data.modeParams,
    });
});

ircEvents.on('protocol:rplCreationtime', function(data) {
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        channel.setCreationTime(data.creationTime);
        ircEvents.emit('channel:creationTimeUpdated', {
            channelName: channel.name,
            channelId: channel.id,
            creationTime: data.creationTime,
        });
        domainWhoisData.creationTime = data.creationTime; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplWhoisloggedin', function(data) {
    // WHOIS-specific data - don't update permanent user state
    // Only accumulate for WHOIS display
    domainWhoisData.account = data.account;
});

ircEvents.on('protocol:rplNotopic', function(data) {
    var channelKey = data.channelName.toLowerCase();

    // Check if channel is being initially joined
    if (domainChannelsInitializing[channelKey]) {
        // Accumulate "no topic" data for channel creation event
        domainChannelsInitializing[channelKey].topic = '';
        domainChannelsInitializing[channelKey].topicSetBy = '';
        domainChannelsInitializing[channelKey].topicSetDate = 0;
    } else {
        // Channel already exists - emit event for UI to update
        ircEvents.emit('channel:topic', {
            channelName: data.channelName,
            topic: '',
            setBy: '',
            setDate: 0,
        });
    }
});

ircEvents.on('protocol:rplTopic', function(data) {
    var channelKey = data.channelName.toLowerCase();

    // Check if channel is being initially joined
    if (domainChannelsInitializing[channelKey]) {
        // Accumulate topic data for channel creation event
        domainChannelsInitializing[channelKey].topic = data.topic;
    } else {
        // Channel already exists - emit event for UI to update
        ircEvents.emit('channel:topic', {
            channelName: data.channelName,
            topic: data.topic,
        });
    }
});

ircEvents.on('protocol:rplTopicwhotime', function(data) {
    var channelKey = data.channelName.toLowerCase();

    // Check if channel is being initially joined
    if (domainChannelsInitializing[channelKey]) {
        // Accumulate topic metadata for channel creation event
        domainChannelsInitializing[channelKey].topicSetBy = data.setBy;
        domainChannelsInitializing[channelKey].topicSetDate = data.setDate;
    } else {
        // Channel already exists - emit event for UI to update topic metadata
        ircEvents.emit('channel:topicInfoUpdated', {
            channelName: data.channelName,
            setBy: data.setBy,
            setDate: data.setDate,
        });
    }
});

ircEvents.on('protocol:rplListsyntax', function(data) {
    ircEvents.emit('server:listsyntaxInfo', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplWhoisbot', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Bot status is WHOIS-specific, stored in domainWhoisData
        ircEvents.emit('user:isBot', {
            nick: user.nick,
            isBot: true,
        });
        domainWhoisData.isBot = true; // Add to WHOIS data
    }
});

// Invite list aggregation (WHOIS-style pattern)
var pendingInviteLists = {}; // Temporary storage for invite list entries

ircEvents.on('protocol:rplInvitlist', function(data) {
    var channelName = data.channelName;
    if (!pendingInviteLists[channelName]) {
        pendingInviteLists[channelName] = [];
    }
    pendingInviteLists[channelName].push({
        mask: data.usermask,
        setBy: data.setBy,
        setAt: data.setDate,
    });
});

ircEvents.on('protocol:rplEndofinvitelist', function(data) {
    var channelName = data.channelName;
    var channel = gateway.findChannel(channelName);
    if (channel) {
        var entries = pendingInviteLists[channelName] || [];
        ircEvents.emit('channel:inviteListComplete', {
            channelName: channel.name,
            channelId: channel.id,
            entries: entries,
            message: data.message,
        });
        delete pendingInviteLists[channelName];
    }
});

ircEvents.on('protocol:rplUserip', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // IP address is WHOIS-specific, stored in domainWhoisData
        ircEvents.emit('user:ipAddressUpdated', {
            nick: user.nick,
            ipAddress: data.userIp,
        });
    }
});

ircEvents.on('protocol:rplInviting', function(data) {
    // The server is telling us that `byNick` invited `nick` to `channel`
    ircEvents.emit('client:invited', {
        byNick: data.user.nick, // Assuming data.user is the inviter
        targetNick: data.nick,
        channelName: data.channelName,
    });
});

ircEvents.on('protocol:rplSummoning', function(data) {
    ircEvents.emit('user:summoned', {
        nick: data.nick,
        message: data.message,
    });
});

ircEvents.on('protocol:rplWhoiscountry', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Country is WHOIS-specific, stored in domainWhoisData
        ircEvents.emit('user:countryInfoUpdated', {
            nick: user.nick,
            countryCode: data.countryCode,
            countryName: data.countryName,
        });
        domainWhoisData.countryCode = data.countryCode; // Add to WHOIS data
        domainWhoisData.countryName = data.countryName; // Add to WHOIS data
    }
});

// Exception list aggregation (WHOIS-style pattern)
var pendingExceptLists = {}; // Temporary storage for except list entries

ircEvents.on('protocol:rplExceptlist', function(data) {
    var channelName = data.channelName;
    if (!pendingExceptLists[channelName]) {
        pendingExceptLists[channelName] = [];
    }
    pendingExceptLists[channelName].push({
        mask: data.exceptionMask,
        setBy: data.setBy,
        setAt: data.setDate,
    });
});

ircEvents.on('protocol:rplEndofexceptlist', function(data) {
    var channelName = data.channelName;
    var channel = gateway.findChannel(channelName);
    if (channel) {
        var entries = pendingExceptLists[channelName] || [];
        ircEvents.emit('channel:exceptListComplete', {
            channelName: channel.name,
            channelId: channel.id,
            entries: entries,
            message: data.message,
        });
        delete pendingExceptLists[channelName];
    }
});

ircEvents.on('protocol:rplVersion', function(data) {
    ircEvents.emit('server:versionInfo', {
        serverName: data.prefix, // From data.prefix
        version: data.version,
        debugLevel: data.debugLevel,
        comments: data.comments,
    });
});

ircEvents.on('protocol:rplWhoreply', function(data) {
    // Get domain-level user object. Assume users.getUser creates if not exists.
    var user = users.getUser(data.nick);

    // Update domain-level user properties
    user.setIdent(data.ident);
    user.setHost(data.host);
    user.setServer(data.server);
    user.setRealname(data.realname);
    // user.setModes(data.flags); // This might require further parsing

    // Emit event with updated user info for the UI
    ircEvents.emit('user:infoUpdated', {
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
        ircEvents.emit('channel:userJoined', {
            channelName: data.channelName,
            nick: user.nick,
            ident: user.ident,
            host: user.host,
        });
    }
});

ircEvents.on('protocol:rplNamreply', function(data) {
    var channelName = data.channelName;

    // Get or create ChannelMemberList for this channel
    var cml = users.addChannelMemberList(channelName);

    data.names.forEach(nickEntry => {
        let modes = '';
        let nick = nickEntry;
        let ident = '';
        let host = '';

        // Full parsing of modes/prefixes from nickEntry
        let userChannelModes = {};
        let userLevel = 0;

        // Strip channel status prefixes (@, +, etc.)
        if (isupport.PREFIX) {
            let prefixes = isupport.PREFIX.match(/\((.*?)\)(.+)/);
            if (prefixes) {
                let modeChars = prefixes[1];
                let prefixChars = prefixes[2];
                for (let i = 0; i < prefixChars.length; i++) {
                    if (nick.startsWith(prefixChars[i])) {
                        modes += modeChars[i];
                        nick = nick.substring(1);
                    }
                }
            } else { // Fallback for common prefixes if ISUPPORT is malformed
                if (nick.startsWith('@')) { modes += 'o'; nick = nick.substring(1); }
                else if (nick.startsWith('+')) { modes += 'v'; nick = nick.substring(1); }
            }
        }

        // Parse nick!ident@host if server sent extended format
        let exclamIdx = nick.indexOf('!');
        if (exclamIdx !== -1) {
            let atIdx = nick.indexOf('@', exclamIdx);
            if (atIdx !== -1) {
                ident = nick.substring(exclamIdx + 1, atIdx);
                host = nick.substring(atIdx + 1);
                nick = nick.substring(0, exclamIdx);
            }
        }
        // Apply parsed modes to userChannelModes object
        for (let i = 0; i < modes.length; i++) {
            const modeChar = modes.charAt(i);
            // Translate mode chars to meaningful properties (simplified)
            if (modeChar === 'o') userChannelModes.op = true;
            if (modeChar === 'v') userChannelModes.voice = true;
            if (modeChar === 'h') userChannelModes.halfop = true; // Example
            if (modeChar === 'a') userChannelModes.admin = true; // Example
            if (modeChar === 'q') userChannelModes.owner = true; // Example
        }
        // Determine level based on modes (example logic)
        if (userChannelModes.owner) userLevel = 5;
        else if (userChannelModes.admin) userLevel = 4;
        else if (userChannelModes.op) userLevel = 3;
        else if (userChannelModes.halfop) userLevel = 2;
        else if (userChannelModes.voice) userLevel = 1;

        // Get or create domain-level user object (this object is global to all channels)
        let user = users.getUser(nick); // users.getUser handles creation if it doesn't exist

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
    ircEvents.emit('channel:namesReplyComplete', {
        channelName: channelName,
        users: cml.getAllMembers().map(member => ({
            nick: member.nick,
            // Reconstruct modes string for compatibility if needed by other listeners
            modes: (member.channelModes.owner ? 'q' : '') +
                   (member.channelModes.admin ? 'a' : '') +
                   (member.channelModes.op ? 'o' : '') +
                   (member.channelModes.halfop ? 'h' : '') +
                   (member.channelModes.voice ? 'v' : ''),
            ident: member.ident,
            host: member.host
        })),
    });
});

ircEvents.on('protocol:rplWhospcrpl', function(data) {
    // Normalize account field: "*", "0", and empty string mean not logged in
    var account = (data.account === '*' || data.account === '0' || data.account === '') ? false : data.account;

    // Parse status flags (format: [H|G][*][@|+|etc])
    // H = here (not away), G = gone (away), * = IRC operator, B = bot
    // Note: Channel status prefixes (@, +, etc.) are handled by NAMES/MODE, not WHO
    var isAway = data.status && data.status.charAt(0) === 'G'; // First char indicates away status
    var isIrcOp = data.status && data.status.indexOf('*') !== -1;
    var isBot = data.status && data.status.indexOf('B') !== -1;

    var user = users.getUser(data.nick);
    if (user) {
        user.setIdent(data.ident);
        user.setHost(data.host);
        // Use gecos if available (from msg.text), otherwise use realname (from args[7])
        user.setRealname(data.gecos || data.realname);
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

        ircEvents.emit('user:extendedInfoUpdated', {
            nick: user.nick,
            ident: data.ident,
            host: data.host,
            server: data.server,
            realname: data.gecos || data.realname,
            account: account,
            status: data.status,
            away: isAway,
            ircOp: isIrcOp,
            bot: isBot
        });
    } else {
        var newUser = new users.user(data.nick);
        newUser.setIdent(data.ident);
        newUser.setHost(data.host);
        newUser.setRealname(data.gecos || data.realname);
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
        ircEvents.emit('user:extendedInfoUpdated', {
            nick: data.nick,
            ident: data.ident,
            host: data.host,
            server: data.server,
            realname: data.gecos || data.realname,
            account: account,
            status: data.status,
            away: isAway,
            ircOp: isIrcOp,
            bot: isBot
        });
    }
});

ircEvents.on('protocol:rplKilldone', function(data) {
    ircEvents.emit('server:killConfirmed', {
        nick: data.nick,
        reason: data.message, // data.text in protocolGeneric
    });
});

ircEvents.on('protocol:rplClosing', function(data) {
    ircEvents.emit('server:closingConnection', {
        server: data.serverName,
        message: data.message,
    });
});

ircEvents.on('protocol:rplCloseend', function(data) {
    ircEvents.emit('server:closeCommandEnded', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplLinks', function(data) {
    ircEvents.emit('server:linkInfo', {
        linkName: data.linkName,
        remoteServer: data.remoteServer,
        hopCount: data.hopCount,
        info: data.info,
    });
});

ircEvents.on('protocol:rplEndoflinks', function(data) {
    ircEvents.emit('server:endOfLinksList', {
        mask: data.mask,
        message: data.message,
    });
});

ircEvents.on('protocol:rplEndofnames', function(data) {
    var channelName = data.channelName;
    var channelKey = channelName.toLowerCase();

    // Check if this channel is being initially joined
    if (domainChannelsInitializing[channelKey]) {
        // Get the complete member list from domain
        var cml = users.getChannelMemberList(channelName);
        if (cml) {
            var members = cml.getAllMembers(); // Get all ChannelMember objects

            // Check if server supports chat history
            var historySupported = ('draft/chathistory' in activeCaps) && ('CHATHISTORY' in isupport);
            var historyMaxLimit = historySupported ? (isupport['CHATHISTORY'] || 0) : 0;

            // Emit channel:channelCreation with complete initial data
            ircEvents.emit('channel:channelCreation', {
                channelName: channelName,
                members: members, // Complete member list with all privileges
                joinTime: domainChannelsInitializing[channelKey].joinTime,
                // Include our own user info for the join message
                nick: guser.me.nick,
                ident: guser.me.ident,
                host: guser.me.host,
                // Include topic data if available
                topic: domainChannelsInitializing[channelKey].topic || '',
                topicSetBy: domainChannelsInitializing[channelKey].topicSetBy || '',
                topicSetDate: domainChannelsInitializing[channelKey].topicSetDate || 0,
                // Include history support info for UI
                historySupported: historySupported,
                historyMaxLimit: historyMaxLimit
            });

            // Remove from initializing list
            delete domainChannelsInitializing[channelKey];
        }
    } else {
        // This is a NAMES refresh (not initial join)
        // Emit channel:memberListReplace to tell UI to rebuild nicklist
        var cml = users.getChannelMemberList(channelName);
        if (cml) {
            var members = cml.getAllMembers();
            ircEvents.emit('channel:memberListReplace', {
                channelName: channelName,
                members: members
            });
        }
    }
});

// Ban list aggregation (WHOIS-style pattern)
var pendingBanLists = {}; // Temporary storage for ban list entries

ircEvents.on('protocol:rplBanlist', function(data) {
    var channelName = data.channelName;
    if (!pendingBanLists[channelName]) {
        pendingBanLists[channelName] = [];
    }
    pendingBanLists[channelName].push({
        mask: data.banmask,
        setBy: data.setBy,
        setAt: data.setAt,
    });
});

ircEvents.on('protocol:rplEndofbanlist', function(data) {
    var channelName = data.channelName;
    var channel = gateway.findChannel(channelName);
    if (channel) {
        var entries = pendingBanLists[channelName] || [];
        ircEvents.emit('channel:banListComplete', {
            channelName: channel.name,
            channelId: channel.id,
            entries: entries,
            message: data.message,
        });
        delete pendingBanLists[channelName];
    }
});

ircEvents.on('protocol:rplEndofwhowas', function(data) {
    ircEvents.emit('user:endOfWhowas', {
        nick: data.nick,
        message: data.message,
    });
});

ircEvents.on('protocol:rplInfo', function(data) {
    // RPL_INFO (371) - Server info line
    // Not displayed (old code also ignored this)
});

ircEvents.on('protocol:rplMotd', function(data) {
    ircEvents.emit('server:motdLine', {
        line: data.line,
    });
});

ircEvents.on('protocol:rplInfostart', function(data) {
    // RPL_INFOSTART (373) - Server info start
    // Not displayed (old code also ignored this)
});

ircEvents.on('protocol:rplEndofinfo', function(data) {
    ircEvents.emit('server:endOfInfo', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplMotdstart', function(data) {
    var serverNameMatch = data.message.match(/^- ([^ ]+) Message of the day -/);
    var serverName = serverNameMatch ? serverNameMatch[1] : '';
    ircEvents.emit('server:motdStart', {
        server: serverName,
        message: data.message,
    });
});

ircEvents.on('protocol:rplEndofmotd', function(data) {
    ircEvents.emit('server:endOfMotd', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplWhoishost', function(data) {
    // WHOIS-specific data - don't update permanent user state
    // Only accumulate for WHOIS display (actual host for opers)
    domainWhoisData.hostInfo = data.host;
});

ircEvents.on('protocol:rplWhoismodes', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // User modes are WHOIS-specific, stored in domainWhoisData
        ircEvents.emit('user:whoisModes', {
            nick: user.nick,
            modes: data.modes,
        });
        domainWhoisData.userModes = data.modes; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplYoureoper', function(data) {
    // Assume current user (guser.me) is the oper
    if (guser.me) {
        guser.me.setOperator(true);
    }
    ircEvents.emit('user:isOperator', {
        nick: guser.me ? guser.me.nick : null,
        message: data.message,
    });
});

ircEvents.on('protocol:rplRehashing', function(data) {
    ircEvents.emit('server:rehashingConfig', {
        configFile: data.configFile,
        message: data.message,
    });
});

ircEvents.on('protocol:rplYoureservice', function(data) {
    if (guser.me) {
        guser.me.setService(true); // Assuming `setService` method
    }
    ircEvents.emit('user:isService', {
        nick: guser.me ? guser.me.nick : null,
        message: data.message,
    });
});

ircEvents.on('protocol:rplMyportis', function(data) {
    ircEvents.emit('server:myPortInfo', {
        port: data.port,
        message: data.message,
    });
});

ircEvents.on('protocol:rplNotoperanymore', function(data) {
    if (guser.me) {
        guser.me.setOperator(false);
    }
    ircEvents.emit('user:isOperator', {
        nick: guser.me ? guser.me.nick : null,
        isOperator: false,
        message: data.message,
    });
});

// Quiet list (RPL_QLIST/RPL_ENDOFQLIST) not supported
// Only ban (b), except (e), and invex (I) lists are implemented

ircEvents.on('protocol:rplAlist', function(data) {
    // A list entries (admin list)
    ircEvents.emit('server:alistEntry', {
        channel: data.channelName,
        mask: data.mask,
        message: data.message,
    });
});

ircEvents.on('protocol:rplEndofalist', function(data) {
    ircEvents.emit('server:endOfAlist', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplTime', function(data) {
    ircEvents.emit('server:serverTime', {
        server: data.prefix,
        time: data.serverTime,
    });
});

ircEvents.on('protocol:rplUsersstart', function(data) {
    ircEvents.emit('server:usersStart', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplUsers', function(data) {
    // User info for USERS command
    ircEvents.emit('server:usersEntry', {
        username: data.username,
        tty: data.tty,
        host: data.host,
        nick: data.nick,
    });
});

ircEvents.on('protocol:rplEndofusers', function(data) {
    ircEvents.emit('server:endOfUsers', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplNousers', function(data) {
    ircEvents.emit('server:noUsers', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplHosthidden', function(data) {
    // RPL_HOSTHIDDEN - server confirming hidden host is active
    // Just emit event for UI to display the message
    ircEvents.emit('user:hostHidden', {
        nick: guser.me ? guser.me.nick : null,
        hiddenHost: data.hiddenHost,
        message: data.message,
        time: data.time
    });
});

ircEvents.on('protocol:errNosuchnick', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '401',
        type: 'noSuchNick',
        message: data.message,
        target: data.nick,
    });
});

ircEvents.on('protocol:errNosuchserver', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '402',
        type: 'noSuchServer',
        message: data.message,
        target: data.serverName,
    });
});

ircEvents.on('protocol:errNosuchchannel', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '403',
        type: 'noSuchChannel',
        message: data.message,
        target: data.channelName,
    });
});

ircEvents.on('protocol:errCannotSendToChan', function(data) {
    // ERR_CANNOTSENDTOCHAN (404) - cannot send to channel
    console.log('[LABEL-DEBUG] protocol:errCannotSendToChan handler, tags.label:', data.tags ? data.tags.label : 'no tags');
    // Emit channel-specific error event for UI display
    ircEvents.emit('channel:errorMessage', {
        channelName: data.channelName,
        reason: data.reason, // voiceNeeded, banned, noColor, noExternal, accountNeeded, or generic
        message: data.message, // Raw message for generic case
        time: data.time
    });
});

ircEvents.on('protocol:error', function(data) { // Original generic protocol:error handler
    // This handler will catch generic protocol errors that don't have a specific numeric or command.
    // Also captures ERR_CANNOTSENDTOCHAN (404) re-emitted as protocol:error by cmd_binds.
    var errorType = 'genericError';
    var target = data.target || data.channel || data.query;
    var code = data.command; // Default to command if no numeric code

    if (code === '404') {
        errorType = 'cannotSendToChan';
    } else if (data.type) { // If a more specific type was provided by the original emitter
        errorType = data.type;
    }

    ircEvents.emit('client:errorMessage', {
        code: code,
        type: errorType,
        message: data.text,
        target: target,
    });
});

ircEvents.on('protocol:errWasnosuchnick', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '406',
        type: 'wasNoSuchNick',
        message: data.message,
        target: data.nick,
    });
});

ircEvents.on('protocol:errNorecipient', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '411',
        type: 'noRecipient',
        message: data.message,
    });
});

ircEvents.on('protocol:errErroneusnickname', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '432',
        type: 'erroneousNickname',
        message: data.message,
        nick: data.nick,
    });
});

ircEvents.on('protocol:errNicknameinuse', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '433',
        type: 'nicknameInUse',
        message: data.message,
        nick: data.nick,
    });
});

ircEvents.on('protocol:errNotonchannel', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '442',
        type: 'notOnChannel',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errUseronchannel', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '443',
        type: 'userOnChannel',
        message: data.message,
        nick: data.nick,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errNonickchange', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '447',
        type: 'noNickChange',
        message: data.message,
        nick: data.nick,
    });
});

ircEvents.on('protocol:errYouwillbebanned', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '466',
        type: 'youWillBeBanned',
        message: data.message,
    });
});

ircEvents.on('protocol:errYoureBannedCreep', function(data) {
    // ERR_YOUREBANNEDCREEP (465) - User is banned from server
    // This requires special handling: show ban dialog and set connect status
    ircEvents.emit('client:globalBan', {
        code: '465',
        message: data.message,
        time: data.time
    });
    // Set connection status to banned
    ircEvents.emit('domain:setConnectStatus', { status: 'banned' });
});

ircEvents.on('protocol:errKeyset', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '467',
        type: 'keySet',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errOnlyserverscanchange', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '468',
        type: 'onlyServersCanChange',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errLinkset', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '469',
        type: 'linkSet',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errLinkchannel', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '470',
        type: 'linkChannel',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errChannelisfull', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '471',
        type: 'channelIsFull',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errUnknownmode', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '472',
        type: 'unknownMode',
        message: data.message,
        mode: data.mode,
    });
});

ircEvents.on('protocol:errInviteonlychan', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '473',
        type: 'inviteOnlyChan',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errBannedfromchan', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '474',
        type: 'bannedFromChan',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errBadchannelkey', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '475',
        type: 'badChannelKey',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errNeedreggednick', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '477',
        type: 'needReggedNick',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errBanlistfull', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '478',
        type: 'banListFull',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errLinkfail', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '479',
        type: 'linkFail',
        message: data.message,
    });
});

ircEvents.on('protocol:errCannotknock', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '480',
        type: 'cannotKnock',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errNoprivileges', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '481',
        type: 'noPrivileges',
        message: data.message,
    });
});

ircEvents.on('protocol:errChanoprivsneeded', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '482',
        type: 'chanOpPrivsNeeded',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errNononreg', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '486',
        type: 'noNonreg',
        message: data.message,
    });
});

ircEvents.on('protocol:errNotforusers', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '487',
        type: 'notForUsers',
        message: data.message,
    });
});

ircEvents.on('protocol:errSecureonlychan', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '489',
        type: 'secureOnlyChan',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errNoswear', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '490',
        type: 'noSwear',
        message: data.message,
    });
});

ircEvents.on('protocol:errNooperhost', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '491',
        type: 'noOperHost',
        message: data.message,
    });
});

ircEvents.on('protocol:errNoctcp', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '492',
        type: 'noCtcp',
        message: data.message,
    });
});

ircEvents.on('protocol:errChanownprivneeded', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '499',
        type: 'chanOwnPrivNeeded',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errToomanyjoins', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '500',
        type: 'tooManyJoins',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errUmodeunknownflag', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '501',
        type: 'uModeUnknownFlag',
        message: data.message,
        mode: data.mode,
    });
});

ircEvents.on('protocol:errUsersdontmatch', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '502',
        type: 'usersDontMatch',
        message: data.message,
    });
});

ircEvents.on('protocol:errSilelistfull', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '511',
        type: 'sileListFull',
        message: data.message,
    });
});

ircEvents.on('protocol:errToomanywatch', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '512',
        type: 'tooManyWatch',
        message: data.message,
    });
});

ircEvents.on('protocol:errNeedpong', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '513',
        type: 'needPong',
        message: data.message,
    });
});

ircEvents.on('protocol:errToomanydcc', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '514',
        type: 'tooManyDcc',
        message: data.message,
    });
});

ircEvents.on('protocol:errDisabled', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '517',
        type: 'disabled',
        message: data.message,
    });
});

ircEvents.on('protocol:errNoinvite', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '518',
        type: 'noInvite',
        message: data.message,
    });
});

ircEvents.on('protocol:errAdmonly', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '519',
        type: 'admOnly',
        message: data.message,
    });
});

ircEvents.on('protocol:errOperonly', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '520',
        type: 'operOnly',
        message: data.message,
    });
});

ircEvents.on('protocol:errListsyntax', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '521',
        type: 'listSyntax',
        message: data.message,
    });
});

ircEvents.on('protocol:errCantsendtouser', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '531',
        type: 'cantSendToUser',
        message: data.message,
        nick: data.nick,
    });
});

ircEvents.on('protocol:rplReaway', function(data) {
    ircEvents.emit('user:reAway', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplGoneaway', function(data) {
    ircEvents.emit('user:goneAway', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplNotaway', function(data) {
    if (guser.me) { // Ensure current user exists before updating
        guser.me.notAway();
    }
    ircEvents.emit('user:awayStatusChanged', { // Emit a consistent away status changed event
        nick: guser.me ? guser.me.nick : null,
        isAway: false,
        message: data.message,
    });
});

ircEvents.on('protocol:rplLogon', function(data) {
    ircEvents.emit('user:loggedIn', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplLogoff', function(data) {
    ircEvents.emit('user:loggedOut', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplWatchoff', function(data) {
    ircEvents.emit('client:watchOff', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplWatchstat', function(data) {
    ircEvents.emit('client:watchStatus', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplNowon', function(data) {
    var user = users.getUser(data.nick); // Find user by nick from protocolGeneric
    if (user) {
        // Online status from JOIN, not stored permanently
        ircEvents.emit('user:onlineStatusChanged', {
            nick: user.nick,
            isOnline: true,
            message: data.message,
        });
    }
});

ircEvents.on('protocol:rplNowoff', function(data) {
    var user = users.getUser(data.nick); // Find user by nick from protocolGeneric
    if (user) {
        // Online status from QUIT, not stored permanently
        ircEvents.emit('user:onlineStatusChanged', {
            nick: user.nick,
            isOnline: false,
            message: data.message,
        });
    }
});

ircEvents.on('protocol:rplWatchlist', function(data) {
    ircEvents.emit('client:watchListEntry', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplEndofwatchlist', function(data) {
    ircEvents.emit('client:endOfWatchList', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplClearwatch', function(data) {
    ircEvents.emit('client:clearWatch', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplNowisaway', function(data) {
    ircEvents.emit('user:nowIsAway', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplWhoissecure', function(data) {
    var user = users.getUser(data.nick);
    if (user) {
        // Secure connection is WHOIS-specific, stored in domainWhoisData
    }
    ircEvents.emit('user:isSecure', {
        nick: data.nick,
        message: data.message,
    });
    domainWhoisData.isSecure = true; // Add to WHOIS data
});

ircEvents.on('protocol:errMlockrestricted', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '742',
        type: 'mlockRestricted',
        message: data.message,
        channel: data.channelName,
    });
});

ircEvents.on('protocol:errCannotDoCommand', function(data) {
    // ERR_CANNOTDOCOMMAND (972) - Cannot execute command due to permissions
    ircEvents.emit('client:permissionError', {
        code: '972',
        type: 'cannotDoCommand',
        message: data.message,
        target: data.target,
        time: data.time
    });
});

ircEvents.on('protocol:errCannotChangeChanMode', function(data) {
    // ERR_CANNOTCHANGECHANMODE (974) - Cannot change channel mode due to permissions
    ircEvents.emit('client:permissionError', {
        code: '974',
        type: 'cannotChangeChanMode',
        message: data.message,
        target: data.target,
        time: data.time
    });
});

ircEvents.on('protocol:rplKeyvalue', function(data) {
    ircEvents.emit('metadata:keyValue', {
        target: data.target,
        key: data.key,
        value: data.value,
    });
});

ircEvents.on('protocol:rplMetadataend', function(data) {
    ircEvents.emit('metadata:end', {
        message: data.message,
    });
});

ircEvents.on('protocol:rplKeynotset', function(data) {
    ircEvents.emit('client:errorMessage', { // Emitting as an error, as it indicates something went wrong
        code: '766',
        type: 'metadataKeyNotSet',
        message: data.message,
        target: data.target,
        key: data.key,
    });
});

ircEvents.on('protocol:rplMetadatasubok', function(data) {
    ircEvents.emit('metadata:subscriptionOk', {
        target: data.target,
        key: data.key,
        message: data.message,
    });
});

ircEvents.on('protocol:errMetadatasynclater', function(data) {
    ircEvents.emit('client:errorMessage', {
        code: '774',
        type: 'metadataSyncLater',
        message: data.message,
        delayMs: data.delayMs,
    });
});

ircEvents.on('protocol:rplLoggedin', function(data) {
    ircEvents.emit('auth:loggedIn', {
        nick: data.nick,
        account: data.account,
        message: data.message,
    });
    ircEvents.emit('auth:saslLoggedIn', { // Emit for consistency with display
        nick: data.nick,
        account: data.account,
        time: data.time
    });
    ircEvents.emit('auth:userIdentifiedViaNickserv', { // Emit for consistency with display
        nick: data.nick,
        account: data.account,
        time: data.time
    });
});

ircEvents.on('protocol:rplLoggedout', function(data) {
    ircEvents.emit('auth:loggedOut', {
        nick: data.nick,
        message: data.message,
    });
    ircEvents.emit('auth:saslLoggedOut', { // Emit for consistency with display
        nick: data.nick,
        message: data.message,
        time: data.time
    });
});

ircEvents.on('protocol:rplSaslsuccess', function(data) {
    ircEvents.emit('auth:saslSuccess', {
        message: data.message,
    });
    saslInProgress = false; // Reset SASL state
    domainRetrySasl = false;
    // Some servers send only 903, not 900, so send CAP END here to finalize registration
    if (!capInProgress) {
        ircCommand.performQuick('CAP', ['END']);
    }
    // Trigger status update to transition from 'identified' to 'connected'
    ircEvents.emit('domain:processConnectionStatusUpdate');
});

ircEvents.on('protocol:errSaslfail', function(data) {
    ircEvents.emit('auth:saslFail', {
        message: data.message,
    });
    saslInProgress = false; // Reset SASL state
    // End capability negotiation on SASL failure to finalize registration
    ircCommand.performQuick('CAP', ['END']);
});

ircEvents.on('protocol:errSaslaborted', function(data) {
    ircEvents.emit('auth:saslAborted', {
        message: data.message,
    });
    saslInProgress = false; // Reset SASL state
    // End capability negotiation on SASL abort to finalize registration
    ircCommand.performQuick('CAP', ['END']);
});

ircEvents.on('protocol:error', function(data) {
    // Generic error handling, for things like 404, 465, 972, 974 etc.
    // The specific `command` and `type` fields help categorize.
    var errorType = data.type || 'genericError';
    if(data.command == '404') { // ERR_CANNOTSENDTOCHAN from cmd_binds
        errorType = 'cannotSendToChan';
    } else if (data.command == '465') { // ERR_YOUREBANNEDCREEP from cmd_binds
        errorType = 'bannedCreep';
    } else if (data.command == '972') { // ERR_CANNOTDOCOMMAND from cmd_binds
        errorType = 'cannotDoCommand';
    } else if (data.command == '974') { // ERR_CANNOTCHANGECHANMODE from cmd_binds
        errorType = 'cannotChangeChanMode';
    }
    ircEvents.emit('client:errorMessage', {
        code: data.command, // Use original command as code if numeric not available
        type: errorType,
        target: data.target || data.channel || data.query,
        message: data.text,
    });
});

ircEvents.on('protocol:ctcpAction', function(data) {
    ircEvents.emit('ctcp:action', {
        sender: data.user.nick,
        target: data.target,
        message: data.text,
    });
});

// Note: CTCP reply filtering moved to UI layer (gateway_display.js)
// because both domain and UI listen to protocol:ctcpReply directly

ircEvents.on('protocol:ctcpVersionRequest', function(data) {
    // Build version string matching old format
    var versionString = language.gatewayVersionIs + mainSettings.version;
    if (addons && addons.length > 0) {
        versionString += language.versionWithAddons;
        for (var i = 0; i < addons.length; i++) {
            if (i > 0) {
                versionString += ', ';
            }
            versionString += addons[i];
        }
    }
    versionString += ', ' + language.runningOn + ' ' + navigator.userAgent;

    // Send CTCP reply
    ircCommand.sendCtcpReply(data.requestedBy, 'VERSION ' + versionString);

    ircEvents.emit('ctcp:versionRequest', {
        sender: data.requestedBy,
        target: data.target,
    });
});

ircEvents.on('protocol:ctcpUserinfoRequest', function(data) {
    // Build version string matching old format (USERINFO used same format as VERSION)
    var versionString = language.gatewayVersionIs + mainSettings.version;
    if (addons && addons.length > 0) {
        versionString += language.versionWithAddons;
        for (var i = 0; i < addons.length; i++) {
            if (i > 0) {
                versionString += ', ';
            }
            versionString += addons[i];
        }
    }
    versionString += ', ' + language.runningOn + ' ' + navigator.userAgent;

    // Send CTCP reply
    ircCommand.sendCtcpReply(data.requestedBy, 'USERINFO ' + versionString);

    ircEvents.emit('ctcp:userinfoRequest', {
        sender: data.requestedBy,
        target: data.target,
    });
});

ircEvents.on('protocol:ctcpRefererRequest', function(data) {
    ircEvents.emit('ctcp:refererRequest', {
        sender: data.requestedBy,
        target: data.target,
    });
});

ircEvents.on('protocol:unhandledMessage', function(data) {
    console.log('DOMAIN: Unhandled protocol message:', data.command, data.args, data.text);
    ircEvents.emit('client:unhandledMessage', {
        command: data.command,
        args: data.args,
        text: data.text,
    });
});

ircEvents.on('domain:labelNotProcessed', function(data) {
    // Handle labels that weren't processed by any command handler
    // This typically happens when we send a message expecting an echo-message response,
    // but receive an error or unexpected response instead
    var label = data.label;

    console.log('[LABEL-DEBUG] domain:labelNotProcessed fired, label:', label, 'msg command:', data.msg ? data.msg.command : 'no msg');

    if (label) {
        // Mark the sent message as undelivered
        // msgNotDelivered checks echo-message capability and safely handles unknown labels
        console.log('[LABEL-DEBUG] Calling msgNotDelivered for label:', label);
        gateway.msgNotDelivered(label, data.msg);
    }
});


// Helper to parse mode strings (simplified for +o/-o)
function parseChannelUserModes(modeString, channelName) {
    var changes = [];
    var isAdding = true; // true for '+', false for '-'

    var parts = modeString.split(' ');
    var currentModeArgIndex = 0; // Tracks the index in 'parts' for mode arguments

    // Find the actual mode string part (e.g., "+o-v")
    var modeSpecPart = parts[0];
    var argsParts = parts.slice(1); // Arguments for the modes

    for (var i = 0; i < modeSpecPart.length; i++) {
        var char = modeSpecPart.charAt(i);
        if (char === '+') {
            isAdding = true;
        } else if (char === '-') {
            isAdding = false;
        } else {
            // Check if this mode takes an argument (a user nick)
            // This is a simplification: real IRC mode parsing is complex with CHANMODES ISUPPORT.
            // For now, assume o, v, h, a, q always take an argument (a nick)
            if (['o', 'v', 'h', 'a', 'q'].includes(char)) {
                if (currentModeArgIndex < argsParts.length) {
                    var nickAffected = argsParts[currentModeArgIndex];
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

ircEvents.on('domain:requestCap', function(data) {
    console.log('DOMAIN: Request CAP:', data.type, data.caps);
    ircCommand.performQuick('CAP', [data.type], data.caps);
});

ircEvents.on('domain:requestMetadataSubscription', function(data) {
    console.log('DOMAIN: Request Metadata Subscription:', data.keys);
    ircCommand.metadata('SUB', '*', data.keys);
});

ircEvents.on('domain:userAvatarCapabilityChanged', function() {
    console.log('DOMAIN: User avatar capability changed.');
    // This might eventually trigger a UI update or domain state change
});

ircEvents.on('domain:clientCanSetAvatar', function() {
    console.log('DOMAIN: Client can now set avatar.');
    // This might eventually trigger a UI update or domain state change
});

ircEvents.on('domain:requestSaslAuthenticate', function(data) {
    console.log('DOMAIN: Request SASL Authenticate:', data.mechanism);
    // Note: guser.nickservnick and guser.nickservpass are still global.
    // In a cleaner domain layer, these would be passed or managed within the domain layer state.
    ircCommand.performQuick('AUTHENTICATE', ['PLAIN']);
    ircEvents.emit('auth:saslLoginAttempt', { time: data.time }); // Re-emit original event for other domain listeners
});

ircEvents.on('domain:endCapNegotiation', function() {
    console.log('DOMAIN: End CAP Negotiation.');
    ircCommand.performQuick('CAP', ['END']);
});


// ============================================================================
// NEW DOMAIN EVENTS HANDLERS (from gateway_def.js, gateway_functions.js, gateway_tabs.js)
// ============================================================================

// --- Connection & Disconnection ---

ircEvents.on('domain:requestConnect', function(data) {
    console.log('DOMAIN: Request Connect:', data.status, data.initialMessage);
    gateway.connect(data.force);
});

ircEvents.on('domain:setConnectedWhenIdentified', function() {
    console.log('DOMAIN: Set Connected When Identified');
    domainSetConnectedWhenIdentified = 1;
});

// Label generation function - called directly, not via events
function generateLabel() {
    domainLabel++;
    return domainLabel.toString();
}

// Domain state getter functions - provide controlled access to domain state
function getDomainConnectStatus() {
    return domainConnectStatus;
}

function getDomainConnectTime() {
    return domainConnectTime;
}

function hasActiveCap(capName) {
    return capName in activeCaps;
}

ircEvents.on('domain:requestPing', function() {
    console.log('DOMAIN: Request Ping');
    domainPingCnt++;
    gateway.forceSend('PING :JavaScript'); // Protocol action
    if(domainPingCnt > 3) {
        domainConnectStatus = 'error';
        ircEvents.emit('domain:connectionDisconnected', { reasonKey: 'pingTimeout' }); // Pass key instead of string
        // Emit a UI event asking it to perform reconnect logic based on its settings
        ircEvents.emit('ui:handleReconnectLogic', { type: 'pingTimeout' }); // Let UI decide based on its settings
        domainPingCnt = 0;
    }
});

ircEvents.on('domain:connectionDisconnected', function(data) {
    // Normalize reason: accept either reasonKey (for translation) or reason (for direct text)
    var reasonText = data.reasonKey ? language[data.reasonKey] : data.reason;
    console.log('DOMAIN: Connection Disconnected:', reasonText);
    clearTimeout(domainConnectTimeoutID);
    if (ircTransport.websock) { // Assuming ircTransport.websock is a domain-level network interface
        ircTransport.websock.onerror = undefined;
        ircTransport.websock.onclose = undefined;
    }
    domainConnectTimeoutID = false;
    clearInterval(domainPingIntervalID);
    domainPingIntervalID = false;

    guser.clear(); // Clear domain user state

    // Emit events for UI to handle various cleanups and messages
    ircEvents.emit('ui:updateHistory'); // For gateway.updateHistory()
    ircEvents.emit('ui:clearLabelCallbacks'); // For gateway.labelCallbacks cleanup
    ircEvents.emit('ui:disconnectCleanupChannels', { reason: reasonText }); // For channel parts and append messages
    ircEvents.emit('ui:statusWindowMessage', { reason: reasonText }); // For status window message

    // Domain-level cleanup of domainBatch
    domainBatch = {}; // Clear domainBatch object directly

    if(guser.nickservnick != ''){
        irc.lastNick = guser.nick;
        guser.nick = guser.nickservnick;
    }

    if(domainDisconnectMessageShown) {
        return;
    }
    domainDisconnectMessageShown = 1;

    // Emit client:disconnected event for UI layer to listen to
    ircEvents.emit('client:disconnected', { reason: reasonText });
});

ircEvents.on('domain:connectionInitiated', function() {
    console.log('DOMAIN: Connection Initiated');
    domainUserQuit = false;
});

ircEvents.on('domain:connectionTimeout', function() {
    console.log('DOMAIN: Connection Timeout');
    domainConnectTimeoutID = false;
    if(domainUserQuit){
        return;
    }
    if(domainConnectStatus != 'connected'){
        // This used to be in gateway.connectTimeout()
        ircEvents.emit('domain:connectionTimeoutExpired', { currentStatus: domainConnectStatus });
    }
});

ircEvents.on('domain:websocketError', function(data) {
    console.error('DOMAIN: WebSocket Error:', data.event, 'Current Status:', domainConnectStatus);
    if(domainConnectStatus != 'disconnected' && domainConnectStatus != 'error' && domainConnectStatus != 'banned'){
        domainConnectStatus = 'error';
        ircEvents.emit('domain:connectionDisconnected', { reasonKey: 'lostNetworkConnection' });
    }
});


ircEvents.on('domain:clearConnectTimeout', function() {
    console.log('DOMAIN: Clearing connect timeout.');
    clearTimeout(domainConnectTimeoutID);
    domainConnectTimeoutID = false;
});

ircEvents.on('domain:setConnectionTimeout', function(data) {
    console.log('DOMAIN: Setting connection timeout for ' + (data.duration || 20000) + 'ms');
    clearTimeout(domainConnectTimeoutID); // Clear any existing timeout
    var duration = data.duration || 20000; // Default 20 seconds
    domainConnectTimeoutID = setTimeout(function() {
        console.log('DOMAIN: Connection timeout fired');
        ircEvents.emit('domain:connectionTimeout');
    }, duration);
});

ircEvents.on('domain:requestStopAndReconnect', function(data) {
    console.log('DOMAIN: Request Stop And Reconnect:', data.reason);
    ircEvents.emit('domain:connectionDisconnected', { reason: data.reason });
    if(ircTransport.websock && ircTransport.websock.readyState === WebSocket.OPEN) ircCommand.quit(data.reason); // Protocol action
    setTimeout(function() { ircEvents.emit('domain:requestReconnect'); }, 500);
});

ircEvents.on('domain:setNickservNick', function(data) {
    console.log('DOMAIN: Set NickServ Nick:', data.nick);
    guser.nickservnick = data.nick;
});

ircEvents.on('domain:setNickservPass', function(data) {
    console.log('DOMAIN: Set NickServ Pass: [REDACTED]');
    guser.nickservpass = data.pass;
});

ircEvents.on('domain:savePassword', function(data) {
    console.log('DOMAIN: Saving encrypted password to localStorage');
    try {
        localStorage.setItem('password', data.password);
    } catch(e) {
        console.error('DOMAIN: Failed to save password:', e);
    }
});

ircEvents.on('domain:setConnectStatus', function(data) {
    console.log('DOMAIN: Set Connect Status:', data.status);
    domainConnectStatus = data.status;
});

// Domain logic for processStatus (previously gateway.processStatus())
ircEvents.on('domain:processConnectionStatusUpdate', function() {
    // This event is emitted after data is received. Now check connection status.

    if(guser.nickservpass != '' && guser.nickservnick != ''){
        if(domainConnectStatus == '001') {
            if(guser.nick != guser.nickservnick) { //auto-ghost
                domainConnectStatus = 'ghostSent';
                ircCommand.NickServ('RECOVER', [guser.nickservnick, guser.nickservpass], true);
            } else domainConnectStatus = 'identified';
        }
        if(domainConnectStatus == 'reIdentify'){
            if(guser.nick != guser.nickservnick){
                domainConnectStatus = 'ghostSent';
                ircCommand.NickServ('RECOVER', [guser.nickservnick, guser.nickservpass], true);
            } else {
                domainConnectStatus = 'identified';
                if(!('sasl' in activeCaps)){ // activeCaps is domain
                    ircCommand.NickServ('IDENTIFY', guser.nickservpass, true);
                } else {
                    domainRetrySasl = true;
                    ircCommand.performQuick('AUTHENTICATE', ['PLAIN']);
                    // Note: SASL authentication status is shown via auth:* events
                }
            }
        }
        if(domainConnectStatus == 'ghostAndNickSent' && guser.nick == guser.nickservnick){ //ghost się udał
            if(domainNickWasInUse){
                ircEvents.emit('ui:displayDialog', {
                    dialogType: 'warning',
                    dialogId: 'warning',
                    titleKey: 'warning',
                    messageKey: 'nickNoLongerInUse'
                });
                domainNickWasInUse = false;
            }
            domainConnectStatus = 'identified';
        }
    } else {
        if(domainConnectStatus == '001') { //nie ma hasła więc od razu uznajemy że ok
            domainConnectStatus = 'identified';
        }
    }
    if(domainConnectStatus == 'identified' && domainSetConnectedWhenIdentified == 1){ //podłączony, a szare tło schowane już wcześniej
        domainConnectStatus = 'connected';
        domainConnectTime = (+new Date)/1000; // Store connection timestamp
    }
    if(domainConnectStatus == 'connected'){
        domainSetConnectedWhenIdentified = 0;
        if(!domainJoined) {
            ircEvents.emit('ui:focusInput', { target: '#input' }); // Emit UI event for input focus
            ircEvents.emit('domain:requestJoinChannels'); // Request joining channels
            domainJoined = 1;
            domainDisconnectMessageShown = 0; //tutaj resetuję
            // Emit UI event to apply Umode settings based on configuration.
            // The UI layer will handle querying its settings (e.g., from DOM) and emitting ircCommand.umode.
            ircEvents.emit('ui:applyUmodeSettings', {
                currentUmodes: guser.umodes // Pass current domain umodes for UI to compare
            });
        }
    } else {
        domainJoined = 0;
    }
});

// --- User & Channel Management ---

ircEvents.on('domain:requestJoinChannel', function(data) {
    console.log('DOMAIN: Request Join Channel:', data.channelName, data.password || 'no pass');
    ircCommand.channelJoin(data.channelName, data.password);
});

ircEvents.on('domain:requestJoinChannels', function(data) {
    console.log('DOMAIN: Request Join Channels');
    var channelsToJoin = [];

    // Prioritize channels passed in data. If not present, use guser.channels and gateway.channels.
    if (data && data.channels && data.channels.length > 0) {
        channelsToJoin = channelsToJoin.concat(data.channels);
    } else {
        if (guser.channels && guser.channels.length > 0) {
            channelsToJoin = channelsToJoin.concat(guser.channels);
        }
        if (gateway.channels && gateway.channels.length > 0) {
            // Extract channel names from ChannelTab objects
            for (var i = 0; i < gateway.channels.length; i++) {
                var chan = gateway.channels[i];
                var chanName = (chan instanceof ChannelTab) ? chan.name : chan;
                channelsToJoin.push(chanName);
            }
        }
    }

    // Ensure uniqueness of channel names (now all are strings).
    channelsToJoin = [...new Set(channelsToJoin)];

    if (channelsToJoin.length > 0) {
        ircCommand.channelJoin(channelsToJoin);
    }
});

ircEvents.on('domain:requestNickChange', function(data) {
    console.log('DOMAIN: Request Nick Change:', data.newNick);
    ircCommand.changeNick(data.newNick);
});

ircEvents.on('domain:userClearState', function() {
    console.log('DOMAIN: User Clear State');
    guser.clear(); // Clear guser state
    // Also clear other domain state related to user
    domainPingCnt = 0;
    domainJoined = 0;
    domainSetConnectedWhenIdentified = 0;
    domainFirstConnect = 1;
    domainUserQuit = false;
    domainSasl = false;
    domainWhowasExpect312 = false;
    domainNickWasInUse = false;
    domainRetrySasl = false;
    domainLabelsToHide = [];
    domainBatch = {};
    domainWhoisData = {};
    domainSmallListData = [];
    domainLastError = '';
    // Emit event for UI to react
    ircEvents.emit('user:stateCleared');
});

ircEvents.on('domain:updateConnectionParams', function(data) {
    console.log('DOMAIN: Update Connection Params:', data);
    if(data.nick != guser.nick) {
        guser.changeNick(data.nick);
    }
    guser.channels = data.channels;
    guser.nickservnick = data.nickservNick;
    guser.nickservpass = data.nickservPass;
    if(data.savePassword){
        // Already handled by disp.changeSettings() using encryptPassword()
    }
    guser.account = guser.nick; // Set account to current nick
});

ircEvents.on('domain:requestRemoveChannel', function(data) {
    console.log('DOMAIN: Request Remove Channel:', data.channelName);
    // The domain layer initiates the protocol action to part the channel.
    // message parameter should be provided by UI layer (already translated)
    ircCommand.channelPart(data.channelName, data.message || ''); // Use provided message or empty string

    // Emit event for UI to perform cleanup for the removed channel.
    ircEvents.emit('channel:removed', { channelName: data.channelName });
});

ircEvents.on('domain:requestRemoveQuery', function(data) {
    console.log('DOMAIN: Request Remove Query:', data.queryName);
    // UI cleanup is done by Query.close()
    ircEvents.emit('query:removed', { queryName: data.queryName });
});

ircEvents.on('domain:requestRemoveListWindow', function(data) {
    console.log('DOMAIN: Request Remove List Window:', data.listName);
    // The domain layer signals the UI to remove the list window.
    ircEvents.emit('listWindow:removed', { listName: data.listName });
});


// --- IRC Commands & Services ---

ircEvents.on('domain:requestIrcCommand', function(data) {
    if (data.command !== 'PONG') {
        console.log('DOMAIN: Request IRC Command:', data.command, data.args, data.raw);
    }
    ircCommand.performQuick(data.command, data.args, data.raw);
});

ircEvents.on('domain:requestCapLs', function(data) {
    console.log('DOMAIN: Request CAP LS:', data.version);
    ircCommand.performQuick('CAP', ['LS', data.version]);
});

ircEvents.on('domain:requestUser', function(data) {
    console.log('DOMAIN: Request USER:', data.username, data.mode, data.unused, data.realname);
    ircCommand.performQuick('USER', [data.username, data.mode, data.unused], data.realname);
});

ircEvents.on('domain:requestWhois', function(data) {
    console.log('DOMAIN: Request WHOIS:', data.nick);
    ircCommand.whois(data.nick);
});

ircEvents.on('domain:requestNickservInfo', function(data) {
    console.log('DOMAIN: Request NickServ Info:', data.nick);
    services.nickInfo(data.nick);
});

ircEvents.on('domain:requestCtcp', function(data) {
    console.log('DOMAIN: Request CTCP:', data.nick, data.ctcpType);
    gateway.ctcp(data.nick, data.ctcpType);
});

ircEvents.on('domain:requestCtcpCommand', function(data) {
    console.log('DOMAIN: Request CTCP Command:', data.dest, data.text);
    ircCommand.sendCtcpRequest(data.dest, data.text);
});

ircEvents.on('domain:requestModeChange', function(data) {
    console.log('DOMAIN: Request Mode Change:', data.target, data.modeString);
    ircCommand.mode(data.target, data.modeString);
});

ircEvents.on('domain:requestServiceCommand', function(data) {
    console.log('DOMAIN: Request Service Command:', data.service, data.command, data.args);
    services.perform(data.service, data.command, data.args);
});

ircEvents.on('domain:requestInvite', function(data) {
    console.log('DOMAIN: Request Invite:', data.channel, data.nick);
    ircCommand.channelInvite(data.channel, data.nick);
});

ircEvents.on('domain:requestKick', function(data) {
    console.log('DOMAIN: Request Kick:', data.channel, data.nick, data.reason);
    ircCommand.channelKick(data.channel, data.nick, data.reason);
});

ircEvents.on('domain:setUserQuit', function(data) {
    console.log('DOMAIN: Setting user quit status:', data.status);
    domainUserQuit = data.status;
});

ircEvents.on('domain:requestListChannels', function(data) {
    console.log('DOMAIN: Request List Channels:', data.minUsers);
    gateway.smallListLoading = true; // Must be set before listChannels() checks it
    ircCommand.listChannels(data.minUsers);
});

ircEvents.on('domain:requestChatHistory', function(data) {
    console.log('DOMAIN: Request Chat History:', data.channelName, data.type, 'msgid:', data.msgid, 'timestamp:', data.timestamp, data.limit);

    // Format reference for CHATHISTORY protocol
    var reference;
    if(data.type === 'LATEST'){
        reference = '*'; // Special case for initial history
        // Mark channel as awaiting initial history
        var channelKey = data.channelName.toLowerCase();
        domainChannelsAwaitingInitialHistory[channelKey] = true;
    } else if(data.msgid){
        reference = 'msgid=' + data.msgid;
    } else if(data.timestamp){
        reference = 'timestamp=' + data.timestamp;
    } else {
        console.error('DOMAIN: No msgid or timestamp provided for CHATHISTORY request');
        return;
    }

    ircCommand.chathistory(data.type, data.channelName, reference, undefined, data.limit);
});

ircEvents.on('domain:requestRedoNames', function(data) {
    console.log('DOMAIN: Request Redo Names:', data.channelName);
    ircCommand.channelNames(data.channelName);
    ircCommand.channelTopic(data.channelName); // Refresh topic too
    ircCommand.who(data.channelName); // Refresh WHO info
});

ircEvents.on('domain:requestSendMessage', function(data) {
    console.log('DOMAIN: Request Send Message:', data.target, data.message);

    // Clear typing status for this target when message is sent
    // Per spec: sending a message clears typing status (no notification needed)
    if(domainLastTypingActivity[data.target]){
        clearTimeout(domainLastTypingActivity[data.target].timeoutId);
        delete domainLastTypingActivity[data.target];
        console.log('DOMAIN: Cleared typing status for', data.target, '(message sent)');
    }

    ircCommand.sendMessage(data.target, data.message);
});

ircEvents.on('domain:requestSendTags', function(data) {
    console.log('DOMAIN: Request Send Tags:', data.target, data.tags, data.values);
    ircCommand.sendTags(data.target, data.tags, data.values);
});

// --- Metadata & Tags ---

ircEvents.on('domain:requestMetadataUpdate', function(data) {
    console.log('DOMAIN: Request Metadata Update:', data.key, data.value);
    ircCommand.metadata(data.key, data.value);
});

ircEvents.on('domain:disableAutoAvatar', function(data) {
    console.log('DOMAIN: Disable Auto Avatar:', data.nick);
    users.disableAutoAvatar(data.nick);
});

ircEvents.on('domain:requestExtJwt', function(data) {
    console.log('DOMAIN: Request EXTJWT:', data.service, data.label);
    ircCommand.perform('EXTJWT', [data.service], null, null, data.label);
});

// --- UI-Related Domain Events ---

ircEvents.on('domain:tabSwitched', function(data) {
    domainActiveTab = data.newTab;
});

// --- Domain State Helpers ---

ircEvents.on('domain:hasActiveCap', function(data) {
    return data.cap in activeCaps;
});

ircEvents.on('domain:isCapSupported', function(data) {
    return supportedCaps.indexOf(data.cap) !== -1;
});

ircEvents.on('domain:hasServerCap', function(data) {
    return data.cap in serverCaps;
});

ircEvents.on('domain:addSupportedCap', function(data) {
    supportedCaps.push(data.cap);
});

ircEvents.on('domain:removeSupportedCap', function(data) {
    var index = supportedCaps.indexOf(data.cap);
    if(index >= 0) supportedCaps.splice(index, 1);
});

ircEvents.on('domain:removeActiveCap', function(data) {
    if(data.cap in activeCaps) delete activeCaps[data.cap];
});


// --- Typing Activity ---

ircEvents.on('domain:processTypingActivity', function(data) {
    var currentWindowName = data.windowName; // Use windowName directly (string), not window.name
    var currentInputValue = data.inputValue;
    console.log('DOMAIN: Processing Typing Activity:', currentWindowName, currentInputValue, data.time);

    // This logic previously in gateway.inputKeypress()
    if(currentInputValue == ''){
        // User cleared input, potentially done typing
        if(domainLastTypingActivity[currentWindowName]){
            clearTimeout(domainLastTypingActivity[currentWindowName].timeoutId);
            ircEvents.emit('domain:requestSendTags', { target: currentWindowName, tags: ['+draft/typing', '+typing'], values: ['done', 'done'], time: new Date() });
            delete domainLastTypingActivity[currentWindowName];
        }
        return;
    }

    if(domainLastTypingActivity[currentWindowName]){
        clearTimeout(domainLastTypingActivity[currentWindowName].timeoutId);
        // If already active, just reset timer
    } else {
        // Start typing notification
        ircEvents.emit('domain:requestSendTags', { target: currentWindowName, tags: ['+draft/typing', '+typing'], values: ['active', 'active'], time: new Date() });
    }

    domainLastTypingActivity[currentWindowName] = {
        timeoutId: setTimeout(function() {
            console.log('DOMAIN: Typing activity timed out for', currentWindowName);
            ircEvents.emit('domain:requestSendTags', { target: currentWindowName, tags: ['+draft/typing', '+typing'], values: ['paused', 'paused'], time: new Date() });
            delete domainLastTypingActivity[currentWindowName];
        }, 5000), // 5 seconds to switch to paused
        status: 'active'
    };
});

ircEvents.on('domain:typingStopped', function() {
    // This was triggered when keypressSuppress timed out
    // Needs to handle sending 'paused' or 'done' based on actual input value
    console.log('DOMAIN: Typing Stopped event received (from keypress timeout)');
    // More complex logic needed here to determine if still typing or done
    // For now, assume it's done typing if no more keypresses
});


// --- Connection Status Check ---
ircEvents.on('domain:checkConnectionStatus', function(data) {
    console.log('DOMAIN: Checking connection status:', domainConnectStatus);
    if (typeof data.callback === 'function') {
        data.callback(domainConnectStatus == 'connected');
    }
});


// --- Mode Parsing ---

// Domain internal method to generate umode string from user's current modes
function getUmodeString(user) {
    var modeString = '+';
    if (user && user.umodes) {
        for (var mode in user.umodes) {
            if (user.umodes[mode] === true) {
                modeString += mode;
            }
        }
    } else if (guser && guser.umodes) {
        // Fallback to guser.umodes for current user
        for (var mode in guser.umodes) {
            if (guser.umodes[mode] === true) {
                modeString += mode;
            }
        }
    }
    if (modeString.length === 1) {
        modeString = ''; // Return empty string, UI will use language.none
    }
    return modeString;
}

ircEvents.on('domain:processUserModes', function(data) {
    console.log('DOMAIN: Processing user modes:', data.modes);
    var modes = data.modes;
    var plus = false;
    for(var i=0; i<modes.length; i++){
        var c = modes.charAt(i);
        switch(c){
            case '+': plus = true; break;
            case '-': plus = false; break;
            case ' ': return; // Should not happen with well-formed mode strings
            default: guser.setUmode(c, plus); break; // guser.setUmode updates domain state
        }
    }
    // Emit user:settingInfo event with the umode string
    var umodeString = getUmodeString();
    ircEvents.emit('user:settingInfo', {
        nick: guser.me ? guser.me.nick : guser.nick,
        settingString: umodeString,
        time: data.time || new Date()
    });
});



// --- Other Domain Logic ---

ircEvents.on('domain:isHistoryBatch', function(data) {
    var result = false;
    if(data.tags && 'batch' in data.tags && data.tags.batch in domainBatch){
        var batch = domainBatch[data.tags.batch];
        if(batch.type == 'chathistory') {
            result = true;
        } else {
            for(var i=0; i<batch.parents.length; i++){
                if(batch.parents[i].type == 'chathistory'){
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

ircEvents.on('domain:addLabelToHide', function(data) {
    domainLabelsToHide.push(data.label);
});

ircEvents.on('domain:processStorageEvent', function(data) {
    console.log('DOMAIN: Processing storage event:', data.evt.key);
    var evt = data.evt;

    if(!evt.newValue){
        return;
    }

    if(conn.waitForAlive && evt.key == 'checkAliveReply'){
        conn.waitForAlive = false;
        // Signal UI to display the "already connected" message
        ircEvents.emit('ui:displayAlreadyConnectedMessage', { nick: evt.newValue, suggestedChannel: guser.channels[0] });
        // Clear storage after processing
        try {
            localStorage.removeItem(evt.key);
            // This is problematic. If guser.channels[0] is #, it should not set reqChannelJoin
            if(guser.channels && guser.channels.length > 0 && guser.channels[0] != '#'){
                localStorage.setItem('reqChannelJoin', guser.channels[0]);
            }
        } catch(e) {}
    } else if(domainConnectStatus == 'connected'){
        try {
            if(evt.key == 'checkAlive'){
                localStorage.removeItem(evt.key);
                localStorage.setItem('checkAliveReply', guser.nick);
            } else if(evt.key == 'reqChannelJoin'){
                var chan = evt.newValue;
                localStorage.removeItem(evt.key);
                // Signal UI to check if channel is already joined and prompt for join
                ircEvents.emit('ui:promptForChannelJoin', { channelName: chan });
            }
        } catch(e) {}
    }
});

ircEvents.on('domain:processNetsplitEvents', function(data) {
    console.log('DOMAIN: Processing Netsplit Events');
    domainQuitTimeout = false;
    if(data.quitQueue.length == 0) return;
    
    var quittingNicks = [];
    for(n in data.quitQueue){
        var nick = data.quitQueue[n].sender.nick;
        quittingNicks.push(nick);
        users.delUser(nick); // Domain user management
    }
    
    // Emit a single UI event with all affected nicks.
    // The UI will then iterate its channels, remove these nicks, and append netsplit messages.
    ircEvents.emit('ui:handleNetsplitUsers', {
        nicks: quittingNicks,
        reasonKey: 'netsplit' // UI will translate
    });

    domainQuitQueue = []; // Clear domain state
});

ircEvents.on('domain:processNetjoinEvents', function(data) {
    console.log('DOMAIN: Processing Netjoin Events');
    domainNetJoinTimeout = false;
    if(data.netJoinQueue.length == 0) return;
    
    // Group nicks by channel for UI event
    var joinedNicksPerChannel = {};
    for(var n=0; n<data.netJoinQueue.length; n++){
        var entry = data.netJoinQueue[n];
        if (!joinedNicksPerChannel[entry.chan]) {
            joinedNicksPerChannel[entry.chan] = [];
        }
        joinedNicksPerChannel[entry.chan].push(entry.nick);
    }

    // Emit a single UI event with all affected nicks per channel.
    // The UI will then iterate its channels and append netjoin messages.
    ircEvents.emit('ui:handleNetjoinUsers', {
        joinedNicksPerChannel: joinedNicksPerChannel,
        reasonKey: 'netjoin' // UI will translate
    });

    domainNetJoinQueue = []; // Clear domain state
});

ircEvents.on('domain:processQuitCommand', function(data) {
    console.log('DOMAIN: Processing QUIT command:', data.data.sender.nick);
    var msg = data.msg;
    var isNetsplit = false;

    // Check for netsplit
    if(data.text.match(/^[^ :]+\.[^ :]+ [^ :]+\.[^ :]+$/)){
        domainQuitQueue.push(msg); // Use domainQuitQueue
        if(domainQuitTimeout){
            clearTimeout(domainQuitTimeout);
        }
        domainQuitTimeout = setTimeout(function() { ircEvents.emit('domain:processNetsplitEvents', { quitQueue: domainQuitQueue }); }, 700);
        isNetsplit = true;
    }
    
    // Note: UI already listens to user:otherQuit event emitted from protocol:quitCommand handler
    // No need for redundant ui: event here. Domain logic is handled above by users.delUser()
    if (!isNetsplit) {
        users.delUser(data.sender.nick); // Domain user management for non-netsplit quits
    }
    
    // The original code returned true/false. This event handler does not need to return.
    // If a caller relies on it, it indicates a synchronous dependency that needs refactoring.
    // Given it's an event handler, it should not return.
});

ircEvents.on('domain:processJoinCommand', function(data) {
    console.log('DOMAIN: Processing JOIN command:', data.data.sender.nick, 'to', data.data.args[0]);
    var msg = data.msg;
    var channame = data.args[0]; // Assuming data.args[0] is always the channel name for JOIN

    var dlimit = (+new Date)/1000 - 300; // time check
    var netjoin = false;

    // Domain-level netsplit tracking logic
    if(domainNetJoinUsers[channame] && domainNetJoinUsers[channame][data.sender.nick]){
        if(domainNetJoinUsers[channame][data.sender.nick] > dlimit){
            netjoin = true;
        }
        delete domainNetJoinUsers[channame][data.sender.nick];
    }

    if(netjoin){
        domainNetJoinQueue.push({'chan': channame, 'nick': data.sender.nick}); // domainNetJoinQueue
        if(domainNetJoinTimeout){
            clearTimeout(domainNetJoinTimeout);
        }
        domainNetJoinTimeout = setTimeout(function() { ircEvents.emit('domain:processNetjoinEvents', { netJoinQueue: domainNetJoinQueue }); }, 700);
    }
    // Note: UI already listens to channel:userJoined event emitted from protocol:joinCommand handler
    // No need for redundant ui: event here
});


// --- Tab Management ---

ircEvents.on('domain:requestOpenQuery', function(data) {
    console.log('DOMAIN: Request Open Query:', data.nick);
    // Emit semantic event - UI will create query tab
    ircEvents.emit('user:queryRequested', { nick: data.nick, setActive: true });
});


// --- Mode Parsing ---



ircEvents.on('domain:parseIsupport', function() {
    console.warn('DOMAIN: parseIsupport needs full implementation.');
    // This logic previously in gateway.parseIsupport()
    // Needs to update `isupport`, `modes.single`, `modes.argBoth`, etc.
    // And then emit events like `server:isupportUpdated`.
    if('CHANMODES' in isupport){
        var modeTypes = isupport['CHANMODES'].split(',');
        if(modeTypes.length != 4){
            console.error('Error parsing CHANMODES isupport!');
            return;
        }
        modes.single = [];
        modes.argBoth = [];
        modes.argAdd = [];

        for(var i=0; i<4; i++){
            var modeChars = modeTypes[i];
            for(var j=0; j<modeChars.length; j++){
                switch(i){
                    case 0: // list type (argBoth)
                        modes.argBoth.push(modeChars.charAt(j));
                        break;
                    case 1: // add and remove with arguments (argBoth)
                        modes.argBoth.push(modeChars.charAt(j));
                        break;
                    case 2: // add with arguments (argAdd)
                        modes.argAdd.push(modeChars.charAt(j));
                        break;
                    case 3: // no arguments (single)
                        modes.single.push(modeChars.charAt(j));
                        break;
                }
            }
        }
    }
    if('PREFIX' in isupport){
        var expr = /^\(([^)]+)\)(.+)$/;
        var prefix = expr.exec(isupport['PREFIX']);
        if(!prefix || prefix[1].length != prefix[2].length){
            console.error('Error parsing PREFIX isupport!');
            return;
        }
        modes.user = [];
        modes.prefixes = [];
        
        for(var i=0; i<prefix[1].length; i++){
            modes.user.push(prefix[1].charAt(i));
            modes.prefixes[prefix[1].charAt(i)] = prefix[2].charAt(i);
            modes.reversePrefixes[prefix[2].charAt(i)] = prefix[1].charAt(i);
        }
    }
});

// Helper to parse mode strings (simplified for +o/-o)
function parseChannelUserModes(modeString, channelName) {
    var changes = [];
    var isAdding = true; // true for '+', false for '-'

    var parts = modeString.split(' ');
    var currentModeArgIndex = 0; // Tracks the index in 'parts' for mode arguments

    // Find the actual mode string part (e.g., "+o-v")
    var modeSpecPart = parts[0];
    var argsParts = parts.slice(1); // Arguments for the modes

    for (var i = 0; i < modeSpecPart.length; i++) {
        var char = modeSpecPart.charAt(i);
        if (char === '+') {
            isAdding = true;
        } else if (char === '-') {
            isAdding = false;
        } else {
            // Check if this mode takes an argument (a user nick)
            // This is a simplification: real IRC mode parsing is complex with CHANMODES ISUPPORT.
            // For now, assume o, v, h, a, q always take an argument (a nick)
            if (['o', 'v', 'h', 'a', 'q'].includes(char)) {
                if (currentModeArgIndex < argsParts.length) {
                    var nickAffected = argsParts[currentModeArgIndex];
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
// DOMAIN ACCESSORS FOR UI LAYER
// ==========================================
// Minimal domain accessor for UI layer - UI should prefer receiving data via events
var domain = {
    // Check if a user object represents the current user
    isOwnUser: function(user) {
        if (!user) return false;
        return user === guser.me || (user.nick && user.nick === guser.me.nick);
    }
};

// ==========================================
// UI REQUEST HANDLERS
// ==========================================

// Handle UI request to load older chat history
ircEvents.on('domain:requestHistoryBefore', function(data) {
    // Check if CHATHISTORY is supported
    if(!('CHATHISTORY' in isupport)) {
        console.log('CHATHISTORY not supported by server');
        return;
    }

    // Cap the limit based on server support
    var serverLimit = parseInt(isupport['CHATHISTORY']) || 100;
    var actualLimit = Math.min(data.limit || 100, serverLimit);

    // Send the CHATHISTORY request
    gateway.send('CHATHISTORY', ['BEFORE', data.channel, data.beforeMsgid || '*', actualLimit.toString()]);
});
