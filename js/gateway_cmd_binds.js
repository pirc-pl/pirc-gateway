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
				irc.lastNick = guser.nick;
				guser.nick = msg.args[0];
				$$.displayDialog('warning', 'warning', 'Ostrzeżenie', '<p>Twój bieżący nick to <b>'+guser.nick+'</b>.</p>');
			}
			gateway.statusWindow.appendMessage(messagePatterns.motd, [$$.niceTime(), he(msg.text)]);
			gateway.pingcnt = 0;
			if(!gateway.sasl) gateway.connectStatus = status001;
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
						gateway.channels[c].appendMessage(messagePatterns.nickChange, [$$.niceTime(), he(msg.sender.nick), he(msg.text)]);
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
					//gateway.channels[c].appendMessage(messagePatterns.nickChange, [$$.niceTime(), msg.sender.nick, msg.text]);
				}
			} else {
				gateway.processQuit(msg);
			}
		}
	],
	'PRIVMSG': [
		function(msg) {
			if (msg.text === false) {
				msg.text = " ";
			}
			
			if(msg.args[0].indexOf('#') == 0) { // wiadomość kanałowa
				if(ignore.ignoring(msg.sender.nick, 'channel')){
					console.log('Ignoring message on '+msg.args[0]+' by '+msg.sender.nick);
					return;
				}
			} else { //prywatna
				if(ignore.ignoring(msg.sender.nick, 'query')){
					console.log('Ignoring private message by '+msg.sender.nick);
					return;
				}
			}
			
			var html = $$.parseImages(msg.text);
			
			if(msg.text.match(/^\001.*\001$/i)) { //CTCP
				var space = msg.text.indexOf(' ');
				if(space > -1){
					var ctcp = msg.text.substring(1, space);
					msg.ctcptext = msg.text.substring(space+1, msg.text.length-1);
				} else {
					var ctcp = msg.text.slice(1, -1);
					msg.ctcptext = '';
				}
				if(ctcp in ctcpBinds){
					for(func in ctcpBinds[ctcp]){
						ctcpBinds[ctcp][func](msg);
					}
				} else {
					var query = gateway.findQuery(qnick);
					var acttext = msg.text.replace(/^\001(.*)\001$/i, '$1');
					if(query) {
						query.appendMessage(messagePatterns.ctcpRequest, [$$.niceTime(), msg.sender.nick, $$.colorize(acttext)]);
					} else {
						gateway.statusWindow.appendMessage(messagePatterns.ctcpRequest, [$$.niceTime(), msg.sender.nick, $$.colorize(acttext)]);
						gateway.statusWindow.markBold();
					}
				}
				return;
			}
			
			var message = $$.colorize(msg.text);
			
			if(msg.args[0].indexOf('#') == 0) { // wiadomość kanałowa
				if(ignore.ignoring(msg.sender.nick, 'channel')){
					console.log('Ignoring message on '+msg.args[0]+' by '+msg.sender.nick);
					return;
				}
				var channel = gateway.findOrCreate(msg.args[0]);
				if(message.indexOf(guser.nick) != -1) { //hajlajt
					channel.appendMessage(messagePatterns.channelMsgHilight, [$$.niceTime(), msg.sender.nick, message]);
					if(gateway.active != msg.args[0].toLowerCase() || !disp.focused) {
						channel.markNew();
					}
				} else { //bez hajlajtu
					for(f in messageProcessors){
						message = messageProcessors[f](msg.sender.nick, msg.args[0], message);
					}
					channel.appendMessage(messagePatterns.channelMsg, [$$.niceTime(), $$.nickColor(msg.sender.nick), msg.sender.nick, message]);
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
				for(f in messageProcessors){
					message = messageProcessors[f](msg.sender.nick, guser.nick, message);
				}

				query = gateway.findOrCreate(qnick);
				query.appendMessage(messagePatterns.channelMsg, [$$.niceTime(), '', msg.sender.nick, message]);
				if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase() || !disp.focused) {
					query.markNew();
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
				if(ignore.ignoring(msg.sender.nick, 'query')){
					console.log('Ignoring CTCP reply by '+msg.sender.nick);
					return;
				}
				var ctcpreg = msg.text.match(/^\001(([^ ]+)( (.*))?)\001$/i);
				var acttext = ctcpreg[1];
				var ctcp = ctcpreg[2];
				var text = ctcpreg[4];
				if(gateway.findQuery(msg.sender.nick)) {
					gateway.findQuery(msg.sender.nick).appendMessage(messagePatterns.ctcpReply, [$$.niceTime(), he(msg.sender.nick), $$.colorize(acttext)]);
				} else {
					gateway.statusWindow.appendMessage(messagePatterns.ctcpReply, [$$.niceTime(), he(msg.sender.nick), $$.colorize(acttext)]);
				}
				if(ctcp.toLowerCase() == 'version'){
					$$.displayDialog('whois', msg.sender.nick, 'Informacje o użytkowniku '+he(msg.sender.nick), 'Oprogramowanie użytkownika <b>'+msg.sender.nick+'</b>:<br>'+he(text));
				}
			} else { // nie-ctcp
				if(msg.args[0].indexOf('#') == 0) { //kanał
					if(ignore.ignoring(msg.sender.nick, 'channel')){
						console.log('Ignoring notice on '+msg.args[0]+' by '+msg.sender.nick);
						return;
					}
					if(gateway.findChannel(msg.args[0])) {
						if(msg.text.indexOf(guser.nick) != -1) {
							gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.notice, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
							if(gateway.active != msg.args[0]) {
								gateway.findChannel(msg.args[0]).markBold();
							}
						} else {
							gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.notice, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						}
					}
				} else if(!msg.sender.server && msg.sender.nick != guser.nick) { // użytkownik
					if(ignore.ignoring(msg.sender.nick, 'query')){
						console.log('Ignoring notice by '+msg.sender.nick);
						return;
					}
					if(msg.sender.nick.toLowerCase() == 'nickserv'){
						if(services.nickservMessage(msg)) {
							return;
						}
					}
					if(msg.sender.nick.toLowerCase() == 'chanserv'){
						if(services.chanservMessage(msg)) {
							return;
						}
					}
					var query = gateway.findQuery(msg.sender.nick);
					var displayAsQuery = Boolean(query);
					if(displayAsQuery || $("#noticeDisplay").val() == 1){ // notice jako query
						if(!query) {
							query = gateway.findOrCreate(msg.sender.nick);
						}
						query.appendMessage(messagePatterns.notice, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase()) {
							query.markNew();
						}
					} else if ($("#noticeDisplay").val() == 2) { // notice w statusie
						gateway.statusWindow.appendMessage(messagePatterns.notice, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
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
				//		gateway.statusWindow.appendMessage(messagePatterns.serverNotice, [$$.niceTime(), he(msg.sender.nick), $$.colorize(msg.text)]);
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
								chan.appendMessage(messagePatterns.knocked, [$$.niceTime(), match[1]]);
							} else {
								gateway.statusWindow.appendMessage(messagePatterns.knocked, [$$.niceTime(), match[1]]);
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
					var chan = gateway.findOrCreate(msg.text, true);
					chan.appendMessage(messagePatterns.joinOwn, [$$.niceTime(), msg.text]);
				}
				gateway.send("MODE "+msg.text+"\r\nWHO "+msg.text);
			}
		},
		function(msg) {
			var chan = gateway.findChannel(msg.text);
			if(!chan) return;
			var nicklistUser = chan.nicklist.findNick(msg.sender.nick);
			if(msg.sender.nick != guser.nick) {
				gateway.processJoin(msg);
			}
			if(!nicklistUser) {
				chan.nicklist.addNick(msg.sender.nick);
				nicklistUser = chan.nicklist.findNick(msg.sender.nick);
			} else {
				nicklistUser.setMode('owner', false);
				nicklistUser.setMode('admin', false);
				nicklistUser.setMode('op', false);
				nicklistUser.setMode('halfop', false);
				nicklistUser.setMode('voice', false);
			}
			nicklistUser.setIdent(msg.sender.ident);
			nicklistUser.setUserHost(msg.sender.host);
			gateway.send('WHO '+msg.sender.nick);
		}
	],
	'PART': [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.sender.nick != guser.nick) {
					if (!$('#showPartQuit').is(':checked')) {
						gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.part, [$$.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), msg.args[0], $$.colorize(msg.text)]);
					}
					gateway.findChannel(msg.args[0]).nicklist.removeNick(msg.sender.nick);
				} else {
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.partOwn, [$$.niceTime(), msg.args[0], msg.args[0]]);
					gateway.findChannel(msg.args[0]).part();
				}
			}
		}
	],
	'KICK': [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.args[1] != guser.nick) {
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.kick, [$$.niceTime(), he(msg.sender.nick), msg.args[1], msg.args[0], $$.colorize(msg.text)]);
					gateway.findChannel(msg.args[0]).nicklist.removeNick(msg.args[1]);
				} else {
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.kickOwn, [$$.niceTime(), he(msg.sender.nick), msg.args[0], $$.colorize(msg.text)]);
					gateway.findChannel(msg.args[0]).part();
				}
			}
		}
	],
	'221': [	// RPL_UMODES
		function(msg) {
			guser.clearUmodes();
			gateway.parseUmodes(msg.args[1]);
			gateway.pingcnt = 0;
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
				query.appendMessage(messagePatterns.away, [$$.niceTime(), he(msg.args[1]), he(msg.text)]);
			} else {
				$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>Nieobecny:</span><span class='data'>" + he(msg.args[1]) + " jest nieobecny(a): " + he(msg.text) + "</span></p>");
			}
		}
	],
	'312': [	// RPL_WHOISSERVER 
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>Serwer:</span><span class='data'>" + msg.args[2] + " "+ he(msg.text) + "</span></p>");
		}
	],
	'313': [	// RPL_WHOISOPERATOR
		function(msg) {
			var info = '<b class="admin">OPERATOR SIECI</b>';
			if(msg.text.match(/is a Network Service/i)){
				info = 'Usługa sieciowa';
				var sel = $$.getDialogSelector('whois', msg.args[1]).find('span.admin');
				if(sel.length){
					sel.append(' ('+info+')');
					return;
				} else {
					info = '<b class="admin">' + info + '</b>';
				}
			}
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data admin'>"+info+"</span></p>");
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
					while(chanName.charAt(0) != '#'){
						chanPrefix += chanName.charAt(0);
						chanName = chanName.substring(1);
						if(chanName.length == 0){
							return;
						}
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
								gateway.findOrCreate(channel[0]);
							}
							gateway.send('NAMES '+channel[0]+'\r\nTOPIC '+channel[0]+'\r\nMODE '+channel[0]+'\r\nWHO '+channel[0]);
						}
					});
				}
			}
		}
	],
	'320': [	//RPL_WHOISSPECIAL
		function(msg) {
			var expr = /connected from (.*) \(([^ ]+)\)/;
			var match = expr.exec(msg.text);
			if(match){
				var cname = geoip.getName(match[2]);
				var html = 'Łączy się z: ';
				if(!cname){
					html += match[1] + ' (' + match[2] + ')';
				} else {
					html += '<img src="/styles/img/flagi/'+match[2]+'-flag.png" alt="('+match[2]+')"> '+cname;
				}
			} else {
				var sel = $$.getDialogSelector('whois', msg.args[1]).find('span.admin');
				if(sel.length){
					sel.append(' ('+msg.text+')');
					return;
				}
				var html = msg.text;
			}
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data'>"+html+"</span></p>");
		}
	],
	'322': [	// RPL_LIST
		function(msg) {
			if(gateway.smallListLoading){
				if(msg.args[1] == '*') return;
				gateway.smallListData.push([msg.args[1], msg.args[2], $$.colorize(msg.text, true)]);
				return;
			}
			if (!msg.text) {
				var outtext = "<i>(brak tematu)</i>"; // Na wypadek jakby topic nie był ustawiony.
			} else {
				var outtext = $$.colorize(msg.text);
			}
			if(msg.args[1] == '*'){
				gateway.statusWindow.appendMessage(messagePatterns.chanListElementHidden, [$$.niceTime(), msg.args[2]]);
			} else {
				gateway.statusWindow.appendMessage(messagePatterns.chanListElement, [$$.niceTime(), msg.args[1], msg.args[1], msg.args[2], outtext]);
			}
			gateway.statusWindow.markBold();
		}
	],
	'323': [	// RPL_ENDOFLIST
		function(msg){
			if(!gateway.smallListLoading){
				return;
			}
			var lcompare = function(ch1, ch2){
				return ch2[1] - ch1[1];
			}
			gateway.smallListLoading = false;
			gateway.smallListData.sort(lcompare);
			var html = '<p><span class="chlist_button" onclick="gateway.performCommand(\'LIST\')">Pełna lista</span> <span class="chlist_button" onclick="gateway.refreshChanList()">Odśwież</span><p>Największe kanały:</p><table>';
			for(i in gateway.smallListData){
				var item = gateway.smallListData[i];
				html += '<tr title="'+he(item[2])+'"><td class="chname" onclick="gateway.send(\'JOIN '+bsEscape(item[0])+'\')">'+he(item[0])+'</td><td class="chusers">'+he(item[1])+'</td></tr>';
			}
			html += '</table>';
			$('#chlist-body').html(html);
			gateway.smallListData = [];
		}
	],
	'324': [	// RPL_CHANNELMODEIS
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				var chan = msg.args[1];
				var mody = JSON.parse(JSON.stringify(msg.args));
				mody.splice(0,2);
				//modyText = mody.join(" ");
				var chanO = gateway.findChannel(chan);
				var info = gateway.parseChannelMode(mody, chanO, 1);
				if(info == ''){
					info = 'brak';
				}
				if (!$('#showMode').is(':checked')) {
					chanO.appendMessage(messagePatterns.mode, [$$.niceTime(), chan, info]);
				}
			//	gateway.send('CAP REQ :multi-prefix userhost-in-names away-notify\r\nCAP END');//\r\nNAMES '+chan);
				/*try {
					var ckNick = localStorage.getItem('origNick');
  				 	if(ckNick){
						gateway.send('SETNAME Użytkownik bramki PIRC.pl "' + ckNick + '"');
					}
				} catch(e) {}*/
			}
		}
	],
	'330': [	// RPL_WHOISACCOUNT
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>Nazwa konta:</span><span class='data'>" + msg.args[2] + "</span></p>");
		}
	],
	'335': [	// RPL_BOT ???
		function(msg){
			$$.displayDialog('whois', msg.args[1], false, '<p class="whois"><span class="info"><br /></span><span class="data">Ten użytkownik to <b>bot</b></span></p>');
		}
	],
	'352': [	// RPL_WHOREPLY
		function(msg) {
			for(var i=0; i<gateway.channels.length; i++){
				var channel = gateway.channels[i];
//			var channel = gateway.findChannel(msg.args[1]);
//			if(!channel){
//				return;
//			}
				var nickListItem = channel.nicklist.findNick(msg.args[5]);
				if(!nickListItem){
					continue;
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
				if(msg.args[6].indexOf('r') > -1){
					nickListItem.setRegistered(true);
				} else {
					nickListItem.setRegistered(false);
				}
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
			gateway.statusWindow.appendMessage(messagePatterns.yourAwayDisabled, [$$.niceTime()]);
			gateway.statusWindow.markBold();
		}
	],
	'306': [	// RPL_NOWAWAY
		function(msg) {
			gateway.channels.forEach(function(channel){
				var nickListItem = channel.nicklist.findNick(guser.nick);
				nickListItem.setAway(true);
			});
			gateway.statusWindow.appendMessage(messagePatterns.yourAwayEnabled, [$$.niceTime()]);
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
					gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.topic, [$$.niceTime(), msg.args[1], $$.colorize(msg.text)]);
				} else {
					gateway.findChannel(msg.args[1]).setTopic('');
					gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.topicNotSet, [$$.niceTime(), msg.args[1]]);
				}
			}
		}
	],
	'333': [	// RPL_TOPICWHOTIME 
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.topicTime, [$$.niceTime(), msg.args[2], $$.parseTime(msg.args[3])]);
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
			gateway.statusWindow.appendMessage(messagePatterns.motd, [$$.niceTime(), msg.text]);
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
				chan.appendMessage(messagePatterns.yourInvite, [$$.niceTime(), he(msg.args[1]), he(msg.args[2])]);
			} else {
				gateway.statusWindow.appendMessage(messagePatterns.yourInvite, [$$.niceTime(), he(msg.args[1]), he(msg.args[2])]);
			}
		}
	],
	'401': [	// ERR_NOSUCHNICK
		function(msg) {
			if(msg.args[1] != irc.lastNick){
				$$.displayDialog('error', 'error', 'Błąd', '<p>Nie można wykonać żądanej akcji. Nie ma takiego nicku ani kanału: <b>'+msg.args[1]+'</b></p>');
			}
			gateway.statusWindow.appendMessage(messagePatterns.noSuchNick, [$$.niceTime(), he(msg.args[1])]);
		}
	],
	'402': [	// ERR_NOSUCHSERVER
		function(msg) {
			$$.displayDialog('error', 'error', 'Błąd', '<p>Nie można wykonać żądanej akcji. Nie ma takiego obiektu: <b>'+msg.args[1]+'</b></p>');
			gateway.statusWindow.appendMessage(messagePatterns.noSuchNick, [$$.niceTime(), he(msg.args[1])]);
		}
	],
	'403': [	// ERR_NOSUCHCHANNEL 
		function(msg) {
			$$.displayDialog('error', 'error', 'Błąd', '<p>Nie można wykonać żądanej akcji. Nie ma takiego kanału: <b>'+msg.args[1]+'</b></p>');
			gateway.statusWindow.appendMessage(messagePatterns.noSuchChannel, [$$.niceTime(), he(msg.args[1])]);
		}
	],
	'404': [	// ERR_CANNOTSENDTOCHAN
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				var reason = '';
				if(msg.text.match(/Newly connected users have to wait before they can send any links \(.*\)/)){
					reason = 'Twoja wiadomość została rozpoznana jako link. Musisz odczekać kilka minut po połączeniu i spróbować ponownie. Zarejestruj nick, aby uniknąć tego ograniczenia w przyszłości';
				} else if(msg.text.match(/You need voice \(\+v\) \(.*\)/)){
					reason = 'Potrzebujesz prawa głosu, aby teraz pisać na tym kanale';
				} else if(msg.text.match(/You are banned \(.*\)/)){
					reason = 'Jesteś zbanowany';
				} else if(msg.text.match(/Color is not permitted in this channel \(.*\)/)){
					reason = 'Wiadomości zawierające kolory są zabronione na tym kanale';
				} else if(msg.text.match(/No external channel messages \(.*\)/)){
					reason = 'Musisz być na tym kanale, aby móc pisać';
				} else if(msg.text.match(/You must have a registered nick \(\+r\) to talk on this channel \(.*\)/)){
					reason = 'Musisz mieć zarejestrowanego nicka, aby teraz pisać na tym kanale';
				} else {
					reason = msg.text;
				}
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.cannotSendToChan, [$$.niceTime(), msg.args[1], reason]);
			} else if(gateway.findQuery(msg.args[1])){
				if(msg.text.match(/Newly connected users have to wait before they can send any links/)){
					reason = 'Twoja wiadomość została rozpoznana jako link. Musisz odczekać kilka minut po połączeniu i spróbować ponownie. Zarejestruj nick, aby uniknąć tego ograniczenia w przyszłości';
				} else {
					reason = msg.text;
				}
				gateway.findQuery(msg.args[1]).appendMessage(messagePatterns.cannotSendToUser, [$$.niceTime(), msg.args[1], reason]);
			} else {
				$$.displayDialog('error', 'error', 'Błąd', '<p>Nie można wysłać wiadomości do '+he(msg.args[1])+'</p><p>Komunikat od serwera: '+msg.text+'</p>');
			}
		}
	],
	'432' : [	// ERR_ERRONEUSNICKNAME 
		function(msg) {
			if(gateway.connectStatus == statusDisconnected){
				gateway.send('NICK PIRC-'+Math.round(Math.random()*100));
			}
			var html = '<p>Nick <b>'+he(msg.args[1])+'</b> jest niedostępny. Spróbuj poczekać kilka minut.</p>';
			if(gateway.connectStatus != statusDisconnected){
				html += "<p>Twój bieżący nick to <b>"+guser.nick+"</b>.</p>";
			}
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html);
			gateway.nickWasInUse = true;
			gateway.statusWindow.appendMessage(messagePatterns.badNick, [$$.niceTime(), msg.args[1]]);
		}
	],
	'433' : [	// ERR_NICKNAMEINUSE 
		function(msg) {
			if(gateway.connectStatus == statusDisconnected){
				var expr = /^([^0-9]+)(\d*)$/;
				var match = expr.exec(guser.nick);
				if(match[2] && !isNaN(match[2])){
					var nick = match[1];
					var suffix = parseInt(match[2]) + 1;
				} else {
					var nick = guser.nick;
					var suffix = Math.floor(Math.random() * 999);
				}
				gateway.send('NICK '+nick+suffix);
			}
			var html = '<p>Nick <b>'+he(msg.args[1])+'</b> jest już używany przez kogoś innego.</p>';
			gateway.nickWasInUse = true;
			
			if(gateway.connectStatus != statusDisconnected){
				html += "<p>Twój bieżący nick to <b>"+guser.nick+".</p>";
			}
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html);
			gateway.statusWindow.appendMessage(messagePatterns.nickInUse, [$$.niceTime(), msg.args[1]]);
		}
	],
	'447' : [	// ERR_NONICKCHANGE 
		function(msg) {
			var html = "<p>Nie można zmienić nicka.<br>Komunikat od serwera: " + he(msg.text) + '</p>';
			$$.displayDialog('error', 'error', 'Błąd', html);
			gateway.statusWindow.appendMessage(messagePatterns.notOnChannel, [$$.niceTime(), he(msg.args[1])]);
		}
	],
	'442' : [	// ERR_NOTONCHANNEL
		function(msg) {
			var html = '<p>'+he(msg.args[1])+": nie jesteś na tym kanale.</p>";
			$$.displayDialog('error', 'error', 'Błąd', html);
			gateway.statusWindow.appendMessage(messagePatterns.notOnChannel, [$$.niceTime(), he(msg.args[1])]);
		}
	],
	'443' : [	// ERR_USERONCHANNEL
		function(msg) {
			var html = '<p>'+he(msg.args[2])+": <b>"+he(msg.args[1])+"</b> jest już na tym kanale.</p>";
			$$.displayDialog('error', 'error', 'Błąd', html);
			gateway.statusWindow.appendMessage(messagePatterns.alreadyOnChannel, [$$.niceTime(), he(msg.args[2]), he(msg.args[1])]);
		}
	],
	'465' : [	// ERR_YOUREBANNEDCREEP
		function(msg) {
			gateway.displayGlobalBanInfo(msg.text);
		}
	],
	'474' : [	// ERR_BANNEDFROMCHAN
		function(msg) {
			gateway.iKnowIAmConnected(); // TODO inne powody, przez które nie można wejść
			var html =  "<p>Nie można dołączyć do kanału <b>" + msg.args[1] + "</b>";
			if (msg.text == "Cannot join channel (+b)") {
				html += "<br>Jesteś zbanowany.</p>";
				gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [$$.niceTime(), msg.args[1], "Jesteś zbanowany"]);
			}
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'473' : [	// ERR_INVITEONLYCHAN
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = '<p>Nie można dołączyć do kanału <b>' + he(msg.args[1]) + '</b>' +
				'<br>Musisz dostać zaproszenie aby wejść na ten kanał.</p>';
			var button = [ {
				text: 'Poproś operatorów o możliwość wejścia',
				click: function(){
					gateway.send('KNOCK '+msg.args[1]+' :Proszę o możliwość wejścia na kanał');
					$(this).dialog('close');
				}
			} ];
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [$$.niceTime(), msg.args[1], "Kanał wymaga zaproszenia"]);
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html, button);
		}
	],
	'480' : [	// ERR_CANNOTKNOCK
		function(msg) {
			var html = "<p>Nie można zapukać do kanału.<br>" +
				"Komunikat serwera: "+he(msg.text) + '</p>';
			gateway.statusWindow.appendMessage(messagePatterns.alreadyOnChannel, [$$.niceTime(), 'Komunikat serwera', he(msg.text)]);
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'489' : [	// ERR_SECUREONLYCHAN 
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "<p>Nie można dołączyć do kanału <b>" + he(msg.args[1]) + "</b>" +
				'<br>Kanał wymaga połączenia z włączonym SSL (tryb +z). Nie jest dostępny z bramki.<br>Możesz spróbować użyć programu HexChat według instrukcji z <a href="http://pirc.pl/teksty/p_instalacja_i_konfiguracja" target="_blank">tej strony</a>.</p?';
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [$$.niceTime(), msg.args[1], "Kanał wymaga połączenia SSL"]);
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'477' : [	// ERR_NEEDREGGEDNICK
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "<p>Nie można dołączyć do kanału <b>" + he(msg.args[1]) + "</b>" +
				'<br>Kanał wymaga, aby Twój nick był zarejestrowany. Zastosuj się do instrukcji otrzymanych od NickServ lub zajrzyj <a href="http://pirc.pl/teksty/p_nickserv" target="_blank">tutaj</a>.</p>';
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [$$.niceTime(), msg.args[1], "Kanał wymaga zarejestrowanego nicka"]);
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'475' : [	// ERR_BADCHANNELKEY
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "<p>Nie można dołączyć do kanału <b>" + msg.args[1] + "</b>" +
				'<br>Musisz podać poprawne hasło.' +
				'<br><form onsubmit="gateway.chanPassword(\''+he(msg.args[1])+'\');$$.closeDialog(\'warning\', \'warning\')" action="javascript:void(0);">' +
				'Hasło do '+he(msg.args[1])+': <input type="password" id="chpass" /> <input type="submit" value="Wejdź" /></form></p>';
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [$$.niceTime(), msg.args[1], "Wymagane hasło"]);
			$$.displayDialog('warning', 'warning', 'Ostrzeżenie', html);
		}
	],
	'482' : [	// ERR_CHANOPRIVSNEEDED 
		function(msg) {
			var html = msg.args[1] + ": brak uprawnień." +
				"<br>Nie masz wystarczających uprawnień aby wykonać żądaną akcję.";
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.noPerms, [$$.niceTime(), msg.args[1]]);
			}
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'486' : [	// ERR_NONONREG
		function(msg) {
			var expr = /^You must identify to a registered nick to private message ([^ ]*)$/;
			var match = expr.exec(msg.text);
			if(match){
				var query = gateway.findQuery(match[1]);
				if(query){
					query.appendMessage(messagePatterns.cannotSendToUser, [$$.niceTime(), match[1], 'Twój nick musi być zarejestrowany']);
				}
				$$.displayDialog('error', 'error', 'Błąd', '<p>Nie można wysłać prywatnej wiadomości do <b>'+match[1]+'</b></p><p>Użytkownik akceptuje prywatne wiadomości tylko od zarejestrowanych nicków.</p>');
			} else {
				$$.displayDialog('error', 'error', 'Błąd', '<p>Nie można wysłać prywatnej wiadomości.</p><p>Komunikat od serwera: '+he(msg.text)+'</p>');
			}					
		}
	],
	'499' : [	// ERR_CHANOWNPRIVNEEDED
		function(msg) {
			var html = msg.args[1] + ": brak uprawnień." +
				"<br>Nie masz wystarczających uprawnień aby wykonać żądaną akcję.";
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.noPerms, [$$.niceTime(), msg.args[1]]);
			}
			$$.displayDialog('error', 'error', 'Błąd', html);
		}
	],
	'974' : [	// ERR_CHANOPRIVSNEEDED 
		function(msg) {
			gateway.showPermError(msg.text);
			if(gateway.getActive()) {
				gateway.getActive().appendMessage(messagePatterns.noPerms, [$$.niceTime(), msg.args[1]]);
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
			
			var expr = /^Closing Link: [^ ]+\[([^ ]+)\] \(User has been banned from/;
			var match = expr.exec(msg.text);
			if(match){
				console.log('IP: '+match[1]);
				gateway.displayGlobalBanInfo(msg.text);
				gateway.connectStatus = statusBanned;
			} 
			if(gateway.connectStatus == statusBanned) return;

			if(gateway.connectStatus == statusDisconnected) {
				if(gateway.firstConnect){
					gateway.reconnect();
				}
				return;
			}
		
			gateway.connectStatus = statusDisconnected;

			if(msg.text.match(/\(NickServ \(RECOVER command used by [^ ]+\)\)$/) || msg.text.match(/\(NickServ \(Użytkownik [^ ]+\ użył komendy RECOVER\)\)$/)){
				$$.displayReconnect();
				var html = "<h2>Błąd ogólny</h2>" +
					"<p>Inna sesja rozłączyła Cię używając polecenia RECOVER. Może masz otwartą więcej niż jedną bramkę?</p>";
				$$.displayDialog('error', 'herror', 'Błąd', html);
			} else {
				var html = "<h3>Serwer przerwał połączenie</h3>" +
					"<p>Informacje: "+msg.text+"</p>";
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
				gateway.getActive().appendMessage(messagePatterns.noPerms, [$$.niceTime(), msg.args[1]]);
			}
		}
	],
	'TOPIC':  [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.text) {
					gateway.findChannel(msg.args[0]).setTopic(msg.text);
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.changeTopic, [$$.niceTime(), he(msg.sender.nick), $$.colorize(msg.text)]);
				} else {
					gateway.findChannel(msg.args[0]).setTopic('');
					gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.deleteTopic, [$$.niceTime(), he(msg.sender.nick), msg.args[0]]);
				}

			}
		}
	],
	'MODE': [
		function(msg) {
			var chanName = msg.args[0];
			if(chanName == guser.nick){
				gateway.parseUmodes(msg.text);
			} else if(gateway.findChannel(chanName)) {
				var modestr = '';
				for (i in msg.args) {
					if(i != 0) {
						modestr += msg.args[i]+' ';
					}
				}
				modestr = modestr.slice(0,-1);
	
				var chan = gateway.findChannel(chanName);
				var args2 = msg.args;
				args2.shift();
				var info = gateway.parseChannelMode(args2, chan);
				if (!$('#showMode').is(':checked') || msg.sender.nick.toLowerCase() == guser.nick.toLowerCase()) {
					chan.appendMessage(messagePatterns.modeChange, [$$.niceTime(), he(msg.sender.nick), /*he(modestr)*/info, he(chanName)]);
				}
			}
		}
	],
	'CAP': [
		function(msg) {
			switch(msg.args[1]){
				case 'LS':
					var availableCaps = msg.text.split(' ');
					var caps = ['userhost-in-names', 'away-notify', 'multi-prefix'];
					if(guser.nickservpass != '' && guser.nickservnick != ''){
						caps.push('sasl');
					}
					var useCaps = '';
					caps.forEach(function(cap){
						if(availableCaps.indexOf(cap) >= 0){
							if(useCaps.length > 0) useCaps += ' ';
							useCaps += cap;
						}
					});
					gateway.send('CAP REQ :'+useCaps);
					break;
				case 'ACK':
					var caps = msg.text.split(' ');
					if(caps.indexOf('sasl') >= 0){
						gateway.sasl = true;
					}
					if(guser.nickservpass != '' && guser.nickservnick != '' && gateway.sasl){
						gateway.send('AUTHENTICATE PLAIN');
						gateway.statusWindow.appendMessage(messagePatterns.SaslAuthenticate, [$$.niceTime(), 'Próba logowania za pomocą SASL...']);
					} else {
						gateway.send('CAP END');
					}
					break;
			}
		}
	],
	'AUTHENTICATE': [
		function(msg) {
			if(msg.args[0] == '+'){
				gateway.send('AUTHENTICATE '+Base64.encode(guser.nickservnick + '\0' + guser.nickservnick + '\0' + guser.nickservpass));
				gateway.statusWindow.appendMessage(messagePatterns.SaslAuthenticate, [$$.niceTime(), 'SASL: logowanie do konta '+he(guser.nickservnick)]);
			} else {
				gateway.send('CAP END'); //nie udało się
			}
			gateway.connectStatus = statusIdentified;
		}
	],
	'900': [ // RPL_LOGGEDIN
		function(msg) {
			gateway.send('CAP END');
			gateway.statusWindow.appendMessage(messagePatterns.SaslAuthenticate, [$$.niceTime(), 'SASL: zalogowano jako '+he(msg.args[2])]);
		}
	],
	'904': [ // ERR_SASLFAIL
		function(msg) {
			gateway.send('CAP END');
			gateway.statusWindow.appendMessage(messagePatterns.SaslAuthenticate, [$$.niceTime(), 'SASL: logowanie nieudane!']);
//			gateway.sasl = false;
		}
	]
};

