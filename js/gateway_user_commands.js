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

var commands = {
	'quit': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			clearTimeout(gateway.connectTimeoutID);
			gateway.userQuit = true;
			gateway.connectStatus = 'disconnected';
			var button = [ {
				text: language.reconnect,
				click: function(){
					gateway.reconnect();
				}
			} ];
			$$.displayDialog('connect', 'reconnect', language.disconnected, '<p>' + language.disconnectOnRequest + '<p>', button);
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
				gateway.notEnoughParams("nick", language.youHaveToGiveNewNick);
			}
		}
	},
	'whois': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				ircCommand.whois(command[1]);
				if(command[1].toLowerCase() == guser.nick.toLowerCase()){
					gateway.displayOwnWhois = true;
				}
			} else {
				gateway.notEnoughParams("whois", language.youHaveToGiveQueryNick);
			}
		}
	},
	'whowas': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if(command[1]) {
				ircCommand.whowas(command[1]);
			} else {
				gateway.notEnoughParams("whowas", language.youHaveToGiveQueryNick);
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
				gateway.notEnoughParams("query", language.youHaveToGivePMNick);
			}
		}
	},
	'list': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if(!command[1] || command[1] == '-YES'){
				gateway.send('LIST');
			} else {
				gateway.send('LIST '+input.substring(input.indexOf(' ')));
			}
			if(gateway.active != '--status'){
				gateway.getActive().appendMessage(language.messagePatterns.listShown, [$$.niceTime()]);
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
						gateway.notEnoughParams("topic", language.youHaveToGiveChanFirstArg);
					}
				}
			} else {
				if (gateway.getActive()) {
					gateway.send("TOPIC "+gateway.active);
				} else {
					gateway.notEnoughParams("topic", language.youHaveToGiveChanFirstArg);
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
				gateway.notEnoughParams("join", language.youHaveToGiveChannelToJoin);
			}
		}
	},
	'invite' : {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if(!command[1] || (!command[2] && !gateway.findChannel(gateway.active))){
				gateway.notEnoughParams("invite", language.youHaveToGiveInviteNickChannel);
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
				gateway.notEnoughParams("knock", language.youHaveToGiveKnockChan);
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
					ircCommand.sendMessage(command[1], reason, true);
				} else {
					gateway.notEnoughParams("notice", language.youHaveToGiveMsgText);
				}
			} else {
				gateway.notEnoughParams("notice", language.youHaveToGiveMsgNickText);
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
					ircCommand.sendMessage(command[1], reason, false);
				} else {
					gateway.notEnoughParams("msg", language.youHaveToGiveMsgText);
				}
			} else {
				gateway.notEnoughParams("msg", language.youHaveToGiveMsgNickText);
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
						gateway.notEnoughParams("part", language.youHaveToGivePartChan);
					}
				}
			} else {
				if (gateway.getActive()) {
					gateway.send("PART "+gateway.active);
				} else {
					gateway.notEnoughParams("part", language.youHaveToGivePartChan);
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
						gateway.notEnoughParams("kick", language.youHaveToGiveKickChan);
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
						gateway.notEnoughParams("kick", language.youHaveToGiveKickChan);
					}
				}
			} else {
				gateway.notEnoughParams("kick", language.youHaveToGiveKickNick);
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
					gateway.notEnoughParams("names", language.youHaveToGiveChanFirstArg);
				} else {
					ircCommand.channelNames(command[1]);
				}
			} else {
				if (gateway.getActive()) {
					ircCommand.channelNames(gateway.active);
				} else {
					gateway.notEnoughParams("names", language.youHaveToGiveChanFirstArg);
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
					ircCommand.sendAction(gateway.active, input.slice(1).substr(3));
				} else {
					gateway.notEnoughParams("me", language.youHaveToBeOnChan);
				}
			} else {
				gateway.notEnoughParams("me", language.youHaveToGiveMsgText);
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
					gateway.statusWindow.appendMessage(language.messagePatterns.ignoreListEmpty, [$$.niceTime()]);
				} else {
					gateway.statusWindow.appendMessage(language.messagePatterns.ignoreListStart, [$$.niceTime()]);
					for(var i=0; i<data.length; i++){
						if(data[i][0] == 'channel'){
							var ignoreType = language.channelSmall;
						} else {
							var ignoreType = language.privateDiscussionSmall;
						}
						var ignoreMask = data[i][1];
						gateway.statusWindow.appendMessage(language.messagePatterns.ignoreListItem, [$$.niceTime(), ignoreType, ignoreMask]);
					}
					gateway.statusWindow.appendMessage(language.messagePatterns.ignoreListEnd, [$$.niceTime()]);
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
						gateway.notEnoughParams("deprotect", language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				gateway.notEnoughParams("deprotect", language.youHaveToGiveChannelAndNickToTakeGivePerms);
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
						gateway.notEnoughParams("protect", language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				gateway.notEnoughParams("protect", language.youHaveToGiveChannelAndNickToTakeGivePerms);
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
						gateway.notEnoughParams("op", language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				gateway.notEnoughParams("op", language.youHaveToGiveChannelAndNickToTakeGivePerms);
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
						gateway.notEnoughParams("deop", language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				gateway.notEnoughParams("deop", language.youHaveToGiveChannelAndNickToTakeGivePerms);
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
						gateway.notEnoughParams("voice", language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				gateway.notEnoughParams("voice", language.youHaveToGiveChannelAndNickToTakeGivePerms);
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
						gateway.notEnoughParams("devoice", language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				gateway.notEnoughParams("devoice", language.youHaveToGiveChannelAndNickToTakeGivePerms);
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
						gateway.notEnoughParams("mode", language.youHaveToGiveChanOrNick);
					}
				}
			} else {
				gateway.notEnoughParams("mode", language.youHaveToGiveChanOrNick);
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
