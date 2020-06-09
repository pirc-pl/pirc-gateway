var users = {
	'updateNicklists': function(user){
		for(c in gateway.channels) {
			var nicklistUser = gateway.channels[c].nicklist.findUser(user);
			if(nicklistUser)
				nicklistUser.update();
		}
	},
	'user': function(nick){
		this.nick = nick;
		this.ident = false;
		this.host = false;
		this.realname = false;
		this.account = false;
		this.registered = false;
		this.ircOp = false;
		this.bot = false;
		this.disableAvatar = false;
		this.account = false;
		this.away = false;
		this.metadata = {};
		this.setIdent = function(ident){
			this.ident = ident;
			users.updateNicklists(this);
		};
		this.setHost = function(host){
			this.host = host;
			users.updateNicklists(this);
		};
		this.setAccount = function(account){
			this.account = account;
			if(!account && this.registered){
				this.setRegistered(false);
			} else if(account) {
				this.setRegistered(true);
			}
			users.updateNicklists(this);
		};
		this.setNick = function(nick){
			this.nick = nick;
		};
		this.setRealname = function(realname){
			this.realname = realname;
			users.updateNicklists(this);
		};
		this.setMetadata = function(key, value){
			if(value){
				this.metadata[key] = value;
			} else {
				if(key in this.metadata) delete this.metadata[key];
			}
			if(key == 'avatar'){
				this.disableAvatar = false;
				users.updateNicklists(this);
				if(value && this.nick == guser.nick){ // this is our own avatar
					textSettingsValues['avatar'] = value;
					disp.avatarChanged();
				}
			}
		};
		this.setIrcOp = function(ircOp){
			this.ircOp = ircOp;
			users.updateNicklists(this);
		};
		this.setBot = function(bot){
			this.bot = bot;
			users.updateNicklists(this);
		};
		this.setAway = function(text){
			this.away = text;
			users.updateNicklists(this);
		};
		this.notAway = function(){
			this.away = false;
			users.updateNicklists(this);
		};
		this.setRegistered = function(registered){
			this.registered = registered;
			if(!registered){
				this.setAccount(false);
			}
			if(this.nick == guser.nick){
				if(registered){
					$('#nickRegister').hide();
					$('.nickRegistered').show();
				} else {
					$('#nickRegister').show();
					$('.nickRegistered').hide();

				}
			}
			users.updateNicklists(this);
		};
	},
	'list': {},
	'addUser': function(nick){
		if(nick == '*'){
			if('*' in users.list){
				return users.list['*'];
			} else if(guser.nick in users.list){
				return users.addUser(guser.nick);
			} else {
				users.list['*'] = new users.user('*');
				guser.me = users.list['*'];
				console.log('added own user');
				return users.list['*'];
			}
		}
		if(nick in users.list) return users.list[nick];
		users.list[nick] = new users.user(nick);
		if(nick == guser.nick) guser.me = users.list[nick];
		return users.list[nick];
	},
	'delUser': function(nick){
		if(nick in users.list){
			delete users.list[nick];
		}
	},
	'getUser': function(nick){
		return users.addUser(nick);
	},
	'clear': function(){
		users.list = {};
		users.addUser('*');
	},
	'disableAutoAvatar': function(nick){
		var user = this.list[nick];
		if(!user) return;
		user.disableAvatar = true;
		users.updateNicklists(this);
	},
	'changeNick': function(oldNick, newNick){
		var user = users.getUser(oldNick);
		users.list[newNick] = user;
		delete users.list[oldNick];
		user.setNick(newNick);
		if(oldNick == guser.nick) { // changing own nick
			guser.changeNick(newNick);
			document.title = he(newNick)+' @ PIRC.pl';
		}
		users.updateNicklists(user);
		if(gateway.findQuery(oldNick)) {
			gateway.findQuery(oldNick).changeNick(newNick);
		}
		for(c in gateway.channels) {
			if (user != guser.me && !$('#showNickChanges').is(':checked')){
				if(gateway.channels[c].nicklist.findUser(user)) {
					gateway.channels[c].appendMessage(language.messagePatterns.nickChange, [$$.niceTime(msg.time), he(oldNick), he(newNick)]);
				}
			}
			gateway.channels[c].nicklist.changeNick(user);
		}
	},
	'knowOwnNick': function(){ // called once on connect (001)
		var user = users.getUser('*');
		users.list[guser.nick] = user;
		delete users.list['*'];
		user.setNick(guser.nick);
	}
}