var ctcpBinds = {
	'ACTION': [
		function(msg){
			var html = $$.parseImages(msg.text);
			if(msg.args[0].charAt(0) == '#'){ //kanał
				var channel = gateway.findOrCreate(msg.args[0], false);
				if(msg.text.indexOf(guser.nick) != -1) {
					channel.appendMessage(messagePatterns.channelActionHilight, [$$.niceTime(), msg.sender.nick, $$.colorize(msg.ctcptext)]);
					if(gateway.active.toLowerCase() != msg.args[0].toLowerCase() || !disp.focused) {
						channel.markNew();
					}
				} else {
					channel.appendMessage(messagePatterns.channelAction, [$$.niceTime(), msg.sender.nick, $$.colorize(msg.ctcptext)]);
					if(gateway.active.toLowerCase() != msg.args[0].toLowerCase() || !disp.focused) {
						channel.markBold();
					}
				}
				channel.appendMessage('%s', [html]);
			} else {
				query = gateway.findOrCreate(msg.sender.nick);
				query.appendMessage(messagePatterns.channelAction, [$$.niceTime(), msg.sender.nick, $$.colorize(msg.ctcptext)]);
				if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase()) {
					gateway.findQuery(msg.sender.nick).markNew();
				}
				query.appendMessage('%s', [html]);
			}

		}
	],
	'VERSION': [
		function(msg){
			version_string = 'Bramka WWW PIRC.PL, wersja '+gatewayVersion;
			if(addons.length > 0){
				version_string += ', z dodatkami: ';
				for(i in addons){
					if(i>0){
						version_string += ', ';
					}
					version_string += addons[i];
				}
			}
			version_string += ', na '+navigator.userAgent;
			gateway.sendDelayed('NOTICE '+msg.sender.nick+ ' \001VERSION '+version_string+'\x01');
		}
	],
	'USERINFO': [
		function(msg){
			version_string = 'Bramka WWW PIRC.PL, wersja '+gatewayVersion;
			if(addons.length > 0){
				version_string += ', z dodatkami: ';
				for(i in addons){
					if(i>0){
						version_string += ', ';
					}
					version_string += addons[i];
				}
			}
			version_string += ', na '+navigator.userAgent;
			gateway.sendDelayed('NOTICE '+msg.sender.nick+ ' \001VERSION '+version_string+'\x01');
		}
	],
	'REFERER': [
		function(msg){
			referer_string = document.referrer;
			if(referer_string == ''){
				referer_string = 'Nieznany';
			}
			gateway.sendDelayed('NOTICE '+msg.sender.nick+ ' \001REFERER '+referer_string+'\x01');
		}
	],
	'MCOL': [
		function(msg){
			var elements = msg.ctcptext.split(',');
			for(var i=0; i<elements.length; i++){
				var element = elements[i];
				if(element.indexOf(' ') > 0){
					var command = element.substr(0, element.indexOf(' '));
					var arg = element.substr(element.indexOf(' ')+1);
				} else {
					var command = element;
					var arg = '';
				}
				msg.mcolarg = arg;
				if(command in mcolBinds){
					for(func in mcolBinds[command]){
						mcolBinds[command][func](msg);
					}
				}
			}
		}
	]
};

var mcolBinds = {
};
