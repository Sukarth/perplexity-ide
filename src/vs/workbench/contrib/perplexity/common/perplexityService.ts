/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

export interface IPerplexityResponse {
    success: boolean;
    answer: string;
    threadUrlSlug: string;
    readWriteToken: string;
    fullResponse: number;
}

export interface IPerplexitySession {
    cookies: string;
    userAgent: string;
    sessionId: string;
}

export interface IPerplexityMessage {
    id: string;
    content: string;
    timestamp: Date;
    isUser: boolean;
    response?: IPerplexityResponse;
}

export interface IPerplexityConversation {
    id: string;
    title: string;
    messages: IPerplexityMessage[];
    createdAt: Date;
    updatedAt: Date;
}

export const IPerplexityService = createDecorator<IPerplexityService>('perplexityService');

export interface IPerplexityService {
    readonly _serviceBrand: undefined;

    /**
     * Event fired when a new token is received during streaming
     */
    readonly onDidReceiveToken: Event<{ messageId: string; token: string }>;

    /**
     * Event fired when a message is completed
     */
    readonly onDidCompleteMessage: Event<{ messageId: string; response: IPerplexityResponse }>;

    /**
     * Event fired when authentication status changes
     */
    readonly onDidChangeAuthenticationStatus: Event<boolean>;

    /**
     * Check if the service is authenticated
     */
    readonly isAuthenticated: boolean;

    /**
     * Initialize the Perplexity service
     */
    initialize(): Promise<void>;

    /**
     * Authenticate with Perplexity AI
     */
    authenticate(): Promise<boolean>;

    /**
     * Send a message to Perplexity AI
     * @param content The message content
     * @param conversationId Optional conversation ID to continue existing conversation
     * @returns Promise resolving to the message ID
     */
    sendMessage(content: string, conversationId?: string): Promise<string>;

    /**
     * Get all conversations
     */
    getConversations(): Promise<IPerplexityConversation[]>;

    /**
     * Get a specific conversation by ID
     */
    getConversation(id: string): Promise<IPerplexityConversation | undefined>;

    /**
     * Create a new conversation
     */
    createConversation(title?: string): Promise<IPerplexityConversation>;

    /**
     * Delete a conversation
     */
    deleteConversation(id: string): Promise<void>;

    /**
     * Clear all conversations
     */
    clearConversations(): Promise<void>;

    /**
     * Dispose the service
     */
    dispose(): void;
}
