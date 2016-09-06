var cmdBinds = {
	'001': [	// RPL_WELCOME 
		function(msg) {
			var ckNick = settings.getCookie('origNick');
			if(ckNick){
				settings.saveCookie('origNick', ckNick);
			} else {
				settings.saveCookie('origNick', guser.nick);
			}
			
			if(msg.args[0] != guser.nick) {
				guser.changeNick(msg.args[0], true);
   				$(".notify-text").append("<p>Twój bieżący nick to <b>"+guser.nick+"</b>.</p>");
			}
			gateway.statusWindow.appendMessage(messagePatterns.motd, [gateway.niceTime(), he(msg.text)]);
			gateway.pingcnt = 0;
			gateway.connectStatus = status001;
		}
	],
	'CONNECTED': [
		function(msg) {
			gateway.joinChannels();
		}
	],
	'411': [ //	ERR_NORECIPIENT - brzydki sposób na uzyskanie bieżącego nicka
		function(msg) {
			if(gateway.connectStatus != statusDisconnected){
				return;
			}
			if(msg.args[0] != guser.nick) {
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
				var channel = gateway.findChannel(msg.args[0]);
				if(!channel) {
					channel = new Channel(msg.args[0]);
					gateway.channels.push(channel);
					gateway.switchTab(msg.args[0]);
				}
				if(channel) {
					if(msg.text.match(/^\001.*\001$/i)) {
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
					} else {
						if(msg.text.indexOf(guser.nick) != -1) {
							channel.appendMessage(messagePatterns.channelMsgHilight, [gateway.niceTime(), msg.sender.nick, $$.colorize(msg.text)]);
							if(gateway.active != msg.args[0].toLowerCase() || !disp.focused) {
								channel.markNew();
							}
						} else {
							channel.appendMessage(messagePatterns.channelMsg, [gateway.niceTime(), msg.sender.nick, $$.colorize(msg.text)]);
							if(gateway.active.toLowerCase() != msg.args[0].toLowerCase() || !disp.focused) {
								channel.markBold();
							}
						}
					}
					channel.appendMessage('%s', [html]);
				}
			} else if(!msg.sender.server/* && msg.sender.nick != guser.nick*/){ // wiadomość prywatna
				if(msg.sender.nick == guser.nick){
					var qnick = msg.args[0];
				} else {
					var qnick = msg.sender.nick;
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
				} else { // normalna wiadomość
					if(!query) {
						query = new Query(msg.sender.nick);
						gateway.queries.push(query);
					}
					query.appendMessage(messagePatterns.channelMsg, [gateway.niceTime(), msg.sender.nick, $$.colorize(msg.text)]);
					if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase() || !disp.focused) {
						gateway.findQuery(msg.sender.nick).markNew();
					}
					query.appendMessage('%s', [html]);
				}
			}
		}
	],
	'NOTICE': [
		function(msg) {
			if (msg.text == false) {
				msg.text = " ";
			}
			if(msg.text.match(/^\001.*\001$/i)) { // ctcp
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
					$(".notify-text").html('<h3>Oprogramowanie użytkownika '+msg.sender.nick+'</h3><p>'+he(text) +'</p>');
					$(".notifywindow").fadeIn(250);
					$(".notifywindow").css('z-index', 10);
				}
			} else { // nie-ctcp
				if(msg.args[0].indexOf('#') == 0) { //kanał
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
					if(msg.sender.nick.toLowerCase() == 'nickserv'){
						if(services.nickservMessage(msg)) {
							return;
						}
					}
					if ($("#noticeDisplay").val() == 2) { // notice w statusie
						gateway.statusWindow.appendMessage(messagePatterns.notice, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						gateway.statusWindow.markBold();
					} else if($("#noticeDisplay").val() == 1) { // notice jako query
						if(!gateway.findQuery(msg.sender.nick)) {
							var query = new Query(msg.sender.nick);
							gateway.queries.push(query);
						}
						gateway.findQuery(msg.sender.nick).appendMessage(messagePatterns.notice, [gateway.niceTime(), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), $$.colorize(msg.text)]);
						if(gateway.active.toLowerCase() != msg.sender.nick.toLowerCase()) {
							gateway.findQuery(msg.sender.nick).markNew();
						}
					} else if($("#noticeDisplay").val() == 0) { // notice jako okienko
						if(!gateway.lastNoticeNick || gateway.lastNoticeNick.toLowerCase() != msg.sender.nick.toLowerCase()) {
							$(".notice-text").append("<h3>Komunikat prywatny od "+he(msg.sender.nick)+"</h3>");
							gateway.lastNoticeNick = msg.sender.nick;
						}
		   				$(".notice-text").append("<p><span class=\"time\">"+gateway.niceTime()+"</span> "+$$.colorize(msg.text)+"</p>");
						$(".noticewindow").fadeIn(250);
						$('.notice-text').scrollTop($('.notice-text').prop("scrollHeight"));
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
						if(!gateway.lastNoticeNick || gateway.lastNoticeNick.toLowerCase() != msg.sender.nick.toLowerCase()) {
							$(".notice-text").append("<h3>Komunikat prywatny od serwera "+he(msg.sender.nick)+" do "+he(msg.args[0])+"</h3>");
							gateway.lastNoticeNick = msg.sender.nick;
						}
		   				$(".notice-text").append("<p><span class=\"time\">"+gateway.niceTime()+"</span> "+$$.colorize(msg.text)+"</p>");
						$(".noticewindow").fadeIn(250);
						$('.notice-text').scrollTop($('.notice-text').prop("scrollHeight"));
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
				gateway.send("MODE "+msg.text);
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
	'307': [	// RPL_USERIP
		function(msg) {
			$(".notify-text").append("<p class='whois'><span class='info'><br /></span><span class='data'>Ten nick jest zarejestrowany</span></p>");
		}
	],
	'311': [	// RPL_WHOISUSER 
		function(msg) {
			var html = "<h3>Informacje o użytkowniku " +he(msg.args[1])+ "</h3>" +
				"<p class='whois'><span class='info'>Pełna maska:</span><span class='data'> " + he(msg.args[1]) + "!" + msg.args[2] + "@" + msg.args[3] + "</span></p>" +
				"<p class='whois'><span class='info'>Realname:</span><span class='data'> " + he(msg.text) + "</span></p>";
			$(".notify-text").html(html);
		}
	],
	'301': [	// RPL_AWAY
		function(msg) {
			$(".notify-text").append("<p class='whois'><span class='info'>Nieobecny:</span><span class='data'>" + he(msg.args[1]) + " jest nieobecny(a): " + he(msg.text) + "</span></p>");
			var query = gateway.findQuery(msg.args[1]);
			if(query){
				query.appendMessage(messagePatterns.away, [gateway.niceTime(), he(msg.args[1]), he(msg.text)]);
			}
		}
	],
	'312': [	// RPL_WHOISSERVER 
		function(msg) {
			$(".notify-text").append("<p class='whois'><span class='info'>serwer:</span><span class='data'>" + msg.args[2] + " "+ he(msg.text) + "</span></p>");
		}
	],
	'313': [	// RPL_WHOISOPERATOR
		function(msg) {
			$(".notify-text").append("<p class='whois'><span class='info'><br /></span><span class='data'><b class=admin>ADMINISTRATOR SIECI</b> (" + he(msg.text.substr(5)) +")</span></p>");
		}
	],
	'317': [	// RPL_WHOISIDLE 
		function(msg) {
			$(".notify-text").append("<p class='whois'><span class='info'>Połączył się:</span><span class='data'>" + $$.parseTime(msg.args[3]) + "</span></p>");
			var idle = msg.args[2];
			var hour = Math.floor(idle/3600);
			idle = idle - hour * 3600;
			var min = Math.floor(idle/60);
			var sec = idle - min * 60;   		
			$(".notify-text").append("<p class='whois'><span class='info'>Nieaktywny</span><span class='data'>" + (hour>0? hour + " h " : "") + (min>0? min + " min " : "") + sec + " sek</span></p>");
		}
	],
	'318': [	// RPL_ENDOFWHOIS
		function(msg) {
			if(gateway.connectStatus != statusConnected){
				return;
			}
			if(msg.args[1].toLowerCase() == guser.nick.toLowerCase() && !gateway.displayOwnWhois){
				return;
			}
			gateway.displayOwnWhois = false;
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
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
				$(".notify-text").append("<p class='whois'><span class='info'>Kanały:</span><span class='data'> "+ chanHtml + "</span></p>");
			} else {	// sprawdzam, na jakich kanałach sam jestem
				gateway.connectStatus = status001;
				if(msg.args[1] == guser.nick){
					var chans = msg.text.split(' ');
					chans.forEach( function(channame){
						var channel = channame.match(/#[^ ]+/);
						if(channel){
							if(gateway.findChannel(channel[0])) {
								gateway.findChannel(channel[0]).rejoin();
							} else {
								var chan = new Channel(channel[0]);
								gateway.channels.push(chan);
								gateway.switchTab(channel[0]);
							}
							gateway.send('NAMES '+channel[0]+'\r\nTOPIC '+channel[0]+'\r\nMODE '+channel[0]);
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
				gateway.findChannel(chan).appendMessage(messagePatterns.mode, [gateway.niceTime(), chan, mody.join(" ")]);
			}
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
				gateway.send('CAP REQ :multi-prefix userhost-in-names\r\nCAP END\r\nNAMES '+msg.args[1]);
				var ckNick = settings.getCookie('origNick');
  			 	if(ckNick){
					gateway.send('SETNAME Użytkownik bramki PIRC.pl "' + ckNick + '"');
				}
			}
		}
	],
	'346': [	// RPL_INVITELIST
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.invexListElement, [gateway.niceTime(), msg.args[2], msg.args[3], $$.parseTime(msg.args[4])]);
			}
		}
	],
	'347': [	// RPL_INVITELIST
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.invexListEnd, [gateway.niceTime()]);
			}
		}			
	],
	'348': [	// RPL_EXCEPTLIST
		function(msg) {
		/*	if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.exceptListElement, [gateway.niceTime(), msg.args[2], msg.args[3], $$.parseTime(msg.args[4])]);
			}*/
			if($('.statuswindow').is(':visible') || $('.status-text table').length == 0){
				$('.statuswindow').hide();
				var html = '<h3>Lista wyjątków od banów na kanale '+he(msg.args[1])+'</h3><table><tr><th>Maska</th><th>Założony przez</th><th>Data</th></tr></table>';
				$('.status-text').html(html);
			}
			var chanId = gateway.findChannel(msg.args[1]).id;
			var html = '<tr><td>'+he(msg.args[2])+'</td><td>'+he(msg.args[3])+'</td><td>'+$$.parseTime(msg.args[4])+'</td>' +
				'<td class="'+chanId+'-operActions button" style="display:none">' +
				'<button id="unex-'+chanId+'-'+md5(msg.args[2])+'">Usuń</button>' +
				'</td></tr>';
			$('.status-text table').append(html);
			$('#unex-'+chanId+'-'+md5(msg.args[2])).click(function(){
				gateway.send('MODE '+msg.args[1]+' -e '+msg.args[2]+'\r\nMODE '+msg.args[1]+' e');
				$('.status-text table').remove();
			});
		}
	],
	'349': [	// RPL_ENDOFEXCEPTLIST 
		function(msg) {
			/*if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.exceptListEnd, [gateway.niceTime()]);
			}*/
			if($('.status-text table').length == 0){
				var html = '<h3>Lista wyjątków na kanale '+he(msg.args[1])+'</h3><p>Lista jest pusta.</p>';
				$('.status-text').html(html);
			}
			$('.statuswindow').fadeIn(250);
		}
	],
	'367': [	// RPL_BANLIST 
		function(msg) {
		/*	if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.banListElement, [gateway.niceTime(), msg.args[2], msg.args[3], $$.parseTime(msg.args[4])]);
			}*/
			if($('.statuswindow').is(':visible') || $('.status-text table').length == 0){
				$('.statuswindow').hide();
				var html = '<h3>Lista banów na kanale '+he(msg.args[1])+'</h3><div class="beIListContents"><table><tr><th>Maska</th><th>Założony przez</th><th>Data</th></tr></table></div>';
				$('.status-text').html(html);
			}
			var chanId = gateway.findChannel(msg.args[1]).id;
			var html = '<tr><td>'+he(msg.args[2])+'</td><td>'+he(msg.args[3])+'</td><td>'+$$.parseTime(msg.args[4])+'</td>' +
				'<td class="'+chanId+'-operActions button" style="display:none">' +
				'<button id="unban-'+chanId+'-'+md5(msg.args[2])+'">Usuń</button>' +
				'</td></tr>';
			$('.status-text table').append(html);
			$('#unban-'+chanId+'-'+md5(msg.args[2])).click(function(){
				gateway.send('MODE '+msg.args[1]+' -b '+msg.args[2]+'\r\nMODE '+msg.args[1]+' b');
				$('.status-text table').remove();
			});
		}
	],
	'368': [	// RPL_ENDOFBANLIST
		function(msg) {
		/*	if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.banListEnd, [gateway.niceTime()]);
			}*/
			if($('.status-text table').length == 0){
				var html = '<h3>Lista banów na kanale '+he(msg.args[1])+'</h3><p>Lista jest pusta.</p>';
				$('.status-text').html(html);
			}
			$('.statuswindow').fadeIn(250);
		}			
	],
	'372': [	// RPL_MOTD
		function(msg) {
			gateway.statusWindow.appendMessage(messagePatterns.motd, [gateway.niceTime(), msg.text]);
		}
	],
	'INVITE': [
		function(msg) {
			gateway.lastNoticeNick = false;
			$(".notice-text").append("<h3>Zaproszenie</h3><p><b>"+he(msg.sender.nick)+"</b> zaprasza Cię na kanał <a href=\"javascript:gateway.send('JOIN "+msg.text+"');gateway.closeNotice();\" onclick=\"return confirm('Czy na pewno chcesz dołączyć do kanału "+msg.text+"?')\">"+he(msg.text)+"</a></p>");
			$(".noticewindow").fadeIn(250);
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
			var html = "<h3>Nie można wykonać żądanej akcji</h3>" +
				"<p>"+he(msg.args[1])+": nie ma takiego nicku ani kanału.";
			$(".notify-text").html(html);
			gateway.statusWindow.appendMessage(messagePatterns.noSuchNick, [gateway.niceTime(), he(msg.args[1])]);
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
		}
	],
	'403': [	// ERR_NOSUCHCHANNEL 
		function(msg) {
			var html = "<h3>Nie można wykonać żądanej akcji</h3>" +
				"<p>"+he(msg.args[1])+": nie ma takiego kanału.";
			$(".notify-text").html(html);
			gateway.statusWindow.appendMessage(messagePatterns.noSuchChannel, [gateway.niceTime(), he(msg.args[1])]);
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
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
				} else {
					reason = msg.text;
				}
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.cannotSendToChan, [gateway.niceTime(), msg.args[1], reason])
			}
		}
	],
	'432' : [	// ERR_ERRONEUSNICKNAME 
		function(msg) {
			var html = "<h3>Nie można zmienić nicka </h3>" +
				"<p>Nie można użyć nicka <b>"+ msg.args[1] +"</b>. Spróbuj poczekać kilka minut.</p>";
			if(gateway.connectStatus != statusDisconnected){
				html += "<p>Twój bieżący nick to <b>"+guser.nick+"</b>.</p>";
			}
			$(".notify-text").html(html);
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
			gateway.statusWindow.appendMessage(messagePatterns.badNick, [gateway.niceTime(), msg.args[1]]);
		}
	],
	'433' : [	// ERR_NICKNAMEINUSE 
		function(msg) {
			var html = "<h3>Nie można zmienić nicka </h3>" +
				"<p>Nick <b>"+ msg.args[1] +"</b> jest już używany przez kogoś innego.</p>";
			if(gateway.connectStatus != statusDisconnected){
				html += "<p>Twój bieżący nick to <b>"+guser.nick+"</b>.</p>";
			}
			$(".notify-text").html(html);
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
			gateway.statusWindow.appendMessage(messagePatterns.nickInUse, [gateway.niceTime(), msg.args[1]]);
		}
	],
	'442' : [	// ERR_NOTONCHANNEL
		function(msg) {
			var html = "<h3>Nie można wykonać żądanej akcji</h3>" +
				"<p>"+he(msg.args[1])+": nie jesteś na tym kanale.";
			$(".notify-text").html(html);
			gateway.statusWindow.appendMessage(messagePatterns.notOnChannel, [gateway.niceTime(), he(msg.args[1])]);
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
		}
	],
	'443' : [	// ERR_USERONCHANNEL
		function(msg) {
			var html = "<h3>Nie można wykonać żądanej akcji</h3>" +
				"<p>"+he(msg.args[2])+": <b>"+he(msg.args[1])+"</b> jest już na tym kanale.";
			$(".notify-text").html(html);
			gateway.statusWindow.appendMessage(messagePatterns.alreadyOnChannel, [gateway.niceTime(), he(msg.args[2]), he(msg.args[1])]);
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
		}
	],
	'474' : [	// ERR_BANNEDFROMCHAN
		function(msg) {
			gateway.iKnowIAmConnected(); // TODO inne powody, przez które nie można wejść
			var html =  "<h3>Nie można dołączyć do kanału<br />" + msg.args[1] + "<br /><br /></h3>";
			if (msg.text == "Cannot join channel (+b)") {
				html += "<p>Jesteś zbanowany.</p>";
				gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Jesteś zbanowany"]);
			}
			$(".error-text").html(html);
			$(".errorwindow").fadeIn(250);
			$(".errorwindow").css('z-index', 10);
		}
	],
	'473' : [	// ERR_INVITEONLYCHAN
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "<h3>Nie można dołączyć do kanału<br />" + he(msg.args[1]) + "<br /><br /></h3>" +
				'<p>Musisz dostać zaproszenie aby wejść na ten kanał. <button onclick="gateway.send(\'KNOCK '+msg.args[1]+' :Proszę o możliwość wejścia na kanał\');gateway.closeError()">Poproś operatorów o możliwość wejścia</button></p>';
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Kanał wymaga zaproszenia"]);
			$(".error-text").html(html);
			$(".errorwindow").fadeIn(250);
			$(".errorwindow").css('z-index', 10);
		}
	],
	'480' : [	// ERR_CANNOTKNOCK
		function(msg) {
			var html = "<h3>Nie można wykonać żądanej akcji</h3>" +
				"<p>Komunikat serwera: "+he(msg.text)+"</p>";
			$(".notify-text").html(html);
			gateway.statusWindow.appendMessage(messagePatterns.alreadyOnChannel, [gateway.niceTime(), 'Komunikat serwera', he(msg.text)]);
			$(".notifywindow").fadeIn(250);
			$(".notifywindow").css('z-index', 10);
		}
	],
	'489' : [	// ERR_SECUREONLYCHAN 
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "<h3>Nie można dołączyć do kanału<br />" + he(msg.args[1]) + "<br /><br /></h3>" +
				'<p>Kanał wymaga połączenia z włączonym SSL (tryb +z). Nie jest dostępny z bramki.</p><p>Możesz spróbować użyć programu HexChat według instrukcji z <a href="http://pirc.pl/teksty/p_instalacja_i_konfiguracja" target="_blank">tej strony</a>.</p>';
			$(".error-text").html(html);
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Kanał wymaga połączenia SSL"]);
			$(".errorwindow").fadeIn(250);
			$(".errorwindow").css('z-index', 10);
		}
	],
	'475' : [	// ERR_BADCHANNELKEY
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = "<h3>Nie można dołączyć do kanału<br />" + msg.args[1] + "<br /><br /></h3>" +
				'<p>Musisz podać poprawne hasło.</p>' +
				'<form onsubmit="gateway.chanPassword(\''+he(msg.args[1])+'\');" action="javascript:void(0);">Hasło do '+he(msg.args[1])+': <input type="password" id="chpass" /> <input type="submit" value="Wejdź" /></form>';
			$(".error-text").html(html);
			gateway.statusWindow.appendMessage(messagePatterns.cannotJoin, [gateway.niceTime(), msg.args[1], "Wymagane hasło"]);
			$(".errorwindow").fadeIn(250);
			$(".errorwindow").css('z-index', 10);
		}
	],
	'482' : [	// ERR_CHANOPRIVSNEEDED 
		function(msg) {
			var html = "<h3>"+ msg.args[1] + ": brak uprawnień<br /></h3>" +
				"<p>Nie masz wystarczających uprawnień aby wykonać żądaną akcję.</p>";
			$(".error-text").html(html);
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.noPerms, [gateway.niceTime(), msg.args[1]]);
			}
			$(".errorwindow").fadeIn(250);
			$(".errorwindow").css('z-index', 10);
		}
	],
	'499' : [	// ERR_CHANOWNPRIVNEEDED
		function(msg) {
			var html = "<h3>"+ msg.args[1] + ": brak uprawnień<br /></h3>" +
				"<p>Nie masz wystarczających uprawnień aby wykonać żądaną akcję.</p>";
			$(".error-text").html(html);
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(messagePatterns.noPerms, [gateway.niceTime(), msg.args[1]]);
			}
			$(".errorwindow").fadeIn(250);
			$(".errorwindow").css('z-index', 10);
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
			
			var html = "<h3>Serwer przerwał połączenie<br /></h3>" +
				"<p>Informacje: "+msg.text+"</p>";
			$(".error-text").html(html);
			$(".errorwindow").fadeIn(400);
			
			if($('#autoReconnect').is(':checked')){
				gateway.reconnect();
			} else {
				$('#reconnect_wrapper').fadeIn(50);
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
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				var modestr = '';
				for (i in msg.args) {
					if(i != 0) {
						modestr += msg.args[i]+' ';
					}
				}
				modestr = modestr.slice(0,-1);
				gateway.findChannel(msg.args[0]).appendMessage(messagePatterns.modeChange, [gateway.niceTime(), he(msg.sender.nick), he(modestr), he(msg.args[0])]);
				var plus = true;
				var nextarg = 2;
				var modearr = msg.args[1].split('');
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
						log += "Mode 'both' "+plus+modearr[i]+msg.args[nextarg]+"\n";
						nextarg++;
					} else if($.inArray(modearr[i], modes.argAdd) > -1 && plus == true) {
						log += "Mode 'add' "+plus+modearr[i]+msg.args[nextarg]+"\n";
						nextarg++;
					} else if($.inArray(modearr[i], modes.user) > -1) {
						modechar = modearr[i];
						log += "Mode 'user' "+plus+modearr[i]+msg.args[nextarg]+"\n";
						if(plus) {
							if(gateway.findChannel(msg.args[0]).nicklist.findNick(msg.args[nextarg])) {
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
								gateway.findChannel(msg.args[0]).nicklist.findNick(msg.args[nextarg]).setMode(mode, true);
							}
						} else {
							if(gateway.findChannel(msg.args[0]).nicklist.findNick(msg.args[nextarg])) {
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
								gateway.findChannel(msg.args[0]).nicklist.findNick(msg.args[nextarg]).setMode(mode, false);
							}
						}
						nextarg++;
					} else {
						log += "Mode 'normal' "+plus+modearr[i]+"\n";
					}
				}
			}
		}
	]
};
