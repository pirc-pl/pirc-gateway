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

// SelfUser (chat.me) is created inside ChatIntegrator (chat_integrator.js).
// parsePath() stores initial nick/channels in conn so that gateway_main.js
// can pass them to the ChatIntegrator constructor.

function parsePath() {
	let path;
	if (window.location.pathname == '/bramka') { // old path prefix
		path = '';
	} else if (window.location.pathname.indexOf('/bramka/') == 0) {
		path = window.location.pathname.substring(7);
	} else {
		path = window.location.pathname;
	}
	const params = path.substring(1).split('/');
	if (params.length > 1 && params[1] != 'Anonymous') {
		conn.initialNick = params[1];
	}
	if (params.length > 0 && params[0].length > 0) {
		conn.initialChannels.push(`#${  params[0]}`);
	}
}

// conn is declared below so parsePath can reference it; parsePath is called after conn is defined.

const conn = {
	'my_nick': '',
	'my_pass': '',
	'my_reqChannel': '',
	// Initial nick/channel from URL path (set by parsePath before ChatIntegrator is created)
	'initialNick': '',
	'initialChannels': [],
	'connectTimeout': function() {
		$('.not-connected-text > p').html(language.connectingForTooLong + mainSettings.oldGatewayHtml);
	},
	'dispConnectDialog': function() {
		let reqChannel;
		if (connection.chat.me.channels.length > 0) {
			reqChannel = connection.chat.me.channels[0];
		} else {
			reqChannel = '';
		}
		conn.my_nick = dnick;

		try {
			if (reqChannel == '') {
				if (localStorage.getItem('channel')) {
					reqChannel = localStorage.getItem('channel');
				}
			}
			if (conn.my_nick == '') {
				if (localStorage.getItem('nick')) {
					conn.my_nick = localStorage.getItem('nick');
				}
			}
			if (conn.my_nick == localStorage.getItem('nick')) {
				if (localStorage.getItem('password')) {
					conn.my_pass = decryptPassword(localStorage.getItem('password'));
				}
			}
		} catch (e) {}
		conn.my_reqChannel = reqChannel;

		let auto_initialized = false;
		if (settings.get('automLogIn')) {
			if (uiDialogs.initialize()) {
				auto_initialized = true;
			}
		}
		if (!auto_initialized) {
			let nconn_html = `<h3>${  he(connection.chat.me.channels[0])  } @ ${  mainSettings.networkName  }</h3><form onsubmit="if(uiDialogs.initialize()){uiDialogs.closeDialog('connect', '0');}" action="javascript:void(0);"><table>`;
			nconn_html += `<tr><td style="text-align: right; padding-right: 10px;">${  language.channel  }:</td><td><input type="text" id="nschan" value="${  he(reqChannel)  }" /></td></tr>`;
			nconn_html += `<tr><td style="text-align: right; padding-right: 10px;">${  language.nickname  }:</td><td><input type="text" id="nsnick" value="${  he(conn.my_nick)  }" /></td></tr>`;
			nconn_html += `<tr><td style="text-align: right; padding-right: 10px;">${  language.passwordIfRegistered  }:</td><td><input type="password" id="nspass" value="${  he(conn.my_pass)  }" /></td></tr>`;
			nconn_html += `<tr><td></td><td style="text-align: left;"><input type="checkbox" id="save_password" /> ${  language.savePassword  }</td></tr>`;
			nconn_html += `<tr><td></td><td style="text-align: left;"><input type="checkbox" id="enableautomLogIn" onchange="if($('#enableautomLogIn').is(':checked')) $('#save_password').prop('checked', true);" /> ${  language.saveAllAndDontShowAgain  }</td></tr>`;
			nconn_html += '</table><input type="submit" style="display:none"></form>';
			const button = [ {
				text: language.connectToIRC,
				click: function() {
					if (uiDialogs.initialize()) {
						$(this).dialog('close');
					}
				}
			} ];
			uiDialogs.displayDialog('connect', '0', language.logon, nconn_html, button);
			if (conn.my_nick == '') {
				$('#nsnick').focus();
			} else {
				$('#nspass').focus();
			}
		}
		$('#not_connected_wrapper').fadeOut(400);
	},
	'gatewayInit': function() {
		// Check for required browser capabilities
		if (!navigator.cookieEnabled) {
			$('.not-connected-text > p').html(language.cookiesDisabledHtml);
			return;
		}
		if (!window.WebSocket) {
			$('.not-connected-text > p').html(language.websocketDisabledHtml);
			return;
		}

		// Register cross-tab communication listener
		window.addEventListener('storage', (evt) => {
			commandBus.emit('chat:processStorageEvent', { evt: evt });
		});

		conn.waitForAlive = true;
		try {
			localStorage.setItem('checkAlive', Math.random().toString());
		} catch (e) {}
		conn.aliveWaitTimeout = setTimeout(() => {
			if (conn.waitForAlive) {
				try {
					localStorage.removeItem('checkAlive');
				} catch (e) {}
				conn.dispConnectDialog();
				conn.waitForAlive = false;
			}
		}, 100);
		$('#input').on('paste', uiInput.inputPaste);
		if (!('customElements' in window)) {
			$('body').css('font-family', 'verdana,arial,tahoma,Symbola,sans-serif'); // fallback if custom elements (for emoji) not supported
		}
		connection.chat.users.clear();
		setInterval(uiDialogs.updateHistory, 15000);
	},
	'aliveWaitTimeout': false,
	'waitForAlive': false,

};

// Parse URL path to extract initial nick and channel, stored in conn.
parsePath();

// Helper function to get tab name by display index (1-based)
function getTabNameByIndex(index) {
	if (index < 1) return null;
	const tabElements = $('#tabs > li');
	if (index > tabElements.length) return null;

	const targetTab = tabElements.eq(index - 1);
	const tabId = targetTab.attr('id');

	if (tabId === '--status-tab') {
		return '--status';
	}

	// Find matching channel or query by ID
	for (const channel of uiState.channels) {
		if (`${channel.id  }-tab` === tabId) {
			return channel.name;
		}
	}
	for (const query of uiState.queries) {
		if (`${query.id  }-tab` === tabId) {
			return query.name;
		}
	}

	return null;
}

