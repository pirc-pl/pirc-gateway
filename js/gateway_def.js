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

var irc = {
	'lastNick': '',
	'messagedata': function() {
		this.text = '';
		this.args = [];
		this.tags = [];
		this.command = '';
		this.sender = {
			'nick': '',
			'ident': '',
			'host': '',
			'server': false,
			'user': false
		};
		this.time = new Date();
		this.user = null;
		this.getLabel = function(){ // get originating label even if it's a batch or even a nested batch
			if('label' in this.tags)
				return this.tags.label;
			if('batch' in this.tags){
				var batch = gateway.batch[tags.batch];
				if(!batch)
					return null;
				if(batch.label)
					return batch.label;
				for(var i=0; i<batch.parents.length; i++){
					if(batch.parents[i].label)
						return batch.parents[i].label;
				}
				return null;			
			};
		};
	},
	'oldData': '',
	'parseMessage': function(msg){
		var packets = [];
		var packetcnt = 0;
		msg = msg.split(/\r?\n/);
		for(var i=0; i<msg.length; i++){
			packets[packetcnt++] = irc.parseLine(msg[i]);
		}
		return {'status': 2, 'packets': packets };
	},
	'parseTags': function(tagsLine){
		var tags = [];
		var tagState = 'keyName';
		var keyValue;
		var keyName = '';
		for(var i = 0; i < tagsLine.length; i++){
			var cchar = tagsLine.charAt(i);
			switch(tagState){
				case 'keyName':
					switch(cchar){
						case '=':
							tagState = 'keyValue';
							keyValue = '';
							break;
						case ';':
							tags[keyName] = '';
							keyName = ''; // staying in tagStateKeyName
							break;
						default: keyName += cchar; break;
					}
					break;
				case 'keyValue':
					switch(cchar){
						case '\\': tagState = 'keyValueEscape'; break;
						case ';':
							tags[keyName] = keyValue;
							keyName = '';
							tagState = 'keyName';
							break;
						default: keyValue += cchar; break;
					}
					break;
				case 'keyValueEscape':
					switch(cchar){
						case ':': keyValue += ';'; break;
						case 's': keyValue += ' '; break;
						case 'r': keyValue += '\r'; break;
						case 'n': keyValue += '\n'; break;
						default: keyValue += cchar; break;
					}
					tagState = 'keyValue';
					break;
			}
		}
		if(keyName.length > 0) tags[keyName] = keyValue; // flush last tag
		return tags;
	},
	'parseLine': function(line){
		var ircmsg = new irc.messagedata();

		var line = line.trim();
		line.replace(/^\s+|\s+$/gm,'');
		if(line == ''){
			return;
		}
		var msglen = line.length;
		var pstate = 'start';
		var currArg = '';
		var tags = '';
		var haveText = false;
		console.log(line);

		for(var i = 0; i < msglen; i++){
			var cchar = line.charAt(i);
			switch(pstate){
				case 'start':
					switch(cchar){
						case '@': pstate = 'tags'; break;
						case ':': pstate = 'senderNick'; break;
						default:
							pstate = 'command';
							ircmsg.command += cchar;
							break;
					}
					break;
				case 'tags':
					switch(cchar){
						case ' ':
							pstate = 'start';
							ircmsg.tags = irc.parseTags(tags);
							break;
						default: tags += cchar; break;
					}
					break;
				case 'senderNick':
					switch(cchar){
						case '!': pstate = 'senderUser'; break;
						case '@': pstate = 'senderHost'; break;
						case ' ': pstate = 'command'; break;
						default: ircmsg.sender.nick += cchar; break;
					}
					break;
				case 'senderUser':
					switch(cchar){
						case '@': pstate = 'senderHost'; break;
						case ' ': pstate = 'command'; break;
						default: ircmsg.sender.ident += cchar; break;
					}
					break;
				case 'senderHost':
					switch(cchar){
						case ' ': pstate = 'command'; break;
						default: ircmsg.sender.host += cchar; break;
					}
					break;
				case 'command':
					switch(cchar){
						case ' ': pstate = 'args'; break;
						default: ircmsg.command += cchar; break;
					}
					break;
				case 'args':
					switch(cchar){
						case ' ':
							if(currArg != ''){
								ircmsg.args.push(currArg);
							}
							currArg = '';
							break;
						case ':':
							if(prevChar == ' '){
								pstate = 'message';
								haveText = true;
							} else {
								currArg += cchar;
							}
							break;
						default: currArg += cchar; break;
					}
					break;
				case 'message':
					ircmsg.text += cchar;
					break;
			}
			var prevChar = cchar;
		}
		if(pstate == 'args'){
			ircmsg.args.push(currArg);
		}
		if(ircmsg.sender.ident == '' && ircmsg.sender.host == '' && ircmsg.sender.nick.indexOf('.')!=-1){
			ircmsg.sender.server = true;
		} else {
			ircmsg.sender.user = true;
		}

		if(!haveText){
			ircmsg.text = ircmsg.args[ircmsg.args.length-1]; // handling last argument as text if : is missing
		} else {
			ircmsg.args.push(ircmsg.text); // handling text as a last argument as required by the protocol
		}

		if(ircmsg.sender.nick.length > 0){
			var user = users.getUser(ircmsg.sender.nick);
			ircmsg.user = user;
		}

// add u@h
		if(ircmsg.sender.user){
			if(ircmsg.sender.ident.length > 0) user.setIdent(ircmsg.sender.ident);
			if(ircmsg.sender.host.length > 0) user.setHost(ircmsg.sender.host);
		}
		
		if(ircmsg.sender.server){
			user.server = true;
		}

		gateway.processIncomingTags(ircmsg);
		return ircmsg;
	}
};

