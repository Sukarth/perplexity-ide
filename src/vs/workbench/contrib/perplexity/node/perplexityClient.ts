/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

const initCycleTLS = require('cycletls');

export interface PerplexityResponse {
    success: boolean;
    answer: string;
    threadUrlSlug: string;
    readWriteToken: string;
    fullResponse: number;
}

export interface PerplexitySession {
    cookies: string;
    userAgent: string;
    sessionId: string;
}

/**
 * Perplexity AI headless client for VS Code integration
 * Uses CycleTLS for Cloudflare bypass and streaming SSE responses
 */
export class PerplexityClient {
    private cycleTLS: any;
    private session: PerplexitySession | null = null;
    private sessionFile: string;

    constructor(sessionFile?: string) {
        this.sessionFile = sessionFile || path.join(__dirname, 'perplexity-session.json');
    }

    /**
     * Initialize the CycleTLS client
     */
    async initialize(): Promise<void> {
        if (!this.cycleTLS) {
            this.cycleTLS = await initCycleTLS();
            console.log('✅ CycleTLS initialized with Chrome fingerprint');
        }
    }

    /**
     * Load existing session from file
     */
    async loadSession(): Promise<boolean> {
        try {
            if (fs.existsSync(this.sessionFile)) {
                const sessionData = fs.readFileSync(this.sessionFile, 'utf8');
                this.session = JSON.parse(sessionData);
                console.log('✅ Session loaded successfully');
                return true;
            }
        } catch (error) {
            console.warn('⚠️ Failed to load session:', error);
        }
        return false;
    }

    /**
     * Save session to file
     */
    private saveSession(): void {
        if (this.session) {
            try {
                fs.writeFileSync(this.sessionFile, JSON.stringify(this.session, null, 2));
                console.log('💾 Session saved successfully');
            } catch (error) {
                console.warn('⚠️ Failed to save session:', error);
            }
        }
    }

