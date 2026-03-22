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

class Nicklist {
	constructor(chan, id) {
		this.channel = chan;
		this.id = `${id  }-nicklist`;
		this.uiMembers = new Map(); // Map of NicklistUser instances, indexed by ChannelMember.id
		this._eventUnsubscribers = []; // Store unsubscribe functions for cleanup

		// Event listener for when the overall channel member list changes (add/remove)
		const unsubscribe1 = commandBus.on('chat:channelMemberListChanged', (data) => {
			if (data.channelName.toLowerCase() !== this.channel.toLowerCase()) {
				return;
			}

			if (data.type === 'add') {
				this._addMemberToUI(data.member);
			} else if (data.type === 'remove') {
				this._removeMemberFromUI(data.memberId);
			} else if (data.type === 'update' || data.type === 'nickChange' || data.type === 'modeChange' || data.type === 'levelChange' || data.type === 'awayStatusChange' || data.type === 'accountChange' || data.type === 'avatarChange' || data.type === 'registeredChange') {
				this._updateMemberInUI(data.member, data.oldNick); // Pass oldNick for potential sorting changes
			}
			this.showChstats(); // Always refresh stats on list change
		});
		this._eventUnsubscribers.push(unsubscribe1);

		// Event listener for when a specific channel member's properties are updated
		const unsubscribe2 = commandBus.on('chat:channelMemberUpdated', (data) => {
			if (data.channelName.toLowerCase() !== this.channel.toLowerCase()) {
				return;
			}
			this._updateMemberInUI(data.newMember, data.oldNick, data.oldLevel, data.oldModes);
			this.showChstats(); // Always refresh stats on member update
		});
		this._eventUnsubscribers.push(unsubscribe2);

		try {
			$(`<span id="${  this.id  }"></span>`).hide().appendTo('#nicklist-main');
			$('<ul/>').addClass('nicklist').appendTo(`#${  this.id}`);
		} catch (e) { // FIXME better handling of this exception
			// This is a UI file, should not quit application
			console.error('Failed to create nicklist UI element:', e);
			// Show an error message to the user, but don't stop the app
		}

		// Don't initialize members here - they will be added by the channel:channelCreation event handler
	}

	sortFunc(a, b) {
		// Note: a and b are NicklistUser instances. Read level and nick from their channelMember.
		if (a.channelMember.level < b.channelMember.level) {
			return 1;
		} else if (a.channelMember.level > b.channelMember.level) {
			return -1;
		} else {
			if (a.channelMember.user.nick.toLowerCase() < b.channelMember.user.nick.toLowerCase()) {
				return -1;
			} else if (a.channelMember.user.nick.toLowerCase() > b.channelMember.user.nick.toLowerCase()) {
				return 1;
			} else {
				return 0; //nigdy nie powinno nastapic ;p
			}
		}
	}

	_addMemberToUI(channelMember, skipSortAndStats) {
		// Check if already exists to avoid duplicates
		if (this.uiMembers.has(channelMember.id)) {
			return;
		}

		const nickListItem = new NicklistUser(channelMember, this.channel);
		this.uiMembers.set(channelMember.id, nickListItem);

		const $nicklistUl = $(`#${  this.id  } .nicklist`);
		$nicklistUl.append(nickListItem.makeHTML());
		nickListItem.setActions();

		// Only sort and update stats if not skipping (for efficiency during bulk add)
		if (!skipSortAndStats) {
			this.sort(); // Re-sort to place the new member in correct position
			this.showChstats();
		}
	}

	_removeMemberFromUI(memberId) {
		const nickListItem = this.uiMembers.get(memberId);
		if (nickListItem) {
			nickListItem.remove(); // Remove its DOM element
			this.uiMembers.delete(memberId);
			this.showChstats();
		}
	}

	_updateMemberInUI(channelMember, oldNick, oldLevel, oldModes) {
		const nickListItem = this.uiMembers.get(channelMember.id);
		if (nickListItem) {
			nickListItem.channelMember = channelMember; // Update the reference to the latest chat object
			nickListItem.refreshHtmlInPlace(); // Refresh its DOM element

			// Check if properties affecting sort order have changed
			const sortChanged = (oldNick && oldNick !== channelMember.user.nick) ||
                              (oldLevel !== undefined && oldLevel !== channelMember.level) ||
                              (oldModes && JSON.stringify(oldModes) !== JSON.stringify(channelMember.channelModes));

			if (sortChanged) {
				// Re-sort the DOM elements
				this.sort();
			}
			this.showChstats();
		}
	}

	sort() {
		const $nicklistUl = $(`#${  this.id  } .nicklist`);
		const sortedNicklistUsers = Array.from(this.uiMembers.values()).sort((a, b) => this.sortFunc(a, b));
		const sortedElements = [];
		sortedNicklistUsers.forEach((nicklistUser) => {
			sortedElements.push($(`#${  nicklistUser.id}`));
		});
		$nicklistUl.append(sortedElements); // Append all at once for performance
	}

	remove() {
		// Unsubscribe from all events
		this._eventUnsubscribers.forEach((unsubscribe) => {
			if (typeof unsubscribe === 'function') {
				unsubscribe();
			}
		});
		this._eventUnsubscribers = [];

		$(`#${  this.id}`).remove();
		this.uiMembers.clear(); // Clear the map on remove
	}

	replaceAllMembers(members) {
		// Clear existing members
		this.uiMembers.clear();
		const $nicklistUl = $(`#${  this.id  } .nicklist`);
		$nicklistUl.empty();

		// Add all new members efficiently
		if (members && members.length > 0) {
			for (const member of members) {
				this._addMemberToUI(member, true); // Skip sort/stats during bulk add
			}
			// Sort and update stats once after all members are added
			this.sort();
			this.showChstats();
		}
	}

	render() {
		const $nicklistUl = $(`#${  this.id  } .nicklist`);
		$nicklistUl.empty(); // Clear current HTML

		// Retrieve current members from chat or use the ones already in uiMembers
		// For a full re-render, we'd typically ask the chat for the full list.
		// For now, iterate over what's in uiMembers and render.
		const sortedNicklistUsers = Array.from(this.uiMembers.values()).sort((a, b) => this.sortFunc(a, b));

		sortedNicklistUsers.forEach((nickListItem) => {
			$nicklistUl.append(nickListItem.makeHTML());
			nickListItem.setActions();
		});
		this.showChstats();
	}

	showChstats() {
		let opCount = 0;
		let normCount = 0;
		this.uiMembers.forEach((nickListItem) => {
			const modes = nickListItem.channelMember.channelModes; // Use stable user.channelModes
			if (modes && (modes.owner || modes.admin || modes.op || modes.halfop)) {
				opCount++;
			} else {
				normCount++;
			}
		});
		let text = '';
		if (normCount > 0) {
			text = `${normCount  } ${  language.user}`;
			if (normCount > 1) {
				text += language.multipleUsers;
			}
		}
		if (opCount > 0) {
			if (text != '') {
				text += ', ';
			}
			text += `${opCount  } ${  language.chanOp}`;
			if (opCount > 1) {
				text += language.multipleUsers;
			}
		}
		$(`#${  uiTabs.findChannel(this.channel).id  }-chstats .chstats-text`).html(text);
	}
}

