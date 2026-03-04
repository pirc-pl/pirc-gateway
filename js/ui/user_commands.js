/* Copyright (c) 2020-2026 k4be and the PIRC.pl Team
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

function createUserCommands(commandBus, chat, transport) {
const commands = {
	'quit': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			const quitMessage = input.slice(1).substr(command[0].length + 1);
			commandBus.emit('chat:requestQuit', { message: quitMessage });
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
			commandBus.emit('chat:sendRawCommand', { raw: input.slice(1).substr(command[0].length + 1) });
		}
	},
	'away': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (!command[1]) {
				commandBus.emit('chat:setAway', { message: null });
			} else {
				commandBus.emit('chat:setAway', { message: input.substring(input.indexOf(' ') + 1) });
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
			if (command[1]) {
				commandBus.emit('chat:changeNick', { nick: command[1] });
			} else {
				uiInput.notEnoughParams('nick', language.youHaveToGiveNewNick);
			}
		}
	},
	'whois': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				commandBus.emit('chat:queryUser', { nick: command[1] });
				if (command[1].toLowerCase() == chat.me.userRef.nick.toLowerCase()) {
					uiState.displayOwnWhois = true; // UI flag
				}
			} else {
				uiInput.notEnoughParams('whois', language.youHaveToGiveQueryNick);
			}
		}
	},
	'whowas': {
		'channels': false,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				commandBus.emit('chat:queryUserHistory', { nick: command[1] });
			} else {
				uiInput.notEnoughParams('whowas', language.youHaveToGiveQueryNick);
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
			if (command[1] != '') {
				uiTabs.findOrCreate(command[1], true); // true = set active
			} else {
				uiInput.notEnoughParams('query', language.youHaveToGivePMNick);
			}
		}
	},
	'list': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (!command[1] || command[1] == '-YES') {
				commandBus.emit('chat:listChannels', {});
			} else {
				commandBus.emit('chat:listChannels', { pattern: input.substring(input.indexOf(' ') + 1) });
			}
			// If no list window was opened (no labeled-response), list goes to status tab
			if (!uiState.listWindow && uiState.active != '--status') {
				uiTabs.getActive().appendMessage(language.messagePatterns.listShown, [$$.niceTime()]);
			}
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
			let reason, i;
			if (command[1]) {
				if (command[1].indexOf('#') == 0) {
					if (!command[2]) {
						commandBus.emit('chat:setTopic', { channel: command[1] });
					} else {
						reason = '';
						if (command[2]) {
							for (i = 2; i < command.length; i++) {
								if (i != 2) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						commandBus.emit('chat:setTopic', { channel: command[1], text: reason });
					}
				} else {
					if (uiTabs.getActive()) {
						reason = '';
						if (command[1]) {
							for (i = 1; i < command.length; i++) {
								if (i != 1) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						commandBus.emit('chat:setTopic', { channel: uiState.active, text: reason });
					} else {
						uiInput.notEnoughParams('topic', language.youHaveToGiveChanFirstArg);
					}
				}
			} else {
				if (uiTabs.getActive()) {
					commandBus.emit('chat:setTopic', { channel: uiState.active });
				} else {
					uiInput.notEnoughParams('topic', language.youHaveToGiveChanFirstArg);
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
			if (command[1] != '') {
				if (command[2] && command[2] != '') {
					commandBus.emit('chat:joinChannel', { channels: command[1], password: command[2] });
				} else {
					commandBus.emit('chat:joinChannel', { channels: command[1] });
				}
				if (uiTabs.findChannel(command[1].toLowerCase())) {
					uiTabs.switchTab(command[1].toLowerCase());
				}
			} else {
				uiInput.notEnoughParams('join', language.youHaveToGiveChannelToJoin);
			}
		}
	},
	'invite': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (!command[1] || (!command[2] && !uiTabs.findChannel(uiState.active))) {
				uiInput.notEnoughParams('invite', language.youHaveToGiveInviteNickChannel);
				return;
			}
			if (!command[2]) {
				commandBus.emit('chat:inviteUser', { channel: uiState.active, nick: command[1] });
			} else {
				commandBus.emit('chat:inviteUser', { channel: command[2], nick: command[1] });
			}
		}
	},
	'knock': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1] != '') {
				commandBus.emit('chat:knockChannel', { channel: command[1] });
			} else {
				uiInput.notEnoughParams('knock', language.youHaveToGiveKnockChan);
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
				let reason = '';
				if (command[2]) {
					for (let i = 2; i < command.length; i++) {
						if (i != 2) {
							reason += ' ';
						}
						reason += command[i];
					}
				}
				if (reason) {
					commandBus.emit('chat:requestSendMessage', { target: command[1], message: reason, notice: true });
				} else {
					uiInput.notEnoughParams('notice', language.youHaveToGiveMsgText);
				}
			} else {
				uiInput.notEnoughParams('notice', language.youHaveToGiveMsgNickText);
			}
		}
	},
	'msg': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				let reason = '';
				if (command[2]) {
					for (let i = 2; i < command.length; i++) {
						if (i != 2) {
							reason += ' ';
						}
						reason += command[i];
					}
				}
				if (reason) {
					commandBus.emit('chat:requestSendMessage', { target: command[1], message: reason });
				} else {
					uiInput.notEnoughParams('msg', language.youHaveToGiveMsgText);
				}
			} else {
				uiInput.notEnoughParams('msg', language.youHaveToGiveMsgNickText);
			}
		}
	},
	'part': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			let reason, i;
			if (command[1]) {
				if (command[1].indexOf('#') == 0) {
					if (!command[2]) {
						commandBus.emit('chat:requestRemoveChannel', { channelName: command[1] });
					} else {
						reason = '';
						if (command[2]) {
							for (i = 2; i < command.length; i++) {
								if (i != 2) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						commandBus.emit('chat:requestRemoveChannel', { channelName: command[1], message: reason });
					}
				} else {
					if (uiTabs.getActive()) {
						reason = '';
						if (command[1]) {
							for (i = 1; i < command.length; i++) {
								if (i != 1) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						commandBus.emit('chat:requestRemoveChannel', { channelName: uiState.active, message: reason });
					} else {
						uiInput.notEnoughParams('part', language.youHaveToGivePartChan);
					}
				}
			} else {
				if (uiTabs.getActive()) {
					commandBus.emit('chat:requestRemoveChannel', { channelName: uiState.active });
				} else {
					uiInput.notEnoughParams('part', language.youHaveToGivePartChan);
				}
			}
		}
	},
	'kick': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			let reason, i;
			if (command[1]) {
				if (command[1].indexOf('#') == 0) {
					if (!command[2]) {
						uiInput.notEnoughParams('kick', language.youHaveToGiveKickChan);
					} else {
						reason = '';
						if (command[3]) {
							for (i = 3; i < command.length; i++) {
								if (i != 3) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						commandBus.emit('chat:kickUser', { channel: command[1], nick: command[2], reason });
					}
				} else {
					if (uiTabs.getActive()) {
						reason = '';
						if (command[2]) {
							for (i = 2; i < command.length; i++) {
								if (i != 2) {
									reason += ' ';
								}
								reason += command[i];
							}
						}
						commandBus.emit('chat:kickUser', { channel: uiState.active, nick: command[1], reason });
					} else {
						uiInput.notEnoughParams('kick', language.youHaveToGiveKickChan);
					}
				}
			} else {
				uiInput.notEnoughParams('kick', language.youHaveToGiveKickNick);
			}
		}
	},
	'names': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[1].indexOf('#') != 0) {
					uiInput.notEnoughParams('names', language.youHaveToGiveChanFirstArg);
				} else {
					commandBus.emit('chat:requestChannelMembers', { channel: command[1] });
				}
			} else {
				if (uiTabs.getActive()) {
					commandBus.emit('chat:requestChannelMembers', { channel: uiState.active });
				} else {
					uiInput.notEnoughParams('names', language.youHaveToGiveChanFirstArg);
				}
			}
		}
	},
	'me': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (uiTabs.getActive()) {
					commandBus.emit('chat:sendAction', { dest: uiState.active, text: input.slice(1).substr(3) });
				} else {
					uiInput.notEnoughParams('me', language.youHaveToBeOnChan);
				}
			} else {
				uiInput.notEnoughParams('me', language.youHaveToGiveMsgText);
			}
		}
	},
	'ignore': {
		'channels': true,
		'nicks': true,
		'custom': [],
		'callback': function(command, input) {
			if (!command[1]) { //brak argumentu - listuj wszystkie
				const data = ignore.getIgnoreList();
				if (data.length == 0) {
					uiState.statusWindow.appendMessage(language.messagePatterns.ignoreListEmpty, [$$.niceTime()]);
				} else {
					uiState.statusWindow.appendMessage(language.messagePatterns.ignoreListStart, [$$.niceTime()]);
					for (const [ignoreT, ignoreMask] of data) {
						let ignoreType;
						if (ignoreT == 'channel') {
							ignoreType = language.channelSmall;
						} else {
							ignoreType = language.privateDiscussionSmall;
						}
						uiState.statusWindow.appendMessage(language.messagePatterns.ignoreListItem, [$$.niceTime(), ignoreType, he(ignoreMask)]);
					}
					uiState.statusWindow.appendMessage(language.messagePatterns.ignoreListEnd, [$$.niceTime()]);
				}
			} else { //są argumenty
				commandBus.emit('chat:requestIgnoreUser', { nick: command[1] });
				/*		if(command[3] != null){
			//			uiInput.notEnoughParams("ignore", "Za dużo parametrów.");
				}*/
			}
		}
	},
	'deprotect': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[2]) {
					if (command[1].indexOf('#') == 0) {
						commandBus.emit('chat:requestModeChange', { target: command[1], modeString: `-a ${command[2]}` });
					}
				} else {
					if (uiTabs.getActive()) {
						commandBus.emit('chat:requestModeChange', { target: uiState.active, modeString: `-a ${command[1]}` });
					} else {
						uiInput.notEnoughParams('deprotect', language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				uiInput.notEnoughParams('deprotect', language.youHaveToGiveChannelAndNickToTakeGivePerms);
			}
		}
	},
	'protect': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[2]) {
					if (command[1].indexOf('#') == 0) {
						commandBus.emit('chat:requestModeChange', { target: command[1], modeString: `+a ${command[2]}` });
					}
				} else {
					if (uiTabs.getActive()) {
						commandBus.emit('chat:requestModeChange', { target: uiState.active, modeString: `+a ${command[1]}` });
					} else {
						uiInput.notEnoughParams('protect', language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				uiInput.notEnoughParams('protect', language.youHaveToGiveChannelAndNickToTakeGivePerms);
			}
		}
	},
	'op': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[2]) {
					if (command[1].indexOf('#') == 0) {
						commandBus.emit('chat:requestModeChange', { target: command[1], modeString: `+o ${command[2]}` });
					}
				} else {
					if (uiTabs.getActive()) {
						commandBus.emit('chat:requestModeChange', { target: uiState.active, modeString: `+o ${command[1]}` });
					} else {
						uiInput.notEnoughParams('op', language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				uiInput.notEnoughParams('op', language.youHaveToGiveChannelAndNickToTakeGivePerms);
			}
		}
	},
	'deop': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[2]) {
					if (command[1].indexOf('#') == 0) {
						commandBus.emit('chat:requestModeChange', { target: command[1], modeString: `-o ${command[2]}` });
					}
				} else {
					if (uiTabs.getActive()) {
						commandBus.emit('chat:requestModeChange', { target: uiState.active, modeString: `-o ${command[1]}` });
					} else {
						uiInput.notEnoughParams('deop', language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				uiInput.notEnoughParams('deop', language.youHaveToGiveChannelAndNickToTakeGivePerms);
			}
		}
	},
	'voice': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[2]) {
					if (command[1].indexOf('#') == 0) {
						commandBus.emit('chat:requestModeChange', { target: command[1], modeString: `+v ${command[2]}` });
					}
				} else {
					if (uiTabs.getActive()) {
						commandBus.emit('chat:requestModeChange', { target: uiState.active, modeString: `+v ${command[1]}` });
					} else {
						uiInput.notEnoughParams('voice', language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				uiInput.notEnoughParams('voice', language.youHaveToGiveChannelAndNickToTakeGivePerms);
			}
		}
	},
	'devoice': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (command[2]) {
					if (command[1].indexOf('#') == 0) {
						commandBus.emit('chat:requestModeChange', { target: command[1], modeString: `-v ${command[2]}` });
					}
				} else {
					if (uiTabs.getActive()) {
						commandBus.emit('chat:requestModeChange', { target: uiState.active, modeString: `-v ${command[1]}` });
					} else {
						uiInput.notEnoughParams('devoice', language.youHaveToGiveChannelToTakeGivePerms);
					}
				}
			} else {
				uiInput.notEnoughParams('devoice', language.youHaveToGiveChannelAndNickToTakeGivePerms);
			}
		}
	},
	'mode': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			if (command[1]) {
				if (!command[1].indexOf('-') == 0 && !command[1].indexOf('+') == 0) {
					commandBus.emit('chat:requestModeChange', { target: command[1], modeString: input.slice(1).substr(command[0].length + 1 + command[1].length + 1) });
				} else {
					if (uiTabs.getActive()) {
						commandBus.emit('chat:requestModeChange', { target: uiState.active, modeString: input.slice(1).substr(command[0].length + 1) });
					} else {
						uiInput.notEnoughParams('mode', language.youHaveToGiveChanOrNick);
					}
				}
			} else {
				uiInput.notEnoughParams('mode', language.youHaveToGiveChanOrNick);
			}
		}
	},
	'sdebug': {
		'channels': false,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
			let raw = input.slice(1).substr(command[0].length + 1);
			raw = `${raw.replace(/\n/g, '\r\n')  }\r\n`;
			data = irc.parseMessage(raw);
			transport.processData(data);
		}
	}
/*		'join': {
		'channels': true,
		'nicks': false,
		'custom': [],
		'callback': function(command, input) {
		}
	}   */
};
return commands;
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { createUserCommands };
}
