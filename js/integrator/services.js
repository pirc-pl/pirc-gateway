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

const masks = {
	'anope': {
		'maskBanned': [ // this comes from a custom anope module
			/^Zbanowano maskę .(.*). \(dla .(.*).\)$/i
		],
		'youreIdentified': [
			/^Hasło przyjęte - jesteś zidentyfikowany\(a\)\.$/i,
			/^Password accepted - you are now recognized\.$/i
		],
		'nickNotRegistered': [
			/^Nick [^ ]+ nie jest zarejestrowany\.$/i,
			/^Nick [^ ]+ isn't registered\.$/i
		],
		'invalidPassword': [
			/^Nieprawidłowe hasło\.$/i,
			/^Password incorrect\.$/i
		],
		'registeredProtectedNick': [
			/^Ten nick jest zarejestrowany i chroniony\.( Jeśli należy do Ciebie,)?$/i,
			/^This nickname is registered and protected\.(  If it is your)?$/i
		],
		'identify': [
			/^Zidentyfikuj się pisząc: /i // is this old anope version?
		],
		'nickBelongingToYou': [
			/^jeśli nick należy do Ciebie, w przeciwnym razie zmień go\.$/i,
			/^please choose a different nick./i
		],
		'notUsedByServices': [
			/^Nick .* nie jest zajęty przez serwisy\.$/i // is this old anope version?
		],
		'notCurrentlyUsed': [
			/^Nick .* nie jest aktualnie używany\.$/i,
			/^No one is using your nick, and services are not holding it\.$/i
		],
		'loginPrompt': [
			/^wpisz .\/msg NickServ IDENTIFY .hasło..\. W przeciwnym wypadku$/i,
			/^nick, type..\/msg NickServ IDENTIFY .password..\.  Otherwise,$/i
		],
		'selectOtherNick': [
			/^wybierz proszę inny nick\.$/i,
			/^please choose a different nick\.$/i
		],
		'accessDenied': [
			/^Odmowa dostępu\.$/i,
			/^Access denied\.$/i
		],
		'nickRemovedFromNetwork': [
			/^Nick został usunięty z sieci\.$/i // is this old anope version?
		],
		'servicesReleasedNick': [
			/^Serwisy właśnie zwolniły.*nicka.*\.$/i,
			/^You have regained control of /i
		],
		'youHaveTimeToChangeNick': [
			/^Masz (.*) na zmianę nicka, potem zostanie zmieniony siłą\.$/i // is this old anope version?
		],
		'ifYouDontChange': [
			/^Jeśli go nie zmienisz w ciągu (.*), zostanie zmieniony siłą\.$/i,
			/^If you do not change within (.*), I will change your nick\.$/i
		]
	}
};

const currentMasks = masks.anope;

function maskMatch(text, name) {
	if (!name in currentMasks)
		return false;
	for (const expr of currentMasks[name]) {
		const result = expr.exec(text);
		if (result)
			return result;
	}
	return false;
}

