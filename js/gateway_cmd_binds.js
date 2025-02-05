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

var activeCaps = {};
var isupport = [];
var supportedCaps = [
	'userhost-in-names',
	'away-notify',
	'multi-prefix',
	'chghost',
	'extended-join',
	'account-notify',
	'account-tag',
	'message-tags',
	'server-time',
	'echo-message',
	'draft/metadata',
	'draft/setname',
	'setname',
	'sasl',
	'cap-notify',
	'batch',
	'labeled-response'
];
var serverCaps = {};

function ircBatch(name, type, args, msg){
	this.name = name;
	this.type = type;
	this.args = args;
	this.callback = null;
	this.label = null;
	this.parents = [];
	
	this.getLabel = function(){
		if(this.label)
			return this.label;
		for(var i=0; i<parents.length; i++){
			if(this.parents[i].label)
				return this.parents[i].label;
		}
		return null;
	};
	
	if(msg && msg.tags && 'batch' in msg.tags){ // nested batches - add parent
		var parentBatch = gateway.batch[msg.tags.batch];
		this.parents.push(parentBatch);
		this.parents = this.parents.concat(parentBatch.parents);
	}
}

var batchBinds = {
	'chathistory': [
		function(msg, batch){
			console.log('chathistory batch handler called');
			if(!batch.label || gateway.labelInfo[batch.label].command != 'HISTORY'){ // caused by join
//				batch.callback = gateway.endOfJoinHistory;
				return;
			}
			gateway.labelProcessed = true;
			/*var chan = gateway.findChannel(batch.args[0]);
			var selector = '#' + chan.id + ' .getHistoryButton';
			$(selector).remove();*/
		}
	],
	'labeled-response': [
		function(msg, batch){
			
		}
	]
};

