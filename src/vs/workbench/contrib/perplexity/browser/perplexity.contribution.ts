/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry, Extensions as ViewExtensions } from '../../../common/views.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IPerplexityService } from '../common/perplexityService.js';
import { PerplexityService } from './perplexityServiceImpl.js';
import { PerplexityViewPane } from './perplexityViewPane.js';

// Register the Perplexity service (delayed instantiation)
registerSingleton(IPerplexityService, PerplexityService, InstantiationType.Delayed);

// Register the view container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'perplexity',
	title: { value: localize('perplexity.viewContainer.title', 'Perplexity AI'), original: 'Perplexity AI' },
	// Provide required static arguments: id and options for ViewPaneContainer
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['perplexity', { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'perplexityViewContainer',
	hideIfEmpty: true,
	order: 5
}, ViewContainerLocation.Sidebar);

// Register the view
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: 'perplexity.chat',
	name: { value: localize('perplexity.view.title', 'Perplexity AI Chat'), original: 'Perplexity AI Chat' },
	ctorDescriptor: new SyncDescriptor(PerplexityViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	weight: 100,
	order: 1
}], VIEW_CONTAINER);

// Export for other modules
export { IPerplexityService, PerplexityService };
