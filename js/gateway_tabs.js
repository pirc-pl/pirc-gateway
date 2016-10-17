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
	this.addNick = function(nick, initMode) {
		var nickListItem = this.findNick(nick);
		if(!nickListItem) {
			var newNick = new NicklistUser(nick, initMode, this.channel);
			this.list.push(newNick);
			this.insertNick(newNick);
		} else {
			if(initMode) {
				nickListItem.setMode(initMode, true);
				nickListItem.remove();
				this.insertNick(nickListItem);
			}
		}
	}
	this.removeNick = function(nick) {
		for (i in this.list) {
			if(this.list[i].nick == nick) {
				this.list[i].remove();
				this.list.splice(i, 1);
				return true;
			}
		}
		return false;
	}
	try {
		$('<span id="'+this.id+'"></span>').hide().appendTo('#nicklist-main');
		$('<ul/>').addClass('nicklist').appendTo('#'+this.id);
	} catch(e) {
		gateway.send('QUIT :Za stara przeglądarka!');
		$('.not-connected-text > h3').html('Przestarzała przeglądarka');
		$('.not-connected-text > p').html('Twoja przeglądarka jest przestarzała i nie jest obsługiwana. Należy zainstalować przeglądarkę (Mozilla Firefox, Internet Explorer, Opera, Safari, Chrome lub inną) w aktualnej wersji.');
	}
	
	var operHtml = '<div id="'+id+'-operActions" class="'+id+'-operActions channelAdmin" style="display:none">' +
		'<div class="channelOperActionsButton" onclick="gateway.toggleChannelOpts(\''+this.channel+'\')">Akcje administracyjne</div>'+
		'<ul class="channelOperActions">' +
			'<li onclick="gateway.send(\'MODE '+this.channel+' b\')">Lista banów (b)</li>' +
			'<li onclick="gateway.send(\'MODE '+this.channel+' e\')" title="Znajdujący się na liście nie są obejmowani przez bany">Lista wyjątków b (e)</li>' +
			'<li onclick="gateway.send(\'MODE '+this.channel+' I\')" title="Znajdujący się na liście nie potrzebują zaproszenia, gdy jest ustawiony tryb +i">Lista wyjątków i (I)</li>' +
			'<li onclick="gateway.showChannelModes(\''+this.channel+'\')">Tryby kanału</li>' +
			'<li onclick="gateway.showInvitePrompt(\''+this.channel+'\')">Zaproś na kanał</li>' +
		'</ul>' +
		'</div>';
	$('#'+this.id).prepend(operHtml);
}

function NicklistUser(usernick, initMode, chan) {
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

	this.makeHTML = function() {
		return '<li id="'+this.id+'" class="'+md5(this.nick)+'">'+
			'<table><tr onclick="gateway.toggleNickOpt(\''+this.id+'\')">'+
				'<td valign="top"><img class="chrank" alt="'+alt[this.level]+'" src="'+icons[this.level]+'" /></td>'+
				'<td valign="top" style="text-align:left;width:100%;" class="'+((this.nick.toLowerCase()==guser.nick.toLowerCase())?'ownNick ':'')+'nickname">&nbsp;&nbsp;'+this.nick+'</td>'+
			'</tr></table>'+
			'<ul class="options" id="'+this.id+'-opt">'+
				'<li onClick="gateway.queries.push(new Query(\''+this.nick+'\')); gateway.switchTab(\''+this.nick+'\');gateway.toggleNickOpt(\''+this.id+'\');" class="switchTab">Rozmowa Prywatna (QUERY)</li>'+
				'<li><div style="width:100%;" onClick="gateway.toggleNickOptInfo(\''+this.id+'\')">Informacje</div>'+
					'<ul class="suboptions" id="'+this.id+'-opt-info'+'">'+
						'<li onClick="' + ((this.nick.toLowerCase() == guser.nick.toLowerCase())?'gateway.displayOwnWhois = true; ':'') + 'gateway.send(\'WHOIS '+$$.sescape(this.nick)+' '+$$.sescape(this.nick)+'\');gateway.toggleNickOpt(\''+this.id+'\');">WHOIS</li>'+
						'<li onClick="services.nickInfo(\''+this.nick+'\');gateway.toggleNickOpt(\''+this.id+'\');">NickServ</li>'+
						((this.nick.toLowerCase() == guser.nick.toLowerCase())?'':'<li onClick="gateway.ctcp(\''+this.nick+'\', \'VERSION\');gateway.toggleNickOpt(\''+this.id+'\');">Wersja oprogramowania</li>')+
					'</ul>'+
				'</li>'+
				'<li class="' + gateway.findChannel(this.channel).id + '-operActions" style="display:none;"><div style="width:100%;" onClick="gateway.toggleNickOptAdmin(\''+this.id+'\')">Administracja</div>'+
					'<ul class="suboptions" id="'+this.id+'-opt-admin'+'">'+
						'<li onClick="gateway.showKick(\''+this.channel+'\', \''+this.nick+'\')">Wyrzuć z kanału</li>'+
						'<li onClick="gateway.showStatus(\''+this.channel+'\', \''+this.nick+'\')">Daj uprawnienia</li>'+
						'<li onClick="gateway.showStatusAnti(\''+this.channel+'\', \''+this.nick+'\')">Odbierz uprawnienia</li>'+
					/*	'<li onClick="gateway.showBan(\''+this.channel+'\', \''+this.nick+'\')">Banuj</li>'+*/
					'</ul>'+
				'</li>'+
			'</ul>';
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
			}
		}
	}
	this.remove = function() {
		$('#'+this.id).remove();
	}
	this.setIdent = function(ident) {
		this.ident = ident;
		if(this.host){
			$('#'+this.id).attr('title', this.nick+'!'+this.ident+'@'+this.host);
		}
	}
	this.setUserHost = function(host) {
		this.host = host;
		if(this.ident){
			$('#'+this.id).attr('title', this.nick+'!'+this.ident+'@'+this.host);
		}
	}
	this.level = 0;
	this.nick = usernick;
	this.id = usernick.replace(/[^a-z0-9A-Z]+/ig, '-').toLowerCase()+Math.round(Math.random()*10000);
	if(initMode) {
		this.setMode(initMode, true);
	}
}

