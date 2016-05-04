<?php
/**
 * Set and load proper language
 *
 * @author Tril
 */
class Lang {
    /** @var string $lang ISO code of used language */
    public static $lang = 'pl';
    /** @var array $larray Array with currently loaded language */
    private static $larray = array();
    /** @var array $larray ISO code currently loaded language */
    private static $loaded = false;
    
    const COOKIE_DOMAIN = '.user.upnet.org.pl';
    const COOKIE_PATH = '/';
    const LANG_DIR = '/../lang/';

    /**
     * Get available langs
     *
     * @return array|boolean Array of iso codes or false when no lang files found
     */
    public static function availableLangs() {
        if(($dir = @opendir(dirname(__FILE__).self::LANG_DIR)) === false) {
            Error::trigger('Could not open language dir.', Error::ENOTE, __FILE__, __LINE__);
            return false;
        } else {
            $langs = array();
            while(($file = readdir($dir)) !== false) {
                $matches = array();
                if(preg_match('/^([a-z]+)\.php$/i', trim($file), $matches)) {
                    $langs[] = $matches[1];
                }
            }
            if(empty($langs)) {
                Error::trigger('No languages found.', Error::ENOTE, __FILE__, __LINE__);
                return false;
            } else {
                return $langs;
            }
        }
    }

    /**
     * Check availability of given language
     *
     * @param string $lang Iso code of language
     * @return boolean True when language exists
     */
    private static function isAvailable($lang) {
        if(@in_array($lang, self::availableLangs())) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Check $_GET, $_SESSION and cookies for language setting and sets it on page
     *
     * @return boolean True when any of language setting was found
     */
    private static function set() {
        if(!empty(Dispatcher::$args['lang']) && self::isAvailable(Dispatcher::$args['lang'])) {
            $_GET['lang'] = Dispatcher::$args['lang'];
        }
        if(!empty($_GET['lang']) && self::isAvailable($_GET['lang'])) {
            //Set on page
            self::$lang = $_GET['lang'];
            //Set in session
            if(empty($_SESSION['lang']) || $_SESSION['lang'] != $_GET['lang']) {
                $_SESSION['lang'] = $_GET['lang'];
            }
            //Set in cookie
            if(empty($_COOKIE['lang']) || $_COOKIE['lang'] != $_GET['lang']) {
                self::setCookie($_GET['lang']);
            }
            return true;
        } elseif(!empty($_COOKIE['lang']) && self::isAvailable($_COOKIE['lang'])) {
            self::$lang = $_COOKIE['lang'];
            //set in session
            if(empty($_SESSION['lang']) || $_SESSION['lang'] != $_COOKIE['lang']) {
                $_SESSION['lang'] = $_COOKIE['lang'];
            }
            return true;
        } elseif(!empty($_SESSION['lang']) && self::isAvailable($_SESSION['lang'])) {
            //set on page
            self::$lang = $_SESSION['lang'];
            //set cookie if empty
            if(empty($_COOKIE['lang']) || $_COOKIE['lang'] != $_SESSION['lang']) {
                self::setCookie($_SESSION['lang']);
            }
            return true;
        }
        return false;
    }
     /**
     * Set language cookie
     *
     * @param string $lang Iso code of language
     * @return boolean True when header successfuly sent
     */
    private static function setCookie($lang) {
        return setcookie('lang', $lang, time()+8640000, self::COOKIE_PATH, self::COOKIE_DOMAIN);
    }
    /**
     * Load language file
     *
     * @return boolean False if failed to load file
     */
    private static function loadLang() {
        if(self::$loaded != self::$lang) {
            self::set();
            if(!is_file(dirname(__FILE__).self::LANG_DIR.self::$lang.'.php')) {
                Error::trigger('Language file not found. '.dirname(__FILE__).self::LANG_DIR.self::$lang.'.php', Error::ESTOP, __FILE__, __LINE__);
            } else {
                include dirname(__FILE__).self::LANG_DIR.self::$lang.'.php';
                if(empty($lang)) {
                    Error::trigger('Language array is empty. '.dirname(__FILE__).self::LANG_DIR.self::$lang.'.php', Error::ESILENT, __FILE__, __LINE__);
                    return false;
                } else {
                    self::$loaded = self::$lang;
                    self::$larray = $lang;
                    if(!empty(self::$larray['_locale']))
                        setlocale(LC_ALL, self::$larray['_locale']);
                    return true;
                }
            }
        } else {
            return true;
        }
    }
    /**
     * Get translated string
     *
     * @param string $index Index in lang array
     * @return string Translated string or index if no translation
     */
    public static function get($index) {
        self::loadLang();
        return (!empty(self::$larray[$index])) ? self::$larray[$index] : $index;
    }
    /**
     * Forece using of given title
     *
     * @param string $title New title
     * @return void
     */
    public static function forceTitle($title) {
        Dispatcher::load();
        self::loadLang();
        self::$larray['Tytuł '.Module::$name] = $title;
        return true;
    }
}
?>
