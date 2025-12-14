import React, { useMemo, useState } from "react";
import {
    Box,
    Button,
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemText,
    Paper,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import { useNorthSession } from "../cockpit/useNorthSession";

type Mode = "ask" | "agent";

type TranscriptEntry = {
    id: string;
    role: string;
    content: string;
    ts: number;
    toolName?: string;
    reviewStatus?: string;
    shellCommand?: string;
    shellCwd?: string | null;
    shellTimeoutMs?: number | null;
    diffContent?: Array<{ path: string; diff: string; linesAdded: number; linesRemoved: number }>;
    commandName?: string;
    commandPrompt?: string;
    commandOptions?: Array<{ id: string; label: string; hint?: string }>;
    commandSelectedId?: string;
};

type OrchestratorState = {
    transcript: TranscriptEntry[];
    isProcessing: boolean;
    pendingReviewId: string | null;
    currentModel: string;
    contextUsage: number;
    contextUsedTokens: number;
    sessionCostUsd: number;
    allTimeCostUsd: number;
};

function isOrchestratorState(value: unknown): value is OrchestratorState {
    return !!value && typeof value === "object" && Array.isArray((value as any).transcript);
}

export default function Cockpit() {
    const { state: north, actions } = useNorthSession();
    const [mode, setMode] = useState<Mode>("agent");
    const [composer, setComposer] = useState("");

    const orch = useMemo(() => (isOrchestratorState(north.state) ? north.state : null), [north.state]);

    const pendingEntry = useMemo(() => {
        if (!orch?.pendingReviewId) return null;
        return orch.transcript.find((e) => e.id === orch.pendingReviewId) || null;
    }, [orch]);

    const sendDisabled = north.wsStatus !== "ready" || !north.sessionId || !composer.trim();
    const processing = orch?.isProcessing ?? false;

    return (
        <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
            <Drawer
                variant="permanent"
                sx={{
                    width: 280,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: { width: 280, boxSizing: "border-box" },
                }}
            >
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6">North Cockpit</Typography>
                    <Typography variant="body2" color="text.secondary">
                        WS: {north.wsStatus}
                    </Typography>
                    {north.sessionId && (
                        <Typography variant="body2" color="text.secondary">
                            Session: {north.sessionId}
                        </Typography>
                    )}
                </Box>
                <Divider />
                <Box sx={{ p: 2 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        Mode
                    </Typography>
                    <ToggleButtonGroup
                        exclusive
                        value={mode}
                        onChange={(_, next) => {
                            if (next) setMode(next);
                        }}
                        size="small"
                        fullWidth
                    >
                        <ToggleButton value="ask">Ask</ToggleButton>
                        <ToggleButton value="agent">Agent</ToggleButton>
                    </ToggleButtonGroup>
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Button variant="outlined" onClick={actions.cancel} disabled={!processing}>
                            Cancel
                        </Button>
                        <Button variant="outlined" color="error" onClick={actions.stop} disabled={!north.sessionId}>
                            Stop
                        </Button>
                    </Stack>
                </Box>
                <Divider />
                <List dense>
                    <ListItem>
                        <ListItemText
                            primary={`Model: ${orch?.currentModel || "-"}`}
                            secondary={`Context: ${orch ? Math.round(orch.contextUsage * 100) : 0}%`}
                        />
                    </ListItem>
                    <ListItem>
                        <ListItemText
                            primary={`Session cost: $${(orch?.sessionCostUsd ?? 0).toFixed(4)}`}
                            secondary={`All-time: $${(orch?.allTimeCostUsd ?? 0).toFixed(2)}`}
                        />
                    </ListItem>
                </List>
                {north.error && (
                    <Box sx={{ p: 2 }}>
                        <Paper variant="outlined" sx={{ p: 1.5, borderColor: "error.main" }}>
                            <Typography variant="body2" color="error">
                                {north.error}
                            </Typography>
                        </Paper>
                    </Box>
                )}
            </Drawer>

            <Box sx={{ display: "flex", flex: 1, minWidth: 0 }}>
                <Box sx={{ flex: 1, p: 2, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <Paper variant="outlined" sx={{ flex: 1, p: 2, overflow: "auto" }}>
                        <Stack spacing={1.5}>
                            {(orch?.transcript ?? []).map((e) => (
                                <Box key={e.id}>
                                    <Typography variant="caption" color="text.secondary">
                                        {e.role}
                                        {e.toolName ? ` · ${e.toolName}` : ""}
                                        {e.reviewStatus ? ` · ${e.reviewStatus}` : ""}
                                    </Typography>
                                    <Typography
                                        component="pre"
                                        sx={{
                                            m: 0,
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                            fontFamily: "JetBrains Mono, Monaco, Consolas, monospace",
                                            fontSize: 13,
                                        }}
                                    >
                                        {e.content}
                                    </Typography>
                                </Box>
                            ))}
                            {!orch && (
                                <Typography color="text.secondary">
                                    Waiting for engine state...
                                </Typography>
                            )}
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                        <Stack direction="row" spacing={1} alignItems="flex-end">
                            <TextField
                                label="Message"
                                value={composer}
                                onChange={(e) => setComposer(e.target.value)}
                                fullWidth
                                multiline
                                minRows={2}
                                maxRows={8}
                            />
                            <Button
                                variant="contained"
                                disabled={sendDisabled}
                                onClick={() => {
                                    actions.sendChat(composer, mode, []);
                                    setComposer("");
                                }}
                            >
                                Send
                            </Button>
                        </Stack>
                    </Paper>
                </Box>

                <Box sx={{ width: 420, p: 2, borderLeft: "1px solid", borderColor: "divider" }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                        Review
                    </Typography>
                    {!pendingEntry && (
                        <Typography color="text.secondary">
                            No pending reviews.
                        </Typography>
                    )}

                    {pendingEntry?.role === "diff_review" && (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                File edits
                            </Typography>
                            <Box sx={{ maxHeight: "50vh", overflow: "auto" }}>
                                {(pendingEntry.diffContent ?? []).map((d) => (
                                    <Box key={d.path} sx={{ mb: 2 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            {d.path} (+{d.linesAdded}/-{d.linesRemoved})
                                        </Typography>
                                        <Typography component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>
                                            {d.diff}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                                <Button
                                    variant="contained"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "write", "accept")}
                                >
                                    Accept
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "write", "always")}
                                >
                                    Always
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="error"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "write", "reject")}
                                >
                                    Reject
                                </Button>
                            </Stack>
                        </Paper>
                    )}

                    {pendingEntry?.role === "shell_review" && (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Shell command
                            </Typography>
                            <Typography component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>
                                {pendingEntry.shellCommand}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                cwd: {pendingEntry.shellCwd || "(repo root)"} · timeout:{" "}
                                {pendingEntry.shellTimeoutMs ?? 60000}ms
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
                                <Button
                                    variant="contained"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "shell", "run")}
                                >
                                    Run
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "shell", "always")}
                                >
                                    Always
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "shell", "auto")}
                                >
                                    Auto
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="error"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "shell", "deny")}
                                >
                                    Deny
                                </Button>
                            </Stack>
                        </Paper>
                    )}

                    {pendingEntry?.role === "command_review" && (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                /{pendingEntry.commandName}
                            </Typography>
                            <Typography color="text.secondary" sx={{ mb: 2 }}>
                                {pendingEntry.commandPrompt}
                            </Typography>
                            <Stack spacing={1} sx={{ maxHeight: "60vh", overflow: "auto" }}>
                                {(pendingEntry.commandOptions ?? []).map((opt) => (
                                    <Button
                                        key={opt.id}
                                        variant="outlined"
                                        onClick={() => actions.resolveReview(pendingEntry.id, "command", opt.id)}
                                        sx={{ justifyContent: "space-between" }}
                                    >
                                        <span>{opt.label}</span>
                                        <span style={{ opacity: 0.7, marginLeft: 12 }}>{opt.hint}</span>
                                    </Button>
                                ))}
                                <Button
                                    variant="text"
                                    color="error"
                                    onClick={() => actions.resolveReview(pendingEntry.id, "command", null)}
                                >
                                    Cancel
                                </Button>
                            </Stack>
                        </Paper>
                    )}
                </Box>
            </Box>
        </Box>
    );
}

