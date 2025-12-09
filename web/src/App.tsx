import React from 'react';
import { 
  CssBaseline, 
  ThemeProvider, 
  createTheme,
  Container,
  Typography,
  Box,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Paper,
  Avatar,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useMediaQuery
} from '@mui/material';
import {
  Terminal as TerminalIcon,
  Speed as SpeedIcon,
  Security as SecurityIcon,
  Code as CodeIcon,
  CheckCircle as CheckIcon,
  Memory as MemoryIcon,
  Psychology as AiIcon,
  GitHub as GitHubIcon,
  Download as DownloadIcon,
  Keyboard as KeyboardIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  SwapHoriz as SwapIcon
} from '@mui/icons-material';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00e676',
      dark: '#00c853',
      light: '#66ffa6'
    },
    secondary: {
      main: '#1e88e5',
      dark: '#1565c0',
      light: '#42a5f5'
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a1a',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0b0b0'
    }
  },
  typography: {
    fontFamily: '"JetBrains Mono", "Monaco", "Consolas", monospace',
    h1: {
      fontWeight: 700,
      fontSize: '3.5rem',
      lineHeight: 1.2
    },
    h2: {
      fontWeight: 600,
      fontSize: '2.5rem'
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.75rem'
    },
    body1: {
      fontSize: '1.1rem',
      lineHeight: 1.6
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 600
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: '1px solid #333',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)'
        }
      }
    }
  }
});

const features = [
  {
    icon: <EditIcon />,
    title: '99.3% Edit Success Rate',
    description: 'Deterministic editing with exact-match verification. No fuzzy matching, no silent failures.',
    color: '#00e676'
  },
  {
    icon: <CodeIcon />,
    title: 'One-Shot Production Code',
    description: 'Complex React components, full API endpoints, beautiful landing pages—built in a single pass.',
    color: '#1e88e5'
  },
  {
    icon: <SecurityIcon />,
    title: 'Direct API Access',
    description: 'Bring your own API key. No middleman pricing, no usage caps, no daily limits.',
    color: '#ff9800'
  },
  {
    icon: <MemoryIcon />,
    title: '200K Context Management',
    description: 'Real-time tracking with auto-summarization. Visual indicators and intelligent compression.',
    color: '#9c27b0'
  },
  {
    icon: <SpeedIcon />,
    title: 'Terminal-Native Speed',
    description: 'No Electron overhead, no browser tabs. Launches instantly and runs lean.',
    color: '#f44336'
  },
  {
    icon: <SwapIcon />,
    title: 'Model Switching',
    description: 'Switch between Claude and GPT models on the fly. Support for all latest models.',
    color: '#4caf50'
  }
];

const models = {
  anthropic: ['Sonnet 4', 'Opus 4', 'Opus 4.1', 'Sonnet 4.5', 'Haiku 4.5', 'Opus 4.5'],
  openai: ['GPT-5.1', 'GPT-5.1 Codex', 'GPT-5.1 Codex Mini', 'GPT-5.1 Codex Max', 'GPT-5', 'GPT-5 Mini', 'GPT-5 Nano']
};

const commands = [
  { cmd: '/model opus-4.5', desc: 'Switch to Claude Opus 4.5' },
  { cmd: '/mode ask', desc: 'Switch to read-only mode' },
  { cmd: '/learn', desc: 'Learn project codebase' },
  { cmd: '/summarize', desc: 'Compress conversation history' },
  { cmd: '/new', desc: 'Start fresh conversation' }
];