var cmdBinds = {
	'ACCOUNT': [
		function(msg) {
			if(msg.args.length < 1 || msg.args[0] == '*' || msg.args[0] == '0'){
				msg.user.setAccount(false);
			} else {
				msg.user.setAccount(msg.args[0]);
			}
		}
	],
	'ACK': [ // labeled-response
		function(msg) {
		}
	],
	'AUTHENTICATE': [
		function(msg) {
			if(msg.args[0] == '+'){
				ircCommand.performQuick('AUTHENTICATE', [Base64.encode(guser.nickservnick + '\0' + guser.nickservnick + '\0' + guser.nickservpass)]);
				gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLogin+he(guser.nickservnick)]);
			} else {
				ircCommand.performQuick('CAP', ['END']);
			}
			gateway.connectStatus = 'identified';
		}
	],
	'AWAY': [
		function(msg) {
			if(msg.text == ''){
				msg.user.notAway();
			} else {
				msg.user.setAway(msg.text);
			}
		}
	],
	'BATCH': [
		function(msg) {
			var name = msg.args[0].substr(1);
			var type = msg.args[1];
			if(msg.args[0].charAt(0) == '-'){
				var batch = gateway.batch[name];
				if(!batch){
					console.error('BATCH "' + name + '" ended but not started!');
					return;
				}
				if(batch.callback){
					batch.callback(batch, msg);
				}
				setTimeout(function(){ delete gateway.batch[name]; }, 500);
				console.log('Ending batch "' + name + '"');
				msg.isBatchEnd = true;
				msg.batch = batch;
			} else if(msg.args[0].charAt(0) == '+'){
				var batch = new ircBatch(name, type, msg.args.slice(2), msg);
				gateway.batch[name] = batch;
				if('label' in msg.tags){
					batch.label = msg.tags.label;
				}
				console.log('Starting batch "' + name + '"');
				console.log(batch);
				if(type in batchBinds){
					for(var i=0; i<batchBinds[type].length; i++){
						batchBinds[type][i](msg, batch);
					}
				}
				msg.isBatchStart = true;
			} else {
				console.error('Unknown batch argument!');
				return;
			}
		}
	],
	'CAP': [
		function(msg) {
			switch(msg.args[1]){
				case 'LS': case 'NEW':
					var availableCaps = msg.text.split(' ');
					var useCaps = '';
					for(var i=0; i<availableCaps.length; i++){
						var capString = availableCaps[i];
						var value = true;
						var cap = '';
						var argIndex = capString.indexOf('=')
						if(argIndex > 0){
							cap = capString.substring(0, argIndex);
							value = capString.substring(argIndex+1);
						} else {
							cap = capString;
						}
						
						serverCaps[cap] = value;
						if(supportedCaps.indexOf(cap) >= 0){
							if(useCaps.length > 0) useCaps += ' ';
							useCaps += cap;
						}
					}
					ircCommand.performQuick('CAP', ['REQ'], useCaps);
					break;
				case 'ACK':
					var newCapsParsed = {};
					var newCaps = msg.text.split(' ');
					for(var i=0; i<newCaps.length; i++){
						var cap = newCaps[i];
						var add = true;
						
						if(cap.charAt(0) == '-'){
							add = false;
							cap = cap.substr(1);
						}
						if(!(cap in activeCaps) && add){ // add capability
							activeCaps[cap] = serverCaps[cap];
							newCapsParsed[cap] = serverCaps[cap];
						}
						if(cap in activeCaps && !add){ // remove capability
							delete activeCaps[cap];
						}
					}
					console.log(newCapsParsed);
					if('draft/metadata' in newCapsParsed){
						ircCommand.metadata('SUB', '*', ['avatar', 'status', 'bot', 'homepage', 'display-name', 'bot-url', 'color']); // subscribing to the metadata
						if(textSettingsValues['avatar']){
							disp.avatarChanged();
						}
						$('.setAvatar').show(); // now that we support metadata, we can show own avatar
					}
					if(guser.nickservpass != '' && guser.nickservnick != '' && 'sasl' in newCapsParsed){
						ircCommand.performQuick('AUTHENTICATE', ['PLAIN']);
						gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLoginAttempt]);
					} else {
						ircCommand.performQuick('CAP', ['END']);
					}
					break;
				case 'DEL':
					var delCaps = msg.text.split(' ');
					for(var i=0; i<delCaps.length; i++){
						var cap = delCaps[i];
						if(cap in activeCaps){
							delete activeCaps[cap];
						}
						if(cap in serverCaps){
							delete serverCaps[cap];
						}
					}
					break;
			}
		}
	],
	'CHGHOST': [
		function(msg) {
			msg.user.setIdent(msg.args[0]);
			msg.user.setHost(msg.args[1]);
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
				gateway.connectStatus = 'banned';
			} 
			if(gateway.connectStatus == 'banned') return;

			if(gateway.connectStatus == 'disconnected') {
				if(gateway.firstConnect){
					gateway.reconnect();
				}
				return;
			}
		
			gateway.connectStatus = 'disconnected';

			if(msg.text.match(/\(NickServ \(RECOVER command used by [^ ]+\)\)$/) || msg.text.match(/\(NickServ \(Użytkownik [^ ]+\ użył komendy RECOVER\)\)$/)){
				$$.displayReconnect();
				var html = language.recoverErrorHtml;
				$$.displayDialog('error', 'herror', language.error, html);
			} else {
				var html = '<h3>' + language.serverClosedConnection + '</h3>' +
					'<p>' + language.informations + ': '+msg.text+'</p>';
				$$.displayDialog('error', 'error', language.error, html);
				if($('#autoReconnect').is(':checked')){
					gateway.reconnect();
				} else {
					$$.displayReconnect();
				}
			}
		}
	],
	'EXTJWT': [
		function(msg){
			if(!msg.batch){
				return; // labelNotProcessed handler will take full care of that
			}
			if(msg.args[2] == '*'){
				var tokenData = msg.args[3];
			} else {
				var tokenData = msg.args[2];
			}
			if(!('extjwtContent' in msg.batch)){
				msg.batch.extjwtContent = tokenData;
			} else {
				msg.batch.extjwtContent += tokenData;
			}
			// Actual batch output data is handled by the labelNotProcessed handler too
		}
	],
	'INVITE': [
		function(msg) {
			var html = '<b>'+he(msg.sender.nick)+'</b> ' + language.inviting + ' <b>'+he(msg.text);
			var button = [ {
				text: language.enter,
				click: function(){
					ircCommand.channelJoin(msg.text);
					$(this).dialog('close');
				}
			}, {
				text: language.ignore,
				click: function(){
					$(this).dialog('close');
				}
			} ];
			$$.displayDialog('invite', msg.sender.nick+msg.text, language.invitation, html, button);
		}
	],
	'JOIN': [
		function(msg) { // mój własny join
			if(msg.user == guser.me) {
				if('extended-join' in activeCaps){
					var channame = msg.args[0];
				} else {
					var channame = msg.text;
				}
				var chan = gateway.findChannel(channame);
				if(chan) {
					chan.rejoin();
				} else {
					chan = gateway.findOrCreate(channame, true);
					chan.appendMessage(language.messagePatterns.joinOwn, [$$.niceTime(msg.time), msg.sender.nick, msg.sender.ident, msg.sender.host, channame]);
				}
				ircCommand.mode(channame, '');
				if("WHOX" in isupport){
					ircCommand.whox(channame, "tuhanfr,101"); // to pozwoli nam dostać też nazwę konta
				} else {
					ircCommand.who(channame);
				}
			}
		},
		function(msg) { // wszystkie
			if(msg.user != guser.me) {
				gateway.processJoin(msg);
			}
			if('extended-join' in activeCaps){
				var channame = msg.args[0];
			} else {
				var channame = msg.text;
				ircCommand.who(msg.sender.nick); // fallback
			}
			var chan = gateway.findChannel(channame);
			if(!chan) return;
			msg.user.setIdent(msg.sender.ident);
			msg.user.setHost(msg.sender.host);
			if('extended-join' in activeCaps){
				if(msg.args[1] != '*'){
					msg.user.setAccount(msg.args[1]);
				} else {
					msg.user.setRegistered(false);
				}
				msg.user.setRealname(msg.text);
			}
			nicklistUser = chan.nicklist.addUser(msg.user);
			nicklistUser.setMode('owner', false);
			nicklistUser.setMode('admin', false);
			nicklistUser.setMode('op', false);
			nicklistUser.setMode('halfop', false);
			nicklistUser.setMode('voice', false);
		}
	],
	'KICK': [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.args[1] != guser.nick) {
					gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.kick, [$$.niceTime(msg.time), he(msg.sender.nick), he(msg.args[1]), he(msg.args[0]), $$.colorize(msg.text)]);
					gateway.findChannel(msg.args[0]).nicklist.removeNick(msg.args[1]);
				} else {
					gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.kickOwn, [$$.niceTime(msg.time), he(msg.sender.nick), he(msg.args[0]), $$.colorize(msg.text)]);
					gateway.findChannel(msg.args[0]).part();
				}
			}
		}
	],
	'METADATA': [
		function(msg) {
			var target = msg.args[0];
			var key = msg.args[1];
			var value = msg.args[3];
			if(target.charAt(0) == '#'){ // channel
			} else {
				var user = users.getUser(target);
				user.setMetadata(key, value);
				if(key in metadataBinds){
					for(var i=0; i<metadataBinds[key].length; i++){
						metadataBinds[key][i](user, key, value);
					}
				}
			}
		}
	],
	'MODE': [
		function(msg) {
			var chanName = msg.args[0];
			if(chanName == guser.nick){
				gateway.parseUmodes(msg.text);
				gateway.statusWindow.appendMessage(language.messagePatterns.umode, [$$.niceTime(msg.time), guser.nick, gateway.getUmodeString()]);
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
					chan.appendMessage(language.messagePatterns.modeChange, [$$.niceTime(msg.time), he(msg.sender.nick), /*he(modestr)*/info, he(chanName)]);
				}
			}
		}
	],
	'NICK': [
		function(msg) {
			users.changeNick(msg.sender.nick, msg.text, msg.time);
		}
	],
	'NOTICE': [
		function(msg) {
			if (msg.text == false) {
				msg.text = " ";
			}
			if(msg.args[0].indexOf('#') == 0) { // wiadomość kanałowa
				if(ignore.ignoring(msg.user, 'channel')){
					console.log('Ignoring message on '+msg.args[0]+' by '+msg.sender.nick);
					return;
				}
			} else { //prywatna
				if(ignore.ignoring(msg.user, 'query')){
					console.log('Ignoring private message by '+msg.sender.nick);
					return;
				}
			}
			if(msg.text.match(/^\001.*\001$/i)) { // ctcp
				var ctcpreg = msg.text.match(/^\001(([^ ]+)( (.*))?)\001$/i);
				var acttext = ctcpreg[1];
				var ctcp = ctcpreg[2];
				var text = ctcpreg[4];
				if(gateway.findQuery(msg.sender.nick)) {
					gateway.findQuery(msg.sender.nick).appendMessage(language.messagePatterns.ctcpReply, [$$.niceTime(msg.time), he(msg.sender.nick), $$.colorize(acttext)]);
				} else {
					gateway.statusWindow.appendMessage(language.messagePatterns.ctcpReply, [$$.niceTime(msg.time), he(msg.sender.nick), $$.colorize(acttext)]);
				}
				if(ctcp.toLowerCase() == 'version'){
					$$.displayDialog('whois', msg.sender.nick, language.userInformation + he(msg.sender.nick), language.userSoftware + '<b>'+msg.sender.nick+'</b>:<br>'+he(text));
				}
			} else { // nie-ctcp
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
				gateway.insertMessage('NOTICE', msg.args[0], msg.text, false, false, msg.tags, msg.user, msg.time);
			}
		}
	],
	'PING' : [
		function(msg) {
			gateway.forceSend('PONG :'+msg.text);
		}
	],
	'PONG' : [
		function(msg) {
			gateway.pingcnt = 0;
		}
	],
	'PART': [
		function(msg) {
			var channel = msg.args[0];
			var channelTab = gateway.findChannel(channel);
			if(msg.sender.nick != guser.nick) {
				if(channelTab){
					if (!$('#showPartQuit').is(':checked')) {
						channelTab.appendMessage(language.messagePatterns.part, [$$.niceTime(msg.time), he(msg.sender.nick), he(msg.sender.ident), he(msg.sender.host), channel, $$.colorize(msg.text)]);
					}
					channelTab.nicklist.removeNick(msg.sender.nick);
				}
			} else {
				if(channelTab)
					channelTab.appendMessage(language.messagePatterns.partOwn, [$$.niceTime(msg.time), channel, md5(channel)]);
				gateway.statusWindow.appendMessage(language.messagePatterns.partOwn, [$$.niceTime(msg.time), channel, md5(channel)]);
				$('.channelRejoin-'+md5(channel)).click(function(){ gateway.send('JOIN ' + channel); });
				if(channelTab)
					channelTab.part();
			}
		}
	],
	'PRIVMSG': [
		function(msg) {
			if (msg.text === false) {
				msg.text = " ";
			}
			
			if(msg.args[0].indexOf('#') == 0) { // wiadomość kanałowa
				if(ignore.ignoring(msg.user, 'channel')){
					console.log('Ignoring message on '+msg.args[0]+' by '+msg.sender.nick);
					return;
				}
			} else { //prywatna
				if(ignore.ignoring(msg.user, 'query')){
					console.log('Ignoring private message by '+msg.sender.nick);
					return;
				}
			}
			
			if(msg.text.match(/^\001.*\001$/i)) { //CTCP
				var space = msg.text.indexOf(' ');
				if(space > -1){
					var ctcp = msg.text.substring(1, space);
					msg.ctcptext = msg.text.substring(space+1, msg.text.length-1);
				} else {
					var ctcp = msg.text.slice(1, -1);
					msg.ctcptext = '';
				}
				if('label' in msg.tags && ctcp != 'ACTION'){
					return; // don't display nor process own requests, this may change later
				}
				if(ctcp in ctcpBinds){
					for(func in ctcpBinds[ctcp]){
						ctcpBinds[ctcp][func](msg);
					}
				} else { // unknown ctcp request
					if(msg.sender.nick == guser.nick){
						var qname = msg.args[0];
					} else {
						var qname = msg.sender.nick;
					}
					var tab = gateway.find(qname);
					if(!tab)
						tab = gateway.statusWindow;
					var acttext = msg.text.replace(/^\001(.*)\001$/i, '$1');
					tab.appendMessage(language.messagePatterns.ctcpRequest, [$$.niceTime(msg.time), msg.sender.nick, $$.colorize(acttext)]);
					if(tab == gateway.statusWindow)
						gateway.statusWindow.markBold();
				}
				return;
			}
			gateway.insertMessage('PRIVMSG', msg.args[0], msg.text, false, false, msg.tags, msg.user, msg.time);

		}
	],
	'QUIT': [
		function(msg) {
			if(msg.sender.nick == guser.nick) { // does not happen on Unreal
				for(c in gateway.channels) {
					gateway.channels[c].part();
					//gateway.channels[c].appendMessage(language.messagePatterns.nickChange, [$$.niceTime(msg.time), msg.sender.nick, msg.text]);
				}
			} else {
				if(gateway.processQuit(msg))
					users.delUser(msg.sender.nick);
			}
		}
	],
	'SETNAME': [
		function(msg) {
			msg.user.setRealname(msg.text);
		}
	],
	'TAGMSG': [
		function(msg) { // it will be handled later
		}
	],
	'TOPIC':  [
		function(msg) {
			if(gateway.findChannel(msg.args[0])) {
				if(msg.text) {
					gateway.findChannel(msg.args[0]).setTopic(msg.text);
					gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.changeTopic, [$$.niceTime(msg.time), he(msg.sender.nick), $$.colorize(msg.text)]);
				} else {
					gateway.findChannel(msg.args[0]).setTopic('');
					gateway.findChannel(msg.args[0]).appendMessage(language.messagePatterns.deleteTopic, [$$.niceTime(msg.time), he(msg.sender.nick), msg.args[0]]);
				}

			}
		}
	],
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
				$$.displayDialog('warning', 'warning', language.warning, '<p>' + language.yourCurrentNickIs + '<b>'+guser.nick+'</b>.</p>');
			}
			gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(msg.time), he(msg.text)]);
			gateway.pingcnt = 0;
			gateway.connectStatus = '001';
			users.knowOwnNick();
		}
	],
	'002': [	// RPL_YOURHOST
	],
	'003': [	// RPL_CREATED
	],
	'004': [	// RPL_MYINFO
	],
	'005': [	// RPL_ISUPPORT
		function(msg){
			for(var i=1; i<msg.args.length; i++){
				var data = msg.args[i].split("=");
				if(data.length < 2){
					isupport[data[0]] = true;
				} else {
					isupport[data[0]] = data[1];
				}
			}
			gateway.parseIsupport();
		}
	],
	'221': [	// RPL_UMODES
		function(msg) {
			guser.clearUmodes();
			gateway.parseUmodes(msg.args[1]);
			gateway.statusWindow.appendMessage(language.messagePatterns.umode, [$$.niceTime(msg.time), guser.nick, gateway.getUmodeString()]);
			gateway.pingcnt = 0;
		}
	],
	'300': [	// RPL_NONE
	],
	'301': [	// RPL_AWAY
		function(msg) {
			var query = gateway.findQuery(msg.args[1]);
			if(query){
				query.appendMessage(language.messagePatterns.away, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.text)]);
			} else {
				$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.notPresent + ":</span><span class='data'>" + he(msg.args[1]) + language.isNotPresent + he(msg.text) + "</span></p>");
			}
		}
	],
	'302': [	// RPL_USERHOST
	],
	'303': [	// RPL_ISON
	],
	'304': [	// RPL_TEXT
	],
	'305': [	// RPL_UNAWAY
		function(msg) {
			guser.me.setAway(false);
			gateway.statusWindow.appendMessage(language.messagePatterns.yourAwayDisabled, [$$.niceTime(msg.time)]);
			gateway.statusWindow.markBold();
		}
	],
	'306': [	// RPL_NOWAWAY
		function(msg) {
			guser.me.setAway(true); // FIXME add reason
			gateway.statusWindow.appendMessage(language.messagePatterns.yourAwayEnabled, [$$.niceTime(msg.time)]);
			gateway.statusWindow.markBold();
		}
	],
	'307': [	// RPL_WHOISREGNICK
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, '<p class="whois"><span class="info"><br /></span><span class="data">' + language.nickRegistered + '</span></p>');
		}
	],
	'308': [	// RPL_RULESSTART
	],
	'309': [	// RPL_ENDOFRULES
	],
	'310': [	// RPL_WHOISHELPOP
	],
	'311': [	// RPL_WHOISUSER
		function(msg) {
			var html = "<p class='whois'><span class='info'>" + language.fullMask + ":</span><span class='data'> " + he(msg.args[1]) + "!" + he(msg.args[2]) + "@" + he(msg.args[3]) + "</span></p>" +
				"<p class='whois'><span class='info'>" + language.realname + ":</span><span class='data'> " + he(msg.text) + "</span></p>";
			$$.displayDialog('whois', msg.args[1], language.userInformation + he(msg.args[1]), html);
		}
	],
	'312': [	// RPL_WHOISSERVER
		function(msg) {
			if(!gateway.whowasExpect312){
				var html = "<p class='whois'><span class='info'>" + language.server + ":</span><span class='data'>" + he(msg.args[2]) + " "+ he(msg.text) + "</span></p>";
			} else {
				gateway.whowasExpect312 = false;
				var html = "<p class='whois'><span class='info'>" + language.server + ":</span><span class='data'>" + he(msg.args[2]) + "</span></p>" +
					"<p class='whois'><span class='info'>" + language.seen + ":</span><span class='data'>" + he(msg.text) + "</span></p>";
			}
			$$.displayDialog('whois', msg.args[1], false, html);
		}
	],
	'313': [	// RPL_WHOISOPERATOR
		function(msg) {
			var info = '<b class="admin">' + language.ircop + '</b>';
			if(msg.text.match(/is a Network Service/i)){
				info = language.networkService;
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
	'314': [	// RPL_WHOWASUSER
		function(msg){
			var html = "<p class='whois'><span class='info'>" + language.fullMask + ":</span><span class='data'> " + msg.args[1] + '!' + he(msg.args[2]) + '@' + he(msg.args[3]) + '</span></p>' +
				"<p class='whois'><span class='info'>" + language.realname + ":</span><span class='data'> " + he(msg.text) + "</span></p>";
			$$.displayDialog('whois', msg.args[1], language.previousVisitsBy + he(msg.args[1]), html);
			gateway.whowasExpect312 = true;
		}
	],
	'315': [	// RPL_ENDOFWHO
		function(msg){
		}
	],
	// 316 reserved
	'317': [	// RPL_WHOISIDLE
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.signedOn + ":</span><span class='data'>" + $$.parseTime(msg.args[3]) + "</span></p>");
			var idle = msg.args[2];
			var hour = Math.floor(idle/3600);
			idle = idle - hour * 3600;
			var min = Math.floor(idle/60);
			var sec = idle - min * 60;
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.idle + "</span><span class='data'>" + (hour>0? hour + ' ' + language.hoursShort + ' ' : "") + (min>0? min + ' ' + language.minutesShort + ' ' : "") + sec + ' ' + language.secondsShort + '</span></p>');
		}
	],
	'318': [	// RPL_ENDOFWHOIS
		function(msg) {
			gateway.displayOwnWhois = false;
		}
	],
	'319': [	// RPL_WHOISCHANNELS
		function(msg) {
			if(gateway.connectStatus == 'connected'){ // normalny whois
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
					chanHtml += chanPrefix + '<a href="javascript:ircCommand.channelJoin(\'' + chanName + '\')" title="' + language.joinChannel + ' ' + chanName + '">' + chanName + '</a> ';
				});
				$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.channels + ":</span><span class='data'> "+ chanHtml + "</span></p>");
			} else {	// sprawdzam, na jakich kanałach sam jestem
				gateway.connectStatus = '001';
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
							ircCommand.channelNames(channel[0]);
							ircCommand.channelTopic(channel[0]);
							ircCommand.who(channel[0]);
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
				var html = language.isConnectingFrom;
				if(!cname){
					html += match[1] + ' (' + match[2] + ')';
				} else {
					html += geoip.flag(match[2])+' '+cname;
				}
			} else {
				var sel = $$.getDialogSelector('whois', msg.args[1]).find('span.admin');
				if(sel.length){
					sel.append(' ('+he(msg.text)+')');
					return;
				}
				var html = he(msg.text);
			}
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data'>"+html+"</span></p>");
		}
	],
	'321': [	// RPL_LISTSTART
		function(msg) {
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
				var outtext = '<i>(' + language.noTopic + ')</i>'; // Na wypadek jakby topic nie był ustawiony.
			} else {
				var outtext = $$.colorize(msg.text);
			}
			if(msg.args[1] == '*'){
				gateway.statusWindow.appendMessage(language.messagePatterns.chanListElementHidden, [$$.niceTime(msg.time), he(msg.args[2])]);
			} else {
				gateway.statusWindow.appendMessage(language.messagePatterns.chanListElement, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.args[1]), he(msg.args[2]), outtext]);
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
			var html = '<p><span class="chlist_button" onclick="gateway.performCommand(\'LIST\')">' + language.fullList + '</span> <span class="chlist_button" onclick="gateway.refreshChanList()">' + language.refresh + '</span><p>' + language.largestChannels + ':</p><table>';
			for(i in gateway.smallListData){
				var item = gateway.smallListData[i];
				html += '<tr title="'+he(item[2])+'"><td class="chname" onclick="ircCommand.channelJoin(\''+bsEscape(item[0])+'\')">'+he(item[0])+'</td><td class="chusers">'+he(item[1])+'</td></tr>';
			}
			html += '</table>';
			$('#chlist-body').html(html);
			gateway.smallListData = [];
		}
	],
	'324': [	// RPL_CHANNELMODEIS
		function(msg) {
			var chan = msg.args[1];
			var mody = JSON.parse(JSON.stringify(msg.args));
			mody.splice(0,2);
			var chanO = gateway.findChannel(chan);
			if(!chanO){
				chanO = gateway.statusWindow;
			} else {
				var chanFound = true;
			}
			var info = gateway.parseChannelMode(mody, chanO, 1);
			if(info == ''){
				info = language.none;
			}
			if (!$('#showMode').is(':checked') || !chanFound) {
				chanO.appendMessage(language.messagePatterns.mode, [$$.niceTime(msg.time), chan, info]);
			}
		}
	],
	'329': [	// RPL_CREATIONTIME
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				var tab = gateway.findChannel(msg.args[1]);
			} else {
				var tab = gateway.statusWindow;
			}
			tab.appendMessage(language.messagePatterns.creationTime, [$$.niceTime(msg.time), $$.parseTime(msg.args[2])]);
		}
	],
	'330': [	// RPL_WHOISLOGGEDIN
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>" + language.accountName + ":</span><span class='data'>" + he(msg.args[2]) + "</span></p>");
		}
	],
	'331': [	// RPL_NOTOPIC
	],
	'332': [	// RPL_TOPIC
		function(msg) {
			var chan = gateway.findChannel(msg.args[1]);
			if(chan){
				var chanFound = true;
			} else {
				chan = gateway.statusWindow;
				var chanFound = false;
			}
			if(msg.text) {
				if(chanFound) chan.setTopic(msg.text);
				chan.appendMessage(language.messagePatterns.topic, [$$.niceTime(msg.time), he(msg.args[1]), $$.colorize(msg.text)]);
			} else {
				if(chanFound) chan.setTopic('');
				chan.appendMessage(language.messagePatterns.topicNotSet, [$$.niceTime(msg.time), he(msg.args[1])]);
			}
		}
	],
	'333': [	// RPL_TOPICWHOTIME
		function(msg) {
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.topicTime, [$$.niceTime(msg.time), he(msg.args[2]), $$.parseTime(msg.args[3])]);
			}
		}
	],
	'334': [	// RPL_LISTSYNTAX
	],
	'335': [	// RPL_WHOISBOT
		function(msg){
			$$.displayDialog('whois', msg.args[1], false, '<p class="whois"><span class="info"><br /></span><span class="data">' + language.isBotHtml + '</span></p>');
		}
	],
	'336': [	// RPL_INVITELIST
	],
	'337': [	// RPL_ENDOFINVITELIST
	],
	'340': [	// RPL_USERIP
	],
	'341': [	// RPL_INVITING
		function(msg) {
			var chan = gateway.findChannel(msg.args[2]);
			if(chan){
				chan.appendMessage(language.messagePatterns.yourInvite, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.args[2])]);
			} else {
				gateway.statusWindow.appendMessage(language.messagePatterns.yourInvite, [$$.niceTime(msg.time), he(msg.args[1]), he(msg.args[2])]);
			}
		}
	],
	'342': [	// RPL_SUMMONING
	],
	'344': [	// RPL_WHOISCOUNTRY
		function(msg) {
			var cc = msg.args[2];
			var expr = /is connecting from (.*)/;
			var match = expr.exec(msg.text);
			if (!match)
				return;
			var cname = geoip.getName(cc);
			var html = language.isConnectingFrom;
			if(!cname){
				html += match[1] + ' (' + cc + ')';
			} else {
				html += geoip.flag(cc)+' '+cname;
			}
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'><br /></span><span class='data'>"+html+"</span></p>");
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
	'351': [	// RPL_VERSION
	],
	'352': [	// RPL_WHOREPLY
		function(msg) {
			var user = users.getUser(msg.args[5]);
			user.setIdent(msg.args[2]);
			user.setHost(msg.args[3]);
			user.setRealname(msg.text.substr(msg.text.indexOf(' ') + 1));
			if(msg.args[6].indexOf('*') > -1){
				user.setIrcOp(true);
			} else {
				user.setIrcOp(false);
			}
			if(msg.args[6].indexOf('B') > -1){
				user.setBot(true);
			} else {
				user.setBot(false);
			}
			if(msg.args[6].charAt(0) == 'G'){
				user.setAway(true);
			} else {
				user.notAway();
			}
			if(msg.args[6].indexOf('*') > -1){
				user.setIrcOp(true);
			} else {
				user.setIrcOp(false);
			}
			if(msg.args[6].indexOf('B') > -1){
				user.setBot(true);
			} else {
				user.setBot(false);
			}
			if(msg.args[6].indexOf('r') > -1){
				user.setRegistered(true);
			}/* else {
				user.setRegistered(false);
			}*/
		}
	],
	'353': [	// RPL_NAMREPLY
		function(msg) {
			gateway.iKnowIAmConnected();
			var channel = gateway.findChannel(msg.args[2]);
			var names = msg.text.split(' ');
			
			var newUsers = [];
			for(var i=0; i<names.length; i++){
				var name = names[i];
				var user = {
					'modes': [],
					'flags': [],
					'nick': null,
					'ident': null,
					'host': null
				};
				var state = 'flags';
				for(var j=0; j<name.length; j++){
					var cchar = name.charAt(j);
					switch(state){
						case 'flags':
							if(cchar in modes.reversePrefixes){
								user.modes.push(modes.reversePrefixes[cchar]);
								user.flags.push(cchar);
							} else {
								state = 'nick';
								user.nick = cchar;
							}
							break;
						case 'nick':
							if(cchar == '!'){
								state = 'ident';
								user.ident = '';
							} else {
								user.nick += cchar;
							}
							break;
						case 'ident':
							if(cchar == '@'){
								state = 'host';
								user.host = '';
							} else {
								user.ident += cchar;
							}
							break;
						case 'host':
							user.host += cchar;
							break;
					}
				}
				newUsers.push(user);
			}
			
			console.log(newUsers);
			
			if(!channel || channel.hasNames){ // manual NAMES request
				var html = '<table><tr><th></th><th>Nick</th><th>ident@host</th></tr>';
				var names = msg.text.split(' ');
				for(userId in newUsers){
					var user = newUsers[userId];
					html += '<tr><td>';
					for(var i=0; i<user.flags.length; i++) html += user.flags[i];
					html += '</td><td><b>'+user.nick+'</b></td><td>';
					if(user.ident && user.host){
						html += user.ident+'@'+user.host;
					}
					html += '</td></tr>';
				}
				html += '</table>';
				$$.displayDialog('names', msg.args[2], language.nickListFor + he(msg.args[2]), html);
				return;
			}
			for(userId in newUsers){
				var user = newUsers[userId];
				var newUser = users.getUser(user.nick);
				newUser.setIdent(user.ident);
				newUser.setHost(user.host);
				var nickListItem = channel.nicklist.addUser(newUser);
				for(var i=0; i<user.modes.length; i++){
					if(user.modes[i] in language.modes.chStatusNames){
						nickListItem.setMode(language.modes.chStatusNames[user.modes[i]], true);
					} else {
						nickListItem.setMode(user.modes[i], true); // unlisted mode char
					}
				}
			}
		}
	],
	'354': [	// RPL_WHOSPCRPL (WHOX)
		function(msg) {
			if(msg.args[1] != "101"){ //%tuhanfr,101
				return;
			}
			var user = users.getUser(msg.args[4]);
			user.setIdent(msg.args[2]);
			user.setHost(msg.args[3]);
			if(msg.args[5].indexOf('*') > -1){
				user.setIrcOp(true);
			} else {
				user.setIrcOp(false);
			}
			if(msg.args[5].indexOf('B') > -1){
				user.setBot(true);
			} else {
				user.setBot(false);
			}
			if(msg.args[5].charAt(0) == 'G'){
				user.setAway(true);
			} else {
				user.notAway();
			}
			if(msg.args[6] == "0"){
				user.setAccount(false);
			} else {
				user.setAccount(msg.args[6]);
			}
			user.setRealname(msg.args[7]);
		}
	],
	'361': [	// RPL_KILLDONE
	],
	'362': [	// RPL_CLOSING
	],
	'363': [	// RPL_CLOSEEND
	],
	'364': [	// RPL_LINKS
	],
	'365': [	// RPL_ENDOFLINKS
	],
	'366': [	// RPL_ENDOFNAMES
		function(msg) {
			var channel = gateway.findChannel(msg.args[1]);
			if(!channel){
				return;
			}
			channel.hasNames = true;
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
	'369': [	// RPL_ENDOFWHOWAS
		function(msg) { // not displaying end of whowas
		}
	],
	'371': [	// RPL_INFO
	],
	'372': [	// RPL_MOTD
		function(msg) {
			var message = $$.colorize(msg.text);
			gateway.statusWindow.appendMessage(language.messagePatterns.motd, [$$.niceTime(msg.time), message]);
		}
	],
	'373': [	// RPL_INFOSTART
	],
	'374': [	// RPL_ENDOFINFO
	],
	'375': [	// RPL_MOTDSTART
	],
	'376': [	// RPL_ENDOFMOTD
		function(msg) {
			gateway.joinChannels()
		}
	],
	'378': [	// RPL_WHOISHOST
		function(msg) { // not displaying hostname
		}
	],
	'379': [	// RPL_WHOISMODES
		function(msg) { // not displaying modes
		}
	],
	'381': [	// RPL_YOUREOPER
	],
	'382': [	// RPL_REHASHING
	],
	'383': [	// RPL_YOURESERVICE
	],
	'384': [	// RPL_MYPORTIS
	],
	'385': [	// RPL_NOTOPERANYMORE
	],
	'386': [	// RPL_QLIST
	],
	'387': [	// RPL_ENDOFQLIST
	],
	'388': [	// RPL_ALIST
	],
	'389': [	// RPL_ENDOFALIST
	],
	'391': [	// RPL_TIME
	],
	'392': [	// RPL_USERSSTART
	],
	'393': [	// RPL_USERS
	],
	'394': [	// RPL_ENDOFUSERS
	],
	'395': [	//	RPL_NOUSERS
	],
	'396': [	// RPL_HOSTHIDDEN
		function(msg) {
			gateway.statusWindow.appendMessage(language.messagePatterns.displayedHost, [$$.niceTime(msg.time), he(msg.args[1])]);
		}
	],
	'401': [	// ERR_NOSUCHNICK
		function(msg) {
			if(msg.args[1] != irc.lastNick){
				$$.displayDialog('error', 'error', language.error, '<p>' + language.noSuchNickChannel + ': <b>'+he(msg.args[1])+'</b></p>');
			}
			gateway.statusWindow.appendMessage(language.messagePatterns.noSuchNick, [$$.niceTime(msg.time), he(msg.args[1])]);
		}
	],
	'402': [	// ERR_NOSUCHSERVER
		function(msg) {
			$$.displayDialog('error', 'error', language.error, '<p>' + language.noSuchObject + ': <b>'+he(msg.args[1])+'</b></p>');
			gateway.statusWindow.appendMessage(language.messagePatterns.noSuchNick, [$$.niceTime(msg.time), he(msg.args[1])]);
		}
	],
	'403': [	// ERR_NOSUCHCHANNEL
		function(msg) {
			$$.displayDialog('error', 'error', language.error, '<p>' + language.noSuchChannel + ': <b>'+he(msg.args[1])+'</b></p>');
			gateway.statusWindow.appendMessage(language.messagePatterns.noSuchChannel, [$$.niceTime(msg.time), he(msg.args[1])]);
		}
	],
	'404': [	// ERR_CANNOTSENDTOCHAN
		function(msg) {
			if(msg.args[1].charAt(0) == '#') {
				var reason = '';
				if(msg.text.match(/You need voice \(\+v\) \(.*\)/)){
					reason = language.needVoice;
				} else if(msg.text.match(/You are banned \(.*\)/)){
					reason = language.youreBanned;
				} else if(msg.text.match(/Color is not permitted in this channel \(.*\)/)){
					reason = language.colorsForbidden;
				} else if(msg.text.match(/No external channel messages \(.*\)/)){
					reason = language.noExternalMsgs;
				} else if(msg.text.match(/You must have a registered nick \(\+r\) to talk on this channel \(.*\)/)){
					reason = language.registeredNickRequired;
				} else {
					reason = language.serverMessageIs + msg.text;
				}
				if(gateway.findChannel(msg.args[1])){
					gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(msg.time), msg.args[1], reason]);
				} else {
					$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendMessageTo + he(msg.args[1])+'</p><p>'+reason+'</p>');
					gateway.statusWindow.appendMessage(language.messagePatterns.cannotSendToChan, [$$.niceTime(msg.time), msg.args[1], reason]);
				}
			} else if(gateway.findQuery(msg.args[1])){
				reason = msg.text;
				gateway.findQuery(msg.args[1]).appendMessage(language.messagePatterns.cannotSendToUser, [$$.niceTime(msg.time), msg.args[1], reason]);
			} else {
				$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendMessageTo + ' '+he(msg.args[1])+'</p><p>' + language.serverMessageIs + msg.text+'</p>');
			}
		}
	],
	'405': [	// ERR_TOOMANYCHANNELS
	],
	'406': [	// ERR_WASNOSUCHNICK
		function(msg) {
			$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.recentVisitsForNickNotFound + '<b>'+he(msg.args[1])+'</b></p>');
			gateway.statusWindow.appendMessage(language.messagePatterns.noSuchNickHistory, [$$.niceTime(msg.time), he(msg.args[1])]);
		}
	],
	'407': [	// ERR_TOOMANYTARGETS
	],
	'408': [	// ERR_NOSUCHSERVICE
	],
	'409': [	// ERR_NOORIGIN
	],
	'410': [	// ERR_INVALIDCAPCMD
	],
	'411': [	//ERR_NORECIPIENT - that was a hack to discover own nick with previous websocket interface
		function(msg) {
			if(gateway.connectStatus != 'disconnected'){
				return;
			}
			if(guser.nick == ''){
				guser.nick = msg.args[0];
			} else if(msg.args[0] != guser.nick) {
				var oldNick = guser.nick;
				setTimeout(function(){
					ircCommand.changeNick(oldNick);
				}, 500);
				guser.changeNick(msg.args[0], true);
			}
			ircCommand.whois(guser.nick);
			gateway.connectStatus = '001';
		}
	],
	'412': [	// ERR_ERR_NOTEXTTOSEND
	],
	'413': [	// ERR_NOTOPLEVEL
	],
	'414': [	// ERR_WILDTOPLEVEL
	],
	'416': [	// ERR_TOOMANYMATCHES
	],
	'421': [	// ERR_UNKNOWNCOMMAND
	],
	'422': [	// ERR_NOMOTD
	],
	'423': [	// ERR_NOADMININFO
	],
	'424': [	// ERR_FILEERROR
	],
	'425': [	// ERR_NOOPERMOTD
	],
	'429': [	// ERR_TOOMANYAWAY
	],
	'431': [	// ERR_NONICKNAMEGIVEN
	],
	'432': [	// ERR_ERRONEUSNICKNAME
		function(msg) {
			if(gateway.connectStatus == 'disconnected'){
				ircCommand.changeNick('PIRC-'+Math.round(Math.random()*100));
			}
			var html = '<p>' + language.nickname + ' <b>'+he(msg.args[1])+'</b>' + language.isCurrentlyNotAvailable + '</p>';
			if(gateway.connectStatus != 'disconnected'){
				html += '<p>' + language.yourCurrentNickIs + '<b>'+guser.nick+'</b>.</p>';
			}
			$$.displayDialog('warning', 'warning', language.warning, html);
			gateway.nickWasInUse = true;
			gateway.statusWindow.appendMessage(language.messagePatterns.badNick, [$$.niceTime(msg.time), msg.args[1]]);
		}
	],
	'433': [	// ERR_NICKNAMEINUSE
		function(msg) {
			if(gateway.connectStatus == 'disconnected'){
				var expr = /^([^0-9]+)(\d*)$/;
				var match = expr.exec(guser.nick);
				if(match && match[2] && !isNaN(match[2])){
					var nick = match[1];
					var suffix = parseInt(match[2]) + 1;
				} else {
					var nick = guser.nick;
					var suffix = Math.floor(Math.random() * 999);
				}
				ircCommand.changeNick(nick+suffix);
			}
			var html = '<p>' + language.nickname + ' <b>'+he(msg.args[1])+'</b>' + language.isAlreadyUsedBySomeone + '</p>';
			gateway.nickWasInUse = true;
			
			if(gateway.connectStatus != 'disconnected'){
				html += '<p>' + language.yourCurrentNickIs + '<b>'+guser.nick+'.</p>';
			}
			$$.displayDialog('warning', 'warning', language.warning, html);
			gateway.statusWindow.appendMessage(language.messagePatterns.nickInUse, [$$.niceTime(msg.time), msg.args[1]]);
		}
	],
	'434': [	// ERR_NORULES
	],
	'435': [	// ERR_SERVICECONFUSED
	],
	'436': [	// ERR_NICKCOLLISION
	],
	'437': [	// ERR_BANNICKCHANGE
	],
	'438': [	// ERR_NCHANGETOOFAST
	],
	'439': [	// ERR_TARGETTOOFAST
	],
	'440': [	// ERR_SERVICESDOWN
	],
	'441': [	// ERR_USERNOTINCHANNEL
	],
	'442': [	// ERR_NOTONCHANNEL
		function(msg) {
			var html = '<p>'+he(msg.args[1])+':' + language.youreNotOnChannel + '</p>';
			$$.displayDialog('error', 'error', language.error, html);
			gateway.statusWindow.appendMessage(language.messagePatterns.notOnChannel, [$$.niceTime(msg.time), he(msg.args[1])]);
		}
	],
	'443': [	// ERR_USERONCHANNEL
		function(msg) {
			var html = '<p>'+he(msg.args[2])+": <b>"+he(msg.args[1])+'</b>' + language.isAlreadyOnChannel + '</p>';
			$$.displayDialog('error', 'error', language.error, html);
			gateway.statusWindow.appendMessage(language.messagePatterns.alreadyOnChannel, [$$.niceTime(msg.time), he(msg.args[2]), he(msg.args[1])]);
		}
	],
	'444': [	// ERR_NOLOGIN
	],
	'445': [	// ERR_SUMMONDISABLED
	],
	'446': [	// ERR_USERSDISABLED
	],
	'447': [	// ERR_NONICKCHANGE
		function(msg) {
			var html = '<p>' + language.cantChangeNickMessageHtml + he(msg.text) + '</p>';
			$$.displayDialog('error', 'error', language.error, html);
			gateway.statusWindow.appendMessage(language.messagePatterns.notOnChannel, [$$.niceTime(msg.time), he(msg.args[1])]);
		}
	],
	'448': [	// ERR_FORBIDDENCHANNEL
	],
	'451': [	// ERR_NOTREGISTERED
	],
	'455': [	// ERR_HOSTILENAME
	],
	'459': [	// ERR_NOHIDING
	],
	'460': [	// ERR_NOTFORHALFOPS
	],
	'461': [	// ERR_NEEDMOREPARAMS
	],
	'462': [	// ERR_ALREADYREGISTRED
	],
	'463': [	// ERR_NOPERMFORHOST
	],
	'464': [	// ERR_PASSWDMISMATCH
	],
	'465': [	// ERR_YOUREBANNEDCREEP
		function(msg) {
			gateway.displayGlobalBanInfo(msg.text);
		}
	],
	'466': [	// ERR_YOUWILLBEBANNED
	],
	'467': [	// ERR_KEYSET
	],
	'468': [	// ERR_ONLYSERVERSCANCHANGE
	],
	'469': [	// ERR_LINKSET
	],
	'470': [	// ERR_LINKCHANNEL
	],
	'471': [	// ERR_CHANNELISFULL
	],
	'472': [	// ERR_UNKNOWNMODE
		function(msg) {
			gateway.statusWindow.appendMessage(language.messagePatterns.invalidMode, [$$.niceTime(msg.time), msg.args[1]]);
			var html = language.invalidMode + ': "'+msg.args[1]+'"';
			$$.displayDialog('error', 'error', language.error, html);
		}
	],
	'473': [	// ERR_INVITEONLYCHAN
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = '<p>' + language.cantJoin + ' <b>' + he(msg.args[1]) + '</b>' +
				'<br>' + language.inviteRequired + '</p>';
			var button = [ {
				text: language.askOpersForEntry,
				click: function(){
					ircCommand.channelKnock(msg.args[1], language.entryRequest);
					$(this).dialog('close');
				}
			} ];
			gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.inviteRequiredShort]);
			$$.displayDialog('warning', 'warning', language.warning, html, button);
		}
	],
	'474': [	// ERR_BANNEDFROMCHAN
		function(msg) {
			gateway.iKnowIAmConnected(); // TODO inne powody, przez które nie można wejść
			var html =  '<p>' + language.cantJoin + ' <b>' + msg.args[1] + "</b>";
			if (msg.text == "Cannot join channel (+b)") {
				html += '<br>' + language.youreBanned + '.</p>';
				gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.youreBanned]);
			}
			$$.displayDialog('error', 'error', language.error, html);
		}
	],
	'475': [	// ERR_BADCHANNELKEY
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = '<p>' + language.cantJoin + ' <b>' + msg.args[1] + "</b>" +
				'<br>' + language.needValidPassword + '.' +
				'<br><form onsubmit="gateway.chanPassword(\''+he(msg.args[1])+'\');$$.closeDialog(\'warning\', \'warning\')" action="javascript:void(0);">' +
				'Hasło do '+he(msg.args[1])+': <input type="password" id="chpass" /> <input type="submit" value="' + language.enter + '" /></form></p>';
			gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.passwordRequired]);
			$$.displayDialog('warning', 'warning', language.warning, html);
		}
	],
	'477': [	// ERR_NEEDREGGEDNICK
		function(msg) {
			gateway.iKnowIAmConnected();
			var html = '<p>' + language.cantJoin + ' <b>' + he(msg.args[1]) + "</b>" +
				'<br>' + language.registerYourNickToJoin + '</p>';
			gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.registeredNickRequiredForChan]);
			$$.displayDialog('error', 'error', language.error, html);
		}
	],
	'478': [	// ERR_BANLISTFULL
	],
	'479': [	// ERR_LINKFAIL
	],
	'480': [	// ERR_CANNOTKNOCK
		function(msg) {
			var html = '<p>' + language.cantKnock + '<br>' +
				language.serverMessageIs + he(msg.text) + '</p>';
			gateway.statusWindow.appendMessage(language.messagePatterns.alreadyOnChannel, [$$.niceTime(msg.time), language.serverMessageIs, he(msg.text)]);
			$$.displayDialog('error', 'error', language.error, html);
		}
	],
	'481': [	// ERR_NOPRIVILEGES
	],
	'482': [	// ERR_CHANOPRIVSNEEDED
		function(msg) {
			var html = msg.args[1] + ': ' + language.noAccess + '.<br>' + language.notEnoughPrivileges;
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), msg.args[1]]);
			}
			$$.displayDialog('error', 'error', language.error, html);
		}
	],
	'486': [	// ERR_NONONREG
		function(msg) {
			var expr = /^You must identify to a registered nick to private message ([^ ]*)$/;
			var match = expr.exec(msg.text);
			if(match){
				var query = gateway.findQuery(match[1]);
				if(query){
					query.appendMessage(language.messagePatterns.cannotSendToUser, [$$.niceTime(msg.time), match[1], language.yourNickMustBeRegistered]);
				}
				$$.displayDialog('error', 'error', language.error, '<p>' + language.cantSendPMTo + '<b>'+match[1]+'</b></p><p>' + language.userAcceptsPMsOnlyFromRegistered + '</p>');
			} else {
				$$.displayDialog('error', 'error', language.error, '<p>' + language.cantSendPM + '</p><p>' + language.serverMessageIs + he(msg.text)+'</p>');
			}
		}
	],
	'487': [	// ERR_NOTFORUSERS
	],
	'489': [	// ERR_SECUREONLYCHAN
		function(msg) { // to się nie zdarzy gdy używamy wss
			gateway.iKnowIAmConnected();
			var html = '<p>' + language.cantJoin + ' <b>' + he(msg.args[1]) + "</b>" +
				'<br>' + language.SSLRequired + '</p>';
			gateway.statusWindow.appendMessage(language.messagePatterns.cannotJoin, [$$.niceTime(msg.time), msg.args[1], language.SSLRequired]);
			$$.displayDialog('error', 'error', language.error, html);
		}
	],
	'490':	[	// ERR_NOSWEAR
	],
	'491':	[	// ERR_NOOPERHOST
	],
	'492':	[	// ERR_NOCTCP
	],
	'499': [	// ERR_CHANOWNPRIVNEEDED
		function(msg) {
			var html = msg.args[1] + ': ' + language.noAccess + '.<br>' + language.noPermsForAction + '.';
			if(gateway.findChannel(msg.args[1])) {
				gateway.findChannel(msg.args[1]).appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), msg.args[1]]);
			}
			$$.displayDialog('error', 'error', language.error, html);
		}
	],
	'500': [	// ERR_TOOMANYJOINS
	],
	'501': [	// ERR_UMODEUNKNOWNFLAG
	],
	'502': [	// ERR_USERSDONTMATCH
	],
	'511': [	// ERR_SILELISTFULL
	],
	'512': [	// ERR_TOOMANYWATCH
	],
	'513': [	// ERR_NEEDPONG
	],
	'514': [	// ERR_TOOMANYDCC
	],
	'517': [	// ERR_DISABLED
	],
	'518': [	// ERR_NOINVITE
	],
	'519': [	// ERR_ADMONLY
	],
	'520': [	// ERR_OPERONLY
	],
	'521': [	// ERR_LISTSYNTAX
	],
	'531': [	// ERR_CANTSENDTOUSER
		function(msg) {
			var expr = /^You must identify to a registered nick to private message this user$/;
			var match = expr.exec(msg.text);
			if(match){
				var query = gateway.findQuery(msg.args[1]);
				if(query){
					query.appendMessage(language.messagePatterns.cannotSendToUser, [$$.niceTime(msg.time), he(msg.args[1]), language.yourNickMustBeRegistered]);
				}
				$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendPMTo + ' <b>'+he(msg.args[1])+'</b></p><p>' + language.userAcceptsPMsOnlyFromRegistered + '</p>');
			} else {
				$$.displayDialog('error', 'error', 'Błąd', '<p>' + language.cantSendPM + '.</p><p>' + language.serverMessageIs + he(msg.text)+'</p>');
			}
		}
	],
	'597': [	// RPL_REAWAY
	],
	'598': [	// RPL_GONEAWAY
	],
	'599': [	// RPL_NOTAWAY
	],
	'600': [	// RPL_LOGON
	],
	'601': [	// RPL_LOGOFF
	],
	'602': [	// RPL_WATCHOFF
	],
	'603': [	// RPL_WATCHSTAT
	],
	'604': [	// RPL_NOWON
	],
	'605': [	// RPL_NOWOFF
	],
	'606': [	// RPL_WATCHLIST
	],
	'607': [	// RPL_ENDOFWATCHLIST
	],
	'608': [	// RPL_CLEARWATCH
	],
	'609': [	// RPL_NOWISAWAY
	],
	'671': [	// RPL_WHOISSECURE
		function(msg) {
			$$.displayDialog('whois', msg.args[1], false, "<p class='whois'><span class='info'>TLS:</span><span class='data'>" + language.hasSecureConnection + "</span></p>");
		}
	],
	'742': [	// ERR_MLOCKRESTRICTED
	],
	'761': [	// RPL_KEYVALUE
		function(msg){ }
	],
	'762': [	// RPL_METADATAEND
		function(msg){ }
	],
	'770': [	// RPL_METADATASUBOK
		function(msg){ }
	],
	'774': [	//ERR_METADATASYNCLATER
		function(msg){
			if(msg.args[1]){
				var time = parseInt(msg.args[1]) * 1000;
			} else {
				var time = 1000;
			}
			setTimeout(ircCommand.metadata('SYNC', msg.args[0]), time);
		}
	],
	'900': [	// RPL_LOGGEDIN
		function(msg) {
			ircCommand.performQuick('CAP', ['END']);
			gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.weAreLoggedInAs + he(msg.args[2])]);
			if(msg.args[2] != '0'){
				guser.me.setAccount(msg.args[2]); // TODO use guser.me here
			} else {
				guser.me.setAccount(false);
			}
			$$.closeDialog('error', 'nickserv'); // if we displayed login prompt, let's close it.
		}
	],
	// TODO RPL_LOGGEDOUT
	'903': [	// RPL_SASLSUCCESS
		function(msg) {
			gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLoginSuccess]);
			gateway.retrySasl = false;
		}
	],
	'904': [	// ERR_SASLFAIL
		function(msg) {
			ircCommand.performQuick('CAP', ['END']);
			gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLLoginFail]);
			if(gateway.retrySasl){
				var html = language.suppliedNickPassword + '<b>'+guser.nickservnick+'</b>'+language.passwordInvalidTryAgain+'<br>'+services.badNickString();
				$$.displayDialog('error', 'nickserv', language.error, html);
				services.displayBadNickCounter();
			}
		}
	],
	'906': [	// ERR_SASLABORTED
		function(msg) {
			gateway.statusWindow.appendMessage(language.messagePatterns.SaslAuthenticate, [$$.niceTime(msg.time), language.SASLNotLoggedIn]);
		}
	],
	'972': [	// ERR_CANNOTDOCOMMAND
		function(msg) {
			gateway.showPermError(msg.text);
			if(gateway.getActive()) {
				gateway.getActive().appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), he(msg.args[1])]);
			}
		}
	],
	'974': [	// ERR_CANNOTCHANGECHANMODE
		function(msg) {
			gateway.showPermError(msg.text);
			if(gateway.getActive()) {
				gateway.getActive().appendMessage(language.messagePatterns.noPerms, [$$.niceTime(msg.time), he(msg.args[1])]);
			}
		}
	]
};

