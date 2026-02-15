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

var ircCommand = {
	'escapeTagValue': function(value){
		// IRC message-tags escaping per spec
		if (typeof value !== 'string') {
			value = String(value);
		}
		return value
			.replace(/\\/g, '\\')
			.replace(/;/g, '\:')
			.replace(/ /g, '\s')
			.replace(/\r/g, '\r')
			.replace(/\n/g, '\n');
	},
	'perform': function(command, args, text, tags){
		ircCommand.send(command, args, text, tags);
	},
	'performQuick': function(command, args, text, tags){ // TODO zrobić
		ircCommand.send(command, args, text, tags);
	},
	'performSlow': function(command, args, text, tags){ // TODO zrobić
		ircCommand.send(command, args, text, tags);
	},
	'flushCmdQueue': function(){ // TODO zrobić
	},
	'send': function(command, args, text, tags){
		var cmdString = '';
		if(tags && ('message-tags' in activeCaps)){ // Direct access to global activeCaps
			cmdString += '@';
			var first = true;
			for(tagName in tags){
				if(!first){
					cmdString += ';';
				}
				first = false;
				cmdString += tagName;
				if(tags[tagName]){
					cmdString += '=' + ircCommand.escapeTagValue(tags[tagName]);
				}
			}
			cmdString += ' ';
		}
		if(tags && ('labeled-response' in activeCaps) && 'label' in tags){ // Direct access to global activeCaps
			ircEvents.emit('domain:setLabelInfo', { label: tags.label, info: { cmd: command } }); // Set labelInfo via domain event
		}
		if(!command){
			if('message-tags' in activeCaps){ // Direct access to global activeCaps
				command = 'TAGMSG';
			} else return;
		}
		cmdString += command;
		if(args){
			for(var i=0; i<args.length; i++){
				cmdString += ' '+args[i];
			}
		}
		if(text){
			cmdString += ' :'+text;
		}
		gateway.send(cmdString); // TODO przenieść buforowanie tutaj
	},
	'sendMessage': function(dest, text, notice, slow, hide=false){
		if(notice){
			var cmd = 'NOTICE';
		} else {
			var cmd = 'PRIVMSG';
		}
		var label = generateLabel(); // Get label from domain
		ircEvents.emit('domain:setLabelCallback', { label: label, callback: gateway.msgNotDelivered }); // Set callback via domain event
		if(slow){
			ircCommand.performSlow(cmd, [dest], text, {'label': label});
		} else {
			ircCommand.perform(cmd, [dest], text, {'label': label});
		}
		if(hide){
			ircEvents.emit('domain:addLabelToHide', { label: label }); // Add to labelsToHide via domain event
		} else {
			// Emit domain event for outgoing message display (with pending state)
			ircEvents.emit('domain:outgoingMessage', {
				messageType: cmd,
				dest: dest,
				text: text,
				label: label,
				sender: guser.me,
				time: new Date()
			});
		}
	},
	'sendAction': function(dest, text){
		var ctcp = '\001' + 'ACTION ' + text + '\001';
		var label = generateLabel(); // Get label from domain
		ircEvents.emit('domain:setLabelCallback', { label: label, callback: gateway.msgNotDelivered }); // Set callback via domain event
		ircCommand.performSlow('PRIVMSG', [dest], ctcp, {'label': label});
		// Emit domain event for outgoing action display (with pending state)
		ircEvents.emit('domain:outgoingMessage', {
			messageType: 'ACTION',
			dest: dest,
			text: text,
			label: label,
			sender: guser.me,
			time: new Date()
		});
	},
	'sendMessageSlow': function(dest, text, notice){
		ircCommand.sendMessage(dest, text, notice, true);
	},
	'channelInvite': function(channel, user){
		ircCommand.perform('INVITE', [user, channel]);
	},
	'channelKick': function(channel, user, reason){
		if(!reason || reason == ''){
			ircCommand.performQuick('KICK', [channel, user]);
		} else {
			ircCommand.performQuick('KICK', [channel, user], reason);
		}
	},
	'channelHistory': function(channel, lines){
		var args = [channel];
		if(lines)
			args.push(lines);
	//	var label = generateLabel(); // Get label from domain
	//	var tags = {'label': label};
		var tags = false;
		ircCommand.send('HISTORY', args, false, tags);
	},
	'chathistory': function(subcommand, target, param1, param2, limit){
		// CHATHISTORY <subcommand> <target> <timestamp | msgid> [<timestamp | msgid>] <limit>
		var args = [subcommand, target];
		if(param2 !== undefined){ // BETWEEN subcommand
			args.push(param1);
			args.push(param2);
		} else if(param1 !== undefined){
			args.push(param1);
		}
		if(limit !== undefined){
			args.push(limit.toString());
		}
		ircCommand.perform('CHATHISTORY', args);
	},
	'channelJoin': function(channels, passwords){ // TODO obsługa haseł jeśli tablice
		// Helper to request chat history for a channel
		var requestHistoryForChannel = function(channame){
			if(('draft/chathistory' in activeCaps) && ('CHATHISTORY' in isupport)){ // Direct access to global activeCaps and isupport
				var limit = gateway.calculateHistoryLimit();
				var isupportLimit = isupport['CHATHISTORY']; // Direct access to global isupport
				if(isupportLimit != 0 && isupportLimit < limit){
					limit = isupportLimit;
				}
				ircCommand.chathistory('LATEST', channame, '*', undefined, limit);
			}
		};

		if(Array.isArray(channels)){
			var channelString = '';
			if(channels.length == 0) return;
			for(var i=0; i<channels.length; i++){
				var channel = channels[i];
				if(channel instanceof ChannelTab){
					channel = channel.name;
				}
				if(i>0) channelString += ',';
				channelString += channel;
			}
			// Add label if labeled-response is available, for history timing
			if('labeled-response' in activeCaps){ // Direct access to global activeCaps
				var label = generateLabel(); // Get label from domain
				var channelList = channelString.split(',');
				ircEvents.emit('domain:setLabelInfo', { label: label, info: {'cmd': 'JOIN', 'channels': channelList} }); // Set labelInfo via domain event
				// Set up callback BEFORE sending the command
				ircEvents.emit('domain:setLabelCallback', { label: label, callback: function(label, msg, batch){ // Set callback via domain event
					// NOTE: History request moved to domain layer (automatic on channel join)
					// for(var i=0; i<channelList.length; i++){
					//     requestHistoryForChannel(channelList[i]);
					// }
				}});
				ircCommand.perform('JOIN', [channelString], false, {'label': label});
			} else {
				ircCommand.perform('JOIN', [channelString]);
			}
		} else {
			// Add label if labeled-response is available, for history timing
			if('labeled-response' in activeCaps){ // Direct access to global activeCaps
				var label = generateLabel(); // Get label from domain
				ircEvents.emit('domain:setLabelInfo', { label: label, info: {'cmd': 'JOIN', 'channels': [channels]} }); // Set labelInfo via domain event
				// Set up callback BEFORE sending the command
				ircEvents.emit('domain:setLabelCallback', { label: label, callback: function(label, msg, batch){ // Set callback via domain event
					// NOTE: History request moved to domain layer (automatic on channel join)
					// requestHistoryForChannel(channels);
				}});
				if(passwords){
					ircCommand.perform('JOIN', [channels, passwords], false, {'label': label});
				} else {
					ircCommand.perform('JOIN', [channels], false, {'label': label});
				}
			} else {
				if(passwords){
					ircCommand.perform('JOIN', [channels, passwords]);
				} else {
					ircCommand.perform('JOIN', [channels]);
				}
			}
		}
	},
	'channelTopic': function(chan, text){
		if(text){
			ircCommand.perform('TOPIC', [chan], text);
		} else {
			ircCommand.perform('TOPIC', [chan]);
		}
	},
	'channelKnock': function(chan, text){
		if(!text){
			ircCommand.perform('KNOCK', [chan]);
		} else {
			ircCommand.perform('KNOCK', [chan], text);
		}
	},
	'channelNames': function(chan){
		ircCommand.perform('NAMES', [chan]);
	},
	'channelRedoNames': function(chan){ // do /NAMES silently
		var channel = gateway.findChannel(chan);
		if(channel){
			channel.hasNames = false;
		}
		ircCommand.perform('NAMES', [chan]);
	},
	'listChannels': function(text){
		// Full list window: plain unlabeled LIST; unlabeled responses go to the window
		var args = text ? [text] : [];
		gateway.getOrOpenListWindow();
		ircCommand.perform('LIST', args);
	},
	'listChannelsSmall': function(text){
		// Sidebar list: labeled LIST when possible so the label identifies this response
		var args = text ? [text] : [];
		if('labeled-response' in activeCaps){
			var label = generateLabel();
			ircCommand.perform('LIST', args, false, {'label': label});
		} else {
			ircCommand.perform('LIST', args);
		}
	},
	'changeNick': function(nick){
		ircCommand.performQuick('NICK', [nick]);
	},
	'sendCtcpRequest': function(dest, text){
		ircCommand.sendMessage(dest, '\001'+text+'\001');
	},
	'sendCtcpReply': function(dest, text){
		ircCommand.sendMessage(dest, '\001'+text+'\001', true, true);
	},
	'serviceCommand': function(service, command, args, hide=false){
		if(args.constructor !== Array){
			var args = [args];
		}
		var commandString = command;
		for(var i=0; i<args.length; i++){
			commandString += ' '+args[i];
		}
		ircCommand.sendMessage(service, commandString, false, false, true);
	},
	'NickServ': function(command, args, hide=false){
		ircCommand.serviceCommand('NickServ', command, args, true);
	},
	'ChanServ': function(command, args){
		ircCommand.serviceCommand('ChanServ', command, args);
	},
	'mode': function(dest, args){
		ircCommand.performQuick('MODE', [dest, args]);
	},
	'umode': function(args){
		ircCommand.mode(guser.nick, args);
	},
	'quit': function(text){
		if(text){
			ircCommand.performQuick('QUIT', [], text);
		} else {
			ircCommand.performQuick('QUIT');
		}
		ircEvents.emit('domain:setConnectStatus', { status: 'disconnected' }); // Set connectStatus via domain event
		ircCommand.flushCmdQueue();
	},
	'pendingAwayReason': false,
	'away': function(text){
		if(text){
			ircCommand.pendingAwayReason = text;
			ircCommand.perform('AWAY', [], text);
		} else {
			ircCommand.pendingAwayReason = false;
			ircCommand.perform('AWAY');
		}
	},
	'channelPart': function(channel, reason){
		if(reason){
			ircCommand.perform('PART', [channel], reason);
		} else {
			ircCommand.perform('PART', [channel]);
		}
	},
	'whois': function(nick){
		ircCommand.perform('WHOIS', [nick, nick]);
	},
	'whowas': function(nick){
		ircCommand.perform('WHOWAS', [nick]);
	},
	'who': function(dest){ // TODO dorobić zabezpieczenie przed dużą ilością żądań na raz
		ircCommand.perform('WHO', [dest]);
	},
	'whox': function(dest, args){
		ircCommand.perform('WHO', [dest, '%'+args]);
	},
	'metadata': function(cmd, target, args){
		if(args == null) args = [];
		var cmdArgs = [target, cmd].concat(args);
		ircCommand.perform('METADATA', cmdArgs);
	},
	'sendTags': function(target, name, value){
		if(domainConnectStatus !== 'connected') return;
		var tags = {};
		if(Array.isArray(name)){
			for(var i=0; i<name.length; i++){
				tags[name[i]] = value[i];
			}
		} else {
			tags[name] = value;
		}
		ircCommand.perform(false, [target], false, tags);
	}
};