class NicklistUser {
	constructor(channelMember, chan) {
		this.channel = chan;
		this.channelMember = channelMember; // The chat ChannelMember object
		// Make DOM ID unique per channel by including sanitized channel name
		const channelId = chan.replace(/^#/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
		this.id = `nicklist-user-${  channelId  }-${  channelMember.id}`; // Unique DOM element ID per channel
		this.userStableId = channelMember.id; // Store stable ID for easy lookup/class
	}

	makeHTML() {
		const index = this.channelMember.level;
		const isOwnNick = this.userStableId == connection.chat.me.userRef.id;
		const avatarTitle = this.channelMember.user.registered ? language.registered : language.unRegistered;

		const $avatar = $('<img>', {
			class: 'chavatar',
			alt: '',
			src: disp.getAvatarIcon(this.channelMember.user.nick, this.channelMember.user.registered),
			title: avatarTitle,
			id: `${this.id}-avatarField`
		});

		const $rank = index > 0
			? $('<img>', { class: 'chrank', alt: alt[index], src: icons[index], title: chStatusInfo[index] })
			: $('<span>', { class: 'chrank' });

		const $nickTd = $('<td>', {
			valign: 'top',
			style: 'text-align:left;width:100%;',
			class: `${isOwnNick ? 'ownNick ' : ''  }nickname`
		}).text(this.channelMember.user.nick);

		const $row = $('<tr>', { id: `${this.id}-toggleNickOpt` })
			.append($('<td>', { valign: 'top' }).append($avatar))
			.append($('<td>', { valign: 'top' }).append($rank))
			.append($nickTd);

		const $infoSuboptions = $('<ul>', { class: 'suboptions', id: `${this.id}-opt-info` })
			.append($('<li>', { id: `${this.id}-doWhois` }).text('WHOIS'))
			.append($('<li>', { id: `${this.id}-doNickservInfo` }).text('NickServ'));
		if (!isOwnNick) {
			$infoSuboptions.append($('<li>', { id: `${this.id}-doCtcpVersion` }).text(language.softwareVersion));
		}

		const $infoLi = $('<li>')
			.append($('<div>', { style: 'width:100%;', id: `${this.id}-toggleNickInfo` }).text(language.informations))
			.append($infoSuboptions);

		const $adminSuboptions = $('<ul>', { class: 'suboptions', id: `${this.id}-opt-admin` })
			.append($('<li>', { id: `${this.id}-showKick` }).text(language.kickFromChannel));
		if (mainSettings.timedBanMethod == '~t:minutes:') {
			$adminSuboptions.append($('<li>', { id: `${this.id}-showBan` }).text(language.banUser));
		} else if (mainSettings.timedBanMethod == 'ChanServ') {
			$adminSuboptions.append($('<li>', { id: `${this.id}-showBan` }).text(language.banUsingChanserv));
		}
		$adminSuboptions
			.append($('<li>', { id: `${this.id}-givePrivileges` }).text(language.givePrivileges))
			.append($('<li>', { id: `${this.id}-takePrivileges` }).text(language.takePrivileges));

		const $adminLi = $('<li>', {
			class: `${uiTabs.findChannel(this.channel).id}-operActions`,
			style: 'display:none;'
		})
			.append($('<div>', { style: 'width:100%;', id: `${this.id}-toggleNickOptAdmin` }).text(language.channelAdministration))
			.append($adminSuboptions);

		const $options = $('<ul>', { class: 'options', id: `${this.id}-opt` })
			.append($('<li>', { class: 'nicklistAvatar' }))
			.append($('<li>', { id: `${this.id}-openQuery`, class: 'switchTab' }).text(language.query));
		if (!isOwnNick) {
			$options.append($('<li>', { id: `${this.id}-askIgnore` }).text(language.ignoreThis));
		}
		$options.append($infoLi).append($adminLi);

		return $('<li>', {
			id: this.id,
			class: this.userStableId,
			'data-member-id': this.userStableId
		})
			.append($('<table>').append($row))
			.append($options);
	}

	// New method to refresh the HTML of an existing nicklist item without re-creating the <li> element
	refreshHtmlInPlace() {
		const $liElement = $(`#${  this.id}`);
		if ($liElement.length === 0) {
			console.warn('NicklistUser: Cannot find DOM element for stable ID:', this.id);
			return;
		}

		// Only update inner parts that are likely to change, leaving collapsible state intact
		const index = this.channelMember.level; // Use derived level
		const { user } = this.channelMember;

		// Update avatar and rank image (src, alt, title)
		$liElement.find('.chavatar')
			.attr('alt', (user.registered ? language.registered : language.unRegistered))
			.attr('src', disp.getAvatarIcon(user.nick, user.registered))
			.attr('title', (user.registered ? language.registered : language.unRegistered));

		const $chrank = $liElement.find('.chrank');
		if (index > 0) {
			// If it was a span and now needs to be an img, or vice versa
			if ($chrank.is('span')) {
				$chrank.replaceWith($('<img>', { class: 'chrank', alt: alt[index], src: icons[index], title: chStatusInfo[index] }));
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
		$liElement.find('.nickname').text(user.nick);
		if (user.away) {
			$liElement.find('.nickname').css('opacity', '0.3');
		} else {
			$liElement.find('.nickname').css('opacity', '');
		}

		// Update title attribute (full info tooltip)
		this.showTitle(); // This updates the title attribute of the <li>
		this.displayLoggedIn(); // This updates avatar and account info based on current user data

		// Update class for ownNick if needed
		if (this.userStableId == connection.chat.me.userRef.id) { // Compare stable IDs
			$liElement.find('.nickname').addClass('ownNick');
		} else {
			$liElement.find('.nickname').removeClass('ownNick');
		}
	}

	setActions() {
		$(`#${  this.id  }-toggleNickOpt`).off('click').click(() => { uiNicklist.toggleNickOpt(this.id); });
		$(`#${  this.id  }-openQuery`).off('click').click(() => { uiTabs.openQuery(this.channelMember.user.nick, this.channelMember.id); });
		$(`#${  this.id  }-askIgnore`).off('click').click(() => { ignore.askIgnore(this.channelMember.user); });
		$(`#${  this.id  }-doWhois`).off('click').click(() => {
			if (this.userStableId == connection.chat.me.userRef.id) // Compare stable IDs
				uiState.displayOwnWhois = true; // This is a UI flag
			commandBus.emit('chat:requestWhois', { nick: this.channelMember.user.nick, time: new Date() }); // Emit chat event
			uiNicklist.toggleNickOpt(this.id);
		});
		$(`#${  this.id  }-toggleNickInfo`).off('click').click(() => { uiNicklist.toggleNickOptInfo(this.id); });
		$(`#${  this.id  }-doNickservInfo`).off('click').click(() => {
			commandBus.emit('chat:requestNickservInfo', { nick: this.channelMember.user.nick, time: new Date() }); // Emit chat event
			uiNicklist.toggleNickOpt(this.id);
		});
		$(`#${  this.id  }-doCtcpVersion`).off('click').click(() => {
			commandBus.emit('chat:requestCtcp', { nick: this.channelMember.user.nick, ctcpType: 'VERSION', time: new Date() }); // Emit chat event
			uiNicklist.toggleNickOpt(this.id);
		});
		$(`#${  this.id  }-toggleNickOptAdmin`).off('click').click(() => { uiNicklist.toggleNickOptAdmin(this.id); });
		$(`#${  this.id  }-showKick`).off('click').click(() => { uiDialogs.showKick(this.channel, this.channelMember.user.nick); });
		$(`#${  this.id  }-showBan`).off('click').click(() => { services.showBan(this.channel, this.channelMember.user.nick); });
		$(`#${  this.id  }-givePrivileges`).off('click').click(() => { uiDialogs.showStatus(this.channel, this.channelMember.user.nick); });
		$(`#${  this.id  }-takePrivileges`).off('click').click(() => { uiDialogs.showStatusAnti(this.channel, this.channelMember.user.nick); });
		/*$('#'+this.id+'-showBanUni').click(function(){ uiDialogs.showBan(this.channel, this.user.nick); }.bind(this));*/
		$(`#${  this.id  }-avatarField`).off('error').error(() => { const u = connection.chat.users.getExistingUser(this.channelMember.user.nick); if (u) uiState.disabledAvatarIds[u.id] = true; });

		// Oper actions visibility, now driven by current user's privileges
		// This logic needs to be moved to gateway_display reacting to a chat event
		// For now, it will remain conditionally displayed based on an external mechanism.
		// It's not directly removed yet to avoid breaking other parts.
	}
	// `setMode` function removed entirely

	remove() {
		$(`#${  this.id}`).remove();
	}

	update() { // This update is for the visual aspects of the nicklist item
		this.showTitle();
	}

	displayLoggedIn() {
		const { user } = this.channelMember;
		let loggedIn = true;
		let regText;
		if (user.account) {
			regText = language.loggedInAs + user.account;
		} else if (user.registered) {
			regText = language.registered;
		} else {
			regText = language.unRegistered;
			loggedIn = false;
		}
		const nick = user.nick;
		$(`#${  this.id  } .chavatar`).attr('alt', '').attr('src', disp.getAvatarIcon(nick, loggedIn)).attr('title', regText).off('error').error(() => { const u = connection.chat.users.getExistingUser(nick); if (u) uiState.disabledAvatarIds[u.id] = true; });
		$(`#${  this.id  }-opt .nicklistAvatar`).html(uiHelpers.getMeta(nick, 500));
	}

	showTitle() {
		const u = this.channelMember.user;
		let text = '';
		if (u.ident && u.host) {
			text = `${u.nick  }!${  u.ident  }@${  u.host}`;
			if (u.realname) {
				text += ` \n${  u.realname}`;
			}
		}
		if (u.away) {
			if (text != '') {
				text += '\n';
			}
			text += language.userIsAway;
			if (u.away !== true) {
				text += ` (${  language.reason  }: ${  u.away  })`;
			}
			$(`#${  this.id  } .nickname`).css('opacity', '0.3');
		} else {
			$(`#${  this.id  } .nickname`).css('opacity', '');
		}
		if (u.ircOp) {
			if (text != '') {
				text += '\n';
			}
			text += language.userIsIrcop;
		}
		if (u.bot) {
			if (text != '') {
				text += '\n';
			}
			text += language.userIsBot;
		}
		if (u.account) {
			if (text != '') {
				text += '\n';
			}
			text += language.userIsLoggedIntoAccount + u.account;
		} else if (u.registered) {
			if (text != '') {
				text += '\n';
			}
			text += language.nickIsRegistered;
		}
		if (text != '') {
			$(`#${  this.id}`).attr('title', text);
		}
		this.displayLoggedIn();
	}
	// Removed `this.level = 0;` and `this.id = user.nick.replace(...)` from original constructor end.
}

// Returns true if #chat-wrapper is scrolled to (or very near) the bottom.
function chatIsAtBottom() {
	const cw = document.getElementById('chat-wrapper');
	if (!cw) return true;
	return cw.scrollTop + cw.clientHeight >= cw.scrollHeight - 5;
}

// Finds the bottommost visible timestamped message in a tab window.
// Returns {el, offset} where offset = element top relative to chat-wrapper top, or null.
function findScrollAnchor(tabId, cw) {
	const cwRect = cw.getBoundingClientRect();
	const msgs = document.querySelectorAll(`#${  tabId  }-window .messageDiv[data-time]`);
	let anchor = null;
	let anchorOffset = 0;
	for (const el of msgs) {
		const rect = el.getBoundingClientRect();
		const offsetInCw = rect.top - cwRect.top;
		if (offsetInCw >= 0 && offsetInCw < cw.clientHeight) {
			anchor = el;
			anchorOffset = offsetInCw;
			// keep going to find the bottommost (newest) visible element
		}
		if (offsetInCw >= cw.clientHeight) break;
	}
	return anchor ? {el: anchor, offset: anchorOffset} : null;
}

class Query {
	constructor(nick) {
		this.name = nick;
		this.id = `query-${  this.name.replace(/[^a-z0-9A-Z]+/g, '-').toLowerCase()  }${Math.round(Math.random() * 100)}`;
		this.hilight = false;
		this.newmsg = false;
		this.classAdded = false;
		this.scrollAtBottom = true;
		this.scrollAnchorEl = null;
		this.scrollAnchorOffset = 0;
		this.newLines = false;

		this.typing = new typingHandler(this);

		$('<span/>').attr('id', `${this.id  }-window`).hide().appendTo('#main-window');
		$('<span/>').attr('id', `${this.id  }-topic`).hide().appendTo('#info');
		$('<span/>').attr('id', `${this.id  }-tab-info`).hide().appendTo('#tab-info');
		$(`#${  this.id  }-topic`).html(`<h1>${  this.name  }</h1><h2></h2>`);
		$('<li/>').attr('id', `${this.id  }-tab`).html(`<a href="javascript:void(0);" class="switchTab" id="${  this.id  }-tab-switch">${  he(this.name)  }</a><a href="javascript:void(0);" id="${  this.id  }-tab-close"><div class="close" title="${  language.closeQuery  }"></div></a>`).appendTo('#tabs');
		$(`#${  this.id  }-tab-switch`).click(() => { uiTabs.switchTab(this.name); });	$(`#${  this.id  }-tab-close`).click(() => { this.close(); });	$('#chstats').append(`<div class="chstatswrapper" id="${  this.id  }-chstats"><span class="chstats-text symbolFont">${  language.query  }</span></div>`);
		try {
			let qCookie = localStorage.getItem(`query${  md5(this.name)}`);
			if (qCookie) {
				qCookie = Base64.decode(qCookie).split('\xff').join('');
				$(`#${  this.id  }-window`).vprintf(language.messagePatterns.queryBacklog, [$$.niceTime(), he(this.name)]);
				$(`#${  this.id  }-window`).append(qCookie);
			}
		} catch (e) {}
		$(`#${  this.id  }-window`).vprintf(language.messagePatterns.startedQuery, [$$.niceTime(), he(this.name), this.name]);
	}

	toggleClass() {
		if (this.ClassAdded) {
			$(`#${  this.id  }-tab`).removeClass('newmsg');
			this.ClassAdded = false;
		} else if (this.hilight) {
			$(`#${  this.id  }-tab`).addClass('newmsg');
			this.ClassAdded = true;
		}
	}

	markNew() {
		disp.playSound();
		if (!this.hilight) {
			this.hilight = window.setInterval(() => { uiTabs.findQuery(this.name).toggleClass(); }, 500);
		}
		if (!disp.focused) {
			if (disp.titleBlinkInterval) {
				clearInterval(disp.titleBlinkInterval);
			}
			disp.titleBlinkInterval = setInterval(() => {
				const title = document.title;
				document.title = (title == newMessage ? (`${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`) : newMessage);
			}, 500);
		}
	}

	markBold() {
		$(`#${  this.id  }-tab > a`).css('font-weight', 'bold');
		$(`#${  this.id  }-tab > a`).css('color', '#fff');
	}

	markRead() {
		if (!this.newLines) {
			$(`#${  this.id  }-window hr`).remove();
		}
		if (this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if (this.classAdded) {
			this.toggleClass();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if (document.title == newMessage) document.title = `${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`;
		$(`#${  this.id  }-tab > a`).css('font-weight', 'normal');
		$(`#${  this.id  }-tab > a`).css('color', '#CECECE');
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 100);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 300);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 600);
	}

	close() {
		$(`#${  this.id  }-tab`).remove();
		$(`#${  this.id  }-window`).remove();
		$(`#${  this.id  }-topic`).remove();
		$(`#${  this.id  }-chstats`).remove();
		$(`#${  this.id  }-tab-info`).remove();
		if (this.name.toLowerCase() == uiState.active.toLowerCase()) {
			uiTabs.switchTab(uiTabs.tabHistoryLast(this.name));		}
		uiTabs.removeQuery(this.name);	}

	appendMessage(type, args, time) {
		if (!time)
			time = new Date();
		time = time.getTime();
		const isActive = this.name.toLowerCase() == uiState.active.toLowerCase();
		const atBottom = isActive && chatIsAtBottom();
		const messageData = $.vsprintf(type, args);
		$(`#${  this.id  }-window`).append(messageData);
		if (isActive && atBottom) {
			const cw = document.getElementById('chat-wrapper');
			cw.scrollTop = cw.scrollHeight;
		}
		updateHistory(this.name, this.id, true);
		this.newLines = true;
	}

	changeNick(newnick) {
		const oldName = this.name.toLowerCase();
		$(`#${  this.id  }-window`).vprintf(language.messagePatterns.nickChange, [$$.niceTime(), he(this.name), he(newnick)]);
		$(`#${  this.id  }-topic`).html(`<h1>${  he(newnick)  }</h1><h2></h2>`);
		$(`#${  this.id  }-tab`).html(`<a href="javascript:void(0);" class="switchTab" id="${  this.id  }-tab-switch">${  he(newnick)  }</a><a href="javascript:void(0);" id="${  this.id  }-tab-close"><div class="close"></div></a>`);
		$(`#${  this.id  }-tab-switch`).click(() => { uiTabs.switchTab(newnick); });		$(`#${  this.id  }-tab-close`).click(() => { this.close(); });		this.name = newnick;
		if (oldName == uiState.active.toLowerCase()) {
			uiTabs.switchTab(newnick);		}
	}

	restoreScroll() {
		const active = uiTabs.getActive();
		if (active && this.name != active.name) return;
		const cw = document.getElementById('chat-wrapper');
		if (this.scrollAtBottom) {
			cw.scrollTop = cw.scrollHeight;
		} else if (this.scrollAnchorEl && this.scrollAnchorEl.parentNode) {
			const currentOffset = this.scrollAnchorEl.getBoundingClientRect().top - cw.getBoundingClientRect().top;
			cw.scrollTop += currentOffset - this.scrollAnchorOffset;
		} else {
			cw.scrollTop = this.scrollAnchorOffset;
		}
	}

	saveScroll() {
		const cw = document.getElementById('chat-wrapper');
		if (chatIsAtBottom()) {
			this.scrollAtBottom = true;
			this.scrollAnchorEl = null;
		} else {
			this.scrollAtBottom = false;
			const anchor = findScrollAnchor(this.id, cw);
			if (anchor) {
				const { el, offset } = anchor;
				this.scrollAnchorEl = el;
				this.scrollAnchorOffset = offset;
			} else {
				this.scrollAnchorEl = null;
				this.scrollAnchorOffset = cw.scrollTop;
			}
		}
	}

	setMark() {
		$(`#${  this.id  }-window hr`).remove();
		$(`#${  this.id  }-window`).append('<hr>');
		this.newLines = false;
	}
}

class ChannelTab {
	constructor(chan) {
		this.name = chan;
		this.id = this.name.replace(/^#/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() + Math.round(Math.random() * 100);
		this.nicklist = new Nicklist(this.name, this.id);
		this.modes = new ChannelModes(); // UI representation of channel modes
		this.left = false;
		this.closing = false;
		this.hilight = false;
		this.classAdded = false;
		this.scrollAtBottom = true;
		this.scrollAnchorEl = null;
		this.scrollAnchorOffset = 0;
		this.topic = '';
		this.newLines = false;
		this.hasNames = false;
		this.markingSwitch = false; // we use this to alternate the backgrounds of message blocks

		this.typing = new typingHandler(this);

		$('<span/>').attr('id', `${this.id  }-window`).hide().appendTo('#main-window');
		$('<span/>').attr('id', `${this.id  }-topic`).hide().appendTo('#info');
		$('<span/>').attr('id', `${this.id  }-tab-info`).hide().appendTo('#tab-info');
		$(`#${  this.id  }-topic`).html(`<h1>${  he(this.name)  }</h1><h2></h2>`);
		$('<li/>').attr('id', `${this.id  }-tab`).html(`<a href="javascript:void(0);" id="${  this.id  }-channelSwitchButton" class="switchTab">${  he(this.name)  }</a>` +
			`<a href="javascript:void(0);" id="${  this.id  }-channelPartButton"><div class="close" title="${  language.leaveChannel  }"></div></a>`).appendTo('#tabs');
		$('#chstats').append(`<div class="chstatswrapper" id="${  this.id  }-chstats"><span class="chstats-text symbolFont">${  he(this.name)  }</span>` +
			`<span class="chstats-button" id="${  this.id  }-toggleChannelOpts">${  language.channelOptions  }</span>` +
			`<div id="${  this.id  }-channelOptions" class="channelAdmin"><ul class="channelOptions">` +
				`<div class="nickRegistered"><span>${  language.autoJoinThisChannel  }</span>` +
					`<li id="${  this.id  }-aJoinEnable">${  language.enable  }</li>` +
					`<li id="${  this.id  }-aJoinDisable">${  language.disable  }</li>` +
				'</div>' +
				`<li id="${  this.id  }-clearWindow">${  language.clearMessageWindow  }</li>` +
				`<li id="${  this.id  }-redoNames">${  language.refreshNickList  }</li>` +
			'</ul></div></div>');
		const operHtml = `<div id="${  this.id  }-operActions" class="${  this.id  }-operActions channelAdmin" style="display:none">` +
			`<span class="chstats-button" id="${  this.id  }-openOperActions">${  language.administrativeActions  }</span>` +
			'<ul class="channelOperActions">' +
				`<li id="${  this.id  }-openBanList">${  language.banList  }</li>` +
				`<li id="${  this.id  }-openExceptList" title="${  language.exceptListHint  }">${  language.exceptList  }</li>` +
				`<li id="${  this.id  }-openInvexList" title="${  language.invexListHint  }">${  language.invexList  }</li>` +
				`<li id="${  this.id  }-openChannelModes">${  language.channelModes  }</li>` +
				`<li id="${  this.id  }-showInvitePrompt">${  language.inviteToChannel  }</li>` +
				`<li id="${  this.id  }-showChanservCommands">${  language.chanservCommands  }</li>` +
				`<li id="${  this.id  }-showBotservCommands">${  language.botservCommands  }</li>` +
			'</ul>' +
			'</div>';
		$(`#${  this.id  }-chstats`).append(operHtml);
		$(`#${  this.id  }-channelSwitchButton`).click(() => { uiTabs.switchTab(this.name); });	$(`#${  this.id  }-channelPartButton`).click(() => { this.close(); });
		$(`#${  this.id  }-toggleChannelOpts`).click(() => { uiNicklist.toggleChannelOpts(this.name); });
		$(`#${  this.id  }-aJoinEnable`).click(() => { commandBus.emit('chat:requestServiceCommand', { service: 'NickServ', command: 'AJOIN', args: ['ADD', this.name], time: new Date() }); }); // Emit chat event
		$(`#${  this.id  }-aJoinDisable`).click(() => { commandBus.emit('chat:requestServiceCommand', { service: 'NickServ', command: 'AJOIN', args: ['DEL', this.name], time: new Date() }); }); // Emit chat event
		$(`#${  this.id  }-clearWindow`).click(this.clearWindow.bind(this));
		$(`#${  this.id  }-redoNames`).click(() => { commandBus.emit('chat:requestRedoNames', { channelName: this.name, time: new Date() }); }); // Emit chat event
		$(`#${  this.id  }-openOperActions`).click(() => { uiNicklist.toggleChannelOperOpts(this.name); });
		$(`#${  this.id  }-openBanList`).click(() => { commandBus.emit('chat:requestModeList', { channelName: this.name, mode: 'b', time: new Date() }); }); // Emit chat event
		$(`#${  this.id  }-openExceptList`).click(() => { commandBus.emit('chat:requestModeList', { channelName: this.name, mode: 'e', time: new Date() }); }); // Emit chat event
		$(`#${  this.id  }-openInvexList`).click(() => { commandBus.emit('chat:requestModeList', { channelName: this.name, mode: 'I', time: new Date() }); }); // Emit chat event
		$(`#${  this.id  }-openChannelModes`).click(() => { uiDialogs.showChannelModes(this.name); });
		$(`#${  this.id  }-showInvitePrompt`).click(() => { uiDialogs.showInvitePrompt(this.name); });
		$(`#${  this.id  }-showChanservCommands`).click(() => { services.showChanServCmds(this.name); });
		$(`#${  this.id  }-showBotservCommands`).click(() => { services.showBotServCmds(this.name); });
		this.setTopic('');
		// connection.chat.me.setUmode(false); // This is chat logic and should be handled by chat events.
		try {
			let qCookie = localStorage.getItem(`channel${  md5(this.name)}`);
			if (qCookie) {
				qCookie = Base64.decode(qCookie).split('\xff').join('');
				$(`#${  this.id  }-window`).vprintf(language.messagePatterns.channelBacklog, [$$.niceTime(), he(this.name)]);
				$(`#${  this.id  }-window`).append(qCookie);
				$(`#${  this.id  }-window`).vprintf(language.messagePatterns.channelBacklogEnd, [$$.niceTime()]);
			}
		} catch (e) {}
	}

	part() {
		this.left = true;
		this.hasNames = false;
		this.nicklist.remove();
		this.nicklist = new Nicklist(this.name, this.id); // Re-initialize nicklist UI
		$(`#${  this.id  }-chstats`).hide();
	}

	toggleClass() {
		if (this.ClassAdded) {
			$(`#${  this.id  }-tab`).removeClass('newmsg');
			this.ClassAdded = false;
		} else if (this.hilight) {
			$(`#${  this.id  }-tab`).addClass('newmsg');
			this.ClassAdded = true;
		}
	}

	restoreScroll() {
		const active = uiTabs.getActive();
		if (active && this.name != active.name) return;
		const cw = document.getElementById('chat-wrapper');
		if (this.scrollAtBottom) {
			cw.scrollTop = cw.scrollHeight;
		} else if (this.scrollAnchorEl && this.scrollAnchorEl.parentNode) {
			const currentOffset = this.scrollAnchorEl.getBoundingClientRect().top - cw.getBoundingClientRect().top;
			cw.scrollTop += currentOffset - this.scrollAnchorOffset;
		} else {
			cw.scrollTop = this.scrollAnchorOffset;
		}
	}

	saveScroll() {
		const cw = document.getElementById('chat-wrapper');
		if (chatIsAtBottom()) {
			this.scrollAtBottom = true;
			this.scrollAnchorEl = null;
		} else {
			this.scrollAtBottom = false;
			const anchor = findScrollAnchor(this.id, cw);
			if (anchor) {
				const { el, offset } = anchor;
				this.scrollAnchorEl = el;
				this.scrollAnchorOffset = offset;
			} else {
				this.scrollAnchorEl = null;
				this.scrollAnchorOffset = cw.scrollTop;
			}
		}
	}

	setMark() {
		$(`#${  this.id  }-window hr`).remove();
		$(`#${  this.id  }-window`).append('<hr>');
		this.newLines = false;
	}

	toggleClassMsg() {
		if (this.ClassAddedMsg) {
			$(`#${  this.id  }-tab`).removeClass('newmsg2');
			this.ClassAddedMsg = false;
		} else {
			$(`#${  this.id  }-tab`).addClass('newmsg2');
			this.ClassAddedMsg = true;
		}
	}

	markNew() {
		disp.playSound();
		if (!this.hilight) {
			this.hilight = window.setInterval(() => { uiTabs.findChannel(this.name).toggleClass(); }, 500);
		}
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
			if (this.classAddedMsg) {
				this.toggleClassMsg();
			}
			setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 100);
			setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 300);
			setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 500);
		}
		if (!disp.focused) {
			if (disp.titleBlinkInterval) {
				clearInterval(disp.titleBlinkInterval);
			}
			document.title = `${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`;
			disp.titleBlinkInterval = setInterval(() => {
				const title = document.title;
				document.title = (title == newMessage ? (`${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`) : newMessage);
			}, 500);
		}
	}

	markBold() {
		if (!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval(() => {
				uiTabs.findChannel(this.name).toggleClassMsg();
			}, 500);
		}
	}

	markRead() {
		if (!this.newLines) {
			$(`#${  this.id  }-window hr`).remove();
		}
		if (this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
		}
		if (this.classAdded) {
			this.toggleClass();
		}
		if (this.classAddedMsg) {
			this.toggleClassMsg();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if (document.title == newMessage) document.title = `${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`;
		$(`#${  this.id  }-tab > a`).css('font-weight', 'normal');
		$(`#${  this.id  }-tab > a`).css('color', '#CECECE');
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 100);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 300);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 600);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 100);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 300);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 600);
	}

	close() {
		if (this.closing) return; // Guard against re-entry from removeChannel()→close() cycle
		this.closing = true;
		if (!this.left) {
			this.part();
			commandBus.emit('chat:requestRemoveChannel', { channelName: this.name, message: language.leftChannel }); // Emit chat event
		}
		this.nicklist.remove();
		$(`#${  this.id  }-tab`).remove();
		$(`#${  this.id  }-window`).remove();
		$(`#${  this.id  }-topic`).remove();
		$(`#${  this.id  }-chstats`).remove();
		$(`#${  this.id  }-tab-info`).remove();
		// Always remove from channel list (needed when left=true and chat:requestRemoveChannel was skipped)
		uiState.channels = uiState.channels.filter((c) => { return c !== this; });
		if (this.name.toLowerCase() == uiState.active.toLowerCase()) {
			uiTabs.switchTab(uiTabs.tabHistoryLast(this.name));
		}
		$('#input').focus();
	}

	rejoin() {
		this.left = false;
		$(`#${  this.id  }-chstats`).show();
		$(`#${  this.id  }-window`).vprintf(language.messagePatterns.joinOwn, [$$.niceTime(), connection.chat.me.userRef.nick, connection.chat.me.userRef.ident, connection.chat.me.userRef.host, this.name]);
		if (this.name.toLowerCase() == uiState.active.toLowerCase()) {
			this.restoreScroll();
		}
	}

	appendMessage(type, args, time, options) {
		// options can contain: isHistory - whether this is a historical message
		options = options || {};
		if (!time)
			time = new Date();
		const timeMs = time.getTime();
		let messageData = $.vsprintf(type, args);

		// Add data-time attribute to message div if not already present
		const $messageData = $(messageData);
		if ($messageData.hasClass('messageDiv') && !$messageData.attr('data-time')) {
			$messageData.attr('data-time', timeMs);
			messageData = $messageData.prop('outerHTML');
		}

		time = timeMs;
		let appended = false;
		const isHistoryBatch = options.isHistory || false;
		const isActive = this.name.toLowerCase() == uiState.active.toLowerCase();

		// For non-history messages, check before insertion if we should follow the bottom
		const atBottom = !isHistoryBatch && isActive && chatIsAtBottom();

		if (isHistoryBatch) { // history entries may arrive out of order, we handle this here
			const newElement = $(messageData);
			const windowElements = $(`#${  this.id  }-window .messageDiv`);

			// First pass: try to insert in chronological order among timestamped messages
			for (const element of windowElements) {
				const elTime = element.getAttribute('data-time');
				if (!elTime) continue;
				if (elTime > time) {
					newElement.insertBefore(element);
					appended = true;
					break;
				}
			}

			// Second pass: if not inserted yet, find the first non-timestamped message
			// from the end (most recent channel join info) and insert before it
			if (!appended) {
				// Search backwards to find the start of non-timestamped message sequence at the end
				let channelInfoStart = -1;
				for (let i = windowElements.length - 1; i >= 0; i--) {
					const element = windowElements[i];
					const elTime = element.getAttribute('data-time');
					const elMsgid = element.getAttribute('data-msgid');

					if (!elTime && !elMsgid) {
						// Check if there are any timestamped messages after this
						let hasTimestampedAfter = false;
						for (let j = i + 1; j < windowElements.length; j++) {
							if (windowElements[j].getAttribute('data-time')) {
								hasTimestampedAfter = true;
								break;
							}
							if (channelInfoStart !== -1) { // Found non-timestamped, now find previous
								const prevElTime = windowElements[j - 1].getAttribute('data-time');
								const prevElMsgid = windowElements[j - 1].getAttribute('data-msgid');
								if (prevElTime || prevElMsgid) {
									channelInfoStart = j;
								}
							}
						}
						// If no timestamped messages after, this is part of current join info
						if (!hasTimestampedAfter) {
							channelInfoStart = i;
							// Continue searching backwards to find the start of the sequence
						}
					} else if (channelInfoStart !== -1) {
						// We found a timestamped message, and we've already found
						// the end of the sequence, so channelInfoStart is the first message
						break;
					}
				}

				if (channelInfoStart !== -1) {
					newElement.insertBefore(windowElements[channelInfoStart]);
					appended = true;
				}
			}
		}
		if (!appended)
			$(`#${  this.id  }-window`).append(messageData);

		// For non-history messages: scroll to bottom if we were there before insertion.
		// History messages: scroll is handled once after the full batch completes (in chatHistoryStatsUpdated).
		if (atBottom) {
			const cw = document.getElementById('chat-wrapper');
			cw.scrollTop = cw.scrollHeight;
		}

		updateHistory(this.name, this.id);
		this.newLines = true;

		// Trigger event grouping
		const $newMsg = $(messageData);
		const channelWindow = `#${  this.id  }-window`;
		if (!$newMsg.hasClass('event-message')) {
			// Non-event message: group immediately (finalizes pending events)
			disp.groupEvents(channelWindow);
		} else {
			// Event message: debounce grouping to handle event-only streams
			clearTimeout(this.groupEventsTimeout);
			this.groupEventsTimeout = setTimeout(() => {
				disp.groupEvents(channelWindow);
			}, 1000);
		}
	}

	setTopic(topic) {
		$(`#${  this.id  }-topic > h2`).html($$.colorize(topic));
		$(`#${  this.id  }-topic`).unbind('click').click(disp.topicClick);
		this.topic = topic;
	}

	setTopicSetBy(setBy) {
		this.topicSetBy = setBy;
		// Topic metadata is typically shown in channel info, not in the topic bar
	}

	setTopicSetDate(setDate) {
		this.topicSetDate = setDate;
		// Topic metadata is typically shown in channel info, not in the topic bar
	}

	setCreationTime(creationTime) {
		this.creationTime = creationTime;
		// Creation time is typically shown in channel info
	}

	clearWindow() {
		$(`#${  this.id  }-window`).html(' ');
	}
}

