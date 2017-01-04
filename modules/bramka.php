<?php

class Module extends ModuleT {
	private static $nick = '';

	public static function run() {
//		$gateway_url = '<a href=\"';
		$gateway_url = '';
		$gateway_url .= 'https://widget01.mibbit.com/?promptPass=true&settings=10db5282f0641bc847a88fc71f2bc200&server=irc.pirc.pl&autoConnect=true&charset=UTF-8';
		if(isset(Dispatcher::$args['.0'])){
			$channel = Dispatcher::$args['.0'];
			$gateway_url .= '&channel=%23'.$channel;
		}
		if(isset(Dispatcher::$args['.1'])){
			$nick = Dispatcher::$args['.1'];
			$gateway_url .= '&nick='.$nick;
		}
/*		if(isset(Dispatcher::$args['.2'])){
			$glayout = Dispatcher::$args['.2'];
			$gateway_url .= $glayout . '/';
		}
		if(isset(Dispatcher::$args['.3'])){
			$addcssdec = Dispatcher::$args['.3'];
			$gateway_url .= $addcssdec . '/';
		}*/
//		$gateway_url .= '\">starej wersji bramki</a>.';


/*		$nick = htmlspecialchars($nick);
		if(isset($channel)) $channel = '#'.htmlspecialchars($channel); else $channel = '#';

		if(isset($addcssdec)){
			$addcssdec = base64_decode(Dispatcher::$args['.4'], true);
			if($addcssdec) {
				if(strpos($addcssdec, 'http://') === 0 && strpos($addcssdec, '\'') === false && strpos($addcssdec, '"') === false) {
					$additionalcss = '<link rel="stylesheet" href="'.$addcssdec.'" />';
				}
			}
		} else {
			$additionalcss = '';
		}

		set_include_path('.');

		if(!isset($glayout) || !in_array($glayout, settings::$lay)) {
			$glayout = 'def';
		}
		
		Template::assign('channel', $channel);
		if($nick != '0') Template::assign('nick', $nick);
		Template::assign('gateway_version', settings::$gateway['version']);
		Template::assign('sid', session_id());
		Template::assign('old_gateway_html', $gateway_url);
		
		Template::display('gateway_ajax_header');
		Template::display('ajax_'.$glayout);*/
		Template::assign('gateway_url', $gateway_url);
		Template::display('ajax_mibbit');
	}
}

?>
