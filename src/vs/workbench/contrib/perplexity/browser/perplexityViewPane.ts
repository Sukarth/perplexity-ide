/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IPerplexityService, IPerplexityConversation, IPerplexityMessage } from '../common/perplexityService.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
// Load component styles
import './media/perplexity.css';

export class PerplexityViewPane extends ViewPane {
	private container!: HTMLElement;
	private chatContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private messageInput!: HTMLTextAreaElement;
	private sendButton!: Button;
	private authButton!: Button;
	private conversationsList!: HTMLElement;

	private currentConversation: IPerplexityConversation | undefined;
	private readonly disposables = new DisposableStore();

	constructor(
		options: IViewPaneOptions | undefined,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IPerplexityService private readonly perplexityService: IPerplexityService
	) {
		// Some code paths (mis)instantiate the view without supplying the options object. Guard against that
		// so we don't crash with "Cannot read properties of undefined (reading 'id')" inside ViewPane.
		if (!options) {
			const fallback: IViewPaneOptions = {
				id: 'perplexity.chat',
				// Provide a reasonable fallback title matching the registered view name
				title: localize('perplexity.view.title.fallback', 'Perplexity AI Chat')
			};
			options = fallback;
		}
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.disposables.add(this.perplexityService.onDidChangeAuthenticationStatus(this.onAuthenticationStatusChanged, this));
		this.disposables.add(this.perplexityService.onDidReceiveToken(this.onTokenReceived, this));
		this.disposables.add(this.perplexityService.onDidCompleteMessage(this.onMessageCompleted, this));
	}

	protected override renderBody(container: HTMLElement): void {
		this.container = container;
		this.container.classList.add('perplexity-view');

		this.createAuthSection();
		this.createConversationsSection();
		this.createChatSection();
		this.createInputSection();

		this.updateAuthenticationUI();
		this.loadConversations();
	}

	private createAuthSection(): void {
		const authSection = append(this.container, $('.auth-section'));

		this.authButton = this.disposables.add(new Button(authSection, defaultButtonStyles));
		this.authButton.label = localize('perplexity.authenticate', 'Connect to Perplexity AI');
		this.authButton.onDidClick(() => this.authenticate());
	}

	private createConversationsSection(): void {
		const conversationsSection = append(this.container, $('.conversations-section'));

		const header = append(conversationsSection, $('.conversations-header'));
		append(header, $('h3')).textContent = localize('perplexity.conversations', 'Conversations');

		const newChatButton = this.disposables.add(new Button(header, defaultButtonStyles));
		newChatButton.label = localize('perplexity.newChat', 'New Chat');
		newChatButton.onDidClick(() => this.startNewConversation());

		this.conversationsList = append(conversationsSection, $('.conversations-list'));
	}

	private createChatSection(): void {
		this.chatContainer = append(this.container, $('.chat-container'));
		this.chatContainer.style.display = 'none';
	}

