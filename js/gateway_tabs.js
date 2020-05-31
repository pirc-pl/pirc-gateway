function Nicklist(chan, id) {
	this.channel = chan;
	this.id = id+'-nicklist';
	this.list = [];
	
	this.sortFunc = function(a, b) {
		if(a.level < b.level) {
			return 1;
		} else if(a.level > b.level) {
			return -1;
		} else {
			if(a.nick.toLowerCase() < b.nick.toLowerCase()) {
				return -1;
			} else if(a.nick.toLowerCase() > b.nick.toLowerCase()) {
				return 1;
			} else {
				return 0; //nigdy nie powinno nastapic ;p
			}
		}
	}

	this.sort = function() {
		this.list.sort(this.sortFunc);
	}
	this.remove = function() {
		$('#'+this.id).remove();
		this.list = [];
	}
	this.findNick = function(nick) {
		for (i in this.list) {
			if(this.list[i].nick.toLowerCase() == nick.toLowerCase()) {
				return this.list[i];
			}
		}
		return false;
	}
	this.insertNick = function(nickListItem) {
		var userHTML = nickListItem.makeHTML();
		this.sort();
		for(i in this.list){
			if(this.sortFunc(this.list[i], nickListItem) > 0){
				$('#'+this.id+' .'+md5(this.list[i].nick)).before(userHTML);
				userHTML = false;
				break;
			}
		}
		if(userHTML){
			$('#'+this.id+' .nicklist').append(userHTML);
		}
		if(nickListItem.host && nickListItem.ident){
			$('#'+nickListItem.id).attr('title', nickListItem.nick+'!'+nickListItem.ident+'@'+nickListItem.host);
		}
		this.showChstats();
	}
	this.changeNick = function(nick, newnick) {
		var nickListItem = this.findNick(nick);
		if(nickListItem) {
			nickListItem.nick = newnick;
			nickListItem.remove();
			this.insertNick(nickListItem);
			return true;
		} else {
			return false;
		}
	}
	this.addNick = function(nick) {
		var nickListItem = this.findNick(nick);
		if(!nickListItem) {
			var newNick = new NicklistUser(nick, this.channel);
			this.list.push(newNick);
			this.insertNick(newNick);
		} else {
			nickListItem.remove();
			this.insertNick(nickListItem);
		}
	}
	this.removeNick = function(nick) {
		for (i in this.list) {
			if(this.list[i].nick == nick) {
				this.list[i].remove();
				this.list.splice(i, 1);
				this.showChstats();
				return true;
			}
		}
		return false;
	}
	this.showChstats = function() {
		var opCount = 0;
		var normCount = 0;
		for(i in this.list) {
			var modes = this.list[i].modes;
			if(modes.owner || modes.admin || modes.op || modes.halfop){
				opCount++;
			} else {
				normCount++;
			}
		}
		var text = '';
		if(normCount > 0){
			text = normCount + ' ' + language.user;
			if(normCount > 1){
				text += language.multipleUsers;
			}
		}
		if(opCount > 0){
			if(text != ''){
				text += ', ';
			}
			text += opCount + ' ' + language.chanOp;
			if(opCount > 1){
				text += language.multipleUsers;
			}
		}
		$('#'+gateway.findChannel(this.channel).id+'-chstats .chstats-text').html(text);
	}
	try {
		$('<span id="'+this.id+'"></span>').hide().appendTo('#nicklist-main');
		$('<ul/>').addClass('nicklist').appendTo('#'+this.id);
	} catch(e) {
		gateway.send('QUIT :' + language.browserTooOldQuit);
		$('.not-connected-text > h3').html(language.outdatedBrowser);
		$('.not-connected-text > p').html(language.outdatedBrowserInfo);
	}
}

