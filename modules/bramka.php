<?php

class Module extends ModuleT {
	private static $nick = '';

	public static function run() {
		$gateway_url = '';
		if(isset(Dispatcher::$args['.0'])){
			$channel = Dispatcher::$args['.0'];
			$gateway_url .= $channel . '/';
		}
		if(isset(Dispatcher::$args['.1'])){
			$nick = Dispatcher::$args['.1'];
			$gateway_url .= $nick . '/';
		}
		if(isset(Dispatcher::$args['.2'])){
			$glayout = Dispatcher::$args['.2'];
			$gateway_url .= $glayout . '/';
		}
		if(isset(Dispatcher::$args['.3'])){
			$addcssdec = Dispatcher::$args['.3'];
			$gateway_url .= $addcssdec . '/';
		}


		$nick = htmlspecialchars($nick);
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
		Template::assign('gateway_url', $gateway_url);
		
		Template::display('gateway_ajax_header');
		Template::display('ajax_'.$glayout);
	}
}

?>

