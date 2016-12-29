guser.changeNick = function(newnick, silent) {
	guser.nick = newnick;
	$('#usernick').text(he(guser.nick));
	$(document).attr('title', he(guser.nick)+ ' @ PIRC.pl');
	if(!silent) {
		for (i in gateway.channels) {
			gateway.channels[i].appendMessage(messagePatterns.nickChangeOwn, [gateway.niceTime(), he(guser.nick)]);
		}
	}
	return true;
}

var irc = {
	'messagedata': function() {
		this.text = '';
		this.args = [];
		this.command = '';
		this.sender = {
			'nick': '',
			'ident': '',
			'host': '',
			'server': false,
			'user': false
		};
	},
	'oldData': '',
	'parseMessage': function(msg){
		var packets = [];
		var packetcnt = 0;
		var msglen = msg.length;
		var line = irc.oldData;
		irc.oldData = '';
		for(var i = 0; i < msglen; i++){
			var c = msg.charAt(i);
			if(c == '\r' || c == '\n'){
				if(line == ''){
					continue;
				}
				var ircmsg = irc.parseLine(line);
				if(ircmsg){
					packets[packetcnt] = ircmsg;
					packetcnt++;
				}
				line = '';
			} else {
				line += c;
			}
		}
		if(line.length > 0){
			irc.oldData = line;
		}
		return {'status': 2, 'packets': packets };
	},
	'parseLine': function(line){
		var ircmsg = new irc.messagedata();

		var line = line.trim();
		line.replace(/^\s+|\s+$/gm,'');
		
		if(line == ''){
			return;
		}
		
		var msglen = line.length;
	
		var pstate = stateStart;
		var currArg = '';

		for(var i = 0; i < msglen; i++){
			var cchar = line.charAt(i);
			switch(pstate){
				case stateStart:
					switch(cchar){
						case ':': pstate = stateSenderNick; break;
						default:
							pstate = stateCommand; 
							ircmsg.command += cchar;
							break;
					}
					break;
				case stateSenderNick:
					switch(cchar){
						case '!': pstate = stateSenderUser; break;
						case '@': pstate = stateSenderHost; break;
						case ' ': pstate = stateCommand; break;
						default: ircmsg.sender.nick += cchar; break;
					}
					break;
				case stateSenderUser:
					switch(cchar){
						case '@': pstate = stateSenderHost; break;
						case ' ': pstate = stateCommand; break;
						default: ircmsg.sender.ident += cchar; break;
					}
					break;
				case stateSenderHost:
					switch(cchar){
						case ' ': pstate = stateCommand; break;
						default: ircmsg.sender.host += cchar; break;
					}
					break;
				case stateCommand:
					switch(cchar){
						case ' ': pstate = stateArgs; break;
						default: ircmsg.command += cchar; break;
					}
					break;
				case stateArgs:
					switch(cchar){
						case ' ':
							if(currArg != ''){
								ircmsg.args.push(currArg);
							}
							currArg = '';
							break;
						case ':':
							if(prevChar == ' '){
								pstate = stateMessage;
							} else {
								currArg += cchar;
							}
							break;
						default: currArg += cchar; break;
					}
					break;
				case stateMessage:
					ircmsg.text += cchar;
					break;
			}
			var prevChar = cchar;
		}
		if(pstate == stateArgs){
			ircmsg.args.push(currArg);
		}
	
		if(ircmsg.sender.ident == '' && ircmsg.sender.host == '' && ircmsg.sender.nick.indexOf('.')!=-1){
			ircmsg.sender.server = true;
		} else {
			ircmsg.sender.user = true;
		}
	
	//	console.log(line);
		console.log(ircmsg);
	
	/*	packets[packetcnt] = ircmsg;
		packetcnt++;*/

//		return {'status': 2, 'packets': packets };
		return ircmsg;
	}
};

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
		if (msg.text.match(/^Nieprawid.owe has.o\.$/i)) { // złe hasło nickserv
			services.showTimeToChange = true;
			services.nickStore = guser.nickservnick;
			var html = 'Podane hasło do nicka <b>'+guser.nickservnick+'</b> jest błędne. Możesz spróbować ponownie lub zmienić nicka.<br>'+services.badNickString;
			$$.displayDialog('error', 'nickserv', 'Błąd', html);
			return true;
		}
		if(msg.text.match(/^Ten nick jest zarejestrowany i chroniony\.( Jeśli należy do Ciebie,)?$/i)){
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
			var expr = /^Jeśli go nie zmienisz w ciągu (.*) sekund\(y\), zostanie zmieniony siłą\.$/i;
			match = expr.exec(msg.text);
		}
		if(match){
			if(services.showTimeToChange){
				var html = '<br>Masz <span id="nickserv_timer"></span> na zmianę nicka, potem zostanie zmieniony siłą. Bez obaw: gdy wpiszesz poprawne hasło, to odzyskasz swojego nicka.';
				$$.displayDialog('error', 'nickserv', 'Błąd', html);
				var countStart = false;
				if(match[1] == 'jedną minutę' || match[1] == '60'){
					$('#nickserv_timer').text('60 sekund');
					services.badNickCounter = 59;
					var countStart = true;
				} else if(match[1] == '20 sekund' || match[1] == '20') {
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
			alert('Nie podałeś hasła!');
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
			alert('Nie podałeś nicka!');
			return false;
		}
		gateway.send('NICK '+$('#nnick').val());
		$(".errorwindow").fadeOut(250);
		return true;
	},
	'nickInfo': function(nick){
		var nscommand = 'INFO '+nick+' ALL';
		var query = gateway.findQuery('nickserv');
		if(!query) {
			query = new Query('NickServ');
			gateway.queries.push(query);
		}
		gateway.switchTab('nickserv');
		query.appendMessage(messagePatterns.yourMsg, [gateway.niceTime(), guser.nick, nscommand]);
		gateway.send('PRIVMSG NickServ :'+nscommand);
	}
};

