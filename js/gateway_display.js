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
        commandHistoryPos: -1,
        nickListVisibility: true,
        lastKeypressWindow: '',
        keypressSuppress: '',
        displayOwnWhois: false,
        tabHistory: ['--status']
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
        gateway.commandHistoryPos = uiState.commandHistoryPos;
        gateway.nickListVisibility = uiState.nickListVisibility;
        gateway.lastKeypressWindow = uiState.lastKeypressWindow;
        gateway.keypressSuppress = uiState.keypressSuppress;
        gateway.displayOwnWhois = uiState.displayOwnWhois;
        gateway.tabHistory = uiState.tabHistory;
    }

    // ==========================================
    // PUBLIC UI HELPER FUNCTIONS
    // ==========================================

    var uiHelpers = {
        // Insert text into the input field
        insert: function(text) {
            var input = $('#input');
            var oldText = input.val();
            input.focus();
            input.val(oldText + text);
        },

        // Insert emoji and update recent emoji list
        insertEmoji: function(e) {
            uiHelpers.insert(e);
            var index = emoji.selectable.indexOf(e);
            if (index >= 0) {
                emoji.selectable.splice(index, 1);
                $('#emoticon-symbols span:nth-child(' + (index+1) + ')').remove();
            }
            emoji.selectable.unshift(e);
            if (emoji.selectable.length > 80) {
                emoji.selectable.splice(-1);
                $('#emoticon-symbols span:last').remove();
            }
            $('#emoticon-symbols').prepend(makeEmojiSelector(e));
            saveSelectableEmoji();
        },

        // Insert IRC color code
        insertColor: function(color) {
            uiHelpers.insert(String.fromCharCode(3) + (color<10?'0':'') + color.toString());
        },

        // Insert IRC formatting code
        insertCode: function(code) {
            var text = false;
            switch(code){
                case 2: text = String.fromCharCode(2); break; // Bold
                case 3: text = String.fromCharCode(3); break; // Color
                case 15: text = String.fromCharCode(15); break; // Reset
                case 22: text = String.fromCharCode(22); break; // Reverse
                case 29: text = String.fromCharCode(29); break; // Italic
                case 31: text = String.fromCharCode(31); break; // Underline
            }
            if(text) uiHelpers.insert(text);
        },

        // Toggle formatting panel visibility
        toggleFormatting: function() {
            if($('#formatting').is(':visible')){
                $('#formatting').hide();
                $('#formatting-button').text(language.insertFormatCodes);
            } else {
                $('#formatting').show();
                $('#formatting-button').text('⮙ ' + language.hideFormatting + ' ⮙');
            }
        },

        // Focus the input field if no text is selected
        inputFocus: function() {
            if(window.getSelection().toString() == ''){
                $("#input").focus();
            }
        },

        // Perform tab completion
        doComplete: function() {
            if(gateway.completion.repeat == 0 || gateway.completion.array.length == 0) {
                var rawstr = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '');
                var str = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '').split(/\s+/);
                if(str && str.length > 0 && str[str.length-1].length > 0) {
                    gateway.completion.array = gateway.completion.find(str[str.length-1], rawstr, str.length-1);
                    if(gateway.completion.array.length > 0) {
                        str[str.length-1] = gateway.completion.array[0] + " ";
                        gateway.completion.repeat = 1;
                        $('#input').val(str.join(" "));
                        gateway.completion.lastPos = 0;
                    }
                }
            } else if(gateway.completion.array.length > 0) {
                var str = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '').split(/\s+/);
                if(gateway.completion.lastPos+1 < gateway.completion.array.length) {
                    str[str.length-1] = gateway.completion.array[gateway.completion.lastPos+1] + " ";
                    gateway.completion.lastPos++;
                    $('#input').val(str.join(" "));
                } else {
                    gateway.completion.lastPos = 0;
                    str[str.length-1] = gateway.completion.array[0] + " ";
                    $('#input').val(str.join(" "));
                }
            }
        },

        // Get user avatar or letter avatar HTML
        getMeta: function(nick, size) {
            var avatar = uiHelpers.getAvatarUrl(nick, size);
            var meta;
            if(avatar) {
                meta = '<img src="' + he(avatar) + '" alt="'+he(nick)+'" onerror="this.src=\'/styles/img/noavatar.png\';">';
            } else {
                var user = users.getUser(nick);
                if(!user.metadata) user.metadata = {};
                if('display-name' in user.metadata){
                    var dispNick = he(user.metadata['display-name']);
                } else {
                    var dispNick = he(nick);
                }
                meta = '<span class="avatar letterAvatar" style="background-color:'+$$.nickColor(nick, true)+';"><span role="presentation">'+dispNick.charAt(0)+'</span></span>';
            }
            return meta;
        },

        // Get avatar URL for a user (from metadata or IRCCloud)
        getAvatarUrl: function(nick, size) {
            if(!size) size = 200;
            var user = users.getUser(nick);
            if(user.disableAvatar) return false;
            var avatar = false;
            if('avatar' in user.metadata){
                avatar = user.metadata['avatar'].replace('{size}', size.toString());
            }
            if(!avatar){
                var expr = /^~?[su]id([0-9]+)$/;
                var avmatch = expr.exec(user.ident);
                if(avmatch){
                    var irccloudUrl = 'https://static.irccloud-cdn.com/avatar-redirect/s' + size.toString() + '/' + avmatch[1];
                    avatar = irccloudUrl;
                }
            }
            return avatar;
        },

        // Extract msgid from IRC tags
        getMsgid: function(tags) {
            return (tags && tags.msgid) ? tags.msgid : '';
        },

        // Calculate optimal history limit based on window height
        calculateHistoryLimit: function() {
            var chatWrapper = $('#chat-wrapper');
            if(!chatWrapper.length){
                return 20; // Fallback to conservative default if wrapper not found
            }

            var availableHeight = chatWrapper.innerHeight();
            if(!availableHeight || availableHeight < 100){
                return 20; // Fallback if height seems wrong
            }

            var activeWindow = null;
            if(gateway.active){
                var activeTab = gateway.find(gateway.active);
                if(activeTab){
                    activeWindow = $('#' + activeTab.id + '-window');
                }
            }

            if(!activeWindow || !activeWindow.length){
                activeWindow = chatWrapper.find('span[id$="-window"]').filter(function(){
                    return $(this).find('.messageDiv').length > 0;
                }).first();
            }

            var avgMessageHeight = 80; // Default estimate in pixels
            var measuredMessages = 0;

            // Try to measure from active/found window
            if(activeWindow && activeWindow.length){
                var messages = activeWindow.find('.messageDiv').slice(0, 10);
                console.log('History limit: Found', messages.length, 'messages in active window for measurement');
                if(messages.length > 0){
                    var heights = [];
                    messages.each(function(){
                        var h = $(this).outerHeight(true);
                        heights.push(h);
                        console.log('History limit: Message height:', h);
                    });
                    if(heights.length > 0){
                        var sum = heights.reduce(function(a, b){ return a + b; }, 0);
                        avgMessageHeight = sum / heights.length;
                        measuredMessages = heights.length;
                        console.log('History limit: Calculated average from active window:', avgMessageHeight);
                    }
                }
            } else {
                console.log('History limit: No active window found for measurement');
            }

            // If we couldn't get enough measurements, try Status window
            if(measuredMessages < 3 && gateway.statusWindow){
                console.log('History limit: Not enough measurements (', measuredMessages, '), trying Status window');
                var statusWindow = $('#' + gateway.statusWindow.id + '-window');
                if(statusWindow && statusWindow.length){
                    var messages = statusWindow.find('.messageDiv').filter(':visible').slice(0, 10);
                    console.log('History limit: Found', messages.length, 'visible messages in Status window');
                    if(messages.length >= 3){
                        var heights = [];
                        messages.each(function(){
                            var h = $(this).outerHeight(true);
                            // Only use reasonable heights (skip collapsed/hidden elements)
                            if(h > 15){
                                heights.push(h);
                            }
                        });
                        if(heights.length >= 3){
                            var sum = heights.reduce(function(a, b){ return a + b; }, 0);
                            avgMessageHeight = sum / heights.length;
                            measuredMessages = heights.length;
                            console.log('History limit: Used Status window for measurements, average:', avgMessageHeight);
                        } else {
                            console.log('History limit: Status window measurements too small, using default');
                        }
                    }
                } else {
                    console.log('History limit: Status window not found');
                }
            }

            var estimatedCount = Math.floor(availableHeight / avgMessageHeight * 1.5);
            var limit = Math.max(10, Math.min(estimatedCount, 200));

            console.log('Calculated history limit:', limit, 'based on height:', availableHeight, 'avg msg height:', avgMessageHeight, 'measured from', measuredMessages, 'messages');
            return limit;
        }
    };

    // ==========================================
    // PUBLIC UI TAB MANAGEMENT FUNCTIONS
    // ==========================================

    var uiTabs = {
        // Switch to the next tab
        nextTab: function() {
            var swtab = $('li.activeWindow').next().find('a.switchTab');
            if(swtab){
                swtab.trigger('click');
            }
        },

        // Switch to the previous tab
        prevTab: function() {
            var swtab = $('li.activeWindow').prev().find('a.switchTab');
            if(swtab){
                swtab.trigger('click');
            }
        },

        // Switch to a specific tab by name
        switchTab: function(chan) {
            var act = uiTabs.getActive();
            if(act){
                act.saveScroll();
                act.setMark();
            } else {
                gateway.statusWindow.saveScroll();
                gateway.statusWindow.setMark();
            }
            chan = chan.toLowerCase();
            var newActiveTabName = '';

            if(chan != "--status" && gateway.findChannel(chan)) {
                var id = gateway.findChannel(chan).id;
                $('#main-window > span').hide();
                $('#tab-info > span').hide();
                $('#nicklist-main > span').hide();
                $('#chstats > div').hide();
                $('#info > span').hide();
                $('#'+id+'-nicklist').show();
                $('#tabs > li').removeClass("activeWindow");
                $('#'+id+'-tab').addClass("activeWindow");
                $('#'+id+'-window').show();
                $('#'+id+'-chstats').show();
                $('#'+id+'-topic').show();
                $('#'+id+'-tab-info').show();
                $('#'+id+'-topic').prop('title', language.clickForWholeTopic);

                gateway.findChannel(chan).markRead();
                newActiveTabName = chan;
                $('#input').focus();
                if($("#nicklist").width() < 41 && gateway.nickListVisibility) {
                    $("#nicklist-closed").fadeOut(1, function () {
                        $("#nicklist").animate({
                            "opacity": "toggle",
                            "width":	"23%"
                        }, 1);
                        $("#chstats").animate({
                            "opacity": "toggle",
                            "width":	"23%"
                        }, 1);
                        $("#chatbox").animate({
                            "width":	"77%"
                        }, 1, function() {
                            gateway.findChannel(chan).restoreScroll();
                            setTimeout(function(){
                                gateway.findChannel(chan).restoreScroll();
                            }, 200);
                            $('#nickopts').css('display', '');
                            $('#chlist').css('display', '');
                        });
                    });
                } else {
                    gateway.findChannel(chan).restoreScroll();
                    setTimeout(function(){
                        gateway.findChannel(chan).restoreScroll();
                    }, 200);
                }
                disp.groupEvents('#'+id+'-window');
            } else if(chan != "--status" && gateway.findQuery(chan)) {
                var id = gateway.findQuery(chan).id;
                $('#main-window > span').hide();
                $('#tab-info > span').hide();
                $('#nicklist-main > span').hide();
                $('#info > span').hide();
                $('#chstats > div').hide();
                $('#--status-nicklist').show();
                $('#tabs > li').removeClass("activeWindow");
                $('#'+id+'-tab').addClass("activeWindow");
                $('#'+id+'-window').show();
                $('#'+id+'-topic').show();
                $('#'+id+'-chstats').show();
                $('#'+id+'-tab-info').show();
                $('#'+id+'-topic').prop('title', '');
                newActiveTabName = chan;
                $('#input').focus();
                if($("#nicklist").width() > 40) {
                    $("#nicklist").animate({
                        "opacity": "toggle",
                        "width":	"40px"
                    }, 1);
                    $("#chstats").animate({
                        "opacity": "toggle",
                        "width":	"40px"
                    }, 1);
                    $("#chatbox").animate({
                        "width":	"97%"
                    }, 1, function () {
                        $("#nicklist-closed").fadeIn(1);
                        gateway.findQuery(chan).restoreScroll();
                        setTimeout(function(){
                            gateway.findQuery(chan).restoreScroll();
                        }, 200);
                        $('#nickopts').css('display', 'none');
                        $('#chlist').css('display', 'none');
                    });
                } else {
                    gateway.findQuery(chan).restoreScroll();
                    setTimeout(function(){
                        gateway.findQuery(chan).restoreScroll();
                    }, 200);
                }
                gateway.findQuery(chan).markRead();
            } else if(gateway.listWindow && chan == gateway.listWindow.name) {
                var id = gateway.listWindow.id;
                $('#main-window > span').hide();
                $('#tab-info > span').hide();
                $('#nicklist-main > span').hide();
                $('#info > span').hide();
                $('#chstats > div').hide();
                $('#--status-nicklist').show();
                $('#tabs > li').removeClass("activeWindow");
                $('#'+id+'-tab').addClass("activeWindow");
                $('#'+id+'-window').show();
                $('#'+id+'-topic').show();
                $('#'+id+'-chstats').show();
                $('#'+id+'-tab-info').show();
                gateway.listWindow.markRead();
                newActiveTabName = chan;
                $('#input').focus();
                if($("#nicklist").width() > 40) {
                    $("#nicklist").animate({
                        "opacity": "toggle",
                        "width":	"40px"
                    }, 1);
                    $("#chstats").animate({
                        "opacity": "toggle",
                        "width":	"40px"
                    }, 1);
                    $("#chatbox").animate({
                        "width":	"97%"
                    }, 1, function () {
                        $("#nicklist-closed").fadeIn(1);
                        gateway.listWindow.restoreScroll();
                        $('#nickopts').css('display', 'none');
                        $('#chlist').css('display', 'none');
                    });
                } else {
                    gateway.listWindow.restoreScroll();
                }
            } else if(chan == "--status") {
                $('#main-window > span').hide();
                $('#tab-info > span').hide();
                $('#nicklist-main > span').hide();
                $('#info > span').hide();
                $('#chstats > div').hide();
                $('#--status-nicklist').show();
                $('#tabs > li').removeClass("activeWindow");
                $('#--status-tab').addClass("activeWindow");
                $('#--status-window').show();
                $('#--status-topic').show();
                $('#--status-chstats').show();
                gateway.statusWindow.markRead();
                newActiveTabName = chan;
                $('#input').focus();
                if($("#nicklist").width() > 40) {
                    $("#nicklist").animate({
                        "opacity": "toggle",
                        "width":	"40px"
                    }, 1);
                    $("#chstats").animate({
                        "opacity": "toggle",
                        "width":	"40px"
                    }, 1);
                    $("#chatbox").animate({
                        "width":	"97%"
                    }, 1, function () {
                        $("#nicklist-closed").fadeIn(1);
                        gateway.statusWindow.restoreScroll();
                        setTimeout(function(){
                            gateway.statusWindow.restoreScroll();
                            }, 200);
                        $('#nickopts').css('display', 'none');
                        $('#chlist').css('display', 'none');
                    });
                } else {
                    gateway.statusWindow.restoreScroll();
                    setTimeout(function(){
                        gateway.statusWindow.restoreScroll();
                        }, 200);
                }
            }
            ircEvents.emit('domain:tabSwitched', { oldTab: gateway.active, newTab: newActiveTabName });
            gateway.active = newActiveTabName; // Update active tab after domain event
            gateway.tabHistory.push(newActiveTabName); // Update UI tab history
            gateway.checkNickListVisibility();
        },

        // Get the active tab object (returns false for status window)
        getActive: function() {
            if(gateway.active == '--status') {
                return false;
            } else if(gateway.findChannel(gateway.active)) {
                return gateway.findChannel(gateway.active);
            } else if(gateway.findQuery(gateway.active)) {
                return gateway.findQuery(gateway.active);
            } else if(gateway.listWindow && gateway.active == gateway.listWindow.name) {
                return false;
            } else {
                return false;
            }
        },

        // Get the last tab from history, ignoring specified tab
        tabHistoryLast: function(ignore) {
            var ignorec = ignore.toLowerCase();
            for(var i=gateway.tabHistory.length; i > 0; i--) {
                var tabName = gateway.tabHistory[i];
                if(tabName && (!ignorec || ignorec != tabName)) {
                    if(gateway.findChannel(tabName) || gateway.findQuery(tabName) || (gateway.listWindow && tabName == gateway.listWindow.name)) {
                        return tabName;
                    }
                }
            }
            return '--status';
        }
    };

    // ==========================================
    // PUBLIC UI NICKLIST FUNCTIONS
    // ==========================================

    var uiNicklist = {
        // Toggle nicklist visibility
        nickListToggle: function() {
            var active = gateway.getActive();
            if(!active){
                active = gateway.statusWindow;
            }
            active.saveScroll();
            if($("#nicklist").width() > 40) {
                $("#nicklist").animate({
                    "opacity": "toggle",
                    "width":	"40px"
                }, 400);
                $("#chstats").animate({
                    "opacity": "toggle",
                    "width":	"40px"
                }, 400);
                $("#chatbox").animate({
                    "width":	"97%"
                }, 401, function () {
                    $("#nicklist-closed").fadeIn(200);
                    setTimeout(function(){
                        gateway.getActive().restoreScroll();
                    }, 250);
                });
                $('#nickopts').css('display', 'none');
                $('#chlist').css('display', 'none');
                gateway.nickListVisibility = false;
            } else {
                uiNicklist.showNickList();
                gateway.nickListVisibility = true;
            }
            uiNicklist.checkNickListVisibility();
            $('#input').focus();
        },

        // Check if nicklist is visible and show it if needed
        checkNickListVisibility: function() {
            setTimeout(function(){
                if(!$('#nicklist-closed').is(':visible') && !$('#nicklist').is(':visible')){
                    uiNicklist.showNickList();
                }
            }, 1500);
        },

        // Show the nicklist panel
        showNickList: function() {
            $("#nicklist-closed").fadeOut(200, function () {
                $("#nicklist").animate({
                    "opacity": "show",
                    "width":	"23%"
                }, 400);
                $("#chstats").animate({
                    "opacity": "show",
                    "width":	"23%"
                }, 400);
                $("#chatbox").animate({
                    "width":	"77%"
                }, 401);
                setTimeout(function(){
                    var tab = gateway.getActive();
                    if(!tab){
                        tab = gateway.statusWindow;
                    }
                    tab.restoreScroll();
                    $('#nickopts').css('display', '');
                    $('#chlist').css('display', '');
                }, 450);
            });
        },

        // Toggle nick options menu
        toggleNickOpt: function(nicklistid) {
            if($('#'+nicklistid+'-opt').is(':visible')) {
                if($('#'+nicklistid+'-opt-info').is(':visible')){
                     $('#'+nicklistid+'-opt-info').hide('blind', {
                        direction: "vertical"
                    }, 300);
                    $('#'+nicklistid+'-opt').removeClass('activeInfo');
                 }
                $('#'+nicklistid+'-opt').hide('blind', {
                    direction: "vertical"
                }, 300);
                $('#'+nicklistid).removeClass('activeNick');
            } else {
                $('#'+nicklistid+'-opt').show('blind', {
                    direction: "vertical"
                }, 300);
                $('#'+nicklistid).addClass('activeNick');
            }
        },

        // Toggle nick options info section
        toggleNickOptInfo: function(nicklistid) {
            if($('#'+nicklistid+'-opt-info').is(':visible')){
                 $('#'+nicklistid+'-opt-info').hide('blind', {
                    direction: "vertical"
                }, 300);
                $('#'+nicklistid+'-opt').removeClass('activeInfo');
            } else {
                $('#'+nicklistid+'-opt-info').show('blind', {
                    direction: "vertical"
                }, 300);
                $('#'+nicklistid+'-opt').addClass('activeInfo');
            }
        },

        // Toggle nick options admin section
        toggleNickOptAdmin: function(nicklistid) {
            if($('#'+nicklistid+'-opt-admin').is(':visible')){
                 $('#'+nicklistid+'-opt-admin').hide('blind', {
                    direction: "vertical"
                }, 300);
                $('#'+nicklistid+'-opt').removeClass('activeAdmin');
            } else {
                $('#'+nicklistid+'-opt-admin').show('blind', {
                    direction: "vertical"
                }, 300);
                $('#'+nicklistid+'-opt').addClass('activeAdmin');
            }
        },

        // Toggle channel operator actions menu
        toggleChannelOperOpts: function(channel) {
            var $element = $('#'+gateway.findChannel(channel).id+'-operActions ul');
            if($element.is(':visible')){
                $element.hide('blind', {
                    direction: 'vertical'
                }, 300);
                $('#'+gateway.findChannel(channel).id+'-operActions .chstats-button').removeClass('channelAdminActive');
            } else {
                $element.show('blind', {
                    direction: 'vertical'
                }, 300);
                $('#'+gateway.findChannel(channel).id+'-operActions .chstats-button').addClass('channelAdminActive');
            }
        },

        // Toggle channel options menu
        toggleChannelOpts: function(channel) {
            var $element = $('#'+gateway.findChannel(channel).id+'-channelOptions ul');
            if($element.is(':visible')){
                $element.hide('blind', {
                    direction: 'vertical'
                }, 300);
                $('#'+gateway.findChannel(channel).id+'-chstats .chstats-button').removeClass('channelAdminActive');
            } else {
                $element.show('blind', {
                    direction: 'vertical'
                }, 300);
                $('#'+gateway.findChannel(channel).id+'-chstats .chstats-button').addClass('channelAdminActive');
            }
        },

        // Toggle global nick options panel
        toggleNickOpts: function() {
            var $element = $('#nickOptions')
            if($element.is(':visible')){
                $element.hide('blind', {
                    direction: 'down'
                }, 300);
                $('#nickopts .nickoptsButton').removeClass('channelAdminActive');
            } else {
                $element.show('blind', {
                    direction: 'down'
                }, 300);
                $('#nickopts .nickoptsButton').addClass('channelAdminActive');
            }
        }
    };

    // ==========================================
    // PUBLIC UI INPUT/COMMAND FUNCTIONS
    // ==========================================

    var uiInput = {
        // Display "not enough parameters" error message
        notEnoughParams: function(command, reason) {
            if(gateway.getActive()) {
                gateway.getActive().appendMessage(language.messagePatterns.notEnoughParams, [$$.niceTime(), he(command), reason]);
            } else {
                gateway.statusWindow.appendMessage(language.messagePatterns.notEnoughParams, [$$.niceTime(), he(command), reason]);
            }
        },

        // Parse and execute a user command (starts with /)
        parseUserCommand: function(input) {
            command = input.slice(1).split(" ");
            if(!gateway.callCommand(command, input)) {
                if (gateway.getActive()) {
                    gateway.getActive().appendMessage(language.messagePatterns.noSuchCommand, [$$.niceTime(), he(command[0])]);
                } else {
                    gateway.statusWindow.appendMessage(language.messagePatterns.noSuchCommand, [$$.niceTime(), he(command[0])]);
                }
            }
        },

        // Parse and send a user message
        parseUserMessage: function(input) {
            var active = gateway.getActive();
            if(active) {
                var textToSend = input;
                if(lengthInUtf8Bytes(textToSend) >= 420){
                    var button = [ {
                        text: language.yes,
                        click: function(){
                            do {
                                var sendNow = '';
                                while(lengthInUtf8Bytes(sendNow)<420 && textToSend.length > 0){
                                    sendNow += textToSend.charAt(0);
                                    textToSend = textToSend.substring(1);
                                }
                                gateway.sendSingleMessage(sendNow, active);
                            } while (textToSend != "");
                            $(this).dialog('close');
                        }
                    }, {
                        text: language.no,
                        click: function(){
                            $(this).dialog('close');
                        }
                    } ];
                    var html = language.textTooLongForSingleLine + '<br><br><strong>'+$$.sescape(input)+'</strong>';
                    $$.displayDialog('confirm', 'command', language.confirm, html, button);
                } else {
                    gateway.sendSingleMessage(input, active);
                }
            }
        },

        // Parse user input (command or message)
        parseUserInput: function(input) {
            if(!input){
                input = '';
            }
            if(settings.get('sendEmoji')){
                input = $$.textToEmoji(input);
            }
            if (!input) {
                return;
            }
            // Connection status check should come from domain
            ircEvents.emit('domain:checkConnectionStatus', { callback: function(connected) {
                if(!connected) {
                    if (gateway.getActive()) {
                        gateway.getActive().appendMessage(language.messagePatterns.notConnected, [$$.niceTime()]);
                    } else {
                        gateway.statusWindow.appendMessage(language.messagePatterns.notConnected, [$$.niceTime()]);
                    }
                    return;
                }

                var regexp = /^\s+(\/.*)$/;
                var match = regexp.exec(input);
                if(match){
                    var button = [ {
                        text: language.sendMessage,
                        click: function(){
                            uiInput.parseUserMessage(input);
                            $(this).dialog('close');
                        }
                    }, {
                        text: language.runCommand,
                        click: function(){
                            uiInput.parseUserCommand(match[1]);
                            $(this).dialog('close');
                        }
                    }, {
                        text: language.cancel,
                        click: function(){
                            $(this).dialog('close');
                        }
                    } ];
                    var html = language.textStartsWithSpaceAndSlash + '<br><br><strong>'+$$.sescape(input)+'</strong>';
                    $$.displayDialog('confirm', 'command', language.confirm, html, button);
                } else {
                    regexp = /^(#[^ ,]{1,25})$/;
                    match = regexp.exec(input);
                    if(match){
                        var button = [ {
                            text: language.sendMessage,
                            click: function(){
                                uiInput.parseUserMessage(input);
                                $(this).dialog('close');
                            }
                        }, {
                            text: language.joinTo+input,
                            click: function(){
                                ircEvents.emit('domain:requestJoinChannel', { channelName: input, time: new Date() });
                                $(this).dialog('close');
                            }
                        }, {
                            text: language.cancel,
                            click: function(){
                                $(this).dialog('close');
                            }
                        } ];
                        var html = language.messageStartsWithHash + '<br><br><strong>'+$$.sescape(input)+'</string>';
                        $$.displayDialog('confirm', 'command', language.confirm, html, button);
                    } else if(input.charAt(0) == "/") {
                        uiInput.parseUserCommand(input);
                    } else {
                        uiInput.parseUserMessage(input);
                    }
                }
            }});
            $("#input").val("");
        },

        // Execute a command by name
        performCommand: function(input) {
            input = '/' + input;
            var command = input.slice(1).split(" ");
            if(!gateway.callCommand(command, input)) {
                console.error('Invalid performCommand: '+command[0]);
            }
        },

        // Handle Enter key press
        enterPressed: function() {
            // Connection status check should come from domain
            ircEvents.emit('domain:checkConnectionStatus', { callback: function(connected) {
                if(!connected) {
                    $$.alert(language.cantSendNoConnection);
                    return;
                }
                if(gateway.commandHistory.length == 0 || gateway.commandHistory[gateway.commandHistory.length-1] != $('#input').val()) {
                    if(gateway.commandHistoryPos != -1 && gateway.commandHistoryPos == gateway.commandHistory.length-1) {
                        gateway.commandHistory[gateway.commandHistoryPos] = $('#input').val();
                    } else {
                        gateway.commandHistory.push($('#input').val());
                    }
                }
                uiInput.parseUserInput($('#input').val());
                gateway.commandHistoryPos = -1;
            }});
        },

        // Handle arrow key navigation in command history
        arrowPressed: function(dir) {
            if(dir == 'up'){
                if(gateway.commandHistoryPos == gateway.commandHistory.length-1 && $('#input').val() != '') {
                    gateway.commandHistory[gateway.commandHistoryPos] = $('#input').val();
                }
                if(gateway.commandHistoryPos == -1 && gateway.commandHistory.length > 0 && typeof(gateway.commandHistory[gateway.commandHistory.length-1]) == 'string') {
                    gateway.commandHistoryPos = gateway.commandHistory.length-1;
                    if($('#input').val() != '' && gateway.commandHistory[gateway.commandHistory.length-1] != $('#input').val()) {
                        gateway.commandHistory.push($('#input').val());
                    }
                    $('#input').val(gateway.commandHistory[gateway.commandHistoryPos]);
                } else if(gateway.commandHistoryPos != -1 && gateway.commandHistoryPos != 0) {
                    gateway.commandHistoryPos--;
                    $('#input').val(gateway.commandHistory[gateway.commandHistoryPos]);
                }
            } else {
                if(gateway.commandHistoryPos == gateway.commandHistory.length-1 && $('#input').val() != '') {
                    gateway.commandHistory[gateway.commandHistoryPos] = $('#input').val();
                }
                if(gateway.commandHistoryPos == -1 && $('#input').val() != '' && gateway.commandHistory.length > 0 && gateway.commandHistory[gateway.commandHistory.length-1] != $('#input').val()) {
                    gateway.commandHistory.push($('#input').val());
                    $('#input').val('');
                } else if (gateway.commandHistoryPos != -1) {
                    if(typeof(gateway.commandHistory[gateway.commandHistoryPos+1]) == 'string') {
                        gateway.commandHistoryPos++;
                        $('#input').val(gateway.commandHistory[gateway.commandHistoryPos]);
                    } else {
                        gateway.commandHistoryPos = -1;
                        $('#input').val('');
                    }
                }
            }
        },

        // Handle paste events
        inputPaste: function(e) {
            var items = (e.clipboardData || e.originalEvent.clipboardData).items;
            // TODO: Handle pasted content
        },

        // Handle keypress for typing indicators (refactored to use domain event)
        inputKeypress: function(e) {
            // Don't check activeCaps here - let domain handle capability check
            if($('#input').val().length > 0 && $('#input').val().charAt(0) == '/') return; // typing a command
            if(!gateway.getActive()) return;

            var currentWindow = gateway.getActive();
            ircEvents.emit('domain:processTypingActivity', { windowName: currentWindow.name, inputValue: $('#input').val(), time: new Date() });
        }
    };

    // ==========================================
    // PUBLIC UI WINDOW/QUERY MANAGEMENT FUNCTIONS
    // ==========================================

    var uiWindows = {
        // Open a query window with a user
        openQuery: function(nick, id) {
            if(ignore.ignoring(nick, 'query')){
                var button = [
                    {
                        text: language.changeSettings,
                        click: function(){
                            ignore.askIgnore(nick);
                            $(this).dialog('close');
                        }
                    },
                    {
                        text: 'OK',
                        click: function(){
                            $(this).dialog('close');
                        }
                    }
                ];
                var html = '<p>' + language.cantPMBecauseIgnoring + '</p>';
                $$.displayDialog('error', 'ignore', language.error, html, button);
                return;
            }
            uiWindows.findOrCreate(nick, true); // Create and activate query tab
            if(id){
                gateway.toggleNickOpt(id); // UI action
            }
        },

        // Find or create a channel/query tab
        findOrCreate: function(name, setActive) {
            if(!name || name == ''){
                return null;
            }
            var tab;
            if(name.charAt(0) == '#'){ // Channel
                tab = gateway.findChannel(name);
                if(!tab) {
                    tab = new ChannelTab(name);
                    gateway.channels.push(tab);
                    gateway.sortChannelTabs();
                }
            } else { // Query
                tab = gateway.findQuery(name);
                if(!tab) {
                    tab = new Query(name);
                    gateway.queries.push(tab);
                }
            }
            if(setActive){
                gateway.switchTab(name);
            }
            return tab;
        },

        // Get or create the channel list window
        getOrOpenListWindow: function() {
            if(!gateway.listWindow) {
                gateway.listWindow = new ListWindow();
            }
            gateway.listWindow.clearData();
            gateway.switchTab(gateway.listWindow.name);
            return gateway.listWindow;
        },

        // Toggle channel list panel visibility
        toggleChanList: function() {
            if($('#chlist-body').is(':visible')){
                $('#chlist-body').css('display', '');

                $('#chlist').css('height', '').css('top', '');
                $('#nicklist').css('bottom', '');
                var nicklistBottom = $('#nicklist').css('bottom');
                $('#nicklist').css('bottom', '36%');
                $("#nicklist").animate({
                    "bottom":	nicklistBottom
                }, 400);

                $('#chlist-button').text('⮙ ' + language.channelList + ' ⮙');
            } else {
                $('#chlist-body').css('display', 'block');
                $('#chlist').css('height', 'initial').css('top', '64.5%');
                $("#nicklist").animate({
                    "bottom":	"36%"
                }, 400);
                $('#chlist-button').text('⮛ ' + language.hideList + ' ⮛');
                ircEvents.emit('domain:requestListChannels', { minUsers: '>9', time: new Date() });
            }
        },

        // Refresh the channel list
        refreshChanList: function() {
            ircEvents.emit('domain:requestListChannels', { minUsers: '>9', time: new Date() });
            $('#chlist-body').html(language.loadingWait);
        }
    };

    // ==========================================
    // PUBLIC UI DIALOGS AND SYSTEM FUNCTIONS
    // ==========================================

    var uiDialogs = {
        // Initialize system - show connecting dialog
        initSys: function() {
            var html = language.connectingWaitHtml;
            $$.displayDialog('connect', '1', language.connecting, html);
        },

        // Initialize connection with user-provided or saved credentials
        initialize: function() {
            var nickInput, chanInput, passInput;

            if(settings.get('automLogIn')){
                if(conn.my_nick == '' || conn.my_reqChannel == ''){
                    $$.alert(language.errorLoadingData);
                    return false;
                }
                nickInput = conn.my_nick;
                chanInput = conn.my_reqChannel;
                passInput = conn.my_pass;
            } else {
                nickInput = $('#nsnick').val();
                chanInput = $('#nschan').val();
                passInput = $('#nspass').val();
                // Validation checks
                if(nickInput == ''){ $$.alert(language.mustGiveNick); return false; }
                if(chanInput == ''){ $$.alert(language.mustGiveChannel); return false; }
                if(chanInput.charAt(0) != '#'){ chanInput = '#' + chanInput; $('#nschan').val(chanInput); }
                if(!nickInput.match(/^[\[\^\|0-9a-z_`\{\}\[\]\-]+$/i)) { $$.alert(language.badCharsInNick); return false; }
                if(nickInput.match(/^[0-9-]/)){
                    $$.alert(language.badNickStart);
                    return false;
                }
                if(!chanInput.match(/^[#,a-z0-9_\.\-\\]+$/i)) { $$.alert(language.badCharsInChan); return false; }
                if(passInput.match(/[ ]+/i)) { $$.alert(language.spaceInPassword); return false; }
            }

            if(settings.get('enableautomLogIn')){
                settings.set('automLogIn', true);
                var button = [ {
                    text: 'OK',
                    click: function(){ $(this).dialog('close'); }
                } ];
                $$.displayDialog('connect', '2', language.information, language.youCanDisableAutoconnect, button);
            }

            // Emit domain event to update user info before connecting
            ircEvents.emit('domain:updateConnectionParams', {
                nick: nickInput,
                channels: [ chanInput ],
                nickservNick: nickInput,
                nickservPass: passInput,
                savePassword: settings.get('save_password')
            });

            try {
                if(chanInput){ localStorage.setItem('channel', chanInput); }
                if(nickInput){ localStorage.setItem('nick', nickInput); }
                if(settings.get('save_password')){
                    if(nickInput && passInput){
                        localStorage.setItem('password', encryptPassword(passInput));
                    }
                }
            } catch(e) {}

            try {
                window.history.pushState('', guser.nick+ ' @ '+mainSettings.networkName, '/'+chanInput.substr(1)+'/'+nickInput+'/');
            } catch(e) {}
            uiDialogs.initSys();
            gateway.connect(false);

            return true;
        },

        // Handle channel password dialog submission
        chanPassword: function(chan) {
            if($('#chpass').val() == ''){
                $$.alert(language.passwordNotGiven);
                return false;
            }
            ircEvents.emit('domain:requestJoinChannel', { channelName: chan, password: $('#chpass').val(), time: new Date() });
            $(".errorwindow").fadeOut(250);
            return true;
        },

        // Change topic dialog
        changeTopic: function(channel) {
            if(!confirm(language.areYouSureToChangeTopicOf+channel+'? '+language.itCantBeUndone)){
                return false;
            }
            var newTopic = $('#topicEdit').val().replace(/\n/g, ' ');
            ircEvents.emit('domain:requestTopicChange', { channelName: channel, newTopic: newTopic, time: new Date() });
            $$.closeDialog('confirm', 'topic');
            return true;
        },

        // Show status dialog for adding privileges
        showStatus: function(channel, nick) {
            var html = '<p>' + language.giveForNick + '<strong>'+he(nick)+'</strong>' + language.temporaryPrivilegesOnChan + '<strong>'+he(channel)+'</strong>:</p>' +
                '<select id="admopts-add-'+md5(channel)+'">' +
                    '<option value="-">' + language.selectOption + '</option>'+
                    '<option value="+v">' + language.voicePrivilege + '</option>'+
                    '<option value="+h">' + language.halfopPrivilege + '</option>'+
                    '<option value="+o">' + language.opPrivilege + '</option>'+
                    '<option value="+a">' + language.sopPrivilege + '</option>'+
                    '<option value="+q">' + language.founderPrivilege + '</option>'+
                '</select>' +
                '<p>' + language.giveForNick + '<strong>'+he(nick)+'</strong>' + language.chanservPrivilegesOnChan + '<strong>'+he(channel)+'</strong><br>' + language.youNeedServicePrivileges + ':</p>' +
                '<select id="admopts-addsvs-'+md5(channel)+'">' +
                    '<option value="-">' + language.selectOption + '</option>'+
                    '<option value="VOP">VOP: ' + language.voicePrivilege + '</option>'+
                    '<option value="HOP">HOP: ' + language.halfopPrivilege + '</option>'+
                    '<option value="AOP">AOP: ' + language.opPrivilege + '</option>'+
                    '<option value="SOP">SOP: ' + language.sopPrivilege + '</option>'+
                    '<option value="QOP">QOP: ' + language.founderPrivilege + '</option>'+
                '</select>';
            var button = [
                {
                    text: language.cancel,
                    click: function(){
                        $(this).dialog('close');
                    }
                },
                {
                    text: 'OK',
                    click: function(){
                        var mode = $('#admopts-add-'+md5(channel)).val();
                        var svsmode = $('#admopts-addsvs-'+md5(channel)).val();
                        if(mode == '-' && svsmode == '-'){
                            $$.alert(language.selectAvalilableOption);
                            return;
                        }
                        if(mode != '-') ircEvents.emit('domain:requestModeChange', { channel: channel, modeString: mode+' '+nick, time: new Date() });
                        if(svsmode != '-') ircEvents.emit('domain:requestServiceCommand', { service: 'ChanServ', command: svsmode, args: [channel, 'ADD', nick], time: new Date() });
                        $(this).dialog('close');
                    }
                }
            ];
            $$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
        },

        // Show anti-status dialog for removing privileges
        showStatusAnti: function(channel, nick) {
            var html = '<p>' + language.removeFromNick + '<strong>'+he(nick)+'</strong>' + language.temporaryPrivilegesOnChan + '<strong>'+he(channel)+'</strong>:</p>' +
                '<select id="admopts-del-'+md5(channel)+'">' +
                    '<option value="-">' + language.selectOption + '</option>'+
                    '<option value="-v">' + language.voicePrivilege + '</option>'+
                    '<option value="-h">' + language.voicePrivilege + '</option>'+
                    '<option value="-o">' + language.opPrivilege + '</option>'+
                    '<option value="-a">' + language.sopPrivilege + '</option>'+
                    '<option value="-q">' + language.founderPrivilege + '</option>'+
                '</select>' +
                '<p>' + language.completelyRemoveNick + '<strong>'+he(nick)+'</strong>' + language.fromChanservPrivilegesOnChan + '<strong>'+he(channel)+'</strong><br>' + language.youNeedServicePrivileges + ':</p>' +
                '<select id="admopts-delsvs-'+md5(channel)+'">' +
                    '<option value="-">' + language.dontRemove + '</option>'+
                    '<option value="+">' + language.yesRemove + '</option>'+
                '</select>';
            var button = [
                {
                    text: language.cancel,
                    click: function(){
                        $(this).dialog('close');
                    }
                },
                {
                    text: 'OK',
                    click: function(){
                        var mode = $('#admopts-del-'+md5(channel)).val();
                        var svsmode = $('#admopts-delsvs-'+md5(channel)).val();
                        if(mode == '-' && svsmode == '-'){
                            $$.alert(language.selectAvailableOption);
                            return;
                        }
                        if(mode != '-') ircEvents.emit('domain:requestModeChange', { channel: channel, modeString: mode+' '+nick, time: new Date() });
                        if(svsmode == '+') ircEvents.emit('domain:requestServiceCommand', { service: 'ChanServ', command: 'ACCESS', args: [channel, 'DEL', nick], time: new Date() });
                        $(this).dialog('close');
                    }
                }
            ];
            $$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
        },

        // Show channel modes dialog
        showChannelModes: function(channel) {
            var channame = channel.substring(1);
            var ch = md5(channame);

            var html = '<p>'+language.changeChannelModesOf+he(channel)+":</p>" +
                '<table><tr><th></th><th>' + language.character + '</th><th>' + language.description + '</th></tr>';
            modes.changeableSingle.forEach(function(mode){
                if(modes['single'].indexOf(mode[0]) >= 0) html += '<tr><td><input type="checkbox" id="'+ch+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td></tr>';
            }, this);
            modes.changeableArg.forEach(function(mode){
                if(modes['argAdd'].indexOf(mode[0]) >= 0 || modes['argBoth'].indexOf(mode[0]) >= 0) html += '<tr><td><input type="checkbox" id="'+ch+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td><td><input type="text" id="'+ch+'_mode_'+mode[0]+'_text"></td></tr>';
            }, this);
            html += '</table>';

            var button = [ {
                text: language.applySetting,
                click: function(){
                    uiDialogs.changeChannelModes(channel);
                    $(this).dialog('close');
                }
            } ];

            $$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);

            var chanModes = gateway.findChannel(channel).modes;
            if(!chanModes){
                return;
            }
            modes.changeableSingle.forEach(function(mode){
                if(chanModes[mode[0]]){
                    $('#'+ch+'_mode_'+mode[0]).prop('checked', true);
                }
            }, this);
            modes.changeableArg.forEach(function(mode){
                if(chanModes[mode[0]]){
                    $('#'+ch+'_mode_'+mode[0]).prop('checked', true);
                    $('#'+ch+'_mode_'+mode[0]+'_text').val(chanModes[mode[0]]);
                }
            }, this);
        },

        // Apply channel mode changes
        changeChannelModes: function(channel) {
            var modesw = '';
            var modeop = '';
            var modearg = '';
            var chanModes = gateway.findChannel(channel).modes;
            var channame = channel.substring(1);
            var ch = md5(channame);

            modes.changeableSingle.forEach(function(mode){
                mode = mode[0];
                var set = chanModes[mode];
                var checked = $('#'+ch+'_mode_'+mode).prop('checked');
                if(set != checked){
                    if(checked){
                        if(modeop != '+'){
                                modeop = '+';
                                modesw += '+';
                            }
                        modesw += mode;
                    } else {
                        if(modeop != '-'){
                                modeop = '-';
                                modesw += '-';
                            }
                        modesw += mode;
                    }
                }
            }, this);

            modes.changeableArg.forEach(function(mode){
                mode = mode[0];
                var set = chanModes[mode];
                var checked = $('#'+ch+'_mode_'+mode).prop('checked');
                var text = $('#'+ch+'_mode_'+mode+'_text').val();
                if(set != checked || (set && set != text)){
                    if(checked){
                        if(modeop != '+'){
                                modeop = '+';
                                modesw += '+';
                            }
                        modesw += mode;
                        modearg += text + ' ';
                    } else {
                        if(modeop != '-'){
                                modeop = '-';
                                modesw += '-';
                            }
                        modesw += mode;
                        if(mode == 'k'){
                            modearg += text + ' ';
                        }
                    }
                }
            }, this);

            ircEvents.emit('domain:requestModeChange', { target: channel, modeString: modesw+' '+modearg, time: new Date() });
            setTimeout(function(){ ircEvents.emit('ui:showChannelModesDialog', { channelName: channel }); }, 2000);
        },

        // Show invite prompt dialog
        showInvitePrompt: function(channel) {
            var html = '<p>Nick: <input id="inviteNick" type="text"></p>';
            var button = [ {
                text: language.cancel,
                click: function(){
                    $(this).dialog('close');
                }
            }, {
                text: language.inviteSomeone,
                click: function(){
                    var nick = $('#inviteNick').val();
                    if(!nick || nick == ''){
                        $$.alert(language.mustGiveNick);
                        return;
                    }
                    ircEvents.emit('domain:requestInvite', { channel: channel, nick: nick, time: new Date() });
                    $(this).dialog('close');
                }
            } ];
            $$.displayDialog('admin', 'invite-'+channel, language.inviteUserTo+he(channel), html, button);
        },

        // Show knocking notification dialog
        knocking: function(channel, nick, reason) {
            var html = '<b>'+nick+'</b>' + language.requestsInvitationTo + '<b>'+he(channel)+'</b> ('+$$.colorize(reason)+')';
            var button = [ {
                text: 'Zaproś',
                click: function(){
                    ircEvents.emit('domain:requestInvite', { channel: channel, nick: nick, time: new Date() });
                    $(this).dialog('close');
                }
            } ];
            $$.displayDialog('knock', nick, language.requestForInvitation, html, button);
        },

        // Show permission error dialog
        showPermError: function(text) {
            var html = language.noAccess +
                '<br>' + language.notEnoughPrivileges + '<br>'+text;
            $$.displayDialog('error', 'error', language.error, html);
        },

        // Show quit confirmation dialog
        clickQuit: function() {
            var html = '<form id="quit-form" onsubmit="ircEvents.emit(\'domain:requestQuit\', { message: $(\'#quit-msg\').val(), time: new Date() }); $$.closeDialog(\'confirm\', \'quit\'); return false;" action="javascript:void(0);">'+
                language.quitMessage + '<input type="text" id="quit-msg" value="' + language.defaultQuitMessage + '" />';
                '</form>';
            var button = [ {
                text: language.disconnect,
                click: function(){
                    $('#quit-form').submit();
                    $(this).dialog('close');
                }
            }, {
                text: language.cancel,
                click: function(){
                    $(this).dialog('close');
                }
            } ];
            $$.displayDialog('confirm', 'quit', language.ircQuit, html, button);
            $('#quit-msg').focus();
            $('#quit-msg').select();
        },

        // Deprecated quit function (now handled by domain event)
        quit: function() {
            console.warn('gateway.quit() is deprecated. Use domain:requestQuit event.');
            $('.notifywindow').fadeOut(100);
        },

        // Display global ban information
        displayGlobalBanInfo: function(text) {
            var html = language.connectionNotAllowedHtml +
                '</ul><br><p>' + language.serverMessageIs + '<br>'+he(text)+'</p>';
            $$.closeDialog('connect', '1');
            $$.displayDialog('error', 'noaccess', language.noAccessToNetwork, html);
            ircEvents.emit('domain:setConnectStatus', { status: 'banned' });
        },

        // Update history for all channels and queries
        updateHistory: function() {
            for(var i=0; i<gateway.channels.length; i++){
                var chan = gateway.channels[i];
                updateHistory(chan.name, chan.id);
            }
            for(var i=0; i<gateway.queries.length; i++){
                var query = gateway.queries[i];
                updateHistory(query.name, query.id);
            }
        },

        // Load older chat history (refactored to use domain event)
        loadOlderHistory: function(channel) {
            var chan = gateway.findChannel(channel);
            if(!chan){
                console.log('Channel not found:', channel);
                return;
            }

            var loadOlderButton = $('#' + chan.id + '-window .loadOlderButton');
            var msgid = loadOlderButton.attr('data-msgid') || null;
            var timestamp = loadOlderButton.attr('data-timestamp') || null;

            loadOlderButton.remove();

            // Calculate UI-appropriate limit based on screen size
            var limit = gateway.calculateHistoryLimit();

            // Check if this is an initial LATEST query (timestamp='*')
            if (timestamp === '*') {
                console.log('Requesting LATEST history, limit:', limit);
                ircEvents.emit('domain:requestChatHistory', {
                    channelName: channel,
                    type: 'LATEST',
                    msgid: null,
                    timestamp: null, // Domain will handle '*' -> latest
                    limit: limit,
                    time: new Date()
                });
            } else if (msgid || timestamp) {
                // Request history BEFORE the oldest known message
                console.log('Requesting history BEFORE msgid:', msgid, 'timestamp:', timestamp, 'limit:', limit);
                ircEvents.emit('domain:requestChatHistory', {
                    channelName: channel,
                    type: 'BEFORE',
                    msgid: msgid,
                    timestamp: timestamp,
                    limit: limit,
                    time: new Date()
                });
            } else {
                console.log('No reference point found for loading older history');
            }
        }
    };

    // Note: insertMessage is extremely large and remains in gateway_def.js for now
    // It will be moved in a follow-up refactor due to its complexity

    // ==========================================
    // ATTACH UI FUNCTIONS TO GATEWAY
    // ==========================================
    function attachUIFunctionsToGateway() {
        Object.assign(gateway, uiHelpers);
        Object.assign(gateway, uiTabs);
        Object.assign(gateway, uiNicklist);
        Object.assign(gateway, uiInput);
        Object.assign(gateway, uiWindows);
        Object.assign(gateway, uiDialogs);
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

            // Set and display topic if available
            if (data.topic !== undefined) {
                channel.setTopic(data.topic);
                if (data.topicSetBy) {
                    channel.setTopicSetBy(data.topicSetBy);
                }
                if (data.topicSetDate) {
                    channel.setTopicSetDate(data.topicSetDate);
                }

                // Display topic message
                if (data.topic) {
                    channel.appendMessage(language.messagePatterns.topic, [
                        $$.niceTime(),
                        channelName,
                        $$.colorize(data.topic)
                    ]);

                    // Display topic metadata if available
                    if (data.topicSetBy && data.topicSetDate) {
                        channel.appendMessage(language.messagePatterns.topicTime, [
                            $$.niceTime(),
                            he(data.topicSetBy),
                            $$.parseTime(data.topicSetDate)
                        ]);
                    }
                } else {
                    // No topic set
                    channel.appendMessage(language.messagePatterns.topicNotSet, [
                        $$.niceTime(),
                        channelName
                    ]);
                }
            }

            // Automatically request initial history if server supports it
            if (data.historySupported) {
                // Calculate UI-appropriate limit based on screen size (one window height)
                var limit = gateway.calculateHistoryLimit();

                // Respect server's maximum if it has one
                if (data.historyMaxLimit != 0 && data.historyMaxLimit < limit) {
                    limit = data.historyMaxLimit;
                }

                console.log('Automatically requesting initial history for', channelName, 'limit:', limit);

                // Request initial history (LATEST)
                ircEvents.emit('domain:requestChatHistory', {
                    channelName: channelName,
                    type: 'LATEST',
                    msgid: null,
                    timestamp: null,
                    limit: limit,
                    time: new Date()
                });
            }
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

        // Handle topic changes (when someone actively changes the topic)
        ircEvents.on('channel:topicChanged', function(data) {
            var channelName = data.channelName;
            var channame = channelName.toLowerCase();
            var channel = gateway.findChannel(channame);

            if (!channel) {
                return; // Channel tab not found
            }

            // Update the channel topic
            channel.setTopic(data.topic);
            channel.setTopicSetBy(data.setBy);
            channel.setTopicSetDate(data.setDate);

            // Display appropriate message based on whether topic was set or removed
            if (data.topic && data.topic.trim()) {
                // Topic was changed
                channel.appendMessage(language.messagePatterns.changeTopic, [
                    $$.niceTime(),
                    he(data.setBy),
                    $$.colorize(data.topic)
                ]);
            } else {
                // Topic was removed
                channel.appendMessage(language.messagePatterns.deleteTopic, [
                    $$.niceTime(),
                    he(data.setBy),
                    he(channelName)
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

        // Handle all error messages from the domain layer
        ircEvents.on('client:errorMessage', function(data) {
            var time = data.time || new Date();

            // Map error types to user-friendly message patterns
            var errorMappings = {
                // User/Server lookup errors
                'noSuchNick': {
                    pattern: language.messagePatterns.noSuchNick,
                    params: [$$.niceTime(time), he(data.target || data.nick)]
                },
                'noSuchChannel': {
                    pattern: language.messagePatterns.noSuchChannel,
                    params: [$$.niceTime(time), he(data.target || data.channel)]
                },

                // Nickname errors
                'nicknameInUse': {
                    pattern: language.messagePatterns.nickInUse,
                    params: [$$.niceTime(time), he(data.nick)]
                },

                // Channel membership errors
                'notOnChannel': {
                    pattern: language.messagePatterns.notOnChannel,
                    params: [$$.niceTime(time), he(data.channel || data.channelName)]
                },
                'userOnChannel': {
                    pattern: language.messagePatterns.alreadyOnChannel,
                    params: [$$.niceTime(time), he(data.nick), he(data.channel || data.channelName)]
                },

                // Channel join errors
                'channelIsFull': {
                    pattern: language.messagePatterns.cannotJoin,
                    params: [$$.niceTime(time), he(data.channel), language.channelIsFull || 'channel is full']
                },
                'inviteOnlyChan': {
                    pattern: language.messagePatterns.cannotJoin,
                    params: [$$.niceTime(time), he(data.channel), language.inviteRequiredShort]
                },
                'bannedFromChan': {
                    pattern: language.messagePatterns.cannotJoin,
                    params: [$$.niceTime(time), he(data.channel), language.youreBanned]
                },
                'badChannelKey': {
                    pattern: language.messagePatterns.cannotJoin,
                    params: [$$.niceTime(time), he(data.channel), language.passwordRequired]
                },
                'needReggedNick': {
                    pattern: language.messagePatterns.cannotJoin,
                    params: [$$.niceTime(time), he(data.channel), language.registeredNickRequiredForChan]
                },
                'secureOnlyChan': {
                    pattern: language.messagePatterns.cannotJoin,
                    params: [$$.niceTime(time), he(data.channel), language.SSLRequired]
                },

                // Message send errors
                'cantSendToUser': {
                    pattern: language.messagePatterns.cannotSendToUser,
                    params: [$$.niceTime(time), he(data.nick || data.target), data.message || '']
                },

                // Permission errors
                'noPrivileges': {
                    pattern: language.messagePatterns.noPerms,
                    params: [$$.niceTime(time)]
                },
                'chanOpPrivsNeeded': {
                    pattern: language.messagePatterns.noPerms,
                    params: [$$.niceTime(time)]
                },
                'chanOwnPrivNeeded': {
                    pattern: language.messagePatterns.noPerms,
                    params: [$$.niceTime(time)]
                },

                // Mode errors
                'unknownMode': {
                    pattern: language.messagePatterns.invalidMode,
                    params: [$$.niceTime(time), he(data.mode || '')]
                },

                // Command/parameter errors
                'notEnoughParameters': {
                    pattern: language.messagePatterns.notEnoughParameters,
                    params: [$$.niceTime(time), he(data.command || '')]
                }
            };

            // Get the appropriate mapping
            var mapping = errorMappings[data.type];

            if (mapping && mapping.pattern) {
                // Display using the mapped message pattern
                gateway.statusWindow.appendMessage(mapping.pattern, mapping.params);
            } else {
                // Fallback for unmapped error types - use generic unimplemented error pattern
                gateway.statusWindow.appendMessage(language.messagePatterns.unimplementedError, [
                    $$.niceTime(time),
                    data.message || data.type || 'Unknown error'
                ]);
            }
        });

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

            // Set initial page title with confirmed nick
            if (data.target) {
                document.title = he(data.target) + ' @ ' + mainSettings.networkName;
            }
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

        // Clean up operActions CSS and display message when we leave a channel
        ircEvents.on('user:selfPartedChannel', function(data) {
            var channel = gateway.findChannel(data.channelName);
            var channelHash = md5(data.channelName);

            if (channel) {
                // Display partOwn message in the channel before closing
                channel.appendMessage(language.messagePatterns.partOwn, [
                    $$.niceTime(),
                    he(data.channelName),
                    channelHash
                ]);

                $('#'+channel.id+'-displayOperCss').remove();
            }

            // Also display in status window
            gateway.statusWindow.appendMessage(language.messagePatterns.partOwn, [
                $$.niceTime(),
                he(data.channelName),
                channelHash
            ]);

            // Set up click handler for rejoin link
            $('.channelRejoin-'+channelHash).click(function(){
                ircCommand.channelJoin(data.channelName);
            });
        });

        ircEvents.on('domain:meNickChanged', function(data) {
            document.title = he(data.newNick) + ' @ ' + mainSettings.networkName;
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

        // User setting information (e.g., user modes)
        ircEvents.on('user:settingInfo', function(data) {
            var isSelf = (guser.me && data.nick === guser.me.nick) || data.nick === guser.nick;

            if (isSelf) {
                // Display for current user
                var settingDisplay = data.settingString || language.none;
                gateway.statusWindow.appendMessage(language.messagePatterns.selfUserSettingInfo, [
                    $$.niceTime(data.time),
                    he(data.nick),
                    settingDisplay
                ]);
            } else {
                // For other users - not yet implemented
                console.log('UI: Received user:settingInfo for another user:', data.nick, '- not yet implemented');
            }
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

        // CTCP VERSION request received
        ircEvents.on('ctcp:versionRequest', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.ctcpRequest, [
                $$.niceTime(),
                he(data.sender),
                'VERSION'
            ]);
        });

        // CTCP USERINFO request received
        ircEvents.on('ctcp:userinfoRequest', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.ctcpRequest, [
                $$.niceTime(),
                he(data.sender),
                'USERINFO'
            ]);
        });

        // CTCP REFERER request received
        ircEvents.on('ctcp:refererRequest', function(data) {
            gateway.statusWindow.appendMessage(language.messagePatterns.ctcpRequest, [
                $$.niceTime(),
                he(data.sender),
                'REFERER'
            ]);
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
        attachUIFunctionsToGateway();
        initDisplayListeners();
    });
})();
