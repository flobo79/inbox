import axios from 'axios';
import { BATCH_SIZE, TOTAL_EMAILS } from '../config';

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

interface BatchResponse {
  id: string;
  status: number;
  body: Email;
}

interface EmailResponse {
  emails: Email[];
  batchResponses: BatchResponse[];
}

export const gmailService = {
  async getEmails(accessToken: string): Promise<EmailResponse> {
    console.log('Starting to fetch emails...');
    const allEmails: Email[] = [];
    const allBatchResponses: BatchResponse[] = [];
    let nextPageToken: string | undefined;
    let totalFetched = 0;

    // Fetch messages synchronously using nextPageToken
    while (totalFetched < TOTAL_EMAILS) {
      console.log(`Fetching batch ${Math.floor(totalFetched / BATCH_SIZE) + 1}...`);
      const response = await axios.get(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            maxResults: BATCH_SIZE,
            pageToken: nextPageToken,
          },
        }
      );

      console.log('Message IDs response:', {
        nextPageToken: response.data.nextPageToken,
        resultSizeEstimate: response.data.resultSizeEstimate,
        messagesCount: response.data.messages?.length
      });

      const messageIds = response.data.messages.map((msg: any) => msg.id);
      nextPageToken = response.data.nextPageToken;
      totalFetched += messageIds.length;

      console.log(`Processing ${messageIds.length} message IDs:`, messageIds);

      // Create batch request for message details
      const batchRequests = messageIds.map((id: string, index: number) => ({
        method: 'GET',
        endpoint: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
        id: `request_${index}`,
      }));

      // Make batch request
      const batchResponse = await this.makeBatchRequest(accessToken, batchRequests);
      console.log(`Batch response received with ${batchResponse.responses.length} responses`);
      
      // Extract successful responses
      const emails = batchResponse.responses
        .filter(response => response.status === 200)
        .map(response => response.body);

      console.log(`Successfully parsed ${emails.length} emails from batch`);

      allEmails.push(...emails);
      allBatchResponses.push(...batchResponse.responses);

      if (!nextPageToken) {
        console.log('No more pages to fetch');
        break;
      }
    }

    console.log(`Total emails fetched: ${allEmails.length}`);
    console.log('Sample email:', allEmails[0]);

    // Sort emails by date (newest first)
    const sortedEmails = allEmails.sort((a, b) => {
      const dateA = new Date(a.internalDate || '0').getTime();
      const dateB = new Date(b.internalDate || '0').getTime();
      return dateB - dateA;
    });

    console.log('Returning sorted emails and batch responses');
    return {
      emails: sortedEmails,
      batchResponses: allBatchResponses,
    };
  },

  async makeBatchRequest(accessToken: string, requests: any[]): Promise<{ responses: BatchResponse[] }> {
    console.log(`Making batch request with ${requests.length} individual requests`);
    const boundary = 'batch_boundary';
    const batchBody = requests
      .map(request => {
        return `--${boundary}
Content-Type: application/http
Content-ID: <${request.id}>

${request.method} ${request.endpoint}
Authorization: Bearer ${accessToken}
Accept: application/json

`;
      })
      .join('') + `--${boundary}--`;

    const response = await axios.post(
      'https://www.googleapis.com/batch/gmail/v1',
      batchBody,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/mixed; boundary=${boundary}`,
        },
      }
    );

    console.log('Raw batch response received');

    // Parse the batch response
    const responses: BatchResponse[] = [];
    const parts = response.data.split('\r\n--batch_');
    
    for (const part of parts) {
      if (!part.trim() || part.includes('--')) continue;
      
      try {
        // Extract content ID
        const idMatch = part.match(/Content-ID: <(.*?)>/);
        if (!idMatch) continue;
        const id = idMatch[1];
        
        // Extract status code
        const statusMatch = part.match(/HTTP\/1\.1 (\d+)/);
        if (!statusMatch) continue;
        const status = parseInt(statusMatch[1]);
        
        // Extract JSON content between curly braces
        const jsonMatch = part.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        
        try {
          const parsedBody = JSON.parse(jsonMatch[0]);
          responses.push({
            id,
            status,
            body: parsedBody
          });
        } catch (e) {
          console.error('Error parsing JSON:', e);
        }
      } catch (error) {
        console.error('Error parsing batch part:', error);
      }
    }

    console.log(`Parsed ${responses.length} responses from batch`);
    return { responses };
  },

  getEmailMetadata(email: Email) {
    console.log('Getting metadata for email:', email.id);
    const headers = email.payload.headers;
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

    const metadata = {
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      attachments: this.getAttachments(email),
    };

    console.log('Extracted metadata:', metadata);
    return metadata;
  },

  getAttachments(email: Email) {
    if (!email.payload.parts) return [];
    const attachments = email.payload.parts
      .filter((part) => part.filename && part.filename.length > 0)
      .map((part) => part.filename);
    console.log(`Found ${attachments.length} attachments for email ${email.id}`);
    return attachments;
  },
}; 