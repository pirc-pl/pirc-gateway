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

const ignoreData = {
	'realname': {
		'channel': [],
		'query': []
	},
	'account': {
		'channel': [],
		'query': []
	},
	'userhost': {
		'channel': [],
		'query': []
	}
};

const ignore = {
	'loadList': function() {
		try {
			const ignoreList = localStorage.getItem('ignore');
			if (ignoreList) {
				newIgnoreData = JSON.parse(ignoreList);
				for (const [key, subObj] of Object.entries(newIgnoreData)) {
					for (const key2 of Object.keys(subObj)) {
						ignoreData[key][key2] = ignoreData[key][key2].concat(newIgnoreData[key][key2]);
					}
				}
				localStorage.setItem('ignore', JSON.stringify(ignoreData));
			}
		} catch (e) {
			console.error(e);
		}
	},
	'wildcardChecker': function(array, input) {
		if (!input)
			return false;
		for (const regex of array) {
			if (input.match(new RegExp(regex))) {
				return true;
			}
		}
		return false;
	},
	'ignoring': function(user, type) {
		if (!user)
			return false;
		let nick;
		if (typeof user === 'string' || user instanceof String) {
			nick = user;
			user = connection.chat.users.getExistingUser(nick);
		} else {
			nick = user.nick;
		}
		if (nick.isInList(servicesNicks))
			return false;

		if (!user)
			return false;

		if (user.realname && ignore.wildcardChecker(ignoreData.realname[type], user.realname.replace(/ /g, '_')))
			return true;
		if (user.account && ignore.wildcardChecker(ignoreData.account[type], user.account))
			return true;
		if (user.host && user.ident) {
			if (ignore.wildcardChecker(ignoreData.userhost[type], `${nick  }!${  user.ident  }@${  user.host}`))
				return true;
		} else {
			if (ignore.wildcardChecker(ignoreData.userhost[type], `${nick  }!*@*`))
				return true;
		}
		return false;
	},
	'getIgnoreList': function() {
		const data = [];
		for (const entry of ignoreData.realname.channel) {
			data.push(['channel', `~r:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.realname.query) {
			data.push(['query', `~r:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.account.channel) {
			data.push(['channel', `~a:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.account.query) {
			data.push(['query', `~a:${  $$.regexToWildcard(entry)}`]);
		}
		for (const entry of ignoreData.userhost.channel) {
			data.push(['channel', $$.regexToWildcard(entry)]);
		}
		for (const entry of ignoreData.userhost.query) {
			data.push(['query', $$.regexToWildcard(entry)]);
		}
		return data;
	},
	'showIgnoreManagement': function() {
		const data = ignore.getIgnoreList();
		if (uiDialogs.getDialogSelector('ignore', 'ignorelist').length != 0) {
			uiDialogs.closeDialog('ignore', 'ignorelist');
		}
		let $content;
		if (data.length == 0) {
			$content = $('<span>').text(language.listIsEmpty);
		} else {
			const $table = $('<table>').append(
				$('<tr>').append($('<th>').text(language.appliesTo)).append($('<th>').text(language.mask))
			);
			$content = $('<div>', { class: 'beIListContents' }).append($table);
		}
		uiDialogs.displayDialog('ignore', 'ignorelist', language.listOfIgnoredUsers, $content);
		if (data.length > 0) {
			const $table = $('table', uiDialogs.getDialogSelector('ignore', 'ignorelist'));
			$table.on('click', 'button', function() {
				ignore.unIgnore($(this).data('type'), $(this).data('mask'));
				ignore.showIgnoreManagement();
			});
			for (const [ignoreT, ignoreMask] of data) {
				const ignoreType = ignoreT == 'channel' ? language.channelSmall : language.privateDiscussionSmall;
				const $row = $('<tr>')
					.append($('<td>').text(ignoreType))
					.append($('<td>').text(ignoreMask))
					.append($('<td>').append(
						$('<button>').text(language.remove).data('type', ignoreT).data('mask', ignoreMask)
					));
				$table.append($row);
			}
		}
		const $addForm = $('<div>')
			.append($('<hr>', { style: 'margin-top:5px;margin-bottom:5px;' }))
			.append($('<strong>').text(language.addListEntry))
			.append($('<br>'))
			.append($('<p>').append($('<input>', { type: 'text', id: 'new_ignore_mask' })))
			.append($('<p>')
				.append($('<input>', { type: 'checkbox', id: 'new_ignore_query' }))
				.append(document.createTextNode(` ${  language.privateMessages}`))
				.append($('<br>'))
				.append($('<input>', { type: 'checkbox', id: 'new_ignore_channel' }))
				.append(document.createTextNode(` ${  language.channelMessages}`))
			)
			.append($('<p>').append($('<input>', { type: 'button', id: 'ignore-add-button', value: language.add })));
		uiDialogs.getDialogSelector('ignore', 'ignorelist').append($addForm);
		$('#ignore-add-button').click(ignore.ignoreClickInput);
	},
	'isInList': function(type, maskType, regex) {
		if (ignoreData[maskType][type].indexOf(regex) >= 0)
			return true;
		return false;
	},
	'unIgnore': function(type, mask) {
		ignore.changeIgnoreList(type, mask, false);
	},
	'changeIgnoreList': function(type, mask, add) {
		let maskType = 'userhost';
		let infoText = mask;
		if (mask.indexOf('~r:') == 0) {
			maskType = 'realname';
			mask = mask.substring(3);
		} else if (mask.indexOf('~a:') == 0) {
			maskType = 'account';
			mask = mask.substring(3);
		}
		if (maskType == 'userhost' && mask.indexOf('@') < 0) {
			mask += '!*@*';
			infoText = mask;
		}
		if (maskType == 'userhost' && mask.indexOf('!') < 0) {
			mask = `*!${  mask}`;
			infoText = mask;
		}

		const regex = $$.wildcardToRegex(mask);
		let pattern;
		try {
			if (add) {
				if (ignore.isInList(type, maskType, regex)) { // TODO handle new types
					return; //już jest
				}
				switch (maskType) {
					case 'realname':
						ignoreData.realname[type].push(regex);
						break;
					case 'account':
						ignoreData.account[type].push(regex);
						break;
					case 'userhost':
						ignoreData.userhost[type].push(regex);
						break;
				}
				if (type == 'channel') {
					pattern = language.messagePatterns.channelIgnoreAdded;
				} else {
					pattern = language.messagePatterns.queryIgnoreAdded;
				}
			} else {
				if (!ignore.isInList(type, maskType, regex)) { // TODO handle new types
					return; //nie ma czego usuwać
				}
				switch (maskType) {
					case 'realname':
						ignoreData.realname[type].splice(ignoreData.realname[type].indexOf(regex), 1);
						break;
					case 'account':
						ignoreData.account[type].splice(ignoreData.account[type].indexOf(regex), 1);
						break;
					case 'userhost':
						ignoreData.userhost[type].splice(ignoreData.userhost[type].indexOf(regex), 1);
						break;
				}
				if (type == 'channel') {
					pattern = language.messagePatterns.channelIgnoreRemoved;
				} else {
					pattern = language.messagePatterns.queryIgnoreRemoved;
				}
			}
			uiState.statusWindow.appendMessage(pattern, [$$.niceTime(), he(infoText)]);
			uiState.statusWindow.markBold();
			localStorage.setItem('ignore', JSON.stringify(ignoreData));
		} catch (e) {
			uiDialogs.displayDialog('error', 'ignore', language.error, language.operationFailed);
		}
	},
	'ignoreClickInput': function() {
		const channel = $('#new_ignore_channel').prop('checked');
		const query = $('#new_ignore_query').prop('checked');
		const mask = $('#new_ignore_mask').val();
		if (mask.length == 0) {
			uiDialogs.alert(language.noMaskGiven);
			return;
		}
		if (mask.indexOf(' ') > -1) {
			uiDialogs.alert(language.maskCantContainSpaces);
			return;
		}
		if (!channel && !query) {
			uiDialogs.alert(language.neitherChannelNorQuerySelected);
			return;
		}
		if (channel && (mask == '*' || mask == '*!*@*')) {
			uiDialogs.alert(language.cantIgnoreAllInChannels);
			return;
		}
		if (channel) {
			ignore.changeIgnoreList('channel', mask, true);
		}
		if (query) {
			ignore.changeIgnoreList('query', mask, true);
		}
		ignore.showIgnoreManagement();
	},
	'ignoreClick': function(user, nick) {
		if (!$(`#${  user.id  }_was_ignored`).prop('checked') && !$(`#${  user.id  }_ignore_query`).prop('checked') && !$(`#${  user.id  }_ignore_channel`).prop('checked')) {
			uiDialogs.alert(language.neitherChannelNorQuerySelected);
			return false;
		}
		const ignoreType = $(`#${  user.id  }_ignore_type option:selected`).val();
		switch (ignoreType) {
			case 'nick':
				ignore.changeIgnoreList('query', `${nick  }!*@*`, $(`#${  user.id  }_ignore_query`).prop('checked'));
				ignore.changeIgnoreList('channel', `${nick  }!*@*`, $(`#${  user.id  }_ignore_channel`).prop('checked'));
				break;
			case 'host':
				ignore.changeIgnoreList('query', `*!*@${  user.host}`, $(`#${  user.id  }_ignore_query`).prop('checked'));
				ignore.changeIgnoreList('channel', `*!*@${  user.host}`, $(`#${  user.id  }_ignore_channel`).prop('checked'));
				break;
			case 'realname':
				ignore.changeIgnoreList('query', `~r:${  user.realname.replace(/ /g, '_')}`, $(`#${  user.id  }_ignore_query`).prop('checked'));
				ignore.changeIgnoreList('channel', `~r:${  user.realname.replace(/ /g, '_')}`, $(`#${  user.id  }_ignore_channel`).prop('checked'));
				break;
			case 'account':
				ignore.changeIgnoreList('query', `~a:${  user.account}`, $(`#${  user.id  }_ignore_query`).prop('checked'));
				ignore.changeIgnoreList('channel', `~a:${  user.account}`, $(`#${  user.id  }_ignore_channel`).prop('checked'));
				break;
		}
		return true;
	},
	'askIgnore': function(user) {
		if (!user) {
			console.error('askIgnore called with invalid argument');
			return;
		}
		let nick;
		if (typeof user === 'string' || user instanceof String) {
			nick = user;
			user = connection.chat.users.getExistingUser(nick);
		} else {
			nick = user.nick;
		}

		if (nick.isInList(servicesNicks)) {
			uiDialogs.displayDialog('error', 'ignore', language.error, language.cantIgnoreNetworkService, 'OK');
			return;
		}

		// If user is not in the user list, create a minimal object for nick-only masking
		if (!user) {
			user = {
				id: nick.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() + '-unknown',
				nick: nick,
				host: null,
				ident: null,
				realname: null,
				account: null
			};
		}

		const chanNickIgnored = ignore.isInList('channel', 'userhost', $$.wildcardToRegex(`${nick  }!*@*`));
		const queryNickIgnored = ignore.isInList('query', 'userhost', $$.wildcardToRegex(`${nick  }!*@*`));
		const chanIgnored = ignore.ignoring(nick, 'channel');
		const queryIgnored = ignore.ignoring(nick, 'query');
		let html =
			`<p><select id="${  user.id  }_ignore_type">` +
				`<option value="nick">(${  language.nicknameSmall  }) ${  he(user.nick)  }!*@*</option>`;
		if (user.host)
			html += `<option value="host">(${  language.hostnameSmall  }) *!*@${  he(user.host)  }</option>`;
		if (user.realname)
			html += `<option value="realname">(${  language.realnameSmall  }) ~r:${  he(user.realname.replace(/ /g, '_'))  }</option>`;
		if (user.account)
			html += `<option value="account">(${  language.accountNameSmall  }) ~a:${  he(user.account)  }</option>`;
		html += '</select></p>' +
			`<p><input type="checkbox" id="${  user.id  }_ignore_query"> ${  language.ignorePMs  }</p>` +
			`<p><input type="checkbox" id="${  user.id  }_ignore_channel"> ${  language.ignoreChanMsgs  }</p>` +
			`<input type="checkbox" style="display:none;" id="${  user.id  }_was_ignored">`;
		if (chanIgnored || queryIgnored) {
			html += `<p>${  language.mayBeAlreadyIgnored  }</p>`;
		}
		html += `<p><a href="javascript:ignore.showIgnoreManagement();">${  language.manageIgnored  }</a></p>`;
		const button = [
			{
				text: language.cancel,
				click: function() {
					$(this).dialog('close');
				}
			},
			{
				text: language.applySetting,
				click: function() {
					if (ignore.ignoreClick(user, nick))
						$(this).dialog('close');
				}
			}
		];
		uiDialogs.displayDialog('ignore', `ignore${  user.id}`, language.ignoreUserNick + nick, html, button);
		if (chanNickIgnored) {
			$(`#${  user.id  }_ignore_channel`).prop('checked', true);
			$(`#${  user.id  }_was_ignored`).prop('checked', true);
		}
		if (queryNickIgnored) {
			$(`#${  user.id  }_ignore_query`).prop('checked', true);
			$(`#${  user.id  }_was_ignored`).prop('checked', true);
		}
		if (!chanNickIgnored && !queryNickIgnored) { // checked by default
			$(`#${  user.id  }_ignore_channel`).prop('checked', true);
			$(`#${  user.id  }_ignore_query`).prop('checked', true);
		}
	}
};