    /**
     * Create a new session by visiting Perplexity homepage
     */
    async createSession(): Promise<boolean> {
        try {
            console.log('🔄 Creating new Perplexity session...');
            
            const response = await this.cycleTLS('https://www.perplexity.ai/', {
                ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en-GB;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'DNT': '1',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Microsoft Edge";v="140"',
                    'Sec-CH-UA-Mobile': '?0',
                    'Sec-CH-UA-Platform': '"Windows"'
                }
            }, 'get');

            if (response.status === 200 && response.headers['set-cookie']) {
                const cookies = Array.isArray(response.headers['set-cookie']) 
                    ? response.headers['set-cookie'].join('; ')
                    : response.headers['set-cookie'];

                this.session = {
                    cookies,
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
                    sessionId: Date.now().toString()
                };

                this.saveSession();
                console.log('✅ New session created successfully');
                return true;
            }

            throw new Error(`Failed to create session: HTTP ${response.status}`);
        } catch (error) {
            console.error('❌ Failed to create session:', error);
            return false;
        }
    }

    /**
     * Generate request IDs for Perplexity API
     */
    private generateRequestIds() {
        const timestamp = Date.now();
        return {
            requestId: `${timestamp}-${Math.random().toString(36).substring(2, 15)}`,
            timestamp
        };
    }

    /**
     * Send a message to Perplexity AI with streaming response
     */
    async sendMessage(message: string, onToken?: (token: string) => void): Promise<PerplexityResponse> {
        if (!this.session) {
            throw new Error('No active session. Please create a session first.');
        }

        const requestIds = this.generateRequestIds();
        const payload = {
            version: '2.9',
            source: 'default',
            model: 'llama-3.1-sonar-large-128k-online',
            messages: [
                {
                    role: 'user',
                    content: message,
                    priority: 0
                }
            ],
            use_search_engine: true,
            visitor_id: requestIds.requestId,
            frontend_session_id: this.session.sessionId,
            prompt_source: 'user',
            query_source: 'chat'
        };

        try {
            // Human-like delay before request
            await new Promise(resolve => setTimeout(resolve, Math.floor(800 + Math.random() * 1500)));

            console.log('🔄 Sending streaming POST request to SSE endpoint...');
            const response = await this.cycleTLS('https://www.perplexity.ai/rest/sse/perplexity_ask', {
                body: JSON.stringify(payload),
                responseType: 'stream', // Enable streaming!
                ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0',
                userAgent: this.session.userAgent,
                disableRedirect: true,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                    'Accept-Encoding': 'identity',
                    'Accept-Language': 'en-US,en-GB;q=0.9,en;q=0.8',
                    'DNT': '1',
                    'Origin': 'https://www.perplexity.ai',
                    'Prefer': 'safe',
                    'Priority': 'u=1, i',
                    'Referer': 'https://www.perplexity.ai/',
                    'Sec-CH-UA': '"Chromium";v="140", "Not=A?Brand";v="24", "Microsoft Edge";v="140"',
                    'Sec-CH-UA-Arch': '"x86"',
                    'Sec-CH-UA-Bitness': '"64"',
                    'Sec-CH-UA-Full-Version': '"140.0.3485.81"',
                    'Sec-CH-UA-Mobile': '?0',
                    'Sec-CH-UA-Model': '""',
                    'Sec-CH-UA-Platform': '"Windows"',
                    'Sec-CH-UA-Platform-Version': '"19.0.0"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cookie': this.session.cookies,
                    'X-Request-ID': requestIds.requestId,
                    'X-Perplexity-Request-Reason': 'perplexity-query-state-provider'
                }
            }, 'post');

            console.log(`🔍 Streaming response status: ${response.status}`);
            
            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}: Request failed`);
            }

            // Process the streaming response
            return await this.processStreamingResponse(response.data, onToken);

        } catch (error) {
            console.error('❌ Error sending message:', error);
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    /**
     * Process streaming SSE response from CycleTLS
     */
    private async processStreamingResponse(stream: any, onToken?: (token: string) => void): Promise<PerplexityResponse> {
        return new Promise((resolve, reject) => {
            let buffer = '';
            let currentAnswer = '';
            let threadUrlSlug = '';
            let readWriteToken = '';
            let lastEvent = '';

            console.log('🔄 Processing streaming SSE response...');

            stream.on('data', (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                
                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';
                
                // Process complete lines
                for (const raw of lines) {
                    const line = raw.replace(/\r$/, '').trim();
                    if (!line) continue;
                    
                    if (line.startsWith('event:')) { 
                        lastEvent = line.substring(6).trim(); 
                        continue; 
                    }
                    
                    if (!line.startsWith('data:')) continue;
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '{}') continue;

                    try {
                        const data = JSON.parse(dataStr);
                        
                        // Extract metadata
                        if (data.thread_url_slug) threadUrlSlug = data.thread_url_slug;
                        if (data.read_write_token) readWriteToken = data.read_write_token;
                        
                        // Only process message events
                        if (lastEvent && lastEvent !== 'message') continue;

                        // Process blocks for answer content
                        if (Array.isArray(data.blocks)) {
                            for (const block of data.blocks) {
                                if (block && block.intended_usage === 'ask_text' && block.markdown_block) {
                                    const mb = block.markdown_block;
                                    
                                    // Process chunks (incremental updates)
                                    if (Array.isArray(mb.chunks) && mb.chunks.length > 0) {
                                        for (const ch of mb.chunks) {
                                            if (typeof ch === 'string') {
                                                if (onToken) onToken(ch);
                                                currentAnswer += ch;
                                            }
                                        }
                                    }
                                    
                                    // Fallback to answer delta if no chunks
                                    else if (mb.answer && mb.answer.length > currentAnswer.length) {
                                        const delta = mb.answer.substring(currentAnswer.length);
                                        if (onToken) onToken(delta);
                                        currentAnswer = mb.answer;
                                    }
                                }
                            }
                        }
                    } catch (parseError) {
                        // Ignore JSON parse errors for malformed SSE lines
                    }
                }
            });

            stream.on('end', () => {
                console.log('\n✅ Streaming response completed');
                resolve({
                    success: true,
                    answer: currentAnswer,
                    threadUrlSlug,
                    readWriteToken,
                    fullResponse: currentAnswer.length
                });
            });

            stream.on('error', (error: Error) => {
                console.error('❌ Stream error:', error);
                reject(new Error(`Stream error: ${error.message}`));
            });
        });
    }

    /**
     * Close the CycleTLS client
     */
    async close(): Promise<void> {
        if (this.cycleTLS) {
            await this.cycleTLS.exit();
            this.cycleTLS = null;
            console.log('✅ CycleTLS closed');
        }
    }
}
