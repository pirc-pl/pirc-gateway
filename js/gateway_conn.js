var conn = {
	'my_nick': '',
	'my_pass': '',
	'connectTimeout': function(){
			$('.not-connected-text > p').html('Łączenie z serwerem trwa zbyt długo, serwer bramki nie działa lub twoja przeglądarka nie funkcjonuje prawidłowo.<br />Spróbuj ponownie później lub spróbuj '+oldGatewayHtml);
	},
	'dispConnectDialog': function(){
		reqChannel = guser.channels[0];
		conn.my_nick = dnick;

		try {
			if(reqChannel == '#'){
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
					conn.my_pass = atob(localStorage.getItem('password'));
				}
			}
		} catch(e) {}
	
	/*	gateway.websock = new WebSocket(server);
		if(gateway.connectTimeoutID){
			clearTimeout(gateway.connectTimeoutID);
		}
		gateway.connectTimeoutID = setTimeout(conn.connectTimeout, 20000);
		gateway.websock.onmessage = conn.processReply;
		gateway.websock.onerror = conn.connectTimeout;
		gateway.websock.onclose = conn.connectTimeout;
		gateway.websock.onopen = function(e) {
			gateway.forceSend('SYNC '+sessionid);
		};
	},
	'processReply': function(e){
		var regexp = /^SYNC ([^ ]+)$/i
		var rmatch = regexp.exec(e.data);
		if(rmatch && rmatch[1]){
			clearTimeout(gateway.connectTimeoutID);
			connectTimeoutID = false;
			gateway.websock.onerror = undefined;
			gateway.websock.onclose = undefined;
			if(rmatch[1] == '1'){
				gateway.recoverConnection();
			} else {*/
				var nconn_html = '<h3>' + he(guser.channels[0]) + ' @ PIRC.pl</h3><form onsubmit="gateway.initialize();$$.closeDialog(\'connect\', \'0\')" action="javascript:void(0);"><table>';
				nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Kanał:</td><td><input type="text" id="nschan" value="'+he(reqChannel)+'" /></td></tr>';
				nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Nick:</td><td><input type="text" id="nsnick" value="'+conn.my_nick+'" /></td></tr>';
				nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Hasło (jeżeli zarejestrowany):</td><td><input type="password" id="nspass" value="'+conn.my_pass+'" /></td></tr>';
				nconn_html += '<tr><td></td><td style="text-align: left;"><input type="checkbox" id="save_password" /> Zapisz hasło</td></tr>';
				nconn_html += '</table><input type="submit" style="display:none"></form>';
				var button = [ {
					text: 'Połącz z IRC',
					click: function(){
						if(gateway.initialize()){
							$(this).dialog('close');
						}
					}
				} ];
				$$.displayDialog('connect', '0', 'Logowanie', nconn_html, button);
				$('#not_connected_wrapper').fadeOut(400); 
				if(conn.my_nick == ''){
					$('#nsnick').focus();
				} else {
					$('#nspass').focus();
				}
		/*	}
		}*/
	},
	'gatewayInit': function(){
		$('.not-connected-text p').html('Poczekaj chwilę, trwa ładowanie...');
		
		try {
			localStorage.removeItem('checkAliveReply');
			localStorage.removeItem('checkAlive');
			localStorage.removeItem('reqChannelJoin');

			booleanSettings.forEach(function(sname){
				if(localStorage.getItem(sname) == null){
					return;
				}
				$('#'+sname).prop('checked', str2bool(localStorage.getItem(sname)));
			});
			comboSettings.forEach(function(sname){
				if(localStorage.getItem(sname) == null){
					return;
				}
				$('#'+sname).val(localStorage.getItem(sname));
			});
			numberSettings.forEach(function(sname){
				if(localStorage.getItem(sname) == null){
					return;
				}
				$('#'+sname).val(localStorage.getItem(sname));
			});
			disp.setSize(localStorage.getItem('tsize'));
			var ignoreList = localStorage.getItem('ignore');
			if(ignoreList){
				ignoreData = JSON.parse(ignoreList);
			}
		} catch(e){
			//za mało miejsca na dysku?
		}
		disp.changeSettings();
		
		$('#chatbox').click(function() {
		/*	gateway.closeNotify();
			gateway.closeNotice();
			gateway.closeStatus();
			gateway.closeError();*/
			gateway.inputFocus();
		});
		$('#nicklist').click(function() {
		/*	gateway.closeNotify();
			gateway.closeStatus();
			gateway.closeError();*/
			gateway.inputFocus();
		});
	/*	$('#info').click(function() {
			gateway.closeNotify();
			gateway.closeStatus();
			gateway.closeError();
		});*/
		/*$('#input').click(function() {
			gateway.closeNotify();
			gateway.closeNotice();
			gateway.closeStatus();
			gateway.closeError();
		});*/
		
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
					if(gateway.commandHistory.length == 0 || gateway.commandHistory[gateway.commandHistory.length-1] != $('#input').val()) {
						if(gateway.commandHistoryPos != -1 && gateway.commandHistoryPos == gateway.commandHistory.length-1) {
							gateway.commandHistory[gateway.commandHistoryPos] = $('#input').val();
						} else {
							gateway.commandHistory.push($('#input').val());
						}
					}
					gateway.parseUserInput($('#input').val());
					gateway.commandHistoryPos = -1;
				}
				e.preventDefault();
			} else if(e.which == 38) { //strzalka w gore
				e.preventDefault();
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
			} else if(e.which == 40) { // strzalka w dol
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
				e.preventDefault();
			}
		});
		
		$('#input').keyup(function(e) {
			if(e.which == 9) { // TAB
				gateway.doComplete();
				e.preventDefault();
				return false;
			} else {
				gateway.completion.repeat = 0;
				gateway.completion.string = '';
				gateway.completion.array = [];
			}
		});

		try {
			$('#not_connected_wrapper').fadeIn(200);
		} catch(e) {
			browserTooOld();
		}
	//	$('.not-connected-text > h3').html(he(guser.channels[0]) + ' @ PIRC.pl');
		dnick = he(guser.nick);
		if(guser.nick == '1') {
			dnick = ''
			$(document).attr('title', 'Nieznany @ PIRC.pl');
		}
		$(window).on('beforeunload', function() {
			if (gateway.connectStatus != statusDisconnected) {
				if ($('#autoDisconnect').is(':checked')) {
					gateway.send('QUIT :Użytkownik zamknął stronę');
					gateway.userQuit = true;
					gateway.connectStatus = statusDisconnected;
				} else {
					gateway.clickQuit();
					return 'Jesteś nadal połączony z IRCem. Kliknij "Zostań na stronie" a następnie "Rozłącz" w okienku poniżej aby się rozłączyć przed wyjściem.';
				}
			}
		});
		
		if(!navigator.cookieEnabled){
			$('.not-connected-text > p').html('Twoja przeglądarka ma wyłączoną obsługę ciasteczek. Niektóre funkcje bramki mogą działać nieprawidłowo.<br /><input type="button" onclick="conn.dispConnectDialog();" value="Kontynuuj" />');
			return;
		}
		if(window.WebSocket == null){
			$('.not-connected-text > p').html('Twoja przeglądarka nie obsługuje WebSocket. Nie można uruchomić bramki.<br />Spróbuj '+oldGatewayHtml);
			return;
		}
		
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
	},
	'aliveWaitTimeout': false,
	'waitForAlive': false
}

