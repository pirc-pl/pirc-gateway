/**
 * @fileoverview
 * This file handles all UI-related display logic, acting as the primary listener
 * for events emitted by core application logic. It decouples direct DOM manipulation
 * from event processing, ensuring a cleaner separation of concerns.
 */

(function() {
    /**
     * Initializes UI-related event listeners.
     */
    function initDisplayListeners() {
        // Listener for when the client successfully joins a channel.
        ircEvents.on('user:selfJoinedChannel', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();

            var channel = gateway.findChannel(channame); // Find the UI representation of the channel
            if (!channel) {
                // If channel doesn't exist, create its UI representation.
                // The actual Channel object in the domain should already exist.
                channel = new Channel(channame); // Channel UI constructor handles DOM creation
                gateway.channels.push(channel);
                gateway.sortChannelTabs(); // Re-sort tabs after adding new one
            } else {
                // If channel already exists, ensure it's not marked as left
                channel.left = false;
            }

            // Display the channel
            gateway.switchTab(channame);

            // Append join message
            channel.appendMessage(language.messagePatterns.joinOwn, [
                $$.niceTime(data.time),
                data.nick,
                data.ident,
                data.host,
                data.channelName
            ]);
        });

        // Listener for when another user joins a channel
        ircEvents.on('channel:userJoined', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var chan = gateway.findChannel(channame);

            if (!chan) {
                console.warn('UI: User joined channel we are not displaying:', channelName);
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
                ]);
            }
            // Trigger a refresh of the nicklist to show the new user
            chan.nicklist.update(); // Assuming this method re-renders based on current domain state
        });

        ircEvents.on('channel:chatHistoryStatsUpdated', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (!channel) return;

            var reference = data.oldestMsgid || data.oldestTimestamp;
            // var historyLimit = ('CHATHISTORY' in isupport) ? isupport['CHATHISTORY'] : 50; // isupport is global, safe for UI to check
            var historyLimit = 50; // Default fallback
            if(ircEvents.emit('domain:hasIsupport', { key: 'CHATHISTORY' })){
                historyLimit = ircEvents.emit('domain:getIsupportValue', { key: 'CHATHISTORY' });
            }

            if (reference && data.receivedMessages >= historyLimit) {
                var html = '<div class="loadOlderButton" data-reference="' + reference + '"><a href="javascript:void(0)" onclick="gateway.loadOlderHistory(\'' + he(data.channelName) + '\')">' + language.loadOlderHistory + '</a></div>';
                $('#' + data.channelId + '-window').prepend(html);
            } else if (data.receivedMessages > 0) { // Don't show "no older" if channel was empty
                var html = '<div class="noOlderHistory">' + language.noOlderHistory + '</div>';
            }
        });

        // SASL Authentication Listeners (primarily status messages)
        ircEvents.on('auth:saslAuthenticating', function(data) {
            gateway.statusWindow.appendMessage(language.SASLLogin, [$.niceTime(data.time), data.nickservNick]);
        });

        ircEvents.on('auth:saslLoginAttempt', function(data) {
            gateway.statusWindow.appendMessage(language.SASLLoginAttempt, [$.niceTime(data.time)]);
        });

        ircEvents.on('auth:saslLoggedIn', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), language.weAreLoggedInAs + data.account]);
        });

        ircEvents.on('auth:userIdentifiedViaNickserv', function() {
            $.closeDialog('nickserv', 'l');
        });

        ircEvents.on('auth:saslLoggedOut', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), data.message]);
        });

        ircEvents.on('auth:saslSuccess', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), language.SASLLoginSuccess]);
        });

        ircEvents.on('auth:saslFail', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), language.SASLLoginFail]);
        });

        ircEvents.on('auth:nickservError', function(data) {
            services.displayNickservError(language.suppliedNickPassword, language.passwordInvalidTryAgain); // This is UI service
            $('#nickserv-l .error').html(language.error + ': ' + language.passwordInvalidTryAgain);
        });

        ircEvents.on('auth:saslAborted', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), language.SASLNotLoggedIn]);
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
            gateway.iKnowIAmConnected(); // UI state update
        });

        ircEvents.on('client:disconnected', function(data) {
            gateway.disconnected(data.reason); // UI state update
        });

        ircEvents.on('client:joinChannels', function() {
            // This is called by client:processOwnChannelList in gateway_domain.js
            // But gateway.joinChannels() is removed from gateway_def.js
            // UI should not trigger this directly
            console.warn('UI should not call client:joinChannels directly');
        });

        ircEvents.on('client:myNickChanged', function(data) {
            var html = '<p>' + language.yourCurrentNickIs + ' <b>' + data.newNick + '</b></p>';
            $$.displayDialog('warning', 'warning', language.warning, html);
        });

        // Unified Error Listener
        ircEvents.on('client:errorMessage', function(data) {
            var html = '';
            var targetTab = gateway.statusWindow;
            var isDialog = false;

            // Determine target tab for message display
            if (data.channel) { // Error specific to a channel
                targetTab = gateway.findChannel(data.channel) || gateway.statusWindow;
            } else if (data.nick) { // Error specific to a nick (query)
                targetTab = gateway.findQuery(data.nick) || gateway.statusWindow;
            } else if (data.target) { // Generic target
                targetTab = gateway.findChannel(data.target) || gateway.findQuery(data.target) || gateway.statusWindow;
            }

            switch (data.type) {
                case 'noSuchNick':
                    html = '<p>' + language.noSuchNickChannel + ' <b>' + he(data.target) + '</b></p>';
                    isDialog = true;
                    break;
                case 'noSuchServer':
                    html = '<p>' + language.noSuchObject + ' <b>' + he(data.target) + '</b></p>';
                    isDialog = true;
                    break;
                case 'noSuchChannel':
                    html = '<p>' + language.noSuchChannel + ' <b>' + he(data.target) + '</b></p>';
                    isDialog = true;
                    break;
                case 'cannotSendToChan':
                    targetTab.appendMessage(language.messagePatterns.cannotSend, [$$.niceTime(), he(data.channel), data.message]);
                    break;
                case 'wasNoSuchNick':
                    html = '<p>' + language.recentVisitsForNickNotFound + ' <b>' + he(data.target) + '</b></p>';
                    isDialog = true;
                    break;
                case 'noRecipient':
                    html = '<p>' + language.cantSendMessageTo + '. ' + language.serverMessageIs + he(data.message) + '</p>'; // Generic for no recipient
                    isDialog = true;
                    break;
                case 'erroneousNickname':
                    html = '<p>' + language.nickname + ' <b>' + he(data.nick) + '</b> ' + language.isCurrentlyNotAvailable + '.</p>';
                    if (ircEvents.emit('domain:getConnectStatus') != 'disconnected') { // Check connectStatus via domain event
                        html += '<p>' + language.yourCurrentNickIs + ' <b>' + ircEvents.emit('domain:getMeUserNick') + '</b></p>'; // Get guser.nick via domain event
                    }
                    isDialog = true;
                    break;
                case 'nicknameInUse':
                    html = '<p>' + language.nickname + ' <b>' + he(data.nick) + '</b> ' + language.isAlreadyUsedBySomeone + '.</p>';
                    if (ircEvents.emit('domain:getConnectStatus') != 'disconnected') { // Check connectStatus via domain event
                        html += '<p>' + language.yourCurrentNickIs + ' <b>' + ircEvents.emit('domain:getMeUserNick') + '</b></p>'; // Get guser.nick via domain event
                    }
                    isDialog = true;
                    break;
                case 'notOnChannel':
                    html = '<p>' + language.youreNotOnChannel + ' ' + he(data.channel) + '</p>';
                    isDialog = true;
                    break;
                case 'userOnChannel':
                    html = '<p>' + he(data.nick) + ' ' + language.isAlreadyOnChannel + ' ' + he(data.channel) + '</p>';
                    isDialog = true;
                    break;
                case 'noNickChange':
                    html = '<p>' + language.cantChangeNickMessageHtml + '</p><p>' + data.message + '</p>';
                    isDialog = true;
                    break;
                case 'globalBan': // Directly handled by client:errorMessage, removed client:globalBanInfo
                    gateway.displayGlobalBanInfo(data.message);
                    break;
                case 'youWillBeBanned':
                case 'keySet':
                case 'onlyServersCanChange':
                case 'linkSet':
                case 'linkChannel':
                case 'channelIsFull':
                case 'unknownMode':
                case 'inviteOnlyChan':
                    html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.inviteRequired + '</p>'
                           +'<p>' + language.askOpersForEntry + '</p><p><a href="javascript:ircEvents.emit(\'domain:requestKnock\', { channel: \'' + he(data.channel) + '\', reason: \'' + language.entryRequest + '\', time: new Date() })">' + language.entryRequest + '</a></p>';
                    isDialog = true;
                    break;
                case 'bannedFromChan':
                    html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.youreBanned + '</p>';
                    isDialog = true;
                    break;
                case 'badChannelKey':
                    html = '<form action="javascript:ircEvents.emit(\'domain:requestChanPassword\', { channel: \'' + he(data.channel) + '\', password: $(\'#chpass\').val(), time: new Date() })"><p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.needValidPassword + '</p>'
                           +'<p><input type="password" id="chpass" /> <input type="submit" value="' + language.enter + '" /></p></form>';
                    isDialog = true;
                    break;
                case 'needReggedNick':
                    html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.registerYourNickToJoin + '</p>';
                    isDialog = true;
                    break;
                case 'banListFull':
                case 'linkFail':
                case 'cannotKnock':
                    html = '<p>' + language.cantKnock + ' ' + data.message + '</p>'; // Generic for these, may need specifics
                    isDialog = true;
                    break;
                case 'noPrivileges':
                case 'chanOpPrivsNeeded':
                    html = '<p>' + language.noAccess + ': ' + language.notEnoughPrivileges + '</p>';
                    isDialog = true;
                    break;
                case 'noNonreg':
                    html = '<p>' + language.cantSendPMTo + ' ' + he(data.target) + ': ' + language.userAcceptsPMsOnlyFromRegistered + '</p>';
                    isDialog = true;
                    break;
                case 'notForUsers':
                case 'secureOnlyChan':
                    html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.SSLRequired + '</p>';
                    isDialog = true;
                    break;
                case 'noSwear':
                case 'noOperHost':
                case 'noCtcp':
                case 'chanOwnPrivNeeded':
                    html = '<p>' + language.noAccess + ': ' + language.noPermsForAction + '</p>';
                    isDialog = true;
                    break;
                case 'tooManyJoins':
                case 'uModeUnknownFlag':
                case 'usersDontMatch':
                case 'sileListFull':
                case 'tooManyWatch':
                case 'needPong':
                case 'tooManyDcc':
                case 'disabled':
                case 'noInvite':
                case 'admOnly':
                case 'operOnly':
                case 'listSyntax':
                case 'cantSendToUser':
                    html = '<p>' + data.message + '</p>'; // Generic display for these
                    isDialog = true;
                    break;
                case 'mlockRestricted':
                    html = '<p>' + language.channel + ' ' + he(data.channel) + ' ' + data.message + '</p>';
                    isDialog = true;
                    break;
                case 'metadataKeyNotSet':
                    console.log('UI: Metadata key not set (error):', data.key, 'for', data.target);
                    // No dialog, just console for now
                    break;
                case 'metadataSyncLater':
                    console.log('UI: Metadata sync for', data.target, 'delayed by', data.delayMs, 'ms (error)');
                    // No dialog, just console for now
                    break;
                case 'cannotDoCommand':
                case 'cannotChangeChanMode':
                    html = '<p>' + language.noAccess + ': ' + data.message + '</p>'; // Generic for these command errors
                    isDialog = true;
                    break;
                case 'genericError':
                default:
                    // Fallback for unhandled errors
                    html = '<p>' + language.error + ': ' + he(data.message) + '</p>';
                    isDialog = true;
                    break;
            }

            if (isDialog && html) {
                $$.displayDialog('error', 'error', language.error, html);
            } else if (html) { // If it's HTML but not a dialog, append to status
                 targetTab.appendMessage(language.messagePatterns.errorMessage, [$$.niceTime(), html]);
            } else { // For errors that don't generate a dialog or custom HTML, just log to status window
                 targetTab.appendMessage(language.messagePatterns.errorMessage, [$$.niceTime(), language.error + ': ' + he(data.message)]);
            }
        });

        // The following client:error* and channel:error* listeners are now replaced by the unified client:errorMessage handler.
        // --- REMOVED SPECIFIC client:error* and channel:error* LISTENERS ---

        // Removed ircEvents.on('user:whoisSecure', ...); // Functionality moved to user:whoisComplete

        // ui:metadata events now handled by client:errorMessage with specific types
        // ircEvents.on('ui:metadata:keyNotSet', function(data) { ... });
        // ircEvents.on('ui:metadata:syncLater', function(data) { ... });

        ircEvents.on('ui:global:showPermError', function(data) {
            gateway.showPermError(data.text);
        });

        ircEvents.on('ui:tab:cmdNotImplemented', function(data) {
            var tab = gateway.find(data.target) || gateway.statusWindow;
            tab.appendMessage(language.messagePatterns.notImplemented, [$$.niceTime(data.time), he(data.command), data.text]);
        });
        
        // Status and Client Listeners (displaying server messages)
        // These will now often be triggered by more generic domain events or client:errorMessage
        ircEvents.on('user:modesUpdated', function(data) { // Replaced status:umodeChange
            gateway.statusWindow.appendMessage(language.messagePatterns.umode, [$$.niceTime(data.time), data.nick, data.modes]);
        });

        ircEvents.on('server:motdLine', function(data) { // Replaced status:motd
            gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(data.time), data.line]);
        });
        ircEvents.on('server:motdStart', function(data) { // New listener for motd start
            gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(data.time), data.message]); // Assuming message has info like "*** MOTD begins ***"
        });
        ircEvents.on('server:endOfMotd', function(data) { // New listener for motd end
            gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(data.time), data.message]); // Assuming message has info like "*** MOTD ends ***"
        });
        
        ircEvents.on('user:awayStatusChanged', function(data) { // Replaced status:unaway and status:nowAway
            if (data.isAway) {
                gateway.statusWindow.appendMessage(language.messagePatterns.nowAway, [$$.niceTime(data.time), data.awayMessage || '']);
            } else {
                gateway.statusWindow.appendMessage(language.messagePatterns.unaway, [$$.niceTime(data.time)]);
            }
        });

        ircEvents.on('server:channelListItem', function(data) { // Replaced status:chanListElement
            gateway.statusWindow.appendMessage(language.messagePatterns.chanListElement, [$$.niceTime(data.time), he(data.channel), he(data.visibleUsers), $$.colorize(data.topic)]);
        });

        ircEvents.on('list:smallListComplete', function(data) { // Triggered by domain
            // Sorting and HTML generation for display is pure UI.
            var lcompare = function(ch1, ch2){
                return ch2[1] - ch1[1];
            };
            data.smallListData.sort(lcompare);

            var html = '<div class="chanList"><p><a href="javascript:ircEvents.emit(\'domain:requestListChannels\', { minUsers: \'\' })">' + language.fullList + '</a> <a href="javascript:ircEvents.emit(\'domain:requestListChannels\', { minUsers: \'>9\' })">' + language.refresh + '</a></p> // Use domain events
                +"<h4>' + language.largestChannels + '</h4><table>";
            for (var i = 0; i < data.smallListData.length; i++) {
                html += '<tr><td><a href="javascript:ircEvents.emit(\'domain:requestJoinChannel\', { channelName: \'' + he(data.smallListData[i][0]) + '\', time: new Date() })">' + he(data.smallListData[i][0]) + '</a></td><td>' + data.smallListData[i][1] + '</td><td>' + $$.colorize(data.smallListData[i][2], true) + '</td></tr>';
            }
            html += '</table></div>';
            $('#chlist-body').html(html);
        });

        ircEvents.on('user:hostHidden', function(data) { // Replaced status:displayedHost
            if (data.nick === ircEvents.emit('domain:getMeUserNick')) { // Only show for current user, get nick from domain
                 gateway.statusWindow.appendMessage(language.messagePatterns.displayedHost, [$$.niceTime(data.time), data.hiddenHost]);
            }
        });
        
        // Channel Listeners
        ircEvents.on('channel:userKicked', function(data) { // Replaced channel:kicked and channel:kickedOwn
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                if (data.isSelfKicked) {
                    channel.appendMessage(language.messagePatterns.kickOwn, [$$.niceTime(data.time), he(data.byNick), he(data.channelName), $$.colorize(data.reason)]);
                    channel.markBold();
                } else {
                    channel.appendMessage(language.messagePatterns.kick, [$$.niceTime(data.time), he(data.byNick), he(data.kickedNick), he(data.channelName), $$.colorize(data.reason)]);
                }
                channel.nicklist.update(); // Re-render nicklist
            }
        });

        ircEvents.on('channel:modesUpdated', function(data) { // Replaced channel:modeChange and channel:modeDisplay
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                if (settings.get('showMode')) { // Query setting directly from DOM
                    channel.appendMessage(language.messagePatterns.mode, [$$.niceTime(data.time), he(data.byNick), data.modes + ' ' + data.modeParams.join(' ')]); // Assuming byNick from data or msg.user.nick
                }
                channel.nicklist.sort(); // Re-sort based on updated domain state
            }
        });

        ircEvents.on('channel:userParted', function(data) { // Replaced channel:userPart
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                if (!$("#showPartQuit").is(':checked')) { // Query setting directly from DOM
                    channel.appendMessage(language.messagePatterns.part, [$$.niceTime(data.time), he(data.nick), he(data.ident), he(data.host), he(data.channelName), $$.colorize(data.partMessage)]);
                }
                channel.nicklist.update(); // Re-render nicklist
            }
        });

        ircEvents.on('user:selfPartedChannel', function(data) {
            gateway.removeChannelTab(data.channelName); // UI-only function to remove the tab
        });

        ircEvents.on('channel:topicChanged', function(data) { // Replaced channel:topicUpdated and channel:topicCleared
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.updateTopicDisplay(data.topic); // Assuming this is a UI-only update
                channel.appendMessage(language.messagePatterns.topic, [$$.niceTime(data.time), he(data.setBy), he(data.channelName)]);
            }
        });
        
        ircEvents.on('channel:creationTimeUpdated', function(data) { // Replaced channel:creationTime
            var tab = gateway.findChannel(data.channelName) || gateway.statusWindow;
            if (tab) {
                var date = new Date(data.creationTime * 1000);
                tab.appendMessage(language.messagePatterns.creationTime, [$$.niceTime(data.time), he(data.channelName), date.toLocaleString()]);
            }
        });

        ircEvents.on('channel:topic', function(data) { // Replaced channel:topicDisplay
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.updateTopicDisplay(data.topic); // UI-only update
            }
        });
        
        ircEvents.on('channel:topicInfoUpdated', function(data) { // Replaced channel:topicSetBy
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                var date = new Date(data.setDate * 1000);
                channel.appendMessage(language.messagePatterns.topicSetBy, [$$.niceTime(data.time), date.toLocaleString(), he(data.setBy)]);
            }
        });

        ircEvents.on('client:invited', function(data) { // Replaced channel:yourInvite and server:invite
            var tab = gateway.findChannel(data.channelName) || gateway.statusWindow;
            if (tab) {
                tab.appendMessage(language.messagePatterns.yourInvite, [$$.niceTime(data.time), he(data.targetNick), he(data.channelName)]);
            }
            var html = '<p>' + he(data.byNick) + ' ' + language.invitesYouTo + ' <a href="javascript:ircEvents.emit(\'domain:requestJoinChannel\', { channelName: \'' + he(data.channelName) + '\', time: new Date() })">' + he(data.channelName) + '</a></p>'; // Use domain event
            $$.displayDialog('info', 'invite', language.invitation, html);
        });

        ircEvents.on('channel:endOfNamesList', function(data) { // Replaced channel:endOfNames
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.nicklist.sort(); // This is a UI-specific sorting of the displayed nicklist
            }
        });

        // channel:noPerms is now handled by client:errorMessage
        
        // Query Listeners
        ircEvents.on('user:awayStatusChanged', function(data) { // Replaced query:awayStatus
            // Check if this user is active in a query window
            var query = gateway.findQuery(data.nick);
            if (query) {
                if (data.isAway) {
                    query.appendMessage(language.messagePatterns.away, [$$.niceTime(data.time), he(data.nick), $$.colorize(data.awayMessage)]);
                } else {
                    // Optionally, display a "no longer away" message
                }
            }
        });

        // query:cannotSend is now handled by client:errorMessage
        
        // User Listeners
        // user:myNickChanged already exists, refactored above.
        ircEvents.on('user:selfQuit', function(data) {
            if (data.channels) {
                data.channels.forEach(function(channelData) {
                    var chan = gateway.findChannel(channelData.name);
                    if (chan) {
                        gateway.removeChannelTab(channelData.name); // UI-only removal
                    }
                });
            }
        });

        ircEvents.on('user:otherQuit', function(data) {
            if (data.user) { // data.user should be the user object
                var query = gateway.findQuery(data.user.nick);
                if (query) {
                    if (!$("#showPartQuit").is(':checked')) {
                        query.appendMessage(language.messagePatterns.quit, [$$.niceTime(data.time), he(data.user.nick), he(data.user.ident), he(data.user.host), $$.colorize(data.quitMessage)]);
                    }
                }
                // Loop through affected channels and update their nicklists in UI
                for (var c in gateway.channels) {
                    if (gateway.channels[c].nicklist.findNick(data.user.nick)) {
                        if (!$("#showPartQuit").is(':checked')) {
                            gateway.channels[c].appendMessage(language.messagePatterns.quit, [$$.niceTime(data.time), he(data.user.nick), he(data.user.ident), he(data.user.host), $$.colorize(data.quitMessage)]);
                        }
                        gateway.channels[c].nicklist.update(); // Trigger nicklist UI update
                    }
                }
            }
        });

        ircEvents.on('user:avatarChanged', function() { // Triggered by metadata:updated for avatar
            if(settings.get('avatar')){ // Check setting directly in display layer
                disp.avatarChanged(); // Pure UI function
            }
        });

        // dialog:error now handled by client:errorMessage
        
        ircEvents.on('user:whoisComplete', function(data) { // Triggered by domain
            var whoisData = data.data; // Expecting pre-processed data from domain
            var nick = data.nick;
            var whoisHtml = '';

            if (whoisData.isWhowas) {
                whoisHtml += '<h2>' + language.previousVisitsBy + ' ' + he(nick) + '</h2>';
            } else {
                whoisHtml += '<h2>' + language.userInformation + '</h2>';
            }

            // User Info
            if (whoisData.nick && whoisData.ident && whoisData.host) {
                whoisHtml += '<p><b>' + language.fullMask + ':</b> ' + he(whoisData.nick + '!' + whoisData.ident + '@' + whoisData.host) + '</p>';
            }
            if (whoisData.realname) {
                whoisHtml += '<p><b>' + language.realname + ':</b> ' + $$.colorize(whoisData.realname) + '</p>';
            }
            if (whoisData.account) {
                whoisHtml += '<p><b>' + language.accountName + ':</b> ' + he(whoisData.account) + '</p>';
            }
            if (whoisData.isBot) {
                whoisHtml += '<p>' + language.isBotHtml + '</p>';
            }
            if (whoisData.isSecure) {
                whoisHtml += '<p>' + language.hasSecureConnection + '</p>';
            }
            // Away status from WHOIS data
            if (whoisData.isAway && whoisData.awayMessage) {
                whoisHtml += '<p><b>' + he(whoisData.nick) + ' ' + language.isNotPresent + ':</b> ' + $$.colorize(whoisData.awayMessage) + '</p>';
            }

            // Server Info
            if (whoisData.server) {
                var serverText = whoisData.serverInfo ? ` (${$$.colorize(whoisData.serverInfo)})` : '';
                whoisHtml += '<p><b>' + (whoisData.isWhowas ? language.seen : language.server) + ':</b> ' + he(whoisData.server) + serverText + '</p>';
            }

            // Idle Time
            if (whoisData.idleTime && whoisData.signedOn) {
                var idle = parseInt(whoisData.idleTime);
                var signedOn = parseInt(whoisData.signedOn);
                var idleString = '';
                if (idle > 3600) {
                    idleString = Math.floor(idle / 3600) + language.hoursShort;
                    idle = idle % 3600;
                }
                if (idle > 60) {
                    idleString += ' ' + Math.floor(idle / 60) + language.minutesShort;
                    idle = idle % 60;
                }
                idleString += ' ' + idle + language.secondsShort;
                var date = new Date(signedOn * 1000);
                whoisHtml += '<p><b>' + language.signedOn + ':</b> ' + date.toLocaleString() + ', <b>' + language.idle + ':</b> ' + idleString + '</p>';
            }

            // Operator Info
            if (whoisData.operatorInfo) {
                var opText = (whoisData.operatorInfo.match(/is a Network Service/)) ? language.networkService : language.ircop;
                whoisHtml += '<p><b>' + opText + '</b></p>';
            }
            
            // Special Info (Country/Location)
            if (whoisData.countryName || whoisData.specialInfo) {
                let locationString = whoisData.locationText || whoisData.specialInfo;
                if (locationString) {
                    whoisHtml += '<p><b>' + language.isConnectingFrom + ' ' + he(locationString) + '</b>';
                    if (whoisData.countryCode) {
                        whoisHtml += ` <img src="/styles/img/flags/${whoisData.countryCode.toLowerCase()}.png" title="${whoisData.countryName}" alt="${whoisData.countryName}" />`;
                    }
                    whoisHtml += '</p>';
                }
            }

            // Channels
            if (whoisData.channels && whoisData.channels.length > 0) {
                var chanlist = '<p><b>' + language.channels + ':</b> ';
                for (var i = 0; i < whoisData.channels.length; i++) {
                    var chan = whoisData.channels[i].replace(/[~&@%+]/, '');
                    chanlist += ` <a href="javascript:ircEvents.emit('domain:requestJoinChannel', { channelName: \'' + he(chan) + '\', time: new Date() })" title="' + language.joinChannel + ' ' + he(chan) + '">' + he(whoisData.channels[i]) + '</a>`; // Use domain event
                }
                whoisHtml += chanlist + '</p>';
            }

            $$.displayDialog('whois', nick, whoisData.isWhowas ? language.previousVisitsBy + ' ' + he(nick) : language.userInformation, whoisHtml);
        });
        
        // Removed ircEvents.on('user:whoisAwayStatus', ...); as it's handled by user:whoisComplete

        // Removed ircEvents.on('channel:namesReplyManual', ...); and ircEvents.on('channel:namesReplyAuto', ...);
        ircEvents.on('channel:namesListComplete', function(data) { // New listener for consolidated names data
            var channel = gateway.findChannel(data.channelName);
            if (!channel) {
                console.warn('UI: Received names list for unknown channel:', data.channelName);
                return;
            }

            // Update nicklist for currently active channel, or if it's a manual request
            if (gateway.currentActiveTab === channel.id || data.isManualRequest) {
                var html = '<table><tr><th></th><th>Nick</th><th>ident@host</th></tr>';
                data.users.forEach(function(user) { // data.users is expected to be an array of processed user objects
                    html += '<tr><td>';
                    if (user.modes) {
                        for(var i=0; i<user.modes.length; i++) html += user.modes[i];
                    }
                    html += '</td><td><b>'+he(user.nick)+'</b></td><td>';
                    if(user.ident && user.host){
                        html += he(user.ident)+'@'+he(user.host);
                    }
                    html += '</td></tr>';
                });
                html += '</table>';

                // If it was a manual /NAMES request, display in a dialog
                if (data.isManualRequest) {
                    $$.displayDialog('names', data.channelName, language.nickListFor + he(data.channelName), html);
                } else {
                    // Otherwise, update the existing nicklist in the sidebar
                    // This assumes channel.nicklist.updateHtml(html) exists or similar
                    channel.nicklist.updateHtml(html); // Assuming method to directly update HTML
                }
            }
            channel.nicklist.sort(); // Always sort the visual nicklist after a names update
        });

        // Removed channel:badKey, now handled by client:errorMessage

        // List Listeners
        ircEvents.on('server:channelListItem', function(data) { // Replaced list:channelEntry
            // This is from a /LIST command, not a regular message.
            // data.isListWindow will determine if it goes to a dedicated list window or status
            if (data.isListWindow && gateway.listWindow) {
                gateway.listWindow.addEntry(data.channel, data.visibleUsers, data.topic); // data.users renamed to visibleUsers
            } else { // Fallback to status window display
                gateway.statusWindow.appendMessage(language.messagePatterns.chanListElement, [$$.niceTime(data.time), he(data.channel), he(data.visibleUsers), $$.colorize(data.topic)]);
            }
        });

        ircEvents.on('server:endOfList', function(data) { // Replaced list:endList
            if (gateway.listWindow && gateway.listWindow.name === data.listWindowName) { // Assuming listWindowName is passed
                gateway.listWindow.render();
            }
        });

        ircEvents.on('list:listWindowEnded', function(data) {
            if (gateway.listWindow && gateway.listWindow.name === data.listName) {
                gateway.listWindow = null; // Clear reference to closed UI window
            }
        });

        ircEvents.on('channel:banListEntry', function(data) { // Replaced list:insertEntry (banList)
            var chan = gateway.findChannel(data.channelName);
            if (chan) {
                var date = new Date(data.setAt * 1000);
                chan.appendMessage(language.messagePatterns.listElement, [$$.niceTime(), 'b', he(data.channelName), he(data.banmask), he(data.setBy), date.toLocaleString()]);
            }
        });
        ircEvents.on('channel:exceptListEntry', function(data) { // Replaced list:insertEntry (exceptList)
            var chan = gateway.findChannel(data.channelName);
            if (chan) {
                var date = new Date(data.setDate * 1000);
                chan.appendMessage(language.messagePatterns.listElement, [$$.niceTime(), 'e', he(data.channelName), he(data.exceptionMask), he(data.setBy), date.toLocaleString()]);
            }
        });
        ircEvents.on('channel:inviteListEntry', function(data) { // Replaced list:insertEntry (inviteList)
            var chan = gateway.findChannel(data.channelName);
            if (chan) {
                var date = new Date(data.setDate * 1000);
                chan.appendMessage(language.messagePatterns.listElement, [$$.niceTime(), 'I', he(data.channelName), he(data.usermask), he(data.setBy), date.toLocaleString()]);
            }
        });

        ircEvents.on('channel:endOfBanList', function(data) { // Replaced list:endListbeI (banList)
            var chan = gateway.findChannel(data.channelName);
            if (chan) {
                chan.appendMessage(language.messagePatterns.endofList, [$$.niceTime(), 'b', he(data.channelName)]);
            }
        });
        ircEvents.on('channel:endOfExceptList', function(data) { // Replaced list:endListbeI (exceptList)
            var chan = gateway.findChannel(data.channelName);
            if (chan) {
                chan.appendMessage(language.messagePatterns.endofList, [$$.niceTime(), 'e', he(data.channelName)]);
            }
        });
        ircEvents.on('channel:endOfInviteList', function(data) { // Replaced list:endListbeI (inviteList)
            var chan = gateway.findChannel(data.channelName);
            if (chan) {
                chan.appendMessage(language.messagePatterns.endofList, [$$.niceTime(), 'I', he(data.channelName)]);
            }
        });
        
        // CTCP Listeners
        ircEvents.on('ctcp:reply', function(data) {
            var tab = (data.targetType === 'query') ? gateway.findQuery(data.target) : gateway.statusWindow;
            if (tab) {
                tab.appendMessage(language.messagePatterns.ctcp, [$$.niceTime(data.time), he(data.senderNick), $$.colorize(data.ctcpText)]);
            }
        });
        
        // Server Listeners
        ircEvents.on('server:invite', function(data) { // Triggered by client:invited
            var html = '<p>' + he(data.byNick) + ' ' + language.invitesYouTo + ' <a href="javascript:ircEvents.emit(\'domain:requestJoinChannel\', { channelName: \'' + he(data.channelName) + '\', time: new Date() })">' + he(data.channelName) + '</a></p>'; // Use domain event
            $$.displayDialog('info', 'invite', language.invitation, html);
        });
    }

    // Expose public methods or initialize
    window.gatewayDisplay = {
        init: initDisplayListeners
    };
})();