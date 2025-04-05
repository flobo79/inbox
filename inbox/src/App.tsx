import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { Container, Typography, List, ListItem, ListItemText, Paper, CircularProgress, Box, Button, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { gmailService } from './services/gmailService';
import { GOOGLE_CLIENT_ID } from './config';

interface Email {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<{
      filename?: string;
      mimeType: string;
      body?: { size: number };
    }>;
  };
  internalDate?: string;
}

interface UserSession {
  accessToken: string;
  expiresAt: number;
}

interface BatchResponse {
  id: string;
  status: number;
  body: Email;
}

const EmailList: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [batchResponses, setBatchResponses] = useState<BatchResponse[]>([]);

  const fetchEmails = async (token: string) => {
    try {
      console.log('Starting to fetch emails in App component');
      setLoading(true);
      setError(null);
      const { emails: fetchedEmails, batchResponses: responses } = await gmailService.getEmails(token);
      console.log('Received emails and responses:', {
        emailCount: fetchedEmails.length,
        responseCount: responses.length
      });
      setEmails(fetchedEmails);
      setBatchResponses(responses);
    } catch (err) {
      console.error('Error fetching emails:', err);
      setError('Failed to fetch emails. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('App component mounted');
    // Check for existing session on component mount
    const storedSession = localStorage.getItem('gmailSession');
    if (storedSession) {
      console.log('Found stored session');
      const session: UserSession = JSON.parse(storedSession);
      // Check if session is still valid
      if (session.expiresAt > Date.now()) {
        console.log('Session is valid, fetching emails');
        setUserSession(session);
        fetchEmails(session.accessToken);
      } else {
        console.log('Session expired, clearing storage');
        // Clear expired session
        localStorage.removeItem('gmailSession');
      }
    } else {
      console.log('No stored session found');
    }
  }, []);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        console.log('Login successful, creating session');
        // Store the session
        const session: UserSession = {
          accessToken: tokenResponse.access_token,
          expiresAt: Date.now() + (tokenResponse.expires_in * 1000), // Convert to milliseconds
        };
        localStorage.setItem('gmailSession', JSON.stringify(session));
        setUserSession(session);
        await fetchEmails(tokenResponse.access_token);
      } catch (err) {
        console.error('Error during login:', err);
        setError('Failed to authenticate with Google.');
      }
    },
    onError: () => {
      console.error('Login error');
      setError('Failed to authenticate with Google.');
    },
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  });

  const handleLogout = () => {
    localStorage.removeItem('gmailSession');
    setUserSession(null);
    setEmails([]);
    setBatchResponses([]);
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" component="h1">
            Gmail Inbox
          </Typography>
          {userSession && (
            <Button variant="outlined" color="error" onClick={handleLogout}>
              Logout
            </Button>
          )}
        </Box>
        
        {!userSession && !loading && (
          <Box sx={{ textAlign: 'center', my: 4 }}>
            <Typography variant="body1" gutterBottom>
              Please sign in to view your emails
            </Typography>
            <Button 
              variant="contained" 
              onClick={() => login()}
              sx={{ mt: 2 }}
            >
              Sign in with Google
            </Button>
          </Box>
        )}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Typography color="error" sx={{ my: 2 }}>
            {error}
          </Typography>
        )}

        {batchResponses.length > 0 && (
          <Accordion sx={{ mb: 4 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Batch Request Details</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <List>
                {batchResponses.map((response, index) => (
                  <Paper key={response.id} sx={{ mb: 2, p: 2 }}>
                    <ListItem>
                      <ListItemText
                        primary={`Request ${index + 1}`}
                        secondary={
                          <>
                            <Typography component="span" variant="body2" color="text.primary">
                              Status: {response.status}
                            </Typography>
                            <br />
                            <Typography component="span" variant="body2">
                              ID: {response.id}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  </Paper>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        )}

        {emails.length > 0 && (
          <List>
            {emails.map((email) => {
              const metadata = gmailService.getEmailMetadata(email);
              return (
                <Paper key={email.id} sx={{ mb: 2, p: 2 }}>
                  <ListItem alignItems="flex-start">
                    <ListItemText
                      primary={
                        <Typography variant="h6" component="div">
                          {metadata.subject || '(No Subject)'}
                        </Typography>
                      }
                      secondary={
                        <>
                          <Typography component="span" variant="body2" color="text.primary">
                            From: {metadata.from}
                          </Typography>
                          <br />
                          <Typography component="span" variant="body2">
                            Date: {metadata.date}
                          </Typography>
                          <br />
                          <Typography component="span" variant="body2" sx={{ mt: 1, display: 'block' }}>
                            {email.snippet}
                          </Typography>
                          {metadata.attachments.length > 0 && (
                            <>
                              <br />
                              <Typography component="span" variant="body2" color="text.secondary">
                                Attachments: {metadata.attachments.join(', ')}
                              </Typography>
                            </>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                </Paper>
              );
            })}
          </List>
        )}
      </Box>
    </Container>
  );
};

const App: React.FC = () => {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <EmailList />
    </GoogleOAuthProvider>
  );
};

export default App;
