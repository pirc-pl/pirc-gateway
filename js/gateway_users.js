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
		};
		this.setHost = function(host){
			this.host = host;
		};
		this.setAccount = function(account){
			this.account = account;
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
	}
}

