/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	IPerplexityService,
	IPerplexityResponse,
	IPerplexityMessage,
	IPerplexityConversation
} from '../common/perplexityService.js';

export class PerplexityService extends Disposable implements IPerplexityService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidReceiveToken = this._register(new Emitter<{ messageId: string; token: string }>());
	readonly onDidReceiveToken = this._onDidReceiveToken.event;

	private readonly _onDidCompleteMessage = this._register(new Emitter<{ messageId: string; response: IPerplexityResponse }>());
	readonly onDidCompleteMessage = this._onDidCompleteMessage.event;

	private readonly _onDidChangeAuthenticationStatus = this._register(new Emitter<boolean>());
	readonly onDidChangeAuthenticationStatus = this._onDidChangeAuthenticationStatus.event;

	private _isAuthenticated = false;
	private _conversations: Map<string, IPerplexityConversation> = new Map();
	private _client: any; // Will be dynamically imported

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.loadConversations();
	}

	get isAuthenticated(): boolean {
		return this._isAuthenticated;
	}

	async initialize(): Promise<void> {
		try {
			if (isWeb) {
				// Provide a minimal web stub – real headless access relies on Node (CycleTLS, fs, etc.)
				this._client = {
					async initialize() { /* no-op in web */ },
					async loadSession() { return false; },
					async createSession() { return false; },
					async sendMessage(_content: string, _onToken?: (t: string) => void) {
						throw new Error('Perplexity headless client is not available in web environment.');
					},
					async close() { /* no-op */ }
				};
				this._isAuthenticated = false;
				this._onDidChangeAuthenticationStatus.fire(false);
				this.logService.info('Perplexity service initialized (web stub)');
				return;
			}

			// Dynamically import the Node.js client only in desktop / non-web
			const { PerplexityClient } = await import('../node/perplexityClient.js');
			this._client = new PerplexityClient();

			await this._client.initialize();
			const hasSession = await this._client.loadSession();
			this._isAuthenticated = hasSession;
			this._onDidChangeAuthenticationStatus.fire(this._isAuthenticated);
			this.logService.info('Perplexity service initialized');
		} catch (error) {
			this.logService.error('Failed to initialize Perplexity service:', error);
			throw error;
		}
	}

	async authenticate(): Promise<boolean> {
		try {
			if (!this._client) {
				await this.initialize();
			}
			if (isWeb) {
				// In web we currently cannot perform headless auth; surface graceful failure
				this.logService.info('Perplexity authentication skipped in web environment.');
				this._isAuthenticated = false;
				this._onDidChangeAuthenticationStatus.fire(false);
				return false;
			}
			const success = await this._client.createSession();
			this._isAuthenticated = success;
			this._onDidChangeAuthenticationStatus.fire(this._isAuthenticated);
			if (success) {
				this.logService.info('Perplexity authentication successful');
			} else {
				this.logService.error('Perplexity authentication failed');
			}
			return success;
		} catch (error) {
			this.logService.error('Perplexity authentication error:', error);
			this._isAuthenticated = false;
			this._onDidChangeAuthenticationStatus.fire(false);
			return false;
		}
	}

	async sendMessage(content: string, conversationId?: string): Promise<string> {
		if (!this._isAuthenticated) {
			throw new Error('Not authenticated with Perplexity AI');
		}
		if (isWeb) {
			throw new Error('Sending messages to Perplexity is not supported in web environment.');
		}

		const messageId = this.generateId();
		let conversation: IPerplexityConversation;

		if (conversationId) {
			const existing = this._conversations.get(conversationId);
			if (!existing) {
				throw new Error(`Conversation ${conversationId} not found`);
			}
			conversation = existing;
		} else {
			conversation = await this.createConversation();
		}

		// Create user message
		const userMessage: IPerplexityMessage = {
			id: messageId,
			content,
			timestamp: new Date(),
			isUser: true
		};

		conversation.messages.push(userMessage);
		conversation.updatedAt = new Date();

		try {
			// Send message with streaming callback
			const response = await this._client.sendMessage(content, (token: string) => {
				this._onDidReceiveToken.fire({ messageId, token });
			});

			// Create assistant message
			const assistantMessage: IPerplexityMessage = {
				id: this.generateId(),
				content: response.answer,
				timestamp: new Date(),
				isUser: false,
				response
			};

			conversation.messages.push(assistantMessage);
			conversation.updatedAt = new Date();

			// Update conversation title if it's the first message
			if (conversation.messages.length === 2 && conversation.title === 'New Conversation') {
				conversation.title = content.length > 50 ? content.substring(0, 50) + '...' : content;
			}

			this.saveConversations();
			this._onDidCompleteMessage.fire({ messageId, response });

			return messageId;
		} catch (error) {
			this.logService.error('Failed to send message to Perplexity:', error);
			throw error;
		}
	}

	async getConversations(): Promise<IPerplexityConversation[]> {
		return Array.from(this._conversations.values()).sort((a, b) =>
			b.updatedAt.getTime() - a.updatedAt.getTime()
		);
	}

	async getConversation(id: string): Promise<IPerplexityConversation | undefined> {
		return this._conversations.get(id);
	}

	async createConversation(title?: string): Promise<IPerplexityConversation> {
		const conversation: IPerplexityConversation = {
			id: this.generateId(),
			title: title || 'New Conversation',
			messages: [],
			createdAt: new Date(),
			updatedAt: new Date()
		};

		this._conversations.set(conversation.id, conversation);
		this.saveConversations();
		return conversation;
	}

	async deleteConversation(id: string): Promise<void> {
		this._conversations.delete(id);
		this.saveConversations();
	}

	async clearConversations(): Promise<void> {
		this._conversations.clear();
		this.saveConversations();
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}

	private loadConversations(): void {
		try {
			const stored = this.storageService.get('perplexity.conversations', StorageScope.PROFILE);
			if (stored) {
				const conversations = JSON.parse(stored);
				this._conversations = new Map();

				for (const conv of conversations) {
					// Convert date strings back to Date objects
					conv.createdAt = new Date(conv.createdAt);
					conv.updatedAt = new Date(conv.updatedAt);
					conv.messages.forEach((msg: any) => {
						msg.timestamp = new Date(msg.timestamp);
					});

					this._conversations.set(conv.id, conv);
				}
			}
		} catch (error) {
			this.logService.error('Failed to load conversations:', error);
		}
	}

	private saveConversations(): void {
		try {
			const conversations = Array.from(this._conversations.values());
			this.storageService.store(
				'perplexity.conversations',
				JSON.stringify(conversations),
				StorageScope.PROFILE,
				StorageTarget.USER
			);
		} catch (error) {
			this.logService.error('Failed to save conversations:', error);
		}
	}

	override dispose(): void {
		super.dispose();
		if (this._client && !isWeb) {
			this._client.close().catch((error: any) => {
				this.logService.error('Error closing Perplexity client:', error);
			});
		}
	}
}