function App() {
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)' }}>
        {/* Hero Section */}
        <Container maxWidth="lg">
          <Box sx={{ pt: 8, pb: 6, textAlign: 'center' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
              <Avatar 
                sx={{ 
                  width: 80, 
                  height: 80, 
                  bgcolor: 'primary.main',
                  fontSize: '2rem',
                  fontWeight: 700
                }}
              >
                N
              </Avatar>
            </Box>
            <Typography 
              variant="h1" 
              component="h1" 
              sx={{ 
                mb: 3,
                background: 'linear-gradient(45deg, #00e676, #1e88e5)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              North
            </Typography>
            <Typography 
              variant="h3" 
              component="h2" 
              sx={{ mb: 4, color: 'text.secondary', fontWeight: 400 }}
            >
              The terminal-native AI coding assistant that actually ships.
            </Typography>
            <Typography 
              variant="body1" 
              sx={{ mb: 6, maxWidth: 800, mx: 'auto', fontSize: '1.2rem', color: 'text.secondary' }}
            >
              An AI pair programmer that lives in your terminal. Supports Claude (Anthropic) and GPT-5 (OpenAI). 
              No IDE lock-in, no subscription tiers, no bloat—just you, the model of your choice, and your codebase.
            </Typography>
            
            <Stack direction={isMobile ? 'column' : 'row'} spacing={3} justifyContent="center" sx={{ mb: 6 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<DownloadIcon />}
                sx={{
                  py: 2,
                  px: 4,
                  fontSize: '1.1rem',
                  background: 'linear-gradient(45deg, #00e676, #00c853)',
                  '&:hover': {
                    background: 'linear-gradient(45deg, #00c853, #00a048)'
                  }
                }}
              >
                Download Binary
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<GitHubIcon />}
                sx={{
                  py: 2,
                  px: 4,
                  fontSize: '1.1rem',
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  '&:hover': {
                    borderColor: 'primary.dark',
                    bgcolor: 'rgba(0, 230, 118, 0.1)'
                  }
                }}
              >
                View on GitHub
              </Button>
            </Stack>

            {/* Key Stats */}
            <Stack direction={isMobile ? 'column' : 'row'} spacing={4} justifyContent="center">
              <Chip 
                label="99.3% Edit Success Rate" 
                color="primary" 
                sx={{ py: 2, px: 1, fontSize: '0.9rem', fontWeight: 600 }}
              />
              <Chip 
                label="200K Context Window" 
                color="secondary" 
                sx={{ py: 2, px: 1, fontSize: '0.9rem', fontWeight: 600 }}
              />
              <Chip 
                label="Terminal Native" 
                sx={{ 
                  py: 2, 
                  px: 1, 
                  fontSize: '0.9rem', 
                  fontWeight: 600,
                  bgcolor: '#ff9800',
                  color: 'white'
                }}
              />
            </Stack>
          </Box>
        </Container>

        {/* Features Grid */}
        <Container maxWidth="lg" sx={{ pb: 8 }}>
          <Typography variant="h2" sx={{ textAlign: 'center', mb: 6, color: 'primary.main' }}>
            Why North?
          </Typography>
          <Grid container spacing={4}>
            {features.map((feature, index) => (
              <Grid item xs={12} md={6} lg={4} key={index}>
                <Card sx={{ height: '100%', p: 2 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Avatar sx={{ bgcolor: feature.color, mr: 2, width: 48, height: 48 }}>
                        {feature.icon}
                      </Avatar>
                      <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
                        {feature.title}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                      {feature.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* Modes Section */}
        <Container maxWidth="lg" sx={{ pb: 8 }}>
          <Typography variant="h2" sx={{ textAlign: 'center', mb: 6, color: 'primary.main' }}>
            Two Modes, Zero Friction
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(30, 136, 229, 0.1)', border: '1px solid #1e88e5' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <Chip label="ASK" sx={{ bgcolor: '#1e88e5', color: 'white', fontWeight: 600, mr: 2 }} />
                  <Typography variant="h5" sx={{ color: '#1e88e5' }}>Ask Mode</Typography>
                </Box>
                <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
                  Read-only exploration. Claude can search, read files, and analyze—but can't modify anything. 
                  Perfect for understanding unfamiliar codebases.
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><SearchIcon sx={{ color: '#1e88e5' }} /></ListItemIcon>
                    <ListItemText primary="Search and analyze code" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CodeIcon sx={{ color: '#1e88e5' }} /></ListItemIcon>
                    <ListItemText primary="Read files and symbols" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><SecurityIcon sx={{ color: '#1e88e5' }} /></ListItemIcon>
                    <ListItemText primary="Zero modification risk" />
                  </ListItem>
                </List>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(0, 230, 118, 0.1)', border: '1px solid #00e676' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <Chip label="AGENT" sx={{ bgcolor: '#00e676', color: 'black', fontWeight: 600, mr: 2 }} />
                  <Typography variant="h5" sx={{ color: '#00e676' }}>Agent Mode</Typography>
                </Box>
                <Typography variant="body1" sx={{ mb: 3, color: 'text.secondary' }}>
                  Full access to edit and shell tools. Claude proposes, you approve. 
                  Every change shows a diff and requires permission.
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><EditIcon sx={{ color: '#00e676' }} /></ListItemIcon>
                    <ListItemText primary="Edit files with approval" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><TerminalIcon sx={{ color: '#00e676' }} /></ListItemIcon>
                    <ListItemText primary="Run shell commands" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckIcon sx={{ color: '#00e676' }} /></ListItemIcon>
                    <ListItemText primary="Inline diff reviews" />
                  </ListItem>
                </List>
              </Paper>
            </Grid>
          </Grid>
        </Container>

        {/* Models Section */}
        <Container maxWidth="lg" sx={{ pb: 8 }}>
          <Typography variant="h2" sx={{ textAlign: 'center', mb: 6, color: 'primary.main' }}>
            Model Support
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Card sx={{ p: 4 }}>
                <Typography variant="h5" sx={{ mb: 3, color: '#ff6b35' }}>
                  <AiIcon sx={{ mr: 2, verticalAlign: 'middle' }} />
                  Anthropic Claude
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {models.anthropic.map((model) => (
                    <Chip 
                      key={model}
                      label={model}
                      variant="outlined"
                      sx={{ 
                        borderColor: '#ff6b35',
                        color: '#ff6b35',
                        '&:hover': { bgcolor: 'rgba(255, 107, 53, 0.1)' }
                      }}
                    />
                  ))}
                </Stack>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ p: 4 }}>
                <Typography variant="h5" sx={{ mb: 3, color: '#00d4aa' }}>
                  <AiIcon sx={{ mr: 2, verticalAlign: 'middle' }} />
                  OpenAI GPT
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {models.openai.map((model) => (
                    <Chip 
                      key={model}
                      label={model}
                      variant="outlined"
                      sx={{ 
                        borderColor: '#00d4aa',
                        color: '#00d4aa',
                        '&:hover': { bgcolor: 'rgba(0, 212, 170, 0.1)' }
                      }}
                    />
                  ))}
                </Stack>
              </Card>
            </Grid>
          </Grid>
        </Container>

        {/* Commands Section */}
        <Container maxWidth="lg" sx={{ pb: 8 }}>
          <Typography variant="h2" sx={{ textAlign: 'center', mb: 6, color: 'primary.main' }}>
            Slash Commands
          </Typography>
          <Paper sx={{ p: 4, bgcolor: '#1a1a1a', fontFamily: 'monospace' }}>
            <List>
              {commands.map((command, index) => (
                <React.Fragment key={index}>
                  <ListItem sx={{ py: 2 }}>
                    <ListItemIcon>
                      <KeyboardIcon sx={{ color: 'primary.main' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body1" component="code" sx={{ color: 'primary.main', fontWeight: 600 }}>
                          {command.cmd}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                          {command.desc}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {index < commands.length - 1 && <Divider sx={{ bgcolor: '#333' }} />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Container>

        {/* Installation Section */}
        <Container maxWidth="lg" sx={{ pb: 8 }}>
          <Typography variant="h2" sx={{ textAlign: 'center', mb: 6, color: 'primary.main' }}>
            Get Started
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={4}>
              <Card sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <DownloadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 2 }}>1. Download</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Get the binary for your platform from GitHub releases
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <SecurityIcon sx={{ fontSize: 48, color: 'secondary.main', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 2 }}>2. Set API Key</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Export ANTHROPIC_API_KEY or OPENAI_API_KEY
                </Typography>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ p: 3, textAlign: 'center', height: '100%' }}>
                <TerminalIcon sx={{ fontSize: 48, color: '#ff9800', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 2 }}>3. Run North</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Launch from any repo and start coding
                </Typography>
              </Card>
            </Grid>
          </Grid>
        </Container>

        {/* Footer */}
        <Box sx={{ bgcolor: '#0a0a0a', py: 4, mt: 8 }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Built with TypeScript, Bun, React, and Ink. Open source on GitHub.
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                © 2024 North. Terminal-native AI coding that actually ships.
              </Typography>
            </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;