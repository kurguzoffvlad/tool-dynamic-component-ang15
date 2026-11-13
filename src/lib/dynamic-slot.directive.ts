import { Directive, ViewContainerRef } from '@angular/core';

/**
 * Помечает место в шаблоне, куда сервис будет добавлять компоненты.
 * Использование: <ng-container dynSlot></ng-container>
 */
@Directive({ selector: '[dynSlot]', standalone: true })
export class DynamicSlotDirective {
	// ViewContainerRef — единственное, что реально нужно для createComponent.
	constructor(public readonly vcr: ViewContainerRef) {}
}
