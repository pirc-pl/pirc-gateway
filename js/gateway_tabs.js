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

function Nicklist(chan, id) {
	this.channel = chan;
	this.id = id+'-nicklist';
	this.uiMembers = new Map(); // Map of NicklistUser instances, indexed by ChannelMember.id
	this._eventUnsubscribers = []; // Store unsubscribe functions for cleanup

    // Event listener for when the overall channel member list changes (add/remove)
    var unsubscribe1 = ircEvents.on('domain:channelMemberListChanged', function(data) {
        if (data.channelName.toLowerCase() !== this.channel.toLowerCase()) {
            return;
        }

        if (data.type === 'add') {
            this._addMemberToUI(data.member);
        } else if (data.type === 'remove') {
            this._removeMemberFromUI(data.memberId);
        } else if (data.type === 'update' || data.type === 'nickChange' || data.type === 'modeChange' || data.type === 'levelChange' || data.type === 'awayStatusChange' || data.type === 'accountChange') {
            this._updateMemberInUI(data.member, data.oldNick); // Pass oldNick for potential sorting changes
        }
        this.showChstats(); // Always refresh stats on list change
    }.bind(this));
    this._eventUnsubscribers.push(unsubscribe1);

    // Event listener for when a specific channel member's properties are updated
    var unsubscribe2 = ircEvents.on('domain:channelMemberUpdated', function(data) {
        if (data.channelName.toLowerCase() !== this.channel.toLowerCase()) {
            return;
        }
        this._updateMemberInUI(data.newMember, data.oldNick, data.oldLevel, data.oldModes);
        this.showChstats(); // Always refresh stats on member update
    }.bind(this));
    this._eventUnsubscribers.push(unsubscribe2);

	this.sortFunc = function(a, b) {
        // Note: a and b are NicklistUser instances. Read level and nick from their channelMember.
		if(a.channelMember.level < b.channelMember.level) {
			return 1;
		} else if(a.channelMember.level > b.channelMember.level) {
			return -1;
		} else {
			if(a.channelMember.nick.toLowerCase() < b.channelMember.nick.toLowerCase()) {
				return -1;
			} else if(a.channelMember.nick.toLowerCase() > b.channelMember.nick.toLowerCase()) {
				return 1;
			} else {
				return 0; //nigdy nie powinno nastapic ;p
			}
		}
	}

    this._addMemberToUI = function(channelMember, skipSortAndStats) {
        // Check if already exists to avoid duplicates
        if (this.uiMembers.has(channelMember.id)) {
            return;
        }

        var nickListItem = new NicklistUser(channelMember, this.channel);
        this.uiMembers.set(channelMember.id, nickListItem);

        var $nicklistUl = $('#' + this.id + ' .nicklist');
        $nicklistUl.append(nickListItem.makeHTML());
        nickListItem.setActions();

        // Only sort and update stats if not skipping (for efficiency during bulk add)
        if (!skipSortAndStats) {
            this.sort(); // Re-sort to place the new member in correct position
            this.showChstats();
        }
    };

    this._removeMemberFromUI = function(memberId) {
        var nickListItem = this.uiMembers.get(memberId);
        if (nickListItem) {
            nickListItem.remove(); // Remove its DOM element
            this.uiMembers.delete(memberId);
            this.showChstats();
        }
    };

    this._updateMemberInUI = function(channelMember, oldNick, oldLevel, oldModes) {
        var nickListItem = this.uiMembers.get(channelMember.id);
        if (nickListItem) {
            nickListItem.channelMember = channelMember; // Update the reference to the latest domain object
            nickListItem.refreshHtmlInPlace(); // Refresh its DOM element

            // Check if properties affecting sort order have changed
            var sortChanged = (oldNick && oldNick !== channelMember.nick) ||
                              (oldLevel !== undefined && oldLevel !== channelMember.level) ||
                              (oldModes && JSON.stringify(oldModes) !== JSON.stringify(channelMember.channelModes));

            if (sortChanged) {
                // Re-sort the DOM elements
                this.sort();
            }
            this.showChstats();
        }
    };

	this.sort = function() {
        var $nicklistUl = $('#' + this.id + ' .nicklist');
        var sortedNicklistUsers = Array.from(this.uiMembers.values()).sort(this.sortFunc);
        var sortedElements = [];
        sortedNicklistUsers.forEach(function(nicklistUser) {
            sortedElements.push($('#' + nicklistUser.id));
        });
        $nicklistUl.append(sortedElements); // Append all at once for performance
	}
	this.remove = function() {
		// Unsubscribe from all events
		this._eventUnsubscribers.forEach(function(unsubscribe) {
			if (typeof unsubscribe === 'function') {
				unsubscribe();
			}
		});
		this._eventUnsubscribers = [];

		$('#'+this.id).remove();
		this.uiMembers.clear(); // Clear the map on remove
	}

	this.replaceAllMembers = function(members) {
		// Clear existing members
		this.uiMembers.clear();
		var $nicklistUl = $('#' + this.id + ' .nicklist');
		$nicklistUl.empty();

		// Add all new members efficiently
		if (members && members.length > 0) {
			for (var i = 0; i < members.length; i++) {
				this._addMemberToUI(members[i], true); // Skip sort/stats during bulk add
			}
			// Sort and update stats once after all members are added
			this.sort();
			this.showChstats();
		}
	}






    this.render = function() {
        var $nicklistUl = $('#' + this.id + ' .nicklist');
        $nicklistUl.empty(); // Clear current HTML

        // Retrieve current members from domain or use the ones already in uiMembers
        // For a full re-render, we'd typically ask the domain for the full list.
        // For now, iterate over what's in uiMembers and render.
        var sortedNicklistUsers = Array.from(this.uiMembers.values()).sort(this.sortFunc);

        sortedNicklistUsers.forEach(function(nickListItem) {
            $nicklistUl.append(nickListItem.makeHTML());
            nickListItem.setActions();
        });
        this.showChstats();
    }
	this.showChstats = function() {
		var opCount = 0;
		var normCount = 0;
        this.uiMembers.forEach(function(nickListItem) {
            var modes = nickListItem.channelMember.channelModes; // Use stable user.channelModes
            if(modes && (modes.owner || modes.admin || modes.op || modes.halfop)){
                opCount++;
            } else {
                normCount++;
            }
        });
		var text = '';
		if(normCount > 0){
			text = normCount + ' ' + language.user;
			if(normCount > 1){
				text += language.multipleUsers;
			}
		}
		if(opCount > 0){
			if(text != ''){
				text += ', ';
			}
			text += opCount + ' ' + language.chanOp;
			if(opCount > 1){
				text += language.multipleUsers;
			}
		}
		$('#'+gateway.findChannel(this.channel).id+'-chstats .chstats-text').html(text);
	}
	try {
		$('<span id="'+this.id+'"></span>').hide().appendTo('#nicklist-main');
		$('<ul/>').addClass('nicklist').appendTo('#'+this.id);
	} catch(e) { // FIXME better handling of this exception
		// This is a UI file, should not quit application
		console.error("Failed to create nicklist UI element:", e);
		// Show an error message to the user, but don't stop the app
	}

    // Don't initialize members here - they will be added by the channel:channelCreation event handler
}

