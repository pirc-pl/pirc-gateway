var conn = {
	'my_nick': '',
	'my_pass': '',
	'my_reqChannel' : '',
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
		conn.my_reqChannel = reqChannel;
		
		if($('#automLogIn').is(':checked')){
			var auto_initialized = false;
			if(gateway.initialize()){
				auto_initialized = true;
			}
		}
		if(!auto_initialized){
			var nconn_html = '<h3>' + he(guser.channels[0]) + ' @ PIRC.pl</h3><form onsubmit="gateway.initialize();$$.closeDialog(\'connect\', \'0\')" action="javascript:void(0);"><table>';
			nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Kanał:</td><td><input type="text" id="nschan" value="'+he(reqChannel)+'" /></td></tr>';
			nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Nick:</td><td><input type="text" id="nsnick" value="'+conn.my_nick+'" /></td></tr>';
			nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Hasło (jeżeli zarejestrowany):</td><td><input type="password" id="nspass" value="'+conn.my_pass+'" /></td></tr>';
			nconn_html += '<tr><td></td><td style="text-align: left;"><input type="checkbox" id="save_password" /> Zapisz hasło</td></tr>';
			nconn_html += '<tr><td></td><td style="text-align: left;"><input type="checkbox" id="enableautomLogIn" onchange="if($(\'#enableautomLogIn\').is(\':checked\')) $(\'#save_password\').prop(\'checked\', true);" /> Zapisz wszystkie dane i nie wyświetlaj ponownie tego okna</td></tr>';
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
			if(conn.my_nick == ''){
				$('#nsnick').focus();
			} else {
				$('#nspass').focus();
			}
		}
		$('#not_connected_wrapper').fadeOut(400);
	},
	'gatewayInit': function(){
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

