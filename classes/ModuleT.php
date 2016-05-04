<?php
/**
 * Abstract class ModuleT
 *
 * @author Tril
 */
class ModuleT {
    /**
     * @var string Module name
     */
    private static $name = '$$$';
    /**
     *
     * @var string Additional css line for module
     */
    public static $additional_css = false;
    /**
     * @var boolean Show header and footer
     */
    public static $header = true;
    /**
     * Specialized input variables parse for module
     *
     * @param array $vars Input array of variables
     * @return array
     */
    public static function vars($vars) {
        return $vars;
    }
    /**
     * Function called before header loads.
     *
     * @return boolean|void
     */
    public static function preHeader() {
        return true;
    }
    /**
     * Main function of module
     *
     * @return boolean|void
     */
    public static function run() {
        echo "Hello World!";
        return true;
    }
}
?>