function NicklistUser(usernick, chan) {
	this.modes = {
		owner: false, // lvl = 5;
		admin: false,
		op: false,
		halfop: false,
		voice: false
	}
	this.channel = chan;
	this.ident = false;
	this.host = false;
	this.realname = false;
	this.away = false;
	this.awayReason = false;
	this.ircOp = false;
	this.isBot = false;
	this.isRegistered = false;
	this.account = false;

	this.makeHTML = function() {
		var index = this.level;
	/*	if(this.level == 0 && this.isRegistered){
			index = 6;
		}*/
		var html = '<li id="'+this.id+'" class="'+md5(this.nick)+'">'+
			'<table><tr onclick="gateway.toggleNickOpt(\''+this.id+'\')">'+
				'<td valign="top">'+
					'<img class="chavatar" alt="' + (this.isRegistered?language.registered:language.unRegistered) + '" src="'+disp.getAvatarIcon(this.nick, this.isRegistered)+'" title="' + (this.isRegistered?language.registered:language.unRegistered) + '" '+
					'onerror="users.disableAutoAvatar(\'' + this.nick + '\')">'+
				'</td><td valign="top">';
		if(index > 0){
			html += '<img class="chrank" alt="'+alt[index]+'" src="'+(index>0?icons[index]:'')+'" title="'+(index?chStatusInfo[index]:'')+'" />';
		} else {
			html += '<span class="chrank"></span>';
		}
		html += '</td>'+
				'<td valign="top" style="text-align:left;width:100%;" class="'+((this.nick.toLowerCase()==guser.nick.toLowerCase())?'ownNick ':'')+'nickname">'+this.nick+'</td>'+
			'</tr></table>'+
			'<ul class="options" id="'+this.id+'-opt">'+
				'<li class="nicklistAvatar"></li>'+
				'<li onClick="gateway.openQuery(\''+this.nick+'\', \''+this.id+'\')" class="switchTab">' + language.query + '</li>'+
				((this.nick.toLowerCase() == guser.nick.toLowerCase())?'':'<li onClick="ignore.askIgnore(\''+this.nick+'\');">' + language.ignoreThis + '</li>')+
				'<li><div style="width:100%;" onClick="gateway.toggleNickOptInfo(\''+this.id+'\')">' + language.informations + '</div>'+
					'<ul class="suboptions" id="'+this.id+'-opt-info'+'">'+
						'<li onClick="' + ((this.nick.toLowerCase() == guser.nick.toLowerCase())?'gateway.displayOwnWhois = true; ':'') + 'gateway.send(\'WHOIS '+$$.sescape(this.nick)+' '+$$.sescape(this.nick)+'\');gateway.toggleNickOpt(\''+this.id+'\');">WHOIS</li>'+
						'<li onClick="services.nickInfo(\''+this.nick+'\');gateway.toggleNickOpt(\''+this.id+'\');">NickServ</li>'+
						((this.nick.toLowerCase() == guser.nick.toLowerCase())?'':'<li onClick="gateway.ctcp(\''+this.nick+'\', \'VERSION\');gateway.toggleNickOpt(\''+this.id+'\');">' + language.softwareVersion + '</li>')+
					'</ul>'+
				'</li>'+
				'<li class="' + gateway.findChannel(this.channel).id + '-operActions" style="display:none;"><div style="width:100%;" onClick="gateway.toggleNickOptAdmin(\''+this.id+'\')">' + language.channelAdministration + '</div>'+
					'<ul class="suboptions" id="'+this.id+'-opt-admin'+'">'+
						'<li onClick="gateway.showKick(\''+this.channel+'\', \''+this.nick+'\')">' + language.kickFromChannel + '</li>'+
						'<li onClick="services.showCSBan(\''+this.channel+'\', \''+this.nick+'\')">' + language.banUsingChanserv + '</li>'+
						'<li onClick="gateway.showStatus(\''+this.channel+'\', \''+this.nick+'\')">' + language.givePrivileges + '</li>'+
						'<li onClick="gateway.showStatusAnti(\''+this.channel+'\', \''+this.nick+'\')">' + language.takePrivileges + '</li>'+
					/*	'<li onClick="gateway.showBan(\''+this.channel+'\', \''+this.nick+'\')">Banuj</li>'+*/
					'</ul>'+
				'</li>'+
			'</ul>';
		return html;
		//}
	}
	this.setMode = function(mode, setting) {
		var oldLevel = this.level;
		if(mode in this.modes) {
			this.modes[mode] = setting;
			if(this.modes.owner) {
				this.level = 5;
			} else if (this.modes.admin) {
				this.level = 4;
			} else if (this.modes.op) {
				this.level = 3;
			} else if (this.modes.halfop) {
				this.level = 2;
			} else if (this.modes.voice) {
				this.level = 1;
			} else {
				this.level = 0;
			}
		}
		if(this.nick.toLowerCase() == guser.nick.toLowerCase()){
			var chanId = gateway.findChannel(this.channel).id;
			if(this.level >= 2){
				$('#'+chanId+'-displayOperCss').remove();
				var style = $('<style id="'+chanId+'-displayOperCss">.'+chanId+'-operActions { display:block !important; }</style>');
				$('html > head').append(style);
			} else {
				$('#'+chanId+'-displayOperCss').remove();
			}
		}
		if(this.level != oldLevel){
			var nicklist = gateway.findChannel(this.channel).nicklist;
			var nickListElement = $('#'+nicklist.id+' .'+md5(this.nick));
			if(nickListElement.length){
				nickListElement.remove();
				nicklist.insertNick(this);
				this.showTitle();
			}
		}
	}
	this.remove = function() {
		$('#'+this.id).remove();
	}
	this.setIdent = function(ident) {
		this.ident = ident;
		this.showTitle();
	}
	this.setUserHost = function(host) {
		this.host = host;
		this.showTitle();
	}
	this.setRealname = function(realname) {
		this.realname = realname;
		this.showTitle();
	}
	this.setAway = function(away) {
		if(this.away != away){			
			this.away = away;
			if(!away){
				this.awayReason = false;
			}
			this.showTitle();
		}
	}
	this.setAwayReason = function(reason) {
		if(this.away){
			this.awayReason = reason;
		} else {
			this.awayReason = false;
		}
		this.showTitle();
	}
	this.setIrcOp = function() {
		this.ircOp = true;
		this.showTitle();
	}
	this.setBot = function(val) {
		this.isBot = val;
		this.showTitle();
	}
	this.updateAvatar = function() {
		this.displayLoggedIn();
	}
	this.setRegistered = function(val) {
		this.isRegistered = val;
		this.displayLoggedIn();
	}
	this.setAccount = function(acc) {
		this.account = acc;
		this.showTitle();
		this.displayLoggedIn();
	}
	this.displayLoggedIn = function() {
		var loggedIn = true;
		if(this.account == this.nick){
			var regText = language.registered;
		} else if(this.account){
			var regText = language.loggedInAs+this.account;
		} else if(this.isRegistered){
			var regText = language.registered;
		} else {
			var regText = language.unRegistered;
			loggedIn = false;
		}
		$('#'+this.id+' .chavatar').attr('alt', regText).attr('src', disp.getAvatarIcon(this.nick, loggedIn)).attr('title', regText).on('error', function(){ users.disableAutoAvatar(this.nick); });
		$('#'+this.id+'-opt .nicklistAvatar').html(gateway.getMeta(this.nick, 500));
	}
	this.showTitle = function() {
		var text = '';
		if(this.ident && this.host){
			text = this.nick+'!'+this.ident+'@'+this.host;
			if(this.realname){
				text += ' \n'+this.realname;
			}
		}
		if(this.away){
			if(text != ''){
				text += ' \n';
			}
			text += language.userIsAway;
			if(this.awayReason){
				text += ' (' + language.reason + ': '+this.awayReason+')';
			}
			$('#'+this.id+' .nickname').css('opacity', '0.3');
		} else {
			$('#'+this.id+' .nickname').css('opacity', '');
		}
		if(this.ircOp){
			if(text != ''){
				text += '\n';
			}
			text += language.userIsIrcop;
		}
		if(this.isBot){
			if(text != ''){
				text += '\n';
			}
			text += language.userIsBot;
		}
		if(this.isRegistered && this.account == false){
			if(text != ''){
				text += '\n';
			}
			text += language.nickIsRegistered;
		}
		if(this.account != false){
			if(text != ''){
				text += '\n';
			}
			text += language.userIsLoggedIntoAccount+this.account;
		}
		if(text != ''){
			$('#'+this.id).attr('title', text);
		}
		this.displayLoggedIn();
	}
	this.level = 0;
	this.nick = usernick;
	this.id = usernick.replace(/[^a-z0-9A-Z]+/ig, '-').toLowerCase()+Math.round(Math.random()*10000);
}