class Status {
	constructor() {
		this.name = '--status';
		this.id = '--status';
		this.hilight = false;
		this.classAdded = false;
		this.scrollAtBottom = true;
		this.scrollAnchorEl = null;
		this.scrollAnchorOffset = 0;
		this.newLines = false;
		this.modes = {}; // to avoid exceptions
	}

	toggleClass() {
		if (this.ClassAdded) {
			$(`#${  this.id  }-tab`).removeClass('newmsg');
			this.ClassAdded = false;
		} else if (this.hilight) {
			$(`#${  this.id  }-tab`).addClass('newmsg');
			this.ClassAdded = true;
		}
	}

	restoreScroll() {
		const active = uiTabs.getActive();
		if (active) return;
		const cw = document.getElementById('chat-wrapper');
		if (this.scrollAtBottom) {
			cw.scrollTop = cw.scrollHeight;
		} else if (this.scrollAnchorEl && this.scrollAnchorEl.parentNode) {
			const currentOffset = this.scrollAnchorEl.getBoundingClientRect().top - cw.getBoundingClientRect().top;
			cw.scrollTop += currentOffset - this.scrollAnchorOffset;
		} else {
			cw.scrollTop = this.scrollAnchorOffset;
		}
	}

	saveScroll() {
		const cw = document.getElementById('chat-wrapper');
		if (chatIsAtBottom()) {
			this.scrollAtBottom = true;
			this.scrollAnchorEl = null;
		} else {
			this.scrollAtBottom = false;
			const anchor = findScrollAnchor(this.id, cw);
			if (anchor) {
				const { el, offset } = anchor;
				this.scrollAnchorEl = el;
				this.scrollAnchorOffset = offset;
			} else {
				this.scrollAnchorEl = null;
				this.scrollAnchorOffset = cw.scrollTop;
			}
		}
	}

