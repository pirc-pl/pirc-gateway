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

var mcolorCtcpHandler = function(msg){
	if(msg.ctptext == 'OFF'){
		delete mcolors[msg.sender.nick];
		return;
	}
	mcolors[msg.sender.nick] = msg.ctcptext;
	console.log('Color set for '+msg.sender.nick+': '+msg.ctcptext);
}

var setMyColor = function(color){
	if(!color){
		mcolor = false;
		var scolor = 'OFF';
	} else {
		if(color == mcolor){
			$$.alert('<p>Kod koloru '+he(color)+' taki jak poprzedni - nie zmieniono!</p>');
			return;
		}
		if(color.match(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/)){
			mcolor = color;
			$$.alert('<p>Ustawiono kolor na <span style="color:'+mcolor+'">'+mcolor+'</span></p>');
		} else {
			$$.alert('<p>Niepoprawny kod koloru '+he(color)+'</p>');
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
		var color = mcolors[src.toLowerCase()];
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
	var html = '<p>Ustaw kolor swojego tekstu: <input type="color" id="nickColorPick"> <button id="setNickColor">Zmień</button> <button id="clearNickColor">Skasuj</button></p>';
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