function Query(nick) {
	this.name = nick;
	this.id = "query-"+this.name.replace(/[^a-z0-9A-Z]+/g, '-').toLowerCase()+Math.round(Math.random()*100);
	this.hilight = false;
	this.newmsg = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;
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
				document.title = (title == newMessage ? (he(guser.nick)+' @ PIRC.pl') : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		$('#'+this.id+'-tab > a').css('font-weight', 'bold');
		$('#'+this.id+'-tab > a').css('color', '#fff');
	}
	this.markRead = function() {
		if(this.hilight) {
			window.clearInterval(this.hilight);
			this.hilight = false;
		}
		if(this.classAdded) {
			this.toggleClass();
		}
		clearInterval(disp.titleBlinkInterval);
		disp.titleBlinkInterval = false;
		if(document.title == newMessage) document.title = he(guser.nick)+' @ PIRC.pl';
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
		if(this.name.toLowerCase() == gateway.active.toLowerCase()) {
			gateway.switchTab(gateway.tabHistoryLast(this.name));
		}
	}
	this.appendMessage = function(type, args) {
		var rescroll = false;
		var messageData = $.vsprintf(type, args);
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && document.getElementById('chat-wrapper').scrollHeight >= $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight()) {
			this.saveScroll();
			var rescroll = true;
		}
		$('#'+this.id+'-window').append(messageData);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			this.restoreScroll();
		}
		if(messageData == '' || messageData.match(/<span class="join">/)){
			return;
		}
		var qCookie = localStorage.getItem('query'+md5(this.name));
		if(qCookie) {
			qCookie = Base64.decode(qCookie).split('\377');
			if(qCookie.length >= settings.backlogLength){
				qCookie.shift();
			}
		} else {
			qCookie = [];
		}
		messageData = messageData.replace('<br />', '<br>');
		qNewData = messageData.split('<br>');
		var end = qNewData.pop();
		if(end != ''){
			qNewData.push(end);
		}
		qCookie = qCookie.concat(qNewData);
		try {
			localStorage.setItem('query'+md5(this.name), Base64.encode(qCookie.join('\377')));
		} catch(e){
		}
	}

	this.changeNick = function(newnick) {
		var oldName = this.name.toLowerCase();
		$('#'+this.id+'-window').vprintf(messagePatterns.nickChange, [gateway.niceTime(), he(this.name), he(newnick)]);
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
	$('<span/>').attr('id', this.id+'-window').hide().appendTo('#main-window');
	$('<span/>').attr('id', this.id+'-topic').hide().appendTo('#topic');
	$('#'+this.id+'-topic').html('<h1>'+this.name+'</h1><h2></h2>');
	$('<li/>').attr('id', this.id+'-tab').html('<a href="javascript:void(0);" class="switchTab" onclick="gateway.switchTab(\''+this.name+'\')">'+he(this.name)+'</a><a href="javascript:void(0);" onclick="gateway.removeQuery(\''+this.name+'\')"><div class="close" title="Zamknij rozmowę prywatną"></div></a>').appendTo('#tabs');
	
	var qCookie = localStorage.getItem('query'+md5(this.name));
	
	if(qCookie) {
		qCookie = Base64.decode(qCookie).split('\377').join('<br>');
		$('#'+this.id+'-window').append('<div class="backlog"></div>');
		$('#'+this.id+'-window .backlog').vprintf(messagePatterns.queryBacklog, [gateway.niceTime(), he(this.name)]);
		$('#'+this.id+'-window .backlog').append(qCookie);
	}
	
	$('#'+this.id+'-window').vprintf(messagePatterns.startedQuery, [gateway.niceTime(), he(this.name)]);
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

	this.part = function() {
		this.left = true;
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
				document.title = (title == newMessage ? (he(guser.nick)+' @ PIRC.pl') : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		if(!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval('gateway.findChannel(\''+this.name+'\').toggleClassMsg();', 500);
		}
	}
	this.markRead = function() {
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
		if(document.title == newMessage) document.title = he(guser.nick)+' @ PIRC.pl';
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
			gateway.send("PART "+this.name+" :Opuścił kanał");
			gateway.statusWindow.appendMessage(messagePatterns.partOwn, [gateway.niceTime(), this.name, this.name]);
		}
		this.nicklist.remove();
		$('#'+this.id+'-tab').remove();
		$('#'+this.id+'-window').remove();
		$('#'+this.id+'-topic').remove();
		if(this.name.toLowerCase() == gateway.active.toLowerCase()) {
			gateway.switchTab(gateway.tabHistoryLast(this.name));
		}
	}
	this.rejoin = function() {
		this.left = false;
		$('#'+this.id+'-window').vprintf(messagePatterns.joinOwn, [gateway.niceTime(), this.name]);
		if(this.name == gateway.active) {
			this.restoreScroll();
		}
	}

	this.appendMessage = function(type, args) {
		var rescroll = false;
		var messageData = $.vsprintf(type, args);
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && document.getElementById('chat-wrapper').scrollHeight >= $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight()) {
			this.saveScroll();
			var rescroll = true;
		}
		$('#'+this.id+'-window').append(messageData);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			this.restoreScroll();
		}
		if(messageData == '' || messageData.match(/<span class="mode">/)){
			return;
		}
		var qCookie = localStorage.getItem('channel'+md5(this.name));
		if(qCookie) {
			qCookie = Base64.decode(qCookie).split('\377');
			if(qCookie.length >= settings.backlogLength){
				qCookie.shift();
			}
		} else {
			qCookie = [];
		}
		messageData = messageData.replace('<br />', '<br>');
		qNewData = messageData.split('<br>');
		var end = qNewData.pop();
		if(end != ''){
			qNewData.push(end);
		}
		qCookie = qCookie.concat(qNewData);
		try {
			localStorage.setItem('channel'+md5(this.name), Base64.encode(qCookie.join('\377')));
		} catch(e){
		}
	}
	this.setTopic = function(topic) {
		$('#'+this.id+'-topic > h2').html($$.colorize(topic));
		$('#'+this.id+'-topic > h2').click(disp.topicClick);
		this.topic = topic;
	}

	$('<span/>').attr('id', this.id+'-window').hide().appendTo('#main-window');
	$('<span/>').attr('id', this.id+'-topic').hide().appendTo('#topic');
	$('#'+this.id+'-topic').html('<h1>'+he(this.name)+'</h1><h2></h2>');
	$('<li/>').attr('id', this.id+'-tab').html('<a href="javascript:void(0);" onclick="gateway.switchTab(\''+this.name+'\')" class="switchTab">'+he(this.name)+'</a>'+
		'<a href="javascript:void(0);" onclick="gateway.removeChannel(\''+this.name+'\')"><div class="close" title="Wyjdź z kanału"></div></a>').appendTo('#tabs');
	
	var qCookie = localStorage.getItem('channel'+md5(this.name));
	
	if(qCookie) {
		qCookie = Base64.decode(qCookie).split('\377').join('<br>');
		$('#'+this.id+'-window').append('<div class="backlog"></div>');
		$('#'+this.id+'-window .backlog').vprintf(messagePatterns.channelBacklog, [gateway.niceTime(), he(this.name)]);
		$('#'+this.id+'-window .backlog').append(qCookie+'<br>');
		$('#'+this.id+'-window .backlog').vprintf(messagePatterns.channelBacklogEnd, [gateway.niceTime()]);
	}
}

function Status() {
	this.name = "--status";
	this.id = "--status";
	this.hilight = false;
	this.classAdded = false;
	this.scrollPos = 0;
	this.scrollSaved = false;

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
				document.title = (title == newMessage ? (he(guser.nick)+' @ PIRC.pl') : newMessage);
			}, 500);
		}
	}
	this.markBold = function() {
		if(!this.hilight2 && !this.hilight) {
			this.hilight2 = window.setInterval('gateway.statusWindow.toggleClassMsg();', 500);
		}
	}
	this.markRead = function() {
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
		if(document.title == newMessage) document.title = he(guser.nick)+' @ PIRC.pl';
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
		if(this.name.toLowerCase() == gateway.active.toLowerCase() && document.getElementById('chat-wrapper').scrollHeight >= $('#chat-wrapper').scrollTop() + $('#chat-wrapper').innerHeight()) {
			this.saveScroll();
			var rescroll = true;
		}
		$('#'+this.id+'-window').vprintf(type, args);
		if(rescroll && this.name.toLowerCase() == gateway.active.toLowerCase()) {
			this.restoreScroll();
		}
	}
}