	setMark() {
		$(`#${  this.id  }-window hr`).remove();
		$(`#${  this.id  }-window`).append('<hr>');
		this.newLines = false;
	}

	toggleClassMsg() {
		if (this.ClassAddedMsg) {
			$(`#${  this.id  }-tab`).removeClass('newmsg2');
			this.ClassAddedMsg = false;
		} else {
			$(`#${  this.id  }-tab`).addClass('newmsg2');
			this.ClassAddedMsg = true;
		}
	}

	markNew() {
		disp.playSound();
		if (!this.hilight) {
			this.hilight = window.setInterval('uiState.statusWindow.toggleClass();', 500);
		}
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
			if (this.classAddedMsg) {
				this.toggleClassMsg();
			}
			setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 100);
			setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 300);
			setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 500);
		}
		if (!disp.focused) {
			if (disp.titleBlinkInterval) {
				clearInterval(disp.titleBlinkInterval);
			}
			document.title = `${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`;
			disp.titleBlinkInterval = setInterval(() => {
				const title = document.title;
				document.title = (title == newMessage ? (`${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`) : newMessage);
			}, 500);
		}
	}

	markBold() {
		if (uiState.active == '--status') {
			return;
		}
		if (!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval('uiState.statusWindow.toggleClassMsg();', 500);
		}
	}

	markRead() {
		if (!this.newLines) {
			$(`#${  this.id  }-window hr`).remove();
		}
		if (this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
		}
		if (this.classAdded) {
			this.toggleClass();
		}
		if (this.classAddedMsg) {
			this.toggleClassMsg();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if (document.title == newMessage) document.title = `${he(connection.chat.me.userRef.nick)  } @ ${  mainSettings.networkName}`;
		$(`#${  this.id  }-tab > a`).css('font-weight', 'normal');
		$(`#${  this.id  }-tab > a`).css('color', '#CECECE');
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 100);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 300);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg')`, 600);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 100);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 300);
		setTimeout(`$('#${  this.id  }-tab').removeClass('newmsg2')`, 600);
	}

	appendMessage(type, args) {
		// not supporting the 'time' for now
		const isActive = this.name.toLowerCase() == uiState.active.toLowerCase();
		const atBottom = isActive && chatIsAtBottom();
		$(`#${  this.id  }-window`).vprintf(type, args);
		if (isActive && atBottom) {
			const cw = document.getElementById('chat-wrapper');
			cw.scrollTop = cw.scrollHeight;
		}
		this.newLines = true;
	}
}

