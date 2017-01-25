var mcolors = {
};

var mcolor = false;

var mcolorJoinHandler = function(msg){
	if(mcolor){
		var color = mcolor;
	} else {
		return;
	}
	if(msg.sender.nick == guser.nick) {
		gateway.ctcp(msg.text, 'MCOL '+color);
	} else {
		gateway.ctcp(msg.sender.nick, 'MCOL '+color);
	}
}

var isCorrectColor = function(color){
	if(color.match(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/)){
		return true;
	}
	return false;
}

var mcolorCtcpHandler = function(msg){
	if(msg.ctptext == 'OFF'){
		delete mcolors[md5(msg.sender.nick.toLowerCase())];
		return;
	}
	if(!isCorrectColor(msg.ctcptext)){
		console.log(msg.sender.nick+' sent bad color code: '+msg.ctcptext);
		return;
	}
	mcolors[md5(msg.sender.nick.toLowerCase())] = msg.ctcptext;
	console.log('Color set for '+msg.sender.nick+': '+msg.ctcptext);
}

var setMyColor = function(color){
	if(!color){
		if(!mcolor) return;
		mcolor = false;
		var scolor = 'OFF';
		$('#nickColorPick').val('#000');
	} else {
		if(color == mcolor){
			$$.displayDialog('info', 'info', 'Info', '<p>Kod koloru '+he(color)+' taki jak poprzedni - nie zmieniono!</p>');
			return;
		}
		if(isCorrectColor(color)){
			mcolor = color;
			$$.displayDialog('info', 'info', 'Info', '<p>Ustawiono kolor na <span style="color:'+mcolor+'">'+mcolor+'</span></p>');
		} else {
			$$.displayDialog('info', 'info', 'Info', '<p>Niepoprawny kod koloru '+he(color)+'</p>');
			return;
		}
		var scolor = mcolor;
	}
	for(c in gateway.channels){
		gateway.ctcp(gateway.channels[c].name, 'MCOL '+scolor);
	}
	try {
		if(mcolor){
			localStorage.setItem('mcolor', mcolor);
		} else {
			localStorage.removeItem('mcolor');
		}
	} catch(e){}
}

var colorMessage = function(src, dst, text){
	if(src == guser.nick){
		var color = mcolor;
	} else {
		var color = mcolors[md5(src.toLowerCase())];
	}
	if(color){
		text = '<span style="color:'+color+'">'+text+'</span>';
	}
	return text;
}

var insertBinding = function(list, item, handler){
	if(list[item]){
		list[item].push(handler);
	} else {
		list[item] = [ handler ];
	}
}

insertBinding(cmdBinds, 'JOIN', mcolorJoinHandler);
insertBinding(ctcpBinds, 'MCOL', mcolorCtcpHandler);
messageProcessors.push(colorMessage);
commands['mycolor'] = {
	'channels': false,
	'nicks': false,
	'custom': [],
	'callback': function(command, input) {
		if(command[1]) {
			setMyColor(command[1]);
		} else {
			gateway.notEnoughParams("mycolor", "musisz podać kod koloru html");
		}
	}
};

var mcolorInit = function(){
	try {
		var ls = localStorage.getItem('mcolor')
		if(ls){
			mcolor = ls;
		}
	} catch(e){}
	$('#color-dialog h3').append(' (tymczasowo)');
	var html = '<h3>Ustaw kolor swojego tekstu (na stałe)</h3><table><tr><td>1. Wybierz kolor:</td><td><input type="color" id="nickColorPick"></td></tr><tr><td>2. Zatwierdź:</td><td><button id="setNickColor">Zmień</button></td></tr></table>' +
		'<p><button id="clearNickColor">Skasuj</button></p>';
	$('#color-dialog').append(html);
	$('#setNickColor').click(function(){
		setMyColor($('#nickColorPick').val());
	});
	$('#clearNickColor').click(function(){
		setMyColor(false);
		$('#nickColorPick').val('#000');
	});
	if(mcolor){
		$('#nickColorPick').val(mcolor);
	}
	/*$('#nickColorPick').on('input', function(){
		setMyColor($('#nickColorPick').val());
	});*/
}

readyFunctions.push(mcolorInit);

addons.push('mcolor');
