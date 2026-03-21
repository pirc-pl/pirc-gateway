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

Object.assign(ignore, {
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
			$table.on('click', 'button', (e) => {
				ignore.unIgnore($(e.currentTarget).data('type'), $(e.currentTarget).data('mask'));
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
			let changed;
			if (add) {
				changed = ignore.addIgnore(type, maskType, regex);
				if (!changed) return;
				pattern = type == 'channel' ? language.messagePatterns.channelIgnoreAdded : language.messagePatterns.queryIgnoreAdded;
			} else {
				changed = ignore.removeIgnore(type, maskType, regex);
				if (!changed) return;
				pattern = type == 'channel' ? language.messagePatterns.channelIgnoreRemoved : language.messagePatterns.queryIgnoreRemoved;
			}
			uiState.statusWindow.appendMessage(pattern, [$$.niceTime(), he(infoText)]);
			uiState.statusWindow.markBold();
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
				id: `${nick.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()  }-unknown`,
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
});
