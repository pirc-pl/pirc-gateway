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
	'send': function(command, args, text, tags){ // TODO escape tags
		var cmdString = '';
		if(tags && 'message-tags' in activeCaps){ // checking only for message-tags, ignoring other tag capabilities, we'll need to change this if problems appear
			cmdString += '@';
			var first = true;
			for(tagName in tags){
				if(!first){
					cmdString += ';';
				}
				first = false;
				cmdString += tagName;
				if(tags[tagName]){
					cmdString += '=' + tags[tagName];
				}
			}
			cmdString += ' ';
		}
		if(tags && 'labeled-response' in activeCaps && 'label' in tags){
			if(tags.label in gateway.labelInfo){
				gateway.labelInfo[tags.label].cmd = command;
			} else {
				gateway.labelInfo[tags.label] = {'cmd': command};
			}
		}
		if(!command){
			if('message-tags' in activeCaps){
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
		var label = gateway.makeLabel();
		gateway.labelCallbacks[label] = gateway.msgNotDelivered;
		if(slow){
			ircCommand.performSlow(cmd, [dest], text, {'label': label});
		} else {
			ircCommand.perform(cmd, [dest], text, {'label': label});
		}
		if(hide){
			gateway.hideMessageWithLabel(label);
		} else {
			gateway.insertMessage(cmd, dest, text, true, label);
		}			
	},
	'sendAction': function(dest, text){
		var ctcp = '\001' + 'ACTION ' + text + '\001';
		var label = gateway.makeLabel();
		gateway.labelCallbacks[label] = gateway.msgNotDelivered;
		ircCommand.performSlow('PRIVMSG', [dest], ctcp, {'label': label});
		gateway.insertMessage('ACTION', dest, text, true, label);
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
	//	var label = gateway.makeLabel();
	//	var tags = {'label': label};
		var tags = false;
		ircCommand.send('HISTORY', args, false, tags);
	},
	'channelJoin': function(channels, passwords){ // TODO obsługa haseł jeśli tablice
		if(Array.isArray(channels)){
			var channelString = '';
			if(channels.length == 0) return;
			for(var i=0; i<channels.length; i++){
				var channel = channels[i];
				if(channel instanceof Channel){
					channel = channel.name;
				}
				if(i>0) channelString += ',';
				channelString += channel;
			}
			ircCommand.perform('JOIN', [channelString]);
		} else {
			if(passwords){
				ircCommand.perform('JOIN', [channels, passwords]);
			} else {
				ircCommand.perform('JOIN', [channels]);
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
		if(text){
			ircCommand.perform('LIST', [text]);
		} else {
			ircCommand.perform('LIST');
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
		ircCommand.performQuick('QUIT', [], text);
		gateway.connectStatus = 'disconnected';
		ircCommand.flushCmdQueue();
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
		if(gateway.websock.readyState !== gateway.websock.OPEN) return;
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

