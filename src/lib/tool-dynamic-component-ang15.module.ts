import { NgModule } from '@angular/core';
import { DynamicSlotDirective } from './dynamic-slot.directive';

/**
 * Импортируйте этот модуль (или DynamicSlotDirective напрямую),
 * чтобы использовать директиву dynSlot в шаблонах.
 * DynamicService доступен глобально (providedIn: 'root').
 */
@NgModule({
	imports: [DynamicSlotDirective],
	exports: [DynamicSlotDirective],
})
export class ToolDynamicComponentAng15Module { }
