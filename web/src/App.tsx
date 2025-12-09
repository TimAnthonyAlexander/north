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
      default: '#0d1117',
      paper: '#161b22',
    },
    text: {
      primary: '#ffffff',
      secondary: '#8b949e'
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
          border: '1px solid #30363d',
          background: 'linear-gradient(135deg, #161b22 0%, #21262d 100%)'
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
      <Box sx={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)' }}>
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

            {/* Hypermodern Stats & Features */}
            <Box sx={{ 
              mt: 6, 
              py: 8, 
              background: 'linear-gradient(135deg, rgba(30, 136, 229, 0.03) 0%, rgba(0, 230, 118, 0.03) 100%)',
              borderRadius: 3,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <Typography 
                variant="h2" 
                sx={{ 
                  textAlign: 'center', 
                  mb: 2, 
                  background: 'linear-gradient(135deg, #1e88e5 0%, #00e676 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontSize: { xs: '2rem', md: '3rem' },
                  fontWeight: 800,
                  letterSpacing: '-0.02em'
                }}
              >
                Why North?
              </Typography>
              
              <Typography 
                variant="h5" 
                sx={{ 
                  textAlign: 'center', 
                  mb: 8, 
                  color: 'text.secondary',
                  maxWidth: '600px',
                  mx: 'auto',
                  fontWeight: 300,
                  fontSize: { xs: '1.1rem', md: '1.3rem' }
                }}
              >
                The first AI coding assistant built for production reality
              </Typography>

              {/* Feature Highlights */}
              <Box sx={{ maxWidth: '1000px', mx: 'auto' }}>
                <Grid container spacing={6}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ 
                      pl: { xs: 0, md: 4 }, 
                      borderLeft: { xs: 'none', md: '4px solid #1e88e5' },
                      position: 'relative'
                    }}>
                      <Box sx={{ 
                        position: { xs: 'static', md: 'absolute' },
                        left: { xs: 0, md: -14 },
                        top: -2,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: '#1e88e5',
                        display: { xs: 'none', md: 'block' }
                      }} />
                      <Typography variant="h4" sx={{ 
                        fontWeight: 700, 
                        mb: 3,
                        color: '#1e88e5',
                        fontSize: '1.5rem'
                      }}>
                        One-Shot Production Code
                      </Typography>
                      <Typography variant="body1" sx={{ 
                        color: 'text.primary', 
                        lineHeight: 1.7,
                        mb: 3,
                        fontSize: '1.1rem'
                      }}>
                        Complex React components, full API endpoints, beautiful landing pages—built in a single pass. 
                        No scaffolding, no iterations, no "let me fix that."
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        <Chip label="React" size="small" sx={{ bgcolor: 'rgba(30, 136, 229, 0.1)', color: '#1e88e5' }} />
                        <Chip label="TypeScript" size="small" sx={{ bgcolor: 'rgba(30, 136, 229, 0.1)', color: '#1e88e5' }} />
                        <Chip label="APIs" size="small" sx={{ bgcolor: 'rgba(30, 136, 229, 0.1)', color: '#1e88e5' }} />
                      </Box>
                    </Box>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box sx={{ 
                      pl: { xs: 0, md: 4 }, 
                      borderLeft: { xs: 'none', md: '4px solid #00e676' },
                      position: 'relative'
                    }}>
                      <Box sx={{ 
                        position: { xs: 'static', md: 'absolute' },
                        left: { xs: 0, md: -14 },
                        top: -2,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: '#00e676',
                        display: { xs: 'none', md: 'block' }
                      }} />
                      <Typography variant="h4" sx={{ 
                        fontWeight: 700, 
                        mb: 3,
                        color: '#00e676',
                        fontSize: '1.5rem'
                      }}>
                        Direct API Access
                      </Typography>
                      <Typography variant="body1" sx={{ 
                        color: 'text.primary', 
                        lineHeight: 1.7,
                        mb: 3,
                        fontSize: '1.1rem'
                      }}>
                        Bring your own API key. No middleman pricing, no usage caps, no daily limits. 
                        You pay Anthropic/OpenAI directly at cost.
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        <Chip label="Claude" size="small" sx={{ bgcolor: 'rgba(0, 230, 118, 0.1)', color: '#00e676' }} />
                        <Chip label="GPT" size="small" sx={{ bgcolor: 'rgba(0, 230, 118, 0.1)', color: '#00e676' }} />
                        <Chip label="No Limits" size="small" sx={{ bgcolor: 'rgba(0, 230, 118, 0.1)', color: '#00e676' }} />
                      </Box>
                    </Box>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box sx={{ 
                      pl: { xs: 0, md: 4 }, 
                      borderLeft: { xs: 'none', md: '4px solid #9c27b0' },
                      position: 'relative'
                    }}>
                      <Box sx={{ 
                        position: { xs: 'static', md: 'absolute' },
                        left: { xs: 0, md: -14 },
                        top: -2,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: '#9c27b0',
                        display: { xs: 'none', md: 'block' }
                      }} />
                      <Typography variant="h4" sx={{ 
                        fontWeight: 700, 
                        mb: 3,
                        color: '#9c27b0',
                        fontSize: '1.5rem'
                      }}>
                        Intelligent Context
                      </Typography>
                      <Typography variant="body1" sx={{ 
                        color: 'text.primary', 
                        lineHeight: 1.7,
                        mb: 3,
                        fontSize: '1.1rem'
                      }}>
                        Visual context indicators (🟢🟡🔴) with auto-summarization at 92% usage. 
                        Never lose context, never hit limits unexpectedly.
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        <Chip label="Real-time" size="small" sx={{ bgcolor: 'rgba(156, 39, 176, 0.1)', color: '#9c27b0' }} />
                        <Chip label="Auto-compress" size="small" sx={{ bgcolor: 'rgba(156, 39, 176, 0.1)', color: '#9c27b0' }} />
                        <Chip label="Visual" size="small" sx={{ bgcolor: 'rgba(156, 39, 176, 0.1)', color: '#9c27b0' }} />
                      </Box>
                    </Box>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box sx={{ 
                      pl: { xs: 0, md: 4 }, 
                      borderLeft: { xs: 'none', md: '4px solid #f44336' },
                      position: 'relative'
                    }}>
                      <Box sx={{ 
                        position: { xs: 'static', md: 'absolute' },
                        left: { xs: 0, md: -14 },
                        top: -2,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: '#f44336',
                        display: { xs: 'none', md: 'block' }
                      }} />
                      <Typography variant="h4" sx={{ 
                        fontWeight: 700, 
                        mb: 3,
                        color: '#f44336',
                        fontSize: '1.5rem'
                      }}>
                        Model Switching
                      </Typography>
                      <Typography variant="body1" sx={{ 
                        color: 'text.primary', 
                        lineHeight: 1.7,
                        mb: 3,
                        fontSize: '1.1rem'
                      }}>
                        Switch between Claude and GPT models on the fly. Session state persists. 
                        Use the best model for each task without starting over.
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        <Chip label="Sonnet" size="small" sx={{ bgcolor: 'rgba(244, 67, 54, 0.1)', color: '#f44336' }} />
                        <Chip label="Opus" size="small" sx={{ bgcolor: 'rgba(244, 67, 54, 0.1)', color: '#f44336' }} />
                        <Chip label="GPT-4" size="small" sx={{ bgcolor: 'rgba(244, 67, 54, 0.1)', color: '#f44336' }} />
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Box>

              {/* Decorative Elements */}
              <Box sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 200,
                height: 200,
                background: 'radial-gradient(circle, rgba(30, 136, 229, 0.05) 0%, transparent 70%)',
                borderRadius: '50%',
                transform: 'translate(50%, -50%)',
                zIndex: -1
              }} />
              <Box sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: 150,
                height: 150,
                background: 'radial-gradient(circle, rgba(0, 230, 118, 0.05) 0%, transparent 70%)',
                borderRadius: '50%',
                transform: 'translate(-50%, 50%)',
                zIndex: -1
              }} />
            </Box>
          </Box>
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
            <Grid item xs={12}>
              <Card sx={{ p: 4 }}>
                <Grid container spacing={4}>
                  <Grid item xs={12} md={6}>
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
                  </Grid>
                  <Grid item xs={12} md={6}>
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
                  </Grid>
                </Grid>
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
            <Grid item xs={12}>
              <Card sx={{ p: 4 }}>
                <Grid container spacing={4} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: { xs: 3, md: 0 } }}>
                      <Avatar sx={{ bgcolor: 'primary.main', mr: 3, width: 56, height: 56 }}>
                        <DownloadIcon sx={{ fontSize: 28 }} />
                      </Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
                          1. Download Binary
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Get the latest release for macOS, Linux, or Windows
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: { xs: 3, md: 0 } }}>
                      <Avatar sx={{ bgcolor: 'secondary.main', mr: 3, width: 56, height: 56 }}>
                        <SecurityIcon sx={{ fontSize: 28 }} />
                      </Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ mb: 1, color: 'secondary.main' }}>
                          2. Set API Key
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Export ANTHROPIC_API_KEY or OPENAI_API_KEY
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar sx={{ bgcolor: '#ff9800', mr: 3, width: 56, height: 56 }}>
                        <TerminalIcon sx={{ fontSize: 28 }} />
                      </Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ mb: 1, color: '#ff9800' }}>
                          3. Run North
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Launch from any repo: <code>north</code>
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Card>
            </Grid>
          </Grid>
          
          {/* Installation Commands */}
          <Box sx={{ mt: 4 }}>
            <Paper sx={{ p: 3, bgcolor: '#0d1117', border: '1px solid #30363d' }}>
              <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
                Quick Install
              </Typography>
              <Box sx={{ fontFamily: 'monospace', bgcolor: '#21262d', p: 2, borderRadius: 1, mb: 2 }}>
                <Typography variant="body2" sx={{ color: '#8b949e', mb: 1 }}>
                  # Download for macOS (Apple Silicon)
                </Typography>
                <Typography variant="body2" sx={{ color: '#ffffff' }}>
                  curl -L -o north https://github.com/timanthonyalexander/north/releases/latest/download/north-darwin-arm64
                </Typography>
              </Box>
              <Box sx={{ fontFamily: 'monospace', bgcolor: '#21262d', p: 2, borderRadius: 1, mb: 2 }}>
                <Typography variant="body2" sx={{ color: '#8b949e', mb: 1 }}>
                  # Make executable and install
                </Typography>
                <Typography variant="body2" sx={{ color: '#ffffff' }}>
                  chmod +x north && mv north /usr/local/bin/
                </Typography>
              </Box>
              <Box sx={{ fontFamily: 'monospace', bgcolor: '#21262d', p: 2, borderRadius: 1 }}>
                <Typography variant="body2" sx={{ color: '#8b949e', mb: 1 }}>
                  # Set API key and run
                </Typography>
                <Typography variant="body2" sx={{ color: '#ffffff' }}>
                  export ANTHROPIC_API_KEY="sk-ant-..." && north
                </Typography>
              </Box>
            </Paper>
          </Box>
        </Container>

        {/* Footer */}
        <Box sx={{ bgcolor: '#0d1117', py: 4, mt: 8 }}>
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