var services = {
	'badNickCounter': false,
	'badNickInterval': false,
	'nickStore': '',
	'showTimeToChange': false,
	'ignoreNextAccessDenial': false,
	'apiKey': false,
	'badNickString': function(){
		return '<div class="table">'+
			'<form class="tr" onsubmit="services.logIn();$$.closeDialog(\'error\', \'nickserv\')" action="javascript:void(0);">'+
				'<span class="td_right">' + language.yourPassword + '</span>'+
				'<span class="td"><input type="password" id="nspass" /></span>'+
				'<span class="td"><input type="submit" value="' + language.logIn + '" /></span>'+
				'<span class="td"><input type="checkbox" id="saveNewPassword" checked="checked" />  ' + language.saveThisPassword + '</span>'+
			'</form>'+
			'<form class="tr" onsubmit="services.changeNick();$$.closeDialog(\'error\', \'nickserv\')" action="javascript:void(0);">'+
				'<span class="td_right">' + language.newNick + '</span>'+
				'<span class="td"><input type="text" id="nnick" /></span>'+
				'<span class="td"><input type="submit" value="' + language.changeNick + '" /></span>'+
			'</form>'+
		'</div>';
	},
	'displayBadNickCounter': function(){
		if(services.badNickCounter == false) return;
		var html = '<br>' + language.youHaveLimitedTimeToLogInHtml;
		$$.displayDialog('error', 'nickserv', language.error, html);
		if(services.badNickInterval){
			clearInterval(services.badNickInterval);
		}
		services.badNickInterval = setInterval(function(){
			if(!(services.badNickCounter > 0)){
				clearInterval(services.badNickInterval);
				services.badNickInterval = false;
			}
			var text = services.badNickCounter.toString() + ' ' + language.second;
			if(services.badNickCounter == 1){
				text += language.second1;
			} else if((services.badNickCounter < 10 || services.badNickCounter > 20) && services.badNickCounter%10 > 1 && services.badNickCounter%10 < 5){
				text += language.second2;
			}
			$('#nickserv_timer').text(text);
			services.badNickCounter--;
		}, 1000);
	},
	'chanservMessage': function(msg){
		var expr = language.maskBannedMask;
		var match = expr.exec(msg.text);
		if(match){
			try {
				localStorage.setItem('banmask-'+md5(match[1]), match[2]);
			} catch(e) {}
			return true;
		}
		return false;
	},
	'nickservMessage': function(msg){
		if (msg.text.match(language.youreIdentifiedMask)){
			services.badNickCounter = false;
			services.showTimeToChange = false;
			$$.closeDialog('error', 'nickserv');
			return false;
		}
		if(msg.text.match(language.nickNotRegisteredMask) && guser.nickservpass != ''){
			guser.nickservpass = '';
			guser.nickservnick = '';
			return false;
		}
		if (msg.text.match(language.invalidPasswordMask)) { // złe hasło nickserv
			services.nickStore = guser.nickservnick;
			var html = language.givenPasswordForNick + '<b>'+guser.nickservnick+'</b>' + language.isInvalidChangeNick + '<br>'+services.badNickString();
			$$.displayDialog('error', 'nickserv', language.error, html);
			services.displayBadNickCounter();
			return true;
		}
		if(msg.text.match(language.registeredProtectedNickMask)){
			if(gateway.connectStatus == 'ghostAndNickSent'){
				gateway.send('PRIVMSG NickServ :IDENTIFY '+guser.nickservpass);
				gateway.connectStatus = 'identified';
				return true;
			}
			gateway.connectStatus = 'wrongPassword';
			if($$.getDialogSelector('error', 'nickserv').length < 1){
				services.showTimeToChange = true;
				services.nickStore = guser.nick;
				var html = language.selectedNick + '<b>'+guser.nick+'</b>' + language.isRegisteredChangeNick + '<br>'+services.badNickString();
				$$.displayDialog('error', 'nickserv', language.error, html);
			}
			return true;
		}
		if(msg.text.match(language.identifyMask)
			|| msg.text.match(language.nickBelongingToYouMask)
			|| msg.text.match(language.notUsedByServicesMask)
			|| msg.text.match(language.notCurrentlyUsedMask)
			|| msg.text.match(language.loginPromptMask)
			|| msg.text.match(language.selectOtherNickMask)){
				return true;
		}
		if(msg.text.match(language.accessDeniedMask)){
			if(gateway.connectStatus == 'ghostSent'){
				gateway.connectStatus = 'identified';
				services.nickStore = guser.nickservnick;
				guser.nickservnick = '';
				guser.nickservpass = '';
				var html = language.passwordForUsedNick + '<b>'+guser.nickservnick+'</b>' + language.isInvalidRetryOrChangeNick + '<br>'+services.badNickString();
				$$.displayDialog('error', 'nickserv', language.error, html);
				services.ignoreNextAccessDenial = true;
				return true;
			} else if(services.ignoreNextAccessDenial){
				services.ignoreNextAccessDenial = false;
				return true;
			}
			return false;
		}
		if(msg.text.match(language.nickRemovedFromNetworkMask) || msg.text.match(language.servicesReleasedNickMask)){
			ircCommand.changeNick(guser.nickservnick);
			gateway.connectStatus = 'ghostAndNickSent';
			return true;
		}
		var expr = /^APIKEY=(.*)$/i;
		var match = expr.exec(msg.text);
		if(match){
			services.apiKey = match[1];
			return true;
		}
		var time = false;
		var expr = language.youHaveTimeToChangeNickMask;
		var match = expr.exec(msg.text);
		if(!match){
			var expr = language.ifYouDontChangeMask;
			match = expr.exec(msg.text);
		}
		if(match){
			if(match[1] == language.oneMinute || match[1] == language.n60seconds || match[1] == language.n1minute || match[1] == language.n1minute2){
				$('#nickserv_timer').text(language.n60seconds2);
				services.badNickCounter = 59;
			} else if(match[1] == language.n20seconds || match[1] == language.n20seconds2) {
				$('#nickserv_timer').text(language.n20seconds);
				services.badNickCounter = 19;
			} else {
				$('#nickserv_timer').text(match[1]);
			}
			if(services.showTimeToChange){
				services.displayBadNickCounter();
			}
			return true;
		}
		return false;
	},
	'logIn': function(){
		if($('#nspass').val() == ''){
			$$.alert(language.passwordNotGiven);
			return false;
		}
		guser.nickservnick = services.nickStore;
		guser.nickservpass = $('#nspass').val();
		if($('#saveNewPassword').is(':checked')){
			try {
				localStorage.setItem('password', btoa(guser.nickservpass));
			} catch(e) {}
		}
		gateway.connectStatus = 'reIdentify';
		gateway.setConnectedWhenIdentified = 1;
		gateway.processStatus();
		$(".errorwindow").fadeOut(250);
		return true;
	},
	'changeNick': function(){
		if($('#nnick').val() == ''){
			$$.alert(language.mustGiveNick);
			return false;
		}
		ircCommand.changeNick($('#nnick').val());
		$(".errorwindow").fadeOut(250);
		return true;
	},
	'nickInfo': function(nick){
		ircCommand.NickServ('INFO', [nick, 'ALL']);
	},
	'perform': function(service, command, args, onlyRegistered){ // just another wrapper
		if(onlyRegistered && !services.requireRegisteredNick()){
			return;
		}
		ircCommand.serviceCommand(service, command, args);
	},
	'showChanServCmds': function(chan) {
		if(!services.requireRegisteredNick()) return;
		html = language.eachFunctionNeedsPermissions + '<br>' +
			'<table>'+
			'<tr><td><button onclick="services.clickChanServ(\'ban\', \''+bsEscape(chan)+'\');">BAN</button></td><td>' + language.nickOrMask + ': <input type="text" id="cs-ban-'+md5(chan)+'"></td><td>' + language.reason + ': <input type="text" id="cs-banreason-'+md5(chan)+'"></td><td>' + language.banUser + '</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'kick\', \''+bsEscape(chan)+'\');">KICK</button></td><td>' + language.nickOrMask + ': <input type="text" id="cs-kick-'+md5(chan)+'"></td><td>' + language.reason + ': <input type="text" id="cs-kickreason-'+md5(chan)+'"></td><td>' + language.kickUser + '</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'register\', \''+bsEscape(chan)+'\');">REGISTER</button></td><td>' + language.channelDescription + ': <input type="text" id="cs-register-'+md5(chan)+'"></td><td></td><td>' + language.registerChannel + '</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'status\', \''+bsEscape(chan)+'\');">STATUS</button></td><td>' + language.nickname + ': <input type="text" id="cs-status-'+md5(chan)+'"></td><td></td><td>' + language.checkUserChanservStatus + '</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'access list\', \''+bsEscape(chan)+'\');">ACCESS LIST</button></td><td></td><td></td><td>' + language.displayAccessList + '</td></tr>'+
			'<tr><td><button onclick="services.clickChanServ(\'access del\', \''+bsEscape(chan)+'\');">ACCESS DEL</button></td><td>' + language.nickname + ': <input type="text" id="cs-acc-del-'+md5(chan)+'"></td><td></td><td>' + language.deleteUserFromAccessList + '</td></tr>'+
		'</table>';
		$$.displayDialog('admin', 'cs-'+chan, language.chanservCommandsOn+he(chan), html);
		$$.alert(language.workInProgress);
	},
	'clickChanServ': function(cmd, chan){
		var opts = {
			'arg': [],
			'argreq': [],
			'cmd': ''
		};
		switch(cmd){
			case 'ban':
				opts.arg[0] = 'ban';
				opts.argreq[0] = true;
				opts.arg[1] = 'banreason';
				opts.cmd = 'BAN '+chan;
				break;
			case 'kick':
				opts.arg[0] = 'kick';
				opts.argreq[0] = true;
				opts.arg[1] = 'kickreason';
				opts.cmd = 'KICK '+chan;
				break;
			case 'register':
				opts.arg[0] = 'register';
				opts.cmd = 'REGISTER '+chan;
				break;
			case 'status':
				opts.arg[0] = 'status';
				opts.argreq[0] = true;
				opts.cmd = 'STATUS '+chan;
				break;
			case 'access list':
				opts.cmd = 'ACCESS '+chan+' LIST';
				break;
			case 'access del':
				opts.arg[0] = 'acc-del';
				opts.argreq[0] = true;
				opts.cmd = 'ACCESS '+chan+' DEL';
				break;
		}
		
		var cmdArgs = services.servMakeArgs(opts, cmd, chan, 'cs');
		if(cmdArgs === false){
			return;
		}
		var cmdString = 'CS '+opts.cmd+cmdArgs;
		gateway.performCommand(cmdString);
	},
	'showBotServCmds': function(chan){
		if(!services.requireRegisteredNick()) return;
		html = language.eachFunctionNeedsPermissions + '<br>' +
			'<table>'+
			'<tr><td><button onclick="services.clickBotServ(\'botlist\', \'\');">BOTLIST</button></td><td></td><td></td><td>' + language.showBotList + '</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'assign\', \''+bsEscape(chan)+'\');">ASSIGN</button></td><td>' + language.nickChosenFromBotList + ': <input type="text" id="bs-assign-'+md5(chan)+'"></td><td></td><td>' + language.assignBotToChan + '</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'unassign\', \''+bsEscape(chan)+'\');">UNASSIGN</button></td><td></td><td></td><td>' + language.removeBotFromChan + '</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'act\', \''+bsEscape(chan)+'\');">ACT</button></td><td>' + language.message + ': <input type="text" id="bs-act-'+md5(chan)+'"></td><td></td><td>' + language.sendActionToChan + '</td></tr>'+
			'<tr><td><button onclick="services.clickBotServ(\'say\', \''+bsEscape(chan)+'\');">SAY</button></td><td>' + language.message + ': <input type="text" id="bs-say-'+md5(chan)+'"></td><td></td><td>' + language.sendMessageToChan + '</td></tr>'+
		'</table>';
		$$.displayDialog('admin', 'bs-'+chan, language.botservCommandsOn+he(chan), html);
		$$.alert(language.workInProgress);
	},
	'clickBotServ': function(cmd, chan){
		var opts = {
			'arg': [],
			'argreq': [],
			'cmd': ''
		};
		switch(cmd){
			case 'botlist':
				opts.cmd = 'BOTLIST';
				break;
			case 'assign':
				opts.arg[0] = 'assign';
				opts.argreq[0] = true;
				opts.cmd = 'ASSIGN '+chan;
				break;
			case 'unassign':
				opts.cmd = 'UNASSIGN '+chan;
				break;
			case 'act':
				opts.arg[0] = 'act';
				opts.argreq[0] = true;
				opts.cmd = 'ACT '+chan;
				break;
			case 'say':
				opts.arg[0] = 'say';
				opts.argreq[0] = true;
				opts.cmd = 'SAY '+chan;
				break;
		}

		var cmdArgs = services.servMakeArgs(opts, cmd, chan, 'bs');
		if(cmdArgs === false){
			return;
		}
		var cmdString = 'BS '+opts.cmd+cmdArgs;
		gateway.performCommand(cmdString);
	},
	'servMakeArgs': function(opts, cmd, chan, service){
		var cmdString = '';
		for(var i=0; i<opts.arg.length; i++){
			if(opts.arg[i]){
				var arg = $('#'+service+'-'+opts.arg[i]+'-'+md5(chan)).val();
				if(!arg || arg == ''){
					if(opts.argreq[i]){
						$$.alert(language.argumentRequiredForCmd + '<b>'+cmd+'</b>!');
						return false;
					}
				}
				cmdString += ' '+arg;
			} else break;
		}
		return cmdString;
	},
	'showCSBan': function(channel, nick) {
		var html = '<p>'+language.banAndKickUserFrom +he(nick)+language.fromChannel+he(channel)+'. '+ language.giveKickReason +'</p>' +
			'<input type="text" id="kbinput" maxlength="307" /><br>' +
			'<select id="kbtime">' +
				'<option value=" ">' + language.noAutoUnban + '</option>' +
				'<option value="+1d">' + language.unban1Day + '</option>' +
				'<option value="+1h">' + language.unban1Hour + '</option>' +
				'<option value="+30d">' + language.unban1Month + '</option>' +
			'</select>';
		var button = [ {
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: language.doBan,
			click: function(){
				services.processCSBan(channel, nick);
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('admin', 'kb-'+channel, 'BAN', html, button);
		$('#kbtime > option:eq(1)').prop('selected', true);
	},
	'processCSBan': function(channel, nick) {
		var banString = 'CS BAN '+channel;
		banString += ' '+$('#kbtime').val()+' '+nick;
		if ($("#kbinput").val() != "") {
			banString += ' '+$("#kbinput").val();
		}
		gateway.performCommand(banString);
	},
	'requireRegisteredNick': function() {
		if(!guser.me.registered){
			$$.alert(language.youNeedRegisteredNickToUseThis);
			return false;
		}
		return true;
	},
	'changeMyNick': function() {
		var html = language.newNick + ' <input type="text" value="'+guser.nick+'" id="nickChangeInput">';
		var button = [ {
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: language.change,
			click: function(){
				if(services.doChangeNick()){
					$(this).dialog('close');
				}
			}
		} ];
		$$.displayDialog('services', 'nickserv', language.nickChange, html, button);
	},
	'doChangeNick': function() {
		var newNick = $('#nickChangeInput').val();
		if(newNick == ''){
			$$.alert(language.noNickGiven);
			return false;
		}
		if(newNick.indexOf(' ') > -1){
			$$.alert(language.nickCantContainSpaces);
			return false;
		}
		ircCommand.changeNick(newNick);
		return true;
	},
	'registerMyNick': function() {
		var html = '<table><tr><td style="text-align: right; padding-right: 10px;">' + language.password + '</td><td><input type="password" id="nickRegisterPass"></td></tr>'+
			'<tr><td style="text-align: right; padding-right: 10px;">' + language.repeatPassword + '</td><td><input type="password" id="nickRegisterPassConf"></td></tr>'+
			'<tr><td style="text-align: right; padding-right: 10px;">' + language.email + '</td><td><input type="text" id="nickRegisterMail"></td></tr>'+
			'</table><p>' + language.emailNeeded + '</p>';
		var button = [ {
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: language.register,
			click: function(){
				if(services.doRegisterNick()){
					$(this).dialog('close');
				}
			}
		} ];
		$$.displayDialog('services', 'nickserv', language.registrationOfNick+guser.nick, html, button);
	},
	'doRegisterNick': function() {
		var password = $('#nickRegisterPass').val();
		var email = $('#nickRegisterMail').val();
		if(password == ''){
			$$.alert(language.passwordNotGiven);
			return false;
		}
		if(password.indexOf(' ') > -1){
			$$.alert(language.spaceInPassword);
			return false;
		}
		if(password != $('#nickRegisterPassConf').val()){
			$$.alert(language.passwordsNotMatching);
			return false;
		}
		if(email == ''){
			$$.alert(language.mailNotGiven);
			return false;
		}
		if(email.indexOf(' ') > -1 || email.indexOf('@') < 0 || email.indexOf('.') < 0){
			$$.alert(language.badEmail);
			return false;
		}
		var timeDiff = 120 - Math.round(((+new Date)/1000) - gateway.connectTime);
		if(timeDiff > 0){
			$$.alert(language.youHaveToWaitAnother + timeDiff + language.secondsToRegisterNick);
			return false;
		}
		gateway.send('NS REGISTER '+password+' '+email);
		gateway.send('NS SET KILL QUICK');
		return true;
	},
	'getApiKey': function(){
		gateway.send('NS APIKEY');
	},
	/*'setCloak': function(){
		var html = '<p>To polecenie ustawi vHosta o treści <b>cloak:'+guser.nick+'</b>. Jeśli masz już vHosta, zostanie on usunięty.</p>';
		var button = [ {
			text: 'Anuluj',
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: 'Wykonaj',
			click: function(){
				gateway.send('HS CLOAK');
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('services', 'hostserv', 'Ustawianie automatycznego vhosta', html, button);
	},*/
	'setVhost': function(){
		var html = '<p>' + language.thisCommandWillRequestVhost + '</p>'+
			'<p>' + language.newVhost + '<input type="text" id="newVhost"></p>'+
			'<p>' + language.lettersDigitsDot + '</p>';
		var button = [ {
			text: language.cancel,
			click: function(){
				$(this).dialog('close');
			}
		}, {
			text: language.proceed,
			click: function(){
				gateway.send('HS REQUEST '+$('#newVhost').val());
				$(this).dialog('close');
			}
		} ];
		$$.displayDialog('services', 'hostserv', language.settingOfVhost, html, button);
	}
};

