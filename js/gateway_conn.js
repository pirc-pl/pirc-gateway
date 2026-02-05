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
		gateway.batch = {};
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
			nconn_html += '<tr><td></td><td style="text-align: left;"><input type="checkbox" id="enableautomLogIn" /> ' + language.saveAllAndDontShowAgain + '</td></tr>';
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

// Register initialization function for this module
ircEvents.on('system:ready', conn.gatewayInit);

