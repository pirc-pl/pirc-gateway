var services = {
	'badNickCounter': false,
	'badNickInterval': false,
	'nickStore': '',
	'showTimeToChange': false,
	'ignoreNextAccessDenial': false,
	'badNickString': '<div class="table">'+
		'<form class="tr" onsubmit="services.logIn();$$.closeDialog(\'error\', \'nickserv\')" action="javascript:void(0);">'+
			'<span class="td_right">Twoje hasło:</span>'+
			'<span class="td"><input type="password" id="nspass" /></span>'+
			'<span class="td"><input type="submit" value="Zaloguj" /></span>'+
		'</form>'+
		'<form class="tr" onsubmit="services.changeNick();$$.closeDialog(\'error\', \'nickserv\')" action="javascript:void(0);">'+
			'<span class="td_right">Nowy nick:</span>'+
			'<span class="td"><input type="text" id="nnick" /></span>'+
			'<span class="td"><input type="submit" value="Zmień nick" /></span>'+
		'</form>'+
	'</div>',
	'nickservMessage': function(msg){
		if (msg.text.match(/^Hasło przyjęte - jesteś zidentyfikowany\(a\)\.$/i)){
			services.showTimeToChange = false;
			$$.closeDialog('error', 'nickserv');
			return false;
		}
		if(msg.text.match(/^Nick [^ ]+ nie jest zarejestrowany\.$/i) && guser.nickservpass != ''){
			guser.nickservpass = '';
			guser.nickservnick = '';
			return false;
		}
		if (msg.text.match(/^Nieprawid.owe has.o\.$/i)) { // złe hasło nickserv
			services.showTimeToChange = true;
			services.nickStore = guser.nickservnick;
			var html = 'Podane hasło do nicka <b>'+guser.nickservnick+'</b> jest błędne. Możesz spróbować ponownie lub zmienić nicka.<br>'+services.badNickString;
			$$.displayDialog('error', 'nickserv', 'Błąd', html);
			return true;
		}
		if(msg.text.match(/^Ten nick jest zarejestrowany i chroniony\.( Je.li nale.y do Ciebie,)?$/i)){
			if(guser.nickservpass == ''){
				services.showTimeToChange = true;
				services.nickStore = guser.nick;
				var html = 'Wybrany nick <b>'+guser.nick+'</b> jest zarejestrowany. Musisz go zmienić lub podać hasło.<br>'+services.badNickString;
				$$.displayDialog('error', 'nickserv', 'Błąd', html);
			}
			return true;
		}
		if(msg.text.match(/^Zidentyfikuj się pisząc: /i)
			|| msg.text.match(/^jeśli nick należy do Ciebie, w przeciwnym razie zmień go\.$/i)
			|| msg.text.match(/^Nick .* nie jest zajęty przez serwisy\.$/i)
			|| msg.text.match(/^Nick .* nie jest aktualnie używany\.$/i)

			|| msg.text.match(/^wpisz .\/msg NickServ IDENTIFY .hasło..\. W przeciwnym wypadku$/i)
			|| msg.text.match(/^wybierz proszę inny nick.$/i)){
				return true;
		}
		if(msg.text.match(/^Odmowa dostępu\.$/i)){
			if(gateway.connectStatus == statusGhostSent || gateway.connectStatus == statusGhostAndNickSent){
				gateway.connectStatus = statusIdentified;
				services.nickStore = guser.nickservnick;
				guser.nickservnick = '';
				guser.nickservpass = '';
				var html = 'Podane hasło do zajętego nicka <b>'+guser.nickservnick+'</b> jest błędne. Możesz spróbować ponownie odzyskać nicka, podając poprawne hasło, lub go zmienić.<br>'+services.badNickString;
				$$.displayDialog('error', 'nickserv', 'Błąd', html);
				services.ignoreNextAccessDenial = true;
				return true;
			} else if(services.ignoreNextAccessDenial){
				services.ignoreNextAccessDenial = false;
				return true;
			}
			return false;
		}
		if(msg.text.match(/^Nick został usunięty z sieci\.$/i) || msg.text.match(/^Serwisy właśnie zwolniły.*nicka.*\.$/i)){
			if(gateway.connectStatus == statusGhostSent){
				gateway.send("NICK "+guser.nickservnick);
				gateway.connectStatus = statusGhostAndNickSent;
			}
			return true;
		}
		var time = false;
		var expr = /^Masz (.*) na zmianę nicka, potem zostanie zmieniony siłą\.$/i;
		var match = expr.exec(msg.text);
		if(!match){
			var expr = /^Jeśli go nie zmienisz w ciągu (.*), zostanie zmieniony siłą\.$/i;
			match = expr.exec(msg.text);
		}
		if(match){
			if(services.showTimeToChange){
				var html = '<br>Masz <span id="nickserv_timer"></span> na zmianę nicka, potem zostanie zmieniony siłą. Bez obaw: gdy wpiszesz poprawne hasło, to odzyskasz swojego nicka.';
				$$.displayDialog('error', 'nickserv', 'Błąd', html);
				var countStart = false;
				if(match[1] == 'jedną minutę' || match[1] == '60 sekund(y)' || match[1] == '1 minuta(y)' || match[1] == '1 minuta'){
					$('#nickserv_timer').text('60 sekund');
					services.badNickCounter = 59;
					var countStart = true;
				} else if(match[1] == '20 sekund' || match[1] == '20 sekund(y)') {
					$('#nickserv_timer').text('20 sekund');
					services.badNickCounter = 19;
					var countStart = true;
				} else {
					$('#nickserv_timer').text(match[1]);
				}
				if(countStart){
					if(services.badNickInterval){
						clearInterval(services.badNickInterval);
					}
					services.badNickInterval = setInterval(function(){
						if(!(services.badNickCounter > 0)){
							clearInterval(services.badNickInterval);
							services.badNickInterval = false;
						}
						var text = services.badNickCounter.toString() + ' sekund';
						if(services.badNickCounter == 1){
							text += 'ę';
						} else if((services.badNickCounter < 10 || services.badNickCounter > 20) && services.badNickCounter%10 > 1 && services.badNickCounter%10 < 5){
							text += 'y';
						}
						$('#nickserv_timer').text(text);
						services.badNickCounter--;
					}, 1000);
				}
			}
			return true;
		}
		return false;
	},
	'logIn': function(){
		if($('#nspass').val() == ''){
			$$.alert('Nie podałeś hasła!');
			return false;
		}
		guser.nickservnick = services.nickStore;
		guser.nickservpass = $('#nspass').val();
		gateway.connectStatus = status001;
		gateway.setConnectedWhenIdentified = 1;
		gateway.processStatus();
		gateway.send('PING :Init');
		$(".errorwindow").fadeOut(250);
		return true;
	},
	'changeNick': function(){
		if($('#nnick').val() == ''){
			$$.alert('Nie podałeś nicka!');
			return false;
		}
		gateway.send('NICK '+$('#nnick').val());
		$(".errorwindow").fadeOut(250);
		return true;
	},
	'nickInfo': function(nick){
		var nscommand = 'INFO '+nick+' ALL';
		var query = gateway.findOrCreate('NickServ', true);
		query.appendMessage(messagePatterns.yourMsg, [$$.niceTime(), $$.nickColor(guser.nick), guser.nick, nscommand]);
		gateway.send('PRIVMSG NickServ :'+nscommand);
	},
	'perform': function(service, msg, onlyRegistered){
		if(onlyRegistered && !services.requireRegisteredNick()){
			return;
		}
		gateway.send(service+' '+msg);		
	},
	'showChanServCmds': function(chan) {
		if(!services.requireRegisteredNick()) return;
		html = 'Uwaga: użycie każdej z funkcji wymaga odpowiednich uprawnień.<br>' +
			'<table>'+
			'<tr><td><button onclick="services.clickChanServ(\'ban\', \''+bsEscape(chan)+'\');">BAN</button></td><td>Nick/maska: <input type="text" id="cs-ban-'+md5(chan)+'"></td><td>Powód: <input type="text" id="cs-banreason-'+md5(chan)+'"></td><td>Banuj użytkownika</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'kick\', \''+bsEscape(chan)+'\');">KICK</button></td><td>Nick/maska: <input type="text" id="cs-kick-'+md5(chan)+'"></td><td>Powód: <input type="text" id="cs-kickreason-'+md5(chan)+'"></td><td>Kop użytkownika</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'register\', \''+bsEscape(chan)+'\');">REGISTER</button></td><td>Opis kanału: <input type="text" id="cs-register-'+md5(chan)+'"></td><td></td><td>Zarejestruj kanał</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'status\', \''+bsEscape(chan)+'\');">STATUS</button></td><td>Nick: <input type="text" id="cs-status-'+md5(chan)+'"></td><td></td><td>Sprawdź status użytkownika w ChanServ</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'access list\', \''+bsEscape(chan)+'\');">ACCESS LIST</button></td><td></td><td></td><td>Wyświetl listę dostępową</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'access del\', \''+bsEscape(chan)+'\');">ACCESS DEL</button></td><td>Nick: <input type="text" id="cs-acc-del-'+md5(chan)+'"></td><td></td><td>Usuń użytkownika z listy dostępowej</td></tr>'+
		'</table>';
		$$.displayDialog('admin', 'cs-'+chan, 'Polecenia ChanServ na '+he(chan), html);
		$$.alert('Funkcja w przygotowaniu - niektóre opcje mogą nie działać, a lista może być niepełna!');
	},
	'clickChanServ': function(cmd, chan){
		var opts = {
			'arg': [],
			'argreq': [],
			'cmd': ''
		};
		switch(cmd){
			case 'ban':
				opts.arg[0] = 'ban';
				opts.argreq[0] = true;
				opts.arg[1] = 'banreason';
				opts.cmd = 'BAN '+chan;
				break;
			case 'kick':
				opts.arg[0] = 'kick';
				opts.argreq[0] = true;
				opts.arg[1] = 'kickreason';
				opts.cmd = 'KICK '+chan;
				break;
			case 'register':
				opts.arg[0] = 'register';
				opts.cmd = 'REGISTER '+chan;
				break;
			case 'status':
				opts.arg[0] = 'status';
				opts.argreq[0] = true;
				opts.cmd = 'STATUS '+chan;
				break;
			case 'access list':
				opts.cmd = 'ACCESS '+chan+' LIST';
				break;
			case 'access del':
				opts.arg[0] = 'acc-del';
				opts.argreq[0] = true;
				opts.cmd = 'ACCESS '+chan+' DEL';
				break;
		}
		
		var cmdArgs = services.servMakeArgs(opts, cmd, chan, 'cs');
		if(cmdArgs === false){
			return;
		}
		var cmdString = 'CS '+opts.cmd+cmdArgs;
		gateway.performCommand(cmdString);
	},
	'showBotServCmds': function(chan){
		if(!services.requireRegisteredNick()) return;
		html = 'Uwaga: użycie każdej z funkcji wymaga odpowiednich uprawnień.<br>' +
			'<table>'+
			'<tr><td><button onclick="services.clickBotServ(\'botlist\', \'\');">BOTLIST</button></td><td></td><td></td><td>Pokaż listę botów</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'assign\', \''+bsEscape(chan)+'\');">ASSIGN</button></td><td>Nick (wybrany z BOTLIST): <input type="text" id="bs-assign-'+md5(chan)+'"></td><td></td><td>Przypisz bota do kanału</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'unassign\', \''+bsEscape(chan)+'\');">UNASSIGN</button></td><td></td><td></td><td>Usuń bota z kanału</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'act\', \''+bsEscape(chan)+'\');">ACT</button></td><td>Wiadomość: <input type="text" id="bs-act-'+md5(chan)+'"></td><td></td><td>Wyślij wiadomość na kanał (/me wiadomość)</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'say\', \''+bsEscape(chan)+'\');">SAY</button></td><td>Wiadomość: <input type="text" id="bs-say-'+md5(chan)+'"></td><td></td><td>Wyślij wiadomość na kanał</td></tr>'+
		'</table>';
		$$.displayDialog('admin', 'bs-'+chan, 'Polecenia BotServ na '+he(chan), html);
		$$.alert('Funkcja w przygotowaniu - niektóre opcje mogą nie działać, a lista może być niepełna!');
	},
	'clickBotServ': function(cmd, chan){
		var opts = {
			'arg': [],
			'argreq': [],
			'cmd': ''
		};
		switch(cmd){
			case 'botlist':
				opts.cmd = 'BOTLIST';
				break;
			case 'assign':
				opts.arg[0] = 'assign';
				opts.argreq[0] = true;
				opts.cmd = 'ASSIGN '+chan;
				break;
			case 'unassign':
				opts.cmd = 'UNASSIGN '+chan;
				break;
			case 'act':
				opts.arg[0] = 'act';
				opts.argreq[0] = true;
				opts.cmd = 'ACT '+chan;
				break;
			case 'say':
				opts.arg[0] = 'say';
				opts.argreq[0] = true;
				opts.cmd = 'SAY '+chan;
				break;
		}
		
		var cmdArgs = services.servMakeArgs(opts, cmd, chan, 'bs');
		if(cmdArgs === false){
			return;
		}
		var cmdString = 'BS '+opts.cmd+cmdArgs;
		gateway.performCommand(cmdString);
	},
	'servMakeArgs': function(opts, cmd, chan, service){
		var cmdString = '';
		for(var i=0; i<opts.arg.length; i++){
			if(opts.arg[i]){
				var arg = $('#'+service+'-'+opts.arg[i]+'-'+md5(chan)).val();
				if(!arg || arg == ''){
					if(opts.argreq[i]){
						$$.alert('Wymagany argument dla polecenia <b>'+cmd+'</b>!');
						return false;
					}
				}
				cmdString += ' '+arg;
			} else break;
		}
		return cmdString;
	},
	'showCSBan': function(channel, nick) {
		var html = '<p>Zbanuj i wyrzuć użytkownika '+he(nick)+' z kanału '+he(channel)+
				'. Możesz podać powód dla KICKa, który zostanie wyświetlony dla wszystkich użytkowników kanału.<br>Aby skorzystać z tej funkcji, musisz posiadać odpowiednie uprawnienia w ChanServ.</p>' +
			'<input type="text" id="kbinput" maxlength="307" /><br>' +
			'<input type="checkbox" id="kbtime"> Zdejmij bana automatycznie po 1 dniu';
		var button = [ {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: 'Zbanuj',
			click: function(){
				services.processCSBan(channel, nick);
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('admin', 'kb-'+channel, 'BAN', html, button);
	},
	'processCSBan': function(channel, nick) {
		var banString = 'CS BAN '+channel;
		if($('#kbtime').is(':checked')){
			banString += ' +1d';
		}
		banString += ' '+nick;
		if ($("#kbinput").val() != "") {
			banString += ' '+$("#kbinput").val();
		}
		gateway.performCommand(banString);
	},
	'requireRegisteredNick': function() {
		if(!guser.umodes.r){
			$$.alert('Musisz mieć zarejestrowanego nicka aby użyć tej opcji!');
			return false;
		}
		return true;
	},
	'changeMyNick': function() {
		var html = 'Nowy nick: <input type="text" value="'+guser.nick+'" id="nickChangeInput">';
		var button = [ {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: 'Zmień',
			click: function(){
				if(services.doChangeNick()){
					$(this).dialog('close');
				}
			}
		} ];
		$$.displayDialog('services', 'nickserv', 'Zmiana nicka', html, button);
	},
	'doChangeNick': function() {
		var newNick = $('#nickChangeInput').val();
		if(newNick == ''){
			$$.alert('Nie wpisano nicka!');
			return false;
		}
		if(newNick.indexOf(' ') > -1){
			$$.alert('Nick nie może zawierać spacji!');
			return false;
		}
		gateway.send('NICK '+newNick);
		return true;
	},
	'registerMyNick': function() {
		var html = '<table><tr><td style="text-align: right; padding-right: 10px;">Hasło:</td><td><input type="password" id="nickRegisterPass"></td></tr>'+
			'<tr><td style="text-align: right; padding-right: 10px;">Powtórz hasło:</td><td><input type="password" id="nickRegisterPassConf"></td></tr>'+
			'<tr><td style="text-align: right; padding-right: 10px;">E-mail:</td><td><input type="text" id="nickRegisterMail"></td></tr>'+
			'</table><p>Adres e-mail jest potrzebny, aby w przyszłości odzyskać hasło.</p>';
		var button = [ {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: 'Zarejestruj',
			click: function(){
				if(services.doRegisterNick()){
					$(this).dialog('close');
				}
			}
		} ];
		$$.displayDialog('services', 'nickserv', 'Rejestracja nicka '+guser.nick, html, button);
	},
	'doRegisterNick': function() {
		var password = $('#nickRegisterPass').val();
		var email = $('#nickRegisterMail').val();
		if(password == ''){
			$$.alert('Nie wpisano hasła!');
			return false;
		}
		if(password.indexOf(' ') > -1){
			$$.alert('Hasło nie może zawierać spacji!');
			return false;
		}
		if(password != $('#nickRegisterPassConf').val()){
			$$.alert('Podane hasła nie są zgodne!');
			return false;
		}
		if(email == ''){
			$$.alert('Nie wpisano adresu e-mail!');
			return false;
		}
		if(email.indexOf(' ') > -1 || email.indexOf('@') < 0 || email.indexOf('.') < 0){
			$$.alert('Podany e-mail jest błędny!');
			return false;
		}
		var timeDiff = 120 - Math.round(((+new Date)/1000) - gateway.connectTime);
		if(timeDiff > 0){
			$$.alert('Musisz zaczekać jeszcze '+timeDiff+' sekund(y), zanim będzie możliwa rejestracja nicka.');
			return false;
		}
		gateway.send('NS REGISTER '+password+' '+email);
		gateway.send('NS SET KILL QUICK');
		return true;
	},
	'setCloak': function(){
		var html = '<p>To polecenie ustawi vHosta o treści <b>cloak:'+guser.nick+'</b>. Jeśli masz już vHosta, zostanie on usunięty.</p>';
		var button = [ {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: 'Wykonaj',
			click: function(){
				gateway.send('HS CLOAK');
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('services', 'hostserv', 'Ustawianie automatycznego vhosta', html, button);
	},
	'setVhost': function(){
		var html = '<p>To polecenie wyśle prośbę do administratorów o ustawienie Tobie podanego vhosta.</p>'+
			'<p>Nowy vHost: <input type="text" id="newVhost"></p>'+
			'<p>vHost może zawierać tylko litery i cyfry, i musi mieć w środku co najmniej jedną kropkę.</p>';
		var button = [ {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: 'Wykonaj',
			click: function(){
				gateway.send('HS REQUEST '+$('#newVhost').val());
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('services', 'hostserv', 'Ustawianie automatycznego vhosta', html, button);
	}
};