function createServices(chat, commandBus) {
const services = {
	'badNickCounter': false,
	'badNickInterval': false,
	'nickStore': '',
	'showTimeToChange': false,
	'ignoreNextAccessDenial': false,
	'badNickForm': function() {
		const $logInForm = $('<form>', { class: 'trgr', action: 'javascript:void(0);' })
			.on('submit', () => { services.logIn(); uiDialogs.closeDialog('error', 'nickserv'); })
			.append($('<div>', { class: 'tr' })
				.append($('<span>', { class: 'td_right' }).text(language.yourPassword))
				.append($('<span>', { class: 'td' }).append($('<input>', { type: 'password', id: 'nspass' })))
				.append($('<span>', { class: 'td' }).append($('<input>', { type: 'submit', value: language.logIn })))
			)
			.append($('<div>', { class: 'tr' })
				.append($('<span>', { class: 'td_right' }).append($('<input>', { type: 'checkbox', id: 'notConfirmedAccount' })))
				.append($('<span>', { class: 'td' }).text(language.accountIsNotConfirmed))
				.append($('<br>'))
				.append($('<span>', { class: 'td_right' }).append($('<input>', { type: 'checkbox', id: 'saveNewPassword' }).prop('checked', true)))
				.append($('<span>', { class: 'td' }).text(language.saveThisPassword))
			);
		const $changeNickForm = $('<form>', { class: 'tr', action: 'javascript:void(0);' })
			.on('submit', () => { services.changeNick(); uiDialogs.closeDialog('error', 'nickserv'); })
			.append($('<span>', { class: 'td_right' }).text(language.newNick))
			.append($('<span>', { class: 'td' }).append($('<input>', { type: 'text', id: 'nnick' })))
			.append($('<span>', { class: 'td' }).append($('<input>', { type: 'submit', value: language.changeNick })));
		return $('<div>', { class: 'table' }).append($logInForm, $changeNickForm);
	},
	'displayBadNickCounter': function() {
		if (services.badNickCounter == false) {
			return;
		}
		const html = `<br>${  language.youHaveLimitedTimeToLogInHtml}`;
		uiDialogs.displayDialog('error', 'nickserv', language.error, html);
		if (services.badNickInterval) {
			clearInterval(services.badNickInterval);
		}
		services.badNickInterval = setInterval(() => {
			if (!(services.badNickCounter > 0)) {
				clearInterval(services.badNickInterval);
				services.badNickInterval = false;
			}
			let text = `${services.badNickCounter.toString()  } ${  language.second}`;
			if (services.badNickCounter == 1) {
				text += language.second1;
			} else if ((services.badNickCounter < 10 || services.badNickCounter > 20) && services.badNickCounter % 10 > 1 && services.badNickCounter % 10 < 5) {
				text += language.second2;
			} else if (services.badNickCounter > 1) {
				// For all other plural cases (including English 2+ seconds)
				text += language.second2;
			}
			$('#nickserv_timer').text(text);
			services.badNickCounter--;
		}, 1000);
	},
	'chanservMessage': function(msg) {
		const match = maskMatch(msg.text, 'maskBanned');
		if (match) {
			try {
				localStorage.setItem(`banmask-${  md5(match[1])}`, match[2]);
			} catch (e) {}
			return true;
		}
		return false;
	},
	'nickservMessage': function(msg) {
		if (maskMatch(msg.text, 'youreIdentified')) {
			services.badNickCounter = false;
			services.showTimeToChange = false;
			uiDialogs.closeDialog('error', 'nickserv');
			// Trigger status update to transition from 'identified' to 'connected'
			commandBus.emit('chat:processConnectionStatusUpdate');
			return false;
		}
		if (maskMatch(msg.text, 'nickNotRegistered')) {
			commandBus.emit('chat:setNickservPass', { pass: '' });			commandBus.emit('chat:setNickservNick', { nick: '' });			if (chat.connectStatus == 'ghostSent') {
				commandBus.emit('chat:setConnectStatus', { status: 'identified' }); // Advance state so connection completes
			}
			return false;
		}
		if (maskMatch(msg.text, 'invalidPassword')) { // złe hasło nickserv
			services.nickStore = chat.me.nickservnick;
			const $content = $('<span>')
				.append(document.createTextNode(language.givenPasswordForNick))
				.append($('<b>').text(chat.me.nickservnick))
				.append(document.createTextNode(language.isInvalidChangeNick))
				.append($('<br>'))
				.append(services.badNickForm());
			uiDialogs.displayDialog('error', 'nickserv', language.error, $content);
			services.displayBadNickCounter();
			return true;
		}
		if (maskMatch(msg.text, 'registeredProtectedNick')) {
			if (chat.connectStatus == 'ghostAndNickSent') {				commandBus.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'IDENTIFY', args: [chat.me.nickservpass] });
				commandBus.emit('chat:setConnectStatus', { status: 'identified' });				return true;
			}
			commandBus.emit('chat:setConnectStatus', { status: 'wrongPassword' });			if (uiDialogs.getDialogSelector('error', 'nickserv').length < 1) {
				services.showTimeToChange = true;
				services.nickStore = chat.me.userRef.nick;
				const $content = $('<span>')
					.append(document.createTextNode(language.selectedNick))
					.append($('<b>').text(chat.me.userRef.nick))
					.append(document.createTextNode(language.isRegisteredChangeNick))
					.append($('<br>'))
					.append(services.badNickForm());
				uiDialogs.displayDialog('error', 'nickserv', language.error, $content);
			}
			return true;
		}
		if (maskMatch(msg.text, 'identify')
			|| maskMatch(msg.text, 'nickBelongingToYou')
			|| maskMatch(msg.text, 'notUsedByServices')
			|| maskMatch(msg.text, 'notCurrentlyUsed')
			|| maskMatch(msg.text, 'loginPrompt')
			|| maskMatch(msg.text, 'selectOtherNick')) {
			return true;
		}
		if (maskMatch(msg.text, 'accessDenied')) {
			if (chat.connectStatus == 'ghostSent') {				commandBus.emit('chat:setConnectStatus', { status: 'identified' });				services.nickStore = chat.me.nickservnick;
				commandBus.emit('chat:setNickservNick', { nick: '' });				commandBus.emit('chat:setNickservPass', { pass: '' });				const $content = $('<span>')
					.append(document.createTextNode(language.passwordForUsedNick))
					.append($('<b>').text(services.nickStore))
					.append(document.createTextNode(language.isInvalidRetryOrChangeNick))
					.append($('<br>'))
					.append(services.badNickForm());
				uiDialogs.displayDialog('error', 'nickserv', language.error, $content);
				services.ignoreNextAccessDenial = true;
				return true;
			} else if (services.ignoreNextAccessDenial) {
				services.ignoreNextAccessDenial = false;
				return true;
			}
			return false;
		}
		if (maskMatch(msg.text, 'nickRemovedFromNetwork') || maskMatch(msg.text, 'servicesReleasedNick')) {
			commandBus.emit('chat:changeNick', { nick: chat.me.nickservnick });
			commandBus.emit('chat:setConnectStatus', { status: 'ghostAndNickSent' });			return true;
		}
		const time = false;
		let match = maskMatch(msg.text, 'youHaveTimeToChangeNick');
		if (!match) {
			match = maskMatch(msg.text, 'ifYouDontChange');
		}
		if (match) {
			if (match[1] == language.oneMinute || match[1] == language.n60seconds || match[1] == language.n1minute || match[1] == language.n1minute2) {
				$('#nickserv_timer').text(language.n60seconds2);
				services.badNickCounter = 59;
			} else if (match[1] == language.n20seconds || match[1] == language.n20seconds2) {
				$('#nickserv_timer').text(language.n20seconds);
				services.badNickCounter = 19;
			} else {
				// Custom time format - try to parse seconds from the string
				$('#nickserv_timer').text(match[1]);
				// Try to extract number from string like "20 sekund(y)" or "60 seconds"
				const timeMatch = match[1].match(/(\d+)/);
				if (timeMatch && timeMatch[1]) {
					services.badNickCounter = parseInt(timeMatch[1], 10) - 1;
				} else {
					// Fallback: assume 20 seconds
					services.badNickCounter = 19;
				}
			}
			if (services.showTimeToChange) {
				services.displayBadNickCounter();
			} else {
			}
			return true;
		}
		return false;
	},
	'logIn': function() {
		if ($('#nspass').val() == '') {
			uiDialogs.alert(language.passwordNotGiven);
			return false;
		}
		commandBus.emit('chat:setNickservNick', { nick: services.nickStore });		commandBus.emit('chat:setNickservPass', { pass: $('#nspass').val() });		if ($('#saveNewPassword').is(':checked')) {
			try {
				commandBus.emit('chat:savePassword', { password: encryptPassword($('#nspass').val()) });			} catch (e) {}
		}
		if ($('#notConfirmedAccount').is(':checked')) {
			commandBus.emit('chat:changeCapSupport', { cap: 'sasl', enable: false });		}
		commandBus.emit('chat:setConnectStatus', { status: 'reIdentify' });		commandBus.emit('chat:setConnectedWhenIdentified');		commandBus.emit('chat:processConnectionStatusUpdate');		$('.errorwindow').fadeOut(250);
		return true;
	},
	'changeNick': function() {
		if ($('#nnick').val() == '') {
			uiDialogs.alert(language.mustGiveNick);
			return false;
		}
		if ($('#nnick').val().indexOf(' ') > -1) {
			uiDialogs.alert(language.nickCantContainSpaces);
			return false;
		}
		commandBus.emit('chat:changeNick', { nick: $('#nnick').val() });
		$('.errorwindow').fadeOut(250);
		return true;
	},
	'nickInfo': function(nick) {
		commandBus.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'INFO', args: [nick, 'ALL'] });
	},
	'perform': function(service, command, args, onlyRegistered) { // just another wrapper
		if (onlyRegistered && !services.requireRegisteredNick()) {
			return;
		}
		commandBus.emit('chat:sendServiceCommand', { service: service, command: command, args: args });
	},
	'showChanServCmds': function(chan) {
		if (!services.requireRegisteredNick()) return;
		html = `${language.eachFunctionNeedsPermissions  }<br>` +
			'<table>' +
			`<tr><td><button id="cs-ban-${  md5(chan)  }-button">BAN</button></td><td>${  language.nickOrMask  }: <input type="text" id="cs-ban-${  md5(chan)  }"></td><td>${  language.reason  }: <input type="text" id="cs-banreason-${  md5(chan)  }"></td><td>${  language.banUser  }</td></tr>` +
			`<tr><td><button id="cs-kick-${  md5(chan)  }-button">KICK</button></td><td>${  language.nickOrMask  }: <input type="text" id="cs-kick-${  md5(chan)  }"></td><td>${  language.reason  }: <input type="text" id="cs-kickreason-${  md5(chan)  }"></td><td>${  language.kickUser  }</td></tr>` +
			`<tr><td><button id="cs-register-${  md5(chan)  }-button">REGISTER</button></td><td>${  language.channelDescription  }: <input type="text" id="cs-register-${  md5(chan)  }"></td><td></td><td>${  language.registerChannel  }</td></tr>` +
			`<tr><td><button id="cs-status-${  md5(chan)  }-button">STATUS</button></td><td>${  language.nickname  }: <input type="text" id="cs-status-${  md5(chan)  }"></td><td></td><td>${  language.checkUserChanservStatus  }</td></tr>` +
			`<tr><td><button id="cs-accesslist-${  md5(chan)  }-button">ACCESS LIST</button></td><td></td><td></td><td>${  language.displayAccessList  }</td></tr>` +
			`<tr><td><button id="cs-accessdel-${  md5(chan)  }-button">ACCESS DEL</button></td><td>${  language.nickname  }: <input type="text" id="cs-acc-del-${  md5(chan)  }"></td><td></td><td>${  language.deleteUserFromAccessList  }</td></tr>` +
		'</table>';
		uiDialogs.displayDialog('admin', `cs-${  chan}`, language.chanservCommandsOn + he(chan), html);
		uiDialogs.alert(language.workInProgress);
		$(`#cs-ban-${  md5(chan)  }-button`).click(() => {
			services.clickChanServ('ban', chan);
		});
		$(`#cs-kick-${  md5(chan)  }-button`).click(() => {
			services.clickChanServ('kick', chan);
		});
		$(`#cs-register-${  md5(chan)  }-button`).click(() => {
			services.clickChanServ('register', chan);
		});
		$(`#cs-status-${  md5(chan)  }-button`).click(() => {
			services.clickChanServ('status', chan);
		});
		$(`#cs-accesslist-${  md5(chan)  }-button`).click(() => {
			services.clickChanServ('access list', chan);
		});
		$(`#cs-accessdel-${  md5(chan)  }-button`).click(() => {
			services.clickChanServ('access del', chan);
		});
	},
	'clickChanServ': function(cmd, chan) {
		const opts = {
			'arg': [],
			'argreq': [],
			'cmd': ''
		};
		switch (cmd) {
			case 'ban':
				opts.arg[0] = 'ban';
				opts.argreq[0] = true;
				opts.arg[1] = 'banreason';
				opts.cmd = `BAN ${  chan}`;
				break;
			case 'kick':
				opts.arg[0] = 'kick';
				opts.argreq[0] = true;
				opts.arg[1] = 'kickreason';
				opts.cmd = `KICK ${  chan}`;
				break;
			case 'register':
				opts.arg[0] = 'register';
				opts.cmd = `REGISTER ${  chan}`;
				break;
			case 'status':
				opts.arg[0] = 'status';
				opts.argreq[0] = true;
				opts.cmd = `STATUS ${  chan}`;
				break;
			case 'access list':
				opts.cmd = `ACCESS ${  chan  } LIST`;
				break;
			case 'access del':
				opts.arg[0] = 'acc-del';
				opts.argreq[0] = true;
				opts.cmd = `ACCESS ${  chan  } DEL`;
				break;
		}

		const cmdArgs = services.servMakeArgs(opts, cmd, chan, 'cs');
		if (cmdArgs === false) {
			return;
		}
		const cmdString = `CS ${  opts.cmd  }${cmdArgs}`;
		uiInput.performCommand(cmdString);
	},
	'showBotServCmds': function(chan) {
		if (!services.requireRegisteredNick()) return;
		html = `${language.eachFunctionNeedsPermissions  }<br>` +
			'<table>' +
			`<tr><td><button id="bs-botlist-${  md5(chan)  }-button">BOTLIST</button></td><td></td><td></td><td>${  language.showBotList  }</td></tr>` +
			`<tr><td><button id="bs-assign-${  md5(chan)  }-button">ASSIGN</button></td><td>${  language.nickChosenFromBotList  }: <input type="text" id="bs-assign-${  md5(chan)  }"></td><td></td><td>${  language.assignBotToChan  }</td></tr>` +
			`<tr><td><button id="bs-unassign-${  md5(chan)  }-button">UNASSIGN</button></td><td></td><td></td><td>${  language.removeBotFromChan  }</td></tr>` +
			`<tr><td><button id="bs-act-${  md5(chan)  }-button">ACT</button></td><td>${  language.message  }: <input type="text" id="bs-act-${  md5(chan)  }"></td><td></td><td>${  language.sendActionToChan  }</td></tr>` +
			`<tr><td><button id="bs-say-${  md5(chan)  }-button">SAY</button></td><td>${  language.message  }: <input type="text" id="bs-say-${  md5(chan)  }"></td><td></td><td>${  language.sendMessageToChan  }</td></tr>` +
		'</table>';
		uiDialogs.displayDialog('admin', `bs-${  chan}`, language.botservCommandsOn + he(chan), html);
		uiDialogs.alert(language.workInProgress);
		$(`#bs-botlist-${  md5(chan)  }-button`).click(() => {
			services.clickBotServ('botlist', '');
		});
		$(`#bs-assign-${  md5(chan)  }-button`).click(() => {
			services.clickBotServ('assign', chan);
		});
		$(`#bs-unassign-${  md5(chan)  }-button`).click(() => {
			services.clickBotServ('unassign', chan);
		});
		$(`#bs-act-${  md5(chan)  }-button`).click(() => {
			services.clickBotServ('act', chan);
		});
		$(`#bs-say-${  md5(chan)  }-button`).click(() => {
			services.clickBotServ('say', chan);
		});
	},
	'clickBotServ': function(cmd, chan) {
		const opts = {
			'arg': [],
			'argreq': [],
			'cmd': ''
		};
		switch (cmd) {
			case 'botlist':
				opts.cmd = 'BOTLIST';
				break;
			case 'assign':
				opts.arg[0] = 'assign';
				opts.argreq[0] = true;
				opts.cmd = `ASSIGN ${  chan}`;
				break;
			case 'unassign':
				opts.cmd = `UNASSIGN ${  chan}`;
				break;
			case 'act':
				opts.arg[0] = 'act';
				opts.argreq[0] = true;
				opts.cmd = `ACT ${  chan}`;
				break;
			case 'say':
				opts.arg[0] = 'say';
				opts.argreq[0] = true;
				opts.cmd = `SAY ${  chan}`;
				break;
		}

		const cmdArgs = services.servMakeArgs(opts, cmd, chan, 'bs');
		if (cmdArgs === false) {
			return;
		}
		const cmdString = `BS ${  opts.cmd  }${cmdArgs}`;
		uiInput.performCommand(cmdString);
	},
	'servMakeArgs': function(opts, cmd, chan, service) {
		let cmdString = '';
		for (const [i, argName] of opts.arg.entries()) {
			if (argName) {
				const arg = $(`#${  service  }-${  argName  }-${  md5(chan)}`).val();
				if (!arg || arg == '') {
					if (opts.argreq[i]) {
						uiDialogs.alert(`${language.argumentRequiredForCmd  }<b>${  cmd  }</b>!`);
						return false;
					}
				}
				cmdString += ` ${  arg}`;
			} else break;
		}
		return cmdString;
	},
	'showBan': function(channel, nick) {
		if (chat.connectStatus !== 'connected') return;
		let html = `<p>${  language.banAndKickUserFrom  }${he(nick)  }${language.fromChannel  }${he(channel)  }. ${  language.giveKickReason  }</p>` +
			'<input type="text" id="kbinput" maxlength="307" /><br>' +
			'<select id="kbtime">' +
				`<option value=" ">${  language.noAutoUnban  }</option>` +
				`<option value="1d">${  language.unban1Day  }</option>` +
				`<option value="1h">${  language.unban1Hour  }</option>`;
		if (settings.get('timedBanMethod') == 'ChanServ') {
			html += `<option value="30d">${  language.unban1Month  }</option>`;
		} else {
			html += `<option value="7d">${  language.unban1Week  }</option>`;
		}
		html += '</select>';
		const button = [ {
			text: language.cancel,
			click: function() {
				$(this).dialog('close');
			}
		}, {
			text: language.doBan,
			click: function() {
				services.processBan(channel, nick);
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('admin', `kb-${  channel}`, 'BAN', html, button);
		$('#kbtime > option:eq(1)').prop('selected', true);
	},
	'processBan': function(channel, nick) {
		const reason = $('#kbinput').val();
		let banTime = $('#kbtime').val();
		let banString;
		if (settings.get('timedBanMethod') == '~t:minutes:') {
			const user = chat.users.getUser(nick);
			if (!user)
				return; // TODO ban even if the user already quit
			banMask = user.host;
			banString = `MODE ${  channel  } +b `;
			if (banTime != ' ') {
				const modifier = banTime.slice(-1);
				let multiplier = null;
				switch (modifier) {
					default:
						break;
					case 'd':
						multiplier = 1440;
						break;
					case 'h':
						multiplier = 60;
						break;
				}
				if (multiplier) {
					banTime = parseInt(banTime, 10);
					banTime *= multiplier;
					if (banTime > 9999)
						banTime = 9999;
				}
				banString += `~t:${  banTime  }:`;
			}
			banString += `*!*@${  banMask}`;
			commandBus.emit('chat:kickUser', { channel: channel, nick: nick, reason: reason });
		} else if (mainSettings.timedBanMethod == 'ChanServ') {
			banString = `CS BAN ${  channel}`;
			if (banTime != ' ') {
				banTime = `+${  banTime}`;
			}
			banString += ` ${  banTime  } ${  nick}`;
			if (reason != '') {
				banString += ` ${  $('#kbinput').val()}`;
			}
		}
		uiInput.performCommand(banString);
	},
	'requireRegisteredNick': function() {
		if (!chat.me.userRef.registered) {
			uiDialogs.alert(language.youNeedRegisteredNickToUseThis);
			return false;
		}
		return true;
	},
	'changeMyNick': function() {
		const html = `${language.newNick  } <input type="text" value="${  chat.me.userRef.nick  }" id="nickChangeInput">`;
		const button = [ {
			text: language.cancel,
			click: function() {
				$(this).dialog('close');
			}
		}, {
			text: language.change,
			click: function() {
				if (services.doChangeNick()) {
					$(this).dialog('close');
				}
			}
		} ];
		uiDialogs.displayDialog('services', 'nickserv', language.nickChange, html, button);
	},
	'doChangeNick': function() {
		const newNick = $('#nickChangeInput').val();
		if (newNick == '') {
			uiDialogs.alert(language.noNickGiven);
			return false;
		}
		if (newNick.indexOf(' ') > -1) {
			uiDialogs.alert(language.nickCantContainSpaces);
			return false;
		}
		commandBus.emit('chat:changeNick', { nick: newNick });
		return true;
	},
	'registerMyNick': function() {
		const html = `<table><tr><td style="text-align: right; padding-right: 10px;">${  language.password  }</td><td><input type="password" id="nickRegisterPass"></td></tr>` +
			`<tr><td style="text-align: right; padding-right: 10px;">${  language.repeatPassword  }</td><td><input type="password" id="nickRegisterPassConf"></td></tr>` +
			`<tr><td style="text-align: right; padding-right: 10px;">${  language.email  }</td><td><input type="text" id="nickRegisterMail"></td></tr>` +
			`</table><p>${  language.emailNeeded  }</p>`;
		const button = [ {
			text: language.cancel,
			click: function() {
				$(this).dialog('close');
			}
		}, {
			text: language.register,
			click: function() {
				if (services.doRegisterNick()) {
					$(this).dialog('close');
				}
			}
		} ];
		uiDialogs.displayDialog('services', 'nickserv', language.registrationOfNick + chat.me.userRef.nick, html, button);
	},
	'doRegisterNick': function() {
		const password = $('#nickRegisterPass').val();
		const email = $('#nickRegisterMail').val();
		if (password == '') {
			uiDialogs.alert(language.passwordNotGiven);
			return false;
		}
		if (password.indexOf(' ') > -1) {
			uiDialogs.alert(language.spaceInPassword);
			return false;
		}
		if (password != $('#nickRegisterPassConf').val()) {
			uiDialogs.alert(language.passwordsNotMatching);
			return false;
		}
		if (email == '') {
			uiDialogs.alert(language.mailNotGiven);
			return false;
		}
		if (email.indexOf(' ') > -1 || email.indexOf('@') < 0 || email.indexOf('.') < 0) {
			uiDialogs.alert(language.badEmail);
			return false;
		}
		const timeDiff = 120 - Math.round(((+new Date) / 1000) - chat.connectTime);
		if (timeDiff > 0) {
			uiDialogs.alert(language.youHaveToWaitAnother + timeDiff + language.secondsToRegisterNick);
			return false;
		}
		commandBus.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'REGISTER', args: [password, email] });
		commandBus.emit('chat:sendServiceCommand', { service: 'NickServ', command: 'SET', args: ['KILL', 'QUICK'] });
		return true;
	},
	/*'setCloak': function(){
		var html = '<p>To polecenie ustawi vHosta o treści <b>cloak:'+chat.me.nick+'</b>. Jeśli masz już vHosta, zostanie on usunięty.</p>';
		var button = [ {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: 'Wykonaj',
			click: function(){
				connection.transport.send('HS CLOAK');
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('services', 'hostserv', language.settingOfVhost, html, button);
		*/
	'setVhost': function() {
		const html = `<p>${  language.thisCommandWillRequestVhost  }</p>` +
			`<p>${  language.newVhost  }<input type="text" id="newVhost"></p>` +
			`<p>${  language.lettersDigitsDot  }</p>`;
		const button = [ {
			text: language.cancel,
			click: function() {
				$(this).dialog('close');
			}
		}, {
			text: language.proceed,
			click: function() {
				commandBus.emit('chat:sendServiceCommand', { service: 'HostServ', command: 'REQUEST', args: [$('#newVhost').val()] });
				$(this).dialog('close');
			}
		} ];
		uiDialogs.displayDialog('services', 'hostserv', language.settingOfVhost, html, button);
	}
};
return services;
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { createServices };
}
