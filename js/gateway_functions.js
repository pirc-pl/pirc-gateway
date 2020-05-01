// definicje stałych globalnych
var icons = [
	'/styles/img/users.png',
	'/styles/img/voice.png',
	'/styles/img/hop.png',
	'/styles/img/op.png',
	'/styles/img/prot.png',
	'/styles/img/owner.png',
	'/styles/img/user-registered.png'
];
var alt = [	'', '+', '%', '@', '&', '~', '' ];
var chStatusInfo = [ 'Niezarejestrowany', 'Prawo głosu', 'Pół-operator', 'Operator', 'Admin', 'Właściciel', 'Zarejestrowany' ];

var reqChannel = '';

var booleanSettings = [ 'showPartQuit', 'showNickChanges', 'tabsListBottom', 'showUserHostnames', 'autoReconnect', 'displayLinkWarning', 'blackTheme', 'newMsgSound', 'autoDisconnect', 'coloredNicks', 'showMode', 'dispEmoji', 'sendEmoji', 'monoSpaceFont', 'automLogIn', 'setUmodeD', 'setUmodeR', 'noAvatars' ];
var comboSettings = [ 'noticeDisplay' ];
var numberSettings = [ 'backlogCount' ];
var numberSettingsMinMax = {
	'backlogCount' : { 'min' : 0, 'max' : 500, 'deflt' : 15 }
};
var textSettings = [ 'avatar' ];
var textSettingsValues = {};

var banData = {
	'nick' : '',
	'channel' : '',
	'noIdent' : false,
	'ident' : '',
	'hostElements' : [],
	'hostElementSeparators' : [],
   	'clear' : function(){
		banData.nick = '';
		banData.channel = '';
		banData.noIdent = false;
		banData.ident = '';
		banData.hostElements = [];
		banData.hostElementSeparators = [];
	}
}

var messageProcessors = []; //function (src, dst, text) returns new_text
var nickColorProcessors = []; //function (nick)
var settingProcessors = []; //function ()
var addons = [];

var messagePatterns = {
	'nickChange': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ <span class="modeinfo">%s</span> zmienił nick na <span class="modeinfo">%s</span></span></div><!--newline-->',
	'nickInUse': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">✯ <span class="modeinfo">%s</span>: Nick jest już używany przez kogoś innego.</span></div><!--newline-->',
	'badNick': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">⮿ <span class="modeinfo">%s</span>: Nick nie jest dostępny.</span></div><!--newline-->',
	'nickChangeOwn': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Jesteś teraz znany jako <span class="modeinfo">%s</span></span></div><!--newline-->',
	'joinOwn': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="join">🢡 Dołączyłeś do kanału <span class="modeinfo">%s</span>.</span></div><!--newline-->',
	'join': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="join">🢡 <b>%s</b> <i class="userhost">[%s@%s]</i> dołączył do <span class="modeinfo">%s</span>.</span></div><!--newline-->',
	'part': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="part">🢠 <b>%s</b> <i class="userhost">[%s@%s]</i> opuścił <span class="modeinfo">%s</span> [%s]</span></div><!--newline-->',
	'quit': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="part">🢠 <b>%s</b> <i class="userhost">[%s@%s]</i> opuścił IRC [%s]</span></div><!--newline-->',
	'partOwn': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="part">🢠 Opuściłeś kanał <span class="modeinfo">%s</span>. <a href="#" onclick="gateway.send(\'JOIN %s\')">Dołącz ponownie</a></span></div><!--newline-->',
	'channelMsg': '<div class="messageDiv %s"><div class="messageMeta">%s</div><div class="messageHeader"><span class="time">%s &nbsp;</span><span class="nick">&lt;<span %s>%s</span>&gt;%s</span></div><span class="msgText">%s</span></div><!--newline-->',
	'yourMsg': '<div class="messageDiv %s"><div class="messageMeta">%s</div><div class="messageHeader"><span class="time">%s &nbsp;</span><span class="yournick">&lt;<span %s>%s</span>&gt;%s</span></div><span class="msgText">%s</span></div><!--newline-->',
	'channelMsgHilight': '<div class="messageDiv %s"><div class="messageMeta">%s</div><div class="messageHeader"><span class="time">%s &nbsp;</span><span class="hilight"><span class="nick">&lt;%s&gt;%s</span></span></div><span class="msgText">%s</span></div><!--newline-->',
	'channelAction': '<div class="messageDiv"><span class="time">%s</span> &nbsp; ❇ <span class="nick">%s</span> %s</div><!--newline-->',
	'yourAction': '<div class="messageDiv"><span class="time">%s</span> &nbsp; ❇ <span class="yournick">%s</span> %s</div><!--newline-->',
	'channelActionHilight': '<div class="messageDiv"><span class="time">%s</span> &nbsp; ❇ <span class="hilight"><span class="nick">%s</span> %s</span></div><!--newline-->',
	'changeTopic': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ <span class="modeinfo">%s</span> zmienił temat na: %s</span></div><!--newline-->',
	'deleteTopic': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ <span class="modeinfo">%s</span> usunął temat <span class="modeinfo">%s</span></span></div><!--newline-->',
	'topic': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Temat kanału <span class="modeinfo">%s</span>: %s</span></div><!--newline-->',
	'topicNotSet': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Temat <span class="modeinfo">%s</span> nie jest ustawiony</span></div><!--newline-->',
	'topicTime': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Temat ustawiony przez <span class="modeinfo">%s</span> [%s]</span></div><!--newline-->',
	'kick': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">✀ <span class="modeinfo">%s</span> wyrzucił <span class="modeinfo">%s</span> z <span class="modeinfo">%s</span> [Powód: %s]</span></div><!--newline-->',
	'kickOwn': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">✀ <span class="modeinfo">%s</span> wyrzucił cię z <span class="modeinfo">%s</span> [Powód: %s]</span></div><!--newline-->',
	'modeChange': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">🔧 <span class="modeinfo">%s</span> %s na kanale <span class="modeinfo">%s</span></span></div><!--newline-->',
	'mode': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">🔧 Ustawienia kanału <span class="modeinfo">%s</span>: %s</span></div><!--newline-->',
	'creationTime': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Kanał stworzony: %s</span></div><!--newline-->',
	'startedQuery': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="join">🢡 Rozpoczęto rozmowę z <span class="modeinfo">%s</span>. <a onclick="ignore.askIgnore(\'%s\');">Ignoruj tego użytkownika</a> / <a onclick="disp.showQueryUmodes()">Blokowanie wiadomości prywatnych</a></span></div><!--newline-->',
	'queryBacklog': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="join">✯ Zapis poprzedniej rozmowy z <span class="modeinfo">%s</span>:</span></div><!--newline-->',
	'channelBacklog': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Zapis poprzedniej wizyty na <span class="modeinfo">%s</span>:</span></div><!--newline-->',
	'channelBacklogEnd': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Koniec zapisu.</span></div><!--newline-->',
	'noSuchCommand': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ <span class="modeinfo">%s</span>: nieznana komenda.</span></div><!--newline-->',
	'noSuchNick': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ <span class="modeinfo">%s</span>: nie ma takiego nicku ani kanału</span></div><!--newline-->',
	'noSuchNickHistory': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ <span class="modeinfo">%s</span>: brak historii wizyt nicka</span></div><!--newline-->',
	'noSuchChannel': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ <span class="modeinfo">%s</span>: nie ma takiego kanału</span></div><!--newline-->',
	'notOnChannel': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ <span class="modeinfo">%s</span>: nie jesteś na tym kanale</span></div><!--newline-->',
	'alreadyOnChannel': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ %s: <span class="modeinfo">%s</span> jest już na tym kanale</span></div><!--newline-->',
	'youQuit': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="part">✯ Wyszedłeś z IRC</span></div><!--newline-->',
	'notConnected': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ Nie jesteś połączony z IRC!</span></div><!--newline-->',
	'notEnoughParameters': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ <span class="modeinfo">%s</span>: Za mało argumentów.</span></div><!--newline-->',
	'cannotSendToChan': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">⮿ Nie można wysłać na <span class="modeinfo">%s</span>: %s. Wiadomość nie została dostarczona.</span></div><!--newline-->',
	'cannotSendToUser': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">⮿ Nie można pisać do <span class="modeinfo">%s</span>: %s. Wiadomość nie została dostarczona.</span></div><!--newline-->',
	'cannotJoin': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">⮿ Nie można dołączyć do kanału <span class="modeinfo">%s</span>: %s</span></div><!--newline-->',
	'noPerms': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">⮿ Brak uprawnień.</span></div><!--newline-->',
	'notice': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="notice-nick"><b>-%s-</b></span><span class="userhost">(<span class="notice-nick">%s</span>@<span class="notice-nick">%s</span>)</span> <span class="notice">%s</span></div><!--newline-->',
	'serverNotice': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="notice-nick">Wiadomość od serwera <b>%s</b>:</span> <span class="notice">%s</span></div><!--newline-->',
	'yourNotice': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="notice"><b>-NOTICE/%s-</b> %s</span></div><!--newline-->',
	'notEnoughParams': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">⮿ <span class="modeinfo">%s</span>: za mało argumentów: %s</span></div><!--newline-->',
	'motd': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="motd">✯ %s</span></div><!--newline-->',
	'SaslAuthenticate': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="sinfo">🔧 %s</span></div><!--newline-->',
	'ctcpRequest': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ <span class="modeinfo">%s</span> wysyła CTCP REQUEST: %s</span></div><!--newline-->',
	'ctcpReply': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="notice">✯ <b>CTCP REPLY od %s:</b> %s</span></div><!--newline-->',
	'chanListElement': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="notice">✯ <b><a href="#" onClick="gateway.send(\'JOIN %s\')">%s</a></b> (%s) - %s </span> </div><!--newline-->',
	'chanListElementHidden': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="notice">✯ <b>(kanał ukryty)</b> (%s) - (temat ukryty) </span> </div><!--newline-->',
	'error': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode"> ⮿ Rozłączono z serwerem: %s</span></div><!--newline-->',
	'existingConnection': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Połączenie już istnieje, dołączam się do niego.</span></div><!--newline-->',
	'away': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">🍵 <span class="modeinfo">%s</span> otrzymał twoją wiadomość, ale jest teraz nieobecny: %s</span></div><!--newline-->',
	'yourAwayEnabled': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">🍵 Jesteś teraz oznaczony jako nieobecny</span></div><!--newline-->',
	'yourAwayDisabled': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">🍵 Nie jesteś już oznaczony jako nieobecny</span></div><!--newline-->',
	'yourInvite': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Zaprosiłeś użytkownika <span class="modeinfo">%s</span> na kanał <span class="modeinfo">%s</span></span></div><!--newline-->',
	'knocked': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Poprosiłeś o dostęp ("zapukałeś") na <span class="modeinfo">%s</span>, czekaj na zaproszenie od operatora. Pamiętaj, że w danej chwili żaden operator może nie być przy komputerze. W takiej sytuacji zaczekaj kilkadziesiąt minut i spróbuj jeszcze raz.</span></div><!--newline-->',
	'listShown': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Lista kanałów będzie wyświetlona w zakładce statusu.</span></div><!--newline-->',
	'channelIgnoreAdded': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Dodano <b>%s</b> do ignorowanych na kanałach.</span></div><!--newline-->',
	'channelIgnoreRemoved': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Usunięto <b>%s</b> z ignorowanych na kanałach.</span></div><!--newline-->',
	'queryIgnoreAdded': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Dodano <b>%s</b> do ignorowanych prywatnie.</span></div><!--newline-->',
	'queryIgnoreRemoved': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Usunięto <b>%s</b> z ignorowanych prywatnie.</span></div><!--newline-->',
	'ignoreListStart': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Lista ignorowanych:</span></div><!--newline-->',
	'ignoreListEnd': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Koniec listy.</span></div><!--newline-->',
	'ignoreListEmpty': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Lista ignorowanych jest pusta.</span></div><!--newline-->',
	'ignoreListItem': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="mode">✯ Typ: <b>%s</b>, maska: <b>%s</b></span></div><!--newline-->',
	'netsplit': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="part">🢠 <span class="netsplit">Netsplit</span>, wychodzą: %s</span></div><!--newline-->',
	'netjoin': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="join">🢡 Po <span class="netjoin">netsplicie</span> wchodzą: %s</span></div><!--newline-->',
	'displayedHost': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="sinfo">🔧 Twój host jest teraz widoczny jako %s</span></div><!--newline-->',
	'invalidMode': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">⮿ Nieprawidłowy tryb "%s"</span></div><!--newline-->',
	'unimplemented': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="sinfo">✯ %s</span></div><!--newline-->',
	'unimplementedError': '<div class="messageDiv"><span class="time">%s</span> &nbsp; <span class="kick">⮿ %s</span></div><!--newline-->'
};

