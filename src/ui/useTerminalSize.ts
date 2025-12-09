import { useState, useEffect } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
    rows: number;
    columns: number;
}

export function useTerminalSize(): TerminalSize {
    const { stdout } = useStdout();

    const [size, setSize] = useState<TerminalSize>(() => ({
        rows: stdout.rows || 24,
        columns: stdout.columns || 80,
    }));

    useEffect(() => {
        const handleResize = () => {
            setSize({
                rows: stdout.rows || 24,
                columns: stdout.columns || 80,
            });
        };

        stdout.on("resize", handleResize);
        return () => {
            stdout.off("resize", handleResize);
        };
    }, [stdout]);

    return size;
}

