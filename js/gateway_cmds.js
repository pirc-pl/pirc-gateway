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
		if(tags && activeCaps.indexOf('message-tags') >= 0){
			console.log('sending tags');
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
		if(!command){
			if(activeCaps.indexOf('message-tags') >= 0){
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
	'sendMessage': function(dest, text, notice, slow){
		if(notice){
			var cmd = 'NOTICE';
		} else {
			var cmd = 'PRIVMSG';
		}
		if(slow){
			ircCommand.performSlow(cmd, [dest], text);
		} else {
			ircCommand.perform(cmd, [dest], text);
		}
	},
	'sendMessageSlow': function(dest, text, notice){
		ircCommand.sendMessage(dest, text, notice, true);
	},
	'channelInvite': function(channel, user){
		ircCommand.perform('INVITE', [user, channel]);
	},
	'channelKick': function(channel, user, reason){
		if(!reason){
			ircCommand.performQuick('KICK', [channel, user]);
		} else {
			ircCommand.performQuick('KICK', [channel, user], reason);
		}
		
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
	'serviceCommand': function(service, command, args){
		if(args.constructor !== Array){
			var args = [args];
		}
		var commandString = command;
		for(var i=0; i<args.length; i++){
			commandString += ' '+args[i];
		}
		ircCommand.sendMessage(service, commandString, false, false);
	},
	'NickServ': function(command, args){
		ircCommand.serviceCommand('NickServ', command, args);
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
		console.log(name, value, tags);
		ircCommand.perform(false, [target], false, tags); 
	}
};