var modes = {
	/* default modes from rfc1459, we're overwriting it with ISUPPORT data later */
	'single': ['p', 's', 'i', 't', 'n', 'm'],
	'argBoth': ['k'],
	'argAdd': ['l'],
	'list': ['b'],
	'user': ['o', 'v'],
	/* unrealircd mode comments */
	'changeableSingle': [
		['m', 'Kanał moderowany'],
		['i', 'Tylko na zaproszenie'],
		['s', 'Kanał ukryty'],
		['R', 'Tylko dla zarejestrowanych nicków'],
		['N', 'Zakaz zmiany nicków'],
		['Q', 'Zakaz kopania'],
		['M', 'Do mówienia wymagany zarejestrowany nick lub co najmniej +v'],
		['t', 'Tylko operator może zmieniać temat'],
		['n', 'Nie można wysyłać wiadomości nie będąc na kanale'],
		['D', 'Użytkownicy będą widoczni na liście tylko wtedy, gdy coś napiszą']
	],
	'changeableArg': [
		['k', 'Hasło do kanału'],
		['l', 'Maksymalna ilość użytkowników']
	],
	/* again defaults from rfc1459 */
	'prefixes': {
		'o': '@',
		'v': '+'
	},
	'reversePrefixes': {
		'@': 'o',
		'+': 'v'
	}
};

var chModeInfo = {
	'q': 'status właściciela',
	'a': 'status admina',
	'o': 'status operatora',
	'h': 'status pół-operatora',
	'v': 'prawo głosu',
	'k': 'hasło:',
	'b': 'bana na',
	'e': 'wyjątek bana na',
	'I': 'stałe zaproszenie na',
	'f': 'zabezpieczenie przed floodem:',
	'p': 'tryb prywatny',
	's': 'tryb ukryty',
	'm': ['moderację', 'kanał moderowany'],
	'n': 'brak wiadomości z zewnątrz',
	't': ['ochronę tematu', 'chroniony temat'],
	'i': 'wejście tylko na zaproszenie',
	'r': ['rejestrację', 'zarejestrowany'],
	'R': 'wejście tylko dla zarejestrowanych',
	'c': ['blokadę kolorów', 'blokada kolorów'],
	'O': 'tryb O',
	'Q': ['blokadę kopania', 'zablokowane kopanie'],
	'K': ['blokadę pukania', 'zablokowane pukanie'],
	'V': ['blokadę zaproszeń', 'zablokowane zaproszenia'],
	'C': ['blokadę CTCP', 'zablokowane CTCP'],
	'z': 'wejście tylko dla połączeń szyfrowanych',
	'N': ['blokadę zmian nicków', 'zablokowana zmiana nicków'],
	'S': 'usuwanie kolorów',
	'M': ['moderację niezarejestrowanych', 'niezarejestrowani są moderowani'],
	'T': ['blokadę NOTICE', 'zablokowane NOTICE'],
	'G': 'tryb G',
	'D': 'tryb D: użytkownicy będą widoczni na liście tylko wtedy, gdy coś napiszą',
	'd': 'tryb d',
	'L-add': 'przekierowanie na kanał',
	'L-remove': 'przekierowanie na inny kanał',
	'l-add': 'limit użytkowników na',
	'l-remove': 'limit użytkowników',
	'H-add': 'pamięć historii kanału',
	'H-remove': 'pamięć historii kanału'
};

