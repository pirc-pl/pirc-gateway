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

lang.pl['invalidColorCode'] = 'Niepoprawny kod koloru';
lang.pl['youMustGiveColorCode'] = 'musisz podać kod koloru html';
lang.pl['changeTemporary'] = ' (tymczasowo)';
lang.pl['setColorPermanently'] = 'Ustaw kolor swojego tekstu (na stałe)';
lang.pl['selectAColor'] = 'Wybierz kolor: ';
lang.pl['deleteColor'] = 'Skasuj kolor';
lang.pl['exampleText'] = 'przykładowy tekst';
lang.pl['darkBgPreview'] = 'Podgląd na ciemnym tle';
lang.pl['lightBgPreview'] = 'Podgląd na jasnym tle';
lang.pl['enableMessageColoring'] = 'Włącz kolorowanie wiadomości';

lang.en['invalidColorCode'] = 'Invalid color code';
lang.en['youMustGiveColorCode'] = 'You have to provide a HTML color code';
lang.en['changeTemporary'] = ' (temporary)';
lang.en['setColorPermanently'] = 'Set colour of your text (permanently)';
lang.en['selectAColor'] = 'Select a colour: ';
lang.en['deleteColor'] = 'Delete colour';
lang.en['exampleText'] = 'example text';
lang.en['darkBgPreview'] = 'Dark background preview';
lang.en['lightBgPreview'] = 'Light background preview';
lang.en['enableMessageColoring'] = 'Enable message colouring';

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

var setMyColor = function(color, serverOrigin){
	colorExampleApply();
	if(!color){
		mcolor = false;
		var scolor = false;
	} else {
		if(!isCorrectColor(color)){
			$$.displayDialog('info', 'info', 'Info', '<p>' + language.invalidColorCode + ' '+he(color)+'</p>');
			return;
		}
		mcolor = color;
		var scolor = color;
	}
	if(!serverOrigin){ // we were getting caught in an infinite loop without this
		if(scolor){
			ircCommand.metadata('SET', '*', ['color', scolor]);
		} else {
			if('color' in guser.me.metadata)
				ircCommand.metadata('SET', '*', ['color']);
		}
	}
	try {
		if(scolor){
			localStorage.setItem('mcolor', scolor);
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
	var user = users.getUser(nick);
	if('color' in user.metadata){
		return user.metadata['color'];
	}
	return false;
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

var mcolorMetadataChanged = function(user, key, value){
	if(user == guser.me)
		setMyColor(value, true);
}

insertBinding(cmdBinds, '001', mcolorMetadataSet);
insertBinding(metadataBinds, 'color', mcolorMetadataChanged);
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
			gateway.notEnoughParams("mycolor", language.youMustGiveColorCode);
		}
	}
};

var colorExampleApply = function(){
	if(mcolor){
		var lightColor = mcolor;
		var darkColor = mcolor;
		$('#nickColorPick').val(mcolor);
	} else {
		var lightColor = '#000000';
		var darkColor = '#E6E6E6';
		$('#nickColorPick').val('#000000');
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
	$('#formatting-button').show();
	$('#formatting').hide();
	$('#color-dialog h3').append('<span class="mcolor">' + language.changeTemporary + '</span>');
	var html = '<div class="mcolor"><h3>' + language.setColorPermanently + '</h3><p>' + language.selectAColor + '<input type="color" id="nickColorPick"></p>' +
		'<p><button id="clearNickColor">' + language.deleteColor + '</button></p></div>' +
		'<div> ' + language.lightBgPreview + ':<div id="lightBgPreview" style="background-color: #ffffff; padding: 5px;">' + language.exampleText + '</div></div>' +
		'<div> ' + language.darkBgPreview + ':<div id="darkBgPreview" style="background-color: #000000; padding: 5px;">' + language.exampleText + '</div></div>';
	$('#color-dialog').append(html);
	colorExampleApply();
	html = '<tr><td  class="optionsCheckBox"><input type="checkbox" id="mcolorEnable" onchange="disp.changeSettings(event)" checked="checked" /></td><td class="info">' + language.enableMessageColoring + '</td></tr>';
	$('#options-dialog table').prepend(html);
	booleanSettings.push('mcolorEnable');
	$('#nickColorPick').change(function(){
		/*if($('#nickColorPick').val() != mcolor){
			$('#nickColorInfo').text('Kliknij "Zatwierdź" aby zmienić');
		} else {
			$('#nickColorInfo').text(' ');
		}*/
		setMyColor($('#nickColorPick').val());
	});
/*	$('#setNickColor').click(function(){
		setMyColor($('#nickColorPick').val());
	});*/
	$('#clearNickColor').click(function(){
		setMyColor(false);
		$('#nickColorPick').val('#000000');
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

