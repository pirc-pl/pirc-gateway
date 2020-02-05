
var mcolor = false;


var mcolorMetadataSet = function(msg){
	if(!mcolor) return;
	ircCommand.metadata('SET', '*', ['color', mcolor]);
}

var isCorrectColor = function(color){
	if(color.match(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/)){
		return true;
	}
	return false;
}

var setMyColor = function(color){
	if(!color){
		if(!mcolor) return;
		mcolor = false;
		var scolor = false;
		$('#nickColorPick').val('#000000');
	} else {
		if(color == mcolor){
			return;
		}
		if(isCorrectColor(color)){
			mcolor = color;
		} else {
			$$.displayDialog('info', 'info', 'Info', '<p>Niepoprawny kod koloru '+he(color)+'</p>');
			return;
		}
		var scolor = mcolor;
	}
	if(scolor){
		ircCommand.metadata('SET', '*', ['color', scolor]);
	} else {
		ircCommand.metadata('SET', '*', ['color']);
	}
	try {
		if(mcolor){
			localStorage.setItem('mcolor', mcolor);
		} else {
			localStorage.removeItem('mcolor');
		}
	} catch(e){}
}

var colorsAllowed = function(chan){
	if(!chan){
		return true;
	}
	if(typeof chan == 'string'){
		chan = gateway.findChannel(chan);
		if(!chan){
			return true;
		}
	}
	if(chan.modes.S || chan.modes.c || chan.modes.C){
		return false;
	}
	return true;		
}

var getColor = function(nick){
	if(nick == guser.nick){
		var color = mcolor;
	} else {
		var user = users.getUser(nick);
		if('color' in user.metadata){
			return user.metadata['color'];
		}
		return false;
	}
	return color;
}

var colorMessage = function(src, dst, text){
	if(!$('#mcolorEnable').is(':checked')){
		return text;
	}
	if(dst.charAt(0) == '#'){
		var chan = gateway.findChannel(dst);
	} else if(src.charAt(0) == '#'){
		var chan = gateway.findChannel(src);
	}
	if(!colorsAllowed(chan)){
		return text;
	}
	var color = getColor(src);
	if(color){
		text = '<span style="color:'+color+'">'+text+'</span>';
	}
	return text;
}

var colorNick = function(nick){
	if(!$('#mcolorEnable').is(':checked')){
		return false;
	}
	return getColor(nick);
}

var colorSettingsChange = function(){
	var checked = $('#mcolorEnable').is(':checked');
	if(checked){
		$('.mcolor').show();
	} else {
		$('.mcolor').hide();
	}
}

insertBinding(cmdBinds, '001', mcolorMetadataSet);
messageProcessors.push(colorMessage);
nickColorProcessors.push(colorNick);
settingProcessors.push(colorSettingsChange);
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

var colorExampleApply = function(){
	if(mcolor){
		var lightColor = mcolor;
		var darkColor = mcolor;
	} else {
		var lightColor = '#000000';
		var darkColor = '#E6E6E6';
	}
	$('#lightBgPreview').css('color', lightColor);
	$('#darkBgPreview').css('color', darkColor);
};

var mcolorInit = function(){
	try {
		var ls = localStorage.getItem('mcolor')
		if(ls){
			mcolor = ls;
		}
	} catch(e){}
	$('#color-dialog h3').append('<span class="mcolor"> (tymczasowo)</span>');
	var html = '<div class="mcolor"><h3>Ustaw kolor swojego tekstu (na stałe)</h3><p>Wybierz kolor: <input type="color" id="nickColorPick"></p>' +
		'<p><button id="clearNickColor">Skasuj kolor</button></p></div>' +
		'<div> Podgląd na jasnym tle:<div id="lightBgPreview" style="background-color: #ffffff; padding: 5px;">przykładowy tekst</div></div>' +
		'<div> Podgląd na ciemnym tle:<div id="darkBgPreview" style="background-color: #000000; padding: 5px;">przykładowy tekst</div></div>';
	$('#color-dialog').append(html);
	colorExampleApply();
	html = '<tr><td  class="optionsCheckBox"><input type="checkbox" id="mcolorEnable" onchange="disp.changeSettings(event)" checked="checked" /></td><td class="info">Włącz kolorowanie wiadomości</td></tr>';
	$('#options-dialog table').prepend(html);
	booleanSettings.push('mcolorEnable');
	$('#nickColorPick').change(function(){
		/*if($('#nickColorPick').val() != mcolor){
			$('#nickColorInfo').text('Kliknij "Zatwierdź" aby zmienić');
		} else {
			$('#nickColorInfo').text(' ');
		}*/
		setMyColor($('#nickColorPick').val());
		colorExampleApply();
	});
/*	$('#setNickColor').click(function(){
		setMyColor($('#nickColorPick').val());
	});*/
	$('#clearNickColor').click(function(){
		setMyColor(false);
		$('#nickColorPick').val('#000000');
		colorExampleApply();
	});
	if(mcolor){
		$('#nickColorPick').val(mcolor);
	}
	/*$('#nickColorPick').on('input', function(){
		setMyColor($('#nickColorPick').val());
	});*/
}

readyFunctions.unshift(mcolorInit);
addons.push('mcolor');

