// js/gateway_domain.js
// This file will contain listeners for domain-level events that orchestrate core application logic,
// separating it from protocol handling (gateway_cmd_binds.js) and UI rendering (gateway_display.js).

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
var domainJoined = 0;
var domainSetConnectedWhenIdentified = 0;
var domainFirstConnect = 1;
var domainUserQuit = false;
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
// BATCH HANDLERS (migrated from gateway_cmd_binds.js)
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

ircEvents.on('batch:chathistory', function(data){
	var msg = data.msg;
	var batch = data.batch;

	// Track how many messages we received
	batch.receivedMessages = 0;
	batch.oldestMsgid = null;
	batch.oldestTimestamp = null;

	// Set callback to add the "load older" link when batch ends
	batch.callback = function(batch, msg){
		console.log('chathistory batch ended, received', batch.receivedMessages, 'messages');
		var chan = gateway.findChannel(batch.args[0]);
		if(!chan) return;

		ircEvents.emit('channel:chatHistoryStatsUpdated', {
			channelName: chan.name,
			channelId: chan.id,
			receivedMessages: batch.receivedMessages,
			oldestMsgid: batch.oldestMsgid,
			oldestTimestamp: batch.oldestTimestamp
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
// CLIENT-SPECIFIC LISTENERS (migrated from other layers)
// ============================================================================

ircEvents.on('client:processOwnChannelList', function(data) {
    var nick = data.nick;
    var channelNames = data.channelNames;

    // This logic was moved from gateway_cmd_binds.js
    domainConnectStatus = '001'; // Update domainConnectStatus
    if(nick == guser.nick){
        channelNames.forEach( function(channame){
            var channel = channame.match(/#[^ ]*/);
            if(channel){
                if(gateway.findChannel(channel[0])) { // gateway.findChannel is UI
                    gateway.findChannel(channel[0]).rejoin(); // UI action
                } else {
                    ircEvents.emit('domain:findOrCreateTab', { tabName: channel[0], setActive: false, time: new Date() }); // Emit domain event
                }
                ircCommand.channelNames(channel[0]);
                ircCommand.channelTopic(channel[0]);
                ircCommand.who(channel[0]);
            	}
            });

            ircEvents.on('channel:requestChatHistory', function(data) {
                    ircCommand.channelHistory(data.channelName, data.limit);
                });

                ircEvents.on('channel:requestWho', function(data) {
                    ircCommand.who(data.channelName);
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
// PROTOCOL LISTENERS (migrated from gateway_cmd_binds.js)
// ============================================================================

ircEvents.on('protocol:accountCommand', function(data) {
	var msg = data.raw;
	// msg.user is available in the protocolGeneric wrapper
	if(data.account === '*' || data.account === '0'){
		msg.user.setAccount(false);
	} else {
		msg.user.setAccount(data.account);
	}
});

ircEvents.on('protocol:ackCommand', function(data) {
	// Labeled-response ACK command received by domain layer.
	// Original handler was empty, so for now, we just acknowledge receipt.
	console.log('DOMAIN: ACK command received:', data.raw);
});

ircEvents.on('protocol:authenticateCommand', function(data) {
	var msg = data.raw;
	if(data.challenge === '+'){
		// Emit a domain event to request authentication command, instead of direct ircCommand
		ircEvents.emit('domain:requestIrcCommand', {
			command: 'AUTHENTICATE',
			args: [Base64.encode(guser.nickservnick + '\0' + guser.nickservnick + '\0' + guser.nickservpass)]
		});
		ircEvents.emit('auth:saslAuthenticating', { time: msg.time, nickservNick: guser.nickservnick });
		domainConnectStatus = 'identified'; // Logical update
	} else {
		console.log('DOMAIN: Unexpected AUTHENTICATE response:', data.challenge);
	}
});

ircEvents.on('protocol:awayCommand', function(data) {
	var msg = data.raw;
	// msg.user is available in the protocolGeneric wrapper
	if(data.awayMessage === ''){
		msg.user.notAway();
	} else {
		msg.user.setAway(data.awayMessage);
	}
});

ircEvents.on('protocol:batchCommand', function(data) {
	var msg = data.raw;
	var name = data.batchId;
	var type = data.batchType;
	if(msg.args[0].charAt(0) == '-'){ // Batch end
		var batch = domainBatch[name]; // Use domainBatch
		if(!batch){
			console.error('BATCH "' + name + '" ended but not started!');
			return;
		}
		if(batch.callback){
			batch.callback(batch, msg);
		}
		delete domainBatch[name]; // Use domainBatch
		msg.isBatchEnd = true;
		msg.batch = batch;
	} else if(msg.args[0].charAt(0) == '+'){ // Batch start
		var batch = new ircBatch(name, type, data.batchArgs, msg);
		domainBatch[name] = batch; // Use domainBatch
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

ircEvents.on('protocol:capCommand', function(data) {
	var msg = data.raw;
	switch(data.subcommand){
		case 'LS': case 'NEW':
			// Parse available capabilities from server
			if (data.raw.args[2] == '*') // Check raw message for the "*" indicating multi-line CAP LS
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
			var newCaps = data.capText.split(' ');
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
				// Emit domain event for metadata subscription
				ircEvents.emit('domain:requestMetadataSubscription', { keys: ['avatar', 'status', 'bot', 'homepage', 'display-name', 'bot-url', 'color'] });
				// Emit domain events indicating state change, UI will listen to these
				ircEvents.emit('domain:userAvatarCapabilityChanged');
				ircEvents.emit('domain:clientCanSetAvatar');
			}
			if(guser.nickservpass != '' && guser.nickservnick != '' && 'sasl' in newCapsParsed){
				// Emit domain event to perform authentication
				ircEvents.emit('domain:requestSaslAuthenticate', { mechanism: 'PLAIN', time: msg.time, nickservNick: guser.nickservnick, nickservPass: guser.nickservpass });
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
	var msg = data.raw;
	// msg.user is available in protocolGeneric
	msg.user.setIdent(data.newIdent);
	msg.user.setHost(data.newHost);
    ircEvents.emit('user:hostChanged', {
        nick: msg.user.nick,
        ident: data.newIdent,
        host: data.newHost,
        raw: msg
    });
});

ircEvents.on('protocol:failCommand', function(data) {
	var msg = data.raw;
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
        description: data.description,
        raw: msg
    });
});

ircEvents.on('protocol:errorCommand', function(data) {
	var msg = data.raw;
	domainLastError = data.message; // Update domainLastError
	ircEvents.emit('client:disconnected', { reason: data.message }); // Abstract gateway.disconnected

	var expr = /^Closing Link: [^ ]+\[([^ ]+)\] \(User has been banned from/;
	var match = expr.exec(data.message);
	if(match){
		// Re-emit as a domain-level error for global ban
		ircEvents.emit('client:errorMessage', {
			code: '465', // Using a generic error code for global ban as no specific code for it
			type: 'globalBan',
			message: data.message,
			raw: msg
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

	if(data.message.match(/\(NickServ \(RECOVER command used by [^ ]+\)\)$/) || data.message.match(/\(NickServ \(Użytkownik [^ ]+\ użył komendy RECOVER\)\)\$/)){
		ircEvents.emit('client:reconnectNeeded'); // This event is still relevant for the UI
		ircEvents.emit('nickserv:recoverCommandTriggered'); // This is a domain event
	} else {
		ircEvents.emit('client:serverDisconnected', { reason: data.message }); // This event is still relevant for the UI
		ircEvents.emit('client:reconnectRequested'); // This is a domain event
	}
});

ircEvents.on('protocol:extjwtCommand', function(data) {
	var msg = data.raw;
	if(!msg.batch){
		return; // labelNotProcessed handler will take full care of that
	}
	if(msg.args[2] == '*'){ // Check raw args as data.arg might be processed
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

ircEvents.on('protocol:inviteCommand', function(data) {
    var msg = data.raw;
    // msg.user, data.targetNick, data.channelName are available
    // Domain logic for invite command - maybe log it or store for later UI display
    console.log(`DOMAIN: ${msg.user.nick} invited ${data.targetNick} to ${data.channelName}`);
    ircEvents.emit('channel:invited', {
        byNick: msg.user.nick,
        targetNick: data.targetNick,
        channelName: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:joinCommand', function(data) {
    var msg = data.raw;
    var channelName = data.channelName;
    var user = msg.user; // User who joined

    var channel = gateway.findChannel(channelName);
    if (!channel) {
        // channel = gateway.findOrCreate(channelName); // This should be domain driven
        ircEvents.emit('domain:findOrCreateTab', { tabName: channelName, setActive: false, time: msg.time });
        channel = gateway.findChannel(channelName); // Re-find after domain creates it
    }
    if (channel && user) {
        channel.addUser(user);
        ircEvents.emit('channel:userJoined', {
            channelName: channel.name,
            channelId: channel.id,
            nick: user.nick,
            ident: user.ident,
            host: user.host,
            raw: msg
        });
        if (user === guser.me) { // If self joined
            ircEvents.emit('user:selfJoinedChannel', {
                channelName: channel.name,
                channelId: channel.id,
                nick: user.nick,
                ident: user.ident,
                host: user.host,
                time: msg.time,
                raw: msg
            });
        }
    }
});

ircEvents.on('protocol:kickCommand', function(data) {
    var msg = data.raw;
    var channelName = data.channelName;
    var kickedNick = data.kickedNick;
    var reason = data.reason;
    var byNick = msg.user.nick;

    var channel = gateway.findChannel(channelName);
    if (channel) {
        var kickedUser = channel.findUser(kickedNick);
        if (kickedUser) {
            channel.removeUser(kickedUser);
        }
        ircEvents.emit('channel:userKicked', {
            channelName: channel.name,
            channelId: channel.id,
            kickedNick: kickedNick,
            byNick: byNick,
            reason: reason,
            isSelfKicked: (kickedNick === guser.nick), // Indicate if self was kicked
            raw: msg
        });
    }
});

ircEvents.on('protocol:metadataCommand', function(data) {
    var msg = data.raw;
    // Handle METADATA protocol events
    // data.target, data.key, data.subCommand, data.value
    ircEvents.emit('metadata:updated', {
        target: data.target,
        key: data.key,
        subCommand: data.subCommand,
        value: data.value,
        raw: msg
    });
});

ircEvents.on('protocol:modeCommand', function(data) {
    var msg = data.raw;
    var target = data.target; // Channel or user nick
    var modeString = data.modeString; // "+o SomeNick" or "+m"

    if (target.startsWith('#') || target.startsWith('&')) { // Channel mode
        var channel = gateway.findChannel(target);
        if (channel) {
            // Further parse modeString to apply individual modes and params
            // For simplicity, emit raw mode string for now
            ircEvents.emit('channel:modeChanged', { // Changed from 'channel:modeChanged' to 'channel:modesUpdated' to match rplChannelmodeis
                channelName: channel.name,
                channelId: channel.id,
                modeString: modeString,
                byNick: msg.user.nick,
                raw: msg
            });
        }
    } else { // User mode
        // Apply user modes to the user object directly or via domain event
        ircEvents.emit('user:modeChanged', {
            nick: target,
            modeString: modeString,
            byNick: msg.user.nick,
            raw: msg
        });
    }
});

ircEvents.on('protocol:nickCommand', function(data) {
    var msg = data.raw;
    var oldNick = msg.user.nick;
    var newNick = data.newNick;

    if (msg.user === guser.me) { // Own nick change
        guser.changeNick(newNick);
        ircEvents.emit('client:myNickChanged', { oldNick: oldNick, newNick: newNick, raw: msg }); // Emit for UI
    }

    // Update nick everywhere in domain state
    gateway.changeNick(oldNick, newNick); // Assuming a global changeNick method

    ircEvents.emit('user:nickChanged', {
        oldNick: oldNick,
        newNick: newNick,
        raw: msg
    });
});

ircEvents.on('protocol:noticeCommand', function(data) {
    var msg = data.raw;
    // Domain logic: decide where to route/store this notice
    ircEvents.emit('client:notice', {
        from: msg.user ? msg.user.nick : msg.prefix, // Sender could be server or user
        target: data.target,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:pingCommand', function(data) {
    var msg = data.raw;
    // Domain logic for PING: respond with PONG
    ircEvents.emit('domain:requestIrcCommand', {
        command: 'PONG',
        args: [data.token],
        raw: msg
    });
    ircEvents.emit('server:pingReceived', { // For debugging/monitoring
        token: data.token,
        raw: msg
    });
});

ircEvents.on('protocol:pongCommand', function(data) {
    var msg = data.raw;
    // Domain logic for PONG: record latency, etc.
    ircEvents.emit('server:pongReceived', {
        token: data.token,
        raw: msg
    });
});

ircEvents.on('protocol:partCommand', function(data) {
    var msg = data.raw;
    var channelName = data.channelName;
    var partMessage = data.partMessage;
    var user = msg.user; // User who parted

    var channel = gateway.findChannel(channelName);
    if (channel && user) {
        channel.removeUser(user);
        if (user === guser.me) { // Own part
            gateway.removeChannel(channel);
            ircEvents.emit('user:selfPartedChannel', { // Specific event for UI
                channelName: channel.name,
                channelId: channel.id,
                nick: user.nick,
                partMessage: partMessage,
                raw: msg
            });
        }
        ircEvents.emit('channel:userParted', {
            channelName: channel.name,
            channelId: channel.id,
            nick: user.nick,
            partMessage: partMessage,
            raw: msg
        });
    }
});

ircEvents.on('protocol:privmsgCommand', function(data) {
    var msg = data.raw;
    var target = data.target;
    var message = data.message;
    var user = msg.user; // Sender

    if (target.startsWith('#') || target.startsWith('&')) { // Channel message
        var channel = gateway.findChannel(target);
        if (channel) {
            ircEvents.emit('channel:message', {
                channelName: channel.name,
                channelId: channel.id,
                nick: user.nick,
                message: message,
                raw: msg
            });
        }
    } else { // Private message (query)
        var query = gateway.findQuery(target) || gateway.findOrCreateQuery(user.nick);
        ircEvents.emit('query:message', {
            nick: user.nick,
            message: message,
            raw: msg
        });
    }
});

ircEvents.on('protocol:quitCommand', function(data) {
    var msg = data.raw;
    var quitMessage = data.quitMessage;
    var user = msg.user; // User who quit

    if (user) {
        // Collect channels the user was in to pass to UI for removal
        var userChannels = [];
        for (var c in gateway.channels) {
            if (gateway.channels[c].findUser(user.nick)) {
                userChannels.push({ name: gateway.channels[c].name, id: gateway.channels[c].id });
            }
        }

        gateway.removeUserFromAllChannels(user);

        if (user === guser.me) { // Own quit
            ircEvents.emit('user:selfQuit', {
                nick: user.nick,
                quitMessage: quitMessage,
                channels: userChannels, // Pass channels user was in
                raw: msg
            });
        } else { // Other user quit
            ircEvents.emit('user:otherQuit', {
                user: { nick: user.nick, ident: user.ident, host: user.host }, // Pass relevant user info
                quitMessage: quitMessage,
                channels: userChannels,
                raw: msg
            });
        }
    }
});

ircEvents.on('protocol:setnameCommand', function(data) {
    var msg = data.raw;
    if (msg.user === guser.me) { // Own realname change
        guser.setRealname(data.newRealname);
    }
    ircEvents.emit('user:realnameChanged', {
        nick: msg.user.nick,
        newRealname: data.newRealname,
        raw: msg
    });
});

ircEvents.on('protocol:topicCommand', function(data) {
    var msg = data.raw;
    var channelName = data.channelName;
    var topic = data.topic;
    var user = msg.user; // Who set the topic

    var channel = gateway.findChannel(channelName);
    if (channel) {
        channel.setTopic(topic);
        channel.setTopicSetBy(user.nick); // Assuming user exists and nick is correct
        channel.setTopicSetDate(msg.time.getTime() / 1000); // Convert Date to Unix timestamp
        ircEvents.emit('channel:topicChanged', {
            channelName: channel.name,
            channelId: channel.id,
            topic: topic,
            setBy: user.nick,
            setDate: msg.time.getTime() / 1000,
            raw: msg
        });
    }
});

// Numeric handlers

ircEvents.on('protocol:rplWelcome', function(data) {
    var msg = data.raw;
    // Update client state after successful connection and welcome message
    domainConnectStatus = '001';
    ircEvents.emit('client:welcome', {
        target: data.welcomeTarget,
        message: data.message,
        raw: msg
    });
    // Explicitly emit client:connected after welcome for UI
    ircEvents.emit('client:connected', { raw: msg });
});

ircEvents.on('protocol:rplYourhost', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:yourHost', {
        hostTarget: data.hostTarget,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplCreated', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:createdInfo', {
        createdTarget: data.createdTarget,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplMyinfo', function(data) {
    var msg = data.raw;
    // Store this info in a global/domain state if needed
    // gateway.serverInfo = { ... }; // This should be managed directly within domain or via properties
    ircEvents.emit('server:myInfo', {
        serverName: data.serverName,
        version: data.version,
        userModes: data.userModes,
        channelModes: data.channelModes,
        raw: msg
    });
});

ircEvents.on('protocol:rplIsupport', function(data) {
    var msg = data.raw;
    // Parse and store ISUPPORT tokens
    data.tokens.forEach(token => {
        let [key, value] = token.split('=');
        isupport[key] = value || true;
    });
    ircEvents.emit('server:isupportUpdated', {
        isupport: isupport,
        raw: msg
    });
});

ircEvents.on('protocol:rplUmodes', function(data) {
    var msg = data.raw;
    // Apply umode changes to the current user (guser.me)
    if (guser.me && data.target === guser.me.nick) {
        guser.me.setModes(data.umodes); // Assuming setModes method on user object
        ircEvents.emit('user:modesUpdated', {
            nick: guser.me.nick,
            modes: data.umodes,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplNone', function(data) {
    var msg = data.raw;
    // Generic empty numeric, usually safe to ignore or log
    console.log('DOMAIN: RPL_NONE received:', data.message);
    ircEvents.emit('server:genericMessage', {
        type: 'none',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplAway', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.awayNick);
    if (user) {
        user.setAway(data.awayMessage);
        ircEvents.emit('user:awayStatusChanged', {
            nick: user.nick,
            awayMessage: data.awayMessage,
            isAway: true,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplUserhost', function(data) {
    var msg = data.raw;
    // Parse reply and update user info
    var parts = data.reply.match(/([^=]+)=([^@]+)@(.*)/);
    if (parts) {
        var nick = parts[1];
        var ident = parts[2];
        var host = parts[3];
        var user = gateway.findUser(nick);
        if (user) {
            user.setIdent(ident);
            user.setHost(host);
            ircEvents.emit('user:infoUpdated', {
                nick: nick,
                ident: ident,
                host: host,
                raw: msg
            });
        }
    });

ircEvents.on('protocol:rplIson', function(data) {
    var msg = data.raw;
    // Update status of nicks that are on IRC
    data.nicks.forEach(nick => {
        var user = gateway.findUser(nick);
        if (user) {
            user.setOnline(true);
            ircEvents.emit('user:onlineStatusChanged', {
                nick: nick,
                isOnline: true,
                raw: msg
            });
        }
    });
});

ircEvents.on('protocol:rplText', function(data) {
    var msg = data.raw;
    // Generic text message from server, often for notices or errors
    ircEvents.emit('server:genericMessage', {
        type: 'text',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplUnaway', function(data) {
    var msg = data.raw;
    if (guser.me) {
        guser.me.notAway();
        ircEvents.emit('user:awayStatusChanged', {
            nick: guser.me.nick,
            isAway: false,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplNowaway', function(data) {
    var msg = data.raw;
    if (guser.me) {
        guser.me.setAway(data.message);
        ircEvents.emit('user:awayStatusChanged', {
            nick: guser.me.nick,
            awayMessage: data.message,
            isAway: true,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplWhoisregnick', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setRegistered(true); // Assuming setRegistered method
        ircEvents.emit('user:registrationStatusChanged', {
            nick: user.nick,
            isRegistered: true,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplRulesstart', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:rulesStart', {
        target: data.target,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofrules', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfRules', {
        target: data.target,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWhoishelpop', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setHelpop(true); // Assuming setHelpop method
        ircEvents.emit('user:helpopStatusChanged', {
            nick: user.nick,
            isHelpop: true,
            raw: msg
        });
    }
});

// Accumulator for WHOIS data
// domainWhoisData global for domain
ircEvents.on('protocol:rplWhoisuser', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setIdent(data.ident);
        user.setHost(data.host);
        user.setRealname(data.realname);
        ircEvents.emit('user:infoUpdated', {
            nick: user.nick,
            ident: data.ident,
            host: data.host,
            realname: data.realname,
            raw: msg
        });
        domainWhoisData.nick = user.nick;
        domainWhoisData.ident = data.ident;
        domainWhoisData.host = data.host;
        domainWhoisData.realname = data.realname;
        domainWhoisData.isWhowas = false; // This is not a WHOWAS query
    } else {
        // Create user if not found during WHOIS
        var newUser = new users.user(data.nick);
        newUser.setIdent(data.ident);
        newUser.setHost(data.host);
        newUser.setRealname(data.realname);
        // Add to global user list implicitly via gateway.findUser later or explicitly if needed
        ircEvents.emit('user:infoUpdated', {
            nick: data.nick,
            ident: data.ident,
            host: data.host,
            realname: data.realname,
            raw: msg
        });
        domainWhoisData.nick = data.nick;
        domainWhoisData.ident = data.ident;
        domainWhoisData.host = data.host;
        domainWhoisData.realname = data.realname;
        domainWhoisData.isWhowas = false;
    }
});

ircEvents.on('protocol:rplWhoisserver', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setServer(data.server); // Assuming setServer method
        ircEvents.emit('user:serverInfoUpdated', {
            nick: user.nick,
            server: data.server,
            serverInfo: data.serverInfo,
            raw: msg
        });
        domainWhoisData.server = data.server;
        domainWhoisData.serverInfo = data.serverInfo;
    }
});

ircEvents.on('protocol:rplWhoisoperator', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setOperator(true); // Assuming setOperator method
        ircEvents.emit('user:operatorStatusChanged', {
            nick: user.nick,
            isOperator: true,
            raw: msg
        });
        domainWhoisData.operatorInfo = data.message;
    }
});

ircEvents.on('protocol:rplWhowasuser', function(data) {
    var msg = data.raw;
    // This is information about a user who is no longer online
    ircEvents.emit('user:whowasInfo', {
        nick: data.nick,
        ident: data.ident,
        host: data.host,
        realname: data.realname,
        raw: msg
    });
    domainWhoisData.nick = data.nick;
    domainWhoisData.ident = data.ident;
    domainWhoisData.host = data.host;
    domainWhoisData.realname = data.realname;
    domainWhoisData.isWhowas = true;
});

ircEvents.on('protocol:rplEndofwho', function(data) {
    var msg = data.raw;
    ircEvents.emit('channel:endOfWho', {
        target: data.target,
        query: data.query,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWhoisidle', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setIdleTime(data.idleSeconds); // Assuming setIdleTime method
        user.setSignOnTime(data.signOn);   // Assuming setSignOnTime method
        ircEvents.emit('user:idleInfoUpdated', {
            nick: user.nick,
            idleSeconds: data.idleSeconds,
            signOn: data.signOn,
            raw: msg
        });
        domainWhoisData.idleTime = data.idleSeconds;
        domainWhoisData.signedOn = data.signOn;
    }
});

ircEvents.on('protocol:rplEndofwhois', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:endOfWhois', {
        nick: data.nick,
        raw: msg
    });
    ircEvents.emit('user:whoisComplete', { // Emit consolidated WHOIS data
        nick: data.nick,
        data: domainWhoisData,
        raw: msg
    });
    domainWhoisData = {}; // Clear accumulator
});

ircEvents.on('protocol:rplWhoischannels', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        // This list might contain channel names with prefixes
        user.setChannels(data.channels); // Assuming setChannels method on user object
        ircEvents.emit('user:channelsUpdated', {
            nick: user.nick,
            channels: data.channels,
            raw: msg
        });
        domainWhoisData.channels = data.channels;
    }
});

ircEvents.on('protocol:rplWhoisspecial', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setSpecialStatus(data.message); // Assuming setSpecialStatus
        ircEvents.emit('user:specialStatusUpdated', {
            nick: user.nick,
            status: data.message,
            raw: msg
        });
        domainWhoisData.specialInfo = data.message;
    }
});

// domainSmallListData global for domain
ircEvents.on('protocol:rplListstart', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:listStart', {
        message: data.message,
        raw: msg
    });
    domainSmallListData = []; // Initialize accumulator
});

ircEvents.on('protocol:rplList', function(data) {
    var msg = data.raw;
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
        raw: msg
    });
});

ircEvents.on('protocol:rplEndoflist', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfList', {
        message: data.message,
        raw: msg
    });
    ircEvents.emit('list:smallListComplete', { // Emit consolidated list data
        smallListData: domainSmallListData.map(item => [item.channel, item.visibleUsers, item.topic]),
        raw: msg
    });
    domainSmallListData = []; // Clear accumulator
});

ircEvents.on('protocol:rplChannelmodeis', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        channel.setModes(data.modes, data.modeParams); // Assuming setModes handles string and array
        ircEvents.emit('channel:modesUpdated', {
            channelName: channel.name,
            channelId: channel.id,
            modes: data.modes,
            modeParams: data.modeParams,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplCreationtime', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        channel.setCreationTime(data.creationTime);
        ircEvents.emit('channel:creationTimeUpdated', {
            channelName: channel.name,
            channelId: channel.id,
            creationTime: data.creationTime,
            raw: msg
        });
        domainWhoisData.creationTime = data.creationTime; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplWhoisloggedin', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setAccount(data.account);
        ircEvents.emit('user:loggedInAccount', {
            nick: user.nick,
            account: data.account,
            raw: msg
        });
        domainWhoisData.account = data.account; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplNotopic', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        channel.setTopic(''); // No topic set
        ircEvents.emit('channel:topic', {
            channelName: channel.name,
            channelId: channel.id,
            topic: '',
            setBy: '',
            setDate: 0,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplTopic', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        channel.setTopic(data.topic);
        // Topic setter and time will come from RPL_TOPICWHOTIME
        ircEvents.emit('channel:topic', {
            channelName: channel.name,
            channelId: channel.id,
            topic: data.topic,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplTopicwhotime', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        channel.setTopicSetBy(data.setBy);
        channel.setTopicSetDate(data.setDate);
        ircEvents.emit('channel:topicInfoUpdated', { // Specific event for just this info
            channelName: channel.name,
            channelId: channel.id,
            setBy: data.setBy,
            setDate: data.setDate,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplListsyntax', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:listsyntaxInfo', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWhoisbot', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setIsBot(true);
        ircEvents.emit('user:isBot', {
            nick: user.nick,
            isBot: true,
            raw: msg
        });
        domainWhoisData.isBot = true; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplInvitlist', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        // Store or process invite list entry
        ircEvents.emit('channel:inviteListEntry', {
            channelName: channel.name,
            channelId: channel.id,
            usermask: data.usermask,
            setBy: data.setBy,
            setDate: data.setDate,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplEndofinvitelist', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        ircEvents.emit('channel:endOfInviteList', {
            channelName: channel.name,
            channelId: channel.id,
            message: data.message,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplUserip', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setIpAddress(data.userIp);
        ircEvents.emit('user:ipAddressUpdated', {
            nick: user.nick,
            ipAddress: data.userIp,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplInviting', function(data) {
    var msg = data.raw;
    // The server is telling us that `byNick` invited `nick` to `channel`
    ircEvents.emit('client:invited', {
        byNick: msg.user.nick, // Assuming msg.user is the inviter
        targetNick: data.nick,
        channelName: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:rplSummoning', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:summoned', {
        nick: data.nick,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWhoiscountry', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setCountry(data.countryCode, data.countryName);
        ircEvents.emit('user:countryInfoUpdated', {
            nick: user.nick,
            countryCode: data.countryCode,
            countryName: data.countryName,
            raw: msg
        });
        domainWhoisData.countryCode = data.countryCode; // Add to WHOIS data
        domainWhoisData.countryName = data.countryName; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplExceptlist', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        // Store or process except list entry
        ircEvents.emit('channel:exceptListEntry', {
            channelName: channel.name,
            channelId: channel.id,
            exceptionMask: data.exceptionMask,
            setBy: data.setBy,
            setDate: data.setDate,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplEndofexceptlist', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        ircEvents.emit('channel:endOfExceptList', {
            channelName: channel.name,
            channelId: channel.id,
            message: data.message,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplVersion', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:versionInfo', {
        serverName: msg.prefix, // From msg.prefix
        version: data.version,
        debugLevel: data.debugLevel,
        comments: data.comments,
        raw: msg
    });
});

ircEvents.on('protocol:rplWhoreply', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        var user = channel.findUser(data.nick);
        if (user) {
            user.setIdent(data.ident);
            user.setHost(data.host);
            user.setServer(data.server); // Corrected
            user.setRealname(data.realname); // Corrected
            // Modes string from WHO REPLY is typically in data.flags, needs parsing if storing individual modes
            // user.setModes(data.flags);
            ircEvents.emit('user:infoUpdated', {
                nick: data.nick,
                channelName: channel.name,
                ident: data.ident,
                host: data.host,
                server: data.server,
                realname: data.realname,
                flags: data.flags,
                raw: msg
            });
        } else {
            user = new users.user(data.nick);
            user.setIdent(data.ident);
            user.setHost(data.host);
            user.setRealname(data.realname);
            channel.addUser(user);
            ircEvents.emit('channel:userJoined', {
                channelName: channel.name,
                channelId: channel.id,
                nick: data.nick,
                ident: data.ident,
                host: data.host,
                raw: msg
            });
            ircEvents.emit('user:infoUpdated', {
                nick: data.nick,
                channelName: channel.name,
                ident: data.ident,
                host: data.host,
                server: data.server,
                realname: data.realname,
                flags: data.flags,
                raw: msg
            });
        }
    }
});

ircEvents.on('protocol:rplNamreply', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        channel.clearUsers(); // Clear and rebuild user list from NAMES
        var processedNames = [];
        data.names.forEach(nickEntry => {
            let modes = '';
            let nick = nickEntry;

            // Extract modes/prefixes from nick
            if (isupport.PREFIX) { // Use ISUPPORT PREFIX if available
                let prefixes = isupport.PREFIX.match(/\((.*?)\)(.*)/);
                if (prefixes) {
                    let modeChars = prefixes[1];
                    let prefixChars = prefixes[2];
                    for (let i = 0; i < prefixChars.length; i++) {
                        if (nick.startsWith(prefixChars[i])) {
                            modes += modeChars[i];
                            nick = nick.substring(1);
                        }
                    }
                }
            } else { // Fallback for common prefixes
                if (nick.startsWith('@')) { modes += 'o'; nick = nick.substring(1); }
                else if (nick.startsWith('+')) { modes += 'v'; nick = nick.substring(1); }
            }

            let user = gateway.findUser(nick);
            if (!user) {
                user = new users.user(nick);
            }
            channel.addUser(user);
            channel.setUserModes(user, modes);
            ircEvents.emit('channel:userJoined', {
                channelName: channel.name,
                channelId: channel.id,
                nick: nick,
                modes: modes,
                raw: msg
            });
            processedNames.push({ nick: nick, modes: modes, ident: user.ident, host: user.host }); // Collect for names list
        });
        ircEvents.emit('channel:userListUpdated', {
            channelName: channel.name,
            channelId: channel.id,
            raw: msg
        });
        ircEvents.emit('channel:namesReplyComplete', { // Emit consolidated names data
            channelName: channel.name,
            users: processedNames,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplWhospcrpl', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setIdent(data.ident);
        user.setHost(data.host);
        user.setRealname(data.realname);
        user.setAccount(data.account);
        user.setSpecialStatus(data.status); // Assuming special status maps to mode flags
        user.setGecos(data.gecos); // Assuming setGecos exists

        ircEvents.emit('user:extendedInfoUpdated', {
            nick: user.nick,
            ident: data.ident,
            host: data.host,
            server: data.server,
            realname: data.realname,
            account: data.account,
            status: data.status,
            gecos: data.gecos,
            raw: msg
        });
    } else {
        var newUser = new users.user(data.nick);
        newUser.setIdent(data.ident);
        newUser.setHost(data.host);
        newUser.setRealname(data.realname);
        newUser.setAccount(data.account);
        newUser.setSpecialStatus(data.status);
        newUser.setGecos(data.gecos);
        ircEvents.emit('user:extendedInfoUpdated', {
            nick: data.nick,
            ident: data.ident,
            host: data.host,
            server: data.server,
            realname: data.realname,
            account: data.account,
            status: data.status,
            gecos: data.gecos,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplKilldone', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:killConfirmed', {
        nick: data.nick,
        reason: data.message, // msg.text in protocolGeneric
        raw: msg
    });
});

ircEvents.on('protocol:rplClosing', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:closingConnection', {
        server: data.serverName,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplCloseend', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:closeCommandEnded', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplLinks', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:linkInfo', {
        linkName: data.linkName,
        remoteServer: data.remoteServer,
        hopCount: data.hopCount,
        info: data.info,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndoflinks', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfLinksList', {
        mask: data.mask,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofnames', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        ircEvents.emit('channel:endOfNamesList', {
            channelName: channel.name,
            channelId: channel.id,
            message: data.message,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplBanlist', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        ircEvents.emit('channel:banListEntry', {
            channelName: channel.name,
            channelId: channel.id,
            banmask: data.banmask,
            setBy: data.setBy,
            setAt: data.setAt,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplEndofbanlist', function(data) {
    var msg = data.raw;
    var channel = gateway.findChannel(data.channelName);
    if (channel) {
        ircEvents.emit('channel:endOfBanList', {
            channelName: channel.name,
            channelId: channel.id,
            message: data.message,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplEndofwhowas', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:endOfWhowas', {
        nick: data.nick,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplInfo', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:infoMessage', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplMotd', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:motdLine', {
        line: data.line,
        raw: msg
    });
});

ircEvents.on('protocol:rplInfostart', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:infoStart', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofinfo', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfInfo', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplMotdstart', function(data) {
    var msg = data.raw;
    var serverNameMatch = data.message.match(/^- ([^ ]+) Message of the day -/);
    var serverName = serverNameMatch ? serverNameMatch[1] : '';
    ircEvents.emit('server:motdStart', {
        server: serverName,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofmotd', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfMotd', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWhoishost', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setHost(data.host);
        ircEvents.emit('user:hostInfoUpdated', {
            nick: user.nick,
            host: data.host,
            raw: msg
        });
        domainWhoisData.host = data.host; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplWhoismodes', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setModes(data.modes); // Assuming `modes` is a string like '+i'
        ircEvents.emit('user:whoisModes', {
            nick: user.nick,
            modes: data.modes,
            raw: msg
        });
        domainWhoisData.userModes = data.modes; // Add to WHOIS data
    }
});

ircEvents.on('protocol:rplYoureoper', function(data) {
    var msg = data.raw;
    // Assume current user (guser.me) is the oper
    if (guser.me) {
        guser.me.setOperator(true);
    }
    ircEvents.emit('user:isOperator', {
        nick: guser.me ? guser.me.nick : null,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplRehashing', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:rehashingConfig', {
        configFile: data.configFile,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplYoureservice', function(data) {
    var msg = data.raw;
    if (guser.me) {
        guser.me.setService(true); // Assuming `setService` method
    }
    ircEvents.emit('user:isService', {
        nick: guser.me ? guser.me.nick : null,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplMyportis', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:myPortInfo', {
        port: data.port,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplNotoperanymore', function(data) {
    var msg = data.raw;
    if (guser.me) {
        guser.me.setOperator(false);
    }
    ircEvents.emit('user:isOperator', {
        nick: guser.me ? guser.me.nick : null,
        isOperator: false,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplQlist', function(data) {
    var msg = data.raw;
    // Q list entries
    ircEvents.emit('server:qlistEntry', {
        channel: data.channelName,
        mask: data.mask,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofqlist', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfQlist', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplAlist', function(data) {
    var msg = data.raw;
    // A list entries (admin list)
    ircEvents.emit('server:alistEntry', {
        channel: data.channelName,
        mask: data.mask,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofalist', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfAlist', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplTime', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:serverTime', {
        server: msg.prefix,
        time: data.serverTime,
        raw: msg
    });
});

ircEvents.on('protocol:rplUsersstart', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:usersStart', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplUsers', function(data) {
    var msg = data.raw;
    // User info for USERS command
    ircEvents.emit('server:usersEntry', {
        username: data.username,
        tty: data.tty,
        host: data.host,
        nick: data.nick,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofusers', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:endOfUsers', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplNousers', function(data) {
    var msg = data.raw;
    ircEvents.emit('server:noUsers', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplHosthidden', function(data) {
    var msg = data.raw;
    if (guser.me) {
        guser.me.setHiddenHost(data.hiddenHost);
    }
    ircEvents.emit('user:hostHidden', {
        nick: guser.me ? guser.me.nick : null,
        hiddenHost: data.hiddenHost,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errNosuchnick', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '401',
        type: 'noSuchNick',
        message: data.message,
        target: data.nick,
        raw: msg
    });
});

ircEvents.on('protocol:errNosuchserver', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '402',
        type: 'noSuchServer',
        message: data.message,
        target: data.serverName,
        raw: msg
    });
});

ircEvents.on('protocol:errNosuchchannel', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '403',
        type: 'noSuchChannel',
        message: data.message,
        target: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:error', function(data) { // Original generic protocol:error handler
    var msg = data.raw;
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
        raw: msg
    });
});

ircEvents.on('protocol:errWasnosuchnick', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '406',
        type: 'wasNoSuchNick',
        message: data.message,
        target: data.nick,
        raw: msg
    });
});

ircEvents.on('protocol:errNorecipient', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '411',
        type: 'noRecipient',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errErroneusnickname', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '432',
        type: 'erroneousNickname',
        message: data.message,
        nick: data.nick,
        raw: msg
    });
});

ircEvents.on('protocol:errNicknameinuse', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '433',
        type: 'nicknameInUse',
        message: data.message,
        nick: data.nick,
        raw: msg
    });
});

ircEvents.on('protocol:errNotonchannel', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '442',
        type: 'notOnChannel',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errUseronchannel', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '443',
        type: 'userOnChannel',
        message: data.message,
        nick: data.nick,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errNonickchange', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '447',
        type: 'noNickChange',
        message: data.message,
        nick: data.nick,
        raw: msg
    });
});

ircEvents.on('protocol:errYouwillbebanned', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '466',
        type: 'youWillBeBanned',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errKeyset', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '467',
        type: 'keySet',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errOnlyserverscanchange', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '468',
        type: 'onlyServersCanChange',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errLinkset', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '469',
        type: 'linkSet',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errLinkchannel', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '470',
        type: 'linkChannel',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errChannelisfull', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '471',
        type: 'channelIsFull',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errUnknownmode', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '472',
        type: 'unknownMode',
        message: data.message,
        mode: data.mode,
        raw: msg
    });
});

ircEvents.on('protocol:errInviteonlychan', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '473',
        type: 'inviteOnlyChan',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errBannedfromchan', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '474',
        type: 'bannedFromChan',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errBadchannelkey', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '475',
        type: 'badChannelKey',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errNeedreggednick', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '477',
        type: 'needReggedNick',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errBanlistfull', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '478',
        type: 'banListFull',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errLinkfail', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '479',
        type: 'linkFail',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errCannotknock', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '480',
        type: 'cannotKnock',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errNoprivileges', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '481',
        type: 'noPrivileges',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errChanoprivsneeded', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '482',
        type: 'chanOpPrivsNeeded',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errNononreg', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '486',
        type: 'noNonreg',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errNotforusers', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '487',
        type: 'notForUsers',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errSecureonlychan', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '489',
        type: 'secureOnlyChan',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errNoswear', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '490',
        type: 'noSwear',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errNooperhost', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '491',
        type: 'noOperHost',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errNoctcp', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '492',
        type: 'noCtcp',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errChanownprivneeded', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '499',
        type: 'chanOwnPrivNeeded',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errToomanyjoins', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '500',
        type: 'tooManyJoins',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:errUmodeunknownflag', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '501',
        type: 'uModeUnknownFlag',
        message: data.message,
        mode: data.mode,
        raw: msg
    });
});

ircEvents.on('protocol:errUsersdontmatch', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '502',
        type: 'usersDontMatch',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errSilelistfull', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '511',
        type: 'sileListFull',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errToomanywatch', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '512',
        type: 'tooManyWatch',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errNeedpong', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '513',
        type: 'needPong',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errToomanydcc', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '514',
        type: 'tooManyDcc',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errDisabled', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '517',
        type: 'disabled',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errNoinvite', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '518',
        type: 'noInvite',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errAdmonly', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '519',
        type: 'admOnly',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errOperonly', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '520',
        type: 'operOnly',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errListsyntax', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '521',
        type: 'listSyntax',
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errCantsendtouser', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '531',
        type: 'cantSendToUser',
        message: data.message,
        nick: data.nick,
        raw: msg
    });
});

ircEvents.on('protocol:rplReaway', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:reAway', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplGoneaway', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:goneAway', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplNotaway', function(data) {
    var msg = data.raw;
    if (guser.me) { // Ensure current user exists before updating
        guser.me.notAway();
    }
    ircEvents.emit('user:awayStatusChanged', { // Emit a consistent away status changed event
        nick: guser.me ? guser.me.nick : null,
        isAway: false,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplLogon', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:loggedIn', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplLogoff', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:loggedOut', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWatchoff', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:watchOff', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWatchstat', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:watchStatus', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplNowon', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick); // Find user by nick from protocolGeneric
    if (user) {
        user.setOnline(true);
        ircEvents.emit('user:onlineStatusChanged', {
            nick: user.nick,
            isOnline: true,
            message: data.message,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplNowoff', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick); // Find user by nick from protocolGeneric
    if (user) {
        user.setOnline(false);
        ircEvents.emit('user:onlineStatusChanged', {
            nick: user.nick,
            isOnline: false,
            message: data.message,
            raw: msg
        });
    }
});

ircEvents.on('protocol:rplWatchlist', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:watchListEntry', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplEndofwatchlist', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:endOfWatchList', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplClearwatch', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:clearWatch', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplNowisaway', function(data) {
    var msg = data.raw;
    ircEvents.emit('user:nowIsAway', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplWhoissecure', function(data) {
    var msg = data.raw;
    var user = gateway.findUser(data.nick);
    if (user) {
        user.setSecure(true); // Assuming setSecure method
    }
    ircEvents.emit('user:isSecure', {
        nick: data.nick,
        message: data.message,
        raw: msg
    });
    domainWhoisData.isSecure = true; // Add to WHOIS data
});

ircEvents.on('protocol:errMlockrestricted', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '742',
        type: 'mlockRestricted',
        message: data.message,
        channel: data.channelName,
        raw: msg
    });
});

ircEvents.on('protocol:rplKeyvalue', function(data) {
    var msg = data.raw;
    ircEvents.emit('metadata:keyValue', {
        target: data.target,
        key: data.key,
        value: data.value,
        raw: msg
    });
});

ircEvents.on('protocol:rplMetadataend', function(data) {
    var msg = data.raw;
    ircEvents.emit('metadata:end', {
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:rplKeynotset', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', { // Emitting as an error, as it indicates something went wrong
        code: '766',
        type: 'metadataKeyNotSet',
        message: data.message,
        target: data.target,
        key: data.key,
        raw: msg
    });
});

ircEvents.on('protocol:rplMetadatasubok', function(data) {
    var msg = data.raw;
    ircEvents.emit('metadata:subscriptionOk', {
        target: data.target,
        key: data.key,
        message: data.message,
        raw: msg
    });
});

ircEvents.on('protocol:errMetadatasynclater', function(data) {
    var msg = data.raw;
    ircEvents.emit('client:errorMessage', {
        code: '774',
        type: 'metadataSyncLater',
        message: data.message,
        delayMs: data.delayMs,
        raw: msg
    });
});

ircEvents.on('protocol:rplLoggedin', function(data) {
    var msg = data.raw;
    ircEvents.emit('auth:loggedIn', {
        nick: data.nick,
        account: data.account,
        message: data.message,
        raw: msg
    });
    ircEvents.emit('auth:saslLoggedIn', { // Emit for consistency with display
        nick: data.nick,
        account: data.account,
        time: msg.time
    });
    ircEvents.emit('auth:userIdentifiedViaNickserv', { // Emit for consistency with display
        nick: data.nick,
        account: data.account,
        time: msg.time
    });
});

ircEvents.on('protocol:rplLoggedout', function(data) {
    var msg = data.raw;
    ircEvents.emit('auth:loggedOut', {
        nick: data.nick,
        message: data.message,
        raw: msg
    });
    ircEvents.emit('auth:saslLoggedOut', { // Emit for consistency with display
        nick: data.nick,
        message: data.message,
        time: msg.time
    });
});

ircEvents.on('protocol:rplSaslsuccess', function(data) {
    var msg = data.raw;
    ircEvents.emit('auth:saslSuccess', {
        message: data.message,
        raw: msg
    });
    saslInProgress = false; // Reset SASL state
});

ircEvents.on('protocol:errSaslfail', function(data) {
    var msg = data.raw;
    ircEvents.emit('auth:saslFail', {
        message: data.message,
        raw: msg
    });
    saslInProgress = false; // Reset SASL state
});

ircEvents.on('protocol:errSaslaborted', function(data) {
    var msg = data.raw;
    ircEvents.emit('auth:saslAborted', {
        message: data.message,
        raw: msg
    });
    saslInProgress = false; // Reset SASL state
});

ircEvents.on('protocol:error', function(data) {
    var msg = data.raw;
    // Generic error handling, for things like 404, 465, 972, 974 etc.
    // The specific `command` and `type` fields help categorize.
    var errorType = data.type || 'genericError';
    if(msg.command == '404') { // ERR_CANNOTSENDTOCHAN from cmd_binds
        errorType = 'cannotSendToChan';
    } else if (msg.command == '465') { // ERR_YOUREBANNEDCREEP from cmd_binds
        errorType = 'bannedCreep';
    } else if (msg.command == '972') { // ERR_CANNOTDOCOMMAND from cmd_binds
        errorType = 'cannotDoCommand';
    } else if (msg.command == '974') { // ERR_CANNOTCHANGECHANMODE from cmd_binds
        errorType = 'cannotChangeChanMode';
    }
    ircEvents.emit('client:errorMessage', {
        code: msg.command, // Use original command as code if numeric not available
        type: errorType,
        target: data.target || data.channel || data.query,
        message: data.text,
        raw: msg
    });
});

ircEvents.on('protocol:ctcpAction', function(data) {
    var msg = data.raw;
    ircEvents.emit('ctcp:action', {
        sender: msg.user.nick,
        target: data.target,
        message: data.text,
        raw: msg
    });
});

ircEvents.on('protocol:ctcpVersionRequest', function(data) {
    var msg = data.raw;
    ircEvents.emit('ctcp:versionRequest', {
        sender: data.requestedBy,
        target: data.target,
        raw: msg
    });
});

ircEvents.on('protocol:ctcpUserinfoRequest', function(data) {
    var msg = data.raw;
    ircEvents.emit('ctcp:userinfoRequest', {
        sender: data.requestedBy,
        target: data.target,
        raw: msg
    });
});

ircEvents.on('protocol:ctcpRefererRequest', function(data) {
    var msg = data.raw;
    ircEvents.emit('ctcp:refererRequest', {
        sender: data.requestedBy,
        target: data.target,
        raw: msg
    });
});

ircEvents.on('protocol:unhandledMessage', function(data) {
    var msg = data.raw;
    console.log('DOMAIN: Unhandled protocol message:', data.command, data.args, data.text);
    ircEvents.emit('client:unhandledMessage', {
        command: data.command,
        args: data.args,
        text: data.text,
        raw: msg
    });
});

// Placeholder listeners for new domain-level events (for ircCommand delegation)

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
    // Directly call gateway.connect as it's the protocol layer entry
    // All relevant state will be updated by protocol:rplWelcome etc.
    // This assumes gateway.connect is still available globally
    gateway.connect(data.force);
    // Update UI dialog
    $$.closeDialog('connect', 'reconnect');
    $$.displayDialog('connect', '1', language.connecting, data.initialMessage);
});

ircEvents.on('domain:setConnectedWhenIdentified', function() {
    console.log('DOMAIN: Set Connected When Identified');
    domainSetConnectedWhenIdentified = 1;
});

ircEvents.on('domain:requestPing', function() {
    console.log('DOMAIN: Request Ping');
    domainPingCnt++;
    gateway.forceSend('PING :JavaScript'); // Protocol action
    if(domainPingCnt > 3) {
        domainConnectStatus = 'error';
        ircEvents.emit('domain:connectionDisconnected', { reason: language.pingTimeout });
        if($('#autoReconnect').is(':checked')){ // UI setting
            ircEvents.emit('domain:requestReconnect');
        } else {
            $$.displayReconnect(); // UI action
        }
        domainPingCnt = 0;
    }
});

ircEvents.on('domain:connectionDisconnected', function(data) {
    console.log('DOMAIN: Connection Disconnected:', data.reason);
    clearTimeout(domainConnectTimeoutID);
    if (gateway.websock) {
        gateway.websock.onerror = undefined;
        gateway.websock.onclose = undefined;
    }
    domainConnectTimeoutID = false;
    clearInterval(domainPingIntervalID);
    domainPingIntervalID = false;

    guser.clear(); // Clear domain user state
    // gateway.updateHistory(); // This is UI, but might be triggered from domain now

    // Clear label callbacks and info
    for(label in gateway.labelCallbacks){
        gateway.labelNotProcessed(label, null); // Call labelNotProcessed which clears callbacks
    }
    // gateway.labelCallbacks = {}; // Cleared by labelNotProcessed
    // gateway.labelInfo = {}; // Cleared by labelNotProcessed

    if(guser.nickservnick != ''){
        irc.lastNick = guser.nick;
        guser.nick = guser.nickservnick;
    }

    if(domainDisconnectMessageShown) {
        return;
    }
    domainDisconnectMessageShown = 1;
    // Loop through channels and tell UI to part/append message
    for(c in gateway.channels) { // gateway.channels is UI list
        gateway.channels[c].part(); // UI action
        gateway.channels[c].appendMessage(language.messagePatterns.error, [$$.niceTime(), data.reason]); // UI action
    }
    gateway.statusWindow.appendMessage(language.messagePatterns.error, [$$.niceTime(), data.reason]); // UI action
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
    console.error('DOMAIN: WebSocket Error:', data.event, 'Current Status:', data.currentStatus);
    setTimeout(function(){
        if(data.currentStatus != 'disconnected' && data.currentStatus != 'error' && data.currentStatus != 'banned'){
            domainConnectStatus = 'error';
            ircEvents.emit('domain:connectionDisconnected', { reason: language.lostNetworkConnection });
            if(data.autoReconnect){
                ircEvents.emit('domain:requestReconnect');
            } else {
                $$.displayReconnect();
            }
        }
    }, 1000);
});

ircEvents.on('domain:connectionTimeoutExpired', function(data) {
    console.log('DOMAIN: Connection Timeout Expired:', data.currentStatus);
    if(data.currentStatus != 'connected'){
        var button = [ {
            text: language.reconnect,
            click: function(){
                ircEvents.emit('domain:requestStopAndReconnect', { reason: language.connectingTookTooLong });
            }
        } ];
        $$.closeDialog('connect', '1');
        $$.displayDialog('connect', 'reconnect', language.connecting, '<p>' + language.connectingTooLong + '</p>', button);
    }
});

ircEvents.on('domain:requestStopAndReconnect', function(data) {
    console.log('DOMAIN: Request Stop And Reconnect:', data.reason);
    ircEvents.emit('domain:connectionDisconnected', { reason: data.reason });
    if(gateway.websock && gateway.websock.readyState === WebSocket.OPEN) ircCommand.quit(data.reason); // Protocol action
    setTimeout(function() { ircEvents.emit('domain:requestReconnect'); }, 500);
});

ircEvents.on('domain:setConnectStatus', function(data) {
    console.log('DOMAIN: Set Connect Status:', data.status);
    domainConnectStatus = data.status;
});

// Domain logic for processStatus (previously gateway.processStatus())
ircEvents.on('domain:processConnectionStatusUpdate', function() {
    // This event is emitted after data is received. Now check connection status.
    console.log('DOMAIN: Processing connection status update. Current status:', domainConnectStatus);

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
                    var date = new Date();
                    gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(date), language.SASLLoginAttempt]);
                }
            }
        }
        if(domainConnectStatus == 'ghostAndNickSent' && guser.nick == guser.nickservnick){ //ghost się udał
            if(domainNickWasInUse){
                var html = '<p>' + language.nickNoLongerInUse + '</p>';
                $$.displayDialog('warning', 'warning', language.warning, html);
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
    }
    if(domainConnectStatus == 'connected'){
        domainSetConnectedWhenIdentified = 0;
        if(!domainJoined) {
            $('#input').focus(); // UI action
            ircEvents.emit('domain:requestJoinChannels'); // Request joining channels
            domainJoined = 1;
            domainDisconnectMessageShown = 0; //tutaj resetuję
            // ustawianie usermode wg konfiguracji dopiero teraz
            if(guser.umodes.R && !$('#setUmodeR').is(':checked')){ // UI setting
                ircCommand.umode('-R');
            } else if(!guser.umodes.R && $('#setUmodeR').is(':checked')){ // UI setting
                ircCommand.umode('+R');
            }
            if(guser.umodes.D && !$('#setUmodeD').is(':checked')){ // UI setting
                ircCommand.umode('-D');
            } else if(!guser.umodes.D && $('#setUmodeD').is(':checked')){ // UI setting
                ircCommand.umode('+D');
            }
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
    console.log('DOMAIN: Request Join Channels:', data.channels);
    var allChannels = [];
    if (guser.channels && guser.channels.length > 0) {
        allChannels = allChannels.concat(guser.channels);
    }
    // gateway.channels is UI, we should rely on domain's channel list
    // For now, assuming gateway.channels still has the domain objects
    for(var i=0; i<gateway.channels.length; i++){
        allChannels.push(gateway.channels[i].name);
    }
    ircCommand.channelJoin(allChannels);
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
    var chan = gateway.findChannel(data.channelName); // UI lookup
    if (chan) {
        chan.part(); // UI action, marks as left
        ircCommand.channelPart(data.channelName, language.leftChannel); // Protocol action
        // UI cleanup should be triggered by domain event for channel removal
        ircEvents.emit('channel:removed', { channelName: data.channelName });
    }
});

ircEvents.on('domain:requestRemoveQuery', function(data) {
    console.log('DOMAIN: Request Remove Query:', data.queryName);
    // UI cleanup is done by Query.close()
    ircEvents.emit('query:removed', { queryName: data.queryName });
});

ircEvents.on('domain:requestRemoveListWindow', function(data) {
    console.log('DOMAIN: Request Remove List Window:', data.listName);
    gateway.listWindow = null; // Clear UI reference
    ircEvents.emit('listWindow:removed', { listName: data.listName });
});


// --- IRC Commands & Services ---

ircEvents.on('domain:requestIrcCommand', function(data) {
    console.log('DOMAIN: Request IRC Command:', data.command, data.args, data.raw);
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

ircEvents.on('domain:requestQuit', function(data) {
    console.log('DOMAIN: Request Quit:', data.message);
    domainUserQuit = true; // Update domain state
    ircCommand.quit(data.message);
});

ircEvents.on('domain:requestListChannels', function(data) {
    console.log('DOMAIN: Request List Channels:', data.minUsers);
    ircCommand.listChannels(data.minUsers);
    // UI feedback for loading might be here too or in a separate UI event
    gateway.smallListLoading = true; // Domain state for list window
});

ircEvents.on('domain:requestChatHistory', function(data) {
    console.log('DOMAIN: Request Chat History:', data.channelName, data.type, data.reference, data.limit);
    ircCommand.chathistory(data.type, data.channelName, data.reference, undefined, data.limit);
});

ircEvents.on('domain:requestRedoNames', function(data) {
    console.log('DOMAIN: Request Redo Names:', data.channelName);
    ircCommand.channelNames(data.channelName);
    ircCommand.channelTopic(data.channelName); // Refresh topic too
    ircCommand.who(data.channelName); // Refresh WHO info
});

ircEvents.on('domain:requestSendMessage', function(data) {
    console.log('DOMAIN: Request Send Message:', data.target, data.message);
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

ircEvents.on('domain:findOrCreateTab', function(data) {
    console.log('DOMAIN: Find or Create Tab:', data.tabName, 'Set Active:', data.setActive);
    // This calls gateway.findOrCreate which manages UI tab objects
    var tab = gateway.findOrCreate(data.tabName, data.setActive);
    // Emit a UI event if necessary to signal tab creation
    if (tab && !gateway.find(data.tabName)) { // If it was newly created
        ircEvents.emit('ui:tabCreated', { tabName: data.tabName, tabType: data.tabName.charAt(0) == '#' ? 'channel' : 'query' });
    }
});

ircEvents.on('domain:tabSwitched', function(data) {
    console.log('DOMAIN: Tab Switched: Old:', data.oldTab, 'New:', data.newTab);
    domainActiveTab = data.newTab;
    // domainTabHistory.push(data.newTab); // gateway.tabHistory is UI
    // Additional domain logic related to active tab can go here
});

ircEvents.on('domain:findTab', function(data) {
    console.log('DOMAIN: Find Tab:', data.tabName);
    var tab = gateway.find(data.tabName); // UI lookup
    return tab; // Returns the UI object
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
    console.log('DOMAIN: Processing Typing Activity:', data.window.name, data.inputValue, data.time);
    var currentWindowName = data.window.name;
    var currentInputValue = data.inputValue;

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
    // No direct UI update here, UI should listen to user:modesUpdated from guser.setUmode
});

ircEvents.on('domain:processChannelModes', function(data) {
    console.warn('DOMAIN: processChannelModes is still a stub. Needs full implementation.');
    // This is where the complex parsing of channel mode changes (from gateway.parseChannelMode)
    // and updating the domain's channel object should happen.
    // It would then emit channel:modesUpdated, which the UI listens to.
    var args = data.args;
    var chan = data.channel;
    var dispType = data.dispType; // 1 - joining, 0 - changed
    var rawMsg = data.rawMsg;
    // This is where the actual mode application logic should live
    // Currently, original code directly updates UI channel.modes, which is bad.
    // Need to access domain's channel object and update its modes here.
    // And then emit event for UI.

    var plus = true;
    var nextarg = 1;
    var infoText = ''; // For UI display
    var dir = '';

    for (var i=0; i<args[0].length; i++) {
        var cchar = args[0][i];
        switch(cchar){
            case '+':
                plus = true;
                if(dispType == 1){
                    dir = '';
                } else {
                    dir = language.hasSet;
                }
                break;
            case '-':
                if(dispType == 1) continue;
                dir = language.hasRemoved;
                plus = false;
                break;
            default:
                var mtype = 'single';
                if(modes.argBoth.indexOf(cchar) >= 0){
                    mtype = 'both';
                } else if(modes.argAdd.indexOf(cchar) >= 0){
                    mtype = 'add';
                } else if(modes.list.indexOf(cchar) >= 0){
                    mtype = 'list';
                } else if(modes.user.indexOf(cchar) >= 0){
                    mtype = 'user';
                }
                
                switch(mtype){
                    case 'both': case 'list':
                        infoText = infoText.apList(dir+getModeInfo(cchar, dispType)+(args[nextarg]?(' '+args[nextarg]):''));
                        if(mtype != 'list'){
                            // Update domain's channel mode
                            // if(plus){ chan.modes[cchar] = args[nextarg]; } else { chan.modes[cchar] = false; }
                        }
                        nextarg++;
                        break;
                    case 'add':
                        if(plus){
                            // Update domain's channel mode
                            // chan.modes[cchar] = args[nextarg];
                            infoText = infoText.apList(dir+getModeInfo(cchar+'-add', dispType)+(args[nextarg]?(' '+args[nextarg]):''));
                            nextarg++;
                        } else {
                            infoText = infoText.apList(dir+getModeInfo(cchar+'-remove', dispType));
                            // chan.modes[cchar] = false;
                        }
                        break;
                    case 'user':
                        // Update domain's user mode on channel
                        infoText = infoText.apList((plus?language.gave:language.taken)+getModeInfo(cchar, dispType)+(plus?language.forUser:'')+' <span class="modevictim">'+args[nextarg]+'</span>');
                        nextarg++;
                        break;
                    default:
                        // Update domain's channel mode
                        // chan.modes[cchar] = plus;
                        infoText = infoText.apList(dir+' '+getModeInfo(cchar, dispType));
                        break;
                }
                break;
        }
    }
    // Emit a generic event for UI that modes were updated, including the infoText
    ircEvents.emit('channel:modesUpdated', { channelName: chan.name, byNick: rawMsg.user.nick, modeString: args[0], modeParams: args.slice(1), infoText: infoText, raw: rawMsg });
});

// --- Other Domain Logic ---

ircEvents.on('domain:findOrCreateTab', function(data) {
    console.log('DOMAIN: Find or Create Tab request:', data.tabName, data.setActive);
    var tab = gateway.find(data.tabName); // UI lookup
    if (!tab) {
        if (data.tabName.charAt(0) == '#') {
            tab = new Channel(data.tabName);
            gateway.channels.push(tab);
            gateway.sortChannelTabs(); // UI action
        } else {
            tab = new Query(data.tabName);
            gateway.queries.push(tab);
        }
        // Signal UI that a new tab was created
        ircEvents.emit('ui:tabCreated', { tabName: data.tabName, tabType: data.tabName.charAt(0) == '#' ? 'channel' : 'query' });
    }
    if (data.setActive) {
        gateway.switchTab(data.tabName); // UI action
    }
    // Return the UI tab object to the caller (though event-driven, sometimes direct return is needed)
    data.callback(tab); // Assuming a callback can be provided
});

ircEvents.on('domain:tabSwitched', function(data) {
    console.log('DOMAIN: Tab Switched (Domain): Old:', domainActiveTab, 'New:', data.newTab);
    domainActiveTab = data.newTab;
    // Update tab history if needed here, or keep it UI specific
    // domainTabHistory.push(data.newTab); // This is UI list, should probably stay there
});

ircEvents.on('domain:findTab', function(data) {
    console.log('DOMAIN: Find Tab request:', data.tabName);
    var tab = gateway.find(data.tabName); // UI lookup
    data.callback(tab); // Return via callback
});

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
    // This logic needs to manage cross-tab connection checks and join requests
    if(!evt.newValue){
        return;
    }
    if(conn.waitForAlive && evt.key == 'checkAliveReply'){ // conn is global
        conn.waitForAlive = false;
        
        var chan = guser.channels[0];
        // UI logic, but domain needs to pass data for it
        var html = language.alreadyConnectedAs + '<strong>'+he(evt.newValue)+'</strong>! ' + language.cantOpenMultipleInstances;
        $('#not_connected_wrapper').fadeOut(400); // UI action
        
        try {
            localStorage.removeItem(evt.key); // Storage action
            if(chan && chan != '#'){
                html += '<br>' + language.goToTabToJoin + '<strong>'+chan+'</strong>.';
                localStorage.setItem('reqChannelJoin', guser.channels[0]); // Storage action
            }
        } catch(e) {}

        $$.displayDialog('connect', '0', language.alreadyConnected, html); // UI action
    }
    if(domainConnectStatus == 'connected'){
        try {
            if(evt.key == 'checkAlive'){
                localStorage.removeItem(evt.key);
                localStorage.setItem('checkAliveReply', guser.nick);
            }
            if(evt.key == 'reqChannelJoin'){
                var chan = evt.newValue;
                localStorage.removeItem(evt.key);
                var alreadyJoined = false;
                for(var i=0; i<gateway.channels.length; i++){ // gateway.channels is UI
                    if(gateway.channels[i].name.toLowerCase() == chan.toLowerCase()){
                        alreadyJoined = true;
                        break;
                    }
                }
                if(!alreadyJoined) {
                    var html = language.otherTabWantsToJoin + '<strong>'+chan+'</strong>.';
                    var button = [ {
                        text: language.cancel,
                        click: function(){
                            $(this).dialog('close');
                        }
                    }, {
                        text: language.join,
                        click: function(){
                            ircEvents.emit('domain:requestJoinChannel', { channelName: chan, time: new Date() }); // Emit domain event
                            $(this).dialog('close');
                        }
                    } ];
                    $$.displayDialog('confirm', 'join', language.confirm, html, button); // UI action
                }
            }
        } catch(e) {}
    }
});

ircEvents.on('domain:processNetsplitEvents', function(data) {
    console.log('DOMAIN: Processing Netsplit Events');
    domainQuitTimeout = false;
    if(data.quitQueue.length == 0) return;
    
    // Process netsplit logic here (previously in gateway.processNetsplit)
    for(c in gateway.channels){ // gateway.channels is UI
        var nickNames = '';
        var chan = gateway.channels[c];
        var nicklist = chan.nicklist;
        for(n in data.quitQueue){
            var nick = data.quitQueue[n].sender.nick;
            if(!domainNetJoinUsers[chan.name]){ // domainNetJoinUsers
                domainNetJoinUsers[chan.name] = {};
            }
            domainNetJoinUsers[chan.name][nick] = (+new Date)/1000;
            if(nicklist.findNick(nick)){ // UI nicklist
                nicklist.removeNick(nick); // UI action
                if(nickNames != ''){
                    nickNames += ', ';
                }
                nickNames += nick;
            }
        }
        if(nickNames != ''){
            chan.appendMessage(language.messagePatterns.netsplit, [$$.niceTime(), nickNames]); // UI action
        }
    }
    for(n in data.quitQueue){
        var nick = data.quitQueue[n].sender.nick;
        users.delUser(nick); // Domain user management
    }
    domainQuitQueue = []; // Clear domain state
});

ircEvents.on('domain:processNetjoinEvents', function(data) {
    console.log('DOMAIN: Processing Netjoin Events');
    domainNetJoinTimeout = false;
    if(data.netJoinQueue.length == 0) return;
    
    // Process netjoin logic here (previously in gateway.processNetjoin)
    for(c in gateway.channels){ // gateway.channels is UI
        var nickNames = '';
        var chan = gateway.channels[c];
        var nicklist = chan.nicklist;
        for(var n=0; n<data.netJoinQueue.length; n++){
            try {
                if(data.netJoinQueue[n].chan.toLowerCase() != chan.name.toLowerCase()){
                    continue;
                }
            } catch(e) {
                console.error(e);
            }
            var nick = data.netJoinQueue[n].nick;
            if(nickNames != ''){
                nickNames += ', ';
            }
            nickNames += nick;
        }
        if(nickNames != ''){
            chan.appendMessage(language.messagePatterns.netjoin, [$$.niceTime(), nickNames]); // UI action
        }
    }
    domainNetJoinQueue = []; // Clear domain state
});

ircEvents.on('domain:processQuitCommand', function(data) {
    console.log('DOMAIN: Processing QUIT command:', data.msg.sender.nick);
    var msg = data.msg;
    // Process QUIT logic here (previously in gateway.processQuit)
    if(gateway.findQuery(msg.sender.nick)) { // UI lookup
        if (!data.showPartQuit) { // UI setting
            gateway.findQuery(msg.sender.nick).appendMessage(language.messagePatterns.quit, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]); // UI action
        }
    }

    if(msg.text.match(/^[^ :]+\.[^ :]+ [^ :]+\.[^ :]+$/)){
        domainQuitQueue.push(msg); // Use domainQuitQueue
        if(domainQuitTimeout){
            clearTimeout(domainQuitTimeout);
        }
        domainQuitTimeout = setTimeout(function() { ircEvents.emit('domain:processNetsplitEvents', { quitQueue: domainQuitQueue }); }, 700);
        return false;
    }
    
    for(c in gateway.channels) { // UI channel list
        if(gateway.channels[c].nicklist.findNick(msg.sender.nick)) { // UI nicklist lookup
            gateway.channels[c].nicklist.removeNick(msg.sender.nick); // UI action
            if (!data.showPartQuit) { // UI setting
                gateway.channels[c].appendMessage(language.messagePatterns.quit, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]); // UI action
            }
        }
    }
    return true;
});

ircEvents.on('domain:processJoinCommand', function(data) {
    console.log('DOMAIN: Processing JOIN command:', data.msg.sender.nick, 'to', data.msg.args[0]);
    var msg = data.msg;
    // Process JOIN logic here (previously in gateway.processJoin)
    if('extended-join' in activeCaps){ // activeCaps is domain state
        var channame = msg.args[0];
    } else {
        var channame = msg.text;
    }
    var chan = gateway.findChannel(channame); // UI lookup
    var dlimit = (+new Date)/1000 - 300; // time check
    if(!chan) return; // Only process if UI channel exists

    var netjoin = false;
    if(domainNetJoinUsers[channame] && domainNetJoinUsers[channame][msg.sender.nick]){ // domainNetJoinUsers
        if(domainNetJoinUsers[channame][msg.sender.nick] > dlimit){
            netjoin = true;
        }
        delete domainNetJoinUsers[channame][msg.sender.nick];
    }
    if(netjoin){
        domainNetJoinQueue.push({'chan': channame, 'nick': msg.sender.nick}); // domainNetJoinQueue
        if(domainNetJoinTimeout){
            clearTimeout(domainNetJoinTimeout);
        }
        domainNetJoinTimeout = setTimeout(function() { ircEvents.emit('domain:processNetjoinEvents', { netJoinQueue: domainNetJoinQueue }); }, 700);
    } else if (!data.showPartQuit) { // UI setting
        chan.appendMessage(language.messagePatterns.join, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), channame]); // UI action
    }
});


// --- Tab Management ---

ircEvents.on('domain:requestOpenQuery', function(data) {
    console.log('DOMAIN: Request Open Query:', data.nick);
    ircEvents.emit('domain:findOrCreateTab', { tabName: data.nick, setActive: true, time: new Date() });
});


// --- Mode Parsing ---

ircEvents.on('domain:processUserModes', function(data) {
    console.log('DOMAIN: Processing User Modes:', data.modes);
    var modes = data.modes;
    var plus = false;
    for(var i=0; i<modes.length; i++){
        var c = modes.charAt(i);
        switch(c){
            case '+': plus = true; break;
            case '-': plus = false; break;
            case ' ': return;
            default: guser.setUmode(c, plus); break; // guser is domain state
        }
    }
    // No direct UI update here, UI should listen to user:modesUpdated from guser.setUmode
});

ircEvents.on('domain:parseChannelMode', function(data) {
    console.warn('DOMAIN: parseChannelMode event handler needs full implementation.');
    var args = data.args;
    var channelName = data.channelName;
    var dispType = data.dispType; // 1 - joining a channel, 0 - changed when already on a channel
    var rawMsg = data.rawMsg;
    var chan = gateway.findChannel(channelName); // UI Channel object

    if (!chan) {
        console.error('DOMAIN: parseChannelMode - Channel not found:', channelName);
        return;
    }

    var plus = true;
    var nextarg = 1;
    var infoText = '';
    var dir = '';
    // This logic should primarily update the domain's channel modes (e.g., chan.modes property)
    // and emit relevant domain events. UI will listen to channel:modesUpdated
    for (var i=0; i<args[0].length; i++) {
        var cchar = args[0][i];
        switch(cchar){
            case '+':
                plus = true;
                if(dispType == 1){
                    dir = '';
                } else {
                    dir = language.hasSet;
                }
                break;
            case '-':
                if(dispType == 1) continue;
                dir = language.hasRemoved;
                plus = false;
                break;
            default:
                var mtype = 'single';
                if(modes.argBoth.indexOf(cchar) >= 0){ // modes global config
                    mtype = 'both';
                } else if(modes.argAdd.indexOf(cchar) >= 0){
                    mtype = 'add';
                } else if(modes.list.indexOf(cchar) >= 0){
                    mtype = 'list';
                } else if(modes.user.indexOf(cchar) >= 0){
                    mtype = 'user';
                }
                
                switch(mtype){
                    case 'both': case 'list':
                        infoText = infoText.apList(dir+getModeInfo(cchar, dispType)+(args[nextarg]?(' '+args[nextarg]):''));
                        if(mtype != 'list'){
                            if(plus){
                                chan.modes[cchar] = args[nextarg]; // Update UI channel modes
                            } else {
                                chan.modes[cchar] = false; // Update UI channel modes
                            }
                        }
                        nextarg++;
                        break;
                    case 'add':
                        if(plus){
                            chan.modes[cchar] = args[nextarg]; // Update UI channel modes
                            infoText = infoText.apList(dir+getModeInfo(cchar+'-add', dispType)+(args[nextarg]?(' '+args[nextarg]):''));
                            nextarg++;
                        } else {
                            infoText = infoText.apList(dir+getModeInfo(cchar+'-remove', dispType));
                            chan.modes[cchar] = false; // Update UI channel modes
                        }
                        break;
                    case 'user':
                        // This updates UI NicklistUser, needs to be more domain-driven
                        infoText = infoText.apList((plus?language.gave:language.taken)+getModeInfo(cchar, dispType)+(plus?language.forUser:'')+' <span class="modevictim">'+args[nextarg]+'</span>');
                        nextarg++;
                        break;
                    default:
                        chan.modes[cchar] = plus; // Update UI channel modes
                        infoText = infoText.apList(dir+' '+getModeInfo(cchar, dispType));
                        break;
                }
                break;
        }
    }
    // Emit event for UI to update display based on modes
    ircEvents.emit('channel:modesUpdated', {
        channelName: channelName,
        channelId: chan.id,
        modes: args[0], // Pass raw mode string for UI to parse
        modeParams: args.slice(1),
        byNick: rawMsg.user.nick, // Need to ensure rawMsg has user.nick
        infoText: infoText, // Pre-formatted text for display
        raw: rawMsg
    });
});

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