var chStatusNames = {
	'q': 'owner',
	'a': 'admin',
	'o': 'op',
	'h': 'halfop',
	'v': 'voice'
};

var servicesNicks = ['NickServ', 'ChanServ', 'HostServ', 'OperServ', 'Global', 'BotServ'];

var newMessage = 'Nowa wiadomość';

var emoji = {
	':D':	'😃',
	'O:->':	'😇',
	']:->': '😈',
	'^^':	'😊',
	':p':	'😋',
	'3)':	'😌',
	'8)':	'😎',
	':>':	'😏',
	':|':	'😐',
	':<':	'😒',
	':((':	'😓',
	':/':	'😕',
	':c':	'😕',
	':o':	'😕',
	':O':	'😱',
	'xo':	'😵',
	':*':	'😘',
	';*':	'😙',
	':P':	'😛',
	';p':	'😜',
	':(':	'🙁',
	':)':	'🙂',
	'(:':	'🙃',
	'<3':	'💗',
	'-_-':	'😑',
	';(':	'😢',
	';)':	'😉'
};	

function ChannelModes() {
	modes.single.forEach(function(mode){
		this[mode] =  false;
	}, this);
	modes.argAdd.forEach(function(mode){
		this[mode] = false;
	}, this);
	this['k'] = false;
	this['f'] = false;
}

function getModeInfo(letter, type){
	if(!type){
		type = 0;
	}
	if(!(letter in chModeInfo)) return 'tryb '+letter; //nieznany tryb
	var data = chModeInfo[letter];
	if(data.constructor === Array){
		return data[type];
	} else {
		return data;
	}
}

// pomocnicze funkcje globalne
function str2bool(b){
	return (b === 'true');
}

