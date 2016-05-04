<?php

class Module extends ModuleT {
	private static $nick = '';

	public static function run() {
		if(isset(Dispatcher::$args['.0'])) $channel = Dispatcher::$args['.0'];
		if(isset(Dispatcher::$args['.1'])) $nick = Dispatcher::$args['.1'];
		if(isset(Dispatcher::$args['.2'])) $glayout = Dispatcher::$args['.2'];
		if(isset(Dispatcher::$args['.3'])) $addcssdec = Dispatcher::$args['.3'];


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
		Template::assign('nick', $nick);
		Template::assign('gateway_version', settings::$gateway['version']);
		Template::display('gateway_ajax_header');
		Template::display('ajax_'.$glayout);
	}
}

?>

