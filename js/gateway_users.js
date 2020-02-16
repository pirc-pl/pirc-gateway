var users = {
	'user': function(nick){
		this.nick = nick;
		this.ident = false;
		this.host = false;
		this.realname = false;
		this.account = false;
		this.ircOp = false;
		this.bot = false;
		this.disableAutoAvatar = false;
		this.metadata = {};
		this.setIdent = function(ident){
			this.ident = ident;
			for(c in gateway.channels) {
				var nicklistUser = gateway.channels[c].nicklist.findNick(this.nick);
				if(nicklistUser)
					nicklistUser.setIdent(ident);
			}
		};
		this.setHost = function(host){
			this.host = host;
			for(c in gateway.channels) {
				var nicklistUser = gateway.channels[c].nicklist.findNick(this.nick);
				if(nicklistUser)
					nicklistUser.setUserHost(host);
			}
		};
		this.setAccount = function(account){
			this.account = account;
			for(c in gateway.channels) {
				var nicklistUser = gateway.channels[c].nicklist.findNick(this.nick);
				if(nicklistUser){
					if(!account){
						nicklistUser.setAccount(false);
						nicklistUser.setRegistered(false);
					} else {
						nicklistUser.setAccount(account);
						if(this.account == this.nick){
							nicklistUser.setRegistered(true);
						}
					}
				}
			}
		};
		this.setNick = function(nick){
			this.nick = nick;
		};
		this.setRealname = function(realname){
			this.realname = realname;
		};
		this.setMetadata = function(key, value){
			if(value){
				this.metadata[key] = value;
			} else {
				if(key in this.metadata) delete this.metadata[key];
			}
			if(key == 'avatar'){
				for(c in gateway.channels){
					var nicklist = gateway.channels[c].nicklist;
					var nli = nicklist.findNick(this.nick);
					if(nli)
						nli.updateAvatar();					
				}
			}
		};
		this.setIrcOp = function(ircOp){
			this.ircOp = ircOp;
		};
		this.setBot = function(bot){
			this.bot = bot;
		};
		this.setAway = function(text){
			this.away = text;
			gateway.channels.forEach(function(channel){
				var nickListItem = channel.nicklist.findNick(this.nick);
				if(nickListItem){
					nickListItem.setAway(true);
					if(typeof text === "string"){
						nickListItem.setAwayReason(text);
					} else {
						nickListItem.setAwayReason(false);
					}
				}
			}.bind(this));
		};
		this.notAway = function(){
			this.away = false;
			gateway.channels.forEach(function(channel){
				var nickListItem = channel.nicklist.findNick(this.nick);
				if(nickListItem){
					nickListItem.setAway(false);
				}
			}.bind(this));
		};
	},
	'list': {},
	'addUser': function(nick){
		if(nick in users.list) return users.list[nick];;
		users.list[nick] = new users.user(nick);
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
	},
	'disableAutoAvatar': function(nick){
		var user = this.list[nick];
		if(!user) return;
		user.disableAutoAvatar = true;
		for(c in gateway.channels){
			var nicklist = gateway.channels[c].nicklist;
			var nli = nicklist.findNick(user.nick);
			if(nli)
				nli.updateAvatar();					
		}
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
		for(c in gateway.channels) {
			if(gateway.channels[c].nicklist.findNick(oldNick)) {
				gateway.channels[c].nicklist.changeNick(oldNick, newNick);
			}
		}
		if(gateway.findQuery(oldNick)) {
			gateway.findQuery(oldNick).changeNick(newNick);
		}
	}
}

