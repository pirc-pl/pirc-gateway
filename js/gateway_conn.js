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

var guser = {
	'nick': '',
	'channels': [],
	'nickservpass': '',
	'nickservnick': '',
	'me': null,
	'changeNick': function(newnick, silent) {
		irc.lastNick = guser.nick;
		guser.nick = newnick;
		$('#usernick').text(he(guser.nick));
		$(document).attr('title', he(guser.nick)+ ' @ '+mainSettings.networkName);
		if(!silent) {
			for (i in gateway.channels) {
				gateway.channels[i].appendMessage(language.messagePatterns.nickChangeOwn, [$$.niceTime(), he(guser.nick)]);
			}
		}
		return true;
	},
	'umodes': {},
	'setUmode': function(modechar, plus){
		if(modechar){
			guser.umodes[modechar] = plus;
		}
		if(modechar == 'r'){
			guser.me.setRegistered(plus);
		}
	},
	'clearUmodes': function(){
		guser.umodes = {};
	},
	'clear': function(){
		if(guser.me) guser.me.setRegistered(false);
		users.clear();
		guser.me = users.getUser('*');
		guser.clearUmodes();
		activeCaps = {};
		serverCaps = {};
		$('.setAvatar').hide();
		isupport = [];
		capInProgress = false;
		saslInProgress = false;
		// Batch tracking uses global domainBatch from gateway_domain.js
	}
};

function parsePath(){
	if(window.location.pathname == '/bramka'){ // old path prefix
		var path = '';
	} else if(window.location.pathname.indexOf('/bramka/') == 0){
		var path = window.location.pathname.substring(7);
	} else {
		var path = window.location.pathname;
	}
	var params = path.substring(1).split('/');
	if(params.length > 1 && params[1] != 'Anonymous'){
		guser.nick = params[1];
	}
	if(params.length > 0 && params[0].length > 0){
		guser.channels.push('#' + params[0]);
	}
}

parsePath();

var conn = {
	'my_nick': '',
	'my_pass': '',
	'my_reqChannel' : '',
	'connectTimeout': function(){
			$('.not-connected-text > p').html(language.connectingForTooLong + mainSettings.oldGatewayHtml);
	},
	'dispConnectDialog': function(){
		if(guser.channels.length > 0){
			var reqChannel = guser.channels[0];
		} else {
			var reqChannel = '';
		}
		conn.my_nick = dnick;

		try {
			if(reqChannel == ''){
				if(localStorage.getItem('channel')){
					reqChannel = localStorage.getItem('channel');
				}
			}
			if(conn.my_nick == ''){
				if(localStorage.getItem('nick')){
					conn.my_nick = localStorage.getItem('nick');
				}
			}
			if(conn.my_nick == localStorage.getItem('nick')){
				if(localStorage.getItem('password')){
					conn.my_pass = decryptPassword(localStorage.getItem('password'));
				}
			}
		} catch(e) {}
		conn.my_reqChannel = reqChannel;

		if(settings.get('automLogIn')){
			var auto_initialized = false;
			if(gateway.initialize()){
				auto_initialized = true;
			}
		}
		if(!auto_initialized){
			var nconn_html = '<h3>' + he(guser.channels[0]) + ' @ ' + mainSettings.networkName + '</h3><form onsubmit="if(gateway.initialize()){$$.closeDialog(\'connect\', \'0\');}" action="javascript:void(0);"><table>';
			nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">' + language.channel + ':</td><td><input type="text" id="nschan" value="'+he(reqChannel)+'" /></td></tr>';
			nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">' + language.nickname + ':</td><td><input type="text" id="nsnick" value="'+conn.my_nick+'" /></td></tr>';
			nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">' + language.passwordIfRegistered + ':</td><td><input type="password" id="nspass" value="'+conn.my_pass+'" /></td></tr>';
			nconn_html += '<tr><td></td><td style="text-align: left;"><input type="checkbox" id="save_password" /> ' + language.savePassword + '</td></tr>';
			nconn_html += '<tr><td></td><td style="text-align: left;"><input type="checkbox" id="enableautomLogIn" onchange="if($(\'#enableautomLogIn\').is(\':checked\')) $(\'#save_password\').prop(\'checked\', true);" /> ' + language.saveAllAndDontShowAgain + '</td></tr>';
			nconn_html += '</table><input type="submit" style="display:none"></form>';
			var button = [ {
				text: language.connectToIRC,
				click: function(){
					if(gateway.initialize()){
						$(this).dialog('close');
					}
				}
			} ];
			$$.displayDialog('connect', '0', language.logon, nconn_html, button);
			if(conn.my_nick == ''){
				$('#nsnick').focus();
			} else {
				$('#nspass').focus();
			}
		}
		$('#not_connected_wrapper').fadeOut(400);
	},
	'gatewayInit': function(){
		// Check for required browser capabilities
		if(!navigator.cookieEnabled){
			$('.not-connected-text > p').html(language.cookiesDisabledHtml);
			return;
		}
		if(!window.WebSocket){
			$('.not-connected-text > p').html(language.websocketDisabledHtml);
			return;
		}

		// Register cross-tab communication listener
		window.addEventListener('storage', gateway.storageHandler);

		conn.waitForAlive = true;
		try {
			localStorage.setItem('checkAlive', Math.random().toString());
		} catch(e) {}
		conn.aliveWaitTimeout = setTimeout(function(){
			if(conn.waitForAlive){
				try {
					localStorage.removeItem('checkAlive');
				} catch(e) {}
				conn.dispConnectDialog();
				conn.waitForAlive = false;
			}
		}, 100);
		$('#input').on('paste', gateway.inputPaste);
		if(!('customElements' in window)){
			$('body').css('font-family', 'verdana,arial,tahoma,Symbola,sans-serif'); // fallback if custom elements (for emoji) not supported
		}
		users.clear();
		setInterval(gateway.updateHistory, 15000);
	},
	'aliveWaitTimeout': false,
	'waitForAlive': false,

}

