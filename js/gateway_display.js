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

            var channel = gateway.findChannel(channame);
            if (!channel) {
                // If channel doesn't exist, create it (Channel constructor handles DOM)
                channel = new Channel(channame);
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
                // This shouldn't happen if our own join handler is correct,
                // but as a safeguard, if we don't have the channel tab, we can't display user join.
                console.warn('User joined channel we are not on:', channelName);
                return;
            }

            // Update user properties
            // The user object is passed directly now instead of relying on msg.user
            var user = users.getUser(data.nick); // Ensure we're working with the global user object
            user.setIdent(data.ident);
            user.setHost(data.host);
            if ('extended-join' in activeCaps) {
                if (data.accountArg != '*') {
                    user.setAccount(data.accountArg);
                } else {
                    user.setRegistered(false);
                }
                user.setRealname(data.realnameText);
            }
            
            // Add user to nicklist
            var nicklistUser = chan.nicklist.addUser(user);
            // Default modes for new users (these were previously set in cmd_binds)
            nicklistUser.setMode('owner', false);
            nicklistUser.setMode('admin', false);
            nicklistUser.setMode('op', false);
            nicklistUser.setMode('halfop', false);
            nicklistUser.setMode('voice', false);

            if (!$('#showPartQuit').is(':checked')) {
                chan.appendMessage(language.messagePatterns.join, [
                    $$.niceTime(data.time),
                    he(data.nick),
                    he(data.ident),
                    he(data.host),
                    channelName
                ]);
            }
            
        });

        ircEvents.on('channel:chatHistoryStatsUpdated', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (!channel) return;

            var reference = data.oldestMsgid || data.oldestTimestamp;
            var historyLimit = ('CHATHISTORY' in isupport) ? isupport['CHATHISTORY'] : 50;

            if (reference && data.receivedMessages >= historyLimit) {
                var html = '<div class="loadOlderButton" data-reference="' + reference + '"><a href="javascript:void(0)" onclick="gateway.loadOlderHistory(\'' + he(data.channelName) + '\')">' + language.loadOlderHistory + '</a></div>';
                $('#' + data.channelId + '-window').prepend(html);
            } else if (data.receivedMessages > 0) { // Don't show "no older" if channel was empty
                var html = '<div class="noOlderHistory">' + language.noOlderHistory + '</div>';
            }
        });

        // SASL Authentication Listeners
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
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), data.text]);
        });

        ircEvents.on('auth:saslSuccess', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), language.SASLLoginSuccess]);
        });

        ircEvents.on('auth:saslFail', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), language.SASLLoginFail]);
        });

        ircEvents.on('auth:nickservError', function(data) {
            services.displayNickservError(language.suppliedNickPassword, language.passwordInvalidTryAgain);
            $('#nickserv-l .error').html(language.error + ': ' + language.passwordInvalidTryAgain);
        });

        ircEvents.on('auth:saslAborted', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$.niceTime(data.time), language.SASLNotLoggedIn]);
        });



        // Global and Dialog Listeners
        ircEvents.on('client:canSetAvatar', function() {
            $('#set-avatar-button').show(); // Or similar logic
        });

        ircEvents.on('client:globalBanInfo', function(data) {
            gateway.displayGlobalBanInfo(data.text);
        });

        ircEvents.on('client:reconnectNeeded', function() {
            $$.displayReconnect();
        });



        ircEvents.on('client:error', function(data) {

        });

        ircEvents.on('user:whoisSecure', function(data) {
            var whois = gateway.whois.apList(language.hasSecureConnection);
            $$.displayDialog('whois', data.nick, language.userInformation, whois);
        });

        ircEvents.on('ui:metadata:keyNotSet', function(data) {
            // Placeholder for potential UI feedback
            console.log('Metadata key not set:', data.key, 'for', data.target);
        });

        ircEvents.on('ui:metadata:syncLater', function(data) {
            // Placeholder for potential UI feedback
            console.log('Metadata sync for', data.target, 'delayed by', data.delay, 'ms');
        });

        ircEvents.on('ui:global:showPermError', function(data) {
            gateway.showPermError(data.text);
        });

        ircEvents.on('ui:tab:cmdNotImplemented', function(data) {
            var tab = gateway.find(data.target) || gateway.statusWindow;
            tab.appendMessage(language.messagePatterns.notImplemented, [$$.niceTime(data.time), he(data.command), data.text]);
        });
        
        // Status and Client Listeners
        ircEvents.on('status:umodeChange', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.umode, [$$.niceTime(data.time), data.nick, data.umodeString]);
        });

        ircEvents.on('status:motd', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(data.time), data.message]);
        });
        
        ircEvents.on('status:unaway', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.unaway, [$$.niceTime(data.time)]);
        });

        ircEvents.on('status:nowAway', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.nowAway, [$$.niceTime(data.time)]);
        });

        ircEvents.on('status:chanListElement', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.chanListElement, [$$.niceTime(data.time), he(data.channel), he(data.users), $$.colorize(data.topic)]);
        });

        ircEvents.on('list:smallListComplete', function(data) {
            // Sort data here as it's a UI-specific presentation concern
            var lcompare = function(ch1, ch2){
                return ch2[1] - ch1[1];
            };
            data.smallListData.sort(lcompare);

            var html = '<div class="chanList"><p><a href="javascript:ircCommand.listChannels()">' + language.fullList + '</a> <a href="javascript:gateway.refreshChanList()">' + language.refresh + '</a></p>' +
                '<h4>' + language.largestChannels + '</h4><table>';
            for (var i = 0; i < data.smallListData.length; i++) {
                html += '<tr><td><a href="javascript:ircCommand.channelJoin(\'' + he(data.smallListData[i][0]) + '\')">' + he(data.smallListData[i][0]) + '</a></td><td>' + data.smallListData[i][1] + '</td><td>' + $$.colorize(data.smallListData[i][2], true) + '</td></tr>';
            }
            html += '</table></div>';
            $('#chlist-body').html(html);
        });



        ircEvents.on('status:displayedHost', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.displayedHost, [$$.niceTime(data.time), data.host]);
        });

        ircEvents.on('status:noSuchNick', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.noSuchNick, [$$.niceTime(data.time), data.nick]);
        });

        ircEvents.on('status:noSuchChannel', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.noSuchChannel, [$$.niceTime(data.time), data.channel]);
        });
        
        ircEvents.on('status:cannotSend', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.cannotSend, [$$.niceTime(data.time), data.channel, data.reason]);
        });

        ircEvents.on('status:whowasNoSuchNick', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.whowasNoSuchNick, [$$.niceTime(data.time), data.nick]);
        });
        
        ircEvents.on('status:badNick', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.badNick, [$$.niceTime(data.time), data.nick]);
        });
        
        ircEvents.on('status:nickInUse', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.nickInUse, [$$.niceTime(data.time), data.nick]);
        });

        ircEvents.on('status:notOnChannel', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.notOnChannel, [$$.niceTime(data.time), data.channel]);
        });

        ircEvents.on('status:userOnChannel', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.userOnChannel, [$$.niceTime(data.time), data.user, data.channel]);
        });

        ircEvents.on('status:invalidMode', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.invalidMode, [$$.niceTime(data.time), data.mode]);
        });

        ircEvents.on('status:cannotJoin', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(data.time), data.channel, data.reason]);
        });

        ircEvents.on('status:cannotKnock', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.cannotKnock, [$$.niceTime(data.time), data.serverMessage]);
        });

        // Client Listeners
        ircEvents.on('client:connected', function() {
            gateway.iKnowIAmConnected();
        });

        ircEvents.on('client:disconnected', function(data) {
            gateway.disconnected(data.reason);
        });

        ircEvents.on('client:joinChannels', function() {
            gateway.joinChannels();
        });

        ircEvents.on('client:setNick', function(data) {
            if (data.silent) {
                guser.nick = data.newNick;
            } else {
                guser.changeNick(data.newNick);
            }
        });
        
        // Channel Listeners
        ircEvents.on('channel:kicked', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.nicklist.removeNick(data.kickedNick);
                channel.appendMessage(language.messagePatterns.kick, [$$.niceTime(data.time), he(data.kicker.nick), he(data.kickedNick), he(data.channelName), $$.colorize(data.kickReason)]);
            }
        });

        ircEvents.on('channel:kickedOwn', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.part();
                channel.appendMessage(language.messagePatterns.kickOwn, [$$.niceTime(data.time), he(data.kicker.nick), he(data.channelName), $$.colorize(data.kickReason)]);
                channel.markBold();
            }
        });

        ircEvents.on('channel:modeChange', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                if ($('#showMode').is(':checked')) { // Query setting directly from DOM
                    channel.appendMessage(language.messagePatterns.mode, [$$.niceTime(data.time), he(data.senderNick), data.modeInfo]);
                }
                channel.nicklist.sort();
            }
        });

        ircEvents.on('channel:userPart', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.nicklist.removeNick(data.senderNick);
                if (!$('#showPartQuit').is(':checked')) { // Query setting directly from DOM
                    channel.appendMessage(language.messagePatterns.part, [$$.niceTime(data.time), he(data.senderNick), he(data.senderIdent), he(data.senderHost), he(data.channelName), $$.colorize(data.partMessage)]);
                }
            }
        });

        ircEvents.on('channel:selfPart', function(data) {
            gateway.removeChannel(data.channel.name); // Use data.channel.name
        });

        ircEvents.on('channel:topicUpdated', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.setTopic(data.newTopic);
                channel.appendMessage(language.messagePatterns.topic, [$$.niceTime(data.time), he(data.sender.nick), he(data.channelName)]);
            }
        });
        
        ircEvents.on('channel:topicCleared', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                channel.setTopic('');
                channel.appendMessage(language.messagePatterns.topicClear, [$$.niceTime(data.time), he(data.sender.nick), he(data.channelName)]);
            }
        });

        ircEvents.on('channel:modeDisplay', function(data) {
            var tab = data.channel ? gateway.findChannel(data.channelName) : gateway.statusWindow; // Determine targetType from data.channel
            if (tab) {
                if ($('#showMode').is(':checked')) { // Query setting directly from DOM
                    tab.appendMessage(language.messagePatterns.modeIs, [$$.niceTime(data.time), he(data.channelName), data.modeInfo]);
                }
            }
        });
        
        ircEvents.on('channel:creationTime', function(data) {
            var tab = data.channel ? gateway.findChannel(data.channelName) : gateway.statusWindow; // Determine targetType from data.channel
            if (tab) {
                var date = new Date(data.creationTime * 1000);
                tab.appendMessage(language.messagePatterns.creationTime, [$$.niceTime(data.messageTime), he(data.channelName), date.toLocaleString()]);
            }
        });

        ircEvents.on('channel:topicDisplay', function(data) {
            if (data.channel) { // Check if channel object was passed
                var channel = gateway.findChannel(data.channelName); // Still need to find it here, as data.channel is the object passed from cmd_binds, not necessarily the UI channel object
                channel.setTopic(data.topic);
            }
        });
        
        ircEvents.on('channel:topicSetBy', function(data) {
            var channel = gateway.findChannel(data.channelName);
            if (channel) {
                var date = new Date(data.setTime * 1000);
                channel.appendMessage(language.messagePatterns.topicSetBy, [$$.niceTime(data.messageTime), date.toLocaleString(), he(data.setterNick)]);
            }
        });

        ircEvents.on('channel:yourInvite', function(data) {
            var tab = data.channel ? gateway.findChannel(data.channelName) : gateway.statusWindow; // Determine targetType from data.channel
            if (tab) {
                tab.appendMessage(language.messagePatterns.yourInvite, [$$.niceTime(data.time), he(data.invitedNick), he(data.channelName)]);
            }
        });

        ircEvents.on('channel:endOfNames', function(data) {
            var channel = data.channel; // Use data.channel directly
            if (channel) {
                channel.nicklist.sort();
            }
        });



        ircEvents.on('channel:noPerms', function(data) {
            var channel = gateway.findChannel(data.channel);
            if (channel) {
                channel.appendMessage(language.messagePatterns.noPerms, [$$.niceTime(data.time)]);
            }
        });
        
        // Query Listeners
        ircEvents.on('query:awayStatus', function(data) {
            var query = gateway.findQuery(data.queryNick);
            if (query) {
                query.appendMessage(language.messagePatterns.away, [$$.niceTime(data.time), he(data.queryNick), $$.colorize(data.awayMessage)]);
            }
        });

        ircEvents.on('query:cannotSend', function(data) {
            var query = gateway.findQuery(data.queryNick);
            if (query) {
                query.appendMessage(language.messagePatterns.cannotSend, [$$.niceTime(data.time), he(data.queryNick), data.reason]);
            }
        });
        
        // User Listeners
        ircEvents.on('user:myNickChanged', function(data) {
            var html = '<p>' + language.yourCurrentNickIs + ' <b>' + data.newNick + '</b></p>';
            $$.displayDialog('warning', 'warning', language.warning, html);
        });

        ircEvents.on('user:selfQuit', function(data) {
            for (var i = 0; i < data.channels.length; i++) {
                var chan = gateway.findChannel(data.channels[i].name); // Access channel name
                if (chan) {
                    chan.part();
                }
            }
        });

        ircEvents.on('user:otherQuit', function(data) {
            var query = gateway.findQuery(data.user.nick);
            if (query) {
                if (!$('#showPartQuit').is(':checked')) {
                    query.appendMessage(language.messagePatterns.quit, [$$.niceTime(data.time), he(data.user.nick), he(data.user.ident), he(data.user.host), $$.colorize(data.quitMessage)]);
                }
            }
            for (c in gateway.channels) {
                if (gateway.channels[c].nicklist.findNick(data.user.nick)) {
                    gateway.channels[c].nicklist.removeNick(data.user.nick);
                    if (!$('#showPartQuit').is(':checked')) {
                        gateway.channels[c].appendMessage(language.messagePatterns.quit, [$$.niceTime(data.time), he(data.user.nick), he(data.user.ident), he(data.user.host), $$.colorize(data.quitMessage)]);
                    }
                }
            }
        });

        ircEvents.on('user:avatarChanged', function() {
            if(textSettingsValues['avatar']){ // Check setting directly in display layer
                disp.avatarChanged();
            }
        });

        // Dialog Listeners
        ircEvents.on('dialog:error', function(data) {
            var html = '';
            switch (data.type) {


















                case 'cannotSendToUserSpecific':
                    html = '<p>' + data.language.cantSendPMTo + ' ' + he(data.targetNick) + ': ' + data.language.userAcceptsPMsOnlyFromRegistered + '</p>';
                    $$.displayDialog('error', 'error', data.language.error, html);
                    break;

            }
        });

        ircEvents.on('client:errorNoSuchNick', function(data) {
            var html = '<p>' + language.noSuchNickChannel + ' <b>' + he(data.nick) + '</b></p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('client:errorNoSuchObject', function(data) {
            var html = '<p>' + language.noSuchObject + ' <b>' + he(data.object) + '</b></p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorNoSuchChannel', function(data) {
            var html = '<p>' + language.noSuchChannel + ' <b>' + he(data.channel) + '</b></p>';
            $$.displayDialog('error', 'error', language.error, html);
        });



        ircEvents.on('client:errorCannotSendToUnknown', function(data) {
            var html = '<p>' + language.cantSendMessageTo + ' ' + he(data.target) + '. ' + language.serverMessageIs + he(data.text) + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('client:errorWhowasNoSuchNick', function(data) {
            var html = '<p>' + language.recentVisitsForNickNotFound + ' <b>' + he(data.nick) + '</b></p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorNotOnChannel', function(data) {
            var html = '<p>' + language.youreNotOnChannel + ' ' + he(data.channel) + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorUserOnChannel', function(data) {
            var html = '<p>' + he(data.user) + ' ' + language.isAlreadyOnChannel + ' ' + he(data.channel) + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('client:errorCannotChangeNick', function(data) {
            var html = '<p>' + language.cantChangeNickMessageHtml + '</p><p>' + data.text + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorInvalidMode', function(data) {
            var html = '<p>' + language.invalidMode + ' ' + he(data.mode) + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorBannedFromChannel', function(data) {
            var html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.youreBanned + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorNeedRegisteredNick', function(data) {
            var html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.registerYourNickToJoin + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorCannotKnock', function(data) {
            var html = '<p>' + language.cantKnock + ' ' + data.text + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorChanOpPrivsNeeded', function(data) {
            var html = '<p>' + language.noAccess + ': ' + language.notEnoughPrivileges + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('client:errorNononregSpecific', function(data) {
            var html = '<p>' + language.cantSendPMTo + ' ' + he(data.targetNick) + ': ' + language.userAcceptsPMsOnlyFromRegistered + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('client:errorNononregGeneric', function(data) {
            var html = '<p>' + language.cantSendPM + ' ' + data.text + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorSecureOnlyChannel', function(data) {
            var html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.SSLRequired + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:errorChanOwnPrivNeeded', function(data) {
            var html = '<p>' + language.noAccess + ': ' + language.noPermsForAction + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('client:errorCannotSendToUserGeneric', function(data) {
            var html = '<p>' + language.cantSendPM + ' ' + data.text + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('channel:sendFailed', function(data) {
            var tab;
            if (data.isExistingChannel) {
                tab = gateway.findChannel(data.channelName);
            } else {
                tab = gateway.statusWindow;
            }

            if (tab) {
                tab.appendMessage(language.messagePatterns.cannotSend, [$$.niceTime(data.time), he(data.channelName), data.reason]);
            }
        });

        ircEvents.on('client:errorCannotSendToUserGeneric', function(data) {
            var html = '<p>' + language.cantSendPM + ' ' + data.text + '</p>';
            $$.displayDialog('error', 'error', language.error, html);
        });

        ircEvents.on('user:whoisComplete', function(data) {
            var whoisData = data.data;
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

            // Server Info
            if (whoisData.server) {
                var serverText = whoisData.serverInfo ? ` (${$$.colorize(whoisData.serverInfo)})` : '';
                whoisHtml += '<p><b>' + (whoisData.whowasExpect312 ? language.seen : language.server) + ':</b> ' + he(whoisData.server) + serverText + '</p>';
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
                    chanlist += ` <a href="javascript:ircCommand.channelJoin('${he(chan)}')" title="${language.joinChannel} ${he(chan)}">${he(whoisData.channels[i])}</a>`;
                }
                whoisHtml += chanlist + '</p>';
            }

            $$.displayDialog('whois', nick, whoisData.isWhowas ? language.previousVisitsBy + ' ' + he(nick) : language.userInformation, whoisHtml);
        });


        
        ircEvents.on('user:whoisAwayStatus', function(data) {
            var whois = gateway.whois.apList(he(data.nick) + ' ' + language.isNotPresent + ' (' + $$.colorize(data.awayMessage) + ')');
            $$.displayDialog('whois', data.nick, language.notPresent, whois);
        });

        ircEvents.on('client:nickInvalid', function(data) {
            var html = '<p>' + language.nickname + ' <b>' + he(data.nick) + '</b> ' + language.isCurrentlyNotAvailable + '.</p>';
            if (gateway.connectStatus != 'disconnected') { // Check connection status directly
                html += '<p>' + language.yourCurrentNickIs + ' <b>' + guser.nick + '</b></p>';
            }
            $$.displayDialog('warning', 'warning', language.warning, html);
        });

        ircEvents.on('client:nickInUse', function(data) {
            var html = '<p>' + language.nickname + ' <b>' + he(data.nick) + '</b> ' + language.isAlreadyUsedBySomeone + '.</p>';
            if (gateway.connectStatus != 'disconnected') { // Check connection status directly
                html += '<p>' + language.yourCurrentNickIs + ' <b>' + guser.nick + '</b></p>';
            }
            $$.displayDialog('warning', 'warning', language.warning, html);
        });

        ircEvents.on('channel:inviteOnly', function(data) {
            var html = '<p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.inviteRequired + '</p>' +
                '<p>' + language.askOpersForEntry + '</p><p><a href="javascript:ircCommand.knock(\'' + he(data.channel) + '\', \'' + language.entryRequest + '\')">' + language.entryRequest + '</a></p>';
            $$.displayDialog('warning', 'warning', language.warning, html);
        });



        ircEvents.on('channel:namesReplyManual', function(data) {
            var html = '<table><tr><th></th><th>Nick</th><th>ident@host</th></tr>';
            for(userId in data.users){
                var user = data.users[userId];
                html += '<tr><td>';
                for(var i=0; i<user.flags.length; i++) html += user.flags[i];
                html += '</td><td><b>'+user.nick+'</b></td><td>';
                if(user.ident && user.host){
                    html += user.ident+'@'+user.host;
                }
                html += '</td></tr>';
            }
            html += '</table>';
            $$.displayDialog('names', data.channelName, language.nickListFor + he(data.channelName), html);
        });

        ircEvents.on('channel:namesReplyAuto', function(data) {
            var channel = data.channel;
            var newUsers = data.users;
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

        ircEvents.on('channel:badKey', function(data) {
            var html = '<form action="javascript:gateway.chanPassword(\'' + he(data.channel) + '\')"><p>' + language.cantJoin + ' <b>' + he(data.channel) + '</b>: ' + language.needValidPassword + '</p>' +
                '<p><input type="password" id="chpass" /> <input type="submit" value="' + language.enter + '" /></p></form>';
            $$.displayDialog('error', 'password', language.warning, html);
        });

        // List Listeners
        ircEvents.on('list:channelEntry', function(data) {
            if (data.isListWindow && gateway.listWindow) {
                gateway.listWindow.addEntry(data.channel, data.users, data.topic);
            } else { // Fallback to status window display
                gateway.statusWindow.appendMessage(language.messagePatterns.chanListElement, [$$.niceTime(data.time), he(data.channel), he(data.users), $$.colorize(data.topic)]);
            }
        });

        ircEvents.on('list:endList', function(data) {
            if (gateway.listWindow && gateway.listWindow.name === data.listWindowName) {
                gateway.listWindow.render();
            }
        });

        ircEvents.on('list:listWindowEnded', function(data) {
            if (gateway.listWindow && gateway.listWindow.name === data.listName) {
                gateway.listWindow = null;
            }
        });

        ircEvents.on('list:insertEntry', function(data) {
            var listType = 'B';
            switch (data.type) {
                case 'banList':
                    listType = 'b';
                    break;
                case 'exceptList':
                    listType = 'e';
                    break;
                case 'inviteList':
                    listType = 'I';
                    break;
            }
            var chan = gateway.findChannel(data.args[1]);
            if (chan) {
                var date = new Date(data.args[3] * 1000);
                chan.appendMessage(language.messagePatterns.listElement, [$$.niceTime(), listType, he(data.args[1]), he(data.args[2]), he(data.args[4]), date.toLocaleString()]);
            }
        });

        ircEvents.on('list:endListbeI', function(data) {
            var listType = 'B';
            switch (data.type) {
                case 'banList':
                    listType = 'b';
                    break;
                case 'exceptList':
                    listType = 'e';
                    break;
                case 'inviteList':
                    listType = 'I';
                    break;
            }
            var chan = gateway.findChannel(data.channel);
            if (chan) {
                chan.appendMessage(language.messagePatterns.endofList, [$$.niceTime(), listType, he(data.channel)]);
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
        ircEvents.on('server:invite', function(data) {
            var html = '<p>' + he(data.senderNick) + ' ' + language.invitesYouTo + ' <a href="javascript:ircCommand.channelJoin(\'' + he(data.channel) + '\')">' + he(data.channel) + '</a></p>';
            $$.displayDialog('info', 'invite', language.invitation, html);
        });
    }

    }

    // Expose public methods or initialize
    window.gatewayDisplay = {
        init: initDisplayListeners
    };
})();