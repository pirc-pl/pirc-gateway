var commands = {
	'quit': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			clearTimeout(gateway.connectTimeoutID);
			gateway.userQuit = true;
			gateway.connectStatus = statusDisconnected;
			var button = [ {
				text: 'Połącz ponownie',
				click: function(){
					gateway.reconnect();
				}
			} ];
			$$.displayDialog('connect', 'reconnect', 'Rozłączono', '<p>Rozłączono z IRC na życzenie.<p>', button);
			if (input.slice(1).substr(command[0].length+1) != "") {
				gateway.send("QUIT :" + input.slice(1).substr(command[0].length+1));
			} else {
				gateway.send("\r\nQUIT");
			}
		}
	},
	'exit': {
		'callback': 'quit'
	},
	'quote': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			gateway.send(input.slice(1).substr(command[0].length+1));
		}
	},
	'away': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if(!command[1]){
				gateway.send('AWAY');
			} else {
				gateway.send('AWAY '+input.substring(input.indexOf(' ')));
			}
		}
	},
	'raw': {
		'callback': 'quote'
	},
	'nick': {
		'channels': false,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				gateway.send("NICK "+command[1]);
			} else {
				gateway.notEnoughParams("nick", "musisz podać na co chcesz zmienić swój obecny nick.");
			}
		}
	},
	'whois': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				gateway.send("WHOIS "+command[1]+" "+command[1]);
				if(command[1].toLowerCase() == guser.nick.toLowerCase()){
					gateway.displayOwnWhois = true;
				}
			} else {
				gateway.notEnoughParams("whois", "musisz podać nick osoby o której chcesz zdobyć informację.");
			}
		}
	},
	'wii': {
		'callback': 'whois'
	},
	'query': {
		'channels': false,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1] != "") {
				gateway.findOrCreate(command[1]);
			} else {
				gateway.notEnoughParams("query", "musisz podać nick osoby z którą chcesz rozpocząć prywatną rozmowę");
			}
		}
	},
	'list': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			/*if (command[1]) {
				if (command[1] != "-YES") {
					gateway.notEnoughParams("list", "wpisywanie /list nie jest dobrym pomysłem, jako że możesz pobrać bardzo dużą ilość danych. Jeśli chcesz jednak to zrobić, dopisz -YES do polecenia.");
				} else {
					gateway.send("LIST"+input.substr(10));
				}
			} else {
				gateway.notEnoughParams("list", "wpisywanie /list nie jest dobrym pomysłem, jako że możesz pobrać bardzo dużą ilość danych. Jeśli chcesz jednak to zrobić, dopisz -YES do polecenia.");
			}*/
			if(!command[1] || command[1] == '-YES'){
				gateway.send('LIST');
			} else {
				gateway.send('LIST '+input.substring(input.indexOf(' ')));
			}
			if(gateway.active != '--status'){
				gateway.getActive().appendMessage(messagePatterns.listShown, [$$.niceTime()]);
			}
		//	disp.listWindowShow();
		}
	},
	'cs': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			command.splice(1, 0, 'ChanServ');
			commands.msg.callback(command, input);
		}
	},
	'ns': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			command.splice(1, 0, 'NickServ');
			commands.msg.callback(command, input);
		}
	},
	'hs': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			command.splice(1, 0, 'HostServ');
			commands.msg.callback(command, input);
		}
	},
	'bs': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			command.splice(1, 0, 'BotServ');
			commands.msg.callback(command, input);
		}
	},
	'ms': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			command.splice(1, 0, 'MemoServ');
			commands.msg.callback(command, input);
		}
	},
	'topic': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[1].indexOf('#') == 0) {
					if(!command[2]) {
						gateway.send("TOPIC "+command[1]);
					} else {
						var reason = '';
						if(command[2]) {
							for(var i = 2; i < command.length; i++) {
								if(i != 2) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						if(reason) {
							gateway.send("TOPIC "+command[1]+" :"+reason);
						} else {
							gateway.send("TOPIC "+command[1]);
						}
					}
				} else {
					if (gateway.getActive()) {
						var reason = '';
						if(command[1]) {
							for(var i = 1; i < command.length; i++) {
								if(i != 1) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						if(reason) {
							gateway.send("TOPIC "+gateway.active+" :"+reason);
						} else {
							gateway.send("TOPIC "+gateway.active);
						}
					} else {
						gateway.notEnoughParams("topic", "musisz podać kanał jako pierwszy argument.");
					}
				}
			} else {
				if (gateway.getActive()) {
					gateway.send("TOPIC "+gateway.active);
				} else {
					gateway.notEnoughParams("topic", "musisz podać kanał jako pierwszy argument.");
				}
			}
		}
	},
	't': {
		'callback': 'topic'
	},
	'join': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1] != "") {
				if (command[2] && command[2] != '') {
					gateway.send("JOIN "+command[1]+" "+command[2]);
				} else {
					gateway.send("JOIN "+command[1]);
				}
				if(gateway.findChannel(command[1].toLowerCase())) {
					gateway.switchTab(command[1].toLowerCase());
				}
			} else {
				gateway.notEnoughParams("join", "musisz podać kanał do którego chcesz dołączyć.");
			}
		}
	},
	'invite' : {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if(!command[1] || (!command[2] && !gateway.findChannel(gateway.active))){
				gateway.notEnoughParams("invite", "musisz podać nicka użytkownika, i nazwę kanału, na który chcesz go zaprosić.");
				return;
			}
			if(!command[2]){
				gateway.send('INVITE '+command[1]+' '+gateway.active);
			} else {
				gateway.send('INVITE '+command[1]+' '+command[2]);
			}
		}
	},
	'knock': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1] != "") {
				gateway.send("KNOCK "+command[1]);
			} else {
				gateway.notEnoughParams("knock", "musisz podać kanał do którego chcesz zapukać.");
			}
		}
	},
	'j': {
		'callback': 'join'
	},
	'notice': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				var reason = '';
				if(command[2]) {
					for(var i = 2; i < command.length; i++) {
						if(i != 2) {
							reason += ' ';
						}
						reason += command[i];
					}
				}
				if(reason) {
					gateway.send("NOTICE "+command[1]+" :"+reason);
					if($("#noticeDisplay").val() == 2) { // notice w statusie
						gateway.statusWindow.appendMessage(messagePatterns.yourNotice, [$$.niceTime(), command[1], reason]);
					} else if($("#noticeDisplay").val() == 1) { // notice jako query
						var query = gateway.findOrCreate(command[1]);
						query.appendMessage(messagePatterns.yourNotice, [$$.niceTime(), command[1], reason]);
					} else if($("#noticeDisplay").val() == 0) { // notice jako okienko
						var html = "<span class=\"notice\">[<b>"+he(guser.nick)+" → "+command[1] + "</b>]</span> " + $$.colorize(reason);
						$$.displayDialog('notice', command[1], 'Komunikat prywatny od '+command[1], html);
					}
				} else {
					gateway.notEnoughParams("notice", "musisz podać treść wiadomości którą chcesz wysłać.");
				}
			} else {
				gateway.notEnoughParams("notice", "musisz podać nick osoby do której chcesz napisać i tekst który chcesz jej wysłać.");
			}
		}
	},
	'msg': {  /// TODO /msg #kanal
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				var reason = '';
				if(command[2]) {
					for(var i = 2; i < command.length; i++) {
						if(i != 2) {
							reason += ' ';
						}
						reason += command[i];
					}
				}
				if(reason) {
					gateway.send("PRIVMSG "+command[1]+" :"+reason);
					
				//	var serviceNicks = [ 'nickserv', 'chanserv', 'hostserv', 'operserv', 'botserv' ];
					
				//	if(serviceNicks.indexOf(command[1].toLowerCase()) > -1){
					if(command[1].isInList(servicesNicks)){
						var displayAsQuery = Boolean(query);
					
						if(displayAsQuery || $("#noticeDisplay").val() == 1){ // query
							var query = gateway.findOrCreate(command[1]);
							query.appendMessage(messagePatterns.yourMsg, [$$.niceTime(), $$.nickColor(guser.nick), guser.nick, $$.colorize(reason)]);
							query.appendMessage('%s', [$$.parseImages(reason)]);
						} else if($("#noticeDisplay").val() == 0){ // okienko
							var html = "<span class=\"notice\">[<b>"+he(guser.nick)+" → "+command[1] + "</b>]</span> " + $$.colorize(reason);
//							$$.displayDialog('notice', command[1], 'Komunikat prywatny od '+command[1], html);
							$$.displayDialog('notice', 'service', 'Komunikat od usługi sieciowej', html);
						} else { // status
							gateway.statusWindow.appendMessage(messagePatterns.yourMsg, [$$.niceTime(), $$.nickColor(guser.nick), guser.nick + ' → ' + command[1], $$.colorize(reason)]);
						}
					}
					
					
				} else {
					gateway.notEnoughParams("msg", "musisz podać treść wiadomości którą chcesz wysłać.");
				}
			} else {
				gateway.notEnoughParams("msg", "musisz podać nick osoby do której chcesz napisać i tekst który chcesz jej wysłać.");
			}
		}
	},
	'part': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[1].indexOf('#') == 0) {
					if(!command[2]) {
						gateway.send("PART "+command[1]);
					} else {
						var reason = '';
						if(command[2]) {
							for(var i = 2; i < command.length; i++) {
								if(i != 2) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						if(reason) {
							gateway.send("PART "+command[1]+" :"+reason);
						} else {
							gateway.send("PART "+command[1]);
						}
						gateway.removeChannel(command[1].toLowerCase())
					}
				} else {
					if (gateway.getActive()) {
						var reason = '';
						if(command[1]) {
							for(var i = 1; i < command.length; i++) {
								if(i != 1) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						if(reason) {
							gateway.send("PART "+gateway.active+" :"+reason);
						} else {
							gateway.send("PART "+gateway.active);
						}
						gateway.removeChannel(gateway.active.toLowerCase())
					} else {
						gateway.notEnoughParams("part", "musisz podać kanał z którego chcesz wyjść jako pierwszy argument.");
					}
				}
			} else {
				if (gateway.getActive()) {
					gateway.send("PART "+gateway.active);
				} else {
					gateway.notEnoughParams("part", "musisz podać kanał z którego chcesz wyjść jako pierwszy argument.");
				}
			}
		}
	},
	'kick': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[1].indexOf('#') == 0) {
					if(!command[2]) {
						gateway.notEnoughParams("kick", "musisz podać kanał z którego chcesz wykopać tę osobę jako pierwszy argument.");
					} else {
						var reason = '';
						if(command[3]) {
							for(var i = 3; i < command.length; i++) {
								if(i != 3) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						if(reason) {
							gateway.send("KICK "+command[1]+" "+command[2]+" :"+reason);
						} else {
							gateway.send("KICK "+command[1]+" "+command[2]);
						}
					}
				} else {
					if (gateway.getActive()) {
						var reason = '';
						if(command[2]) {
							for(var i = 2; i < command.length; i++) {
								if(i != 2) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						if(reason) {
							gateway.send("KICK "+gateway.active+" "+command[1]+" :"+reason);
						} else {
							gateway.send("KICK "+gateway.active+" "+command[1]);
						}
					} else {
						gateway.notEnoughParams("kick", "musisz podać kanał z którego chcesz wykopać tę osobę jako pierwszy argument.");
					}
				}
			} else {
				gateway.notEnoughParams("kick", "musisz podać nick osoby którą chcesz wykopać jako pierwszy argument.");
			}
		}
	},
	'names': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input){
			if (command[1]) {
				if (command[1].indexOf('#') != 0) {
					gateway.notEnoughParams("names", "musisz podać kanał jako pierwszy argument.");
				} else {
					ircCommand.channelNames(command[1]);
				}
			} else {
				if (gateway.getActive()) {
					ircCommand.channelNames(gateway.active);
				} else {
					gateway.notEnoughParams("names", "musisz podać kanał jako pierwszy argument.");
				}
			}
		}
	},
	'me': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if (gateway.getActive()) {
					var tabToSend = gateway.findChannel(gateway.active);
					if(!tabToSend){
						tabToSend = gateway.findQuery(gateway.active);
					}
					if(tabToSend){
						gateway.send("PRIVMSG "+gateway.active+" :\001ACTION "+input.slice(1).substr(3)+"\001");
						tabToSend.appendMessage(messagePatterns.yourAction, [$$.niceTime(), guser.nick, $$.colorize(input.slice(1).substr(3))]);
						tabToSend.appendMessage('%s', [$$.parseImages(input.slice(1).substr(3))]);
					} else {
						console.log('błąd /me !!!');
					}
				} else {
					gateway.notEnoughParams("me", "musisz być na jakimś kanale aby użyć tej komendy.");
				}
			} else {
				gateway.notEnoughParams("me", "musisz podać tekst do wysłania.");
			}
		}
	},
	'ignore': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			console.log(command);
			if(!command[1]){ //brak argumentu - listuj wszystkie
				var data = ignore.getIgnoreList();
				if(data.length == 0){
					gateway.statusWindow.appendMessage(messagePatterns.ignoreListEmpty, [$$.niceTime()]);
				} else {
					gateway.statusWindow.appendMessage(messagePatterns.ignoreListStart, [$$.niceTime()]);
					for(var i=0; i<data.length; i++){
						if(data[i][0] == 'channel'){
							var ignoreType = 'kanał';
						} else {
							var ignoreType = 'rozmowa prywatna';
						}
						var ignoreMask = data[i][1];
						gateway.statusWindow.appendMessage(messagePatterns.ignoreListItem, [$$.niceTime(), ignoreType, ignoreMask]);
					}
					gateway.statusWindow.appendMessage(messagePatterns.ignoreListEnd, [$$.niceTime()]);
				}
			} else { //są argumenty
				ignore.askIgnore(command[1]);
		/*		if(command[3] != null){
			//		gateway.notEnoughParams("ignore", "Za dużo parametrów.");
				}*/
			}
		}
	},
	'deprotect': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if(command[2]) {
					if (command[1].indexOf('#') == 0) {
						gateway.send("MODE "+command[1]+" -a "+command[2]);
					}
				} else {
					if(gateway.getActive()) {
						gateway.send("MODE "+gateway.active+" -a "+command[1]);
					} else {
						gateway.notEnoughParams("deprotect", "musisz podać kanal na ktorym chcesz odebrać uprawnienia tej osobie.");
					}
				}
			} else {
				gateway.notEnoughParams("deprotect", "musisz podać kanał na którym chcesz odebrać uprawnienia i nick osoby której chcesz je dać.");
			}
		}
	},	
	'protect': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if(command[2]) {
					if (command[1].indexOf('#') == 0) {
						gateway.send("MODE "+command[1]+" +a "+command[2]);
					}
				} else {
					if(gateway.getActive()) {
						gateway.send("MODE "+gateway.active+" +a "+command[1]);
					} else {
						gateway.notEnoughParams("protect", "musisz podać kanal na ktorym chcesz odebrać uprawnienia tej osobie.");
					}
				}
			} else {
				gateway.notEnoughParams("protect", "musisz podać kanał na którym chcesz odebrać uprawnienia i nick osoby której chcesz je dać.");
			}
		}
	},	
	'op': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if(command[2]) {
					if (command[1].indexOf('#') == 0) {
						gateway.send("MODE "+command[1]+" +o "+command[2]);
					}
				} else {
					if(gateway.getActive()) {
						gateway.send("MODE "+gateway.active+" +o "+command[1]);
					} else {
						gateway.notEnoughParams("op", "musisz podać kanal na ktorym chcesz odebrać uprawnienia tej osobie.");
					}
				}
			} else {
				gateway.notEnoughParams("op", "musisz podać kanał na którym chcesz odebrać uprawnienia i nick osoby której chcesz je dać.");
			}
		}
	},	
	'deop': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if(command[2]) {
					if (command[1].indexOf('#') == 0) {
						gateway.send("MODE "+command[1]+" -o "+command[2]);
					}
				} else {
					if(gateway.getActive()) {
						gateway.send("MODE "+gateway.active+" -o "+command[1]);
					} else {
						gateway.notEnoughParams("deop", "musisz podać kanal na ktorym chcesz odebrać uprawnienia tej osobie.");
					}
				}
			} else {
				gateway.notEnoughParams("deop", "musisz podać kanał na którym chcesz odebrać uprawnienia i nick osoby której chcesz je dać.");
			}
		}
	},	
	'voice': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if(command[2]) {
					if (command[1].indexOf('#') == 0) {
						gateway.send("MODE "+command[1]+" +v "+command[2]);
					}
				} else {
					if(gateway.getActive()) {
						gateway.send("MODE "+gateway.active+" +v "+command[1]);
					} else {
						gateway.notEnoughParams("voice", "musisz podać kanal na ktorym chcesz odebrać uprawnienia tej osobie.");
					}
				}
			} else {
				gateway.notEnoughParams("voice", "musisz podać kanał na którym chcesz odebrać uprawnienia i nick osoby której chcesz je dać.");
			}
		}
	},
	'devoice': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if(command[2]) {
					if (command[1].indexOf('#') == 0) {
						gateway.send("MODE "+command[1]+" -v "+command[2]);
					}
				} else {
					if(gateway.getActive()) {
						gateway.send("MODE "+gateway.active+" -v "+command[1]);
					} else {
						gateway.notEnoughParams("devoice", "musisz podać kanal na ktorym chcesz odebrać uprawnienia tej osobie.");
					}
				}
			} else {
				gateway.notEnoughParams("devoice", "musisz podać kanał na którym chcesz odebrać uprawnienia i nick osoby której chcesz je dać.");
			}
		}
	},	
	'mode': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				if (!command[1].indexOf('-') == 0 && !command[1].indexOf('+') == 0) {
					gateway.send("MODE " + input.slice(1).substr(command[0].length+1));
				} else {
					if (gateway.findChannel(gateway.active)) {
						 gateway.send("MODE " + gateway.active + " " + input.slice(1).substr(command[0].length+1));
					} else {
						gateway.notEnoughParams("mode", "musisz podać nick/kanał jako pierwszy argument");
					}
				}
			} else {
				gateway.notEnoughParams("mode", "musisz podać nick/kanał jako pierwszy argument");
			}
		}
	},
	'sdebug': {
		'channels': false,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			var raw = input.slice(1).substr(command[0].length+1);
			raw = raw.replace(/\\n/g, '\r\n') + '\r\n';
			data = irc.parseMessage(raw);
			gateway.processData(data);
		}
	}
/*		'join': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
		}
	}   */
}