var gateway = {
	'websock': 0,
	'whois': '',
	'connectStatus': 'disconnected',
	/* possible values are:
		disconnected
		001
		ghostSent
		identified
		connected
		reIdentify
		error
		banned
		wrongPassword
		ghostAndNickSent
	*/
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
	'sasl': false,
	'commandProcessing': false,
	'whowasExpect312': false,
	'lastKeypressWindow': false,
	'keypressSuppress': false,
	'retrySasl': false,
	'label': 0,
	'labelProcessed': false,
	'labelCallbacks': {},
	'labelInfo': {},
	'labelsToHide': [],
	'batch': {},
	'chanPassword': function(chan) {
		if($('#chpass').val() == ''){
			$$.alert(language.passwordNotGiven);
			return false;
		}
		ircCommand.channelJoin(chan, $('#chpass').val());
		$(".errorwindow").fadeOut(250);
		return true;
	},
	'reconnect': function() { //wywoływana po kliknięciu 'połącz ponownie'
		gateway.websock.onerror = undefined;
		gateway.websock.onclose = undefined;
		gateway.websock.close();
		gateway.websock = false;
		setTimeout(function(){
			gateway.connectStatus = 'disconnected';
			$$.closeDialog('connect', 'reconnect');
			$$.displayDialog('connect', '1', language.connecting, language.reconnectingWait);
			gateway.connect(true);
		}, 500);
	},
	'iKnowIAmConnected': function() { //użytkownik może już pisać na kanale
		if(!gateway.pingIntervalID){
			gateway.pingIntervalID = setInterval(function(){
				gateway.ping();
			}, 20000);
		}
		gateway.setConnectedWhenIdentified = 1;
		$$.closeDialog('connect', '1');
		$$.closeDialog('connect', 'reconnect');
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
		guser.clear();
		gateway.pingIntervalID = false;
		gateway.updateHistory();
		for(label in gateway.labelCallbacks){
			gateway.labelNotProcessed(label, null);
		}
		gateway.labelCallbacks = {};
		gateway.labelInfo = {};
		if(guser.nickservnick != ''){
			irc.lastNick = guser.nick;
			guser.nick = guser.nickservnick;
		}
		if(gateway.disconnectMessageShown) {
			return;
		}
		gateway.disconnectMessageShown = 1;
		for(c in gateway.channels) {
			gateway.channels[c].part();
			gateway.channels[c].appendMessage(language.messagePatterns.error, [$$.niceTime(), text]);
		}
		gateway.statusWindow.appendMessage(language.messagePatterns.error, [$$.niceTime(), text]);
	},
	'ping': function() { //pytanie IRCD o ping i błąd kiedy brak odpowiedzi
		if(gateway.connectStatus != 'connected') {
			gateway.pingcnt = 0;
			return;
		}
		gateway.forceSend('PING :JavaScript');
		if(gateway.pingcnt > 3) {
			gateway.connectStatus = 'error';
			if($('#autoReconnect').is(':checked')){
				gateway.reconnect();
			} else {
				$$.displayReconnect();
			}
			gateway.disconnected(language.pingTimeout);
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
		gateway.websock = new WebSocket(mainSettings.server);
		gateway.websock.onopen = function(e){
			gateway.configureConnection();
			var username = mainSettings.defaultName;
			try {
				var ckNick = localStorage.getItem('origNick');
			 	if(ckNick){
					username += ' "'+ckNick+'"';
				}
			} catch(e) {}
			ircCommand.performQuick('CAP', ['LS', '302']);
			ircCommand.performQuick('USER', ['pirc', '*', '*'], username);
			ircCommand.changeNick(guser.nick);
			guser.clear();
			gateway.connectTime = (+new Date)/1000;
		}

	},
	'processData': function(data) {
	//	while(gateway.commandProcessing); // potrzebne czy nie?
		gateway.commandProcessing = true;
		for (i in data.packets) { //wywoływanie funkcji 'handlerów' od poleceń
			gateway.labelProcessed = false;
			try {
				var msg = data.packets[i];
				console.log(msg);
				if('batch' in msg.tags && msg.tags.batch in gateway.batch){
					msg.batch = gateway.batch[msg.tags.batch];
				}
				var command = msg.command;
				if(command in cmdBinds) {
					if(cmdBinds[command].length == 0){ // implementation empty
						cmdNotImplemented(msg);
					} else {
						for(func in cmdBinds[command]) {
							cmdBinds[command][func](msg);
						}
					}
				} else { // not implemented
					cmdNotImplemented(msg);
				}
			} catch(error) {
				console.error('Error processing message!', msg, error);
			}
			if(('label' in msg.tags && !('isBatchStart' in msg)) || ('isBatchEnd' in msg)){
				var batch = null;
				if('label' in msg.tags){
					var label = msg.tags.label;
				} else {
					if(!msg.batch.label)
						continue;
					var label = msg.batch.getLabel();
					if(!label)
						continue;
					batch = msg.batch;
				}
				if(!gateway.labelProcessed){
					gateway.labelNotProcessed(label, msg, batch);
				}
				if(label in gateway.labelCallbacks){
					delete gateway.labelCallbacks[label]; // no longer needed
				}
				if(label in gateway.labelInfo){
					delete gateway.labelInfo[label];
				}
				var index = gateway.labelsToHide.indexOf(label);
				if(index >= 0){
					gateway.labelsToHide.splice(index, 1);
				}
			}
		}
		gateway.commandProcessing = false;
	},
	'sockError': function(e) {
		console.error('WebSocket error!');
		setTimeout(function(){
			if(gateway.connectStatus != 'disconnected' && gateway.connectStatus != 'error' && gateway.connectStatus != 'banned'){
				gateway.connectStatus = 'error';
				gateway.disconnected(language.lostNetworkConnection);
				if($('#autoReconnect').is(':checked')){
					gateway.reconnect();
				} else {
					$$.displayReconnect();
				}
			}
		}, 1000);
	},
	'onRecv': function(sdata) {
		//data = irc.parseMessage(Base64.decode(sdata.data));
		if(typeof sdata.data === 'string' || sdata.data instanceof String){
			var data = irc.parseMessage(sdata.data);
			gateway.processData(data);
			gateway.processStatus();
		} else {
			var reader = new FileReader();
			reader.addEventListener("loadend", function() {
			   // reader.result contains the contents of blob as a typed array
				var data = irc.parseMessage(reader.result);
				gateway.processData(data);
				gateway.processStatus();
			});
			reader.readAsText(sdata.data);
		}

//		data = irc.parseMessage(sdata.data);
//		gateway.processData(data);
//		gateway.processStatus();
	},
	'ctcp': function(dest, text) {
		ircCommand.sendCtcpRequest(dest, text);
		console.log('gateway.ctcp called, change to ircCommand.sendCtcpRequest');
	},
	'processStatus': function() {
		if(guser.nickservpass != '' && guser.nickservnick != ''){
			if(gateway.connectStatus == '001') {
				if(guser.nick != guser.nickservnick) { //auto-ghost
					gateway.connectStatus = 'ghostSent';
					ircCommand.NickServ('RECOVER', [guser.nickservnick, guser.nickservpass], true);
					gatewayStatus = 'ghostSent';
				} else gateway.connectStatus = 'identified';
			}
			if(gateway.connectStatus == 'reIdentify'){
				if(guser.nick != guser.nickservnick){
					gateway.connectStatus = 'ghostSent';
					ircCommand.NickServ('RECOVER', [guser.nickservnick, guser.nickservpass], true);
				} else {
					gateway.connectStatus = 'identified';
					if(!('sasl' in activeCaps)){
						ircCommand.NickServ('IDENTIFY', guser.nickservpass, true);
					} else {
						gateway.retrySasl = true;
						ircCommand.performQuick('AUTHENTICATE', ['PLAIN']);
						var date = new Date();
						gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(date), language.SASLLoginAttempt]);
					}
				}
			}
			if(gateway.connectStatus == 'ghostAndNickSent' && guser.nick == guser.nickservnick){ //ghost się udał
				if(gateway.nickWasInUse){
					var html = '<p>' + language.nickNoLongerInUse + '</p>';
					$$.displayDialog('warning', 'warning', language.warning, html);
					gateway.nickWasInUse = false;
				}
				gateway.connectStatus = 'identified';
			}
		} else {
			if(gateway.connectStatus == '001') { //nie ma hasła więc od razu uznajemy że ok
				gateway.connectStatus = 'identified';
			}
		}
		if(gateway.connectStatus == 'identified' && gateway.setConnectedWhenIdentified == 1){ //podłączony, a szare tło schowane już wcześniej
			gateway.connectStatus = 'connected';
		}
		if(gateway.connectStatus == 'connected'){
			gateway.setConnectedWhenIdentified = 0;
			if(!gateway.joined) {
				$('#input').focus();
			//	gateway.joinChannels();
				gateway.joined = 1;
				gateway.disconnectMessageShown = 0; //tutaj resetuję
				// ustawianie usermode wg konfiguracji dopiero teraz
				if(guser.umodes.R && !$('#setUmodeR').is(':checked')){
					ircCommand.umode('-R');
				} else if(!guser.umodes.R && $('#setUmodeR').is(':checked')){
					ircCommand.umode('+R');
				}
				if(guser.umodes.D && !$('#setUmodeD').is(':checked')){
					ircCommand.umode('-D');
				} else if(!guser.umodes.D && $('#setUmodeD').is(':checked')){
					ircCommand.umode('+D');
				}
			}
		} else {
			gateway.joined = 0;
		}
	},
	'joinChannels': function() {
		ircCommand.channelJoin(guser.channels);
		ircCommand.channelJoin(gateway.channels);
	},
	'connectTimeout': function() {
		gateway.connectTimeoutID = false;
		if(gateway.userQuit){
			return;
		}
		if(gateway.connectStatus != 'connected'){
			var button = [ {
				text: language.reconnect,
				click: function(){
					gateway.stopAndReconnect();
				}
			} ];
			$$.closeDialog('connect', '1');
			$$.displayDialog('connect', 'reconnect', language.connecting, '<p>' + language.connectingTooLong + '</p>', button);
		}
	},
	'stopAndReconnect': function () {
		gateway.disconnected(language.connectingTookTooLong);
		if(gateway.websock.readyState === WebSocket.OPEN) ircCommand.quit(language.connectingTookTooLong);
		setTimeout('gateway.reconnect()', 500);
	},
	'initSys': function() {
		var html = language.connectingWaitHtml;
		$$.displayDialog('connect', '1', language.connecting, html);
	},
	'initialize': function() {
		if($('#automLogIn').is(':checked')){
			if(conn.my_nick == '' || conn.my_reqChannel == ''){
				$$.alert(language.errorLoadingData);
				return false;
			}
			var nickInput = conn.my_nick;
			var chanInput = conn.my_reqChannel;
			var passInput = conn.my_pass;
		} else {
			var nickInput = $('#nsnick').val();
			var chanInput = $('#nschan').val();
			var passInput = $('#nspass').val();
			if(nickInput == ''){
				$$.alert(language.mustGiveNick);
				return false;
			}
			if(chanInput == ''){
				$$.alert(language.mustGiveChannel);
				return false;
			}
			if(chanInput.charAt(0) != '#'){
				chanInput = '#' + chanInput;
				$('#nschan').val(chanInput);
			}
			if(!nickInput.match(/^[\^\|0-9a-z_`\{\}\[\]\-]+$/i)) {
				$$.alert(language.badCharsInNick);
				return false;
			}
			if(nickInput.match(/^[0-9-]/)){
				$$.alert(language.badNickStart);
				return false;
			}
			if(!chanInput.match(/^[#,a-z0-9_\.\-\\]+$/i)) {
				$$.alert(language.badCharsInChan);
				return false;
			}
			if(passInput.match(/[ ]+/i)) {
				$$.alert(language.spaceInPassword);
				return false;
			}
		}
		if($('#enableautomLogIn').is(':checked')){
			$('#automLogIn').prop('checked', true);
			disp.changeSettings();
			var button = [ {
				text: 'OK',
				click: function(){
					$(this).dialog('close');
				}
			} ];
			$$.displayDialog('connect', '2', language.information, language.youCanDisableAutoconnect, button);
		}
		if(nickInput != guser.nick) {
			guser.changeNick(nickInput);
		}
		guser.channels = [ chanInput ];
		if(passInput != '') {
			guser.nickservnick = nickInput;
			guser.nickservpass = passInput;
		}
		try {
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
		} catch(e) {}
		guser.account = guser.nick;
		try {
			window.history.pushState('', guser.nick+ ' @ '+mainSettings.networkName, '/'+chanInput.substr(1)+'/'+nickInput+'/');
		} catch(e) {}
		gateway.initSys();
		gateway.connect(false);

		return true;
	},
	'delayedSendTimer': false,
	'toSend': [],
	'sendDelayCnt': 0,
	'sendDelayed': function(data){
		gateway.toSend.push(data);
	},
	'send': function(data) {
		if(gateway.websock.readyState === gateway.websock.OPEN && (gateway.sendDelayCnt < 3 || gateway.connectStatus != 'connected')){
			gateway.forceSend(data);
			gateway.sendDelayCnt++;
		} else {
			gateway.toSend.push(data);
		}
	},
	'forceSend': function(data){
		if(gateway.websock.readyState === gateway.websock.OPEN){
			console.log('← '+data);
			//sdata = Base64.encode(data+'\r\n');
			sdata = data + '\r\n';
			gateway.websock.send(sdata);
		} else {
			console.log('Outmsg delayed: '+data);
			gateway.toSend.push(data);
		}
	},
	'channels': [],
	'findChannel': function(name) {
		if(typeof(name) != 'string') return false;
		for (var i=0; i<gateway.channels.length; i++) {
			if(gateway.channels[i].name.toLowerCase() == name.toLowerCase()) {
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
		if(!confirm(language.areYouSureToChangeTopicOf+channel+'? '+language.itCantBeUndone)){
			return false;
		}
		var newTopic = $('#topicEdit').val().replace(/\n/g, ' ');
		ircCommand.channelTopic(channel, newTopic);
		$$.closeDialog('confirm', 'topic');
		return true;
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
			$("#chstats").animate({
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
			$('#nickopts').css('display', 'none');
			$('#chlist').css('display', 'none');
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
				"opacity": "show",
				"width":	"23%"
			}, 400);
			$("#chstats").animate({
				"opacity": "show",
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
				$('#nickopts').css('display', '');
				$('#chlist').css('display', '');
			}, 450);
		});
	},
	'insert': function(text) {
		var input = $('#input');
		var oldText = input.val();
		input.focus();
		input.val(oldText + text);
	},
	'insertEmoji': function(e) {
		gateway.insert(e);
		var index = emoji.selectable.indexOf(e);
		if (index >= 0) {
			emoji.selectable.splice(index, 1);
			$('#emoticon-symbols span:nth-child(' + (index+1) + ')').remove();
		}
		emoji.selectable.unshift(e);
		if (emoji.selectable.length > 80) {
			emoji.selectable.splice(-1);
			$('#emoticon-symbols span:last').remove();
		}
		$('#emoticon-symbols').prepend(makeEmojiSelector(e));
		saveSelectableEmoji();
	},
	'insertColor': function(color) {
		gateway.insert(String.fromCharCode(3) + (color<10?'0':'') + color.toString());
	},
	'insertCode': function(code) {
		var text = false;
		switch(code){
			case 2: text = String.fromCharCode(2); break;
			case 3: text = String.fromCharCode(3); break;
			case 15: text = String.fromCharCode(15); break;
			case 22: text = String.fromCharCode(22); break;
			case 29: text = String.fromCharCode(29); break;
			case 31: text = String.fromCharCode(31); break;
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
			act.setMark();
		} else {
			gateway.statusWindow.saveScroll();
			gateway.statusWindow.setMark();
		}
		chan = chan.toLowerCase();
		if(chan != "--status" && gateway.findChannel(chan)) {
			var id = gateway.findChannel(chan).id;
			$('#main-window > span').hide();
			$('#tab-info > span').hide();
			$('#nicklist-main > span').hide();
			$('#chstats > div').hide();
			$('#info > span').hide();
			$('#'+id+'-nicklist').show();
			$('#tabs > li').removeClass("activeWindow");
			$('#'+id+'-tab').addClass("activeWindow");
			$('#'+id+'-window').show();
			$('#'+id+'-chstats').show();
			$('#'+id+'-topic').show();
			$('#'+id+'-tab-info').show();
			$('#'+id+'-topic').prop('title', language.clickForWholeTopic);
			
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
					$("#chstats").animate({
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
						$('#nickopts').css('display', '');
						$('#chlist').css('display', '');
					});
				});
			} else {
				gateway.findChannel(chan).restoreScroll();
				setTimeout(function(){
					gateway.findChannel(chan).restoreScroll();
				}, 200);
			}
		} else if(chan != "--status" && gateway.findQuery(chan)) {
			var id = gateway.findQuery(chan).id;
			$('#main-window > span').hide();
			$('#tab-info > span').hide();
			$('#nicklist-main > span').hide();
			$('#info > span').hide();
			$('#chstats > div').hide();
			$('#--status-nicklist').show();
			$('#tabs > li').removeClass("activeWindow");
			$('#'+id+'-tab').addClass("activeWindow");
			$('#'+id+'-window').show();
			$('#'+id+'-topic').show();
			$('#'+id+'-chstats').show();
			$('#'+id+'-tab-info').show();
			$('#'+id+'-topic').prop('title', '');
			gateway.active = chan;
			gateway.tabHistory.push(chan);
			$('#input').focus();
			if($("#nicklist").width() > 40) {
				$("#nicklist").animate({
					"opacity": "toggle",
					"width":	"40px"
				}, 1);
				$("#chstats").animate({
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
					$('#nickopts').css('display', 'none');
					$('#chlist').css('display', 'none');
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
			$('#tab-info > span').hide();
			$('#nicklist-main > span').hide();
			$('#info > span').hide();
			$('#chstats > div').hide();
			$('#--status-nicklist').show();
			$('#tabs > li').removeClass("activeWindow");
			$('#--status-tab').addClass("activeWindow");
			$('#--status-window').show();
			$('#--status-topic').show();
			$('#--status-chstats').show();
			$('#'+gateway.findChannel(chan).id+'-topic').prop('title', '');
			gateway.statusWindow.markRead();
			gateway.active = chan;
			gateway.tabHistory.push(chan);
			$('#input').focus();
			if($("#nicklist").width() > 40) {
				$("#nicklist").animate({
					"opacity": "toggle",
					"width":	"40px"
				}, 1);
				$("#chstats").animate({
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
					$('#nickopts').css('display', 'none');
					$('#chlist').css('display', 'none');
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
			gateway.getActive().appendMessage(language.messagePatterns.notEnoughParams, [$$.niceTime(), command, reason]);
		} else {
			gateway.statusWindow.appendMessage(language.messagePatterns.notEnoughParams, [$$.niceTime(), command, reason]);
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
	'parseUserCommand': function(input) {
		command = input.slice(1).split(" ");
		if(!gateway.callCommand(command, input)) {
			if (gateway.getActive()) {
				gateway.getActive().appendMessage(language.messagePatterns.noSuchCommand, [$$.niceTime(), he(command[0])]);
			} else {
				gateway.statusWindow.appendMessage(language.messagePatterns.noSuchCommand, [$$.niceTime(), he(command[0])]);
			}
		}
	},
	'sendSingleMessage': function(text, active){
		ircCommand.sendMessage(gateway.getActive().name, text);
	},
	'parseUserMessage': function(input){
		var active = gateway.getActive();
		if(active) {
			var textToSend = input;
			if(lengthInUtf8Bytes(textToSend) >= 420){
				var button = [ {
					text: language.yes,
					click: function(){
						do {
							var sendNow = '';
							while(lengthInUtf8Bytes(sendNow)<420 && textToSend.length > 0){
								sendNow += textToSend.charAt(0);
								textToSend = textToSend.substring(1);
							}
							gateway.sendSingleMessage(sendNow, active);
						} while (textToSend != "");
						$(this).dialog('close');
					}
				}, {
					text: language.no,
					click: function(){
						$(this).dialog('close');
					}
				} ];
				var html = language.textTooLongForSingleLine + '<br><br><strong>'+$$.sescape(input)+'</strong>';
				$$.displayDialog('confirm', 'command', language.confirm, html, button);
			} else {
				gateway.sendSingleMessage(input, active);
			}
		}
	},
	'parseUserInput': function(input) {
		if(!input){
			input = '';
		}
		if($('#sendEmoji').is(':checked')){
			input = $$.textToEmoji(input);
		}
		if (!input) {
			return;
		}
		if(gateway.connectStatus != 'disconnected') {
			var regexp = /^\s+(\/.*)$/;
			var match = regexp.exec(input);
			if(match){
				var button = [ {
					text: language.sendMessage,
					click: function(){
						gateway.parseUserMessage(input);
						$(this).dialog('close');
					}
				}, {
					text: language.runCommand,
					click: function(){
						gateway.parseUserCommand(match[1]);
						$(this).dialog('close');
					}
				}, {
					text: language.cancel,
					click: function(){
						$(this).dialog('close');
					}
				} ];
				var html = language.textStartsWithSpaceAndSlash + '<br><br><strong>'+$$.sescape(input)+'</strong>';
				$$.displayDialog('confirm', 'command', language.confirm, html, button);
			} else {
				regexp = /^(#[^ ,]{1,25})$/;
				match = regexp.exec(input);
				if(match){
					var button = [ {
						text: language.sendMessage,
						click: function(){
							gateway.parseUserMessage(input);
							$(this).dialog('close');
						}
					}, {
						text: language.joinTo+input,
						click: function(){
							ircCommand.channelJoin(input);
							$(this).dialog('close');
						}
					}, {
						text: language.cancel,
						click: function(){
							$(this).dialog('close');
						}
					} ];
					var html = language.messageStartsWithHash + '<br><br><strong>'+$$.sescape(input)+'</string>';
					$$.displayDialog('confirm', 'command', language.confirm, html, button);
				} else if(input.charAt(0) == "/") {
					gateway.parseUserCommand(input);
				} else {
					gateway.parseUserMessage(input);
				}
			}
		} else {
			if (gateway.getActive()) {
				gateway.getActive().appendMessage(language.messagePatterns.notConnected, [$$.niceTime()]);
			} else {
				gateway.statusWindow.appendMessage(language.messagePatterns.notConnected, [$$.niceTime()]);
			}
		}
		$("#input").val("");
	},
	'performCommand': function(input){
		input = '/' + input;
		var command = input.slice(1).split(" ");
		if(!gateway.callCommand(command, input)) {
			console.error('Invalid performCommand: '+command[0]);
		}
	},
	'commandHistory': [],
	'commandHistoryPos': -1,
	'inputFocus': function() {
		if(window.getSelection().toString() == ''){
			$("#input").focus();
		}
	},
	'openQuery': function(nick, id) {
		if(ignore.ignoring(nick, 'query')){
			var button = [
				{
					text: language.changeSettings,
					click: function(){
						ignore.askIgnore(nick);
						$(this).dialog('close');
					}
				},
				{
					text: 'OK',
					click: function(){
						$(this).dialog('close');
					}
				}
			];
			var html = '<p>' + language.cantPMBecauseIgnoring + '</p>';
			$$.displayDialog('error', 'ignore', language.error, html, button);
			return;
		}
		gateway.findOrCreate(nick, true);
		if(id){
			gateway.toggleNickOpt(id);
		}
	},
	'showStatus': function(channel, nick) {
		var html = '<p>' + language.giveForNick + '<strong>'+he(nick)+'</strong>' + language.temporaryPrivilegesOnChan + '<strong>'+he(channel)+'</strong>:</p>' +
			'<select id="admopts-add-'+md5(channel)+'">' +
				'<option value="-">' + language.selectOption + '</option>'+
				'<option value="+v">' + language.voicePrivilege + '</option>'+
				'<option value="+h">' + language.halfopPrivilege + '</option>'+
				'<option value="+o">' + language.opPrivilege + '</option>'+
				'<option value="+a">' + language.sopPrivilege + '</option>'+
				'<option value="+q">' + language.founderPrivilege + '</option>'+
			'</select>' +
			'<p>' + language.giveForNick + '<strong>'+he(nick)+'</strong>' + language.chanservPrivilegesOnChan + '<strong>'+he(channel)+'</strong><br>' + language.youNeedServicePrivileges + ':</p>' +
			'<select id="admopts-addsvs-'+md5(channel)+'">' +
				'<option value="-">' + language.selectOption + '</option>'+
				'<option value="VOP">VOP: ' + language.voicePrivilege + '</option>'+
				'<option value="HOP">HOP: ' + language.halfopPrivilege + '</option>'+
				'<option value="AOP">AOP: ' + language.opPrivilege + '</option>'+
				'<option value="SOP">SOP: ' + language.sopPrivilege + '</option>'+
				'<option value="QOP">QOP: ' + language.founderPrivilege + '</option>'+
			'</select>';
		var button = [
			{
				text: language.cancel,
				click: function(){
					$(this).dialog('close');
				}
			},
			{
				text: 'OK',
				click: function(){
					var mode = $('#admopts-add-'+md5(channel)).val();
					var svsmode = $('#admopts-addsvs-'+md5(channel)).val();
					if(mode == '-' && svsmode == '-'){
						$$.alert(language.selectAvalilableOption);
						return;
					}
					if(mode != '-') ircCommand.mode(channel, mode+' '+nick);
					if(svsmode != '-') ircCommand.ChanServ(svsmode, [channel, 'ADD', nick]);
					$(this).dialog('close');
				}
			}
		];
		$$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
	},
	'showStatusAnti': function(channel, nick) {
		var html = '<p>' + language.removeFromNick + '<strong>'+he(nick)+'</strong>' + language.temporaryPrivilegesOnChan + '<strong>'+he(channel)+'</strong>:</p>' +
			'<select id="admopts-del-'+md5(channel)+'">' +
				'<option value="-">' + language.selectOption + '</option>'+
				'<option value="-v">' + language.voicePrivilege + '</option>'+
				'<option value="-h">' + language.voicePrivilege + '</option>'+
				'<option value="-o">' + language.opPrivilege + '</option>'+
				'<option value="-a">' + language.sopPrivilege + '</option>'+
				'<option value="-q">' + language.founderPrivilege + '</option>'+
			'</select>' +
			'<p>' + language.completelyRemoveNick + '<strong>'+he(nick)+'</strong>' + language.fromChanservPrivilegesOnChan + '<strong>'+he(channel)+'</strong><br>' + language.youNeedServicePrivileges + ':</p>' +
			'<select id="admopts-delsvs-'+md5(channel)+'">' +
				'<option value="-">' + language.dontRemove + '</option>'+
				'<option value="+">' + language.yesRemove + '</option>'+
			'</select>';
		var button = [
			{
				text: language.cancel,
				click: function(){
					$(this).dialog('close');
				}
			},
			{
				text: 'OK',
				click: function(){
					var mode = $('#admopts-del-'+md5(channel)).val();
					var svsmode = $('#admopts-delsvs-'+md5(channel)).val();
					if(mode == '-' && svsmode == '-'){
						$$.alert(language.selectAvailableOption);
						return;
					}
					if(mode != '-') ircCommand.mode(channel, mode +' '+nick);
					if(svsmode == '+') ircCommand.ChanServ('ACCESS', [channel, 'DEL', nick]);
					$(this).dialog('close');
				}
			}
		];
		$$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
	},
	'showChannelModes': function(channel) {
		var channame = channel.substring(1);
		var ch = md5(channame);
		
		var html = '<p>'+language.changeChannelModesOf+he(channel)+":</p>" +
			'<table><tr><th></th><th>' + language.character + '</th><th>' + language.description + '</th></tr>';
		//generate HTML table with all supported and settable chanmodes
		modes.changeableSingle.forEach(function(mode){
			if(modes['single'].indexOf(mode[0]) >= 0) html += '<tr><td><input type="checkbox" id="'+ch+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td></tr>';
		}, this);
		modes.changeableArg.forEach(function(mode){
			if(modes['argAdd'].indexOf(mode[0]) >= 0 || modes['argBoth'].indexOf(mode[0]) >= 0) html += '<tr><td><input type="checkbox" id="'+ch+'_mode_'+mode[0]+'"></td><td>'+mode[0]+'</td><td>'+mode[1]+'</td><td><input type="text" id="'+ch+'_mode_'+mode[0]+'_text"></td></tr>';
		}, this);
		html += '</table>';

		var button = [ {
			text: language.applySetting,
			click: function(){
				gateway.changeChannelModes(channel);
				$(this).dialog('close');
			}
		} ];

		$$.displayDialog('admin', channel, language.administrationOf+he(channel), html, button);
		
		var chanModes = gateway.findChannel(channel).modes;
		if(!chanModes){
			return;
		}
		//uzupełnianie tabeli trybami już ustawionymi
		modes.changeableSingle.forEach(function(mode){
			if(chanModes[mode[0]]){
				$('#'+ch+'_mode_'+mode[0]).prop('checked', true);
			}
		}, this);
		modes.changeableArg.forEach(function(mode){
			if(chanModes[mode[0]]){
				$('#'+ch+'_mode_'+mode[0]).prop('checked', true);
				$('#'+ch+'_mode_'+mode[0]+'_text').val(chanModes[mode[0]]);
			}
		}, this);
	},
	'changeChannelModes': function(channel) {
		var modesw = '';
		var modeop = '';
		var modearg = '';
		var chanModes = gateway.findChannel(channel).modes;
		var channame = channel.substring(1);
		var ch = md5(channame);
		
		modes.changeableSingle.forEach(function(mode){
			mode = mode[0];
			var set = chanModes[mode];
			var checked = $('#'+ch+'_mode_'+mode).prop('checked');
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
			var checked = $('#'+ch+'_mode_'+mode).prop('checked');
			var text = $('#'+ch+'_mode_'+mode+'_text').val();
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
		
		ircCommand.mode(channel, modesw+' '+modearg);
		setTimeout(function(){ gateway.showChannelModes(channel); }, 2000);
	},
	'showInvitePrompt': function(channel) {
		var html = '<p>Nick: <input id="inviteNick" type="text"></p>';
		var button = [ {
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: language.inviteSomeone,
			click: function(){
				var nick = $('#inviteNick').val();
				if(!nick || nick == ''){
					$$.alert(language.mustGiveNick);
					return;
				}
				ircCommand.channelInvite(channel, nick);
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('admin', 'invite-'+channel, language.inviteUserTo+he(channel), html, button);
	},
	'knocking': function(channel, nick, reason) {
		var html = '<b>'+nick+'</b>' + language.requestsInvitationTo + '<b>'+he(channel)+'</b> ('+$$.colorize(reason)+')';
		var button = [ {
			text: 'Zaproś',
			click: function(){
				ircCommand.channelInvite(channel, nick);
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('knock', nick, language.requestForInvitation, html, button);
	},
	'showKick' : function(channel, nick) {
		var html = '<p>'+language.kickUser+he(nick)+language.fromChannel+he(channel)+'. ' + language.giveKickReason + '</p>' +
			"<input type='text' id='kickinput' maxlength='307' />";
		var button = [ {
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: language.doKick,
			click: function(){
				var reason = $('#kickinput').val();
				ircCommand.channelKick(channel, nick, reason);
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('admin', 'kick-'+channel, 'KICK', html, button);
	},
	/*'showBan' : function(channel, nick) {
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
	},*/
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
	'toggleChannelOperOpts': function(channel) {
		var $element = $('#'+gateway.findChannel(channel).id+'-operActions ul');
		if($element.is(':visible')){
			$element.hide('blind', {
				direction: 'vertical'
			}, 300);
			$('#'+gateway.findChannel(channel).id+'-operActions .chstats-button').removeClass('channelAdminActive');
		} else {
			$element.show('blind', {
				direction: 'vertical'
			}, 300);
			$('#'+gateway.findChannel(channel).id+'-operActions .chstats-button').addClass('channelAdminActive');
		}
	},
	'toggleChannelOpts': function(channel) {
		var $element = $('#'+gateway.findChannel(channel).id+'-channelOptions ul');
		if($element.is(':visible')){
			$element.hide('blind', {
				direction: 'vertical'
			}, 300);
			$('#'+gateway.findChannel(channel).id+'-chstats .chstats-button').removeClass('channelAdminActive');
		} else {
			$element.show('blind', {
				direction: 'vertical'
			}, 300);
			$('#'+gateway.findChannel(channel).id+'-chstats .chstats-button').addClass('channelAdminActive');
		}
	},
	'toggleNickOpts': function() {
		var $element = $('#nickOptions')
		if($element.is(':visible')){
			$element.hide('blind', {
				direction: 'down'
			}, 300);
			$('#nickopts .nickoptsButton').removeClass('channelAdminActive');
		} else {
			$element.show('blind', {
				direction: 'down'
			}, 300);
			$('#nickopts .nickoptsButton').addClass('channelAdminActive');
		}
	},
	'showPermError': function(text) {
		var html = language.noAccess +
			'<br>' + language.notEnoughPrivileges + '<br>'+text;
		$$.displayDialog('error', 'error', language.error, html);
	},
	'clickQuit': function() {
		var html = '<form id="quit-form" onsubmit="gateway.quit();" action="javascript:void(0);">'+
			language.quitMessage + '<input type="text" id="quit-msg" value="' + language.defaultQuitMessage + '" />';
			'</form>';
		var button = [ {
			text: language.disconnect,
			click: function(){
				$('#quit-form').submit();
				$(this).dialog('close');
			}
		}, {
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('confirm', 'quit', language.ircQuit, html, button);
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
					var chan = gateway.findChannel(gateway.active);
					if(chan) {
						for (var inick=0; inick < chan.nicklist.list.length; inick++) {
							if(chan.nicklist.list[inick].user.nick.toLowerCase().replace(/^[^a-z0-9]/ig).indexOf(string.toLowerCase().replace(/^[^a-z0-9]/ig)) == 0) {
								complarr[ccount] = chan.nicklist.list[inick].user.nick;
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
	'parseChannelMode': function(args, chan, dispType /* 1 - joining a channel, 0 - changed when already on a channel */) {
		var plus = true;
		var nextarg = 1;
		var log = '';
		var mode = '';
		var modechar = '';
		var infoText = '';
		var dir = '';
		gateway.statusWindow.modes = {};
		for (var i=0; i<args[0].length; i++) {
			var cchar = args[0][i];
			switch(cchar){
				case '+':
					log += "Change +\n";
					plus = true;
					if(dispType == 1){
						dir = '';
					} else {
						dir = language.hasSet;
					}
					break;
				case '-':
					if(dispType == 1) continue;
					dir = language.hasRemoved;
					log += "Change -\n";
					plus = false;
					break;
				default:
					var mtype = 'single';
					if(modes.argBoth.indexOf(cchar) >= 0){
						mtype = 'both';
					} else if(modes.argAdd.indexOf(cchar) >= 0){
						mtype = 'add';
					} else if(modes.list.indexOf(cchar) >= 0){
						mtype = 'list';
					} else if(modes.user.indexOf(cchar) >= 0){
						mtype = 'user';
					}
					
					switch(mtype){
						case 'both': case 'list':
							log += "Mode 'both' "+plus+' '+cchar+' '+args[nextarg]+"\n";
							infoText = infoText.apList(dir+getModeInfo(cchar, dispType)+(args[nextarg]?(' '+args[nextarg]):''));
							if(mtype != 'list'){
								if(plus){
									chan.modes[cchar] = args[nextarg];
								} else {
									chan.modes[cchar] = false;
								}
							}
							nextarg++;
							break;
						case 'add':
							log += "Mode 'add' "+plus+' '+cchar+' '+args[nextarg]+"\n";
							if(plus){
								chan.modes[cchar] = args[nextarg];
								infoText = infoText.apList(dir+getModeInfo(cchar+'-add', dispType)+(args[nextarg]?(' '+args[nextarg]):''));
								nextarg++;
							} else {
								infoText = infoText.apList(dir+getModeInfo(cchar+'-remove', dispType));
								chan.modes[cchar] = false;
							}
							break;
						case 'user':
							log += "Mode 'user' "+plus+' '+cchar+' '+args[nextarg]+"\n";
							if(chan.nicklist.findNick(args[nextarg])) {
								if(cchar in language.modes.chStatusNames){
									mode = language.modes.chStatusNames[cchar];
								} else {
									mode = cchar;
								}
								chan.nicklist.findNick(args[nextarg]).setMode(mode, plus);
								infoText = infoText.apList((plus?language.gave:language.taken)+getModeInfo(cchar, dispType)+(plus?language.forUser:'')+' <span class="modevictim">'+args[nextarg]+'</span>');
							}
							nextarg++;
							break;
						default:
							log += "Mode 'normal' "+plus+' '+cchar+"\n";
							chan.modes[cchar] = plus;
							infoText = infoText.apList(dir+' '+getModeInfo(cchar, dispType));
							break;
					}
					break;
			}
		}
		//console.log(log); // MODE debugging
		return infoText;
	},
	'parseIsupport': function() {
		if('CHANMODES' in isupport){
			var modeTypes = isupport['CHANMODES'].split(',');
			if(modeTypes.length != 4){
				console.error('Error parsing CHANMODES isupport!');
				return;
			}
			modes.single = [];
			modes.argBoth = [];
			modes.argAdd = [];

			for(var i=0; i<4; i++){
				var modeChars = modeTypes[i];
				for(var j=0; j<modeChars.length; j++){
					switch(i){
						case 0: // list type (argBoth)
							modes.argBoth.push(modeChars.charAt(j));
							break;
						case 1: // add and remove with arguments (argBoth)
							modes.argBoth.push(modeChars.charAt(j));
							break;
						case 2: // add with arguments (argAdd)
							modes.argAdd.push(modeChars.charAt(j));
							break;
						case 3: // no arguments (single)
							modes.single.push(modeChars.charAt(j));
							break;
					}
				}
			}
		}
		if('PREFIX' in isupport){
			var expr = /^\(([^)]+)\)(.+)$/;
			var prefix = expr.exec(isupport['PREFIX']);
			if(!prefix || prefix[1].length != prefix[2].length){
				console.error('Error parsing PREFIX isupport!');
				return;
			}
			modes.user = [];
			modes.prefixes = [];
			
			for(var i=0; i<prefix[1].length; i++){
				modes.user.push(prefix[1].charAt(i));
				modes.prefixes[prefix[1].charAt(i)] = prefix[2].charAt(i);
				modes.reversePrefixes[prefix[2].charAt(i)] = prefix[1].charAt(i);
			}
		}
	},
	'storageHandler': function(evt) {
		if(!evt.newValue){
			return;
		}
		if(conn.waitForAlive && evt.key == 'checkAliveReply'){
			var nick = evt.newValue;
			conn.waitForAlive = false;
			
			var chan = guser.channels[0];
			var html = language.alreadyConnectedAs + '<strong>'+he(evt.newValue)+'</strong>! ' + language.cantOpenMultipleInstances;
			$('#not_connected_wrapper').fadeOut(400);
			
			try {
				localStorage.removeItem(evt.key);
				if(chan && chan != '#'){
					html += '<br>' + language.goToTabToJoin + '<strong>'+chan+'</strong>.';
					localStorage.setItem('reqChannelJoin', guser.channels[0]);
				}
			} catch(e) {}


			$$.displayDialog('connect', '0', language.alreadyConnected, html);
		}
		if(gateway.connectStatus == 'connected'){
			try {
				if(evt.key == 'checkAlive'){
					localStorage.removeItem(evt.key);
					localStorage.setItem('checkAliveReply', guser.nick);
				}
				if(evt.key == 'reqChannelJoin'){
					var chan = evt.newValue;
					localStorage.removeItem(evt.key);
					for(var i=0; i<gateway.channels.length; i++){
						if(gateway.channels[i].name.toLowerCase() == chan.toLowerCase()){
							return;
						}
					}
					var html = language.otherTabWantsToJoin + '<strong>'+chan+'</strong>.';
					var button = [ {
						text: language.cancel,
						click: function(){
							$(this).dialog('close');
						}
					}, {
						text: language.join,
						click: function(){
							ircCommand.channelJoin(chan);
							$(this).dialog('close');
						}
					} ];
					$$.displayDialog('confirm', 'join', language.confirm, html, button);
				}
			} catch(e) {}
		}
	},
	'quitQueue': [],
	'quitTimeout': false,
	'netJoinUsers': {},
	'netJoinQueue': [],
	'netJoinTimeout': false,
	'processNetsplit': function(){
		gateway.quitTimeout = false;
		if(gateway.quitQueue.length == 0) return;
		
		for(c in gateway.channels){
			var nickNames = '';
			var chan = gateway.channels[c];
			var nicklist = chan.nicklist;
			for(n in gateway.quitQueue){
				var nick = gateway.quitQueue[n].sender.nick;
				if(!gateway.netJoinUsers[chan.name]){
					gateway.netJoinUsers[chan.name] = {};
				}
				gateway.netJoinUsers[chan.name][nick] = (+new Date)/1000;
				if(nicklist.findNick(nick)){
					nicklist.removeNick(nick);
					if(nickNames != ''){
						nickNames += ', ';
					}
					nickNames += nick;
				}
			}
			if(nickNames != ''){
				chan.appendMessage(language.messagePatterns.netsplit, [$$.niceTime(), nickNames]);
			}
		}
		for(n in gateway.quitQueue){
			var nick = gateway.quitQueue[n].sender.nick;
			users.delUser(nick);
		}
		gateway.quitQueue = [];
	},
	'processNetjoin': function(){
		gateway.netJoinTimeout = false;
		if(gateway.netJoinQueue.length == 0) return;
		
		for(c in gateway.channels){
			var nickNames = '';
			var chan = gateway.channels[c];
			var nicklist = chan.nicklist;
			for(var n=0; n<gateway.netJoinQueue.length; n++){
				try {
					if(gateway.netJoinQueue[n].chan.toLowerCase() != chan.name.toLowerCase()){
						continue;
					}
				} catch(e) {
					console.error(e);
				}
				var nick = gateway.netJoinQueue[n].nick;
				if(nickNames != ''){
					nickNames += ', ';
				}
				nickNames += nick;
			}
			if(nickNames != ''){
				chan.appendMessage(language.messagePatterns.netjoin, [$$.niceTime(), nickNames]);
			}
		}
		gateway.netJoinQueue = [];
	},
	'processQuit': function(msg){
		if(gateway.findQuery(msg.sender.nick)) {
			if (!$('#showPartQuit').is(':checked')) {
				gateway.findQuery(msg.sender.nick).appendMessage(language.messagePatterns.quit, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
			}
		}

		if(msg.text.match(/^[^ :]+\.[^ :]+ [^ :]+\.[^ :]+$/)){
			gateway.quitQueue.push(msg);
			if(gateway.quitTimeout){
				clearTimeout(gateway.quitTimeout);
			}
			gateway.quitTimeout = setTimeout(gateway.processNetsplit, 700);
			return false;
		}
		
		for(c in gateway.channels) {
			if(gateway.channels[c].nicklist.findNick(msg.sender.nick)) {
				gateway.channels[c].nicklist.removeNick(msg.sender.nick);
				if (!$('#showPartQuit').is(':checked')) {
					gateway.channels[c].appendMessage(language.messagePatterns.quit, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
				}
			}
		}
		return true;
	},
	'processJoin': function(msg){
		if('extended-join' in activeCaps){
			var channame = msg.args[0];
		} else {
			var channame = msg.text;
		}
		var chan = gateway.findChannel(channame);
		var dlimit = (+new Date)/1000 - 300;
		if(!chan) return;
		var netjoin = false;
		if(gateway.netJoinUsers[channame] && gateway.netJoinUsers[channame][msg.sender.nick]){
			if(gateway.netJoinUsers[channame][msg.sender.nick] > dlimit){
				netjoin = true;
			}
			delete gateway.netJoinUsers[channame][msg.sender.nick];
		}
		if(netjoin){
			gateway.netJoinQueue.push({'chan': channame, 'nick': msg.sender.nick});
			if(gateway.netJoinTimeout){
				clearTimeout(gateway.netJoinTimeout);
			}
			gateway.netJoinTimeout = setTimeout(gateway.processNetjoin, 700);
		} else if (!$('#showPartQuit').is(':checked')) {
			chan.appendMessage(language.messagePatterns.join, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), channame]);
		}
	},
	'findOrCreate': function(name, setActive){
		if(!name || name == ''){
			return null;
		}
		if(name.charAt(0) == '#'){ //kanał
			var tab = gateway.findChannel(name);
			if(!tab) {
				tab = new Channel(name);
				gateway.channels.push(tab);
			}
		} else { //query
			tab = gateway.findQuery(name);
			if(!tab) {
				tab = new Query(name);
				gateway.queries.push(tab);
			}
		}
		if(setActive){
			gateway.switchTab(name);
		}
		return tab;
	},
	'find': function(name){
		if(!name || name == ''){
			return false;
		}
		if(name.charAt(0) == '#'){ //kanał
			return gateway.findChannel(name);
		} else { //query
			return gateway.findQuery(name);
		}
		return false;
	},
	'smallListLoading': false,
	'smallListData': [],
	'toggleChanList': function() {
		if($('#chlist-body').is(':visible')){
			$('#chlist-body').css('display', '');

			$('#chlist').css('height', '').css('top', '');
			$('#nicklist').css('bottom', '');
			var nicklistBottom = $('#nicklist').css('bottom');
			$('#nicklist').css('bottom', '36%');
			$("#nicklist").animate({
				"bottom":	nicklistBottom
			}, 400);
			
			$('#chlist-button').text('⮙ ' + language.channelList + ' ⮙');
		} else {
			$('#chlist-body').css('display', 'block');
			$('#chlist').css('height', 'initial').css('top', '64.5%');
		//	$('#nicklist').css('bottom', '31%');
			$("#nicklist").animate({
				"bottom":	"36%"
			}, 400);
			$('#chlist-button').text('⮛ ' + language.hideList + ' ⮛');
			if(!$('#chlist-body > table').length){
				gateway.smallListLoading = true;
				ircCommand.listChannels('>9');
			}
		}
	},
	'toggleFormatting': function() {
		if($('#formatting').is(':visible')){
			$('#formatting').hide();
			$('#formatting-button').text(language.insertFormatCodes);
		} else {
			$('#formatting').show();
			$('#formatting-button').text('⮙ ' + language.hideFormatting + ' ⮙');
		}
	},
	'refreshChanList': function() {
		gateway.smallListLoading = true;
		ircCommand.listChannels('>9');
		$('#chlist-body').html(language.loadingWait);
	},
	'parseUmodes': function(modes) {
		var plus = false;
		for(var i=0; i<modes.length; i++){
			var c = modes.charAt(i);
			switch(c){
				case '+': plus = true; break;
				case '-': plus = false; break;
				case ' ': return;
				default: guser.setUmode(c, plus); break;
			}
		}
	},
	'getUmodeString': function(){
		var modeString = '+';
		for(m in guser.umodes){
			if(guser.umodes[m] == true){
				modeString += m;
			}
		}
		if(modeString.length == 1){
			modeString = language.none;
		}
		return modeString;
	},
	'enterPressed': function(){
		if(gateway.connectStatus == 'disconnected' || gateway.connectStatus == 'error'){
			$$.alert(language.cantSendNoConnection);
			return;
		}
		if(gateway.commandHistory.length == 0 || gateway.commandHistory[gateway.commandHistory.length-1] != $('#input').val()) {
			if(gateway.commandHistoryPos != -1 && gateway.commandHistoryPos == gateway.commandHistory.length-1) {
				gateway.commandHistory[gateway.commandHistoryPos] = $('#input').val();
			} else {
				gateway.commandHistory.push($('#input').val());
			}
		}
		gateway.parseUserInput($('#input').val());
		gateway.commandHistoryPos = -1;
	},
	'arrowPressed': function(dir){
		if(dir == 'up'){
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
		} else {
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
		}
	},
	'displayGlobalBanInfo': function(text){
		var html = language.connectionNotAllowedHtml +
			'</ul><br><p>' + language.serverMessageIs + '<br>'+he(text)+'</p>';
		$$.closeDialog('connect', '1');
		$$.displayDialog('error', 'noaccess', language.noAccessToNetwork, html);
		gateway.connectStatus = 'banned';
	},
	'inputPaste': function(e){ // TODO
		console.log(e);
		var items = (e.clipboardData || e.originalEvent.clipboardData).items;
		console.log(items);
	},
	'inputKeypress': function(e){
		if(!('message-tags' in activeCaps)) return;
		if($('#input').val().length > 0 && $('#input').val().charAt(0) == '/') return; // typing a command
		if(!gateway.getActive()) return;
		if(gateway.lastKeypressWindow == gateway.getActive()){
			if($('#input').val() == ''){
/*				if(gateway.keypressSuppress){
					clearTimeout(gateway.keypressSuppress);
					gateway.keypressSuppress = false;
				}
				ircCommand.sendTags(gateway.getActive().name, '+draft/typing', 'done');*/
				return;
			} else {
				if(gateway.keypressSuppress) return;
			}
		}
		if(gateway.keypressSuppress){
			clearTimeout(gateway.keypressSuppress);
		}
		gateway.keypressSuppress = setTimeout(function(){
			gateway.keypressSuppress = false;
		}, 5500);
		gateway.lastKeypressWindow = gateway.getActive();
		ircCommand.sendTags(gateway.getActive().name, ['+draft/typing', '+typing'], ['active', 'active']);
	},
	'getMeta': function(nick, size){
		var avatar = gateway.getAvatarUrl(nick, size);
		if(avatar) {
			meta = '<img src="' + avatar + '" alt="'+nick+'" onerror="this.src=\'/styles/img/noavatar.png\';">';
		} else {
			if('display-name' in users.getUser(nick).metadata){
				var dispNick = users.getUser(nick).metadata['display-name'];
			} else {
				var dispNick = nick;
			}
			meta = '<span class="avatar letterAvatar" style="background-color:'+$$.nickColor(nick, true)+';"><span role="presentation">'+dispNick.charAt(0)+'</span></span>';
		}
		return meta;
	},
	'getAvatarUrl': function(nick, size){
		if(!size) size = 200;
		var user = users.getUser(nick);
		if(user.disableAvatar) return false;
		var avatar = false;
		if('avatar' in user.metadata){
			avatar = user.metadata['avatar'].replace('{size}', size.toString());
		}
		if(!avatar){
			var expr = /^~?[su]id([0-9]+)$/;
			var avmatch = expr.exec(user.ident);
			if(avmatch){
				var irccloudUrl = 'https://static.irccloud-cdn.com/avatar-redirect/s' + size.toString() + '/' + avmatch[1];
			//	if(ImageExists(irccloudUrl)){
					avatar = irccloudUrl;
			//	}
			}
		}
		return avatar;
	},
	'getMsgid': function(tags){
		if(tags && 'msgid' in tags){
			var msgid = tags.msgid;
		} else {
			var msgid = '';
		}
		return msgid;
	},
	'makeLabel': function(){
		gateway.label++;
		return gateway.label.toString();
	},
	'insertMessage': function(cmd, dest, text, ownMsg, label, tags, sender, time){
		if(tags && 'label' in tags && gateway.labelsToHide.indexOf(tags.label) >= 0){
			gateway.labelProcessed = true;
			return; // hidden message, likely contains a password
		}
		if(!time)
			time = new Date();
		var attrs = 'data-time="' + time.getTime() + '"';
		var addClass = '';
		if(ownMsg && !('labeled-response' in activeCaps) && ('echo-message' in activeCaps)) return; // if label is not supported, no use in displaying own message
		if(ownMsg){ // I'm sending this and it's not echo-message
			if(label){
				attrs += ' data-label="' + label + '"';
				addClass = 'notDelivered';
			}
		} else {
			if('label' in tags){ // we're using labeled-response and this is our echo-message
				$('[data-label="'+tags.label+'"]').remove(); // removing temporary display
				gateway.labelProcessed = true;
			}
			if('msgid' in tags){
				attrs += ' data-msgid="' + tags.msgid + '"';
			}
		}
		
		if(!sender) sender = guser.me;
		
		if(sender == guser.me && text.charAt(0) == '\001') return; // don't display own ctcp requests/replies, this is confirmed to be called when sending requests and NOT for actions
		
		var meta = gateway.getMeta(sender.nick, 100);
		var images = $$.parseImages(text, attrs);
		var message = $$.colorize(text);
		var nickComments = '';
		var nick = sender.nick;
		var msgid = gateway.getMsgid(tags);
		var tab = null;
		var channel = false;
		
		if(msgid.length > 0 && $('[data-msgid="'+msgid+'"]').length > 0) return; //we already received this message and this is a history entry
		
		if(dest.charAt(0) == '#'){
			tab = gateway.findOrCreate(dest);
			tab.typing.stop(sender);
			channel = true;
		}

		var nickInfo = '';
		if(sender.account){
			nickInfo = language.loggedInAs + sender.account;
		} else if(sender.registered) { // possible if the server does not send account name
			nickInfo = language.loggedIn;
		} else {
			nickInfo = language.notLoggedIn;
		}
		if(sender.bot){
			if(nickInfo.length > 0) nickInfo += '\n';
			nickInfo += language.userIsBot;
		}
		if(channel){
			if(gateway.isHistoryBatch(tags)){
				if(nickInfo.length > 0) nickInfo += '\n';
				nickInfo += language.historyEntry;
			}
		}
		if(nickInfo.length > 0)
			nick = '<span title="' + nickInfo + '">' + nick + '</span>';
		if('display-name' in sender.metadata){
			nick = user.metadata['display-name'];
			nickComments = ' <span class="realNick" title="' + language.realNickname + '">(' + msg.sender.nick + ')</span>';
		}
		for(f in messageProcessors){
			message = messageProcessors[f](sender.nick, dest, message);
		}

//		$('[data-msgid="'+msgid+'"]').remove(); // drop the message from backlog field

		if(channel && sender != guser.me){
			var pattern = "\\b"+escapeRegExp(guser.nick)+"\\b";
			var re = new RegExp(pattern);
			var hlmatch = re.test(message);
			console.log("highlight pattern="+pattern+", returned="+hlmatch);
		} else {
			var hlmatch = false;
		}

		if(cmd == 'NOTICE' && channel){ // channel notice
			tab.appendMessage(language.messagePatterns.notice, [addClass, attrs, $$.niceTime(time), he(sender.nick), he(sender.ident), he(sender.host), message]);
			if(hlmatch && gateway.active != tab.name) {
				tab.markBold();
			}
			return;
		}
		if(cmd == 'PRIVMSG' || cmd == 'ACTION'){ // channel or private message
			if(!channel){
				if(sender.nick == guser.nick){
					var qname = dest;
				} else {
					var qname = sender.nick;
				}
				if(
				((sender.nick == guser.nick && dest.isInList(servicesNicks))
				|| (dest == guser.nick && sender.nick.isInList(servicesNicks)))
				&& !gateway.find(qname)){ // do not open a query when expecting service messages in pop-up or status
					if($("#noticeDisplay").val() == 0){ // pop-up
						var html = '<span class=\"notice\">[<b>' + sender.nick + " → " + dest + "</b>]</span> " + message;
						$$.displayDialog('notice', 'service', language.networkServiceMessage, html, false, attrs);
						return;
					} else if($("#noticeDisplay").val() == 2){ // status
						gateway.statusWindow.appendMessage(language.messagePatterns.yourServiceCommand, [addClass, attrs, $$.niceTime(time), guser.nick, dest, message], time);
						return;
					} else { // query
						// default behavior
					}
				}
				tab = gateway.findOrCreate(qname);
				tab.typing.stop(sender);
			} else {
				var qname = dest;
			}
			if(cmd != 'ACTION'){
				var messageDiv = $('#'+tab.id+'-window div.messageDiv:not(".msgRepeat"):last');
				var messageClass = 'msgNormal';
				if(messageDiv.hasClass('sender'+md5(sender.nick)) && messageDiv[0].getAttribute('data-time') <= time.getTime()){ // last message was by the same sender and is not newer that the received one
					messageDiv.find('span.msgText').append('<span class="msgRepeatBlock ' + addClass + '" ' + attrs + '><br><span class="time">'+$$.niceTime(time)+'</span> &nbsp;'+message+'</span>');
					messageClass = 'msgRepeat';
				} else {
					if('labeled-response' in activeCaps && 'echo-message' in activeCaps && ownMsg){
						// the message will be re-sent anyway
					} else {
						tab.markingSwitch = !tab.markingSwitch;
					}
				}
				if(tab.markingSwitch){
					messageClass += ' oddMessage';
				} else {
					messageClass += ' evenMessage';
				}
				message = '<span class="time msgRepeatBlock">'+$$.niceTime(time)+'</span> &nbsp;' + message;
			}
			messageClass += ' ' + addClass;
			if(hlmatch) { // highlighted
				if(cmd != 'ACTION'){
					tab.appendMessage(language.messagePatterns.channelMsgHilight, ['sender'+md5(sender.nick) + ' ' + messageClass, attrs, meta, $$.niceTime(time), nick, nickComments, message], time);
				} else {
					tab.appendMessage(language.messagePatterns.channelActionHilight, [addClass, attrs, $$.niceTime(time), nick, message], time);
				}
				if(messageClass.indexOf('msgRepeat') > -1){
					messageDiv.find('span.nick').addClass('repeat-hilight');
				}
				if(gateway.active != dest.toLowerCase() || !disp.focused) {
					tab.markNew();
				}
			} else { // not highlighted or query
				if(cmd != 'ACTION'){
					tab.appendMessage((sender.nick == guser.nick)?language.messagePatterns.yourMsg:language.messagePatterns.channelMsg, ['sender'+md5(sender.nick) + ' ' + messageClass, attrs, meta, $$.niceTime(time), $$.nickColor(sender.nick), nick, nickComments, message], time);
				} else {
					tab.appendMessage((sender.nick == guser.nick)?language.messagePatterns.yourAction:language.messagePatterns.channelAction, [addClass, attrs, $$.niceTime(time), $$.nickColor(sender.nick), nick, message], time);
				}
				if(gateway.active.toLowerCase() != qname.toLowerCase() || !disp.focused) {
					if(channel){
						tab.markBold();
					} else {
						tab.markNew();
					}
				}
			}

			tab.appendMessage('%s', [images.html], time);
			$$.applyCallbacks(images.callbacks);
			return;
		}
		if(cmd == 'NOTICE'){ // private notice
			if(ownMsg){
				if($("#noticeDisplay").val() == 2) { // notice in status window
					gateway.statusWindow.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), dest, message], time);
				} else if($("#noticeDisplay").val() == 1) { // notice in a query window
					var query = gateway.findOrCreate(command[1]);
					query.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), dest, message], time);
				} else if($("#noticeDisplay").val() == 0) { // notice in pop-up
					var html = "<span class=\"notice\">[<b>"+he(sender.nick)+" → "+he(dest) + "</b>]</span> " + message;
					$$.displayDialog('notice', dest, language.privateNoticeFrom+' '+dest, html, false, attrs);
				}
				return;
			}
			if(!sender.server){ // sent by user or service
				if(sender == guser.me){
					var query = gateway.findQuery(dest);
				} else {
					var query = gateway.findQuery(sender.nick);
				}
				var displayAsQuery = Boolean(query) || ($("#noticeDisplay").val() == 1);
				if(displayAsQuery){ // notice in a query window
					if(!query) {
						query = gateway.findOrCreate(sender.nick);
					}
					if(sender == guser.me){
						query.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), dest, message], time);
					} else {
						query.appendMessage(language.messagePatterns.notice, [addClass, attrs, $$.niceTime(time), he(sender.nick), he(sender.ident), he(sender.host), message], time);
					}
					if(gateway.active.toLowerCase() != sender.nick.toLowerCase()) {
						query.markNew();
					}
				}  else if ($("#noticeDisplay").val() == 2) { // notice in status window
					if(sender == guser.me){
						gateway.statusWindow.appendMessage(language.messagePatterns.yourNotice, [addClass, attrs, $$.niceTime(), dest, message], time);
					} else {
						gateway.statusWindow.appendMessage(language.messagePatterns.notice, [addClass, attrs, $$.niceTime(time), he(sender.nick), he(sender.ident), he(sender.host), message], time);
						gateway.statusWindow.markBold();
					}
				} else if($("#noticeDisplay").val() == 0) { // notice in pop-up
					if(sender.nick.isInList(servicesNicks)){
						if(sender == guser.me){
							var html = "<span class=\"notice\">[<b>"+he(sender.nick)+" → "+he(dest) + "</b>]</span> " + message;
						} else {
							var html = '<span class="notice-nick">&lt;<b>'+sender.nick+'</b>&gt</span> ' + message;
						}
						$$.displayDialog('notice', 'service', language.networkServiceMessage, html, false, attrs);
					} else {
						if(sender == guser.me){
							var html = "<span class=\"notice\">[<b>"+he(sender.nick)+" → "+he(dest) + "</b>]</span> " + message;
							$$.displayDialog('notice', dest, language.privateNoticeFrom + dest, html, false, attrs);
						} else {
							$$.displayDialog('notice', sender.nick, language.privateNoticeFrom + sender.nick, message, false, attrs);
						}
					}
				}
				if(query){
					query.typing.stop(sender);
				}
			} else { // sent by server
				var expressions = [/^Your "real name" is now set to be/, / invited [^ ]+ into the channel.$/]; // TODO should this look like this?
				for(var i=0; i<expressions.length; i++){
					if(text.match(expressions[i])){
						return;
					}
				}

				var expr = /^\[Knock\] by ([^ !]+)![^ ]+ \(([^)]+)\)$/; // detect KNOCK by someone
				var match = expr.exec(text);
				if(match){
					gateway.knocking(dest.substring(dest.indexOf('#')), match[1], match[2]);
					return;
				}
				expr = /^Knocked on (.*)$/; // detect own KNOCK
				var match = expr.exec(text);
				if(match){
					var chan = gateway.findChannel(match[1]);
					if(chan){
						chan.appendMessage(language.messagePatterns.knocked, [$$.niceTime(time), match[1]], time);
					} else {
						gateway.statusWindow.appendMessage(language.messagePatterns.knocked, [$$.niceTime(time), match[1]], time);
					}
					return;
				}
				
				// we ignore these not to bug users with pop-ups
				if(sender.nick == 'AUTH' || sender.nick == '*' || dest == '*'){ // connect notices
					return;
				}// *** You are connected to bramka2.pirc.pl with TLSv1.2-AES128-GCM-SHA256-128bits
				if(text.match(/^\*\*\* You are connected to .+ with .+$/)){
					return;
				}
				$$.displayDialog('notice', sender.nick, language.privateNoticeFromServer + he(sender.nick) + language.to + he(dest), message, false, attrs);
			}
			return;
		}
		console.error('Unhandled message from '+sender.nick+' to '+dest+'!');
	},
	'updateHistory': function(){
		for(var i=0; i<gateway.channels.length; i++){
			var chan = gateway.channels[i];
			updateHistory(chan.name, chan.id);
		}
		for(var i=0; i<gateway.queries.length; i++){
			var query = gateway.queries[i];
			updateHistory(query.name, query.id);
		}
	},
	'labelNotProcessed': function(label, msg, batch){ // we sent a @label-ed command but no handler processed the label
		if(label in gateway.labelCallbacks){
			gateway.labelCallbacks[label](label, msg, batch);
		} else {
			console.log('No handler for labeled-response', label, msg, batch);
		}
	},
	'msgNotDelivered': function(label, msg){ // called for unexpected replies when waiting for echo-message
		if(!('echo-message' in activeCaps))
			return;
		var sel = $('[data-label="'+label+'"]');
		sel.addClass('msgDeliveryFailed');
		sel.prop('title', language.messageNotDelivered);
	},
	'isHistoryBatch': function(tags){
		return gateway.findBatchOfType(tags, 'chathistory');
	},
	'historyBatchActive': function(chan){ // active at all, that is not related to any message
		for(name in gateway.batch){
			if(gateway.batch[name].type == 'chathistory' && gateway.batch[name].args[0].toLowerCase() == chan.toLowerCase()){
				return gateway.batch[name];
			}
		}
		return false;
	}/*,
	'endOfJoinHistory': function(batch, msg){
		console.log('endOfJoinHistory called', batch);
		var channel = gateway.findChannel(batch.args[0]);
		if(!channel) return;
	//	if(!channel.modes['H'])
	//		return;
	//	var hcount = parseInt(channel.modes['H'].split(':')[0]);
	//	if(hcount > 15){
			var html = '<div class="getHistoryButton"><a href="javascript:void(0)" onclick="gateway.getMoreHistory(\'' + channel.name + '\')">' + language.getMoreHistory + '</a></div>';
			channel.appendMessage('%s', [html]);
	//	}			
	},
	'getMoreHistory': function(channel){
		ircCommand.channelHistory(channel);
		var chan = gateway.findChannel(channel);
		var selector = '#' + chan.id + ' .getHistoryButton';
		$(selector).remove();
	}*/,
	'findBatchOfType': function(tags, type){
		if(!tags || !('batch' in tags))
			return null;
		var batch = gateway.batch[tags.batch];
		if(!batch)
			return null;
		if(batch.type == type)
			return batch;
		for(var i=0; i<batch.parents.length; i++){
			if(batch.parents[i].type == type)
				return batch.parents[i];
		}
		return null;
	},
	'processIncomingTags': function(ircmsg){
		if('time' in ircmsg.tags){
			ircmsg.time = parseISOString(ircmsg.tags['time']);
		}
		if('account' in ircmsg.tags){
			ircmsg.user.setAccount(ircmsg.tags['account']);
		}
		if('inspircd.org/bot' in ircmsg.tags){
			ircmsg.user.setBot(true);
		}
		if(('+typing' in ircmsg.tags || '+draft/typing' in ircmsg.tags) && ircmsg.command == 'TAGMSG'){
			if('+draft/typing' in ircmsg.tags)
				var typing = ircmsg.tags['+draft/typing'];
			if('+typing' in ircmsg.tags)
				var typing = ircmsg.tags['+typing'];
			gateway.typing(ircmsg.user, ircmsg.args[0], typing);
		}
	},
	'typing': function(user, dest, mode){
		if(dest.charAt(0) == '#'){
			var tab = gateway.find(dest);
		} else {
			var tab = gateway.find(user.nick);
		}
		if(!tab)
			return;
		switch(mode){
			case 'active':
				tab.typing.start(user, 6);
				break;
			case 'paused':
				tab.typing.start(user, 30);
				break;
			case 'done':
				tab.typing.stop(user);
				break;
		}
	},
	'changeCapSupport': function(cap, enable){
		if(enable){
			if(cap in supportedCaps){
				return;
			}
			supportedCaps.push(cap);
			if(cap in serverCaps){
				ircCommand.performQuick('CAP', ['REQ'], [cap]);
			}
		} else {
			console.log('Removing cap', cap);
			var index = supportedCaps.indexOf(cap);
			if(index >= 0){
				supportedCaps.splice(index, 1);
			}
			if(cap in activeCaps){
				ircCommand.performQuick('CAP', ['REQ'], ['-'+cap]);
				delete activeCaps[cap];
			}
		}
	},
	'hideMessageWithLabel': function(label){
		gateway.labelsToHide.push(label);
	}
}

var insertBinding = function(list, item, handler){
	if(list[item]){
		list[item].push(handler);
	} else {
		list[item] = [ handler ];
	}
}

