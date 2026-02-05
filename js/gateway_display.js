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
                channel = new ChannelTab(channame); // Channel UI constructor handles DOM creation
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
            // This is a full re-render, will need to be granular once Nicklist is granular.
            chan.nicklist.updateUserDisplay(ircEvents.emit('domain:getUser', { nick: data.nick }), 'joined'); 
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
                var html = '<div class="loadOlderButton" data-reference="' + reference + '"><a href="javascript:void(0)" onclick="gateway.loadOlderHistory(\'` + he(data.channelName) + `\')">' + language.loadOlderHistory + '</a></div>';
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
                gateway.channels[c].appendMessage(language.messagePatterns.error, [$$.niceTime(), data.reason]); // UI action
            }
        });

        ircEvents.on('ui:statusWindowMessage', function(data) {
            // Add message to status window
            gateway.statusWindow.appendMessage(language.messagePatterns.error, [$$.niceTime(), data.reason]); // UI action
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

        // New listeners for domain user events
        ircEvents.on('domain:userUpdated', function(data) {
            var user = data.user;
            var updatedField = data.updatedField;
            for (var c in gateway.channels) {
                var channel = gateway.channels[c];
                // Check if the user is in this channel's nicklist
                if (channel.nicklist.findUser(user)) {
                    channel.nicklist.updateUserDisplay(user, updatedField);
                }
            }
            // Queries don't have a nicklist, so no direct update needed here for simple user property changes
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

            // Append nick change message to relevant channels and update nicklists
            for(var c in gateway.channels) {
                var channel = gateway.channels[c];
                // Check if the user is in this channel's nicklist
                if (channel.nicklist.findUser(user)) { // Find by stable user object
                    // Only show message if it's not our own nick, and setting allows
                    if (user.id !== guser.me.id && !$('#showNickChanges').is(':checked')){ // Compare stable user.id
                        channel.appendMessage(language.messagePatterns.nickChange, [$$.niceTime(time), he(oldNick), he(newNick)]);
                    }
                    channel.nicklist.handleNickChange(oldNick, newNick, user);
                }
            }
        });

        // Unified Error Listener
