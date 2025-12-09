import { useEffect } from "react";
import { useStdout } from "ink";

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_SCREEN = "\x1b[2J\x1b[H";

export function useAlternateScreen() {
    const { stdout } = useStdout();

    useEffect(() => {
        stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR + CLEAR_SCREEN);

        return () => {
            stdout.write(SHOW_CURSOR + EXIT_ALT_SCREEN);
        };
    }, [stdout]);
}