function NicklistUser(channelMember, chan) {
    this.channel = chan;
    this.channelMember = channelMember; // The domain ChannelMember object
    // Make DOM ID unique per channel by including sanitized channel name
    var channelId = chan.replace(/^#/g,'').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    this.id = 'nicklist-user-' + channelId + '-' + channelMember.id; // Unique DOM element ID per channel
    this.userStableId = channelMember.id; // Store stable ID for easy lookup/class

	this.makeHTML = function() {
		var index = this.channelMember.level; // Use derived level
		var html = '<li id="'+this.id+'" class="'+this.userStableId+'" data-member-id="'+this.userStableId+'">'+ // Use stable NicklistUser ID for li id, stable user id for class, and data-member-id
			'<table><tr id="'+this.id+'-toggleNickOpt">'+ 
				'<td valign="top">'+ 
					'<img class="chavatar" alt="' + (this.channelMember.registered?language.registered:language.unRegistered) + '" src="'+disp.getAvatarIcon(this.channelMember.nick, this.channelMember.registered)+'" title="' + (this.channelMember.registered?language.registered:language.unRegistered) + '" '+ 
					'id="'+this.id+'-avatarField">'+ 
				'</td><td valign="top">';
		if(index > 0){
			html += '<img class="chrank" alt="'+alt[index]+'" src="'+icons[index]+'" title="'+chStatusInfo[index]+'" />';
		} else {
			html += '<span class="chrank"></span>';
		}
		html += '</td>'+ 
				'<td valign="top" style="text-align:left;width:100%;" class="'+((this.userStableId == guser.me.id)?'ownNick ':'')+'nickname">'+he(this.channelMember.nick)+'</td>'+ // Compare stable IDs for ownNick class
			'</tr></table>'+ 
			'<ul class="options" id="'+this.id+'-opt">'+ 
				'<li class="nicklistAvatar"></li>'+ 
				'<li id="' + this.id + '-openQuery" class="switchTab">' + language.query + '</li>'+ 
				((this.userStableId == guser.me.id)?'':'<li id="'+this.id+'-askIgnore">' + language.ignoreThis + '</li>')+ // Compare stable IDs
				'<li><div style="width:100%;" id="'+this.id+'-toggleNickInfo">' + language.informations + '</div>'+ 
					'<ul class="suboptions" id="'+this.id+'-opt-info'+'">'+ 
						'<li id="'+this.id+'-doWhois">WHOIS</li>'+ 
						'<li id="'+this.id+'-doNickservInfo">NickServ</li>'+ 
						((this.userStableId == guser.me.id)?'':'<li id="'+this.id+'-doCtcpVersion">' + language.softwareVersion + '</li>')+ // Compare stable IDs
					'</ul>'+ 
				'</li>'+ 
				'<li class="' + gateway.findChannel(this.channel).id + '-operActions" style="display:none;"><div style="width:100%;" id="'+this.id+'-toggleNickOptAdmin">' + language.channelAdministration + '</div>'+ 
					'<ul class="suboptions" id="'+this.id+'-opt-admin'+'">'+ 
						'<li id="'+this.id+'-showKick">' + language.kickFromChannel + '</li>';
		if(mainSettings.timedBanMethod == '~t:minutes:'){
			html +=		'<li id="'+this.id+'-showBan">' + language.banUser + '</li>';
		} else if(mainSettings.timedBanMethod == 'ChanServ'){
			html +=		'<li id="'+this.id+'-showBan">' + language.banUsingChanserv + '</li>';
		} else {
		html += 		'<li id="'+this.id+'-givePrivileges">' + language.givePrivileges + '</li>'+ 
						'<li id="'+this.id+'-takePrivileges">' + language.takePrivileges + '</li>'+ 
					// '<li id="'+this.id+'-showBanUni">Banuj</li>'+
					'</ul>'+ 
				'</li>'+ 
			'</ul>';
	}
		return html;
	}

	// New method to refresh the HTML of an existing nicklist item without re-creating the <li> element
	this.refreshHtmlInPlace = function() {
        var $liElement = $('#' + this.id);
        if ($liElement.length === 0) {
            console.warn('NicklistUser: Cannot find DOM element for stable ID:', this.id);
            return;
        }

        // Only update inner parts that are likely to change, leaving collapsible state intact
        var index = this.channelMember.level; // Use derived level

        // Update avatar and rank image (src, alt, title)
        $liElement.find('.chavatar')
            .attr('alt', (this.channelMember.registered?language.registered:language.unRegistered))
            .attr('src', disp.getAvatarIcon(this.channelMember.nick, this.channelMember.registered))
            .attr('title', (this.channelMember.registered?language.registered:language.unRegistered));
        
        var $chrank = $liElement.find('.chrank');
        if(index > 0){
            // If it was a span and now needs to be an img, or vice versa
            if ($chrank.is('span')) {
                $chrank.replaceWith('<img class="chrank" alt="'+alt[index]+'" src="'+icons[index]+'" title="'+chStatusInfo[index]+'" />');
            } else { // Already an img, just update attributes
                $chrank.attr('alt', alt[index])
                       .attr('src', icons[index])
                       .attr('title', chStatusInfo[index]);
            }
        } else {
            // If it was an img and now needs to be a span
            if ($chrank.is('img')) {
                $chrank.replaceWith('<span class="chrank"></span>');
            }
        }


        // Update nickname text and opacity (for away status)
        $liElement.find('.nickname').html(he(this.channelMember.nick));
        if(this.channelMember.away){
            $liElement.find('.nickname').css('opacity', '0.3');
        } else {
            $liElement.find('.nickname').css('opacity', '');
        }

        // Update title attribute (full info tooltip)
        this.showTitle(); // This updates the title attribute of the <li>
        this.displayLoggedIn(); // This updates avatar and account info based on current user data
        
        // Update class for ownNick if needed
        if (this.userStableId == guser.me.id) { // Compare stable IDs
            $liElement.find('.nickname').addClass('ownNick');
        } else {
            $liElement.find('.nickname').removeClass('ownNick');
        }
	}


	this.setActions = function() {
		$('#'+this.id+'-toggleNickOpt').off('click').click(function(){ gateway.toggleNickOpt(this.id); }.bind(this));
		$('#'+this.id+'-openQuery').off('click').click(function(){ gateway.openQuery(this.channelMember.nick, this.channelMember.id) }.bind(this));
		$('#'+this.id+'-askIgnore').off('click').click(function(){ ignore.askIgnore(this.channelMember); }.bind(this));
		$('#'+this.id+'-doWhois').off('click').click(function(){
			if(this.userStableId == guser.me.id) // Compare stable IDs
				gateway.displayOwnWhois = true; // This is a UI flag
			ircEvents.emit('domain:requestWhois', { nick: this.channelMember.nick, time: new Date() }); // Emit domain event
			gateway.toggleNickOpt(this.id);
		}.bind(this));
		$('#'+this.id+'-toggleNickInfo').off('click').click(function(){ gateway.toggleNickOptInfo(this.id); }.bind(this));
		$('#'+this.id+'-doNickservInfo').off('click').click(function(){
			ircEvents.emit('domain:requestNickservInfo', { nick: this.channelMember.nick, time: new Date() }); // Emit domain event
			gateway.toggleNickOpt(this.id);
		}.bind(this));
		$('#'+this.id+'-doCtcpVersion').off('click').click(function(){
			ircEvents.emit('domain:requestCtcp', { nick: this.channelMember.nick, ctcpType: 'VERSION', time: new Date() }); // Emit domain event
			gateway.toggleNickOpt(this.id);
		}.bind(this));
		$('#'+this.id+'-toggleNickOptAdmin').off('click').click(function(){ gateway.toggleNickOptAdmin(this.id); }.bind(this));
		$('#'+this.id+'-showKick').off('click').click(function(){ ircEvents.emit('ui:showKickDialog', { channel: this.channel, nick: this.channelMember.nick }); }.bind(this)); // Emit UI event
		$('#'+this.id+'-showBan').off('click').click(function(){ ircEvents.emit('ui:showBanDialog', { channel: this.channel, nick: this.channelMember.nick }); }.bind(this)); // Emit UI event
		$('#'+this.id+'-givePrivileges').off('click').click(function(){ ircEvents.emit('ui:showPrivilegesDialog', { channel: this.channel, nick: this.channelMember.nick }); }.bind(this)); // Emit UI event
		$('#'+this.id+'-takePrivileges').off('click').click(function(){ ircEvents.emit('ui:showPrivilegesAntiDialog', { channel: this.channel, nick: this.channelMember.nick }); }.bind(this)); // Emit UI event
		/*$('#'+this.id+'-showBanUni').click(function(){ gateway.showBan(this.channel, this.user.nick); }.bind(this));*/
		$('#'+this.id+'-avatarField').off('error').error(function(){ ircEvents.emit('domain:disableAutoAvatar', { nick: this.channelMember.nick }); }.bind(this)); // Emit domain event, rebind error

        // Oper actions visibility, now driven by current user's privileges
        // This logic needs to be moved to gateway_display reacting to a domain event
        // For now, it will remain conditionally displayed based on an external mechanism.
        // It's not directly removed yet to avoid breaking other parts.
	}
	// `setMode` function removed entirely

	this.remove = function() {
		$('#'+this.id).remove();
	}
	this.update = function() { // This update is for the visual aspects of the nicklist item
		this.showTitle();
	}
	this.displayLoggedIn = function() {
		var loggedIn = true;
		if(this.channelMember.account){
			var regText = language.loggedInAs+this.channelMember.account;
		} else if(this.channelMember.registered){
			var regText = language.registered;
		} else {
			var regText = language.unRegistered;
			loggedIn = false;
		}
		var nick = this.channelMember.nick;
		$('#'+this.id+' .chavatar').attr('alt', regText).attr('src', disp.getAvatarIcon(nick, loggedIn)).attr('title', regText).off('error').error(function(){ ircEvents.emit('domain:disableAutoAvatar', { nick: nick }); }); // Emit domain event, rebind error
		$('#'+this.id+'-opt .nicklistAvatar').html(gateway.getMeta(nick, 500));
	}
	this.showTitle = function() {
		var text = '';
		if(this.channelMember.ident && this.channelMember.host){
			text = this.channelMember.nick+'!'+this.channelMember.ident+'@'+this.channelMember.host;
			if(this.channelMember.realname){
				text += ' \n'+this.channelMember.realname;
			}
		}
		if(this.channelMember.away){
			if(text != ''){
				text += '\n';
			}
			text += language.userIsAway;
			if(this.channelMember.away !== true){
				text += ' (' + language.reason + ': '+this.channelMember.away+')';
			}
			$('#'+this.id+' .nickname').css('opacity', '0.3');
		} else {
			$('#'+this.id+' .nickname').css('opacity', '');
		}
		if(this.channelMember.ircOp){
			if(text != ''){
				text += '\n';
			}
			text += language.userIsIrcop;
		}
		if(this.channelMember.bot){
			if(text != ''){
				text += '\n';
			}
			text += language.userIsBot;
		}
		if(this.channelMember.account){
			if(text != ''){
				text += '\n';
			}
			text += language.userIsLoggedIntoAccount+this.channelMember.account;
		} else if(this.channelMember.registered){
			if(text != ''){
				text += '\n';
			}
			text += language.nickIsRegistered;
		}
		if(text != ''){
			$('#'+this.id).attr('title', text);
		}
		this.displayLoggedIn();
	}
	// Removed `this.level = 0;` and `this.id = user.nick.replace(...)` from original constructor end.
}

function Query(nick) {
	this.name = nick;
	this.id = "query-"+this.name.replace(/[^a-z0-9A-Z]+/g, '-').toLowerCase()+Math.round(Math.random()*100);
	this.hilight = false;
	this.newmsg = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
	this.newLines = false;

	this.typing = new typingHandler(this);

	this.toggleClass = function() {
		if(this.ClassAdded) {
			$('#'+this.id+'-tab').removeClass('newmsg');
			this.ClassAdded = false;
		} else if(this.hilight) {
			$('#'+this.id+'-tab').addClass('newmsg');
			this.ClassAdded = true;
		}
	}
	this.markNew = function() {
		disp.playSound();
		if(!this.hilight) {
			this.hilight = window.setInterval('gateway.findQuery("'+this.name+'").toggleClass();', 500);
		}
		if(!disp.focused){
			if(disp.titleBlinkInterval){
				clearInterval(disp.titleBlinkInterval);
			}
			disp.titleBlinkInterval = setInterval(function(){
				var title = document.title;
				document.title = (title == newMessage ? (he(guser.me.nick)+' @ '+mainSettings.networkName) : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		$('#'+this.id+'-tab > a').css('font-weight', 'bold');
		$('#'+this.id+'-tab > a').css('color', '#fff');
	}
	this.markRead = function() {
		if(!this.newLines){
			$('#'+this.id+'-window hr').remove();
		}
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if(this.classAdded) {
			this.toggleClass();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if(document.title == newMessage) document.title = he(guser.me.nick)+' @ '+mainSettings.networkName;
		$('#'+this.id+'-tab > a').css('font-weight', 'normal');
		$('#'+this.id+'-tab > a').css('color', '#CECECE');
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 600);
	}
	this.close = function() {
		$('#'+this.id+'-tab').remove();
		$('#'+this.id+'-window').remove();
		$('#'+this.id+'-topic').remove();
		$('#'+this.id+'-chstats').remove();
		$('#'+this.id+'-tab-info').remove();
		if(this.name.toLowerCase() == gateway.active.toLowerCase()) {
			gateway.switchTab(gateway.tabHistoryLast(this.name)); // Direct UI action
		}
		gateway.removeQuery(this.name); // Direct UI action to clean up the queries array
	}
	this.appendMessage = function(type, args, time) {
		if(!time)
			time = new Date();
		time = time.getTime();
		var rescroll = false;
		var messageData = $.vsprintf(type, args);

		var fullHeight = document.getElementById('chat-wrapper').scrollHeight;
		var currHeight = $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight();
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && currHeight > fullHeight-200) {
			rescroll = true;
		}

		$('#'+this.id+'-window').append(messageData);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
		updateHistory(this.name, this.id, true);
		this.newLines = true;
	}

	this.changeNick = function(newnick) {
		var oldName = this.name.toLowerCase();
		$('#'+this.id+'-window').vprintf(language.messagePatterns.nickChange, [$$.niceTime(), he(this.name), he(newnick)]);
		$('#'+this.id+'-topic').html('<h1>'+he(newnick)+'</h1><h2></h2>');
		$("#"+this.id+'-tab').html('<a href="javascript:void(0);" class="switchTab" id="' + this.id + '-tab-switch">'+he(newnick)+'</a><a href="javascript:void(0);" id="' + this.id + '-tab-close"><div class="close"></div></a>');
		$("#"+this.id+'-tab-switch').click(function(){ gateway.switchTab(newnick); }.bind(this)); // Direct UI action
		$("#"+this.id+'-tab-close').click(function(){ this.close(); }.bind(this)); // Direct UI action
		this.name = newnick;
		if(oldName == gateway.active.toLowerCase()) {
			gateway.switchTab(newnick); // Direct UI action
		}
	}
	this.restoreScroll = function() {
		var active = gateway.getActive();
		if(active && this.name != active.name){
			return;
		}
		if(this.scrollSaved) {
			$('#chat-wrapper').scrollTop(this.scrollPos);
		} else {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
	}
	this.saveScroll = function() {
		if($('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight-150 && $('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight*0.97)   {
			this.scrollSaved = false;
			this.scrollPos = 0;
		} else {
			this.scrollSaved = true;
			this.scrollPos = $('#chat-wrapper').scrollTop();
		}
	}
	this.setMark = function() {
		$('#'+this.id+'-window hr').remove();
		$('#'+this.id+'-window').append('<hr>');
		this.newLines = false;
	}
	$('<span/>').attr('id', this.id+'-window').hide().appendTo('#main-window');
	$('<span/>').attr('id', this.id+'-topic').hide().appendTo('#info');
	$('<span/>').attr('id', this.id+'-tab-info').hide().appendTo('#tab-info');
	$('#'+this.id+'-topic').html('<h1>'+this.name+'</h1><h2></h2>');
	$('<li/>').attr('id', this.id+'-tab').html('<a href="javascript:void(0);" class="switchTab" id="' + this.id + '-tab-switch">'+he(this.name)+'</a><a href="javascript:void(0);" id="' + this.id + '-tab-close"><div class="close" title="' + language.closeQuery + '"></div></a>').appendTo('#tabs');
	$("#"+this.id+'-tab-switch').click(function(){ gateway.switchTab(this.name); }.bind(this)); // Direct UI action
	$("#"+this.id+'-tab-close').click(function(){ this.close(); }.bind(this)); // Direct UI action
	$('#chstats').append('<div class="chstatswrapper" id="'+this.id+'-chstats"><span class="chstats-text symbolFont">' + language.query + '</span></div>');
	try {
		var qCookie = localStorage.getItem('query'+md5(this.name));
		if(qCookie) {
			qCookie = Base64.decode(qCookie).split('\377').join('');
			$('#'+this.id+'-window').vprintf(language.messagePatterns.queryBacklog, [$$.niceTime(), he(this.name)]);
			$('#'+this.id+'-window').append(qCookie);
		}
	} catch(e) {}
	$('#'+this.id+'-window').vprintf(language.messagePatterns.startedQuery, [$$.niceTime(), he(this.name), this.name]);
}

function ChannelTab(chan) {
	this.name = chan;
	this.id = this.name.replace(/^#/g,'').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()+Math.round(Math.random()*100);
	this.nicklist = new Nicklist(this.name, this.id);
	this.modes = new ChannelModes(); // UI representation of channel modes
	this.left = false;
	this.hilight = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
	this.topic = '';
	this.newLines = false;
	this.hasNames = false;
	this.markingSwitch = false; // we use this to alternate the backgrounds of message blocks

	this.typing = new typingHandler(this);

	this.part = function() {
		this.left = true;
		this.hasNames = false;
		this.nicklist.remove();
		this.nicklist = new Nicklist(this.name, this.id); // Re-initialize nicklist UI
		// Clear channel stats display since we're no longer in the channel
		$('#'+this.id+'-chstats .chstats-text').html('');
	}

	this.toggleClass = function() {
		if(this.ClassAdded) {
			$('#'+this.id+'-tab').removeClass('newmsg');
			this.ClassAdded = false;
		} else if(this.hilight) {
			$('#'+this.id+'-tab').addClass('newmsg');
			this.ClassAdded = true;
		}
	}
	this.restoreScroll = function() {
		var active = gateway.getActive();
		if(active && this.name != active.name){
			return;
		}
		if(this.scrollSaved) {
			$('#chat-wrapper').scrollTop(this.scrollPos);
		} else {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
	}
	this.saveScroll = function() {
		if($('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight-150 && $('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight*0.97)   {
			this.scrollSaved = false;
			this.scrollPos = 0;
		} else {
			this.scrollSaved =  true;
			this.scrollPos = $('#chat-wrapper').scrollTop();
		}
	}
	this.setMark = function() {
		$('#'+this.id+'-window hr').remove();
		$('#'+this.id+'-window').append('<hr>');
		this.newLines = false;
	}
	this.toggleClassMsg = function() {
		if(this.ClassAddedMsg) {
			$('#'+this.id+'-tab').removeClass('newmsg2');
			this.ClassAddedMsg = false;
		} else {
			$('#'+this.id+'-tab').addClass('newmsg2');
			this.ClassAddedMsg = true;
		}
	}
	this.markNew = function() {
		disp.playSound();
		if(!this.hilight) {
			this.hilight = window.setInterval('gateway.findChannel("'+this.name+'").toggleClass();', 500);
		}
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
			if(this.classAddedMsg) {
				this.toggleClassMsg();
			}
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 500);
		}
		if(!disp.focused){
			if(disp.titleBlinkInterval){
				clearInterval(disp.titleBlinkInterval);
			}
			document.title = he(guser.me.nick)+' @ '+mainSettings.networkName;
			disp.titleBlinkInterval = setInterval(function(){
				var title = document.title;
				document.title = (title == newMessage ? (he(guser.me.nick)+' @ '+mainSettings.networkName) : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		if(!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval(function(){
				gateway.findChannel(this.name).toggleClassMsg();
			}.bind(this), 500);
		}
	}
	this.markRead = function() {
		if(!this.newLines){
			$('#'+this.id+'-window hr').remove();
		}
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if(this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
		}
		if(this.classAdded) {
			this.toggleClass();
		}
		if(this.classAddedMsg) {
			this.toggleClassMsg();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if(document.title == newMessage) document.title = he(guser.me.nick)+' @ '+mainSettings.networkName;
		$('#'+this.id+'-tab > a').css('font-weight', 'normal');
		$('#'+this.id+'-tab > a').css('color', '#CECECE');
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 600);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 600);
	}
	this.close = function() {
		if(!this.left) {
			this.part();
			ircEvents.emit('domain:requestRemoveChannel', { channelName: this.name, message: language.leftChannel }); // Emit domain event
		}
		this.nicklist.remove();
		$('#'+this.id+'-tab').remove();
		$('#'+this.id+'-window').remove();
		$('#'+this.id+'-topic').remove();
		$('#'+this.id+'-chstats').remove();
		$('#'+this.id+'-tab-info').remove();
		if(this.name.toLowerCase() == gateway.active.toLowerCase()) {
			gateway.switchTab(gateway.tabHistoryLast(this.name)); // Direct UI action
		}
	}
	this.rejoin = function() {
		this.left = false;
		$('#'+this.id+'-window').vprintf(language.messagePatterns.joinOwn, [$$.niceTime(), guser.me.nick, guser.me.ident, guser.me.host, this.name]);
		if(this.name == gateway.active) {
			this.restoreScroll();
		}
	}

	this.appendMessage = function(type, args, time, options) {
		// options can contain: isHistory - whether this is a historical message
		options = options || {};
		if(!time)
			time = new Date();
		var timeMs = time.getTime();
		var rescroll = false;
		var messageData = $.vsprintf(type, args);

		// Add data-time attribute to message div if not already present
		var $messageData = $(messageData);
		if($messageData.hasClass('messageDiv') && !$messageData.attr('data-time')){
			$messageData.attr('data-time', timeMs);
			messageData = $messageData.prop('outerHTML');
		}

		time = timeMs;
		var appended = false;
		var isHistoryBatch = options.isHistory || false; // Use provided flag instead of querying domain

		// Check if we should auto-scroll to bottom after insertion (only for non-history messages)
		var fullHeight = document.getElementById('chat-wrapper').scrollHeight;
		var currHeight = $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight();
		if(!isHistoryBatch && this.name.toLowerCase() == gateway.active.toLowerCase() && currHeight > fullHeight-200) {
			rescroll = true;
		}

		// Save scroll position before inserting history (to maintain visible messages' position)
		var oldScrollHeight = 0;
		var oldScrollTop = 0;
		if(isHistoryBatch && this.name.toLowerCase() == gateway.active.toLowerCase()){
			oldScrollHeight = document.getElementById('chat-wrapper').scrollHeight;
			oldScrollTop = $('#chat-wrapper').scrollTop();
		}

		if(isHistoryBatch){ // history entries may arrive out of order, we handle this here
			var newElement = $(messageData);
			var windowElements = $('#'+this.id+'-window .messageDiv');

			// First pass: try to insert in chronological order among timestamped messages
			for(var i=0; i<windowElements.length; i++){
				var element = windowElements[i];
				var elTime = element.getAttribute('data-time');
				if(!elTime) continue;
				if(elTime > time){
					newElement.insertBefore(element);
					appended = true;
					break;
				}
			}

			// Second pass: if not inserted yet, find the first non-timestamped message
			// from the end (most recent channel join info) and insert before it
			if(!appended){
				// Search backwards to find the start of non-timestamped message sequence at the end
				var channelInfoStart = -1;
				for(var i=windowElements.length-1; i>=0; i--){
					var element = windowElements[i];
					var elTime = element.getAttribute('data-time');
					var elMsgid = element.getAttribute('data-msgid');

					if(!elTime && !elMsgid){
						// Check if there are any timestamped messages after this
						var hasTimestampedAfter = false;
						for(var j=i+1; j<windowElements.length; j++){
							if(windowElements[j].getAttribute('data-time')){
								hasTimestampedAfter = true;
								break;
							}
							if (channelInfoStart !== -1) { // Found non-timestamped, now find previous
								var prevElTime = windowElements[j-1].getAttribute('data-time');
								var prevElMsgid = windowElements[j-1].getAttribute('data-msgid');
								if (prevElTime || prevElMsgid) {
									channelInfoStart = j;
								}
							}
						}
						// If no timestamped messages after, this is part of current join info
						if(!hasTimestampedAfter){
							channelInfoStart = i;
							// Continue searching backwards to find the start of the sequence
						}
					} else if(channelInfoStart !== -1){
						// We found a timestamped message, and we've already found
						// the end of the sequence, so channelInfoStart is the first message
						break;
					}
				}

				if(channelInfoStart !== -1){
					newElement.insertBefore(windowElements[channelInfoStart]);
					appended = true;
				}
			}
		}
		if(!appended)
			$('#'+this.id+'-window').append(messageData);

		// Restore scroll position after inserting history to keep visible messages stationary
		if(isHistoryBatch && this.name.toLowerCase() == gateway.active.toLowerCase() && appended){
			var newScrollHeight = document.getElementById('chat-wrapper').scrollHeight;
			var heightDiff = newScrollHeight - oldScrollHeight;
			if(heightDiff > 0){
				// Adjust scroll position to compensate for added content above
				$('#chat-wrapper').scrollTop(oldScrollTop + heightDiff);
			}
		} else if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}

		updateHistory(this.name, this.id);
		this.newLines = true;

		// Trigger event grouping
		var $newMsg = $(messageData);
		var channelWindow = '#'+this.id+'-window';
		if(!$newMsg.hasClass('event-message')){
			// Non-event message: group immediately (finalizes pending events)
			disp.groupEvents(channelWindow);
		} else {
			// Event message: debounce grouping to handle event-only streams
			clearTimeout(this.groupEventsTimeout);
			this.groupEventsTimeout = setTimeout(function(){
				disp.groupEvents(channelWindow);
			}, 1000);
		}
	}
	this.setTopic = function(topic) {
		$('#'+this.id+'-topic > h2').html($$.colorize(topic));
		$('#'+this.id+'-topic').unbind('click').click(disp.topicClick);
		this.topic = topic;
	}
	this.setTopicSetBy = function(setBy) {
		this.topicSetBy = setBy;
		// Topic metadata is typically shown in channel info, not in the topic bar
	}
	this.setTopicSetDate = function(setDate) {
		this.topicSetDate = setDate;
		// Topic metadata is typically shown in channel info, not in the topic bar
	}
	this.setCreationTime = function(creationTime) {
		this.creationTime = creationTime;
		// Creation time is typically shown in channel info
	}
	this.clearWindow = function() {
		$('#'+this.id+'-window').html(' ');
	}

	$('<span/>').attr('id', this.id+'-window').hide().appendTo('#main-window');
	$('<span/>').attr('id', this.id+'-topic').hide().appendTo('#info');
	$('<span/>').attr('id', this.id+'-tab-info').hide().appendTo('#tab-info');
	$('#'+this.id+'-topic').html('<h1>'+he(this.name)+'</h1><h2></h2>');
	$('<li/>').attr('id', this.id+'-tab').html('<a href="javascript:void(0);" id="' + this.id + '-channelSwitchButton" class="switchTab">'+he(this.name)+'</a>'+
		'<a href="javascript:void(0);" id="' + this.id + '-channelPartButton"><div class="close" title="' + language.leaveChannel + '"></div></a>').appendTo('#tabs');
	$('#chstats').append('<div class="chstatswrapper" id="'+this.id+'-chstats"><span class="chstats-text symbolFont">'+he(this.name)+'</span>'+
		'<span class="chstats-button" id="'+this.id+'-toggleChannelOpts">' +language.channelOptions+ '</span>'+
		'<div id="'+this.id+'-channelOptions" class="channelAdmin"><ul class="channelOptions">' +
			'<div class="nickRegistered"><span>' + language.autoJoinThisChannel + '</span>'+
				'<li id="'+this.id+'-aJoinEnable">' + language.enable + '</li>' +
				'<li id="'+this.id+'-aJoinDisable">' + language.disable + '</li>' +
			'</div>'+
			'<li id="'+this.id+'-clearWindow">' + language.clearMessageWindow + '</li>' +
			'<li id="'+this.id+'-redoNames">' + language.refreshNickList + '</li>' +
		'</ul></div></div>');
	var operHtml = '<div id="'+this.id+'-operActions" class="'+this.id+'-operActions channelAdmin" style="display:none">' +
		'<span class="chstats-button" id="'+this.id+'-openOperActions">' + language.administrativeActions + '</span>'+
		'<ul class="channelOperActions">' +
			'<li id="'+this.id+'-openBanList">' + language.banList + '</li>' +
			'<li id="'+this.id+'-openExceptList" title="' + language.exceptListHint + '">' + language.exceptList + '</li>' +
			'<li id="'+this.id+'-openInvexList" title="' + language.invexListHint + '">' + language.invexList + '</li>' +
			'<li id="'+this.id+'-openChannelModes">' + language.channelModes + '</li>' +
			'<li id="'+this.id+'-showInvitePrompt">' + language.inviteToChannel + '</li>' +
			'<li id="'+this.id+'-showChanservCommands">' + language.chanservCommands + '</li>' +
			'<li id="'+this.id+'-showBotservCommands">' + language.botservCommands + '</li>' +
		'</ul>' +
		'</div>';
	$('#'+this.id+'-chstats').append(operHtml);
	$('#'+this.id+'-channelSwitchButton').click(function(){ gateway.switchTab(this.name); }.bind(this)); // Direct UI action
	$('#'+this.id+'-channelPartButton').click(function(){ ircEvents.emit('domain:requestRemoveChannel', { channelName: this.name, message: language.leftChannel }); }.bind(this)); // Emit domain event
	$('#'+this.id+'-toggleChannelOpts').click(function(){ gateway.toggleChannelOpts(this.name); }.bind(this));
	$('#'+this.id+'-aJoinEnable').click(function(){ ircEvents.emit('domain:requestServiceCommand', { service: 'NickServ', command: 'AJOIN', args: ['ADD', this.name], time: new Date() }); }.bind(this)); // Emit domain event
	$('#'+this.id+'-aJoinDisable').click(function(){ ircEvents.emit('domain:requestServiceCommand', { service: 'NickServ', command: 'AJOIN', args: ['DEL', this.name], time: new Date() }); }.bind(this)); // Emit domain event
	$('#'+this.id+'-clearWindow').click(this.clearWindow.bind(this));
	$('#'+this.id+'-redoNames').click(function(){ ircEvents.emit('domain:requestRedoNames', { channelName: this.name, time: new Date() }); }.bind(this)); // Emit domain event
	$('#'+this.id+'-openOperActions').click(function(){ gateway.toggleChannelOperOpts(this.name); }.bind(this));
	$('#'+this.id+'-openBanList').click(function(){ ircEvents.emit('domain:requestModeList', { channelName: this.name, mode: 'b', time: new Date() }); }.bind(this)); // Emit domain event
	$('#'+this.id+'-openExceptList').click(function(){ ircEvents.emit('domain:requestModeList', { channelName: this.name, mode: 'e', time: new Date() }); }.bind(this)); // Emit domain event
	$('#'+this.id+'-openInvexList').click(function(){ ircEvents.emit('domain:requestModeList', { channelName: this.name, mode: 'I', time: new Date() }); }.bind(this)); // Emit domain event
	$('#'+this.id+'-openChannelModes').click(function(){ ircEvents.emit('ui:showChannelModesDialog', { channelName: this.name }); }.bind(this)); // Emit UI event
	$('#'+this.id+'-showInvitePrompt').click(function(){ ircEvents.emit('ui:showInvitePromptDialog', { channelName: this.name }); }.bind(this)); // Emit UI event
	$('#'+this.id+'-showChanservCommands').click(function(){ ircEvents.emit('ui:showChanServCmdsDialog', { channelName: this.name }); }.bind(this)); // Emit UI event
	$('#'+this.id+'-showBotservCommands').click(function(){ ircEvents.emit('ui:showBotServCmdsDialog', { channelName: this.name }); }.bind(this)); // Emit UI event
	this.setTopic('');
	// guser.setUmode(false); // This is domain logic and should be handled by domain events.
	try {
		var qCookie = localStorage.getItem('channel'+md5(this.name));
		if(qCookie) {
			qCookie = Base64.decode(qCookie).split('\377').join('');
			$('#'+this.id+'-window').vprintf(language.messagePatterns.channelBacklog, [$$.niceTime(), he(this.name)]);
			$('#'+this.id+'-window').append(qCookie);
			$('#'+this.id+'-window').vprintf(language.messagePatterns.channelBacklogEnd, [$$.niceTime()]);
		}
	} catch(e) {}
}

function Status() {
	this.name = "--status";
	this.id = "--status";
	this.hilight = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
	this.newLines = false;
	this.modes = {}; // to avoid exceptions

	this.toggleClass = function() {
		if(this.ClassAdded) {
			$('#'+this.id+'-tab').removeClass('newmsg');
			this.ClassAdded = false;
		} else if(this.hilight) {
			$('#'+this.id+'-tab').addClass('newmsg');
			this.ClassAdded = true;
		}
	}
	this.restoreScroll = function() {
		var active = gateway.getActive();
		if(active){
			return;
		}
		if(this.scrollSaved) {
			$('#chat-wrapper').scrollTop(this.scrollPos);
		} else {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
	}
	this.saveScroll = function() {
		if($('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight-150 && $('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight*0.97)   {
			this.scrollSaved = false;
			this.scrollPos = 0;
		} else {
			this.scrollSaved =  true;
			this.scrollPos = $('#chat-wrapper').scrollTop();
		}
	}
	this.setMark = function() {
		$('#'+this.id+'-window hr').remove();
		$('#'+this.id+'-window').append('<hr>');
		this.newLines = false;
	}
	this.toggleClassMsg = function() {
		if(this.ClassAddedMsg) {
			$('#'+this.id+'-tab').removeClass('newmsg2');
			this.ClassAddedMsg = false;
		} else {
			$('#'+this.id+'-tab').addClass('newmsg2');
			this.ClassAddedMsg = true;
		}
	}
	this.markNew = function() {
		disp.playSound();
		if(!this.hilight) {
			this.hilight = window.setInterval('gateway.statusWindow.toggleClass();', 500);
		}
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
			if(this.classAddedMsg) {
				this.toggleClassMsg();
			}
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 500);
		}
		if(!disp.focused){
			if(disp.titleBlinkInterval){
				clearInterval(disp.titleBlinkInterval);
			}
			document.title = he(guser.me.nick)+' @ '+mainSettings.networkName;
			disp.titleBlinkInterval = setInterval(function(){
				var title = document.title;
				document.title = (title == newMessage ? (he(guser.me.nick)+' @ '+mainSettings.networkName) : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		if(gateway.active == '--status'){
			return;
		}
		if(!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval('gateway.statusWindow.toggleClassMsg();', 500);
		}
	}
	this.markRead = function() {
		if(!this.newLines){
			$('#'+this.id+'-window hr').remove();
		}
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if(this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
		}
		if(this.classAdded) {
			this.toggleClass();
		}
		if(this.classAddedMsg) {
			this.toggleClassMsg();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if(document.title == newMessage) document.title = he(guser.me.nick)+' @ '+mainSettings.networkName;
		$('#'+this.id+'-tab > a').css('font-weight', 'normal');
		$('#'+this.id+'-tab > a').css('color', '#CECECE');
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 600);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 600);
	}
	this.appendMessage = function(type, args, time) {
		// not supporting the 'time' for now
		var rescroll = false;
		var fullHeight = document.getElementById('chat-wrapper').scrollHeight;
		var currHeight = $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight();
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && currHeight > fullHeight-200) {
			rescroll = true;
		}
		$('#'+this.id+'-window').vprintf(type, args);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}

		this.newLines = true;
	}
}

function updateHistory(name, id, query){
	if(query){
		var type = 'query';
	} else {
		var type = 'channel';
	}
	try {
		var qCookie = '';
		var count = 0;
		var windowElements = $('#'+id+'-window .messageDiv');
		for(var i = windowElements.length-1; i >= 0; i--){
			var html = windowElements[i].outerHTML;
			if(html == '' || html.match(/class="join"/) || html.match(/class="mode"/) || html.match(/data-label="/)){
				continue;
			}
			qCookie = html + '\377' + qCookie;
			count++;
			if(count >= settings.backlogLength){
				break;
			}
		}
		localStorage.setItem(type+md5(name), Base64.encode(qCookie));
	} catch(e){ 
	}
}

function typingHandler(tab){
	this.tab = tab;
	this.list = [];
	this.start = function(user, time){
		if(user == guser.me) // Compare with domain's guser.me
			return;
		var idx = this.findUser(user);
		if(idx === false){
			var timeout = setTimeout(function(){ this.stop(user); }.bind(this), time*1000);
			var t = {'user': user, 'timeout': timeout };
			this.list.push(t);
			this.display();
		} else {
			clearTimeout(this.list[idx].timeout);
			this.list[idx].timeout = setTimeout(function(){ this.stop(user); }.bind(this), time*1000);
		}
	};
	this.stop = function(user){
		var idx = this.findUser(user);
		if(idx === false)
			return;
		clearTimeout(this.list[idx].timeout);
		this.list.splice(idx, 1);
		this.display();
	};
	this.findUser = function(user){
		for(var i=0; i<this.list.length; i++){
			if(this.list[i].user.id == user.id) // Compare stable user.id
				return i;
		}
		return false;
	};
	this.clear = function(){
		for(var i=0; i<this.list.length; i++){
			clearTimeout(this.list[i].timeout);
		}
		this.list = [];
		this.display();
	};
	this.display = function(){
		var infoText = '';
		if(this.list.length > 0){
			for(var i=0; i<this.list.length; i++){
				if(infoText.length > 0){
					infoText += ', ';
				}
				infoText += this.list[i].user.nick;
			}
			if(this.list.length == 1){
				infoText += ' ' + language.isTyping;
			} else {
				infoText += ' ' + language.areTyping;
			}
		}
		$('#'+this.tab.id+'-tab-info').html(infoText);
	};
}

function ListWindow() {
	this.name = "--list";
	this.id = "--list-" + Math.round(Math.random()*100);
	this.hilight = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
	this.data = [];
	this.loading = false;
	this.sortColumn = 1; // Default sort by user count
	this.sortAsc = false; // Default descending

	this.toggleClass = function() {
		if(this.classAdded) {
			$('#'+this.id+'-tab').removeClass('newmsg');
			this.classAdded = false;
		} else if(this.hilight) {
			$('#'+this.id+'-tab').addClass('newmsg');
			this.classAdded = true;
		}
	};
	this.markNew = function() {
		if(!this.hilight) {
			this.hilight = window.setInterval(function(){ gateway.listWindow.toggleClass(); }, 500);
		}
	};
	this.markRead = function() {
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if(this.classAdded) {
			this.toggleClass();
		}
		$('#'+this.id+'-tab > a').css('font-weight', 'normal');
		var tabId = this.id;
		setTimeout(function(){ $('#'+tabId+'-tab').removeClass('newmsg'); }, 100);
	};
	this.restoreScroll = function() {
		if(gateway.active != this.name) return;
		if(this.scrollSaved) {
			$('#chat-wrapper').scrollTop(this.scrollPos);
		} else {
			$('#chat-wrapper').scrollTop(0);
		}
	};
	this.saveScroll = function() {
		if($('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight-150 && $('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight*0.97)   {
			this.scrollSaved = false;
			this.scrollPos = 0;
		} else {
			this.scrollSaved = true;
			this.scrollPos = $('#chat-wrapper').scrollTop();
		}
	};
	this.setMark = function() {
		// List window doesn't need read marks
	};
	this.close = function() {
		$('#'+this.id+'-tab').remove();
		$('#'+this.id+'-window').remove();
		$('#'+this.id+'-topic').remove();
		$('#'+this.id+'-chstats').remove();
		$('#'+this.id+'-tab-info').remove();
		if(this.name == gateway.active) {
			gateway.switchTab(gateway.tabHistoryLast(this.name)); // Direct UI action
		}
		ircEvents.emit('domain:requestRemoveListWindow', { listName: this.name }); // Emit domain event
	};
	this.clearData = function() {
		this.data = [];
		this.loading = true;
		$('#'+this.id+'-window').html('<div class="listWindowLoading">' + language.loadingWait + '</div>');
	};
	this.addEntry = function(channel, users, topic) {
		this.data.push([channel, parseInt(users), topic]);
	};
	this.render = function() {
		this.loading = false;
		if(this.data.length == 0) {
			$('#'+this.id+'-window').html('<div class="listWindowEmpty">' + language.noChannelsFound + '</div>');
			return;
		}
		this.sortData();
		var html = '<table class="listWindowTable">';
		html += '<thead><tr>';
		html += '<th class="listWindowChannel" data-col="0">' + language.channelListChannel + ' ' + this.getSortIndicator(0) + '</th>';
		html += '<th class="listWindowUsers" data-col="1">' + language.channelListUsers + ' ' + this.getSortIndicator(1) + '</th>';
		html += '<th class="listWindowTopic" data-col="2">' + language.channelListTopic + ' ' + this.getSortIndicator(2) + '</th>';
		html += '</tr></thead><tbody>';
		for(var i = 0; i < this.data.length; i++) {
			var item = this.data[i];
			var channelName = item[0];
			var userCount = item[1];
			var topic = item[2];
			if(channelName == '*') {
				html += '<tr><td class="listWindowChannel"><i>(' + language.channelHidden + ')</i></td>';
				html += '<td class="listWindowUsers">' + he(userCount) + '</td>';
				html += '<td class="listWindowTopic"><i>(' + language.topicHidden + ')</i></td></tr>';
			} else {
				html += '<tr><td class="listWindowChannel"><a href="javascript:ircEvents.emit(\'domain:requestJoinChannel\', { channelName: \'' + bsEscape(channelName) + '\' })">' + he(channelName) + '</a></td>'; // Emit domain event
				html += '<td class="listWindowUsers">' + he(userCount) + '</td>';
				html += '<td class="listWindowTopic">' + $$.colorize(topic) + '</td></tr>';
			}
		}
		html += '</tbody></table>';
		$('#'+this.id+'-window').html(html);
		// Bind header click events for sorting
		var self = this;
		$('#'+this.id+'-window .listWindowTable thead th').click(function() {
			var col = parseInt($(this).attr('data-col'));
			if(self.sortColumn == col) {
				self.sortAsc = !self.sortAsc;
			} else {
				self.sortColumn = col;
				self.sortAsc = (col == 0); // Asc for channel name, desc for others
			}
			self.render();
		});
	};
	this.sortData = function() {
		var col = this.sortColumn;
		var asc = this.sortAsc;
		this.data.sort(function(a, b) {
			var valA = a[col];
			var valB = b[col];
			if(typeof valA === 'string') {
				valA = valA.toLowerCase();
				valB = valB.toLowerCase();
			}
			if(valA < valB) return asc ? -1 : 1;
			if(valA > valB) return asc ? 1 : -1;
			return 0;
		});
	};
	this.getSortIndicator = function(col) {
		if(this.sortColumn != col) return '';
		return this.sortAsc ? '▲' : '▼';
	};

	// Create DOM elements
	$('<span/>').attr('id', this.id+'-window').addClass('listWindowContent').hide().appendTo('#main-window');
	$('<span/>').attr('id', this.id+'-topic').hide().appendTo('#info');
	$('<span/>').attr('id', this.id+'-tab-info').hide().appendTo('#tab-info');
	$('#'+this.id+'-topic').html('<h1>' + language.channelListTitle + '</h1><h2></h2>');
	$('<li/>').attr('id', this.id+'-tab').html('<a href="javascript:void(0);" id="' + this.id + '-tab-switch">' + language.channelListTitle + '</a><a href="javascript:void(0);" id="' + this.id + '-tab-close"><div class="close" title="' + language.close + '"></div></a>').appendTo('#tabs');
	$('#'+this.id+'-tab-switch').click(function(){ gateway.switchTab(this.name); }.bind(this)); // Direct UI action
	$('#'+this.id+'-tab-close').click(function(){ this.close(); }.bind(this));
	$('#chstats').append('<div class="chstatswrapper" id="'+this.id+'-chstats"><span class="chstats-text symbolFont">' + language.channelListTitle + '</span></div>');
}
