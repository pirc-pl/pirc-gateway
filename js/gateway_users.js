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

var users = {
	'user': function(nick){
		this.nick = nick;
		this.id = nick.replace(/^#/g,'').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()+Math.round(Math.random()*10000);
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
		this.server = false; // this user is a server
		this.metadata = {};
		this.setIdent = function(ident){
			this.ident = ident;
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'ident' });
		};
		this.setHost = function(host){
			this.host = host;
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'host' });
		};
		this.setAccount = function(account){
			this.account = account;
			if(!account && this.registered){
				this.setRegistered(false);
			} else if(account) {
				this.setRegistered(true);
			}
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'account' });
		};
		this.setNick = function(nick){
			this.nick = nick;
		};
		this.setRealname = function(realname){
			this.realname = realname;
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'realname' });
		};
		this.setMetadata = function(key, value){
			if(value){
				this.metadata[key] = value;
			} else {
				if(key in this.metadata) delete this.metadata[key];
			}
			if(key == 'avatar'){
				this.disableAvatar = false;
				ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'avatar' });
				if(value && this.nick == guser.nick){ // this is our own avatar
					textSettingsValues['avatar'] = value;
					ircEvents.emit('domain:meAvatarMetadataUpdated', { user: this, avatarValue: value });
				}
			} else { // General metadata change
				ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'metadata', metadataKey: key });
			}
		};
		this.setIrcOp = function(ircOp){
			this.ircOp = ircOp;
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'ircOp' });
		};
		this.setBot = function(bot){
			this.bot = bot;
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'bot' });
		};
		this.setAway = function(text){
			this.away = text;
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'away' });
		};
		this.notAway = function(){
			this.away = false;
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'away' });
		};
		this.setRegistered = function(registered){
			this.registered = registered;
			if(!registered){
				this.setAccount(false);
			}
			if(this.nick == guser.nick){
				ircEvents.emit('domain:meRegisteredStatusUpdated', { user: this, registered: registered });
			}
			ircEvents.emit('domain:userUpdated', { user: this, updatedField: 'registered' });
		};
	},
	'list': {},
	'channelMemberLists': new Map(),
	'addUser': function(nick){
		if(nick == '*'){
			if('*' in users.list){
				return users.list['*'];
			} else if(guser.nick in users.list){
				return users.addUser(guser.nick);
			} else {
				users.list['*'] = new users.user('*');
				guser.me = users.list['*'];
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
	'getExistingUser': function(nick){
		if(nick in users.list) return users.list[nick];
		return null;
	},
	'clear': function(){
		users.list = {};
		users.addUser('*');
	},
	'disableAutoAvatar': function(nick){
		var user = this.list[nick];
		if(!user) return;
		user.disableAvatar = true;
		ircEvents.emit('domain:userUpdated', { user: user, updatedField: 'disableAvatar' });
	},
	'changeNick': function(oldNick, newNick, time){
		if(!time)
			time = new Date();

		var user = users.getExistingUser(oldNick);
		if (!user) return;

		delete users.list[oldNick];
		user.setNick(newNick);
		users.list[newNick] = user;

		if(oldNick == guser.nick) { // changing own nick
			guser.changeNick(newNick);
			ircEvents.emit('domain:meNickChanged', { oldNick: oldNick, newNick: newNick });
		}

		// Emit a general user update event for any nicklist displays
		// The `updatedField: 'nick'` would indicate the primary change
		ircEvents.emit('domain:userUpdated', { user: user, updatedField: 'nick' });
		// Emit a specific event for the nick change to trigger query/channel UI updates
		ircEvents.emit('domain:userNickChanged', { oldNick: oldNick, newNick: newNick, time: time });
	},
	'knowOwnNick': function(){ // called once on connect (001)
		var user = users.getUser('*');
		users.list[guser.nick] = user;
		delete users.list['*'];
		user.setNick(guser.nick);
	},
	'getChannelMemberList': function(channelName) {
		return users.channelMemberLists.get(channelName);
	},
	'addChannelMemberList': function(channelName) {
		if (!users.channelMemberLists.has(channelName)) {
			users.channelMemberLists.set(channelName, new ChannelMemberList(channelName));
		}
		return users.channelMemberLists.get(channelName);
	},
	'removeChannelMemberList': function(channelName) {
		if (users.channelMemberLists.has(channelName)) {
			var cml = users.channelMemberLists.get(channelName);
			// Optionally, emit an event that the list is being removed
            ircEvents.emit('domain:channelMemberListRemoved', { channelName: channelName });
			users.channelMemberLists.delete(channelName);
			return true;
		}
		return false;
	}
}