var gateway = {
	'websock': 0,
	'whois': '',
	'connectStatus': statusDisconnected,
	'joined': 0,
	'setConnectedWhenIdentified': 0,
	'connectTimeoutID': 0,
	'pingIntervalID': false,
	'whoChannelsIntervalID': false,
	'disconnectMessageShown': 0,
	'displayOwnWhois': false,
	'firstConnect': 1, //jeśli dostanę ERROR gdy to jest nadal 1 = błąd z poprzedniej sesji, od razu łączę ponownie
	'allowNewSend' : true,
	'statusWindow': new Status(),
	'userQuit': false,
	'chanPassword': function(chan) {
		if($('#chpass').val() == ''){
			alert('Nie podałeś hasła!');
			return false;
		}
		gateway.send('JOIN '+chan+' '+$('#chpass').val());
		$(".errorwindow").fadeOut(250);
		return true;
	},
	'reconnect': function() { //wywoływana po kliknięciu 'połącz ponownie'
		gateway.websock.onerror = undefined;
		gateway.websock.onclose = undefined;
		gateway.websock.close();
		gateway.websock = false;
		setTimeout(function(){
			gateway.connectStatus = statusDisconnected;
			$$.closeDialog('connect', 'reconnect');
			$$.displayDialog('connect', '1', 'Łączenie', 'Ponowne łączenie, czekaj...');
			gateway.connect(true);
		}, 500);
	},
	'iKnowIAmConnected': function() { //użytkownik może już pisać na kanale
		if(!gateway.pingIntervalID){
			gateway.pingIntervalID = setInterval(function(){
				gateway.ping();
			}, 20000);
		}
		/*if(!gateway.whoChannelsIntervalID){
			gateway.whoChannelsIntervalID = setInterval(function(){
				gateway.channels.forEach(function(channel){
					gateway.send('WHO '+channel.name);
				});
			}, 10000);
		}*/
	/*	if(gateway.connectStatus == statusIdentified){
			gateway.connectStatus = statusConnected;
			if(guser.nickservnick != '' && guser.nick != guser.nickservnick) { //ostatnia próba zmiany nicka na właściwy
				gateway.send('NICK '+guser.nickservnick);
			}
		} else {*/
			gateway.setConnectedWhenIdentified = 1;
		//}
	//	$('#not_connected_wrapper').fadeOut(400); //schować szare tło!
		$$.closeDialog('connect', '1');
		clearTimeout(gateway.connectTimeoutID); //już ok więc nie czekam na nieudane połączenie
		connectTimeoutID = false;
		gateway.firstConnect = 0;
		if (gateway.getActive() && gateway.findChannel(gateway.active)) {
			$('#'+gateway.findChannel(gateway.active).id+'-nicklist').show(); //gwarantuje pokazanie listy nicków na bieżącym kanale po ponownym połączeniu
		}
	},
	'pingcnt': 0,
	'disconnected': function(text) { //informacja w okienkach i ich blokowanie przy rozłączeniu
		clearTimeout(gateway.connectTimeoutID);
		gateway.websock.onerror = undefined;
		gateway.websock.onclose = undefined;
		gateway.connectTimeoutID = false;
		clearInterval(gateway.pingIntervalID);
		gateway.pingIntervalID = false;
		if(guser.nickservnick != ''){
			guser.nick = guser.nickservnick;
		}
		if(gateway.disconnectMessageShown) {
			return;
		}
		gateway.disconnectMessageShown = 1;
		for(c in gateway.channels) {
			gateway.channels[c].part();
			gateway.channels[c].appendMessage(messagePatterns.error, [gateway.niceTime(), text]);
		}
		gateway.statusWindow.appendMessage(messagePatterns.error, [gateway.niceTime(), text]);
	},
	'ping': function() { //pytanie IRCD o ping i błąd kiedy brak odpowiedzi
		if(gateway.connectStatus != statusConnected) {
			gateway.pingcnt = 0;
			return;
		}
		gateway.forceSend('PING :JavaScript');
		if(gateway.pingcnt > 3) {
			gateway.connectStatus = statusError;
			if($('#autoReconnect').is(':checked')){
				gateway.reconnect();
			} else {
				$$.displayReconnect();
			}
			gateway.disconnected('Przekroczony czas odpowiedzi serwera');
			gateway.pingcnt = 0;
		} else {
			gateway.pingcnt++;
		}
	},
	'configureConnection': function(){
		gateway.websock.onmessage = gateway.onRecv;
		gateway.websock.onerror = gateway.sockError;
		gateway.websock.onclose = gateway.sockError;
		if(gateway.delayedSendTimer){
			clearInterval(gateway.delayedSendTimer);
			gateway.delayedSendTimer = false;
		}
		gateway.delayedSendTimer = setInterval(function(){
			if(gateway.toSend.length > 0){
				gateway.forceSend(gateway.toSend.shift());
			} else {
				if(gateway.sendDelayCnt > 0){
					gateway.sendDelayCnt--;	
				}
			}
		}, 1000);
	},
	'connect': function(force) {
		gateway.userQuit = false;
		gateway.connectTimeoutID = setTimeout(gateway.connectTimeout, 20000);
		if(!gateway.websock || gateway.websock.readyState == WebSocket.CLOSING || gateway.websock.readyState == WebSocket.CLOSED){
			gateway.websock = new WebSocket(server);
			gateway.websock.onmessage = function(e){
				var regexp = /^SYNC ([^ ]+)$/i
				var rmatch = regexp.exec(e.data);
				if(rmatch[1]){
					if(rmatch[1] == '1'){
						gateway.recoverConnection();
					} else {
						gateway.connect(true);
					}
				}

			};
			gateway.websock.onopen = function(){
				gateway.forceSend('SYNC '+sessionid);
			};
			
		} else {
			if(guser.nickservpass != '' && guser.nickservnick != ''){
				gateway.websock.onmessage = function(e){
					var regexp = /^SYNC ([^ ]+)$/i
					var rmatch = regexp.exec(e.data);
					if(rmatch[1]){
						if(rmatch[1] == '1'){
							gateway.recoverConnection();
						} else {
							gateway.configureConnection();
							gateway.forceSend('NEW '+sessionid+' ' + guser.nick + ' ' + md5(guser.nickservpass));
						}
					}
				};
				gateway.forceSend('FIND '+ guser.nickservnick + ' ' + md5(guser.nickservpass) + ' '+ sessionid);
			} else {
				gateway.configureConnection();
				gateway.forceSend('NEW '+sessionid+' ' + guser.nick + ' x');
			}
		}
	},
	'recoverConnection': function() {
		$('#not_connected_wrapper').fadeOut(400);
		if(gateway.connectTimeoutID){
			clearTimeout(gateway.connectTimeoutID);
		}
		gateway.connectTimeoutID = setTimeout(gateway.connectTimeout, 20000);
		// już jest połączenie
		gateway.configureConnection();
		gateway.statusWindow.appendMessage(messagePatterns.existingConnection, [gateway.niceTime()]);
		$$.displayDialog('error', 'error', 'Ostrzeżenie', 'UWAGA: jeśli posiadasz już otwartą bramkę, zamknij ją, aby uniknąć problemów!');
		gateway.send('PRIVMSG');
			
		if(guser.nick == localStorage.getItem('nick') && localStorage.getItem('password')){
			guser.nickservnick = guser.nick;
			guser.nickservpass = atob(localStorage.getItem('password'));
		}
			
		setTimeout(function(){
			if(reqChannel && reqChannel.match(/^#[^ ]/)){
				gateway.send('JOIN '+reqChannel);
			}
			if(guser.channels[0] && guser.channels[0] != reqChannel && guser.channels[0].match(/^#[^ ]/)){
				gateway.send('JOIN '+guser.channels[0]);
			}
		}, 500);
	},
	'processData': function(data) {
		for (i in data.packets) { //wywoływanie funkcji 'handlerów' od poleceń
			if(data.packets[i].command in cmdBinds) {
				for(func in cmdBinds[data.packets[i].command]) {
					if(typeof data.packets[i] === undefined || data.packets[i] == undefined){
						console.log('Undefined packet!');
						continue;
					}
					if(typeof data.packets[i].command === undefined){
						console.log('Undefined command!');
						continue;
					}
					if(data.packets[i].command && cmdBinds[data.packets[i].command] && typeof(cmdBinds[data.packets[i].command][func]) == 'function') {
						cmdBinds[data.packets[i].command][func](data.packets[i]);
					} else {
						console.log(data.packets[i]);
					}
				}
			}
		}
	},
	'sockError': function(e) {
		if(gateway.connectStatus != statusDisconnected && gateway.connectStatus != statusError){
			gateway.connectStatus = statusError;
			gateway.disconnected('Błąd serwera bramki');
			if($('#autoReconnect').is(':checked')){
				gateway.reconnect();
			} else {
				$$.displayReconnect();
			}
		}
	},
	'onRecv': function(sdata) {
		data = irc.parseMessage(Base64.decode(sdata.data));
		gateway.processData(data);
		gateway.processStatus();
	},
	'ctcp': function(dest, text) {
		gateway.send('PRIVMSG '+dest+' :\001'+text+'\001');
	},
	'processStatus': function() {
		if(guser.nickservpass != '' && guser.nickservnick != ''){
			if(gateway.connectStatus == status001) {
				if(guser.nick != guser.nickservnick) { //auto-ghost
					gateway.connectStatus = statusGhostSent;
					gateway.send("PRIVMSG NickServ :RECOVER "+guser.nickservnick+" "+guser.nickservpass);
				} else {
					gateway.send("PRIVMSG NickServ :IDENTIFY "+guser.nickservpass);
					gateway.connectStatus = statusIdentified;
				}
			}
			if(gateway.connectStatus == statusGhostAndNickSent && guser.nick == guser.nickservnick){ //ghost się udał
				gateway.send("PRIVMSG NickServ :IDENTIFY "+guser.nickservpass);
				if(gateway.nickWasInUse){
					var html = '<br>I już nie jest: usunąłem go używając twojego hasła :)';
					$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html);
					gateway.nickWasInUse = false;
				}
				gateway.connectStatus = statusIdentified;
			}
		} else {
			if(gateway.connectStatus == status001) { //nie ma hasła więc od razu uznajemy że ok
				gateway.connectStatus = statusIdentified;
			}
		}
		if(gateway.connectStatus == statusIdentified && gateway.setConnectedWhenIdentified == 1){ //podłączony, a szare tło schowane już wcześniej
			gateway.connectStatus = statusConnected;
		}
		if(gateway.connectStatus == statusConnected){
			gateway.setConnectedWhenIdentified = 0;
			if(!gateway.joined) {
				$('#input').focus();
			//	gateway.joinChannels();
				gateway.joined = 1;
				gateway.disconnectMessageShown = 0; //tutaj resetuję
			}
		} else {
			gateway.joined = 0;
		}
	},
	'joinChannels': function() {
		var joinstr = guser.channels[0]?('JOIN '+guser.channels[0]+'\r\n'):'';
		for(c in gateway.channels) {
			joinstr += "JOIN "+gateway.channels[c].name+"\r\n";
		}
		gateway.send(joinstr);
	},
	'connectTimeout': function() {
		gateway.connectTimeoutID = false;
		if(gateway.userQuit){
			return;
		}
		if(gateway.connectStatus != statusConnected){
			var button = [ {
				text: 'Połącz ponownie',
				click: function(){
					gateway.stopAndReconnect();
				}
			} ];
			$$.closeDialog('connect', '1');
			$$.displayDialog('connect', 'reconnect', 'Łączenie', '<p>Łączenie trwa zbyt długo. Możesz poczekać lub spróbować jeszcze raz.</p>', button);
		}
	},
	'stopAndReconnect': function () {
		gateway.disconnected('Zbyt długi czas łączenia');
		gateway.send('QUIT :Błąd bramki >> łączenie trwało zbyt długo');
		gateway.connectStatus = statusDisconnected;
		setTimeout('gateway.reconnect()', 500);
	},
	'initSys': function() {
		var html = 'Poczekaj, trwa łączenie...<br />Nie używaj teraz przycisku "Wstecz" ani "Odśwież".';
		$$.displayDialog('connect', '1', 'Łączenie', html);
	},
	'initialize': function() {
		var nickInput = $('#nsnick').val();
		var chanInput = $('#nschan').val();
		var passInput = $('#nspass').val();
		if(!nickInput.match(/^[\^\|0-9a-z_`\[\]\-]+$/i)) {
			alert('Nick zawiera niedozwolone znaki!');
			return false;
		}
		if(!chanInput.match(/^[#,a-z0-9_\.\-]+$/i)) {
			alert('Kanał zawiera niedozwolone znaki!');
			return false;
		}
		if(passInput.match(/[ ]+/i)) {
			alert('Hasło nie powinno zawierać spacji!');
			return false;
		}
		if(nickInput != guser.nick) {
			guser.changeNick(nickInput);
		}
		guser.channels = [ chanInput ];
		if(passInput != '') {
			guser.nickservnick = nickInput;
			guser.nickservpass = $('#nspass').val();
		}
		if(chanInput){
			localStorage.setItem('channel', chanInput);
		}
		if(nickInput){
			localStorage.setItem('nick', nickInput);
		}
		if($('#save_password').is(":checked")){
			if(guser.nickservnick && guser.nickservpass){
				localStorage.setItem('password', btoa(guser.nickservpass));
			}
		}
		gateway.initSys();
		gateway.connect(false);

		return false;
	},
	'delayedSendTimer': false,
	'toSend': [],
	'sendDelayCnt': 0,
	'sendDelayed': function(data){
		gateway.toSend.push(data);
	},
	'send': function(data) {
		if(gateway.sendDelayCnt < 3){
			gateway.forceSend(data);
			gateway.sendDelayCnt++;
		} else {
			gateway.toSend.push(data);
		}
	},
	'forceSend': function(data){
		console.log('← '+data);
		sdata = Base64.encode(data+'\r\n');
		gateway.websock.send(sdata);
	},
	'niceTime': function() {
		dateobj = new Date();
		hours = dateobj.getHours();
		if(hours < 10) {
			hours = '0'+hours;
		}
		minutes = dateobj.getMinutes();
		if(minutes < 10) {
			minutes = '0'+minutes;
		}
		return hours+':'+minutes;
	},
	'channels': [],
	'findChannel': function(name) {
		if(typeof(name) != 'string') return false;
		for (i in gateway.channels) {
			if(gateway.channels[i] && gateway.channels[i].name.toLowerCase() == name.toLowerCase()) {
				return gateway.channels[i];
			}
		}
		return false;
	},
	'removeChannel': function(name) {
		if(typeof(name) != 'string') return false;
		var channels2 = [];
		for (i in gateway.channels) {
			if(gateway.channels[i] && gateway.channels[i].name.toLowerCase() == name.toLowerCase()) {
				gateway.findChannel(name).markRead();
				gateway.channels[i].close();
			} else if(gateway.channels[i]) {
				channels2.push(gateway.channels[i]);
			}
		}
		gateway.channels = channels2;
		$('#input').focus();
		return false;
	},
	'queries': [],
	'findQuery': function(name) {
		if(typeof(name) != 'string') return false;
		for (i in gateway.queries) {
			if(gateway.queries[i] && gateway.queries[i].name.toLowerCase() == name.toLowerCase()) {
				return gateway.queries[i];
			}
		}
		return false;
	},
	'removeQuery': function(name) {
		if(typeof(name) != 'string') return false;
		var queries2 = [];
		for (i in gateway.queries) {
			if(gateway.queries[i] && gateway.queries[i].name.toLowerCase() == name.toLowerCase()) {
				gateway.findQuery(name).markRead();
				gateway.queries[i].close();
			} else if(gateway.queries[i]) {
				queries2.push(gateway.queries[i]);
			}
		}
		gateway.queries = queries2;
		$('#input').focus();
		return false;
	},
	'changeTopic': function(channel) {
		if(!confirm('Czy zmienić temat dla '+channel+'? Nie można tego cofnąć.')){
			return;
		}
		var newTopic = $('#topicEdit').val().replace(/\n/g, ' ');
		gateway.send('TOPIC '+channel+' :'+$$.tagsToColors(newTopic));
		gateway.closeNotify();
	},
	'tabHistory': ['--status'],
	'lasterror': '',
	'nickListVisibility': true,
	'nickListToggle': function() {
		var active = gateway.getActive();
		if(!active){
			active = gateway.statusWindow;
		}
		active.saveScroll();
		if($("#nicklist").width() > 40) {
			$("#nicklist").animate({
				"opacity": "toggle",
				"width":	"40px"
			}, 400);
			$("#chatbox").animate({
				"width":	"97%"
			}, 401, function () {
				$("#nicklist-closed").fadeIn(200);
				setTimeout(function(){
					gateway.getActive().restoreScroll();
				}, 250);
			});
			gateway.nickListVisibility = false;
		} else {
			gateway.showNickList();
			gateway.nickListVisibility = true;
		}
		gateway.checkNickListVisibility();
		$('#input').focus();
	},
	'checkNickListVisibility': function() {
		setTimeout(function(){
			if(!$('#nicklist-closed').is(':visible') && !$('#nicklist').is(':visible')){
				gateway.showNickList();
			}
		}, 1500);
	},
	'showNickList': function() {
		$("#nicklist-closed").fadeOut(200, function () {
			$("#nicklist").animate({
				"opacity": "toggle",
				"width":	"23%"
			}, 400);
			$("#chatbox").animate({
				"width":	"77%"
			}, 401);
			setTimeout(function(){
				var tab = gateway.getActive();
				if(!tab){
					tab = gateway.statusWindow;
				}
				tab.restoreScroll();
			}, 450);
		});
	},
	'insert': function(text) {
		var input = $('#input');
		var oldText = input.val();
		input.focus();
		input.val(oldText + text);
	}, 
	'insertColor': function(color) {
		gateway.insert('[!color]' + (color<10?'0':'') + color.toString());
	},
	'insertCode': function(code) {
		var text = false;
		switch(code){
			case 2: text = '[!bold]'; break;
			case 3: text = '[!color]'; break;
			case 15: text = '[!reset]'; break;
			case 22: text = '[!invert]'; break;
			case 29: text = '[!italic]'; break;
			case 31: text = '[!uline]'; break;
		}
		if(text) gateway.insert(text);
	},
	'nextTab': function() {
		var swtab = $('li.activeWindow').next().find('a.switchTab');
		if(swtab){
			swtab.trigger('click');
		}
	},
	'prevTab': function() {
		var swtab = $('li.activeWindow').prev().find('a.switchTab');
		if(swtab){
			swtab.trigger('click');
		}
	},
	'switchTab': function(chan) {
		var act = gateway.getActive();
		if(act){
			act.saveScroll();
		} else {
			gateway.statusWindow.saveScroll();
		}
		chan = chan.toLowerCase();
		if(chan != "--status" && gateway.findChannel(chan)) {
			$('#main-window > span').hide();
			$('#nicklist-main > span').hide();
			$('#topic > span').hide();
			$('#'+gateway.findChannel(chan).id+'-nicklist').show();
			$('#tabs > li').removeClass("activeWindow");
			$('#'+gateway.findChannel(chan).id+'-tab').addClass("activeWindow");
			$('#'+gateway.findChannel(chan).id+'-window').show();
			$('#'+gateway.findChannel(chan).id+'-topic').show();
			$('#info h2').prop('title', 'Kliknij aby zobaczyć cały temat');
			gateway.findChannel(chan).markRead();
			gateway.active = chan;
			gateway.tabHistory.push(chan);
			$('#input').focus();
			if($("#nicklist").width() < 41 && gateway.nickListVisibility) {
				$("#nicklist-closed").fadeOut(1, function () {
					$("#nicklist").animate({
						"opacity": "toggle",
						"width":	"23%"
					}, 1);
					$("#chatbox").animate({
						"width":	"77%"
					}, 1, function() {
						gateway.findChannel(chan).restoreScroll();
						setTimeout(function(){
							gateway.findChannel(chan).restoreScroll();
						}, 200);
					});
				});
			} else {
				gateway.findChannel(chan).restoreScroll();
				setTimeout(function(){
					gateway.findChannel(chan).restoreScroll();
				}, 200);
			}
			
		} else if(chan != "--status" && gateway.findQuery(chan)) {
			$('#main-window > span').hide();
			$('#nicklist-main > span').hide();
			$('#topic > span').hide();
			$('#--status-nicklist').show();
			$('#tabs > li').removeClass("activeWindow");
			$('#'+gateway.findQuery(chan).id+'-tab').addClass("activeWindow");
			$('#'+gateway.findQuery(chan).id+'-window').show();
			$('#'+gateway.findQuery(chan).id+'-topic').show();
			$('#info h2').prop('title', '');
			gateway.active = chan;
			gateway.tabHistory.push(chan);
			$('#input').focus();
			if($("#nicklist").width() > 40) {
				$("#nicklist").animate({
					"opacity": "toggle",
					"width":	"40px"
				}, 1);
				$("#chatbox").animate({
					"width":	"97%"
				}, 1, function () {
					$("#nicklist-closed").fadeIn(1);
					gateway.findQuery(chan).restoreScroll();
					setTimeout(function(){
						gateway.findQuery(chan).restoreScroll();
					}, 200);
				});
			} else {
				gateway.findQuery(chan).restoreScroll();
				setTimeout(function(){
					gateway.findQuery(chan).restoreScroll();
				}, 200);
			}
			gateway.findQuery(chan).markRead();
		} else if(chan == "--status") {
			$('#main-window > span').hide();
			$('#nicklist-main > span').hide();
			$('#topic > span').hide();
			$('#--status-nicklist').show();
			$('#tabs > li').removeClass("activeWindow");
			$('#--status-tab').addClass("activeWindow");
			$('#--status-window').show();
			$('#--status-topic').show();
			$('#info h2').prop('title', '');
			gateway.statusWindow.markRead();
			gateway.active = chan;
			gateway.tabHistory.push(chan);
			$('#input').focus();
			if($("#nicklist").width() > 40) {
				$("#nicklist").animate({
					"opacity": "toggle",
					"width":	"40px"
				}, 1);
				$("#chatbox").animate({
					"width":	"97%"
				}, 1, function () {
					$("#nicklist-closed").fadeIn(1);
					gateway.statusWindow.restoreScroll();
					setTimeout(function(){
						gateway.statusWindow.restoreScroll();
					}, 200);
				});
			} else {
				gateway.statusWindow.restoreScroll();
				setTimeout(function(){
					gateway.statusWindow.restoreScroll();
				}, 200);
			}
		}
		gateway.checkNickListVisibility();
	},
	'tabHistoryLast': function(ignore) {
		var ignorec = ignore.toLowerCase();
		for(var i=gateway.tabHistory.length; i > 0; i--) {
			if(gateway.tabHistory[i] && ((gateway.findChannel(gateway.tabHistory[i]) || gateway.findChannel(gateway.tabHistory[i])) && (!ignorec || ignorec != gateway.tabHistory[i]))) {
				return gateway.tabHistory[i];
			}
		}
		return '--status';
	},
	'notEnoughParams': function(command, reason) {
		if(gateway.getActive()) {
			gateway.getActive().appendMessage(messagePatterns.notEnoughParams, [gateway.niceTime(), command, reason]);
		} else {
			gateway.statusWindow.appendMessage(messagePatterns.notEnoughParams, [gateway.niceTime(), command, reason]);
		}
	},
	'callCommand': function(command, input, alias) {
		if(alias && alias in commands) {
			if(typeof(commands[alias].callback) == 'string') {
				return gateway.callCommand(command, input, commands[alias].callback);
			} else if(typeof(commands[alias].callback) == 'function') {
				commands[alias].callback(command, input);
				return true;
			} else {
				return false;
			}
		} else if(command[0].toLowerCase() in commands) {
			if(typeof(commands[command[0].toLowerCase()].callback) == 'string') {
				return gateway.callCommand(command, input, commands[command[0].toLowerCase()].callback);
			} else if(typeof(commands[command[0].toLowerCase()].callback) == 'function') {
				commands[command[0].toLowerCase()].callback(command, input);
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	},
	'parseUserInput': function(input) {
		if(!input){
			input = '';
		}
		input = $$.tagsToColors(input);
		if (input) {
			if(gateway.connectStatus > 0) {
				if(input.charAt(0) == "/") {
					command = input.slice(1).split(" ");
					if(!gateway.callCommand(command, input)) {
						if (gateway.getActive()) {
							gateway.getActive().appendMessage(messagePatterns.noSuchCommand, [gateway.niceTime(), he(command[0])]);
						} else {
							gateway.statusWindow.appendMessage(messagePatterns.noSuchCommand, [gateway.niceTime(), he(command[0])]);
						}
					}
				} else {
					if(gateway.getActive()) {
						var textToSend = input;
						do {
							var sendNow = textToSend.substring(0, 420);
							textToSend = textToSend.substring(420);
							gateway.send("PRIVMSG " + gateway.getActive().name + " :" + sendNow);
							gateway.getActive().appendMessage(messagePatterns.yourMsg, [gateway.niceTime(), guser.nick, $$.colorize(sendNow)]);
						} while (textToSend != "");
						gateway.getActive().appendMessage('%s', [$$.parseImages(input)]);
					}
				}
			} else {
				if (gateway.getActive()) {
					gateway.getActive().appendMessage(messagePatterns.notConnected, [gateway.niceTime()]);
				} else {
					gateway.statusWindow.appendMessage(messagePatterns.notConnected, [gateway.niceTime()]);
				}
			}
			$("#input").val("");
		}
	},
	'performCommand': function(input){
		input = '/' + input;
		var command = input.slice(1).split(" ");
		if(!gateway.callCommand(command, input)) {
			console.log('Invalid performCommand: '+command[0]);
		}
	},
	'commandHistory': [],
	'commandHistoryPos': -1,
	'inputFocus': function() {
		if(window.getSelection().toString() == ''){
			$("#input").focus();
		}
	},
	'closeStatus': function() {
		$(".statuswindow").fadeOut(200, function () {
			$(".status-text").delay(300).text(" ");
			gateway.inputFocus();
		});
	},
	'showStatus': function(channel, nick) {
	  	var html = 
			"<p>Daj użytkownikowi "+he(nick)+" bieżące uprawnienia na kanale "+he(channel)+":</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" +q "+$$.sescape(nick)+"\"); gateway.closeStatus()'>FOUNDER (Właściciel kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" +a "+$$.sescape(nick)+"\"); gateway.closeStatus()'>PROTECT (Ochrona przed kopnięciem)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" +o "+$$.sescape(nick)+"\"); gateway.closeStatus()'>OP (Operator kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" +h "+$$.sescape(nick)+"\"); gateway.closeStatus()'>HALFOP (Pół-operator kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" +v "+$$.sescape(nick)+"\"); gateway.closeStatus()'>VOICE (Uprawnienie do głosu)</p>" +
			"<p>Daj użytkownikowi "+he(nick)+" uprawnienia w ChanServ (na stałe) na kanale "+he(channel)+"<br>(musisz posiadać odpowiedni dostęp do serwisów):</p>" +
			"<p class='statusbutton' onClick='gateway.performCommand(\"CS QOP "+channel+" ADD "+$$.sescape(nick)+"\"); gateway.closeStatus()'>QOP: FOUNDER (Właściciel kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.performCommand(\"CS SOP "+channel+" ADD "+$$.sescape(nick)+"\"); gateway.closeStatus()'>SOP: PROTECT (Ochrona przed kopnięciem)</p>" +
			"<p class='statusbutton' onClick='gateway.performCommand(\"CS AOP "+channel+" ADD "+$$.sescape(nick)+"\"); gateway.closeStatus()'>AOP: OP (Operator kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.performCommand(\"CS HOP "+channel+" ADD "+$$.sescape(nick)+"\"); gateway.closeStatus()'>HOP: HALFOP (Pół-operator kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.performCommand(\"CS VOP "+channel+" ADD "+$$.sescape(nick)+"\"); gateway.closeStatus()'>VOP: VOICE (Uprawnienie do głosu)</p>";
		$$.displayDialog('admin', channel, 'Zarządzanie '+he(channel), html);
	},
	'showStatusAnti': function(channel, nick) {
		var html =
			"<p>Odbierz użytkownikowi "+he(nick)+" uprawnienia na kanale "+he(channel)+":</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" -q "+$$.sescape(nick)+"\"); gateway.closeStatus()'>FOUNDER (Właściciel kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" -a "+$$.sescape(nick)+"\"); gateway.closeStatus()'>PROTECT (Ochrona przed kopnięciem)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" -o "+$$.sescape(nick)+"\"); gateway.closeStatus()'>OP (Operator kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" -h "+$$.sescape(nick)+"\"); gateway.closeStatus()'>HALFOP (Pół-operator kanału)</p>" +
			"<p class='statusbutton' onClick='gateway.send(\"MODE "+channel+" -v "+$$.sescape(nick)+"\"); gateway.closeStatus()'>VOICE (Uprawnienie do głosu)</p>";
		$$.displayDialog('admin', channel, 'Zarządzanie '+he(channel), html);
	},
	'showChannelModes': function(channel) {
		var channame = channel.substring(1);
		
		var html = "<p>Zmień tryby kanału "+he(channel)+":</p>" +
			"<table><tr><th></th><th>Litera</th><th>Opis</th></tr>";
		//generacja HTML z tabelą z wszystkimi trybami
		modes.changeableSingle.forEach(function(mode){
			html += '<tr><td><input type="checkbox" id="'+channame+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td></tr>';
		}, this);
		modes.changeableArg.forEach(function(mode){
			html += '<tr><td><input type="checkbox" id="'+channame+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td><td><input type="text" id="'+channame+'_mode_'+mode[0]+'_text"></td></tr>';
		}, this);
		html += '</table>';

		var button = [ {
			text: 'Zatwierdź',
			click: function(){
				gateway.changeChannelModes(channel);
				$(this).dialog('close');
			}
		} ];

		$$.displayDialog('admin', channel, 'Zarządzanie '+he(channel), html, button);
			
		var chanModes = gateway.findChannel(channel).modes;
		if(!chanModes){
			return;
		}
		//uzupełnianie tabeli trybami już ustawionymi
		modes.changeableSingle.forEach(function(mode){
			if(chanModes[mode[0]]){
				$('#'+channame+'_mode_'+mode[0]).prop('checked', true);
			}
		}, this);
		modes.changeableArg.forEach(function(mode){
			if(chanModes[mode[0]]){
				$('#'+channame+'_mode_'+mode[0]).prop('checked', true);
				$('#'+channame+'_mode_'+mode[0]+'_text').val(chanModes[mode[0]]);
			}
		}, this);
	},
	'changeChannelModes': function(channel) {
		var modesw = '';
		var modeop = '';
		var modearg = '';
		var chanModes = gateway.findChannel(channel).modes;
		var channame = channel.substring(1);
		
		modes.changeableSingle.forEach(function(mode){
			mode = mode[0];
			var set = chanModes[mode];
			var checked = $('#'+channame+'_mode_'+mode).prop('checked');
			if(set != checked){
				if(checked){
					if(modeop != '+'){
						modeop = '+';
						modesw += '+';
					}
					modesw += mode;
				} else {
					if(modeop != '-'){
						modeop = '-';
						modesw += '-';
					}
					modesw += mode;
				}
			}
		}, this);
		
		modes.changeableArg.forEach(function(mode){
			mode = mode[0];
			var set = chanModes[mode];
			var checked = $('#'+channame+'_mode_'+mode).prop('checked');
			var text = $('#'+channame+'_mode_'+mode+'_text').val();
			if(set != checked || (set && set != text)){
				if(checked){
					if(modeop != '+'){
						modeop = '+';
						modesw += '+';
					}
					modesw += mode;
					modearg += text + ' ';
				} else {
					if(modeop != '-'){
						modeop = '-';
						modesw += '-';
					}
					modesw += mode;
					if(mode == 'k'){
						modearg += text + ' ';
					}
				}
			}
		}, this);
		
		var modeStr = 'MODE '+channel+' '+modesw+' '+modearg;
		gateway.send(modeStr);
		setTimeout(function(){ gateway.showChannelModes(channel); }, 2000);
	},
	'showInvitePrompt': function(channel) {
		var html = "<h3>Zaproś użytkownika na "+he(channel)+"</h3>" +
			'<form action="javascript:gateway.performInvite(\''+channel+'\')"><p>Nick: <input id="inviteNick" type="text"> <input type="submit" value="Zaproś"></p></form>';
			$(".status-text").html(html);
		$(".statuswindow").fadeIn(200);
	},
	'performInvite': function(channel){
		var nick = $('#inviteNick').val();
		if(!nick || nick == ''){
			alert('Musisz podać nicka!');
			return;
		}
		gateway.send('INVITE '+nick+' '+channel);
		gateway.closeStatus();
	},
	'knocking': function(channel, nick, reason) {
		var html = '<b>'+nick+'</b> prosi o dostęp na <b>'+he(channel)+'</b> ('+$$.colorize(reason)+')';
		var button = [ {
			text: 'Zaproś',
			click: function(){
				gateway.send('INVITE '+nick+' '+channel);
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('knock', nick, 'Prośba o dostęp', html, button);
	},
	'showKick' : function(channel, nick) {
		var html = "<h3>KICK</h3>" +
			"<p>Wyrzuć użytkownika "+he(nick)+" z kanału "+he(channel)+". Możesz podać powód dla KICKa, który zostanie wyświetlony dla wszystkich użytkowników kanału.</p>" +
			"<input type='text' class='kickinput' maxlenght='307' />" +
			"<p class='statusbutton' onClick='if ($(\".kickinput\").val() != \"\") { gateway.send(\"KICK "+channel+" "+nick+" :\" + $(\".kickinput\").val()); } else { gateway.send(\"KICK "+channel+" "+nick+"\"); } gateway.closeStatus()'>Wyrzuć</p>";
		$(".status-text").html(html);
		$(".statuswindow").fadeIn(200);
	},
	'showBan' : function(channel, nick) {
		$(".status-text").text(" ");
		banData.clear();
		banData.nick = nick;
		banData.channel = channel;

		var nickListItem = gateway.findChannel(channel).nicklist.findNick(nick);
		var host = nickListItem.host;
		var ident = nickListItem.ident;
		var nline = '<td><input type="checkbox" onchange="gateway.banFormatView()" id="banNick" checked="checked"></td><td></td>';
		var html = '<h3>Ban</h3>' +
			"<p>Zablokuj dostęp dla "+he(nick)+" na kanale "+he(channel)+".</p>" +
			'<form action="javascript:void"><table>' +
				'<tr><td>' + nick + '</td><td>!</td>';
		if(ident.charAt(0) == '~'){
			html += '<td>~</td>';
			nline += '<td><input onchange="gateway.banFormatView()" type="checkbox" id="banNoIdent"></td>';
			ident = ident.substr(1);
			banData.noIdent = true;
		}
		banData.ident = ident;
		html += '<td>'+ident+'</td><td>@</td>'
		nline += '<td><input type="checkbox" onchange="gateway.banFormatView()" id="banIdentText" checked="checked"></td><td></td>';
		
		var i = 0;
		var cnt = 0;
		var hostElement = '';
		
		do {
			var c = host.charAt(i);
			switch(c){
				default: hostElement += c; break;
				case ':': case '.':
					html += '<td>'+hostElement+'</td><td>'+c+'</td>';
					nline += '<td><input type="checkbox" onchange="gateway.banFormatView()" id="banHostElement'+cnt+'"></td><td></td>';
					banData.hostElements.push(hostElement);
					banData.hostElementSeparators.push(c);
					hostElement = '';
					cnt++;
					break;
			}
			i++;
		} while(host.charAt(i));
		banData.hostElements.push(hostElement);
		html += '<td>'+hostElement+'</td>';
		nline += '<td><input type="checkbox" onchange="gateway.banFormatView()" id="banHostElement'+cnt+'" checked="checked"></td>';
		html += '</tr><tr>'+nline+'</tr></table></form>' +
			'<p>Postać bana: <span id="banFormat"></span></p>' + 
  //	  $(".status-text").append("<input type='text' class='kickinput' maxlenght='307' />");
			'<p class="statusbutton" onClick="gateway.banClick()">Banuj</p>';
		$(".status-text").html(html);
		if(cnt > 0){
			$('#banHostElement'+(cnt-1)).prop('checked', true);
		}
		$(".statuswindow").fadeIn(200);
		gateway.banFormatView();
	},
	'banClick': function() {
	},
	'banFormatView': function() {
		var banFormat = '';
		if($('#banNick').is(':checked')){
			banFormat += banData.nick;
		} else {
			banFormat += '*';
		}
		banFormat += '!';
		if(banData.noIdent){
			if($('#banNoIdent').is(':checked')){
				banFormat += '~';
			} else {
				banFormat += '*';
			}
		}
		if($('#banIdentText').is(':checked')){
			banFormat += banData.ident;
		} else {
			banFormat += '*';
		}
		banFormat += '@';
		var len = banData.hostElements.length;
		var hostElementAdded = false;
		for(var i=0;i<len;i++){
			if($('#banHostElement' + i).is(':checked')){
				if(!hostElementAdded){
					hostElementAdded = true;
					if(i > 0){
						banFormat += '*'+lastSeparator;
					}
				}
				banFormat += banData.hostElements[i];
				
			} else {
				if(hostElementAdded) {
					banFormat += '*';
				} else {
					var lastSeparator = banData.hostElementSeparators[i];
				}
			}
			if(hostElementAdded && i < len-1){
				banFormat += banData.hostElementSeparators[i];
			}
		}
		if(!hostElementAdded){
			banFormat += '*';
		}
		$('#banFormat').text(banFormat);
		return banFormat;
	},
	'getActive': function() {
		if(gateway.active == '--status') {
			return false;
		} else if(gateway.findChannel(gateway.active)) {
			return gateway.findChannel(gateway.active);
		} else if(gateway.findQuery(gateway.active)) {
			return gateway.findQuery(gateway.active);
		} else {
			return false;
		}
	},
	'active': '--status',
	'toggleNickOpt': function(nicklistid) {
		if($('#'+nicklistid+'-opt').is(':visible')) {
			if($('#'+nicklistid+'-opt-info').is(':visible')){
				 $('#'+nicklistid+'-opt-info').hide('blind', {
					direction: "vertical"
				}, 300);
				$('#'+nicklistid+'-opt').removeClass('activeInfo');
			 }
			$('#'+nicklistid+'-opt').hide('blind', {
				direction: "vertical"
			}, 300);
			$('#'+nicklistid).removeClass('activeNick');
		} else {
			$('#'+nicklistid+'-opt').show('blind', {
				direction: "vertical"
			}, 300);
			$('#'+nicklistid).addClass('activeNick');
		}
	},
	'toggleNickOptInfo': function(nicklistid) {
		if($('#'+nicklistid+'-opt-info').is(':visible')){
			 $('#'+nicklistid+'-opt-info').hide('blind', {
				direction: "vertical"
			}, 300);
			$('#'+nicklistid+'-opt').removeClass('activeInfo');
		} else {
			$('#'+nicklistid+'-opt-info').show('blind', {
				direction: "vertical"
			}, 300);
			$('#'+nicklistid+'-opt').addClass('activeInfo');
		}
	},
	'toggleNickOptAdmin': function(nicklistid) {
		if($('#'+nicklistid+'-opt-admin').is(':visible')){
			 $('#'+nicklistid+'-opt-admin').hide('blind', {
				direction: "vertical"
			}, 300);
			$('#'+nicklistid+'-opt').removeClass('activeAdmin');
		} else {
			$('#'+nicklistid+'-opt-admin').show('blind', {
				direction: "vertical"
			}, 300);
			$('#'+nicklistid+'-opt').addClass('activeAdmin');
		}
	},
	'toggleChannelOpts': function(channel) {
		var $element = $('#'+gateway.findChannel(channel).id+'-operActions ul');
		if($element.is(':visible')){
			$element.hide('blind', {
				direction: 'vertical'
			}, 300);
			$('#'+gateway.findChannel(channel).id+'-operActions').removeClass('channelAdminActive');
		} else {
			$element.show('blind', {
				direction: 'vertical'
			}, 300);
			$('#'+gateway.findChannel(channel).id+'-operActions').addClass('channelAdminActive');
		}
	},
	'showPermError': function(text) {
		var html = 'Brak uprawnień' +
			'<br>Nie masz wystarczających uprawnień aby wykonać żądaną akcję.<br>'+text;
		$$.displayDialog('error', 'error', 'Błąd', html);
	},
	'clickQuit': function() {
		var html = '<form id="quit-form" onsubmit="gateway.quit();" action="javascript:void(0);">'+
			'Wiadomość pożegnalna: <input type="text" id="quit-msg" value="Użytkownik rozłączył się" />';
			'</form>';
		var button = [ {
			text: 'Rozłącz',
			click: function(){
				$('#quit-form').submit();
				$(this).dialog('close');
			}
		}, {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('confirm', 'quit', 'Wyjście z IRC', html, button);
		$('#quit-msg').focus();
		$('#quit-msg').select();
	},
	'quit': function() {
		commands.quit.callback(['quit'], '/quit '+$('#quit-msg').val());
		$('.notifywindow').fadeOut(100);
	},
	'completion': {
		'string': '',
		'rawStr': '',
		'repeat': 0,
		'array': [],
		'lastPos': -1,
		'find': function(string, rawStr, comPos) {
			var complarr = [];
			var ccount = 0;
			//komendy
			//complarr[0] = string;
			//ccount++;
			if(string.length > 0 && string.indexOf('/') == 0 && comPos == 0) {
				for (i in commands) {
					if(i.indexOf(string.slice(1).toLowerCase()) == 0) {
						complarr[ccount] = '/'+i;
						ccount++;
					}
				}
			//else, bo jak sa komendy to nic innego nie trzeba uzup
			} else {
				if(string.indexOf('#') == 0) {
					for (var ichannel = 0; ichannel < gateway.channels.length; ichannel++) {
						if(gateway.channels[ichannel].name.toLowerCase().replace(/^[^a-z0-9]/ig).indexOf(string.toLowerCase().replace(/^[^a-z0-9]/ig)) == 0) {
							complarr[ccount] = gateway.channels[ichannel].name;
							ccount++;
						}
					}
				} else {
					if(gateway.findChannel(gateway.active)) {
						for (var inick=0; inick < gateway.findChannel(gateway.active).nicklist.list.length; inick++) {
							if(gateway.findChannel(gateway.active).nicklist.list[inick].nick.toLowerCase().replace(/^[^a-z0-9]/ig).indexOf(string.toLowerCase().replace(/^[^a-z0-9]/ig)) == 0) {
								complarr[ccount] = gateway.findChannel(gateway.active).nicklist.list[inick].nick;
								if(comPos == 0) {
									complarr[ccount] += ':';
								}
								ccount++;
							}
						}
					}
				}
			}
			return complarr;
		}
	},
	'doComplete': function() {
		if(gateway.completion.repeat == 0 || gateway.completion.array.length == 0) {
			var rawstr = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '');
			var str = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '').split(/\s+/);
			if(str && str.length > 0 && str[str.length-1].length > 0) {
				gateway.completion.array = gateway.completion.find(str[str.length-1], rawstr, str.length-1);
				if(gateway.completion.array.length > 0) {
					str[str.length-1] = gateway.completion.array[0] + " ";
					gateway.completion.repeat = 1;
					$('#input').val(str.join(" "));
					gateway.completion.lastPos = 0;
				}
				//gateway.statusWindow.appendMessage('%s - %s<br />', [ gateway.completion.lastPos, gateway.completion.array.toString() ]);
			}
		} else if(gateway.completion.array.length > 0) {
			var str = $('#input').val().replace(/^\s+/g, '').replace(/\s+$/g, '').split(/\s+/);
			if(gateway.completion.lastPos+1 < gateway.completion.array.length) {
				str[str.length-1] = gateway.completion.array[gateway.completion.lastPos+1] + " ";
				gateway.completion.lastPos++;
				$('#input').val(str.join(" "));
			} else {
				gateway.completion.lastPos = 0;
				str[str.length-1] = gateway.completion.array[0] + " ";
				$('#input').val(str.join(" "));
			}
		}
	},
	'parseChannelMode': function(args, chan) {
		var plus = true;
		var nextarg = 1;
		var modearr = args[0].split('');
		var log = '';
		var mode = '';
		var modechar = '';
		for (i in modearr) {
			if(modearr[i] == '+') {
				log += "Change +\n";
				plus = true;
			} else if(modearr[i] == '-') {
				log += "Change -\n";
				plus = false;
			} else if($.inArray(modearr[i], modes.argBoth) > -1) {
				log += "Mode 'both' "+plus+' '+modearr[i]+' '+args[nextarg]+"\n";
				nextarg++;
			} else if($.inArray(modearr[i], modes.argAdd) > -1 && plus == true) {
				log += "Mode 'add' "+plus+' '+modearr[i]+' '+args[nextarg]+"\n";
				chan.modes[modearr[i]] = args[nextarg];
				nextarg++;
			} else if($.inArray(modearr[i], modes.user) > -1) {
				modechar = modearr[i];
				log += "Mode 'user' "+plus+' '+modearr[i]+' '+args[nextarg]+"\n";
				if(plus) {
					if(chan.nicklist.findNick(args[nextarg])) {
						mode = '';
						switch (modechar) {
							case 'q':
								mode = 'owner'
								break;
							case 'a':
								mode = 'admin'
								break;
							case 'o':
								mode = 'op'
								break;
							case 'h':
								mode = 'halfop'
								break;
							case 'v':
								mode = 'voice'
								break;
							default:
								//i tak nie nastapi
								break;
						}
						chan.nicklist.findNick(args[nextarg]).setMode(mode, true);
					}
				} else {
					if(chan.nicklist.findNick(args[nextarg])) {
						mode = '';
						switch (modechar) {
							case 'q':
								mode = 'owner'
								break;
							case 'a':
								mode = 'admin'
								break;
							case 'o':
								mode = 'op'
								break;
							case 'h':
								mode = 'halfop'
								break;
							case 'v':
								mode = 'voice'
								break;
							default:
								//i tak nie nastapi
								break;
						}
						chan.nicklist.findNick(args[nextarg]).setMode(mode, false);
					}
				}
				nextarg++;
			} else {
				log += "Mode 'normal' "+plus+' '+modearr[i]+"\n";
				chan.modes[modearr[i]] = plus;
			}
		}
	//	console.log(log);
	}
}
	
var loaded = false;

var readyFunc = function(){
	if(loaded) return;
	$('.not-connected-text > h3').html('Ładowanie');
	$('.not-connected-text > p').html('Poczekaj chwilę, trwa ładowanie...');
	loaded = true;
	if($.browser.msie && parseInt($.browser.version, 10) < 8) {
		$('.not-connected-text > h3').html('Przestarzała przeglądarka');
		$('.not-connected-text > p').html('Twoja przeglądarka jest przestarzała i nie jest obsługiwana. Należy zaktualizować przeglądarkę Internet Explorer do wersji 8 lub wyższej albo użyć innej przeglądarki (Firefox, Opera, Chrome, Safari) w którejś z nowszych wersji.<br />Jeżeli posiadasz przeglądarkę Internet Explorer 8 lub wyższej i widzisz ten komunikat wyłącz tzw "widok zgodności" dla tej strony.');
		gateway = 0;
		guser = 0;
		cmd_binds = 0;
		$('div#wrapper').html('');
	} else {
		conn.gatewayInit();
	}
};

$('document').ready(function(){setTimeout(readyFunc, 100);});

function onBlur() {
	disp.focused = false;
};
function onFocus(){
	clearInterval(disp.titleBlinkInterval);
	disp.titleBlinkInterval = false;
	if(document.title == newMessage) document.title = he(guser.nick)+' @ PIRC.pl';
	disp.focused = true;
	var act = gateway.getActive();
	if(act){
		act.markRead();
	}
};

if (/*@cc_on!@*/false) { // check for Internet Explorer
	document.onfocusin = onFocus;
	document.onfocusout = onBlur;
} else {
	window.onfocus = onFocus;
	window.onblur = onBlur;
}

function browserTooOld(){
	$('.not-connected-text > h3').html('Przestarzała przeglądarka');
	$('.not-connected-text > p').html('Twoja przeglądarka jest przestarzała i nie jest obsługiwana. Należy zainstalować aktualną wersję Internet Explorer, Mozilla Firefox, Chrome, Safari bądź innej wspieranej przeglądarki.');
	return;
}

var conn = {
	'my_nick': '',
	'my_pass': '',
	'connectTimeout': function(){
			$('.not-connected-text > p').html('Łączenie z serwerem trwa zbyt długo, serwer bramki nie działa lub twoja przeglądarka nie funkcjonuje prawidłowo.<br />Spróbuj ponownie później lub spróbuj '+oldGatewayHtml);
	},
	'dispConnectDialog': function(){
		reqChannel = guser.channels[0];
		conn.my_nick = dnick;

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
	
		gateway.websock = new WebSocket(server);
		if(gateway.connectTimeoutID){
			clearTimeout(gateway.connectTimeoutID);
		}
		gateway.connectTimeoutID = setTimeout(conn.connectTimeout, 20000);
		gateway.websock.onmessage = conn.processReply;
	/*	gateway.websock.onerror = function(e){
			$('.not-connected-text > p').html('');
		};
		gateway.websock.onclose = gateway.websock.onerror;*/
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
			} else {
				var nconn_html = '<h3>' + he(guser.channels[0]) + ' @ PIRC.pl</h3><form onsubmit="gateway.initialize();$$.closeDialog(\'connect\', \'0\')" action="javascript:void(0);"><table>';
				nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Kanał:</td><td><input type="text" id="nschan" value="'+he(reqChannel)+'" /></td></tr>';
				nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Nick:</td><td><input type="text" id="nsnick" value="'+conn.my_nick+'" /></td></tr>';
				nconn_html += '<tr><td style="text-align: right; padding-right: 10px;">Hasło (jeżeli zarejestrowany):</td><td><input type="password" id="nspass" value="'+conn.my_pass+'" /></td></tr>';
				nconn_html += '<tr><td></td><td style="text-align: left;"><input type="checkbox" id="save_password" /> Zapisz hasło</td></tr>';
				nconn_html += '</table><input type="submit" style="display:none"></form>';
				var button = [ {
					text: 'Połącz z IRC',
					click: function(){
						gateway.initialize();
						$(this).dialog('close');
					}
				} ];
				$$.displayDialog('connect', '0', 'Logowanie', nconn_html, button);
				$('#not_connected_wrapper').fadeOut(400); 
				if(conn.my_nick == ''){
					$('#nsnick').focus();
				} else {
					$('#nspass').focus();
				}
			}
		}
	},
	'gatewayInit': function(){
		try {
		// USUWANIE CIASTECZEK i przenoszenie do LocalStorage TODO skasować jak wszyscy już usuną
			var arrSplit = document.cookie.split(";");

			for(var i = 0; i < arrSplit.length; i++){
				var cookie = arrSplit[i].trim();
				var cookieData = cookie.split("=");
				var cookieName = cookieData[0];
				var cookieValue = cookieData[1];

				booleanSettings.forEach(function(name){
					if(cookieName == name){
						localStorage.setItem(cookieName, cookieValue);
						document.cookie = cookieName + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
					}
				});
				comboSettings.forEach(function(name){
					if(cookieName == name){
						localStorage.setItem(cookieName, cookieValue);
						document.cookie = cookieName + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
					}
				});
				numberSettings.forEach(function(name){
					if(cookieName == name){
						localStorage.setItem(cookieName, cookieValue);
						document.cookie = cookieName + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
					}
				});
				if(cookieName == 'origNick'){
					localStorage.setItem(cookieName, cookieValue);
					document.cookie = cookieName + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
				}
			}
		} catch(e) {
		}

		$('.not-connected-text p').html('Poczekaj chwilę, trwa ładowanie...');

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
	
	//	gateway.send("QUIT"); //k4be
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
				} else {
					gateway.clickQuit();
					return 'Jesteś nadal połączony z IRCem. Kliknij "Zostań na stronie" a następnie "Rozłącz" w okienku poniżej aby się rozłączyć przed wyjściem.';
				}
			}
		});
		
		if(!navigator.cookieEnabled){
			$('.not-connected-text > p').html('Twoja przeglądarka ma wyłączoną obsługę ciasteczek. Niektóre funkcje bramki mogą działać nieprawidłowo.<br /><input type="button" onclick="conn.dispConnectDialog();" value="Kontynuuj" />');
			return;
		} else {
			if(window.WebSocket == null){
				$('.not-connected-text > p').html('Twoja przeglądarka nie obsługuje WebSocket. Nie można uruchomić bramki.<br />Spróbuj '+oldGatewayHtml);
				return;
			}
			conn.dispConnectDialog();
		}
	}
}