	private createInputSection(): void {
		this.inputContainer = append(this.container, $('.input-section'));
		this.inputContainer.style.display = 'none';

		this.messageInput = append(this.inputContainer, $('textarea.message-input')) as HTMLTextAreaElement;
		this.messageInput.placeholder = localize('perplexity.inputPlaceholder', 'Ask Perplexity AI anything...');
		this.messageInput.rows = 3;

		this.sendButton = this.disposables.add(new Button(this.inputContainer, defaultButtonStyles));
		this.sendButton.label = localize('perplexity.send', 'Send');
		this.sendButton.onDidClick(() => this.sendMessage());

		// Handle Enter key
		this.messageInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});
	}

	private async authenticate(): Promise<void> {
		try {
			this.authButton.enabled = false;
			this.authButton.label = localize('perplexity.authenticating', 'Connecting...');

			await this.perplexityService.initialize();
			const success = await this.perplexityService.authenticate();

			if (success) {
				this.updateAuthenticationUI();
				this.loadConversations();
			}
		} catch (error) {
			console.error('Authentication failed:', error);
		} finally {
			this.authButton.enabled = true;
		}
	}

	private onAuthenticationStatusChanged(isAuthenticated: boolean): void {
		this.updateAuthenticationUI();
		if (isAuthenticated) {
			this.loadConversations();
		}
	}

	private updateAuthenticationUI(): void {
		const isAuthenticated = this.perplexityService.isAuthenticated;

		if (isAuthenticated) {
			this.authButton.label = localize('perplexity.connected', 'Connected to Perplexity AI');
			this.authButton.enabled = false;
			this.inputContainer.style.display = 'block';
		} else {
			this.authButton.label = localize('perplexity.authenticate', 'Connect to Perplexity AI');
			this.authButton.enabled = true;
			this.inputContainer.style.display = 'none';
			this.chatContainer.style.display = 'none';
		}
	}

	private async loadConversations(): Promise<void> {
		if (!this.perplexityService.isAuthenticated) {
			return;
		}

		try {
			const conversations = await this.perplexityService.getConversations();
			this.renderConversations(conversations);
		} catch (error) {
			console.error('Failed to load conversations:', error);
		}
	}

	private renderConversations(conversations: IPerplexityConversation[]): void {
		clearNode(this.conversationsList);

		for (const conversation of conversations) {
			const item = append(this.conversationsList, $('.conversation-item'));
			item.textContent = conversation.title;
			item.title = conversation.title;
			item.onclick = () => this.selectConversation(conversation);

			if (this.currentConversation?.id === conversation.id) {
				item.classList.add('selected');
			}
		}
	}

	private async startNewConversation(): Promise<void> {
		try {
			const conversation = await this.perplexityService.createConversation();
			this.selectConversation(conversation);
			this.loadConversations();
		} catch (error) {
			console.error('Failed to create new conversation:', error);
		}
	}

	private selectConversation(conversation: IPerplexityConversation): void {
		this.currentConversation = conversation;
		this.renderChat();
		this.chatContainer.style.display = 'block';

		// Update selection in conversations list
		const items = this.conversationsList.querySelectorAll('.conversation-item');
		items.forEach(item => item.classList.remove('selected'));

		const selectedItem = Array.from(items).find(item => item.textContent === conversation.title);
		selectedItem?.classList.add('selected');
	}

	private renderChat(): void {
		if (!this.currentConversation) {
			return;
		}

		clearNode(this.chatContainer);

		for (const message of this.currentConversation.messages) {
			this.renderMessage(message);
		}

		// Scroll to bottom
		this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
	}

	private renderMessage(message: IPerplexityMessage): HTMLElement {
		const messageElement = append(this.chatContainer, $('.message'));
		messageElement.classList.add(message.isUser ? 'user-message' : 'assistant-message');

		const content = append(messageElement, $('.message-content'));
		content.textContent = message.content;

		const timestamp = append(messageElement, $('.message-timestamp'));
		timestamp.textContent = message.timestamp.toLocaleTimeString();

		return messageElement;
	}

	private async sendMessage(): Promise<void> {
		const content = this.messageInput.value.trim();
		if (!content || !this.currentConversation) {
			return;
		}

		try {
			this.sendButton.enabled = false;
			this.messageInput.value = '';

			// Add user message to UI immediately
			const userMessage: IPerplexityMessage = {
				id: Date.now().toString(),
				content,
				timestamp: new Date(),
				isUser: true
			};

			this.currentConversation.messages.push(userMessage);
			this.renderMessage(userMessage);

			// Create placeholder for assistant response
			const assistantMessage: IPerplexityMessage = {
				id: Date.now().toString() + '_assistant',
				content: '',
				timestamp: new Date(),
				isUser: false
			};

			this.currentConversation.messages.push(assistantMessage);
			this.renderMessage(assistantMessage);

			// Send message
			await this.perplexityService.sendMessage(content, this.currentConversation.id);

		} catch (error) {
			console.error('Failed to send message:', error);
		} finally {
			this.sendButton.enabled = true;
		}
	}

	private onTokenReceived(event: { messageId: string; token: string }): void {
		if (!this.currentConversation) {
			return;
		}

		// Find the last assistant message and append the token
		const lastMessage = this.currentConversation.messages[this.currentConversation.messages.length - 1];
		if (lastMessage && !lastMessage.isUser) {
			lastMessage.content += event.token;

			// Update the UI
			const messageElements = this.chatContainer.querySelectorAll('.assistant-message');
			const lastElement = messageElements[messageElements.length - 1];
			if (lastElement) {
				const content = lastElement.querySelector('.message-content') as HTMLElement;
				content.textContent = lastMessage.content;
			}

			// Scroll to bottom
			this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
		}
	}

	private onMessageCompleted(event: { messageId: string; response: any }): void {
		this.loadConversations(); // Refresh conversations list
	}

	override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}
}