var ctcpBinds = {
	'ACTION': [
		function(msg){
			gateway.insertMessage('ACTION', msg.args[0], msg.ctcptext, false, false, msg.tags, msg.user, msg.time);
		}
	],
	'VERSION': [
		function(msg){
			version_string = language.gatewayVersionIs+mainSettings.version;
			if(addons.length > 0){
				version_string += language.versionWithAddons;
				for(i in addons){
					if(i>0){
						version_string += ', ';
					}
					version_string += addons[i];
				}
			}
			version_string += ', ' + language.runningOn + ' '+navigator.userAgent;
			ircCommand.sendCtcpReply(msg.sender.nick, 'VERSION '+version_string);
		}
	],
	'USERINFO': [
		function(msg){
			version_string = language.gatewayVersionIs+mainSettings.version;
			if(addons.length > 0){
				version_string += language.versionWithAddons;
				for(i in addons){
					if(i>0){
						version_string += ', ';
					}
					version_string += addons[i];
				}
			}
			version_string += ', ' + language.runningOn + ' '+navigator.userAgent;
			ircCommand.sendCtcpReply(msg.sender.nick, 'USERINFO '+version_string);
		}
	],
	'REFERER': [
		function(msg){
			referer_string = document.referrer;
			if(referer_string == ''){
				referer_string = language.unknown;
			}
			ircCommand.sendCtcpReply(msg.sender.nick, 'REFERER '+referer_string);
		}
	]
};

function cmdNotImplemented(msg){
	var tab = gateway.statusWindow;
	var text = '('+msg.command+') ';
	var startIndex = 0;

	if(msg.args && msg.args.length > 0 && msg.args[0].charAt(0) == '#' && gateway.findChannel(msg.args[0])){
		tab = gateway.findChannel(msg.args[0]);
		startIndex = 1;
		text = '[' + msg.sender.nick + ']' + text;
	}
	
	for(var i=startIndex; i<msg.args.length; i++){
		text += ' ' + msg.args[i];
	}
	
	if(msg.command.charAt(0) == '4'){
		tab.appendMessage(language.messagePatterns.unimplementedError, [$$.niceTime(msg.time), text]);
	} else {
		tab.appendMessage(language.messagePatterns.unimplemented, [$$.niceTime(msg.time), text]);
	}
};

