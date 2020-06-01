var mainSettings = {
	'networkName': 'PIRC.pl',
	'server': 'wss://wss.pirc.pl:8082/',
	'avatarUploadUrl': 'https://users.pirc.pl/image-upload/image-upload.php',
	'avatarDeleteUrl': 'https://users.pirc.pl/image-upload/image-delete.php',
	'defaultName': 'Użytkownik bramki PIRC.pl',
	'adminMail': 'abuse'+String.fromCharCode(64)+'pirc.pl',
	'rulesUrl': 'https://pirc.pl/teksty/zasady/',
	'version': 'testowa k4be',
	'oldGatewayHtml': '<a href=\"https://widget01.mibbit.com/?promptPass=true&settings=10db5282f0641bc847a88fc71f2bc200&server=irc.pirc.pl&autoConnect=true&charset=UTF-8\">innej bramki</a> (Mibbit).', // TODO insert nick&channel
	'language': 'en',
	'modules': [
		'mcolor'
	]
};

server = mainSettings.server;
gatewayVersion = mainSettings.version;
oldGatewayHtml = mainSettings.oldGatewayHtml;

function parsePath(){
	if(window.location.pathname == '/bramka'){
		var path = '';
	} else if(window.location.pathname.indexOf('/bramka/') == 0){
		var path = window.location.pathname.substring(7);
	} else {
		var path = window.location.pathname;
	}
	var params = path.substring(1).split('/');
	if(params.length > 1){
		guser.nick = params[1];
	}
	if(params.length > 0){
		guser.channels.push('#' + params[0]);
	}
}

parsePath();

