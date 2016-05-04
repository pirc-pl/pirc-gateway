<?php
/**
 * Simple templates
 *
 * @author Tril
 */
class Template {
/**
 * @var array Template variables and values
 */
    private static $vars = array();
    /**
     * @var array Standard vars in all templates
     */
    private static $stdvars = array('_lang' => 'pl', '_link' => '/index');
    /**
     * @var boolean Are standard vars parsed
     */
    private static $stdload = false;

    /**
     * Assign vars to be used in template
     *
     * @param string|array $vname Variable name or assoc array of vars
     * @param mixed $value Variable value (if string given in $vname)
     * @return boolean False on error
     */
    public static function assign($vname, $value=NULL) {
        if(is_null($value)) {
            if(!is_array($vname)) {
                Error::trigger('Could not assign var '.$vname.': No value given.', Error::ENOTE, __FILE__, __LINE__);
                return false;
            } else {
                foreach($vname as $name => $val) {
                    self::$vars[$name] = $val;
                }
                return true;
            }
        } else {
            self::$vars[$vname] = $value;
            return true;
        }
    }

    /**
     *  Parse and display template
     *  {$var}, {lang}
     *
     * @param string $tplname Name of template to display
     * @param boolean $removevars Remove assigned vars if true
     * @return boolean True;
     */
    public static function display($tplname, $removevars = false) {
        echo self::parse($tplname);
        if($removevars) {
            self::$vars = array();
        }
        return true;
    }

    /**
     * Parses template, and return parsed string.
     *
     * @param string $tplname Template name
     * @return boolean|string
     */
    public static function parse($tplname) {
        self::stdLoad();
        if(!is_file(dirname(__FILE__).'/../tpl/'.$tplname.'.tpl')) {
            Error::trigger('Could not open template '.$tplname.': File not found.', Error::ENOTE, __FILE__, __LINE__);
            return false;
        } else {
            $tpl = file_get_contents(dirname(__FILE__).'/../tpl/'.$tplname.'.tpl');
            $keys = array();
            foreach(self::$vars as $key => $value) {
                $keys[] = '{$'.$key.'}';
            }
            $tpl = preg_replace('/\{\$([^}\n]+)\}/ei', 'self::getVar("\\1")', $tpl);
            $tpl = preg_replace('/\{\include ([^}\n]+)\}/ei', 'self::parse("\\1")', $tpl);
            $tpl = preg_replace('/\{([^}\n]+)\}/ei', 'Lang::get("\\1")', $tpl);
            return $tpl;
        }
    }

    /**
     *
     * @param string $name Variable name
     * @return string Value of given variable or '' if not exists;
     */
    private static function getVar($name) {
        self::stdLoad();
        if(isset(self::$vars[$name])) {
            return self::$vars[$name];
        } elseif(isset(self::$stdvars[$name])) {
            return self::$stdvars[$name];
        } else {
            //if(!isset(self::$vars[$name]) || !isset(self::$stdvars[$name]))
                //Error::trigger('Template variable '.$name.' not exists.', Error::ESILENT, __FILE__, __LINE__);
            return '';
        }
    }

    private static function stdLoad() {
        if(!self::$stdload) {
            self::$stdvars = array(
                '_lang' => Lang::$lang,
                '_link' => Dispatcher::getLink(),
                '_module' => Dispatcher::getModule()
            );
            self::$stdload = true;
        }
    }

    public static function generateLang($code='en', $locale='en_GB.utf8') {
        if(is_file(dirname(__FILE__).'/../lang/'.$code.'.php')) {
            include dirname(__FILE__).'/../lang/'.$code.'.php';
        } else {
            $lang = array('_locale' => $locale);
        }
        $dir = dirname(__FILE__).'/../tpl';
        $dirres =  opendir($dir);
        while(($file = readdir($dirres)) !== false) {
            if(preg_match('/^([a-z_0-9\-]+)\.tpl$/i', trim($file))) {
                echo "<b>File</b>: $file<br />";
                $content = file_get_contents($dir.'/'.$file);
                $content = preg_replace('/\{\$([^}\n]+)\}/i', 'var-\\1', $content);
                $matches = array();
                if(preg_match_all('/\{([^}\n]+)\}/i', $content, $matches)) {
                    foreach($matches[1] as $lstr) {
                        echo "- <i>var</i>: $lstr";
                        if(empty($lang[$lstr])) {
                            $lang[$lstr] = $lstr;
                            echo ": Adding<br />";
                        } else {
                            echo "<br />";
                        }
                    }
                }
            }
        }

        $cont2 = "<?php\n\n\$lang = ";
        $cont2 .= var_export($lang, true);
        $cont2 .= ";\n\n?>";
        file_put_contents(dirname(__FILE__).'/../lang/'.$code.'.php', $cont2);
    }
}
?>