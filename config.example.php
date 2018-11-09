<?php

if($index != 1){
	header('HTTP/1.1 404 Not Found');
	echo '<h1>Nie znaleziono</h1>Blad nr 2';
	die();
}

class settings {
	public static $modules = array('bajax', 'bramka', 'index'); // pliki php w /modules
	public static $lay = array('def', 'test'); // rodzaje bramek
	public static $gateway = array(
		'version' => 'testowa k4be',
		'itoken' => 'b61tays', // hasło do ircd
		'server' => 'wss://bramka.pirc.pl:8082/'
	);
}

?>