function Query(nick) {
	this.name = nick;
	this.id = "query-"+this.name.replace(/[^a-z0-9A-Z]+/g, '-').toLowerCase()+Math.round(Math.random()*100);
	this.hilight = false;
	this.newmsg = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
	this.newLines = false;
	
	this.toggleClass = function() {
		if(this.ClassAdded) {
			$('#'+this.id+'-tab').removeClass('newmsg');
			this.ClassAdded = false;
		} else if(this.hilight) {
			$('#'+this.id+'-tab').addClass('newmsg');
			this.ClassAdded = true;
		}
	}
	this.markNew = function() {
		disp.playSound();
		if(!this.hilight) {
			this.hilight = window.setInterval('gateway.findQuery(\''+this.name+'\').toggleClass();', 500);
		}
		if(!disp.focused){
			if(disp.titleBlinkInterval){
				clearInterval(disp.titleBlinkInterval);
			}
			disp.titleBlinkInterval = setInterval(function(){
				var title = document.title;
				document.title = (title == newMessage ? (he(guser.nick)+' @ '+mainSettings.networkName) : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		$('#'+this.id+'-tab > a').css('font-weight', 'bold');
		$('#'+this.id+'-tab > a').css('color', '#fff');
	}
	this.markRead = function() {
		if(!this.newLines){
			$('#'+this.id+'-window hr').remove();
		}
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if(this.classAdded) {
			this.toggleClass();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if(document.title == newMessage) document.title = he(guser.nick)+' @ '+mainSettings.networkName;
		$('#'+this.id+'-tab > a').css('font-weight', 'normal');
		$('#'+this.id+'-tab > a').css('color', '#CECECE');
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 600);
	}
	this.close = function() {
		$('#'+this.id+'-tab').remove();
		$('#'+this.id+'-window').remove();
		$('#'+this.id+'-topic').remove();
		$('#'+this.id+'-chstats').remove();
		if(this.name.toLowerCase() == gateway.active.toLowerCase()) {
			gateway.switchTab(gateway.tabHistoryLast(this.name));
		}
	}
	this.appendMessage = function(type, args) {
		var rescroll = false;
		var messageData = $.vsprintf(type, args);

		var fullHeight = document.getElementById('chat-wrapper').scrollHeight;
		var currHeight = $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight();
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && currHeight > fullHeight-200) {
			rescroll = true;
		}
		$('#'+this.id+'-window').append(messageData);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}

		if(messageData == '' || messageData.match(/<span class="join">/)){
			return;
		}
		try {
			var qCookie = localStorage.getItem('query'+md5(this.name));
			if(qCookie) {
				qCookie = Base64.decode(qCookie).split('\377');
				if(qCookie.length >= settings.backlogLength){
					qCookie.shift();
				}
			} else {
				qCookie = [];
			}
			qNewData = messageData.split('<!--newline-->');
			var end = qNewData.pop();
			if(end != ''){
				qNewData.push(end);
			}
			qCookie = qCookie.concat(qNewData);
			localStorage.setItem('query'+md5(this.name), Base64.encode(qCookie.join('\377')));
		} catch(e) {}
		this.newLines = true;
	}

	this.changeNick = function(newnick) {
		var oldName = this.name.toLowerCase();
		$('#'+this.id+'-window').vprintf(language.messagePatterns.nickChange, [$$.niceTime(), he(this.name), he(newnick)]);
		$('#'+this.id+'-topic').html('<h1>'+he(newnick)+'</h1><h2></h2>');
		$("#"+this.id+'-tab').html('<a href="javascript:void(0);" class="switchTab" onclick="gateway.switchTab(\''+newnick+'\')">'+he(newnick)+'</a><a href="javascript:void(0);" onclick="gateway.removeQuery(\''+newnick+'\')"><div class="close"></div></a>');
		this.name = newnick;
		if(oldName == gateway.active.toLowerCase()) {
			gateway.switchTab(newnick);
		}
	}
	this.restoreScroll = function() {
		var active = gateway.getActive();
		if(active && this.name != active.name){
			return;
		}
		if(this.scrollSaved) {
			$('#chat-wrapper').scrollTop(this.scrollPos);
		} else {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
	}
	this.saveScroll = function() {
		if($('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight-150 && $('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight*0.97)   {
			this.scrollSaved = false;
			this.scrollPos = 0;
		} else {
			this.scrollSaved = true;
			this.scrollPos = $('#chat-wrapper').scrollTop();
		}
	}
	this.setMark = function() {
		$('#'+this.id+'-window hr').remove();
		$('#'+this.id+'-window').append('<hr>');
		this.newLines = false;
	}
	$('<span/>').attr('id', this.id+'-window').hide().appendTo('#main-window');
	$('<span/>').attr('id', this.id+'-topic').hide().appendTo('#info');
	$('#'+this.id+'-topic').html('<h1>'+this.name+'</h1><h2></h2>');
	$('<li/>').attr('id', this.id+'-tab').html('<a href="javascript:void(0);" class="switchTab" onclick="gateway.switchTab(\''+this.name+'\')">'+he(this.name)+'</a><a href="javascript:void(0);" onclick="gateway.removeQuery(\''+this.name+'\')"><div class="close" title="' + language.closeQuery + '"></div></a>').appendTo('#tabs');
	$('#chstats').append('<div class="chstatswrapper" id="'+this.id+'-chstats"><span class="chstats-text">' + language.query + '</span></div>');
	
	try {
		var qCookie = localStorage.getItem('query'+md5(this.name));
	
		if(qCookie) {
			qCookie = Base64.decode(qCookie).split('\377').join('<!--newline-->');
			$('#'+this.id+'-window').append('<div class="backlog"></div>');
			$('#'+this.id+'-window .backlog').vprintf(language.messagePatterns.queryBacklog, [$$.niceTime(), he(this.name)]);
			$('#'+this.id+'-window .backlog').append(qCookie);
		}
	} catch(e) {}
	
	$('#'+this.id+'-window').vprintf(language.messagePatterns.startedQuery, [$$.niceTime(), he(this.name), this.name]);
}

function Channel(chan) {
	this.name = chan;
	this.id = this.name.replace(/^#/g,'').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()+Math.round(Math.random()*100);
	this.nicklist = new Nicklist(this.name, this.id);
	this.modes = new ChannelModes();
	this.left = false;
	this.hilight = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
	this.topic = '';
	this.newLines = false;
	this.hasNames = false;
	this.msgidHistory = [];
	this.markingSwitch = false; // we use this to alternate the backgrounds of message blocks

	this.part = function() {
		this.left = true;
		this.hasNames = false;
		this.nicklist.remove();
		this.nicklist = new Nicklist(this.name, this.id);
	}

	this.toggleClass = function() {
		if(this.ClassAdded) {
			$('#'+this.id+'-tab').removeClass('newmsg');
			this.ClassAdded = false;
		} else if(this.hilight) {
			$('#'+this.id+'-tab').addClass('newmsg');
			this.ClassAdded = true;
		}
	}
	this.restoreScroll = function() {
		var active = gateway.getActive();
		if(active && this.name != active.name){
			return;
		}
		if(this.scrollSaved) {
			$('#chat-wrapper').scrollTop(this.scrollPos);
		} else {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
	}
	this.saveScroll = function() {
		if($('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight-150 && $('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight*0.97)   {
			this.scrollSaved = false;
			this.scrollPos = 0;
		} else {
			this.scrollSaved =  true;
			this.scrollPos = $('#chat-wrapper').scrollTop();
		}
		
	}
	this.setMark = function() {
		$('#'+this.id+'-window hr').remove();
		$('#'+this.id+'-window').append('<hr>');
		this.newLines = false;
	}
	this.toggleClassMsg = function() {
		if(this.ClassAddedMsg) {
			$('#'+this.id+'-tab').removeClass('newmsg2');
			this.ClassAddedMsg = false;
		} else {
			$('#'+this.id+'-tab').addClass('newmsg2');
			this.ClassAddedMsg = true;
		}
	}
	this.markNew = function() {
		disp.playSound();
		if(!this.hilight) {
			this.hilight = window.setInterval('gateway.findChannel(\''+this.name+'\').toggleClass();', 500);
		}
		
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
			if(this.classAddedMsg) {
				this.toggleClassMsg();
			}
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 500);
		}
		if(!disp.focused){
			if(disp.titleBlinkInterval){
				clearInterval(disp.titleBlinkInterval);
			}
			disp.titleBlinkInterval = setInterval(function(){
				var title = document.title;
				document.title = (title == newMessage ? (he(guser.nick)+' @ '+mainSettings+networkName) : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		if(!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval('gateway.findChannel(\''+bsEscape(this.name)+'\').toggleClassMsg();', 500);
		}
	}
	this.markRead = function() {
		if(!this.newLines){
			$('#'+this.id+'-window hr').remove();
		}
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		
		if(this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
		}
		
		if(this.classAdded) {
			this.toggleClass();
		}
		if(this.classAddedMsg) {
			this.toggleClassMsg();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if(document.title == newMessage) document.title = he(guser.nick)+' @ '+mainSettings+networkName;
		$('#'+this.id+'-tab > a').css('font-weight', 'normal');
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 600);
		
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 600);
	}
	this.close = function() {
		if(!this.left) {
			this.part();
			gateway.send("PART "+this.name+" :" + language.leftChannel);
			gateway.statusWindow.appendMessage(language.messagePatterns.partOwn, [$$.niceTime(), this.name, bsEscape(this.name)]);
		}
		this.nicklist.remove();
		$('#'+this.id+'-tab').remove();
		$('#'+this.id+'-window').remove();
		$('#'+this.id+'-topic').remove();
		$('#'+this.id+'-chstats').remove();
		if(this.name.toLowerCase() == gateway.active.toLowerCase()) {
			gateway.switchTab(gateway.tabHistoryLast(this.name));
		}
	}
	this.rejoin = function() {
		this.left = false;
		$('#'+this.id+'-window').vprintf(language.messagePatterns.joinOwn, [$$.niceTime(), this.name]);
		if(this.name == gateway.active) {
			this.restoreScroll();
		}
	}

	this.appendMessage = function(type, args) {
		var rescroll = false;
		var messageData = $.vsprintf(type, args);
		var fullHeight = document.getElementById('chat-wrapper').scrollHeight;
		var currHeight = $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight();
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && currHeight > fullHeight-200) {
			rescroll = true;
		}
		$('#'+this.id+'-window').append(messageData);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
		if(messageData == '' || messageData.match(/<span class="mode">/)){
			return;
		}
		try {
			var qCookie = localStorage.getItem('channel'+md5(this.name));
			if(qCookie) {
				qCookie = Base64.decode(qCookie).split('\377');
				if(qCookie.length >= settings.backlogLength){
					qCookie.shift();
				}
			} else {
				qCookie = [];
			}
			qNewData = messageData.split('<!--newline-->');
			var end = qNewData.pop();
			if(end != ''){
				qNewData.push(end);
			}
			qCookie = qCookie.concat(qNewData);
			localStorage.setItem('channel'+md5(this.name), Base64.encode(qCookie.join('\377')));
		} catch(e){
		}
		this.newLines = true;
	}
	
	this.appendMsgid = function(msgid){
		this.msgidHistory.push(msgid);
	}
	
	this.hasMsgid = function(msgid){
		if(this.msgidHistory.indexOf(msgid) >= 0) return true;
		return false;
	}
	
	this.setTopic = function(topic) {
		$('#'+this.id+'-topic > h2').html($$.colorize(topic));
		$('#'+this.id+'-topic').unbind('click').click(disp.topicClick);
		this.topic = topic;
	}
	
	this.clearWindow = function() {
		$('#'+this.id+'-window').html(' ');
	}

	$('<span/>').attr('id', this.id+'-window').hide().appendTo('#main-window');
	$('<span/>').attr('id', this.id+'-topic').hide().appendTo('#info');
	$('#'+this.id+'-topic').html('<h1>'+he(this.name)+'</h1><h2></h2>');
	$('<li/>').attr('id', this.id+'-tab').html('<a href="javascript:void(0);" onclick="gateway.switchTab(\''+bsEscape(this.name)+'\')" class="switchTab">'+he(this.name)+'</a>'+
		'<a href="javascript:void(0);" onclick="gateway.removeChannel(\''+bsEscape(this.name)+'\')"><div class="close" title="' + language.leaveChannel + '"></div></a>').appendTo('#tabs');
	$('#chstats').append('<div class="chstatswrapper" id="'+this.id+'-chstats"><span class="chstats-text">'+he(this.name)+'</span>'+
		'<span class="chstats-button" onclick="gateway.toggleChannelOpts(\''+bsEscape(this.name)+'\')">' +language.channelOptions+ '</span>'+
		'<div id="'+this.id+'-channelOptions" class="channelAdmin"><ul class="channelOptions">' +
			'<div class="nickRegistered"><span>' + language.autoJoinThisChannel + '</span>'+
				'<li onclick="services.perform(\'NickServ\', \'AJOIN\', [\'ADD\', \''+bsEscape(this.name)+'\'], true)">' + language.enable + '</li>' +
				'<li onclick="services.perform(\'NickServ\', \'AJOIN\', [\'DEL\', \''+bsEscape(this.name)+'\'], true)">' + language.disable + '</li>' +
			'</div>'+
			'<li onclick="gateway.findChannel(\''+bsEscape(this.name)+'\').clearWindow()">' + language.clearMessageWindow + '</li>' +
			'<li onclick="ircCommand.channelRedoNames(\''+bsEscape(this.name)+'\')">' + language.refreshNickList + '</li>' +
			/*'<li onclick="gateway.send(\'MODE '+bsEscape(this.name)+' I\')" title="Znajdujący się na liście nie potrzebują zaproszenia, gdy jest ustawiony tryb +i">Lista wyjątków i (I)</li>' +
			'<li onclick="gateway.showChannelModes(\''+bsEscape(this.name)+'\')">Tryby kanału</li>' +
			'<li onclick="gateway.showInvitePrompt(\''+bsEscape(this.name)+'\')">Zaproś na kanał</li>' +
			'<li onclick="services.showChanServCmds(\''+bsEscape(this.name)+'\')">Polecenia ChanServ</li>' +
			'<li onclick="services.showBotServCmds(\''+bsEscape(this.name)+'\')">Polecenia BotServ</li>' +*/
		'</ul></div>');
	var operHtml = '<div id="'+this.id+'-operActions" class="'+this.id+'-operActions channelAdmin" style="display:none">' +
		//'<div class="channelOperActionsButton" onclick="gateway.toggleChannelOpts(\''+bsEscape(this.name)+'\')">Akcje administracyjne</div>'+
		'<span class="chstats-button" onclick="gateway.toggleChannelOperOpts(\''+bsEscape(this.name)+'\')">' + language.administrativeActions + '</span>'+
		'<ul class="channelOperActions">' +
			'<li onclick="gateway.send(\'MODE '+bsEscape(this.name)+' b\')">' + language.banList + '</li>' +
			'<li onclick="gateway.send(\'MODE '+bsEscape(this.name)+' e\')" title="' + language.exceptListHint + '">' + language.exceptList + '</li>' +
			'<li onclick="gateway.send(\'MODE '+bsEscape(this.name)+' I\')" title="' + language.invexListHint + '">' + language.invexList + '</li>' +
			'<li onclick="gateway.showChannelModes(\''+bsEscape(this.name)+'\')">' + language.channelModes + '</li>' +
			'<li onclick="gateway.showInvitePrompt(\''+bsEscape(this.name)+'\')">' + language.inviteToChannel + '</li>' +
			'<li onclick="services.showChanServCmds(\''+bsEscape(this.name)+'\')">' + language.chanservCommands + '</li>' +
			'<li onclick="services.showBotServCmds(\''+bsEscape(this.name)+'\')">' + language.botservCommands + '</li>' +
		'</ul>' +
		'</div></div>';
	$('#'+this.id+'-chstats').append(operHtml);
	this.setTopic('');
	guser.setUmode(false);
	
	try {
		var qCookie = localStorage.getItem('channel'+md5(this.name));
	
		if(qCookie) {
			qCookie = Base64.decode(qCookie).split('\377').join('<!--newline-->');
			$('#'+this.id+'-window').append('<div class="backlog"></div>');
			$('#'+this.id+'-window .backlog').vprintf(language.messagePatterns.channelBacklog, [$$.niceTime(), he(this.name)]);
			$('#'+this.id+'-window .backlog').append(qCookie+'<!--newline-->');
			$('#'+this.id+'-window .backlog').vprintf(language.messagePatterns.channelBacklogEnd, [$$.niceTime()]);
		}
	} catch(e) {}
}

function Status() {
	this.name = "--status";
	this.id = "--status";
	this.hilight = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
	this.newLines = false;
	this.modes = {}; // to avoid exceptions

	this.toggleClass = function() {
		if(this.ClassAdded) {
			$('#'+this.id+'-tab').removeClass('newmsg');
			this.ClassAdded = false;
		} else if(this.hilight) {
			$('#'+this.id+'-tab').addClass('newmsg');
			this.ClassAdded = true;
		}
	}
	this.restoreScroll = function() {
		var active = gateway.getActive();
		if(active){
			return;
		}
		if(this.scrollSaved) {
			$('#chat-wrapper').scrollTop(this.scrollPos);
		} else {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}
	}
	this.saveScroll = function() {
		if($('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight-150 && $('#chat-wrapper').scrollTop()+document.getElementById('chat-wrapper').clientHeight > document.getElementById('chat-wrapper').scrollHeight*0.97)   {
			this.scrollSaved = false;
			this.scrollPos = 0;
		} else {
			this.scrollSaved =  true;
			this.scrollPos = $('#chat-wrapper').scrollTop();
		}
	}
	this.setMark = function() {
		$('#'+this.id+'-window hr').remove();
		$('#'+this.id+'-window').append('<hr>');
		this.newLines = false;
	}
	this.toggleClassMsg = function() {
		if(this.ClassAddedMsg) {
			$('#'+this.id+'-tab').removeClass('newmsg2');
			this.ClassAddedMsg = false;
		} else {
			$('#'+this.id+'-tab').addClass('newmsg2');
			this.ClassAddedMsg = true;
		}
	}
	this.markNew = function() {
		disp.playSound();
		if(!this.hilight) {
			this.hilight = window.setInterval('gateway.statusWindow.toggleClass();', 500);
		}
		
		if (this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
			if(this.classAddedMsg) {
				this.toggleClassMsg();
			}
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
			setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 500);
		}
		if(!disp.focused){
			if(disp.titleBlinkInterval){
				clearInterval(disp.titleBlinkInterval);
			}
			disp.titleBlinkInterval = setInterval(function(){
				var title = document.title;
				document.title = (title == newMessage ? (he(guser.nick)+' @ ' + mainSettings.networkName) : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		if(gateway.active == '--status'){
			return;
		}
		if(!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval('gateway.statusWindow.toggleClassMsg();', 500);
		}
	}
	this.markRead = function() {
		if(!this.newLines){
			$('#'+this.id+'-window hr').remove();
		}
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		
		if(this.hilight2) {
			window.clearInterval(this.hilight2);
			this.hilight2 = false;
		}
		
		if(this.classAdded) {
			this.toggleClass();
		}
		if(this.classAddedMsg) {
			this.toggleClassMsg();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if(document.title == newMessage) document.title = he(guser.nick)+' @ ' + mainSettings.networkName;
		$('#'+this.id+'-tab > a').css('font-weight', 'normal');
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg')", 600);
		
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 100);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 300);
		setTimeout("$('#"+this.id+"-tab').removeClass('newmsg2')", 600);
	}
	this.appendMessage = function(type, args) {
		var rescroll = false;
		var fullHeight = document.getElementById('chat-wrapper').scrollHeight;
		var currHeight = $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight();
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && currHeight > fullHeight-200) {
			rescroll = true;
		}
		$('#'+this.id+'-window').vprintf(type, args);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			$('#chat-wrapper').scrollTop(document.getElementById('chat-wrapper').scrollHeight);
		}

		this.newLines = true;
	}
}