function updateHistory(name, id, query) {
	const type = query ? 'query' : 'channel';
	try {
		let qCookie = '';
		let count = 0;
		const windowElements = $(`#${  id  }-window .messageDiv`);
		for (let i = windowElements.length - 1; i >= 0; i--) {
			const html = windowElements[i].outerHTML;
			if (html == '' || html.match(/class="join"/) || html.match(/class="mode"/) || html.match(/data-label="/)) {
				continue;
			}
			qCookie = `${html  }\xff${  qCookie}`;
			count++;
			if (count >= settings.backlogLength) {
				break;
			}
		}
		localStorage.setItem(type + md5(name), Base64.encode(qCookie));
	} catch (e) {
	}
}

function typingHandler(tab) {
	this.tab = tab;
	this.list = [];
	this.start = function(user, time) {
		if (user == connection.chat.me.userRef)
			return;
		const idx = this.findUser(user);
		if (idx === false) {
			const timeout = setTimeout(() => { this.stop(user); }, time * 1000);
			const t = {'user': user, 'timeout': timeout };
			this.list.push(t);
			this.display();
		} else {
			clearTimeout(this.list[idx].timeout);
			this.list[idx].timeout = setTimeout(() => { this.stop(user); }, time * 1000);
		}
	};
	this.stop = function(user) {
		const idx = this.findUser(user);
		if (idx === false)
			return;
		clearTimeout(this.list[idx].timeout);
		this.list.splice(idx, 1);
		this.display();
	};
	this.findUser = function(user) {
		for (let i = 0; i < this.list.length; i++) {
			if (this.list[i].user.id == user.id) // Compare stable user.id
				return i;
		}
		return false;
	};
	this.clear = function() {
		for (const t of this.list) {
			clearTimeout(t.timeout);
		}
		this.list = [];
		this.display();
	};
	this.display = function() {
		let infoText = '';
		if (this.list.length > 0) {
			for (const t of this.list) {
				if (infoText.length > 0) {
					infoText += ', ';
				}
				infoText += t.user.nick;
			}
			if (this.list.length == 1) {
				infoText += ` ${  language.isTyping}`;
			} else {
				infoText += ` ${  language.areTyping}`;
			}
		}
		$(`#${  this.tab.id  }-tab-info`).html(infoText);
	};
}

class ListWindow {
	constructor() {
		this.name = '--list';
		this.id = `--list-${  Math.round(Math.random() * 100)}`;
		this.hilight = false;
		this.classAdded = false;
		this.scrollAtBottom = false;
		this.scrollAnchorEl = null;
		this.scrollAnchorOffset = 0;
		this.data = [];
		this.loading = false;
		this.sortColumn = 1; // Default sort by user count
		this.sortAsc = false; // Default descending

		// Create DOM elements
		$('<span/>').attr('id', `${this.id  }-window`).addClass('listWindowContent').hide().appendTo('#main-window');
		$('<span/>').attr('id', `${this.id  }-topic`).hide().appendTo('#info');
		$('<span/>').attr('id', `${this.id  }-tab-info`).hide().appendTo('#tab-info');
		$(`#${  this.id  }-topic`).html(`<h1>${  language.channelListTitle  }</h1><h2></h2>`);
		$('<li/>').attr('id', `${this.id  }-tab`).html(`<a href="javascript:void(0);" id="${  this.id  }-tab-switch">${  language.channelListTitle  }</a><a href="javascript:void(0);" id="${  this.id  }-tab-close"><div class="close" title="${  language.close  }"></div></a>`).appendTo('#tabs');
		$(`#${  this.id  }-tab-switch`).click(() => { uiTabs.switchTab(this.name); });	$(`#${  this.id  }-tab-close`).click(() => { this.close(); });
		$('#chstats').append(`<div class="chstatswrapper" id="${  this.id  }-chstats"><span class="chstats-text symbolFont">${  language.channelListTitle  }</span></div>`);
	}

	toggleClass() {
		if (this.classAdded) {
			$(`#${  this.id  }-tab`).removeClass('newmsg');
			this.classAdded = false;
		} else if (this.hilight) {
			$(`#${  this.id  }-tab`).addClass('newmsg');
			this.classAdded = true;
		}
	}

	markNew() {
		if (!this.hilight) {
			this.hilight = window.setInterval(() => { uiState.listWindow.toggleClass(); }, 500);
		}
	}

	markRead() {
		if (this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if (this.classAdded) {
			this.toggleClass();
		}
		$(`#${  this.id  }-tab > a`).css('font-weight', 'normal');
		const tabId = this.id;
		setTimeout(() => { $(`#${  tabId  }-tab`).removeClass('newmsg'); }, 100);
	}

	restoreScroll() {
		if (uiState.active != this.name) return;
		const cw = document.getElementById('chat-wrapper');
		if (this.scrollAtBottom) {
			cw.scrollTop = cw.scrollHeight;
		} else if (this.scrollAnchorEl && this.scrollAnchorEl.parentNode) {
			const currentOffset = this.scrollAnchorEl.getBoundingClientRect().top - cw.getBoundingClientRect().top;
			cw.scrollTop += currentOffset - this.scrollAnchorOffset;
		} else {
			cw.scrollTop = this.scrollAnchorOffset;
		}
	}

	saveScroll() {
		const cw = document.getElementById('chat-wrapper');
		if (chatIsAtBottom()) {
			this.scrollAtBottom = true;
			this.scrollAnchorEl = null;
		} else {
			this.scrollAtBottom = false;
			const anchor = findScrollAnchor(this.id, cw);
			if (anchor) {
				const { el, offset } = anchor;
				this.scrollAnchorEl = el;
				this.scrollAnchorOffset = offset;
			} else {
				this.scrollAnchorEl = null;
				this.scrollAnchorOffset = cw.scrollTop;
			}
		}
	}

	setMark() {
		// List window doesn't need read marks
	}

	close() {
		$(`#${  this.id  }-tab`).remove();
		$(`#${  this.id  }-window`).remove();
		$(`#${  this.id  }-topic`).remove();
		$(`#${  this.id  }-chstats`).remove();
		$(`#${  this.id  }-tab-info`).remove();
		if (this.name == uiState.active) {
			uiTabs.switchTab(uiTabs.tabHistoryLast(this.name));		}
		commandBus.emit('chat:requestRemoveListWindow', { listName: this.name }); // Emit chat event
	}

	clearData() {
		this.data = [];
		this.loading = true;
		$(`#${  this.id  }-window`).html(`<div class="listWindowLoading">${  language.loadingWait  }</div>`);
	}

	addEntry(channel, users, topic) {
		this.data.push([channel, parseInt(users), topic]);
	}

	render() {
		this.loading = false;
		if (this.data.length == 0) {
			$(`#${  this.id  }-window`).html(`<div class="listWindowEmpty">${  language.noChannelsFound  }</div>`);
			return;
		}
		this.sortData();
		let html = '<table class="listWindowTable">';
		html += '<thead><tr>';
		html += `<th class="listWindowChannel" data-col="0">${  language.channelListChannel  } ${  this.getSortIndicator(0)  }</th>`;
		html += `<th class="listWindowUsers" data-col="1">${  language.channelListUsers  } ${  this.getSortIndicator(1)  }</th>`;
		html += `<th class="listWindowTopic" data-col="2">${  language.channelListTopic  } ${  this.getSortIndicator(2)  }</th>`;
		html += '</tr></thead><tbody>';
		for (const [channelName, userCount, topic] of this.data) {
			if (channelName == '*') {
				html += `<tr><td class="listWindowChannel"><i>(${  language.channelHidden  })</i></td>`;
				html += `<td class="listWindowUsers">${  he(userCount)  }</td>`;
				html += `<td class="listWindowTopic"><i>(${  language.topicHidden  })</i></td></tr>`;
			} else {
				html += `<tr><td class="listWindowChannel"><a href="#" data-channel="${  he(channelName)  }">${  he(channelName)  }</a></td>`;
				html += `<td class="listWindowUsers">${  he(userCount)  }</td>`;
				html += `<td class="listWindowTopic">${  $$.colorize(topic)  }</td></tr>`;
			}
		}
		html += '</tbody></table>';
		$(`#${  this.id  }-window`).html(html);
		// Bind header click events for sorting
		$(`#${  this.id  }-window .listWindowTable thead th`).click((e) => {
			const col = parseInt($(e.currentTarget).attr('data-col'));
			if (this.sortColumn == col) {
				this.sortAsc = !this.sortAsc;
			} else {
				this.sortColumn = col;
				this.sortAsc = (col == 0); // Asc for channel name, desc for others
			}
			this.render();
		});
	}

	sortData() {
		const col = this.sortColumn;
		const asc = this.sortAsc;
		this.data.sort((a, b) => {
			let valA = a[col];
			let valB = b[col];
			if (typeof valA === 'string') {
				valA = valA.toLowerCase();
				valB = valB.toLowerCase();
			}
			if (valA < valB) return asc ? -1 : 1;
			if (valA > valB) return asc ? 1 : -1;
			return 0;
		});
	}

	getSortIndicator(col) {
		if (this.sortColumn != col) return '';
		return this.sortAsc ? '▲' : '▼';
	}
}
