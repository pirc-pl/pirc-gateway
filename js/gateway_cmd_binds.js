var cmdBinds = {
	'001': [	// RPL_WELCOME 
		function(msg) {
			try {
				var ckNick = localStorage.getItem('origNick');
				if(!ckNick){
					localStorage.setItem('origNick', guser.nick);
				}
			} catch(e){
			}
			
			if(msg.args[0] != guser.nick) {
				guser.nick = msg.args[0];
				$$.displayDialog('warning', 'warning', 'Ostrzeżenie', '<p>Twój bieżący nick to <b>'+guser.nick+'</b>.</p>');
			}
			gateway.statusWindow.appendMessage(messagePatterns.motd, [gateway.niceTime(), he(msg.text)]);
			gateway.pingcnt = 0;
			gateway.connectStatus = status001;
		}
	],
	'411': [ //	ERR_NORECIPIENT - brzydki sposób na uzyskanie bieżącego nicka
		function(msg) {
			if(gateway.connectStatus != statusDisconnected){
				return;
			}
			if(guser.nick == ''){
				guser.nick = msg.args[0];
			} else if(msg.args[0] != guser.nick) {
				var oldNick = guser.nick;
				setTimeout(function(){
					gateway.send('NICK '+oldNick);
				}, 500);
				guser.changeNick(msg.args[0], true);
			}
			gateway.send('WHOIS '+guser.nick);
			gateway.connectStatus = status001;
		}
	],
	'PONG': [
		function(msg) {
			if(msg.text.match(/JavaScript/i)){
				gateway.pingcnt = 0;
			}
		}
	],
	'NICK': [
		function(msg) {
			if(msg.sender.nick == guser.nick) {
				guser.changeNick(msg.text);
				document.title = he(msg.text)+' @ PIRC.pl';
				for(c in gateway.channels) {
					gateway.channels[c].nicklist.changeNick(msg.sender.nick, msg.text);
				}
			} else {
				for(c in gateway.channels) {
					if(gateway.channels[c].nicklist.findNick(msg.sender.nick)) {
						gateway.channels[c].nicklist.changeNick(msg.sender.nick, msg.text);
						gateway.channels[c].appendMessage(messagePatterns.nickChange, [gateway.niceTime(), he(msg.sender.nick), he(msg.text)]);
					}
				}
				if(gateway.findQuery(msg.sender.nick)) {
					gateway.findQuery(msg.sender.nick).changeNick(msg.text);
				}
			}
		}
	],
	'QUIT': [
		function(msg) {
			if(msg.sender.nick == guser.nick) {
				for(c in gateway.channels) {
					gateway.channels[c].part();
					//gateway.channels[c].appendMessage(messagePatterns.nickChange, [gateway.niceTime(), msg.sender.nick, msg.text]);
				}
			} else {
				for(c in gateway.channels) {
					if(gateway.channels[c].nicklist.findNick(msg.sender.nick)) {
						gateway.channels[c].nicklist.removeNick(msg.sender.nick);
						if (!$('#showPartQuit').is(':checked')) {
							gateway.channels[c].appendMessage(messagePatterns.quit, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						}
					}
				}
				if(gateway.findQuery(msg.sender.nick)) {
					if (!$('#showPartQuit').is(':checked')) {
						gateway.findQuery(msg.sender.nick).appendMessage(messagePatterns.quit, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
					}
				}
			}
		}
	],
	'PRIVMSG': [
		function(msg) {
			if (msg.text === false) {
				msg.text = " ";
			}
			
			var html = $$.parseImages(msg.text);
			
			if(msg.args[0].indexOf('#') == 0) { // wiadomość kanałowa
				if(gateway.ignoring(msg.sender.nick, 'channel')){
					console.log('Ignoring message on '+msg.args[0]+' by '+msg.sender.nick);
					return;
				}
				var channel = gateway.findChannel(msg.args[0]);
				if(!channel) {
					channel = new Channel(msg.args[0]);
					gateway.channels.push(channel);
					gateway.switchTab(msg.args[0]);
				}
				if(msg.text.match(/^\001.*\001$/i)) { //CTCP
					if(msg.text.match(/^\001ACTION.*\001$/i)) {
						var acttext = msg.text.replace(/^\001ACTION(.*)\001$/i, '$1');
						if(msg.text.indexOf(guser.nick) != -1) {
							channel.appendMessage(messagePatterns.channelActionHilight, [gateway.niceTime(), msg.sender.nick, $$.colorize(acttext)]);
							if(gateway.active.toLowerCase() != msg.args[0].toLowerCase() || !disp.focused) {
								channel.markNew();
							}
						} else {
							channel.appendMessage(messagePatterns.channelAction, [gateway.niceTime(), msg.sender.nick, $$.colorize(acttext)]);
							if(gateway.active.toLowerCase() != msg.args[0].toLowerCase() || !disp.focused) {
								channel.markBold();
							}
						}
					}
					return;
				}
				if(msg.text.indexOf(guser.nick) != -1) { //hajlajt
					channel.appendMessage(messagePatterns.channelMsgHilight, [gateway.niceTime(), msg.sender.nick, $$.colorize(msg.text)]);
					if(gateway.active != msg.args[0].toLowerCase() || !disp.focused) {
						channel.markNew();
					}
				} else { //bez hajlajtu
					channel.appendMessage(messagePatterns.channelMsg, [gateway.niceTime(), $$.nickColor(msg.sender.nick), msg.sender.nick, $$.colorize(msg.text)]);
					if(gateway.active.toLowerCase() != msg.args[0].toLowerCase() || !disp.focused) {
						channel.markBold();
					}
				}
				channel.appendMessage('%s', [html]);
			} else if(!msg.sender.server/* && msg.sender.nick != guser.nick*/){ // wiadomość prywatna
				if(msg.sender.nick == guser.nick){
					var qnick = msg.args[0];
				} else {
					var qnick = msg.sender.nick;
				}
				if(gateway.ignoring(qnick, 'query')){
					console.log('Ignoring private message by '+msg.sender.nick);
					return;
				}
				query = gateway.findQuery(qnick);
				if(msg.text.match(/^\001.*\001$/i)) {	// ctcp
					if(msg.text.match(/^\001ACTION.*\001$/i)) { //akcja
						if(!query) {
							query = new Query(msg.sender.nick);
							gateway.queries.push(query);
						}
						var acttext = msg.text.replace(/^\001ACTION(.*)\001$/i, '$1');
						query.appendMessage(messagePatterns.channelAction, [gateway.niceTime(), msg.sender.nick, $$.colorize(acttext)]);
						if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase()) {
							gateway.findQuery(msg.sender.nick).markNew();
						}
						query.appendMessage('%s', [html]);
					} else if(msg.text.match(/^\001(VERSION|USERINFO).*\001$/i)) {
						version_string = 'Bramka WWW PIRC.PL, wersja '+gatewayVersion+' na '+navigator.userAgent;
						gateway.sendDelayed('NOTICE '+msg.sender.nick+ ' \001VERSION '+version_string+'\x01');
					} else if(msg.text.match(/^\001REFERER\001$/i)) {
						referer_string = document.referrer;
						if(referer_string == ''){
							referer_string = 'Nieznany';
						}
						gateway.sendDelayed('NOTICE '+msg.sender.nick+ ' \001REFERER '+referer_string+'\x01');
					} else {	// inny ctcp
						var acttext = msg.text.replace(/^\001(.*)\001$/i, '$1');
						if(query) {
							query.appendMessage(messagePatterns.ctcpRequest, [gateway.niceTime(), msg.sender.nick, $$.colorize(acttext)]);
						} else {
							gateway.statusWindow.appendMessage(messagePatterns.ctcpRequest, [gateway.niceTime(), msg.sender.nick, $$.colorize(acttext)]);
							gateway.statusWindow.markBold();
						}
					}
					return;
				} // normalna wiadomość
				if(!query) {
					query = new Query(msg.sender.nick);
					gateway.queries.push(query);
				}
				query.appendMessage(messagePatterns.channelMsg, [gateway.niceTime(), '', msg.sender.nick, $$.colorize(msg.text)]);
				if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase() || !disp.focused) {
					gateway.findQuery(msg.sender.nick).markNew();
				}
				query.appendMessage('%s', [html]);
			}
		}
	],
	'NOTICE': [
		function(msg) {
			if (msg.text == false) {
				msg.text = " ";
			}
			if(msg.text.match(/^\001.*\001$/i)) { // ctcp
				if(gateway.ignoring(msg.sender.nick, 'query')){
					console.log('Ignoring CTCP reply by '+msg.sender.nick);
					return;
				}
				var ctcpreg = msg.text.match(/^\001(([^ ]+)( (.*))?)\001$/i);
				var acttext = ctcpreg[1];
				var ctcp = ctcpreg[2];
				var text = ctcpreg[4];
				if(gateway.findQuery(msg.sender.nick)) {
					gateway.findQuery(msg.sender.nick).appendMessage(messagePatterns.ctcpReply, [gateway.niceTime(), he(msg.sender.nick), $$.colorize(acttext)]);
				} else {
					gateway.statusWindow.appendMessage(messagePatterns.ctcpReply, [gateway.niceTime(), he(msg.sender.nick), $$.colorize(acttext)]);
				}
				if(ctcp.toLowerCase() == 'version'){
					$$.displayDialog('whois', msg.sender.nick, 'Informacje o użytkowniku '+he(msg.sender.nick), 'Oprogramowanie użytkownika <b>'+msg.sender.nick+'</b>:<br>'+he(text));
				}
			} else { // nie-ctcp
				if(msg.args[0].indexOf('#') == 0) { //kanał
					if(gateway.ignoring(msg.sender.nick, 'channel')){
						console.log('Ignoring notice on '+msg.args[0]+' by '+msg.sender.nick);
						return;
					}
					if(gateway.findChannel(msg.args[0])) {
						if(msg.text.indexOf(guser.nick) != -1) {
							gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.notice, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
							if(gateway.active != msg.args[0]) {
								gateway.findChannel(msg.args[0]).markBold();
							}
						} else {
							gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.notice, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						}
					}
				} else if(!msg.sender.server && msg.sender.nick != guser.nick) { // użytkownik
					if(gateway.ignoring(msg.sender.nick, 'query')){
						console.log('Ignoring notice by '+msg.sender.nick);
						return;
					}
					if(msg.sender.nick.toLowerCase() == 'nickserv'){
						if(services.nickservMessage(msg)) {
							return;
						}
					}
					var query = gateway.findQuery(msg.sender.nick);
					var displayAsQuery = Boolean(query);
					if(displayAsQuery || $("#noticeDisplay").val() == 1){ // notice jako query
						if(!query) {
							query = new Query(msg.sender.nick);
							gateway.queries.push(query);
						}
						query.appendMessage(messagePatterns.notice, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase()) {
							query.markNew();
						}
					} else if ($("#noticeDisplay").val() == 2) { // notice w statusie
						gateway.statusWindow.appendMessage(messagePatterns.notice, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						gateway.statusWindow.markBold();
					} else if($("#noticeDisplay").val() == 0) { // notice jako okienko
						if(msg.sender.nick.isInList(servicesNicks)){
							var html = '<span class="notice-nick">&lt;<b>'+msg.sender.nick+'</b>&gt</span> '+$$.colorize(msg.text);
							$$.displayDialog('notice', 'service', 'Komunikat od usługi sieciowej', html);
						} else {
							$$.displayDialog('notice', msg.sender.nick, 'Komunikat prywatny od '+msg.sender.nick, $$.colorize(msg.text));
						}
					}
				} else if(msg.sender.server){
					var expressions = [/^Your "real name" is now set to be/, / invited [^ ]+ into the channel.$/];
					for(var i=0; i<expressions.length; i++){
						if(msg.text.match(expressions[i])){
							return;
						}
					}
				//	if(msg.args[0] == guser.nick){
				//		gateway.statusWindow.appendMessage(messagePatterns.serverNotice, [gateway.niceTime(), he(msg.sender.nick), $$.colorize(msg.text)]);
				//	} else {
						var expr = /^\[Knock\] by ([^ !]+)![^ ]+ \(([^)]+)\)$/;
						var match = expr.exec(msg.text);
						if(match){
							gateway.knocking(msg.args[0].substring(msg.args[0].indexOf('#')), match[1], match[2]);
							return;
						}
						expr = /^Knocked on (.*)$/;
						var match = expr.exec(msg.text);
						if(match){
							var chan = gateway.findChannel(match[1]);
							if(chan){
								chan.appendMessage(messagePatterns.knocked, [gateway.niceTime(), match[1]]);
							} else {
								gateway.statusWindow.appendMessage(messagePatterns.knocked, [gateway.niceTime(), match[1]]);
							}
							return;
						}
						if(msg.args[0] == 'AUTH' || msg.args[0] == '*'){
							return;
						}// *** You are connected to bramka2.pirc.pl with TLSv1.2-AES128-GCM-SHA256-128bits
						if(msg.text.match(/^\*\*\* You are connected to .+ with .+$/)){
							return;
						}
						$$.displayDialog('notice', msg.sender.nick, 'Komunikat prywatny od serwera '+he(msg.sender.nick)+' do '+he(msg.args[0]), $$.colorize(msg.text));
				//	}
				}
			}
		}
	],
	'JOIN': [
		function(msg) {
			if(msg.sender.nick == guser.nick) {
				if(gateway.findChannel(msg.text)) {
					gateway.findChannel(msg.text).rejoin();
				} else {
					var chan = new Channel(msg.text);
					gateway.channels.push(chan);
					gateway.switchTab(msg.text);
					chan.appendMessage(messagePatterns.joinOwn, [gateway.niceTime(), msg.text]);
				}
				gateway.send("MODE "+msg.text+"\r\nWHO "+msg.text);
			}
		},
		function(msg) {
			if(gateway.findChannel(msg.text)) {
				if(msg.sender.nick != guser.nick) {
					if (!$('#showPartQuit').is(':checked')) {
						gateway.findChannel(msg.text).appendMessage(messagePatterns.join, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), msg.text]);
					}
				}
				if(!gateway.findChannel(msg.text).nicklist.findNick(msg.sender.nick)) {
					gateway.findChannel(msg.text).nicklist.addNick(msg.sender.nick);
				} else {
					gateway.findChannel(msg.text).nicklist.findNick(msg.sender.nick).setMode('owner', false);
					gateway.findChannel(msg.text).nicklist.findNick(msg.sender.nick).setMode('admin', false);
					gateway.findChannel(msg.text).nicklist.findNick(msg.sender.nick).setMode('op', false);
					gateway.findChannel(msg.text).nicklist.findNick(msg.sender.nick).setMode('halfop', false);
					gateway.findChannel(msg.text).nicklist.findNick(msg.sender.nick).setMode('voice', false);
				}
			}
		}
	],
	'PART': [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.sender.nick != guser.nick) {
					if (!$('#showPartQuit').is(':checked')) {
						gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.part, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), msg.args[0], $$.colorize(msg.text)]);
					}
					gateway.findChannel(msg.args[0]).nicklist.removeNick(msg.sender.nick);
				} else {
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.partOwn, [gateway.niceTime(), msg.args[0], msg.args[0]]);
					gateway.findChannel(msg.args[0]).part();
				}
			}
		}
	],
	'KICK': [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.args[1] != guser.nick) {
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.kick, [gateway.niceTime(), he(msg.sender.nick), msg.args[1], msg.args[0], $$.colorize(msg.text)]);
					gateway.findChannel(msg.args[0]).nicklist.removeNick(msg.args[1]);
				} else {
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.kickOwn, [gateway.niceTime(), he(msg.sender.nick), msg.args[0], $$.colorize(msg.text)]);
					gateway.findChannel(msg.args[0]).part();
				}
			}
		}
	],
	'307': [	// RPL_WHOISREGNICK 
		function(msg) { //	'displayDialog': function(type, sender, title, message, button){
			$$.displayDialog('whois', msg.args[1], false, '<p class="whois"><span class="info"><br /></span><span class="data">Ten nick jest zarejestrowany</span></p>');
		}
	],
	'311': [	// RPL_WHOISUSER 
		function(msg) {
			var html = "<p class='whois'><span class='info'>Pełna maska:</span><span class='data'> " + he(msg.args[1]) + "!" + msg.args[2] + "@" + msg.args[3] + "</span></p>" +
				"<p class='whois'><span class='info'>Realname:</span><span class='data'> " + he(msg.text) + "</span></p>";
			$$.displayDialog('whois', msg.args[1], 'Informacje o użytkowniku '+he(msg.args[1]), html);
		}
	],
	'301': [	// RPL_AWAY
		function(msg) {
			var query = gateway.findQuery(msg.args[1]);
			if(query){
				query.appendMessage(messagePatterns.away, [gateway.niceTime(), he(msg.args[1]), he(msg.text)]);
			} else {
				$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>Nieobecny:</span><span class='data'>" + he(msg.args[1]) + " jest nieobecny(a): " + he(msg.text) + "</span></p>");
			}
		}
	],
	'312': [	// RPL_WHOISSERVER 
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>serwer:</span><span class='data'>" + msg.args[2] + " "+ he(msg.text) + "</span></p>");
		}
	],
	'313': [	// RPL_WHOISOPERATOR
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data'><b class=admin>ADMINISTRATOR SIECI</b> (" + he(msg.text.substr(5)) +")</span></p>");
		}
	],
	'317': [	// RPL_WHOISIDLE 
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>Połączył się:</span><span class='data'>" + $$.parseTime(msg.args[3]) + "</span></p>");
			var idle = msg.args[2];
			var hour = Math.floor(idle/3600);
			idle = idle - hour * 3600;
			var min = Math.floor(idle/60);
			var sec = idle - min * 60;   		
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>Nieaktywny</span><span class='data'>" + (hour>0? hour + " h " : "") + (min>0? min + " min " : "") + sec + " sek</span></p>");
		}
	],
	'318': [	// RPL_ENDOFWHOIS
		function(msg) {
			gateway.displayOwnWhois = false;
		}
	],
	'319': [	// RPL_WHOISCHANNELS
		function(msg) {
			if(gateway.connectStatus == statusConnected){ // normalny whois
				var chanlist = msg.text.split(' ');
				var chanHtml = '';
				chanlist.forEach(function(channel){
					var chanPrefix = '';
					var chanName = channel;
					if(chanName.charAt(0) != '#'){
						chanPrefix = chanName.charAt(0);
						chanName = chanName.substring(1);
					}
					chanName = he(chanName);
					chanHtml += chanPrefix + '<a href="javascript:gateway.send(\'JOIN ' + chanName + '\')" title="Dołącz do kanału ' + chanName + '">' + chanName + '</a> ';
				});
				$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>Kanały:</span><span class='data'> "+ chanHtml + "</span></p>");
			} else {	// sprawdzam, na jakich kanałach sam jestem
				gateway.connectStatus = status001;
				if(msg.args[1] == guser.nick){
					var chans = msg.text.split(' ');
					chans.forEach( function(channame){
						var channel = channame.match(/#[^ ]*/);
						if(channel){
							if(gateway.findChannel(channel[0])) {
								gateway.findChannel(channel[0]).rejoin();
							} else {
								var chan = new Channel(channel[0]);
								gateway.channels.push(chan);
								gateway.switchTab(channel[0]);
							}
							gateway.send('NAMES '+channel[0]+'\r\nTOPIC '+channel[0]+'\r\nMODE '+channel[0]+'\r\nWHO '+channel[0]);
						}
					});
				}
			}
		}
	],
	'322': [	// RPL_LIST
		function(msg) {
			if (!msg.text) {
				var outtext = "<i>(brak tematu)</i>"; // Na wypadek jakby topic nie był ustawiony.
			} else {
				var outtext = $$.colorize(msg.text);
			}
			gateway.statusWindow.appendMessage(messagePatterns.chanListElement, [gateway.niceTime(), msg.args[1], msg.args[1], msg.args[2], outtext]);
			gateway.statusWindow.markBold();
		}
	],
	'324': [	// RPL_CHANNELMODEIS
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				var chan = msg.args[1];
				var mody = msg.args;
				mody.splice(0,2);
				mody = mody.join(" ");
				var chanO = gateway.findChannel(chan);
				chanO.appendMessage(messagePatterns.mode, [gateway.niceTime(), chan, mody]);
				gateway.parseChannelMode(msg.args, chanO);
				gateway.send('CAP REQ :multi-prefix userhost-in-names away-notify\r\nCAP END');//\r\nNAMES '+chan);
				try {
					var ckNick = localStorage.getItem('origNick');
  				 	if(ckNick){
						gateway.send('SETNAME Użytkownik bramki PIRC.pl "' + ckNick + '"');
					}
				} catch(e) {}
			}
		}
	],
	'352': [	// RPL_WHOREPLY
		function(msg) {
			var channel = gateway.findChannel(msg.args[1]);
			if(!channel){
				return;
			}
			var nickListItem = channel.nicklist.findNick(msg.args[5]);
			if(!nickListItem){
				return;
			}
			nickListItem.setIdent(msg.args[2]);
			nickListItem.setUserHost(msg.args[3]);
			nickListItem.setRealname(msg.text.substr(msg.text.indexOf(' ') + 1));
			if(msg.args[6].charAt(0) == 'G'){
				nickListItem.setAway(true);
			} else {
				nickListItem.setAway(false);
			}
			if(msg.args[6].indexOf('*') > -1){
				nickListItem.setIrcOp();
			}
			if(msg.args[6].indexOf('B') > -1){
				nickListItem.setBot(true);
			} else {
				nickListItem.setBot(false);
			}
		}
	],
	'AWAY': [
		function(msg) {
			if(msg.text == ''){
				var away = false;
			} else {
				var away = true;
				var reason = msg.text;
			}
			gateway.channels.forEach(function(channel){
				var nickListItem = channel.nicklist.findNick(msg.sender.nick);
				if(nickListItem){
					nickListItem.setAway(away);
					if(away){
						nickListItem.setAwayReason(reason);
					}
				}
			});
		}
	],
	'305': [	// RPL_UNAWAY 
		function(msg) {
			gateway.channels.forEach(function(channel){
				var nickListItem = channel.nicklist.findNick(guser.nick);
				nickListItem.setAway(false);
			});
			gateway.statusWindow.appendMessage(messagePatterns.yourAwayDisabled, [gateway.niceTime()]);
			gateway.statusWindow.markBold();
		}
	],
	'306': [	// RPL_NOWAWAY
		function(msg) {
			gateway.channels.forEach(function(channel){
				var nickListItem = channel.nicklist.findNick(guser.nick);
				nickListItem.setAway(true);
			});
			gateway.statusWindow.appendMessage(messagePatterns.yourAwayEnabled, [gateway.niceTime()]);
			gateway.statusWindow.markBold();
		}
	],
	'353': [	// RPL_NAMREPLY 
		function(msg) {
			var regexp = /^(~)?(&)?(@)?(%)?(\+)?([^~&@%+!]*)(?:!([^@]*)@(.*))?$/
			gateway.iKnowIAmConnected();
			var channel = gateway.findChannel(msg.args[2]);
			if(!channel){
				return;
			}
			var names = msg.text.split(' ');
			for ( name in names ) {
				var rmatch = regexp.exec(names[name]);
				channel.nicklist.addNick(rmatch[6]);
				var nickListItem = channel.nicklist.findNick(rmatch[6]);
				if(rmatch[7]){
					nickListItem.setIdent(rmatch[7]);
				}
				if(rmatch[8]){
					nickListItem.setUserHost(rmatch[8]);
				}
				for(var i=0; i<5; i++){
					if(rmatch[i+1]){
						var mode = '';
						switch(rmatch[i+1]){
							case '~': mode = 'owner'; break;
							case '&': mode = 'admin'; break;
							case '@': mode = 'op'; break;
							case '%': mode = 'halfop'; break;
							case '+': mode = 'voice'; break;
						}
						nickListItem.setMode(mode, true);
					}
				}
			}
		}
	],
	'332': [	// RPL_TOPIC 
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				if(msg.text) {
					gateway.findChannel(msg.args[1]).setTopic(msg.text);
					gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.topic, [gateway.niceTime(), msg.args[1], $$.colorize(msg.text)]);
				} else {
					gateway.findChannel(msg.args[1]).setTopic('');
					gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.topicNotSet, [gateway.niceTime(), msg.args[1]]);
				}
			}
		}
	],
	'333': [	// RPL_TOPICWHOTIME 
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.topicTime, [gateway.niceTime(), msg.args[2], $$.parseTime(msg.args[3])]);
			}
		}
	],
	'348': [	// RPL_EXCEPTLIST
		function(msg) {
			disp.insertLinebeI('e', msg.args);
		}
	],
	'349': [	// RPL_ENDOFEXCEPTLIST 
		function(msg) {
			disp.endListbeI('e', msg.args[1]);
		}
	],
	'346': [	// RPL_INVITELIST
		function(msg) {
			disp.insertLinebeI('I', msg.args);
		}
	],
	'347': [	// RPL_INVITELISTEND
		function(msg) {
			disp.endListbeI('I', msg.args[1]);
		}			
	],
	'367': [	// RPL_BANLIST 
		function(msg) {
			disp.insertLinebeI('b', msg.args);
		}
	],
	'368': [	// RPL_ENDOFBANLIST
		function(msg) {
			disp.endListbeI('b', msg.args[1]);
		}			
	],
	'372': [	// RPL_MOTD
		function(msg) {
			gateway.statusWindow.appendMessage(messagePatterns.motd, [gateway.niceTime(), msg.text]);
		}
	],
	'376': [	// RPL_ENDOFMOTD
		function(msg) {
			gateway.joinChannels()
		}
	],
	'INVITE': [
		function(msg) {
			var html = '<b>'+he(msg.sender.nick)+'</b> zaprasza Cię na kanał <b>'+he(msg.text);
			var button = [ {
				text: 'Wejdź',
				click: function(){
					gateway.send('JOIN '+msg.text);
					$(this).dialog('close');
				}
			}, {
				text: 'Zignoruj',
				click: function(){
					$(this).dialog('close');
				}
			} ];
			$$.displayDialog('invite', msg.sender.nick+msg.text, 'Zaproszenie', html, button);
		}
	],
	'341': [	// RPL_INVITING
		function(msg) {
			var chan = gateway.findChannel(msg.args[2]);
			if(chan){
				chan.appendMessage(messagePatterns.yourInvite, [gateway.niceTime(), he(msg.args[1]), he(msg.args[2])]);
			} else {
				gateway.statusWindow.appendMessage(messagePatterns.yourInvite, [gateway.niceTime(), he(msg.args[1]), he(msg.args[2])]);
			}
		}
	],
	'401': [	// ERR_NOSUCHNICK
		function(msg) {
			$$.displayDialog('error', 'error', 'Błąd', 'Nie można wykonać żądanej akcji: nie ma takiego nicku ani kanału.');
			gateway.statusWindow.appendMessage(messagePatterns.noSuchNick, [gateway.niceTime(), he(msg.args[1])]);
		}
	],
	'403': [	// ERR_NOSUCHCHANNEL 
		function(msg) {
			$$.displayDialog('error', 'error', 'Błąd', 'Nie można wykonać żądanej akcji: nie ma takiego kanału.');
			gateway.statusWindow.appendMessage(messagePatterns.noSuchChannel, [gateway.niceTime(), he(msg.args[1])]);
		}
	],
	'404': [	// ERR_CANNOTSENDTOCHAN
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				var reason = '';
				if(msg.text.match(/Cannot send to channel \(Newly connected users have to wait before they can send any links\)/)){
					reason = 'Twoja wiadomość została rozpoznana jako link. Musisz odczekać kilka minut po połączeniu i spróbować ponownie. Zarejestruj nick, aby uniknąć tego ograniczenia w przyszłości';
				} else if(msg.text.match(/You need voice \(\+v\) \(.*\)/)){
					reason = 'Potrzebujesz prawa głosu, aby teraz pisać na tym kanale';
				} else if(msg.text.match(/You are banned \(.*\)/)){
					reason = 'Jesteś zbanowany';
				} else if(msg.text.match(/Color is not permitted in this channel \(.*\)/)){
					reason = 'Wiadomości zawierające kolory są zabronione na tym kanale';
				} else if(msg.text.match(/No external channel messages \(.*\)/)){
					reason = 'Musisz być na tym kanale, aby móc pisać';
				} else {
					reason = msg.text;
				}
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.cannotSendToChan, [gateway.niceTime(), msg.args[1], reason])
			}
		}
	],
	'432' : [	// ERR_ERRONEUSNICKNAME 
		function(msg) {
			if(gateway.connectStatus == statusDisconnected){
				gateway.send('NICK PIRC-'+Math.round(Math.random()*100));
			}
			var html = 'Nick <b>'+he(msg.args[1])+'</b> jest niedostępny. Spróbuj poczekać kilka minut.';
			if(gateway.connectStatus != statusDisconnected){
				html += "<br>Twój bieżący nick to <b>"+guser.nick+"</b>.";
			}
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html);
			gateway.statusWindow.appendMessage(messagePatterns.badNick, [gateway.niceTime(), msg.args[1]]);
		}
	],
	'433' : [	// ERR_NICKNAMEINUSE 
		function(msg) {
			if(gateway.connectStatus == statusDisconnected){
				gateway.send('NICK '+guser.nick+Math.floor(Math.random() * 9999));
			}
			var html = '<p>Nick <b>'+he(msg.args[1])+'</b> jest już używany przez kogoś innego.</p>';
			gateway.nickWasInUse = true;
			if(gateway.connectStatus != statusDisconnected){
				html += "<p>Twój bieżący nick to <b>"+guser.nick+".</p>";
			}
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html);
			gateway.statusWindow.appendMessage(messagePatterns.nickInUse, [gateway.niceTime(), msg.args[1]]);
		}
	],
	'447' : [	// ERR_NONICKCHANGE 
		function(msg) {
			var html = "Nie można zmienić nicka.<br>Komunikat od serwera: " + he(msg.text);
			$$.displayDialog('error', 'error', 'Błąd', html);
			gateway.statusWindow.appendMessage(messagePatterns.notOnChannel, [gateway.niceTime(), he(msg.args[1])]);
		}
	],
	'442' : [	// ERR_NOTONCHANNEL
		function(msg) {
			var html = he(msg.args[1])+": nie jesteś na tym kanale.";
			$$.displayDialog('error', 'error', 'Błąd', html);
			gateway.statusWindow.appendMessage(messagePatterns.notOnChannel, [gateway.niceTime(), he(msg.args[1])]);
		}
	],
	'443' : [	// ERR_USERONCHANNEL
		function(msg) {
			var html = he(msg.args[2])+": <b>"+he(msg.args[1])+"</b> jest już na tym kanale.";
			$$.displayDialog('error', 'error', 'Błąd', html);
			gateway.statusWindow.appendMessage(messagePatterns.alreadyOnChannel, [gateway.niceTime(), he(msg.args[2]), he(msg.args[1])]);
		}
	],
	'474' : [	// ERR_BANNEDFROMCHAN
		function(msg) {
			gateway.iKnowIAmConnected(); // TODO inne powody, przez które nie można wejść
			var html =  "Nie można dołączyć do kanału <b>" + msg.args[1] + "</b>";
			if (msg.text == "Cannot join channel (+b)") {
				html += "<br>Jesteś zbanowany.";
				gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Jesteś zbanowany"]);
			}
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'473' : [	// ERR_INVITEONLYCHAN
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = 'Nie można dołączyć do kanału <b>' + he(msg.args[1]) + '</b>' +
				'<br>Musisz dostać zaproszenie aby wejść na ten kanał.';
			var button = [ {
				text: 'Poproś operatorów o możliwość wejścia',
				click: function(){
					gateway.send('KNOCK '+msg.args[1]+' :Proszę o możliwość wejścia na kanał');
					$(this).dialog('close');
				}
			} ];
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Kanał wymaga zaproszenia"]);
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html, button);
		}
	],
	'480' : [	// ERR_CANNOTKNOCK
		function(msg) {
			var html = "Nie można zapukać do kanału.<br>" +
				"Komunikat serwera: "+he(msg.text);
			gateway.statusWindow.appendMessage(messagePatterns.alreadyOnChannel, [gateway.niceTime(), 'Komunikat serwera', he(msg.text)]);
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'489' : [	// ERR_SECUREONLYCHAN 
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "Nie można dołączyć do kanału <b>" + he(msg.args[1]) + "</b>" +
				'<br>Kanał wymaga połączenia z włączonym SSL (tryb +z). Nie jest dostępny z bramki.<br>Możesz spróbować użyć programu HexChat według instrukcji z <a href="http://pirc.pl/teksty/p_instalacja_i_konfiguracja" target="_blank">tej strony</a>.';
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Kanał wymaga połączenia SSL"]);
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'477' : [	// ERR_NEEDREGGEDNICK
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "Nie można dołączyć do kanału <b>" + he(msg.args[1]) + "</b>" +
				'<br>Kanał wymaga, aby Twój nick był zarejestrowany. Zastosuj się do instrukcji otrzymanych od NickServ lub zajrzyj <a href="http://pirc.pl/teksty/p_nickserv" target="_blank">tutaj</a>.';
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Kanał wymaga zarejestrowanego nicka"]);
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'475' : [	// ERR_BADCHANNELKEY
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "Nie można dołączyć do kanału <b>" + msg.args[1] + "</b>" +
				'<br>Musisz podać poprawne hasło.' +
				'<br><form onsubmit="gateway.chanPassword(\''+he(msg.args[1])+'\');$$.closeDialog(\'warning\', \'warning\')" action="javascript:void(0);">' +
				'Hasło do '+he(msg.args[1])+': <input type="password" id="chpass" /> <input type="submit" value="Wejdź" /></form>';
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Wymagane hasło"]);
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html);
		}
	],
	'482' : [	// ERR_CHANOPRIVSNEEDED 
		function(msg) {
			var html = msg.args[1] + ": brak uprawnień." +
				"<br>Nie masz wystarczających uprawnień aby wykonać żądaną akcję.";
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.noPerms, [gateway.niceTime(), msg.args[1]]);
			}
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'499' : [	// ERR_CHANOWNPRIVNEEDED
		function(msg) {
			var html = msg.args[1] + ": brak uprawnień." +
				"<br>Nie masz wystarczających uprawnień aby wykonać żądaną akcję.";
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.noPerms, [gateway.niceTime(), msg.args[1]]);
			}
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'974' : [	// ERR_CHANOPRIVSNEEDED 
		function(msg) {
			gateway.showPermError(msg.text);
			if(gateway.getActive()) {
				gateway.getActive().appendMessage(messagePatterns.noPerms, [gateway.niceTime(), msg.args[1]]);
			}
		}
	],
	'PING' : [
		function(msg) {
			gateway.forceSend('PONG :'+msg.text);
		}
	],
	'ERROR' : [
		function(msg) {
			gateway.lasterror = msg.text;

			gateway.disconnected(msg.text);

			if(gateway.connectStatus == statusDisconnected) {
				if(gateway.firstConnect){
					gateway.reconnect();
				}
				return;
			}
		
			gateway.connectStatus = statusDisconnected;

			if(msg.text.match(/\(NickServ \(RECOVER command used by [^ ]+\)\)$/)){
				$$.displayReconnect();
				var html = "<h2>Błąd ogólny</h2>" +
					"<br>Inna sesja rozłączyła Cię używając polecenia RECOVER. Może masz otwartą więcej niż jedną bramkę?";
				$$.displayDialog('error', 'error', 'Błąd', html);
			} else {

				var html = "<h3>Serwer przerwał połączenie</h3>" +
					"Informacje: "+msg.text+"</p>";
				$$.displayDialog('error', 'error', 'Błąd', html);
				if($('#autoReconnect').is(':checked')){
					gateway.reconnect();
				} else {
					$$.displayReconnect();
				}
			}
		}
	],
	'972' : [	// ERR_CANNOTDOCOMMAND 
		function(msg) {
			gateway.showPermError(msg.text);
			if(gateway.getActive()) {
				gateway.getActive().appendMessage(messagePatterns.noPerms, [gateway.niceTime(), msg.args[1]]);
			}
		}
	],
	'TOPIC':  [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.text) {
					gateway.findChannel(msg.args[0]).setTopic(msg.text);
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.changeTopic, [gateway.niceTime(), he(msg.sender.nick), $$.colorize(msg.text)]);
				} else {
					gateway.findChannel(msg.args[0]).setTopic('');
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.deleteTopic, [gateway.niceTime(), he(msg.sender.nick), msg.args[0]]);
				}

			}
		}
	],
	'MODE': [
		function(msg) {;
			if(gateway.findChannel(msg.args[0])) {
				var modestr = '';
				for (i in msg.args) {
					if(i != 0) {
						modestr += msg.args[i]+' ';
					}
				}
				modestr = modestr.slice(0,-1);
				var chan = gateway.findChannel(msg.args[0]);
				chan.appendMessage(messagePatterns.modeChange, [gateway.niceTime(), he(msg.sender.nick), he(modestr), he(msg.args[0])]);
				var args2 = msg.args;
				args2.shift();
				gateway.parseChannelMode(args2, chan);
			}
		}
	]
};
