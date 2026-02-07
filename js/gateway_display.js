/**
 * @fileoverview
 * This file handles all UI-related display logic, acting as the primary listener
 * for events emitted by core application logic. It decouples direct DOM manipulation
 * from event processing, ensuring a cleaner separation of concerns.
 */

(function() {
    /**
     * Formats channel modes for display when joining a channel.
     * @param {string} modeString - The mode string (e.g., "+nt")
     * @param {Array} modeParams - Optional parameters for modes that require them
     * @returns {string} Formatted mode description
     */
    function formatChannelModes(modeString, modeParams) {
        if (!modeString) return '';

        var infoText = '';
        var plus = true;
        var paramIndex = 0;

        for (var i = 0; i < modeString.length; i++) {
            var ch = modeString[i];

            if (ch === '+') {
                plus = true;
                continue;
            } else if (ch === '-') {
                plus = false;
                continue;
            }

            // Get mode description
            var modeInfo = getModeInfo(ch, 1); // 1 = joining channel display type
            var param = '';

            // Check if this mode takes a parameter
            // Modes that typically need params: k (key), l (limit), b/e/I (bans/exempts)
            if ('klebfLI'.indexOf(ch) >= 0 && modeParams && paramIndex < modeParams.length) {
                param = ' ' + modeParams[paramIndex];
                paramIndex++;
            }

            infoText = infoText.apList(modeInfo + param);
        }

        return infoText || language.none;
    }

    /**
     * Show/hide operator actions based on user's channel privileges
     * @param {Object} channel - The channel tab object
     * @param {number} ourMemberLevel - The privilege level of the current user (0-5)
     */
    function updateOperActionsDisplay(channel, ourMemberLevel) {
        var chanId = channel.id;
        // Show operActions if user has halfop or higher (level >= 2)
        if (ourMemberLevel >= 2) {
            $('#'+chanId+'-displayOperCss').remove();
            var style = $('<style id="'+chanId+'-displayOperCss">.'+chanId+'-operActions { display:block !important; }</style>');
            $('html > head').append(style);
        } else {
            $('#'+chanId+'-displayOperCss').remove();
        }
    }

    // ==========================================
    // UI STATE (moved from gateway object)
    // ==========================================
    var uiState = {
        statusWindow: new Status(),
        channels: [],
        queries: [],
        active: '--status',
        listWindow: null,
        completion: {
            string: '',
            rawStr: '',
            repeat: 0,
            array: [],
            lastPos: -1,
            find: function(string, rawStr, comPos) {
                var complarr = [];
                var ccount = 0;
                if(string.length > 0 && string.indexOf('/') == 0 && comPos == 0) {
                    for (i in commands) {
                        if(i.indexOf(string.slice(1).toLowerCase()) == 0) {
                            complarr[ccount] = '/'+i;
                            ccount++;
                        }
                    }
                } else {
                    if(string.indexOf('#') == 0) {
                        for (var ichannel = 0; ichannel < gateway.channels.length; ichannel++) {
                            if(gateway.channels[ichannel].name.toLowerCase().replace(/^[^a-z0-9]/ig).indexOf(string.toLowerCase().replace(/^[^a-z0-9]/ig)) == 0) {
                                complarr[ccount] = gateway.channels[ichannel].name;
                                ccount++;
                            }
                        }
                    } else {
                        var chan = gateway.findChannel(gateway.active);
                        if(chan) {
                            for (var inick=0; inick < chan.nicklist.list.length; inick++) {
                                if(chan.nicklist.list[inick].user.nick.toLowerCase().replace(/^[^a-z0-9]/ig).indexOf(string.toLowerCase().replace(/^[^a-z0-9]/ig)) == 0) {
                                    complarr[ccount] = chan.nicklist.list[inick].user.nick;
                                    if(comPos == 0) {
                                        complarr[ccount] += ':';
                                    }
                                    ccount++;
                                }
                            }
                        }
                    }
                }
                return complarr;
            }
        },
        commandHistory: [],
        historyPosition: 0,
        nickListVisibility: true,
        lastKeypressWindow: '',
        keypressSuppress: '',
        displayOwnWhois: false
    };

    // ==========================================
    // EXPOSE UI STATE ON GATEWAY FOR BACKWARD COMPATIBILITY
    // ==========================================
    // These will be gradually removed as callers are refactored
    function exposeUIStateOnGateway() {
        gateway.statusWindow = uiState.statusWindow;
        gateway.channels = uiState.channels;
        gateway.queries = uiState.queries;
        gateway.active = uiState.active;
        gateway.listWindow = uiState.listWindow;
        gateway.completion = uiState.completion;
        gateway.commandHistory = uiState.commandHistory;
        gateway.nickListVisibility = uiState.nickListVisibility;
        gateway.lastKeypressWindow = uiState.lastKeypressWindow;
        gateway.keypressSuppress = uiState.keypressSuppress;
        gateway.displayOwnWhois = uiState.displayOwnWhois;
    }

    /**
     * Initializes UI-related event listeners.
     */
    function initDisplayListeners() {
        // Listener for received messages with abstracted state
        ircEvents.on('message:received', function(state) {
            // All message state is now provided by domain - no need to check caps/batches/tags

            // Special handling for NOTICE from services (NickServ, ChanServ)
            if(state.messageType === 'NOTICE'){
                var senderNick = state.sender.nick;
                // Check if it's from NickServ - ALL NickServ messages should appear in dialogs
                if(senderNick && senderNick.toLowerCase() == 'nickserv'){
                    var msgObj = { sender: state.sender, text: state.text };
                    var handled = services.nickservMessage(msgObj);
                    if(!handled) {
                        $$.displayDialog('notice', 'nickserv', 'NickServ', $$.colorize(state.text));
                    }
                    return; // All NickServ messages handled via dialogs
                }
                // Check if it's from ChanServ - ALL ChanServ messages should appear in dialogs
                if(senderNick && senderNick.toLowerCase() == 'chanserv'){
                    var msgObj = { sender: state.sender, text: state.text };
                    var handled = services.chanservMessage(msgObj);
                    if(!handled) {
                        $$.displayDialog('notice', 'chanserv', 'ChanServ', $$.colorize(state.text));
                    }
                    return; // All ChanServ messages handled via dialogs
                }
            }

            var attrs = 'data-time="' + state.time.getTime() + '"';
            var addClass = '';

            // Handle echo-message confirmation (replace temporary message)
            if(state.isEcho && state.labelToReplace){
                console.log('[ECHO-DEBUG] Echo-message received with label:', state.labelToReplace, 'removing temporary display');
                var tempMsg = $('[data-label="'+state.labelToReplace+'"]');
                console.log('[ECHO-DEBUG] Found', tempMsg.length, 'temporary message(s) to remove');
                tempMsg.remove();
            }

            // Mark outgoing pending messages (waiting for confirmation)
            if(state.isPending && state.label){
                attrs += ' data-label="' + state.label + '"';
                addClass = 'notDelivered';
                console.log('[ECHO-DEBUG] Marking outgoing message as notDelivered, label:', state.label);
            }

            // Add msgid for deduplication
            if(state.msgid){
                attrs += ' data-msgid="' + state.msgid + '"';
            }

            // Call insertMessage with abstracted state (no raw tags)
            gateway.insertMessage(state.messageType || 'PRIVMSG', state.dest, state.text, state.isOutgoing, null, state.sender, state.time, {
                attrs: attrs,
                addClass: addClass,
                isHistory: state.isHistory,
                msgid: state.msgid // Pass msgid for deduplication
            });
        });

        // Listener for when the client successfully joins a channel.
        ircEvents.on('channel:channelCreation', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var members = data.members; // Complete initial member list from domain

            var channel = gateway.findChannel(channame); // Find the UI representation of the channel
            if (!channel) {
                // Create the UI representation with complete initial data
                channel = new ChannelTab(channame); // Channel UI constructor handles DOM creation
                gateway.channels.push(channel);
                gateway.sortChannelTabs(); // Re-sort tabs after adding new one

                // Populate the nicklist with all initial members at once (efficiently)
                if (members && members.length > 0) {
                    var ourMember = null;
                    for (var i = 0; i < members.length; i++) {
                        channel.nicklist._addMemberToUI(members[i], true); // Skip sort/stats during bulk add
                        // Track our own member entry
                        if (members[i].id === guser.me.id) {
                            ourMember = members[i];
                        }
                    }
                    // Sort and update stats once after all members are added
                    channel.nicklist.sort();
                    channel.nicklist.showChstats();

                    // Update operator actions display based on our privileges
                    if (ourMember) {
                        updateOperActionsDisplay(channel, ourMember.level);
                    }
                }
            } else {
                // Channel already exists (rejoining after kick/part)
                // Clear the left flag and repopulate nicklist
                channel.left = false;
                channel.hasNames = false; // Will be set to true after NAMES completes

                // Repopulate the nicklist with all members
                if (members && members.length > 0) {
                    var ourMember = null;
                    for (var i = 0; i < members.length; i++) {
                        channel.nicklist._addMemberToUI(members[i], true); // Skip sort/stats during bulk add
                        // Track our own member entry
                        if (members[i].id === guser.me.id) {
                            ourMember = members[i];
                        }
                    }
                    // Sort and update stats once after all members are added
                    channel.nicklist.sort();
                    channel.nicklist.showChstats();

                    // Update operator actions display based on our privileges
                    if (ourMember) {
                        updateOperActionsDisplay(channel, ourMember.level);
                    }
                }
            }

            // Display the channel
            gateway.switchTab(channame);

            // Append join message with timestamp for chronological ordering with history
            channel.appendMessage(language.messagePatterns.joinOwn, [
                $$.niceTime(data.time),
                he(data.nick),
                he(data.ident),
                he(data.host),
                he(data.channelName)
            ], data.time);
        });

        // Listener for automatic history request on channel join
        // Domain layer emits this when server supports CHATHISTORY
        // UI calculates appropriate limit and requests history
        ircEvents.on('channel:requestInitialHistory', function(data) {
            var channelName = data.channelName;
            var maxLimit = data.maxLimit; // Server's max limit (0 = unlimited)

            // Calculate UI-appropriate limit based on screen size
            var limit = gateway.calculateHistoryLimit();

            // Respect server's maximum if it has one
            if (maxLimit != 0 && maxLimit < limit) {
                limit = maxLimit;
            }

            // Request history via domain event
            ircEvents.emit('domain:requestChatHistory', {
                channelName: channelName,
                type: 'LATEST',
                msgid: null,
                timestamp: null, // '*' is handled specially by domain
                limit: limit,
                time: new Date()
            });
        });

        // Listener for NAMES refresh (not initial join)
        ircEvents.on('channel:memberListReplace', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var members = data.members; // Complete refreshed member list from domain

            var channel = gateway.findChannel(channame);
            if (channel && channel.nicklist) {
                // Replace the entire nicklist with refreshed data
                channel.nicklist.replaceAllMembers(members);
            }
        });

        // Listener for when another user joins a channel
        ircEvents.on('channel:userJoined', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var chan = gateway.findChannel(channame);

            // Domain only emits this for channels we're in, but check anyway
            if (!chan) {
                console.warn('UI: Received channel:userJoined for channel we have no tab for:', channelName);
                return;
            }

            // The domain layer should have already updated the user object and nicklist.
            // UI layer just needs to re-render the nicklist or append the join message.
            if (!settings.get('showPartQuit')) {
                chan.appendMessage(language.messagePatterns.join, [
                    $$.niceTime(data.time),
                    he(data.nick),
                    he(data.ident),
                    he(data.host),
                    channelName
                ], data.time);
            }
            // Note: Nicklist automatically updates via domain:channelMemberListChanged events
        });

        ircEvents.on('server:userJoinedOtherChannel', function(data) {
            // Show JOIN for channels we're not in as a status message
            gateway.statusWindow.appendMessage(language.messagePatterns.join, [
                $$.niceTime(data.time),
                he(data.nick),
                he(data.ident),
                he(data.host),
                data.channelName
            ], data.time);
        });

        ircEvents.on('channel:topic', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var channel = gateway.findChannel(channame);

            if (!channel) {
                return; // Channel tab not found
            }

            channel.setTopic(data.topic);

            // Display topic using the topic pattern: [time, channelName, topicText]
            if (data.topic) {
                channel.appendMessage(language.messagePatterns.topic, [
                    $$.niceTime(),
                    channelName,
                    $$.colorize(data.topic)
                ]);
            } else {
                channel.appendMessage(language.messagePatterns.topicNotSet, [
                    $$.niceTime(),
                    channelName
                ]);
            }
        });

        ircEvents.on('channel:topicInfoUpdated', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var channel = gateway.findChannel(channame);

            if (!channel) {
                return; // Channel tab not found
            }

            channel.setTopicSetBy(data.setBy);
            channel.setTopicSetDate(data.setDate);

            // Display topic metadata using topicTime pattern: [time, setBy, setDate]
            if (data.setBy && data.setDate) {
                channel.appendMessage(language.messagePatterns.topicTime, [
                    $$.niceTime(),
                    he(data.setBy),
                    $$.parseTime(data.setDate)
                ]);
            }
        });

        ircEvents.on('channel:creationTimeUpdated', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var channel = gateway.findChannel(channame);

            if (!channel) {
                return; // Channel tab not found
            }

            channel.setCreationTime(data.creationTime);

            // Display creation time using creationTime pattern: [time, creationDate]
            if (data.creationTime) {
                channel.appendMessage(language.messagePatterns.creationTime, [
                    $$.niceTime(),
                    $$.parseTime(data.creationTime)
                ]);
            }
        });

        ircEvents.on('channel:modesUpdated', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var channel = gateway.findChannel(channame);

            if (!channel) {
                return; // Channel tab not found
            }

            // Parse and display channel modes using mode pattern: [time, channelName, modeDescription]
            if (data.modes) {
                var modeDescription = formatChannelModes(data.modes, data.modeParams);
                channel.appendMessage(language.messagePatterns.mode, [
                    $$.niceTime(),
                    channelName,
                    modeDescription
                ]);
            }
        });

        ircEvents.on('channel:userParted', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var chan = gateway.findChannel(channame);

            if (!chan) {
                return; // Channel not displayed
            }

            // UI decides whether to show part messages based on settings
            if (!settings.get('showPartQuit')) {
                chan.appendMessage(language.messagePatterns.part, [
                    $$.niceTime(data.time),
                    he(data.nick),
                    he(data.ident),
                    he(data.host),
                    channelName,
                    he(data.partMessage || '')
                ]);
            }
            // Nicklist will be updated by domain layer events
        });

        ircEvents.on('channel:userKicked', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var chan = gateway.findChannel(channame);

            if (!chan) {
                return; // Channel not displayed
            }

            // Check if we were kicked
            if (data.kickedNick === guser.me.nick) {
                // Display kickOwn message
                chan.appendMessage(language.messagePatterns.kickOwn, [
                    $$.niceTime(data.time),
                    he(data.kickerNick),
                    channelName,
                    $$.colorize(data.reason || '')
                ]);
                // Close the channel tab
                chan.part();
            } else {
                // Display kick message for other users
                chan.appendMessage(language.messagePatterns.kick, [
                    $$.niceTime(data.time),
                    he(data.kickerNick),
                    he(data.kickedNick),
                    channelName,
                    $$.colorize(data.reason || '')
                ]);
            }
            // Nicklist will be updated by domain layer events
        });

        ircEvents.on('user:selfKickedFromChannel', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                $('#'+channel.id+'-displayOperCss').remove();
            }
        });

        ircEvents.on('channel:errorMessage', function(data) {
            // Display channel-related error messages
            var channelName = data.channelName;
            var reason = data.reason;
            var message = data.message || '';

            // Map reason codes to translations
            var reasonText = '';
            switch(reason) {
                case 'voiceNeeded':
                    reasonText = language.needVoice;
                    break;
                case 'banned':
                    reasonText = language.youreBanned;
                    break;
                case 'noColor':
                    reasonText = language.colorsForbidden;
                    break;
                case 'noExternal':
                    reasonText = language.noExternalMsgs;
                    break;
                case 'accountNeeded':
                    reasonText = language.registeredNickRequired;
                    break;
                default:
                    reasonText = language.serverMessageIs + he(message);
                    break;
            }

            // Display on channel tab if open, otherwise status window
            var chan = gateway.findChannel(channelName);
            if (chan) {
                chan.appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(data.time), channelName, reasonText]);
            } else {
                gateway.statusWindow.appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(data.time), channelName, reasonText]);
            }
        });

        ircEvents.on('channel:removed', function(data) {
            // Clean up UI when we part/leave a channel
            gateway.removeChannel(data.channelName);
        });

        ircEvents.on('user:otherQuit', function(data) {
            // User quit from server - show quit messages only on channels where user was present
            // UI decides whether to show quit messages based on settings
            if (!settings.get('showPartQuit')) {
                var nickStr = he(data.user.nick);
                var identStr = he(data.user.ident);
                var hostStr = he(data.user.host);
                var quitStr = he(data.quitMessage || '');
                var timeStr = $$.niceTime(data.time);

                // Show quit message only in channels where the user was a member
                if (data.channels && data.channels.length > 0) {
                    for (var i = 0; i < data.channels.length; i++) {
                        var chan = gateway.findChannel(data.channels[i]);
                        if (chan) {
                            chan.appendMessage(language.messagePatterns.quit, [
                                timeStr,
                                nickStr,
                                identStr,
                                hostStr,
                                quitStr
                            ]);
                        }
                    }
                }
                // Show quit message in queries with this user
                var query = gateway.findQuery(data.user.nick);
                if (query) {
                    query.appendMessage(language.messagePatterns.quit, [
                        timeStr,
                        nickStr,
                        identStr,
                        hostStr,
                        quitStr
                    ]);
                }
            }
        });

        ircEvents.on('channel:chatHistoryStatsUpdated', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (!channel) return;

            var reference = data.oldestMsgid || data.oldestTimestamp;
            // var historyLimit = ('CHATHISTORY' in isupport) ? isupport['CHATHISTORY'] : 50; // isupport is global, safe for UI to check
            var historyLimit = 50; // Default fallback
            if('CHATHISTORY' in isupport){
                historyLimit = isupport['CHATHISTORY'];
            }

            if ((data.oldestMsgid || data.oldestTimestamp) && data.receivedMessages >= historyLimit) {
                // Find the oldest message from this batch and insert button before it
                var selector = data.oldestMsgid
                    ? '[data-msgid="' + data.oldestMsgid + '"]'
                    : (data.oldestTimestamp ? '[data-time="' + new Date(data.oldestTimestamp).getTime() + '"]' : null);

                // Store both msgid and timestamp as separate attributes for domain layer
                var dataAttrs = '';
                if(data.oldestMsgid){
                    dataAttrs += ' data-msgid="' + data.oldestMsgid + '"';
                }
                if(data.oldestTimestamp){
                    dataAttrs += ' data-timestamp="' + data.oldestTimestamp + '"';
                }

                var html = '<div class="loadOlderButton"' + dataAttrs + '><a href="javascript:void(0)" onclick="gateway.loadOlderHistory(\'' + he(data.channelName) + '\')">' + language.loadOlderHistory + '</a></div>';

                if (selector) {
                    var oldestMsg = $('#' + data.channelId + '-window ' + selector);
                    if (oldestMsg.length) {
                        oldestMsg.before(html);
                    } else {
                        // Fallback to prepend if message not found
                        $('#' + data.channelId + '-window').prepend(html);
                    }
                } else {
                    $('#' + data.channelId + '-window').prepend(html);
                }
            } else if (data.receivedMessages > 0 && !data.isInitialHistory) {
                // Only show "no older history" for manual requests, not initial history
                var html = '<div class="noOlderHistory">' + language.noOlderHistory + '</div>';
                $('#' + data.channelId + '-window').prepend(html);
            } else if (data.receivedMessages === 0 && !data.isInitialHistory) {
                // Manual "load older" request returned no messages - replace button with "no older history"
                $('#' + data.channelId + '-window .loadOlderButton').remove();
                var html = '<div class="noOlderHistory">' + language.noOlderHistory + '</div>';
                $('#' + data.channelId + '-window').prepend(html);
            }
        });

        // SASL Authentication Listeners (primarily status messages)
        ircEvents.on('auth:saslAuthenticating', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLogin + he(data.nickservNick)]);
        });

        ircEvents.on('auth:saslLoginAttempt', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLoginAttempt]);
        });

        ircEvents.on('auth:saslLoggedIn', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.weAreLoggedInAs + he(data.account)]);
        });

        ircEvents.on('auth:userIdentifiedViaNickserv', function() {
            $$.closeDialog('nickserv', 'l');
        });

        ircEvents.on('auth:saslLoggedOut', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), he(data.message)]);
        });

        ircEvents.on('auth:saslSuccess', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLoginSuccess]);
        });

        ircEvents.on('auth:saslFail', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLLoginFail]);
        });

        ircEvents.on('auth:nickservError', function(data) {
            services.displayNickservError(language.suppliedNickPassword, language.passwordInvalidTryAgain); // This is UI service
            $('#nickserv-l .error').html(language.error + ': ' + language.passwordInvalidTryAgain);
        });

        ircEvents.on('auth:saslAborted', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(data.time), language.SASLNotLoggedIn]);
        });

        // Global and Dialog Listeners
        ircEvents.on('client:canSetAvatar', function() {
            $('#set-avatar-button').show(); // Pure UI
        });

        // This is emitted by domain:error (type: 'globalBan') which is now caught by client:errorMessage
        // ircEvents.on('client:globalBanInfo', function(data) {
        //     gateway.displayGlobalBanInfo(data.text); // Pure UI function
        // });

        ircEvents.on('client:reconnectNeeded', function() {
            $$.displayReconnect(); // Pure UI function
        });

        ircEvents.on('client:connected', function() {
            // UI-only logic: close connection dialogs
            $$.closeDialog('connect', '1');
            $$.closeDialog('connect', 'reconnect');
        });

        ircEvents.on('client:disconnected', function(data) {
            // UI-only logic: respond to disconnection
            // Domain layer has already handled cleanup via domain:connectionDisconnected
            console.log('UI: Client disconnected:', data.reason);
        });

        // Handlers for UI-specific tasks emitted by domain layer on disconnection
        ircEvents.on('ui:updateHistory', function() {
            gateway.updateHistory(); // UI-specific history update
        });

        ircEvents.on('ui:clearLabelCallbacks', function() {
            // Clear gateway.labelCallbacks (UI-specific cleanup)
            gateway.labelCallbacks = {};
        });

        ircEvents.on('ui:disconnectCleanupChannels', function(data) {
            // Loop through channels and handle disconnection UI
            for(c in gateway.channels) {
                gateway.channels[c].part(); // UI action (removes UI elements)
                gateway.channels[c].appendMessage(language.messagePatterns.selfDisconnected, [$$.niceTime(), he(data.reason)]); // UI action
            }
        });

        ircEvents.on('ui:statusWindowMessage', function(data) {
            // Add message to status window
            if (data.reason) {
                // Disconnection message
                gateway.statusWindow.appendMessage(language.messagePatterns.selfDisconnected, [$$.niceTime(), he(data.reason)]);
            } else if (data.messageKey && data.messageParams) {
                // SASL or other formatted message
                var messagePattern = language[data.messageKey];
                if (messagePattern) {
                    gateway.statusWindow.appendMessage(messagePattern, data.messageParams);
                }
            }
        });

        ircEvents.on('client:joinChannels', function() {
            // This is called by client:processOwnChannelList in gateway_domain.js
            // But gateway.joinChannels() is removed from gateway_def.js
            // UI should not trigger this directly
            console.warn('UI should not call client:joinChannels directly');
        });

        // Status window message handlers
        ircEvents.on('client:welcome', function(data) {
            // Display RPL_WELCOME (001) message in status window
            gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), he(data.message)]);
        });

        ircEvents.on('server:motdLine', function(data) {
            // Display MOTD line in status window
            var message = $$.colorize(data.line);
            gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), message]);
        });

        /* DEPRECATED: Now handled by message:received event
ircEvents.on('client:notice', function(data) {
            // Handle NOTICE messages - check for NickServ and display appropriately
            var senderNick = data.from;
            var ident = data.ident || '';
            var host = data.host || '';
            var target = data.target;
            var message = data.message;

            // Check if it's from NickServ - ALL NickServ messages should appear in dialogs
            if(senderNick && senderNick.toLowerCase() == 'nickserv'){
                // Construct message object that services.nickservMessage expects
                var msgObj = {
                    sender: { nick: senderNick },
                    text: message
                };
                var handled = services.nickservMessage(msgObj);
                // If not recognized by services, show generic dialog with the message
                if(!handled) {
                    $$.displayDialog('notice', 'nickserv', 'NickServ', $$.colorize(message));
                }
                return; // All NickServ messages handled via dialogs
            }
            // Check if it's from ChanServ - ALL ChanServ messages should appear in dialogs
            if(senderNick && senderNick.toLowerCase() == 'chanserv'){
                var msgObj = {
                    sender: { nick: senderNick },
                    text: message
                };
                var handled = services.chanservMessage(msgObj);
                // If not recognized by services, show generic dialog with the message
                if(!handled) {
                    $$.displayDialog('notice', 'chanserv', 'ChanServ', $$.colorize(message));
                }
                return; // All ChanServ messages handled via dialogs
            }

            // Display notice in appropriate window
            // Check if this is a server notice (no user info) or user notice
            var isServerNotice = !ident || !host;

            if(target.indexOf('#') == 0) { // Channel notice
                var chan = gateway.findChannel(target);
                if(chan){
                    if(isServerNotice){
                        // Server notice - use motd format (just time and message, no "Disconnected" text)
                        chan.appendMessage(language.messagePatterns.motd, [$$.niceTime(), $$.colorize(message)]);
                    } else {
                        chan.appendMessage(language.messagePatterns.notice, ['', '', $$.niceTime(), he(senderNick), he(ident), he(host), $$.colorize(message)]);
                    }
                } else {
                    gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), $$.colorize(message)]);
                }
            } else { // Private notice
                if(isServerNotice){
                    // Server notice - show in status window with motd format
                    gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(), $$.colorize(message)]);
                } else {
                    var query = gateway.findQuery(senderNick);
                    if(query){
                        query.appendMessage(language.messagePatterns.notice, ['', '', $$.niceTime(), he(senderNick), he(ident), he(host), $$.colorize(message)]);
                    } else {
                        gateway.statusWindow.appendMessage(language.messagePatterns.notice, ['', '', $$.niceTime(), he(senderNick), he(ident), he(host), $$.colorize(message)]);
                        gateway.statusWindow.markBold();
                    }
                }
            }
        });
        */

        ircEvents.on('client:myNickChanged', function(data) {
            var html = '<p>' + language.yourCurrentNickIs + ' <b>' + data.newNick + '</b></p>';
            $$.displayDialog('warning', 'warning', language.warning, html);
        });

        // New listeners for domain user events
        ircEvents.on('domain:userUpdated', function(data) {
            // Note: Nicklist updates are handled by domain:channelMemberListChanged
            // and domain:channelMemberUpdated events, which are emitted by the
            // ChannelMemberList when a member's underlying user changes.
            // This event is for other UI updates that might need user changes.

            // Update queries if the user has a query window open
            for (var q in gateway.queries) {
                var query = gateway.queries[q];
                if (query && query.user && query.user.id === data.user.id) {
                    // Query UI updates for user changes could go here
                }
            }
        });

        ircEvents.on('domain:meAvatarMetadataUpdated', function(data) {
            if(settings.get('avatar')){ // Check setting directly in display layer
                disp.avatarChanged(); // Pure UI function
            }
        });

        ircEvents.on('domain:meRegisteredStatusUpdated', function(data) {
            if (data.registered) {
                $('#nickRegister').hide();
                $('.nickRegistered').show();
            } else {
                $('#nickRegister').show();
                $('.nickRegistered').hide();
            }
        });

        // Handle channel member list changes - show/hide operActions for initial join
        ircEvents.on('domain:channelMemberListChanged', function(data) {
            // Check if a member was added and it's the current user
            if (data.type === 'add' && data.member && data.member.id === guser.me.id) {
                var channel = gateway.findChannel(data.channelName);
                if (channel) {
                    updateOperActionsDisplay(channel, data.member.level);
                }
            }
        });

        // Handle channel member updates - show/hide operActions based on own channel status changes
        ircEvents.on('domain:channelMemberUpdated', function(data) {
            // Check if the updated member is the current user
            if (data.memberId === guser.me.id) {
                var channel = gateway.findChannel(data.channelName);
                if (channel) {
                    updateOperActionsDisplay(channel, data.newMember.level);
                }
            }
        });

        // Clean up operActions CSS when we leave a channel
        ircEvents.on('user:selfPartedChannel', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                $('#'+channel.id+'-displayOperCss').remove();
            }
        });

        ircEvents.on('domain:meNickChanged', function(data) {
            document.title = he(data.newNick)+' @ PIRC.pl';
            // Also trigger the old client:myNickChanged if it's still used for a dialog
            ircEvents.emit('client:myNickChanged', { oldNick: data.oldNick, newNick: data.newNick });
        });

        ircEvents.on('domain:userNickChanged', function(data) {
            var oldNick = data.oldNick;
            var newNick = data.newNick;
            var user = data.user; // The updated user object
            var time = data.time;

            // Update query if the nick changed is a query target
            var query = gateway.findQuery(oldNick); // Find query by oldNick as tabs might not be updated yet
            if(query) {
                // The Query.changeNick method (in gateway_tabs.js) updates its own UI,
                // and internally calls ircEvents.emit('domain:requestSwitchTab') and 'domain:requestRemoveQuery'
                // This means Query.changeNick itself handles the UI-level consequences of a nick change for a query.
                // We pass the updated user object to Query.changeNick
                query.changeNick(newNick, user); // Modified Query.changeNick to accept user object
            }

            // Append nick change message to relevant channels
            // Note: Nicklist updates are handled automatically via domain:channelMemberListChanged events
            for(var c in gateway.channels) {
                var channelTab = gateway.channels[c]; // UI layer ChannelTab object
                // Check if the user is in this channel's nicklist
                if (channelTab && channelTab.nicklist && channelTab.nicklist.uiMembers.has(user.id)) {
                    // Only show message if it's not our own nick, and setting allows
                    if (user.id !== guser.me.id && !$('#showNickChanges').is(':checked')) {
                        channelTab.appendMessage(language.messagePatterns.nickChange, [$$.niceTime(time), he(oldNick), he(newNick)]);
                    }
                }
            }
        });

        // Connection timeout - always show dialog with manual reconnect option
        // (auto-reconnect only applies to websocket/server errors, not connection timeout)
        ircEvents.on('domain:connectionTimeoutExpired', function(data) {
            $$.closeDialog('connect', '1');
            var button = [ {
                text: language.reconnect,
                click: function(){
                    ircEvents.emit('domain:requestStopAndReconnect', { reason: language.connectingTookTooLong });
                }
            } ];
            $$.displayDialog('connect', 'reconnect', language.connecting, '<p>' + language.connectingTooLong + '</p>', button);
        });

        // WebSocket error - trigger auto-reconnect or show reconnect dialog
        ircEvents.on('domain:websocketError', function(data) {
            if (settings.get('autoReconnect')) {
                gateway.reconnect();
            } else {
                $$.displayReconnect();
            }
        });

        // Handle reconnection logic based on UI settings
        ircEvents.on('ui:handleReconnectLogic', function(data) {
            if (settings.get('autoReconnect')) {
                gateway.reconnect();
            } else {
                $$.displayReconnect();
            }
        });

        // Domain request to reconnect - actually trigger the reconnection
        ircEvents.on('domain:requestReconnect', function(data) {
            gateway.reconnect();
        });

        // User requested to open a query window
        ircEvents.on('user:queryRequested', function(data) {
            gateway.findOrCreate(data.nick, data.setActive);
        });

        // Channel list started loading
        ircEvents.on('server:listStart', function(data) {
            if (gateway.listWindow) {
                gateway.listWindow.clearData(); // Show "Loading, please wait..."
            }
        });

        // LIST command processed - show message if output goes to status and user is on different tab
        ircEvents.on('domain:listCommandProcessed', function(data) {
            // Only show message if list doesn't use a window and user is not on status tab
            if (!data.usesWindow && gateway.active != '--status') {
                gateway.getActive().appendMessage(language.messagePatterns.listShown, [$$.niceTime()]);
            }
        });

        // CTCP reply received
        ircEvents.on('protocol:ctcpReply', function(data) {
            var query = gateway.findQuery(data.fromNick);
            var target = query || gateway.statusWindow;

            target.appendMessage(language.messagePatterns.ctcpReply, [
                $$.niceTime(),
                he(data.fromNick),
                $$.colorize(data.fullText)
            ]);

            // Special handling for VERSION replies - show in dialog
            if (data.ctcpType.toLowerCase() === 'version' && data.ctcpText) {
                $$.displayDialog('whois', data.fromNick,
                    language.userInformation + he(data.fromNick),
                    language.userSoftware + '<b>' + he(data.fromNick) + '</b>:<br>' + he(data.ctcpText)
                );
            }
        });

        // Channel list completed - populate the list window
        ircEvents.on('list:smallListComplete', function(data) {
            if (gateway.listWindow) {
                // Add each channel to the list
                data.smallListData.forEach(function(item) {
                    gateway.listWindow.addEntry(item[0], item[1], item[2]);
                });

                // Render the complete list
                gateway.listWindow.render();
            }
        });

        // WHOIS information complete - display dialog
        ircEvents.on('user:whoisComplete', function(eventData) {
            console.log('[WHOIS-DEBUG] user:whoisComplete event received:', eventData);
            var data = eventData.data;
            var nick = eventData.nick;
            console.log('[WHOIS-DEBUG] data:', data, 'nick:', nick);
            var html = '';

            // Basic user info (nick!ident@host and realname)
            if (data.ident && data.host) {
                html += "<p class='whois'><span class='info'>" + language.fullMask + ":</span><span class='data'> " +
                    he(nick) + "!" + he(data.ident) + "@" + he(data.host) + "</span></p>";
            }
            if (data.realname) {
                html += "<p class='whois'><span class='info'>" + language.realname + ":</span><span class='data'> " +
                    he(data.realname) + "</span></p>";
            }

            // Server info
            if (data.server) {
                html += "<p class='whois'><span class='info'>" + language.server + ":</span><span class='data'>" +
                    he(data.server);
                if (data.serverInfo) {
                    html += " " + he(data.serverInfo);
                }
                html += "</span></p>";
            }

            // Operator status
            if (data.operatorInfo) {
                html += "<p class='whois'><span class='info'><br /></span><span class='data admin'>" +
                    "<b class='admin'>" + language.ircop + "</b></span></p>";
            }

            // Special status (helpop, network service, etc.)
            if (data.specialStatus) {
                html += "<p class='whois'><span class='info'><br /></span><span class='data'>" +
                    he(data.specialStatus) + "</span></p>";
            }

            // Account (logged in as)
            if (data.account) {
                html += "<p class='whois'><span class='info'>" + language.accountName + ":</span><span class='data'>" +
                    he(data.account) + "</span></p>";
            }

            // Registered nickname
            if (data.isRegistered) {
                html += "<p class='whois'><span class='info'><br /></span><span class='data'>" +
                    language.nickRegistered + "</span></p>";
            }

            // Bot status
            if (data.isBot) {
                html += "<p class='whois'><span class='info'><br /></span><span class='data'>" +
                    language.isBotHtml + "</span></p>";
            }

            // Channels
            if (data.channels && data.channels.length > 0) {
                var chanHtml = data.channels.map(function(ch) {
                    return he(ch);
                }).join(' ');
                html += "<p class='whois'><span class='info'>" + language.channels + ":</span><span class='data'> " +
                    chanHtml + "</span></p>";
            }

            // Idle time and signon
            if (data.idleSeconds !== undefined) {
                var sec = data.idleSeconds % 60;
                var min = Math.floor(data.idleSeconds / 60) % 60;
                var hour = Math.floor(data.idleSeconds / 3600);
                html += "<p class='whois'><span class='info'>" + language.idle + "</span><span class='data'>" +
                    (hour > 0 ? hour + ' ' + language.hoursShort + ' ' : "") +
                    (min > 0 ? min + ' ' + language.minutesShort + ' ' : "") +
                    sec + ' ' + language.secondsShort + '</span></p>';
            }
            if (data.signOn) {
                html += "<p class='whois'><span class='info'>" + language.signedOn + ":</span><span class='data'>" +
                    $$.parseTime(data.signOn) + "</span></p>";
            }

            // Secure connection (TLS)
            if (data.isSecure) {
                html += "<p class='whois'><span class='info'>TLS:</span><span class='data'>" +
                    language.hasSecureConnection + "</span></p>";
            }

            // Country
            if (data.country) {
                html += "<p class='whois'><span class='info'>" + language.country + ":</span><span class='data'>" +
                    he(data.country) + "</span></p>";
            }

            // Host info (actual host/IP for IRC operators)
            if (data.hostInfo) {
                html += "<p class='whois'><span class='info'><br /></span><span class='data'>" +
                    he(data.hostInfo) + "</span></p>";
            }

            // User modes (visible to IRC operators)
            if (data.userModes) {
                html += "<p class='whois'><span class='info'><br /></span><span class='data'>" +
                    he(data.userModes) + "</span></p>";
            }

            // Display the dialog
            console.log('[WHOIS-DEBUG] html length:', html.length, 'html:', html.substring(0, 100));
            if (html) {
                console.log('[WHOIS-DEBUG] Calling displayDialog with:', 'whois', nick, language.userInformation + he(nick));
                try {
                    $$.displayDialog('whois', nick, language.userInformation + he(nick), html);
                    console.log('[WHOIS-DEBUG] displayDialog called successfully');
                } catch(e) {
                    console.error('[WHOIS-DEBUG] Error calling displayDialog:', e);
                }
            } else {
                console.log('[WHOIS-DEBUG] No HTML generated for WHOIS dialog - data was empty');
            }
        });

    }

    // Initialize display listeners on system ready
    ircEvents.on('system:ready', function() {
        exposeUIStateOnGateway();
        initDisplayListeners();
    });
})();