function he(text) { //HTML Escape
	return $('<div/>').text(text).html().replace(/"/g, '&quot;');
}

function bsEscape(text) { // escapowanie beksleszy
	return text.replace(/\\/g, '\\\\');
}

function rxEscape(text) { //backupowanie regex
	return text.replace(/[.^$*+?()[{\\|]/g, '\\$&');
}

if (!String.prototype.isInList) {
   String.prototype.isInList = function(list) {
      var value = this.valueOf();
      for (var i = 0, l = list.length; i < l; i += 1) {
         if (list[i].toLowerCase() === value.toLowerCase()) return true;
      }
      return false;
   }
}

if(!String.prototype.apList){
	String.prototype.apList = function(data){
		if(this == ''){
			return data;
		} else {
			return this.valueOf() + ', '+data;
		}
	}
}

if(!String.prototype.startsWith){
	String.prototype.startsWith = function(searchString, position) {
		position = position || 0;
		return this.indexOf(searchString, position) === position;
	};
}

var emojiRegex = [];

var out1 = '';
var out2 = '';
for(i in emoji){
	var expr = rxEscape(i)+'(($)|(\\s))';
	var regex = new RegExp(expr, 'g');
	emojiRegex.push([regex, emoji[i]]);
	out1 += emoji[i] + ' ';
	out2 += i + ' ';
}
/*console.log(out1); // emoji setup logging
console.log(out2);*/

// zmienna gateway.connectStatus

var statusDisconnected = 0;
var status001 = 1;
var statusGhostSent = 2;
var statusIdentified = 3;
var statusConnected = 4;
var statusReIdentify = 5;
var statusError = 6;
var statusBanned = 7;
var statusWrongPassword = 8;
var statusGhostAndNickSent = 9;

// stany parsera irc

var stateStart = 0;
var stateSenderNick = 1;
var stateArgs = 2;
var stateMessage = 3;
var stateCommand = 4;
var stateSenderUser = 5;
var stateSenderHost = 6;
var stateTags = 7;

// tags parser states

var tagStateKeyName = 0;
var tagStateKeyValue = 1;
var tagStateKeyValueEscape = 2;

var settings = {
	'backlogLength': 15
}

var loaded = false;

var readyFunctions = [ conn.gatewayInit, fillEmoticonSelector, fillColorSelector ];

var readyFunc = function(){
	if(loaded) return;
	$('.not-connected-text > h3').html('Ładowanie');
	$('.not-connected-text > p').html('Poczekaj chwilę, trwa ładowanie...');
	if($.browser.msie && parseInt($.browser.version, 10) < 9) {
		$('.not-connected-text > h3').html('Przestarzała przeglądarka');
		$('.not-connected-text > p').html('Twoja przeglądarka jest przestarzała i nie jest obsługiwana. Należy zaktualizować przeglądarkę Internet Explorer do wersji 9 lub wyższej albo użyć innej przeglądarki (Firefox, Opera, Chrome, Safari) w którejś z nowszych wersji.<br />Jeżeli posiadasz przeglądarkę Internet Explorer w wersji 9 lub wyższej i widzisz ten komunikat wyłącz tzw "widok zgodności" dla tej strony.');
		gateway = 0;
		guser = 0;
		cmd_binds = 0;
		$('div#wrapper').html('');
	} else {
		loaded = true;
		for(f in readyFunctions){
			try {
				readyFunctions[f]();
			} catch(e) {}
		}
	}	
}

$('document').ready(function(){setTimeout(readyFunc, 100);});

function fillColorSelector(){
	var html = '<tr>';
	for(var i=0; i<=98; i++){
		if(i%16 == 0){
			html += '</tr><tr>';
		}
		html += '<td><button type="button" class="colorButton" value="" style="background-color: ' + $$.getColor(i) + ';" onClick="gateway.insertColor(' + i + ')" /></td>';
	}
	if(i%8 != 0){
		html += '</tr>';
	}
	$('#color-array').html(html);
}

function fillEmoticonSelector(){
	var emojiSelectable = [
		'☺', '😀', '😁', '😂', '😃', '😄', '😅', '😅', '😇', '😈', '😉', '😊', '😋', '😌', '😍', '😎', '😏', '😐', '😑', '😒',
		'😓', '😔', '😕', '😖', '😗', '😘', '😙', '😚', '😛', '😜', '😝', '😞', '😟', '😠', '😡', '😢', '😣', '😤', '😥', '😦',
		'😧', '😨', '😩', '😪', '😫', '😬', '😭', '😮', '😯', '😰', '😱', '😲', '😳', '😴', '😵', '😶', '😷', '😸', '😹', '😽',
		'😿', '😘', '😙', '😚', '😛', '😜', '😝', '🙁', '🙂', '🙃', '💀'
	];
	var html = '';
	for(var i=0; i<emojiSelectable.length; i++){
		var c = emojiSelectable[i];
		html += '<a class="charSelect" onclick="gateway.insert(\'' + c + '\')">' + emoji.addTags(c) + '</a> ';
	}
	$('#emoticon-symbols').html(html);
}

function onBlur() {
	disp.focused = false;
	var act = gateway.getActive();
	if(act){
		act.setMark();
	} else {
		gateway.statusWindow.setMark();
	}
};
function onFocus(){
	clearInterval(disp.titleBlinkInterval);
	disp.titleBlinkInterval = false;
	if(document.title == newMessage) document.title = he(guser.nick)+' @ PIRC.pl';
	disp.focused = true;
	var act = gateway.getActive();
	if(act){
		act.markRead();
	} else {
		gateway.statusWindow.markRead();
	}
};

if (/*@cc_on!@*/false) { // check for Internet Explorer
	document.onfocusin = onFocus;
	document.onfocusout = onBlur;
} else {
	window.onfocus = onFocus;
	window.onblur = onBlur;
}

function browserTooOld(){
	$('.not-connected-text > h3').html('Przestarzała przeglądarka');
	$('.not-connected-text > p').html('Twoja przeglądarka jest przestarzała i nie jest obsługiwana. Należy zainstalować aktualną wersję Internet Explorer, Mozilla Firefox, Chrome, Safari bądź innej wspieranej przeglądarki.');
	return;
}

function parseISOString(s) {
	var b = s.split(/\D+/);
	return new Date(Date.UTC(b[0], --b[1], b[2], b[3], b[4], b[5], b[6]));
}

function lengthInUtf8Bytes(str) {
	// Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
	var add = 0;
	var success = false;
	do {
		try {
			var m = encodeURIComponent(str).match(/%[89ABab]/g);
			success = true;
		} catch(e){ // in case the last character is invalid
			str = str.slice(0, -1);
			add++;
		}
	} while(!success);
	
	return str.length + (m ? m.length : 0) + add;
}

function ImageExists(url) {
	var img = new Image();
	img.src = url;
	return img.height != 0;
}

var disp = {
	'size': 1,
	'focused': true,
	'titleBlinkInterval': false,
	'setSize': function(s) {
		if(!s) return;
		$('body').css('font-size', s+'em');
		$('input[type="checkbox"]').css('transform', 'scale('+s+')');
		disp.size = s;
		localStorage.setItem('tsize', s);
	},
	'displaySpecialDialog': function(name, button) {
		$('#'+name).dialog({
			resizable: false,
			draggable: true,
			close: function(){
				$(this).dialog('destroy');
			},
			width: 600
		});
		if(button) {
			$('#'+name).dialog('option', 'buttons', [ {
				text: button,
				click: function(){
					$(this).dialog('close');
				}
			} ]);
		}
	},
	'listWindowShow': function() {
		disp.displaySpecialDialog('list-dialog', 'OK');
	},
	'colorWindowShow': function() {
		disp.displaySpecialDialog('color-dialog');
	},
	'symbolWindowShow': function() {
		disp.displaySpecialDialog('symbol-dialog');
	},
	'toggleImageView': function(id, url) {
		$('#img-'+id).fadeToggle(200);
		setTimeout(function(){
			if($('#img-'+id).css('display') == 'none'){
				$('#show-'+id).css('display', 'inline');
				$('#hide-'+id).css('display', 'none');
			} else {
				if($('#imgc-'+id).prop('src') == ''){
					$('#imgc-'+id).prop('src', url);
				}
				$('#show-'+id).css('display', 'none');
				$('#hide-'+id).css('display', 'inline');
			}
		}, 250);
	},
	'toggleVideoView': function(id, video) {
		$('#img-'+id).fadeToggle(200);
		setTimeout(function(){
			if($('#img-'+id).css('display') == 'none'){
				$('#show-'+id).css('display', 'inline');
				$('#hide-'+id).css('display', 'none');
			} else {
				if($('#vid-'+id).prop('src') == ''){
					$('#vid-'+id).prop('src', 'https://www.youtube.com/embed/'+video);
				}
				$('#show-'+id).css('display', 'none');
				$('#hide-'+id).css('display', 'inline');
			}
		}, 250);
	},
	'changeSettings': function(e) {
		booleanSettings.forEach(function(sname){
			try {
				localStorage.setItem(sname, $('#'+sname).is(':checked'));
			} catch(e){}
		});
		textSettings.forEach(function(sname){
			try {
				if(textSettingsValues[sname]){
					localStorage.setItem(sname, textSettingsValues[sname]);
				} else {
					localStorage.removeItem(sname);
				}
			} catch(e){}
		});
		comboSettings.forEach(function(sname){
			try {
				localStorage.setItem(sname, $('#'+sname).val());
			} catch(e){}
		});

		numberSettings.forEach(function(sname){
			var value = $('#'+sname).val();
			if(value == '' || isNaN(parseFloat(value)) || value < numberSettingsMinMax[sname]['min'] || value > numberSettingsMinMax[sname]['max']){
				value = numberSettingsMinMax[sname]['deflt'];
				$('#'+sname).val(value);
			}
			try {
				localStorage.setItem(sname, value);
			} catch(e){}
		});
		gateway.showNickList(); //WORKAROUND: pokaż panel nawet w prywatnej i w statusie, inaczej poniższe dłubanie w CSS powoduje popsucie interfejsu graficznego
		settings.backlogLength = parseInt($('#backlogCount').val());
		if ($('#tabsListBottom').is(':checked')) {
			$('#top_menu').detach().insertAfter('#inputbox');
			if($('#tabsDownCss').length == 0) {
				$('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_tabs_down.css" id="tabsDownCss">');
			}
		} else {
			$('#top_menu').detach().insertAfter('#options-box');
			$('#tabsDownCss').remove();
		}
		if ($('#blackTheme').is(':checked')) {
			if($('#blackCss').length == 0) {
				$('head').append('<link rel="stylesheet" type="text/css" href="/styles/gateway_black.css" id="blackCss">');
			}
		} else {
			$('#blackCss').remove();
		}
		if ($('#monoSpaceFont').is(':checked')) {
			if($('#monospace_font').length == 0){
				var style = $('<style id="monospace_font">#chat-wrapper { font-family: DejaVu Sans Mono, Consolas, monospace, Symbola; } </style>');
				$('html > head').append(style);
			}
		} else {
			$('#monospace_font').remove();
		}
		if ($('#noAvatars').is(':checked')) {
			$('#avatars-style').remove();
			if($('#no_avatars').length == 0){
				var style = $('<style id="no_avatars">.msgRepeat { display: block; } .msgRepeatBlock { display: none; } .messageDiv { padding-bottom: unset; } .messageMeta { display: none; } .messageHeader { display: inline; } .messageHeader::after { content: " "; } .messageHeader .time { display: inline; } .evenMessage { background: none !important; } .oddMessage { background: none !important; }</style>');
				$('html > head').append(style);
			}
		} else {
			$('#no_avatars').remove();
			if($('#avatars-style').length == 0){
				var style = $('<style id="avatars-style">span.repeat-hilight, span.repeat-hilight span { color: #1F29D3 !important; font-weight: bold; }</style>');
				$('html > head').append(style);
			}
		}
		if ($('#showUserHostnames').is(':checked')) {
			$('#userhost_hidden').remove();
		} else {
			if($('#userhost_hidden').length == 0){
				var style = $('<style id="userhost_hidden">.userhost { display:none; }</style>');
				$('html > head').append(style);
			}
		}
		if($('#automLogIn').is(':checked')){
			$('#automLogIn').parent().parent().css('display', '');
		} else {
			$('#automLogIn').parent().parent().css('display', 'none');
		}
		for(i in settingProcessors){
			settingProcessors[i]();
		}
		if(!e){
			return;
		}
		if(e.currentTarget.id == 'dispEmoji') {
			if(!$('#dispEmoji').is(':checked')){
				$('#sendEmoji').prop('checked', false);
			}
		} else if(e.currentTarget.id == 'sendEmoji'){
			if($('#sendEmoji').is(':checked')){
				$('#dispEmoji').prop('checked', true);
			}
		}
		if(e.currentTarget.id == 'setUmodeD') {
			if($('#setUmodeD').is(':checked')){
				$('#setUmodeR').prop('checked', true);
				gateway.send('MODE '+guser.nick+' +R');
				if(!guser.umodes.D){
					gateway.send('MODE '+guser.nick+' +D');
				}
			} else {
				if(guser.umodes.D){
					gateway.send('MODE '+guser.nick+' -D');
				}
			}
		} else if(e.currentTarget.id == 'setUmodeR') {
			if(!$('#setUmodeR').is(':checked')){
				$('#setUmodeD').prop('checked', false);
				gateway.send('MODE '+guser.nick+' -D');
				if(guser.umodes.R){
					gateway.send('MODE '+guser.nick+' -R');
				}
			} else {
				if(!guser.umodes.R){
					gateway.send('MODE '+guser.nick+' +R');
				}
			}
		}
		$('#nicklist').removeAttr('style');
		$('#chlist').removeAttr('style');
		if($('#chlist-body').is(':visible')){
			gateway.toggleChanList();
		}
	},
	'showAbout': function() {
		disp.displaySpecialDialog('about-dialog', 'OK');
	},
	'showAvatarSetting': function(){
		if(!guser.umodes.r || window.FormData === undefined){
			var html =
				'<div id="current-avatar">' +
					'<div id="current-letter-avatar">' +
						'<span class="avatar letterAvatar" id="letterAvatarExample"><span role="presentation" id="letterAvatarExampleContent"></span></span>' +
					'</div>' +
					'<img id="current-avatar-image" src="/styles/img/noavatar.png" alt="Nie ustawiono awatara"><br>' +
					'<span id="current-avatar-info">Nie ustawiono awatara</span> <button type="button" value="" id="delete-avatar" onClick="disp.deleteAvatar()">Skasuj</button>' +
				'</div>' +
				'<div id="set-avatar">' +
					'Podaj adres URL: <input type="text" id="avatar-url" name="avatar-url" autocomplete="photo"> <button type="button" value="" onClick="disp.checkAvatarUrl()">Sprawdź</button><br>' +
					'<button type="button" value="" id="submit-avatar" onClick="disp.submitAvatar()">Zatwierdź</button><br>' +
					'URL powinien prowadzić bezpośrednio do obrazka (png, gif, jpeg).<br>';
				if(window.FormData === undefined){
					html += 'Twoja przeglądarka jest zbyt stara, aby obsłużyć wygodniejsze ustawianie awatarów.';
				} else {
					html += 'Zarejestruj nicka i potwierdź adres e-mail, aby uzyskać dostęp do wygodniejszego ustawiania awatarów.';
				}
				html += '</div>';
			$('#avatar-dialog').html(html);
			if(!textSettingsValues['avatar']){
				$('#letterAvatarExample').css('background-color',$$.nickColor(guser.nick, true));
				$('#letterAvatarExampleContent').text(guser.nick.charAt(0));
				$('#current-avatar-info').text('Nie ustawiono awatara');
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-avatar-image').attr('alt', 'Nie ustawiono awatara');
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text('Bieżący awatar');
				$('#current-avatar-image').attr('src', textSettingsValues['avatar'].replace('{size}', '100'));
				$('#current-avatar-image').attr('alt', 'Bieżący awatar');
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(textSettingsValues['avatar']);
				$('#delete-avatar').show();
			}
			$('#submit-avatar').hide();
		} else {
			services.getApiKey();
			var html =
				'<div id="current-avatar">' +
					'<div id="current-letter-avatar">' +
						'<span class="avatar letterAvatar" id="letterAvatarExample"><span role="presentation" id="letterAvatarExampleContent"></span></span>' +
					'</div>' +
					'<img id="current-avatar-image" src="/styles/img/noavatar.png" alt="Nie ustawiono awatara"><br>' +
					'<span id="current-avatar-info">Nie ustawiono awatara</span> <button type="button" value="" id="delete-avatar" onClick="disp.deleteAvatar()">Skasuj</button>' +
				'</div>' +
				'<div id="set-avatar">' +
					'Wybierz obrazek: <input type="file" name="avatarFileToUpload" id="avatarFileToUpload"><br>' +
					'<button type="submit" value="" id="submit-avatar" name="submit" onClick="disp.submitAvatar()">Zatwierdź</button><br>' +
					'Klikając "Zatwierdź" wyrażasz zgodę na przechowywanie podanych danych na serwerach PIRC.' +
				'</div>';
			$('#avatar-dialog').html(html);
			if(!textSettingsValues['avatar']){
				$('#letterAvatarExample').css('background-color',$$.nickColor(guser.nick, true));
				$('#letterAvatarExampleContent').text(guser.nick.charAt(0));
				$('#current-avatar-info').text('Nie ustawiono awatara');
				$('#current-avatar-image').attr('src', '/styles/img/noavatar.png');
				$('#current-avatar-image').attr('alt', 'Nie ustawiono awatara');
				$('#current-letter-avatar').show();
				$('#delete-avatar').hide();
			} else {
				$('#current-avatar-info').text('Bieżący awatar');
				$('#current-avatar-image').attr('src', textSettingsValues['avatar']);
				$('#current-avatar-image').attr('alt', 'Bieżący awatar');
				$('#current-letter-avatar').hide();
				$('#avatar-url').val(textSettingsValues['avatar']);
				$('#delete-avatar').show();
			}
			$('#submit-avatar').show();
		}
		disp.displaySpecialDialog('avatar-dialog', 'OK');
	},
	'checkAvatarUrl': function() {
		var url = $('#avatar-url').val();
		if(!url.startsWith('https://')){
			$$.alert('Adres musi zaczynać się od "https://"!');
			return;
		}
		$('#delete-avatar').hide();
		$('#current-letter-avatar').hide();
		$('#current-avatar-image').attr('src', url);
		$('#current-avatar-image').attr('alt', 'Podgląd');
		$('#current-avatar-info').text('Podgląd powyżej. Jeśli widać obrazek, możesz go zatwierdzić.');
		$('#submit-avatar').show();
	},
	'submitAvatar': function() {
		if(!guser.umodes.r){
			var url = $('#avatar-url').val();
			if(!url.startsWith('https://')){
				$$.alert('Adres musi zaczynać się od "https://"!');
				return;
			}
			textSettingsValues['avatar'] = url;
			disp.showAvatarSetting();
			disp.avatarChanged();
		} else {
			var fd = new FormData();
			var file = $('#avatarFileToUpload')[0].files[0];
			if(!file){
				$$.alert('Nie wybrano pliku!');
				return;
			}
			fd.append('fileToUpload', file);
			fd.append('account', guser.account);
			fd.append('apikey', services.apiKey);
			fd.append('image-type', 'avatar');
			$('#set-avatar').append('<br>Trwa przetwarzanie, czekaj...');
			$.ajax({
				url: 'https://users.pirc.pl/image-upload/image-upload.php',
				dataType: 'json',
				method: 'post',
				processData: false,
				contentType: false,
				data: fd,
				success: function(data){
					console.log(data);
					if(data['result'] == 'ok'){
						textSettingsValues['avatar'] = data['url'];
						disp.showAvatarSetting();
						disp.avatarChanged();
					} else {
						$$.alert('Błąd wysyłania awatara. Odpowiedź serwera: ' + data['result']);
					}
				},
				error: function(){
					$$.alert('Nie udało się przesłać obrazka. Upewnij się, że plik nie jest zbyt duży, i spróbuj ponownie później.');
				}
			});
		}
	},
	'deleteAvatar': function() {
		if(!guser.umodes.r){
			if(!confirm('Czy usunąć awatar "' +textSettingsValues['avatar']+ '"?')){
				return;
			}
			textSettingsValues['avatar'] = false;
			disp.showAvatarSetting();
			disp.avatarChanged();
		} else {
			if(!confirm('Czy usuniąć bieżący awatar?')){
				return;
			}
			$.ajax({
				url: 'https://users.pirc.pl/image-upload/image-delete.php',
				dataType: 'json',
				method: 'post',
				data: {
					'account': guser.account,
					'apikey': services.apiKey,
					'image-type': 'avatar'
				},
				success: function(data){
					console.log(data);
					if(data['result'] == 'ok'){
						textSettingsValues['avatar'] = false;
						disp.showAvatarSetting();
						disp.avatarChanged();
					} else {
						$$.alert('Błąd kasowania awatara. Odpowiedź serwera: ' + data['result']);
					}
				},
				error: function(){
					$$.alert('Nie udało się skasować awatara. Spróbuj ponownie później.');
				}
			});
		}
	},
	'avatarChanged': function() {
		disp.changeSettings();
		if(textSettingsValues['avatar']){
			ircCommand.metadata('SET', '*', ['avatar', textSettingsValues['avatar']]);
		} else {
			ircCommand.metadata('SET', '*', ['avatar']);
		}
	},
	'getAvatarIcon': function(nick, isRegistered){
		var avatar = gateway.getAvatarUrl(nick, 50);
		if(avatar) return avatar;
		if(isRegistered) return icons[6];
		return icons[0];
	},
	'showOptions': function() {
		disp.displaySpecialDialog('options-dialog', 'OK');
	},
	'showQueryUmodes': function() {
		disp.displaySpecialDialog('query-umodes-dialog', 'OK');
	},
	'showSizes': function() {
		disp.displaySpecialDialog('size-dialog', 'Zamknij');
	},
	'topicClick': function() {
		var channel = gateway.findChannel(gateway.active);
		if(!channel){
			return;
		}
		var topic = $('#'+channel.id+'-topic > h2').html();
		if(topic == ''){
			topic = 'Nie ustawiono tematu.';
		}
		var html = topic +
			'<p class="' + channel.id + '-operActions" style="display:none;">' +
				'<b>Zmodyfikuj temat kanału:</b><textarea name="topicEdit" id="topicEdit">'+channel.topic+'</textarea>' +
				'<button onclick="gateway.changeTopic(\''+channel.name+'\');">Zmień temat</button><br>' +
				'Do tematu możesz skopiować kody formatowania wstawione w pole wiadomości.' +
			'</p>';
		$$.displayDialog('confirm', 'topic', 'Temat kanału '+channel.name, html);
	},
	'playSound': function() {
		if ( ! $('#newMsgSound').is(':checked')) {
			return;
		}
		var filename = '/styles/audio/served';
		$('#sound').html('<audio autoplay="autoplay"><source src="' + filename + '.mp3" type="audio/mpeg" /><source src="' + filename + '.ogg" type="audio/ogg" /><embed hidden="true" autostart="true" loop="false" src="' + filename +'.mp3" /></audio>');
	},
	'insertLinebeI': function(mode, args){
		var chanId = gateway.findChannel(args[1]).id;
		var listName = disp.getNamebeI(mode);
		if($$.getDialogSelector('list', 'list-'+mode+'-'+args[1]).length == 0){
			var html = '<div class="beIListContents"><table><tr><th>Maska</th><th>Założony przez</th><th>Data</th>';
			if(mode == 'b'){
				html += '<th>Dotyczy</th>';
			}
			html += '</tr></table></div>';
			$$.displayDialog('list', 'list-'+mode+'-'+args[1], 'Lista '+listName+' na kanale '+he(args[1]), html);
		}
		var html = '<tr><td>'+he(args[2])+'</td><td>'+he(args[3])+'</td><td>'+$$.parseTime(args[4])+'</td>';
			if(mode == 'b'){
				html += '<td>';
				try {
					var affected = localStorage.getItem('banmask-'+md5(args[2]));
					if(affected){
						html += he(affected);
					}
				} catch(e){}
				html += '</td>';
			}
			html += '<td class="'+chanId+'-operActions button" style="display:none">' +
			'<button id="un'+mode+'-'+chanId+'-'+md5(args[2])+'">Usuń</button>' +
			'</td></tr>';
		$('table', $$.getDialogSelector('list', 'list-'+mode+'-'+args[1])).append(html);
		$('#un'+mode+'-'+chanId+'-'+md5(args[2])).click(function(){
			gateway.send('MODE '+args[1]+' -'+mode+' '+args[2]+'\r\nMODE '+args[1]+' '+mode);
			$$.closeDialog('list', 'list-'+mode+'-'+args[1]);
		});
	},
	'endListbeI': function(mode, chan){
		if($$.getDialogSelector('list', 'list-'+mode+'-'+chan).length == 0){
			$$.displayDialog('list', 'list-'+mode+'-'+chan, 'Lista '+disp.getNamebeI(mode)+' na kanale '+he(chan), 'Lista jest pusta.');
		}
	},
	'getNamebeI': function(mode){
		var listName = mode;
		switch(mode){
			case 'b': listName = 'banów'; break;
			case 'e': listName = 'wyjątków'; break;
			case 'I': listName = 'zaproszeń'; break;
		}
		return listName;
	},
	'showAllEmoticons': function(){
		$$.closeDialog('emoticons', 'allEmoticons');
		var html = '<div class="emojiSelector">';
		var data = emoji.getAll();
		for(var i=0; i<data.length; i++){
			html += '<a class="charSelect" onclick="gateway.insert(\'' + data[i].text + '\')"><g-emoji fallback-src="/styles/emoji/' + data[i].code + '.png">' + data[i].text + '</g-emoji></a> ';
		}
		html += '</div>';
		$$.displayDialog('emoticons', 'allEmoticons', 'Wszystkie emotikony', html);
	}
};

//funkcje do obrabiania tekstów i podobne
var $$ = {
	'parseTime': function(timestamp) {
		var nd = new Date();
		nd.setTime(timestamp*1000);
		if((new Date()).getFullYear() != nd.getFullYear()){
			return $.vsprintf("%s, %s %s %s, %02s:%02s:%02s", [ $$.dateWeek[nd.getDay()], nd.getDate(), $$.dateMonth[nd.getMonth()], nd.getFullYear(), nd.getHours(), nd.getMinutes(), nd.getSeconds() ] );
		} else {
			return $.vsprintf("%s, %s %s, %02s:%02s:%02s", [ $$.dateWeek[nd.getDay()], nd.getDate(), $$.dateMonth[nd.getMonth()], nd.getHours(), nd.getMinutes(), nd.getSeconds() ] );
		}
	},
	'dateWeek': [ 'Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota' ],
	'dateMonth': [ 'sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru' ],
	'nickColor': function(nick, codeOnly) {
		if (!$('#coloredNicks').is(':checked')){
			return '';
		}
		var color;
		var colorid = nick.length;
		for(var i = 0; i<nick.length; i++){
			colorid += nick.charCodeAt(i);
		}
		switch(colorid % 15){
			case 0: color = '#515185'; break;
			case 1: color = '#623c00'; break;
			case 2: color = '#c86c00'; break;
			case 3: color = '#ff6500'; break;
			case 4: color = '#ff0000'; break;
			case 5: color = '#e40f0f'; break;
			case 6: color = '#990033'; break;
			case 7: color = '#8800ab'; break;
			case 8: color = '#ce00ff'; break;
			case 9: color = '#0f2ab1'; break;
			case 10: color = '#3030ce'; break;
			case 11: color = '#006699'; break;
			case 12: color = '#1a866e'; break;
			case 13: color = '#008100'; break;
			case 14: color = '#959595'; break;
		}
		for(a in nickColorProcessors){
			var ret = nickColorProcessors[a](nick);
			if(ret){
				color = ret;
			}				
		}
		if(codeOnly){
			return color;
		} else {
			return 'style="color:' + color +'"';
		}
	},
	'colorize': function(message, strip) {
		if(strip == undefined) var strip = false;
		if ($('#blackTheme').is(':checked')) {
			var pageFront = 'white';
			var pageBack = 'black';
		} else {
			var pageBack  = 'white';
			var pageFront = 'black';
		}
		var currBack = pageBack;
		var currFront = pageFront;
		var newText = '';
		if($('#dispEmoji').is(':checked')){
			message = $$.textToEmoji(message);
		}
		if(!strip){
			message = he(message); 
			message = $$.parseLinks(message);
			if($('#dispEmoji').is(':checked')){
				message = emoji.addTags(message);
			}
		}
		var length	= message.length;
		
		var bold = false;
		var italic = false;
		var underline = false;
		var invert = false;
		
		var formatSet = false;
		var formatWaiting = false;
		
		for (var i = 0 ; i < length ; i++) {
		
			var isText = false;
			var append = '';
			
			switch (message.charAt(i)) {		
				case String.fromCharCode(3):
					var fgCode = null;
					var bgCode = null;
					if (!isNaN(parseInt(message.charAt(i+1)))) {
						if (!isNaN(parseInt(message.charAt(++i+1)))) {
							fgCode = parseInt(message.charAt(i)) * 10 + parseInt(message.charAt(++i));
						} else {
							fgCode = parseInt(message.charAt(i));
						}
						if ((message.charAt(i+1) == ',') && !isNaN(parseInt(message.charAt(++i+1)))) {
							if (!isNaN(parseInt(message.charAt(++i+1)))) {
								bgCode = parseInt(message.charAt(i)) * 10 + parseInt(message.charAt(++i));
							} else {
								bgCode = parseInt(message.charAt(i));
							}
						}
						if(fgCode != null){
							currFront = $$.getColor(fgCode, "foreground");
						}
						if(bgCode != null){
							currBack = $$.getColor(bgCode, "background");
						}
					} else {
						currFront = pageFront;
						currBack = pageBack;
					}
					formatWaiting = true;
					break;

				case String.fromCharCode(4): // hex color
					var end = i+7;
					i++;
					var code = '#';
					for(; i<end; ++i){
						code += message.charAt(i);
					}
					i--;
					console.log(code);
					currFront = code;
					formatWaiting = true;
					break;

				case String.fromCharCode(15): // wyczyszczenie
					currFront = pageFront;
					currBack = pageBack;
					bold = false;
					italic = false;
					underline = false;
					invert = false;
					formatWaiting = true;
					break;
					
				case String.fromCharCode(2):
					bold = !bold;
					formatWaiting = true;
					break;

				case String.fromCharCode(22): // inwersja
					invert = !invert;
					formatWaiting = true;
					break;
				
				case String.fromCharCode(29): // pochylenie - tylko kto je obsługuje?
					italic = !italic;
					formatWaiting = true;
					break;

				case String.fromCharCode(31): // podkreślenie
					underline = !underline;
					formatWaiting = true;
					break;				
				default:
					isText = true;
					append = message.charAt(i);
					break;
			}
			
			if(!strip && isText && formatWaiting){
				formatWaiting = false;
				if(formatSet){
					newText += '</span>';
					formatSet = false;
				}
				if(invert || italic || underline || bold || currFront != pageFront || currBack != pageBack){
					formatSet = true;
					newText += '<span style="';
					newText += italic?'font-style:italic;':'';
					newText += underline?'text-decoration:underline;':'';
					newText += bold?'font-weight:bold;':'';
					if(invert){
						newText += 'color:'+currBack+';background-color:'+currFront+';';
					} else {
						if(currFront != pageFront){
							newText += 'color:'+currFront+';';
						}
						if(currBack != pageBack){
							newText += 'background-color:'+currBack+';';
						}
					}
					newText += '"><wbr>';
				}
			}
			if(isText){
				newText += append;
			}
		}
			

		if(!strip && formatSet){
			newText += '</span><wbr>';
		}
		return newText;
	},
	'getColor': function(numeric, what) {
		var num = parseInt(numeric);
		/*if (what == "foreground") {	
			switch (num) {
				case 0:  return 'white';
				case 1:  return 'black';
				case 2:  return '#002AA8';
				case 3:  return '#1B7800';
				case 4:  return '#C30003';
				case 5:  return '#5F0002';
				case 6:  return '#950093';
				case 7:  return '#838900';
				case 8:  return '#CED800';
				case 9:  return '#07D800';
				case 10: return '#00837E';
				case 11: return '#00D5CD';
				case 12: return '#0010D5';
				case 13: return '#D500BF';
				case 14: return '#8B8B8B';
				default: return '#B9B9B9';
			}
		} else {*/
			switch (num) {
				case 0:  return 'white';
				case 1:  return 'black';
				case 2:  return '#1B54FF';
				case 3:  return '#4BC128';
				case 4:  return '#F15254';
				case 5:  return '#9B4244';
				case 6:  return '#D749D6';
				case 7:  return '#AEB32F';
				case 8:  return '#E7EF3B';
				case 9:  return '#59FF54';
				case 10: return '#00DFD6';
				case 11: return '#60FFF8';
				case 12: return '#5F6BFF';
				case 13: return '#FF83F2';
				case 14: return '#B5B5B5';
				case 15: return '#E0E0E0';
				// extended codes
				case 16: return '#470000';
				case 17: return '#472100';
				case 18: return '#474700';
				case 19: return '#324700';
				case 20: return '#004700';
				case 21: return '#00472c';
				case 22: return '#004747';
				case 23: return '#002747';
				case 24: return '#000047';
				case 25: return '#2e0047';
				case 26: return '#470047';
				case 27: return '#47002a';
				case 28: return '#740000';
				case 29: return '#743a00';
				case 30: return '#747400';
				case 31: return '#517400';
				case 32: return '#007400';
				case 33: return '#007449';
				case 34: return '#007474';
				case 35: return '#004074';
				case 36: return '#000074';
				case 37: return '#4b0074';
				case 38: return '#740074';
				case 39: return '#740045';
				case 40: return '#b50000';
				case 41: return '#b56300';
				case 42: return '#b5b500';
				case 43: return '#7db500';
				case 44: return '#00b500';
				case 45: return '#00b571';
				case 46: return '#00b5b5';
				case 47: return '#0063b5';
				case 48: return '#0000b5';
				case 49: return '#7500b5';
				case 50: return '#b500b5';
				case 51: return '#b5006b';
				case 52: return '#ff0000';
				case 53: return '#ff8c00';
				case 54: return '#ffff00';
				case 55: return '#b2ff00';
				case 56: return '#00ff00';
				case 57: return '#00ffa0';
				case 58: return '#00ffff';
				case 59: return '#008cff';
				case 60: return '#0000ff';
				case 61: return '#a500ff';
				case 62: return '#ff00ff';
				case 63: return '#ff0098';
				case 64: return '#ff5959';
				case 65: return '#ffb459';
				case 66: return '#ffff71';
				case 67: return '#cfff60';
				case 68: return '#6fff6f';
				case 69: return '#65ffc9';
				case 70: return '#6dffff';
				case 71: return '#59b4ff';
				case 72: return '#5959ff';
				case 73: return '#c459ff';
				case 74: return '#ff66ff';
				case 75: return '#ff59bc';
				case 76: return '#ff9c9c';
				case 77: return '#ffd39c';
				case 78: return '#ffff9c';
				case 79: return '#e2ff9c';
				case 80: return '#9cff9c';
				case 81: return '#9cffdb';
				case 82: return '#9cffff';
				case 83: return '#9cd3ff';
				case 84: return '#9c9cff';
				case 85: return '#dc9cff';
				case 86: return '#ff9cff';
				case 87: return '#ff94d3';
				case 88: return '#000000';
				case 89: return '#131313';
				case 90: return '#282828';
				case 91: return '#363636';
				case 92: return '#4d4d4d';
				case 93: return '#656565';
				case 94: return '#818181';
				case 95: return '#9f9f9f';
				case 96: return '#bcbcbc';
				case 97: return '#e2e2e2';
				case 98: return '#ffffff';
				default: return '#666666';
			}
		//}
	},
	'parseImages': function(text) {
		var rmatch = text.match(/(https?:\/\/[^ ]+\.(png|jpeg|jpg|gif)(\?[^ ]+)?)/gi);
		var html = '';
		if(rmatch){
			rmatch.forEach(function(arg){
				var rand = Math.floor(Math.random() * 10000).toString();
				var imgurl = encodeURI(arg);
				html += '<a onclick="disp.toggleImageView(\''+rand+'\', \''+decodeURIComponent(imgurl)+'\')"'+
					' class="image_link"><span id="show-'+rand+'" style="display:inline;">Pokaż</span><span id="hide-'+rand+'" style="display:none;">Ukryj</span> obrazek</a>'+
					'<div style="display:none;" id="img-'+rand+'"><img id="imgc-'+rand+'" style="max-width:100%;" /></div>';
			});
		}
		
		var rexpr = /https?:\/\/(?:(?:www|m)\.youtube\.com\/watch\?[^ ]*v=|youtu\.be\/)([^ ]+)/i;
		
		var fmatch = text.match(/(https?:\/\/(?:(?:www|m)\.youtube\.com\/watch\?[^ ]*v=|youtu\.be\/)[^ ?&]+)/gi);
		if(fmatch){
			fmatch.forEach(function(arg){
				var rmatch = rexpr.exec(arg);
				if(rmatch[1]){
					var rand = Math.floor(Math.random() * 10000).toString();
					var imgurl = encodeURI(rmatch[1]);
					html += '<a onclick="disp.toggleVideoView(\''+rand+'\', \''+imgurl+'\')"'+
						' class="image_link"><span id="show-'+rand+'" style="display:inline;">Pokaż</span><span id="hide-'+rand+'" style="display:none;">Ukryj</span> film</a>'+
						'<div style="display:none;" id="img-'+rand+'"><iframe width="560" height="315" id="vid-'+rand+'" frameborder="0" allowfullscreen></iframe></div>';
				}
			});
		}
		return html;
	},
	'checkLinkStart': function(text, stubs){
		var ret = { 'found' : false, 'linkBegin' : '', 'beginLength' : 0 };
		stubs.forEach(function(stub){
			if(text.substring(0, stub.length) == stub){
				ret.found = true;
				ret.linkBegin = stub;
				ret.beginLength = stub.length;
			}
		});
		return ret;
	},
	'correctLink': function(link){
		var append = '';
		var text = link;
		var stripLink = $$.colorize(link, true);
		if(stripLink.slice(-1) == '.') {
			stripLink = stripLink.slice(0, -1);
			append = '.';
		}
		if(stripLink.startsWith('www.')){
			stripLink = 'http://' + stripLink;
		}
		return {'link': stripLink, 'append': append, 'text': text};
	},
	'parseLinks': function(text){
		var newText = '';
		var currLink = '';
		var confirm= '';
		var confirmChan = '';
		if ($('#displayLinkWarning').is(':checked')) {
			confirm = " onclick=\"return confirm('Link może być niebezpieczny, czy na pewno chcesz go otworzyć?')\"";
			confirmChan = " onclick=\"return confirm('Czy chcesz dołączyć do wybranego kanału?')\"";
		}
		var stateText = 0;
		var stateChannel = 1;
		var stateUrl = 2;
		var state = stateText;

		for(var i=0; i < text.length; i++){
			switch(state){
				case stateText:
					var stub = text.substring(i);
					var found = $$.checkLinkStart(stub, ['ftp://', 'http://', 'https://', 'www.']);
					if(found.found){
						currLink = found.linkBegin;
						i += found.beginLength-1;
						state = stateUrl;
					} else if(text.charAt(i) == '#' && text.charAt(i-1) != '[') {
						state = stateChannel;
						currLink = '#';
					} else {
						newText += text.charAt(i);
					}
					break;
				case stateChannel:
					var c = text.charAt(i);
					var code = c.charCodeAt();
					if(c != ' ' && c != ',' && code > 10){
						currLink += c;
					} else {
						var append = '';
						var link = $$.correctLink(currLink);
						newText += '<a href="javascript:gateway.send(\'JOIN '+bsEscape(link.link)+'\')"' + confirmChan + '>'+link.text+'</a>' + c + link.append;
						state = stateText;
					}
					break;
				case stateUrl:
					var c = text.charAt(i);
					var code = c.charCodeAt();
					if(c != ' ' && code > 10 && c != '<'){
						currLink += c;
					} else {
						var link = $$.correctLink(currLink);
						newText += '<a href="'+link.link+'" target="_blank"' + confirm + '>'+link.text+'</a>' + c + link.append;
						state = stateText;
					}
					break;
			}			
		}
		if(state == stateUrl){
			var link = $$.correctLink(currLink);
			newText += '<a href="'+link.link+'" target="_blank"' + confirm + '>'+link.text+'</a>' + link.append;
		}
		if(state == stateChannel){
			var link = $$.correctLink(currLink);
			newText += '<a href="javascript:gateway.send(\'JOIN '+link.link+'\')"' + confirmChan + '>'+link.text+'</a>' + link.append;
		}
		return newText;
	},
	'displayReconnect': function(){
		var button = [ {
			text: 'Połącz ponownie',
			click: function(){
				gateway.reconnect();
			}
		} ];
		$$.displayDialog('connect', 'reconnect', 'Utracono połączenie.', 'Utracono połączenie z siecią.', button);
	},
	'getDialogSelector': function(type, sender) {
		return $('#'+type+'Dialog-'+md5(sender.toLowerCase()));
	},
	'displayDialog': function(type, sender, title, message, button){
		switch(type){ //specyficzne dla typu okna
			case 'whois':
				if(gateway.connectStatus != statusConnected){
					return;
				}
				if(sender.toLowerCase() == guser.nick.toLowerCase() && !gateway.displayOwnWhois){
					return;
				}
			case 'warning': case 'error': case 'confirm': case 'connect': case 'admin': case 'services': case 'ignore': case 'list': case 'alert': case 'emoticons': // nie wyświetlamy czasu
				var html = message;
				break;
			default:
				var html = "<p><span class=\"time\">"+$$.niceTime()+"</span> "+message+"</p>";
				break;
		}	
	
		var id = type+'Dialog-'+md5(sender.toLowerCase());
		var $dialog = $('#'+id);
		if($dialog.length == 0){
			if(!title){
				title = type;
			}
			var additionalClasses = '';
			if(type == 'notice' && sender.toLowerCase() == 'memoserv'){ // specjalny styl dla MemoServ
				additionalClasses += 'notice-dialog-memoserv';
			}
			$dialog = $('<div id="'+id+'" class="dialog '+type+'-dialog '+additionalClasses+'" title="'+title+'" />');
			$dialog.appendTo('html');
		}

		$dialog.append(html);
		$dialog.scrollTop($dialog.prop("scrollHeight"));
		if(type == 'connect'){
			$dialog.dialog({/* modal: true,*/ dialogClass: 'no-close' });
		} else if(sender == 'noaccess') {
			$dialog.dialog({ /*modal: true, */dialogClass: 'no-access' });
		} else {
			$dialog.dialog({ dialogClass: type+'-dialog-spec' });
		}
		var dWidth = 600;
		if(type == 'alert'){
			dWidth = 400;
		}
		$dialog.dialog({
			resizable: false,
			draggable: true,
			close: function(){
				$('#'+id).dialog('destroy');
				$('#'+id).remove();
			},
			width: dWidth
		});
		if(button == 'OK'){
			var button = [{
				text: 'OK',
				click: function(){
					$(this).dialog('close');
				}
			}];
		}
		if(button){
			$dialog.dialog('option', 'buttons', button);
		}
		if($dialog.find('input').length == 0){
			gateway.inputFocus();
		}
		if(type != 'error' && type != 'alert'){
			$('.connect-dialog').dialog('moveToTop');
		}
	},
	'closeDialog': function(type, nick){
		var id = type+'Dialog-'+md5(nick.toLowerCase());
		var $dialog = $('#'+id);
		$dialog.dialog('close');
		gateway.inputFocus();
	},
	'sescape': function(val) {
		return val.replace('\\', '\\\\');
	},
	'alert': function(text) {
		var button = [ {
			text: 'OK',
			click: function(){
				$(this).dialog('close');
			}
		} ];
		if($$.getDialogSelector('alert', 'alert').length > 0){
			text = '<br>' + text;
		}
		$$.displayDialog('alert', 'alert', 'Komunikat', text, button);
	},
	'wildcardToRegex': function(regex){
		regex = regex.replace(/[-[\]{}()+,.\\^$|#\s]/g, "\\$&");
		regex = regex.replace(/[*?]/g, ".$&");
		return '^'+regex+'$';
	},
	'regexToWildcard': function(regex){
		regex = regex.replace(/\.\*/g, "*");
		regex = regex.replace(/\.\?/g, "?");
		return regex.slice(1, -1);
	},
	'textToEmoji': function(text){
		for(i in emojiRegex){
			var regexp = emojiRegex[i][0];
			text = text.replace(regexp, emojiRegex[i][1]+'$1');
		}
		return text;
	},
	'niceTime': function(date) {
		if(date){
			dateobj = date;
		} else {
			dateobj = new Date();
		}
		hours = dateobj.getHours();
		if(hours < 10) {
			hours = '0'+hours;
		}
		minutes = dateobj.getMinutes();
		if(minutes < 10) {
			minutes = '0'+minutes;
		}
		return hours+':'+minutes;
	}
}

function escapeRegExp(string) { // my editor syntax colouring fails at this, so moved to the end
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

