<?php
//error_reporting(0);
$index = 1;
require_once('config.php');
require_once('classes/Dispatcher.php');
require_once('classes/ModuleT.php');
require_once('classes/Lang.php');
require_once('classes/Template.php');

Dispatcher::parse();
if(!in_array(Dispatcher::$module, settings::$modules)){
	header('HTTP/1.1 404 Not Found');
	echo '<h1>Nie znaleziono</h1>Blad nr 1';
	die();
}
include 'modules/'.Dispatcher::$module.'.php';
Module::run();

?>