// Helper function to get tab name by display index (1-based)
function getTabNameByIndex(index) {
	if(index < 1) return null;
	var tabElements = $('#tabs > li');
	if(index > tabElements.length) return null;

	var targetTab = tabElements.eq(index - 1);
	var tabId = targetTab.attr('id');

	if(tabId === '--status-tab') {
		return '--status';
	}

	// Find matching channel or query by ID
	for(var i = 0; i < gateway.channels.length; i++) {
		if(gateway.channels[i].id + '-tab' === tabId) {
			return gateway.channels[i].name;
		}
	}
	for(var i = 0; i < gateway.queries.length; i++) {
		if(gateway.queries[i].id + '-tab' === tabId) {
			return gateway.queries[i].name;
		}
	}

	return null;
}

// Register initialization function for this module
ircEvents.on('system:ready', conn.gatewayInit);

// Add event listeners that were removed.
ircEvents.on('system:ready', function() {
	$('#chatbox').click(function() {
		gateway.inputFocus();
	});
	$('#nicklist').click(function() {
		gateway.inputFocus();
	});
	$(window).resize(function () {
		$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
	});
	$('#input').keydown(function(e) {
		if(e.which == 13 || e.which == 38 || e.which == 40 || e.which == 9) {
			e.preventDefault();
		}
	});
	$('#input').keyup(function(e) {
		if(e.which == 13) {
			if($('#input').val() != '') {
				gateway.enterPressed();
			}
			e.preventDefault();
		} else if(e.which == 38) { //strzalka w gore
			e.preventDefault();
			gateway.arrowPressed('up');
		} else if(e.which == 40) { // strzalka w dol
			e.preventDefault();
			gateway.arrowPressed('down');
		} else if(e.which == 9) { // TAB
			gateway.doComplete();
			e.preventDefault();
			return false;
		} else if (!e.altKey) {
			gateway.inputKeypress();
		}
		if(e.which != 9) { // nie TAB
			gateway.completion.repeat = 0;
			gateway.completion.string = '';
			gateway.completion.array = [];
		}
	});

	// Document-level keyboard shortcuts for tab switching
	$(document).keydown(function(e) {
		// Only handle Alt key (not AltGr which is Alt+Ctrl)
		if(!e.altKey || e.ctrlKey || e.metaKey) {
			return;
		}

		var handled = false;
		var tabName = null;

		// Alt+1 through Alt+9 → tabs 1-9
		if(e.which >= 49 && e.which <= 57) {
			var tabIndex = e.which - 48;
			tabName = getTabNameByIndex(tabIndex);
			handled = true;
		}
		// Alt+0 → tab 10
		else if(e.which === 48) {
			tabName = getTabNameByIndex(10);
			handled = true;
		}
		// Alt+Q through Alt+O → tabs 11-19
		else if(e.which === 81) { // Q
			tabName = getTabNameByIndex(11);
			handled = true;
		}
		else if(e.which === 87) { // W
			tabName = getTabNameByIndex(12);
			handled = true;
		}
		else if(e.which === 69) { // E
			tabName = getTabNameByIndex(13);
			handled = true;
		}
		else if(e.which === 82) { // R
			tabName = getTabNameByIndex(14);
			handled = true;
		}
		else if(e.which === 84) { // T
			tabName = getTabNameByIndex(15);
			handled = true;
		}
		else if(e.which === 89) { // Y
			tabName = getTabNameByIndex(16);
			handled = true;
		}
		else if(e.which === 85) { // U
			tabName = getTabNameByIndex(17);
			handled = true;
		}
		else if(e.which === 73) { // I
			tabName = getTabNameByIndex(18);
			handled = true;
		}
		else if(e.which === 79) { // O
			tabName = getTabNameByIndex(19);
			handled = true;
		}
		// Alt+Left Arrow → previous tab
		else if(e.which === 37) {
			gateway.prevTab();
			handled = true;
		}
		// Alt+Right Arrow → next tab
		else if(e.which === 39) {
			gateway.nextTab();
			handled = true;
		}

		// Switch to tab if we found one
		if(handled) {
			e.preventDefault();
			if(tabName) {
				gateway.switchTab(tabName);
			}
		}
	});

	try {
		$('#not_connected_wrapper').fadeIn(200);
	} catch(e) {
		browserTooOld();
	}
	dnick = he(guser.nick);
	if(guser.nick == '1') {
		dnick = ''
		$(document).attr('title', language.unknown + ' @ ' + mainSettings.networkName);
	}
	$(window).on('beforeunload', function() {
		if (getDomainConnectStatus() != 'disconnected') {
			if (settings.get('autoDisconnect')) {
				ircEvents.emit('domain:requestQuit', { message: language.userClosedPage });
				ircEvents.emit('domain:setUserQuit', { status: true });
			} else {
				gateway.clickQuit(); // This shows a dialog which handles quit or cancel
				return language.youreStillConnected;
			}
		}
	});
});
